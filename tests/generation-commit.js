"use strict";
const assert = require("node:assert/strict");

module.exports = async function ({ make, setModel, test }) {
  const T = globalThis.PRP.tree;
  const snapshot = (h) => JSON.stringify({ messages: h.S.messages, chat: h.ctx.chat() });
  const stored = (h) => JSON.stringify({ messages: [...h.store.messages], chats: [...h.store.chats] });
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
