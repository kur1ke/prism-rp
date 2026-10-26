/* AUTO-MEMORY concurrency regression tests. Runs without Perchance or IndexedDB.
   Provider/DB are controlled fixtures; browser integration remains a separate gate. */
"use strict";
const assert = require("node:assert/strict");
let seq = 0, modelReply;
const PRP = (globalThis.PRP = {
  tree: { activeSwipe: (m) => m.swipes[m.swipeIdx || 0] },
  util: {
    uid: (prefix) => prefix + "_" + (++seq),
    estimateTokens: (s) => Math.ceil(String(s || "").length / 4),
    macros: (s, names) => String(s || "").replace(/{{char}}/g, names.char).replace(/{{user}}/g, names.user)
  },
  cardContext: { core: () => ({
    source: "fallback", identity: "Надёжный собеседник", personality: "Любит беседовать",
    traits: [], voice: [], durableContext: []
  }) },
  openai: { splitThink: (text) => ({ text }) },
  llm: { chat: (...args) => modelReply(...args) }
});
require("../js/prism/memory-cycle.js");
require("../js/prism/memory-service.js");

const QUOTE1 = "Сегодня мы встретились в парке.";
const QUOTE2 = "Мы вместе обсуждали план на завтра.";
const changed = JSON.stringify({
  change: "changed", perspective: "Персонаж рад встрече, но всё ещё осторожен в своих ожиданиях."
});
const unchanged = JSON.stringify({ change: "unchanged", perspective: "" });
const extraction = (messageId, quote) => JSON.stringify({
  memories: [{ messageId, quote, event: "Собеседники обменялись словами во время разговора", kind: "reported" }]
});
function message(id, text, parentId) {
  return { id, chatId: "ch", role: "assistant", parentId: parentId || null,
    swipeIdx: 0, swipes: [{ text, sceneOps: [] }] };
}
function harness() {
  const card = { id: "owner", name: "Аля", description: "Открытая, но внимательная." };
  const chat = { id: "ch", cardId: "owner", mode: "rp" };
  const S = { chatId: "ch", memories: [], reflections: [], drawerOpen: false, tab: "scene" };
  const path = [];
  const storage = { memories: new Map(), reflections: new Map() };
  const DB = {
    byIndex: async (type, index, id) => [...storage[type].values()].filter((r) => r.chatId === id),
    putAll: async (records) => records.forEach(([type, row]) => storage[type].set(row.id, row)),
    put: async (type, row) => { storage[type].set(row.id, row); return row; },
    del: async (type, id) => { storage[type].delete(id); },
    delMany: async (type, ids) => ids.forEach((id) => storage[type].delete(id))
  };
  const ctx = {
    S, DB, svc: { chat: { path: () => path }, prism: { refresh() {} } },
    chat: () => S.chatId === chat.id ? chat : null,
    card: () => card, persona: () => ({ name: "Пользователь" }),
    contextTokens: () => 12000, provider: () => ({ id: "mock" })
  };
  const memory = PRP.memoryService.create(ctx);
  return { S, DB, path, storage, memory, model: { id: "mock" } };
}
function automaticReply(_, messages) {
  const data = JSON.parse(messages[1].content);
  if (!data.sources) return Promise.resolve({ text: unchanged });
  const last = data.sources[data.sources.length - 1];
  return Promise.resolve({ text: extraction(last.messageId, last.text) });
}
async function microtasksUntil(test) {
  for (let i = 0; i < 25 && !test(); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(test(), "expected asynchronous gate to be reached");
}
async function fifo() {
  const h = harness(), first = message("a", QUOTE1), second = message("b", QUOTE2, "a");
  h.path.push(first);
  let release, count = 0;
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    count++;
    if (data.sources && data.sources.at(-1).messageId === "a")
      return new Promise((resolve) => { release = () => resolve({ text: extraction("a", QUOTE1) }); });
    if (data.sources) return { text: extraction("b", QUOTE2) };
    return { text: unchanged };
  };
  const p1 = h.memory.observe(first, h.model);
  assert.equal(typeof release, "function", "first extraction must begin immediately");
  h.path.push(second);
  const p2 = h.memory.observe(second, h.model);
  assert.equal(count, 1, "same-chat requests must not overlap");
  release();
  assert.equal((await p1).status, "remembered-unchanged");
  assert.equal((await p2).status, "remembered-unchanged");
  assert.equal(count, 4, "each committed reply must receive extraction and reflection");
  assert.equal(h.storage.memories.size, 2, "both automatic memories must persist");
  assert.equal(h.memory.visibleMemories().length, 2);
  console.log("PASS: FIFO preserves overlapping same-chat replies");
}
async function deletionDuringMemoryWrite() {
  const h = harness(), first = message("a", QUOTE1);
  h.path.push(first);
  let commit;
  h.DB.putAll = (entries) => new Promise((resolve) => {
    commit = () => { entries.forEach(([type, row]) => h.storage[type].set(row.id, row)); resolve(); };
  });
  modelReply = automaticReply;
  const task = h.memory.observe(first, h.model);
  await microtasksUntil(() => typeof commit === "function");
  h.memory.retireChat("ch");
  commit(); // Simulate an IndexedDB write completing after delete began.
  assert.equal((await task).status, "stale");
  assert.equal(h.storage.memories.size, 0, "late Memory write must be compensated");
  assert.equal(h.storage.reflections.size, 0);
  assert.equal((await h.memory.observe(first, h.model)).status, "stale");
  console.log("PASS: retired chat rejects and compensates a late Memory write");
}
async function deletionDuringReflectionWrite() {
  const h = harness(), first = message("a", QUOTE1);
  h.path.push(first);
  let commit;
  h.DB.put = (type, row) => new Promise((resolve) => {
    commit = () => { h.storage[type].set(row.id, row); resolve(row); };
  });
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    return { text: data.sources ? extraction("a", QUOTE1) : changed };
  };
  const task = h.memory.observe(first, h.model);
  await microtasksUntil(() => typeof commit === "function");
  h.memory.retireChat("ch");
  commit();
  assert.equal((await task).status, "stale");
  assert.equal(h.storage.reflections.size, 0, "late Experience write must be compensated");
  console.log("PASS: retired chat compensates a late Reflection write");
}
async function sameIdRestoreKeepsOldWorkInvalid() {
  const h = harness(), first = message("a", QUOTE1);
  h.path.push(first);
  h.S.chats = [{ id: "ch", cardId: "owner", mode: "rp" }];
  let release, extracts = 0;
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (!data.sources) return { text: unchanged };
    extracts++;
    if (extracts === 1) return new Promise((resolve) => {
      release = () => resolve({ text: extraction("a", QUOTE1) });
    });
    return { text: extraction("a", QUOTE1) };
  };
  const oldTask = h.memory.observe(first, h.model);
  assert.equal(typeof release, "function");
  h.memory.retireChat("ch");
  // An import recreated the chat with the same ID and triggered the normal load.
  await h.memory.load("ch");
  const newTask = h.memory.observe(first, h.model);
  assert.equal((await newTask).status, "remembered-unchanged");
  release();
  assert.equal((await oldTask).status, "stale");
  assert.equal(h.storage.memories.size, 1, "retired model call must not write into restored chat");
  console.log("PASS: same-ID restore revives the chat but not its obsolete requests");
}
async function run() {
  await fifo();
  await deletionDuringMemoryWrite();
  await deletionDuringReflectionWrite();
  await sameIdRestoreKeepsOldWorkInvalid();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
