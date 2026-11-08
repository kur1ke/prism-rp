"use strict";
const assert = require("node:assert/strict");

module.exports = async function ({ make, setModel, test }) {
  const T = globalThis.PRP.tree;
  const snapshot = (h) => JSON.stringify({ messages: h.S.messages, chat: h.ctx.chat() });
  const stored = (h) => JSON.stringify({ messages: [...h.store.messages], chats: [...h.store.chats] });
  for (const chatMode of ["rp", "messenger"]) for (const outcome of ["empty", "spaces", "thinking", "error", "cancelled"]) {
    await test(`A10 ${chatMode}/${outcome}: empty regeneration retains selected reply and permits retry`, async () => {
      const h = make({name:"Мира",description:"Библиотекарь."});
      await h.chat.createChat(chatMode,"c1");
      const u = await h.chat.addUserMessage("Привет");
      const draft = h.chat.newMsg("assistant",u.id,"OLD_REPLY");
      draft.swipes[0].reasoning = "KEEP_REASONING";
      draft.swipes.push({text:"OTHER_REPLY",createdAt:1});
      const m = await h.chat.commitMessage(draft,draft.id);
      const before = snapshot(h), saved = stored(h);
      setModel(async()=>{
        if (outcome === "error") throw new Error("FIXTURE_PROVIDER_ERROR");
        if (outcome === "cancelled") h.gen.stop();
        return {text:outcome === "thinking" ? "<think>reasoning only</think>" : outcome === "spaces" ? "  \n " : "",reasoning:""};
      });
      const result = await h.gen.generate(m.id,"regen");
      assert.equal(snapshot(h),before,"no empty swipe or selection change");
      assert.equal(stored(h),saved,"no message/preview write");
      assert.equal(h.S.gen,null);assert.equal(result.ok,false);assert.equal(result.post,undefined);
      assert.ok(h.toasts.some(x=>x.t.includes("Исходный ответ сохранён")));
      setModel(async()=>({text:"NEW_REPLY",reasoning:""}));
      const retried = await h.gen.generate(m.id,"regen");await retried.post;
      assert.equal(m.swipes.length,3);assert.equal(m.swipeIdx,2);
      assert.equal(m.swipes[0].text,"OLD_REPLY");assert.equal(m.swipes[1].text,"OTHER_REPLY");
      assert.equal(T.activeSwipe(m).text,"NEW_REPLY");
    });
  }
  for (const content of ["draw", "state"]) {
    await test(`A10 valid ${content}-only regeneration is not classified as empty`, async () => {
      const h = make({name:"Мира",description:"Библиотекарь."});
      await h.chat.createChat("rp","c1");
      const u = await h.chat.addUserMessage("Привет");
      const draft = h.chat.newMsg("assistant",u.id,"OLD_REPLY");
      const m = await h.chat.commitMessage(draft,draft.id);
      Object.assign(h.S.settings.images,{enabled:true,backend:"a1111",autoDraw:false,modelDrawPolicy:"contextual"});
      h.S.settings.stateToolEnabled = true;
      setModel(async()=>({text:content === "draw" ? "[draw: 1girl, portrait, 1:1]" : '[state: time.set("18:00")]',reasoning:""}));
      const result = await h.gen.generate(m.id,"regen");await result.post;
      assert.equal(m.swipes.length,2);assert.equal(m.swipeIdx,1);
      assert.equal(m.swipes[0].text,"OLD_REPLY");
      assert.equal(content === "draw" ? T.activeSwipe(m).draws.length : T.activeSwipe(m).stateCalls.length,1);
    });
  }
  for (const outputFormat of [null, "message-body"]) {
    await test(`continue transport ${outputFormat || "rp"}: prefix once, explicit continuation and immutable history`, () => {
      const messages = [{role:"system",content:"FRAME"},{role:"user",content:"USER_TEXT"},
        {role:"assistant",content:"OLD_REPLY"},{role:"system",content:"TRAILING_RULE"}];
      const before = JSON.stringify(messages), options = {continueFrom:"OLD_REPLY",outputFormat};
      const PC = globalThis.PRP.perchance, names = {char:"N",user:"U"};
      assert.deepEqual(PC.prepareChat(names,messages,{outputFormat}),PC.toPrompt(messages,names,null,outputFormat));
      const other = messages.map(m=>m.role==="assistant" ? {...m,content:"DIFFERENT_REPLY"} : m);
      assert.ok(PC.prepareChat(names,other,options).instruction.includes("DIFFERENT_REPLY"));
      assert.ok(PC.prepareChat(names,messages,{...options,closing:"EXPLICIT_CLOSING"}).instruction.endsWith("EXPLICIT_CLOSING"));
      const p = globalThis.PRP.perchance.prepareChat({char:"N",user:"U"},messages,options);
      assert.equal((p.instruction+p.startWith).split("OLD_REPLY").length-1,1);
      assert.ok(p.instruction.includes("FRAME") && p.instruction.includes("USER_TEXT") && p.instruction.includes("TRAILING_RULE"));
      assert.ok(p.instruction.split("\n").at(-1).startsWith("Продолжи уже начатое сообщение N"));
      assert.equal(p.startWith,outputFormat ? "OLD_REPLY" : "N: OLD_REPLY");
      assert.equal(JSON.stringify(messages),before);
      assert.equal(globalThis.PRP.perchance.inputCost({char:"N",user:"U"},messages,options),
        globalThis.PRP.util.estimateTokens(p.instruction)+globalThis.PRP.util.estimateTokens(p.startWith));
    });
  }
  for (const chatMode of ["rp", "messenger"]) {
    await test(`continue ${chatMode}: empty output is visible, preserves storage and permits retry`, async () => {
      const h = make({name:"Мира",description:"Библиотекарь."});
      await h.chat.createChat(chatMode,"c1");
      const u = await h.chat.addUserMessage("Привет");
      const draft = h.chat.newMsg("assistant",u.id,"OLD_REPLY");
      const m = await h.chat.commitMessage(draft,draft.id);
      const before = snapshot(h), saved = stored(h);
      setModel(async()=>({text:"   ",reasoning:""}));
      const result = await h.gen.generate(m.id,"continue");
      assert.equal(result.reason,"empty-continuation");
      assert.equal(snapshot(h),before);assert.equal(stored(h),saved);assert.equal(h.S.gen,null);
      assert.ok(h.toasts.some(x=>x.t.includes("Модель не вернула текст продолжения")));
      setModel(async()=>({text:"NEW_REPLY",reasoning:""}));
      const retried = await h.gen.generate(m.id,"continue");await retried.post;
      assert.equal(T.activeSwipe(m).text,"OLD_REPLY NEW_REPLY");
    });
  }
  for (const chatMode of ["rp", "messenger"]) for (const operation of ["regen", "continue"]) {
    await test(`F19 ${chatMode}/${operation}: stage privately, publish message and preview after commit; abort permits retry`, async () => {
      const h = make({ name: "Аля", description: "Внимательная." });
      await h.chat.createChat(chatMode, "c1");
      const user = await h.chat.addUserMessage("Вопрос");
      const draft = h.chat.newMsg("assistant", user.id, "OLD_REPLY");
      const target = await h.chat.commitMessage(draft, draft.id);
      target.swipes[0].stateEvents = [{ actor: "char", field: "location", value: "OLD_PLACE" }];
      await h.chat.putMsg(target);
      const before = snapshot(h), dbBefore = stored(h);
      let calls = 0, commits = 0, release;
      setModel(async (_p, _messages, opts) => {
        calls++;
        assert.equal(snapshot(h), before, "starting generation cannot select or save an empty variant");
        assert.equal(stored(h), dbBefore);
        opts.onDelta({ text: "NEW_REPLY" });
        assert.equal(snapshot(h), before, "streaming is transient, not canon");
        return { text: "NEW_REPLY", reasoning: "NEW_REASON" };
      });
      const putAll = h.ctx.DB.putAll;
      h.ctx.DB.putAll = async (entries) => {
        commits++;
        assert.deepEqual(entries.map(([store]) => store), ["messages", "chats"]);
        assert.equal(snapshot(h), before, "publication must wait for transaction completion");
        await new Promise((r) => { release = r; });
        throw new Error("final commit abort");
      };
      const pending = h.gen.generate(target.id, operation);
      // Attach rejection handling before letting the asynchronous model finish.
      const rejected = assert.rejects(pending, /final commit abort/);
      for (let n = 0; n < 20 && !release; n++) await Promise.resolve();
      assert.equal(typeof release, "function");
      assert.ok(h.S.gen, "lock remains held during final write");
      assert.equal(await h.gen.generate(target.id, operation), undefined);
      assert.equal(calls, 1);
      release(); await rejected;
      assert.equal(snapshot(h), before);
      assert.equal(stored(h), dbBefore);
      assert.equal(h.S.gen, null);
      assert.equal(commits, 1, "no separate preparation write");
      h.ctx.DB.putAll = putAll;
      const result = await h.gen.generate(target.id, operation); await result.post;
      const expected = operation === "continue" ? "OLD_REPLY NEW_REPLY" : "NEW_REPLY";
      assert.equal(T.activeSwipe(target).text, expected);
      assert.equal(target.swipeIdx, operation === "regen" ? 1 : 0);
      assert.equal(target.parentSwipeIdx, 0);
      if (operation === "regen") assert.equal(target.swipes[0].text, "OLD_REPLY");
      assert.equal(h.ctx.chat().preview, expected);
      assert.deepEqual(await h.ctx.DB.get("messages", target.id), target);
      assert.deepEqual(await h.ctx.DB.get("chats", h.ctx.chat().id), h.ctx.chat());
      assert.equal(h.S.gen, null);
    });
  }
  for (const chatMode of ["rp", "messenger"]) {
    await test(`F19 ${chatMode}/new: failed final commit retains only the previously committed placeholder`, async () => {
      const h = make({ name: "Аля", description: "Внимательная." });
      await h.chat.createChat(chatMode, "c1"); await h.chat.addUserMessage("Вопрос");
      let prepared, dbPrepared, analysed = 0;
      setModel(async () => {
        prepared = snapshot(h); dbPrepared = stored(h);
        h.ctx.svc.state = { track: async () => { analysed++; } };
        h.ctx.DB.putAll = async () => { throw new Error("new final abort"); };
        return { text: "UNSAVED_NEW_REPLY" };
      });
      await assert.rejects(h.gen.generate(null, "new"), /new final abort/);
      assert.equal(snapshot(h), prepared); assert.equal(stored(h), dbPrepared);
      assert.equal(T.activeSwipe(h.chat.path().at(-1)).text, "");
      assert.equal(analysed, 0); assert.equal(h.S.gen, null);
    });
  }
};
