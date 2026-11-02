"use strict";
const assert = require("node:assert/strict");

module.exports = async function ({ make, setModel, test }) {
  const P = globalThis.PRP, T = P.tree;
  const create = async (mode = "rp", options) => {
    const h = make({ name: "Аля", description: "Любопытная." }, options);
    await h.chat.createChat(mode, "c1");
    return h;
  };
  const assistant = async (h, text) => {
    const msg = h.chat.newMsg("assistant", h.ctx.chat().leafId, text);
    return h.chat.commitMessage(msg, msg.id);
  };
  const snapshot = (h) => JSON.stringify({ messages: [...h.store.messages], chats: [...h.store.chats] });

  for (const mode of ["rp", "messenger"]) {
    await test(`USER-EDIT ${mode}: edited message owns a new reply; original continuation remains available`, async () => {
      const h = await create(mode);
      const original = await h.chat.addUserMessage("ORIGINAL_USER");
      await assistant(h, "ORIGINAL_REPLY");
      await h.chat.addUserMessage("ORIGINAL_CONTINUATION");
      const oldLeaf = await assistant(h, "ORIGINAL_END");
      const oldMessages = JSON.stringify([...h.store.messages]);
      let calls = 0;
      setModel(async (_p, messages) => {
        calls++;
        const text = messages.map((m) => m.content).join("\n");
        assert.ok(text.includes("EDITED_USER"));
        for (const old of ["ORIGINAL_USER", "ORIGINAL_REPLY", "ORIGINAL_CONTINUATION", "ORIGINAL_END"]) assert.ok(!text.includes(old));
        return { text: "EDITED_REPLY" };
      });
      const result = await h.gen.edit(original.id, "EDITED_USER");
      await result.reply.post;
      assert.equal(result.outcome, "sent"); assert.equal(calls, 1);
      const newPath = h.chat.path(), newLeaf = newPath.at(-1);
      assert.equal(newPath.length, 2);
      assert.equal(newPath[0].editedFrom, original.id);
      assert.notEqual(newPath[0].id, original.id);
      assert.equal(T.activeSwipe(newLeaf).text, "EDITED_REPLY");
      assert.equal(JSON.stringify([...h.store.messages].slice(0, 4)), oldMessages);
      assert.equal(h.store.messages.size, 6);
      assert.equal(await h.chat.selectBranch(oldLeaf.id), true);
      assert.deepEqual(h.chat.path().map((m) => T.activeSwipe(m).text), ["ORIGINAL_USER", "ORIGINAL_REPLY", "ORIGINAL_CONTINUATION", "ORIGINAL_END"]);
      assert.equal(await h.chat.selectBranch(newLeaf.id), true);
      assert.equal(h.chat.path().length, 2); assert.equal(calls, 1, "navigation never calls a model");
    });
  }
  await test("USER-EDIT: character replies, empty text, unchanged text and off-path messages cannot be edited", async () => {
    const h = await create(), user = await h.chat.addUserMessage("Привет"), reply = await assistant(h, "Здравствуйте");
    const off = h.chat.newMsg("user", null, "Соседняя ветка"); await h.chat.putMsg(off);
    const before = snapshot(h); let calls = 0; setModel(async () => { calls++; return { text: "unused" }; });
    for (const [id, text] of [[reply.id, "Подменённый ответ"], [user.id, ""], [user.id, "Привет"], [off.id, "Правка"]]) {
      assert.equal(await h.chat.saveEdit(id, text), false);
      assert.equal((await h.gen.edit(id, text)).outcome, "invalid");
    }
    assert.equal(snapshot(h), before); assert.equal(calls, 0);
  });
  await test("USER-EDIT: overflow and missing provider leave the original path and tree intact", async () => {
    const h = await create("rp", { contextTokens: 1600 });
    const user = await h.chat.addUserMessage("Привет"); await assistant(h, "Привет");
    const before = snapshot(h); let calls = 0; setModel(async () => { calls++; return { text: "unused" }; });
    assert.equal((await h.gen.edit(user.id, "Очень длинный текст ".repeat(10000))).outcome, "overflow");
    assert.equal(snapshot(h), before); assert.equal(calls, 0); assert.equal(h.S.turn, null);
    h.ctx.provider = () => null;
    assert.equal((await h.gen.edit(user.id, "Изменённый текст")).outcome, "no-provider");
    assert.equal(snapshot(h), before); assert.equal(calls, 0);
  });
  await test("USER-EDIT: failed fork transaction leaves no orphan user node or changed leaf", async () => {
    const h = await create(), user = await h.chat.addUserMessage("Привет"); await assistant(h, "Привет");
    const before = snapshot(h); let calls = 0; setModel(async () => { calls++; return { text: "unused" }; });
    h.ctx.DB.putAll = async () => { throw new Error("edit transaction abort"); };
    await assert.rejects(h.gen.edit(user.id, "Другой вопрос"), /transaction abort/);
    assert.equal(snapshot(h), before); assert.equal(calls, 0); assert.equal(h.S.turn, null);
  });
  await test("USER-EDIT: repeated save while committing produces one branch and one reply", async () => {
    const h = await create(), user = await h.chat.addUserMessage("Привет"); await assistant(h, "Привет");
    const put = h.ctx.DB.putAll; let release, calls = 0;
    h.ctx.DB.putAll = async (entries) => {
      if (entries.some(([s, m]) => s === "messages" && m.editedFrom)) await new Promise((r) => { release = r; });
      return put(entries);
    };
    setModel(async () => { calls++; return { text: "Новый ответ" }; });
    const pending = h.gen.edit(user.id, "Новый вопрос");
    assert.equal((await h.gen.edit(user.id, "Повторное нажатие")).outcome, "busy");
    release(); const result = await pending; await result.reply.post;
    assert.equal(calls, 1); assert.equal(h.store.messages.size, 4); assert.equal(h.S.turn, null);
  });
  await test("USER-EDIT: cancelling a save waiting for analysis leaves history intact", async () => {
    const h = await create(), user = await h.chat.addUserMessage("Первый вопрос"); await assistant(h, "Ответ");
    const before = snapshot(h); let release, calls = 0;
    h.ctx.svc.state = { pending: () => true, settle: () => new Promise((r) => { release = r; }) };
    setModel(async () => { calls++; return { text: "unused" }; });
    const pending = h.gen.edit(user.id, "Другой вопрос");
    assert.equal(h.S.turn.phase, "waiting-state");
    assert.equal(h.gen.cancelTurn(), true);
    assert.equal((await pending).outcome, "cancelled");
    release({ waitedMs: 0, timedOut: false });
    assert.equal(snapshot(h), before); assert.equal(calls, 0); assert.equal(h.S.turn, null);
  });
  await test("TREE: returning to a continuation restores its parent variant", async () => {
    const h = await create();
    const root = await assistant(h, "Начало A");
    root.swipes.push({ text: "Начало B", sceneOps: [], createdAt: Date.now() }); await h.chat.putMsg(root);
    await h.chat.addUserMessage("USER_A"); const leafA = await assistant(h, "END_A");
    assert.equal(await h.chat.selectBranch(root.id, 1), true);
    await h.chat.addUserMessage("USER_B"); const leafB = await assistant(h, "END_B");
    assert.equal(await h.chat.selectBranch(leafA.id), true);
    assert.deepEqual(h.chat.path().map((m) => T.activeSwipe(m).text), ["Начало A", "USER_A", "END_A"]);
    assert.equal(await h.chat.selectBranch(leafB.id), true);
    assert.deepEqual(h.chat.path().map((m) => T.activeSwipe(m).text), ["Начало B", "USER_B", "END_B"]);
    const saved = JSON.parse(JSON.stringify([...h.store.messages.values()]));
    assert.equal(T.selection(saved, leafA.id)[0].swipeIdx, 0, "variant edge survives persistence");
  });
  await test("TREE: failed or invalid selection does not change the active path", async () => {
    const h = await create(), user = await h.chat.addUserMessage("Привет"); await assistant(h, "Ответ");
    const before = snapshot(h), leaf = h.ctx.chat().leafId;
    assert.equal(await h.chat.selectBranch("missing"), false);
    assert.equal(await h.chat.selectBranch(user.id, 9), false);
    h.ctx.DB.mutateBatch = async () => { throw new Error("selection abort"); };
    await assert.rejects(h.chat.selectBranch(user.id), /selection abort/);
    assert.equal(h.ctx.chat().leafId, leaf); assert.equal(snapshot(h), before); assert.equal(h.S.turn, null);
  });
  await test("TREE: existing history is bound to its visible variants before leaving or editing", async () => {
    const h = await create(), root = await assistant(h, "Старое начало A");
    root.swipes.push({ text: "Старое начало B", sceneOps: [], createdAt: Date.now() }); await h.chat.putMsg(root);
    const user = await h.chat.addUserMessage("Старый вопрос"), end = await assistant(h, "Старое продолжение");
    for (const m of h.S.messages) { delete m.parentSwipeIdx; await h.chat.putMsg(m); }
    const edited = await h.chat.saveEdit(user.id, "Изменённый вопрос");
    assert.ok(edited);
    assert.equal(h.store.messages.get(user.id).parentSwipeIdx, 0);
    assert.equal(h.store.messages.get(end.id).parentSwipeIdx, 0);
    await h.chat.selectBranch(root.id, 1);
    await h.chat.selectBranch(end.id);
    assert.deepEqual(h.chat.path().map((m) => T.activeSwipe(m).text), ["Старое начало A", "Старый вопрос", "Старое продолжение"]);
    assert.equal(T.activeSwipe(user).text, "Старый вопрос");
  });
  await test("MAP: sibling branches have distinct positions, selected path and stable source records", async () => {
    const h = await create(), root = await assistant(h, "Начало");
    const user = await h.chat.addUserMessage("Первый вопрос"); await assistant(h, "Ответ");
    await h.chat.selectBranch(root.id);
    const sibling = await h.chat.addUserMessage("Другой вопрос");
    const before = snapshot(h), graph = T.layout(h.S.messages, sibling.id);
    assert.equal(graph.nodes.length, 4); assert.equal(graph.links.length, 4);
    const left = graph.nodes.find(n => n.id === user.id), right = graph.nodes.find(n => n.id === sibling.id);
    assert.notEqual(left.x, right.x); assert.equal(left.y, right.y);
    assert.equal(left.active, false); assert.equal(right.current, true);
    assert.equal(snapshot(h), before);
  });
  await test("TREE: binding old history and switching variants preserve newer image data in storage", async () => {
    const h = await create(), root = await assistant(h, "Начало");
    root.swipes.push({ text: "Другой вариант", sceneOps: [], createdAt: Date.now() }); await h.chat.putMsg(root);
    const user = await h.chat.addUserMessage("Вопрос"), reply = await assistant(h, "Ответ");
    for (const m of h.S.messages) { delete m.parentSwipeIdx; await h.chat.putMsg(m); }
    h.store.messages.get(reply.id).swipes[0].images = [{ id: "newer-result", status: "done" }];
    await h.chat.saveEdit(user.id, "Другой вопрос");
    assert.equal(h.store.messages.get(reply.id).swipes[0].images[0].id, "newer-result");
    h.store.messages.get(root.id).swipes[0].images = [{ id: "root-result", status: "done" }];
    await h.chat.selectBranch(root.id, 1);
    assert.equal(h.store.messages.get(root.id).swipes[0].images[0].id, "root-result");
  });
  await test("TREE: imported text and malformed variant metadata cannot inject HTML", async () => {
    require("../js/ui/views/branch-tree.js");
    const rows = [
      { id: "r", role: "assistant", swipes: [{ text: "root" }, { text: "other" }] },
      { id: "u", role: "user", parentId: "r", parentSwipeIdx: '<img src=x onerror="META">', swipes: [{ text: '<img src=x onerror="TEXT">' }] }
    ];
    const html = P.views.dialogueMap({ dialogueMap: T.layout(rows, "u"), card: { name: "Аля" }, persona: { name: "Я" } });
    assert.ok(html.includes("&lt;img")); assert.ok(!html.includes("<img")); assert.ok(!html.includes("META"));
    assert.equal(T.selection(rows, "u"), null, "invalid parent variant is not guessed");
  });
};
