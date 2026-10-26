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
require("../js/core/backup.js");

const QUOTE1 = "Сегодня мы встретились в парке.";
const QUOTE2 = "Мы вместе обсуждали план на завтра.";
const changed = JSON.stringify({
  change: "changed", perspective: "Персонаж рад встрече, но всё ещё осторожен в своих ожиданиях."
});
const unchanged = JSON.stringify({ change: "unchanged", perspective: "" });
const extraction = (messageId, quote) => JSON.stringify({
  memories: [{ messageId, quote, event: "Собеседники обсудили: " + quote, kind: "reported" }]
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
  const storage = { memories: new Map(), reflections: new Map(), memorySources: new Map() };
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
  return { S, DB, ctx, path, storage, memory, model: { id: "mock" } };
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
  await microtasksUntil(() => typeof release === "function");
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
  assert.equal(h.storage.memorySources.size, 0, "source receipt must be compensated with Memory");
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
  assert.equal(h.storage.memorySources.size, 1, "Memory and its source receipt survive Reflection failure");
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
  await microtasksUntil(() => typeof release === "function");
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
async function oneSourceOnlyAcrossTurnsAndReload() {
  const h = harness();
  const q = "Сегодня мы встретились в парке, поговорили, подарили цветы и попрощались.";
  const old = message("a", q), next = message("b", QUOTE2, "a");
  h.path.push(old);
  const attempts = [];
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (!data.sources) return { text: unchanged };
    attempts.push(data.sources.map((x) => x.messageId));
    const id = data.sources.at(-1).messageId;
    const quote = data.sources.at(-1).text;
    const first = { messageId: id, quote,
      event: id === "a" ? "Персонажи пережили одну встречу с несколькими деталями" :
        "Собеседники обсудили планы на следующий день", kind: "reported" };
    return { text: JSON.stringify({ memories: id === "a" ? [
      first,
      { messageId: id, quote: "поговорили", event: "Они говорили о своих переживаниях", kind: "reported" },
      { messageId: id, quote: "подарили цветы", event: "Они обменялись цветами", kind: "reported" }
    ] : [first] }) };
  };
  const first = await h.memory.observe(old, h.model);
  assert.equal(first.status, "remembered-unchanged");
  assert.equal(h.storage.memories.size, 1, "one source cannot fan out into several Memory records");
  assert.equal(h.storage.memorySources.size, 1);
  assert.equal((await h.memory.observe(old, h.model)).status, "no-unprocessed-source");
  assert.equal(attempts.length, 1, "duplicate observe does not call provider again");
  await h.memory.load("ch");
  h.path.push(next);
  assert.equal((await h.memory.observe(next, h.model)).status, "remembered-unchanged");
  assert.deepEqual(attempts, [["a"], ["b"]], "older a never returns to extraction");
  assert.equal(h.storage.memories.size, 2);
  assert.equal(h.storage.memorySources.size, 2);
  console.log("PASS: one Memory per source and durable skip across later turns/reload");
}
async function noMemoryStillMarksSource() {
  const h = harness(), a = message("a", QUOTE1), b = message("b", QUOTE2, "a");
  h.path.push(a);
  let calls = 0;
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (data.sources) {
      calls++;
      return { text: JSON.stringify({ memories: [] }) };
    }
    throw Error("No reflection for empty extraction");
  };
  assert.equal((await h.memory.observe(a, h.model)).status, "no-new-memory");
  assert.equal(h.storage.memorySources.size, 1);
  assert.equal((await h.memory.observe(a, h.model)).status, "no-unprocessed-source");
  h.path.push(b);
  assert.equal((await h.memory.observe(b, h.model)).status, "no-new-memory");
  assert.equal(calls, 2, "empty a must not be sent to the model a second time");
  assert.equal(h.storage.memorySources.size, 2);
  console.log("PASS: empty successful extraction is remembered as processed");
}
async function pathAndLegacyAreIndependent() {
  const M = PRP.memoryCycle;
  const raw = [{ messageId: "same", role: "character", text: "Много деталей о встрече и подарке" }];
  const path = M.pathSnapshot([message("same", raw[0].text)]);
  const parsed = M.parseExtraction(JSON.stringify({ memories: [
    { messageId: "same", quote: "Много деталей о встрече", event: "Случилась запоминающаяся встреча", kind: "observed" },
    { messageId: "same", quote: "деталей о встрече и подарке", event: "Один разговор о многих предметах", kind: "observed" }
  ] }), raw, path, "rp");
  assert.equal(parsed.length, 1);
  const old = { id: "legacy1", createdAt: 100, source: { messageId: "same",
    swipeIdx: 0, textHash: path[0].textHash, prefixHash: path[0].prefixHash }, event: "Событие А" };
  const newer = { ...old, id: "legacy2", createdAt: 200, event: "Повтор события" };
  assert.deepEqual(M.recent([newer,old],path,10).map(x=>x.id), ["legacy1"]);
  const alt = { ...old.source, swipeIdx: 1, prefixHash: "alternate" };
  assert.notEqual(M.sourceKey("ch","owner",old.source),M.sourceKey("ch","owner",alt));
  console.log("PASS: legacy duplicate projection and alternate swipe provenance");
}

async function repeatedMentionDoesNotBecomeSecondMemory() {
  const h = harness();
  const a = message("a", "Утром мы вместе купили двух плюшевых медведей.");
  const b = message("b", "Помнишь двух медведей, которых мы купили утром?", "a");
  h.path.push(a);
  const evidence = [], reflectionCalls = [];
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (!data.sources) { reflectionCalls.push(data); return { text: unchanged }; }
    evidence.push(data);
    const src = data.sources.at(-1);
    return { text: JSON.stringify({ memories: [{
      messageId: src.messageId, quote: src.text,
      event: "Утром вместе купили двух плюшевых медведей.", kind: "observed"
    }] }) };
  };
  assert.equal((await h.memory.observe(a, h.model)).status, "remembered-unchanged");
  h.path.push(b);
  assert.equal((await h.memory.observe(b, h.model)).status, "no-new-memory");
  assert.equal(h.storage.memories.size, 1, "an identically described event cannot be stored twice");
  assert.equal(h.storage.memorySources.size, 2, "a rejected repeated mention is still processed");
  assert.equal([...h.storage.memorySources.values()].find((r) => r.source.messageId === "b").result, "empty");
  assert.equal(evidence[0].priorMemories.length, 0);
  assert.deepEqual(evidence[1].priorMemories, [{
    event: "Утром вместе купили двух плюшевых медведей.", kind: "observed"
  }], "only the event, not the quote or earlier conversation, enters the novelty context");
  assert.equal(reflectionCalls.length, 1, "repetition without Memory does not invoke Reflection");
  console.log("PASS: repeated mention is skipped with durable receipt and no redundant Reflection");
}
async function distinctSimilarEventsRemainSeparate() {
  const h = harness();
  const a = message("a", "В понедельник мы гуляли в парке.");
  const b = message("b", "Во вторник мы снова гуляли в парке.", "a");
  h.path.push(a);
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (!data.sources) return { text: unchanged };
    const src = data.sources.at(-1);
    return { text: JSON.stringify({ memories: [{
      messageId: src.messageId, quote: src.text,
      event: src.messageId === "a" ? "В понедельник вместе гуляли в парке." :
        "Во вторник вместе снова гуляли в парке.", kind: "observed"
    }] }) };
  };
  assert.equal((await h.memory.observe(a, h.model)).status, "remembered-unchanged");
  h.path.push(b);
  assert.equal((await h.memory.observe(b, h.model)).status, "remembered-unchanged");
  assert.equal(h.storage.memories.size, 2, "independent repetitions must remain separate episodes");
  console.log("PASS: two similar but separate events retain their own Memory");
}

async function extractionBudgetYieldsPriorMemoryFirst() {
  const h = harness(), M = PRP.memoryCycle;
  const a = message("a", "Утром купили новых плюшевых медведей.");
  const b = message("b", "Потом вместе приготовили ужин.", "a");
  const c = message("c", "Мы договорились встретиться завтра.", "b");
  h.path.push(a, b, c);
  const snapshot = M.pathSnapshot(h.path);
  for (let i = 0; i < 2; i++) {
    const src = snapshot[i];
    h.storage.memories.set("prior" + i, { id: "prior" + i, chatId: "ch", owner: "owner",
      kind: "observed", event: "Персонаж помнит конкретный вечер и его отличительные детали номер " + i,
      source: { messageId: src.id, swipeIdx: src.swipeIdx, textHash: src.textHash,
        prefixHash: src.prefixHash } });
  }
  const minimal = JSON.stringify({ mode: "rp", sources: [
    { messageId: "c", role: "character", text: c.swipes[0].text }
  ], priorMemories: [] });
  h.ctx.contextTokens = () => 750 + 220 + PRP.util.estimateTokens(M.EXTRACT_SYSTEM) +
    PRP.util.estimateTokens(minimal) + 1;
  let received;
  modelReply = async (_, messages) => {
    received = JSON.parse(messages[1].content);
    return { text: JSON.stringify({ memories: [] }) };
  };
  assert.equal((await h.memory.observe(c, h.model)).status, "no-new-memory");
  assert.ok(received, "small budget must still allow extraction without optional prior memories");
  assert.deepEqual(received.priorMemories, [], "optional novelty context is dropped before source extraction");
  assert.equal(h.storage.memorySources.size, 1, "only the new source receives a processed receipt");
  console.log("PASS: memory extraction sheds optional prior context under strict budget");

  const blocked = harness(), fresh = message("x", "Мы вечером гуляли у моря.");
  blocked.path.push(fresh);
  blocked.ctx.contextTokens = () => 512;
  let providerCalls = 0;
  modelReply = async () => { providerCalls++; return { text: '{"memories":[]}' }; };
  assert.equal((await blocked.memory.observe(fresh, blocked.model)).status, "overflow-extract");
  assert.equal(providerCalls, 0, "preflight overflow must not call provider");
  assert.equal(blocked.storage.memorySources.size, 0, "preflight overflow must not commit source receipt");
  console.log("PASS: extraction overflow is explicit and does not mutate state");
}

async function reflectionDistinguishesSpeakerAndSubject() {
  const h = harness();
  const student = message("student", "Я учусь на гуманитарном факультете.");
  const wedding = message("wedding", "Я планирую скромную свадьбу со своей девушкой.", "student");
  wedding.role = "user"; // Character spoke about their studies; user spoke about their wedding.
  h.path.push(student, wedding);
  let reflectionPayload, extractionPayload;
  modelReply = async (_, messages) => {
    const payload = JSON.parse(messages[1].content);
    if (payload.sources) {
      extractionPayload = payload;
      return { text: JSON.stringify({ memories: payload.sources.map((row) => ({
        messageId: row.messageId,
        quote: row.text,
        event: row.role === "character"
          ? "Персонаж сообщил, что учится на гуманитарном факультете."
          : "Пользователь сообщил, что планирует свадьбу со своей девушкой.",
        kind: "reported"
      })) }) };
    }
    reflectionPayload = payload;
    return { text: changed };
  };
  assert.equal((await h.memory.observe(wedding, h.model)).status, "reflected");
  assert.deepEqual(extractionPayload.sources.map((x) => x.role), ["character", "user"],
    "extractor must see real speaker roles, not one combined narrator");
  assert.ok(reflectionPayload, "Reflection must run after new Memory");
  const studies = reflectionPayload.memories.find((m) => /гуманитарном/.test(m.quote));
  const weddingMemory = reflectionPayload.memories.find((m) => /свадьбу/.test(m.quote));
  assert.equal(studies.speaker, "character", "character's first-person biography cannot be tagged as user's");
  assert.equal(weddingMemory.speaker, "user", "user's first-person biography belongs to user");
  assert.match(PRP.memoryCycle.REFLECT_SYSTEM, /не приписывай собеседнику биографию/i);
  assert.match(PRP.memoryCycle.EXTRACT_SYSTEM, /SOURCE\.role=character/);
  assert.equal(h.storage.memories.size, 2, "Speaker metadata must not suppress independent memories");
  assert.equal(h.storage.reflections.size, 1, "Reflection retains existing persistence lifecycle");
  for (const row of h.storage.memories.values())
    assert.equal(Object.hasOwn(row, "speaker"), false, "Speaker is reconstructed; stored Memory schema unchanged");
  console.log("PASS: Reflection distinguishes character's studies from user's wedding");
}
function legacyMemorySpeakerDerivedFromActivePath() {
  const M = PRP.memoryCycle;
  const student = message("old-character", "Я учусь на гуманитарном факультете.");
  const wedding = message("old-user", "Я женюсь.", "old-character");
  wedding.role = "user";
  const active = M.pathSnapshot([student, wedding]);
  const legacy = [{ id: "m-old", event: "Персонаж учится на гуманитарном факультете.",
    kind: "reported", quote: "Я учусь на гуманитарном факультете.",
    source: { messageId: active[0].id, swipeIdx: active[0].swipeIdx,
      textHash: active[0].textHash, prefixHash: active[0].prefixHash } }];
  assert.equal(M.weighted(M.recent(legacy, active, M.LIMIT), active)[0].speaker, "character",
    "old stored Memory gains speaker without a migration");
  assert.equal(M.weighted(legacy, [])[0].speaker, "unknown",
    "missing authoritative speaker cannot be guessed from event text");
  const alternative = { ...student, swipeIdx: 1, swipes: student.swipes.concat([
    { text: "Я работаю врачом.", sceneOps: [] }
  ]) };
  assert.equal(M.recent(legacy, M.pathSnapshot([alternative, wedding]), M.LIMIT).length, 0,
    "alternate ancestor swipe must not reveal old Memory to Reflection");
  console.log("PASS: legacy Memory speaker is inferred from active path, never model-supplied text");
}

async function tenMemoriesMakeIndependentBatch() {
  const h = harness(), calls = { current: 0, batch: 0 }, speeches = [];
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (data.sources) {
      const row = data.sources.at(-1);
      return { text: JSON.stringify({ memories: [{ messageId: row.messageId,
        quote: row.text, event: "Отдельный эпизод разговора номер " + row.messageId,
        kind: "reported" }] }) };
    }
    if (Object.hasOwn(data, "previousExperience")) {
      calls.current++;
      speeches.push(data.memories.length);
      return { text: changed };
    }
    calls.batch++;
    assert.equal(data.memories.length, 10, "batch Reflection receives exactly ten Memory entries");
    assert.equal(data.memories[0].speaker, "character");
    assert.equal(data.memories[9].speaker, "character");
    assert.equal(Object.hasOwn(data, "previousExperience"), false,
      "batch Reflection must not recursively consume current Experience");
    return { text: JSON.stringify({ change: "changed", perspective: "У нас сформировались новые общие воспоминания." }) };
  };
  for (let i = 1; i <= 11; i++) {
    const prev = h.path.at(-1);
    const msg = message("episode" + i, "Вечером произошло отдельное событие номер " + i + ".", prev && prev.id);
    h.path.push(msg);
    assert.ok(["reflected", "remembered-unchanged"].includes((await h.memory.observe(msg, h.model)).status));
    const batches = [...h.storage.reflections.values()].filter((r) => r.kind === "batch");
    if (i < 10) assert.equal(batches.length, 0, "no premature batch");
    if (i >= 10) assert.equal(batches.length, 1, "only one checkpoint for the first ten Memory");
  }
  assert.equal(calls.current, 11, "Reflection remains continuous after every accepted Memory");
  assert.equal(calls.batch, 1, "checkpoint Reflection fires at exactly one full Memory group");
  assert.deepEqual(speeches, [1,2,3,4,5,6,7,8,9,10,10],
    "current Reflection still uses only last ten accessible Memory");
  const batch = [...h.storage.reflections.values()].find((r) => r.kind === "batch");
  assert.equal(batch.memoryIds.length, 10);
  assert.deepEqual(batch.memoryIds, [...h.storage.memories.values()].slice(0,10).map((m) => m.id));
  assert.equal(h.memory.experience().perspective, changed && JSON.parse(changed).perspective,
    "batch text must not replace current Experience delivered to Prism");
  await h.memory.load("ch");
  assert.equal(h.memory.experience().kind, undefined, "old current Reflection schema still loads");
  assert.equal(PRP.memoryCycle.checkpointPlan([...h.storage.memories.values()],
    [...h.storage.reflections.values()], PRP.memoryCycle.pathSnapshot(h.path), "ch", "owner"), null,
    "reloaded checkpoint cannot be recomputed from the same ten Memory");
  console.log("PASS: ten distinct Memory trigger one independent checkpoint, current Reflection never stops");
}

function checkpointPlanRespectsBranchAndGaps() {
  const M = PRP.memoryCycle, path = [], mem = [];
  for (let i = 0; i < 22; i++) {
    const prior = path.at(-1);
    const m = message("src-" + i, "Персонаж участвует в событии номер " + i + ".", prior && prior.id);
    path.push(m);
  }
  const snap = M.pathSnapshot(path);
  for (let i = 0; i < 22; i++) {
    const row = snap[i];
    mem.push({ id: "m" + i, chatId: "ch", owner: "owner",
      event: "Произошло событие " + i, quote: row.text, kind: "observed", createdAt: i,
      source: { messageId: row.id, swipeIdx: row.swipeIdx,
        textHash: row.textHash, prefixHash: row.prefixHash } });
  }
  const group1 = M.checkpointPlan(mem, [], snap, "ch", "owner");
  assert.deepEqual(group1.memoryIds, mem.slice(0,10).map(x=>x.id));
  const group2 = M.checkpointPlan(mem, [{ id: group1.id, chatId: "ch", owner: "owner",
    kind: "batch", anchor: group1.anchor }], snap, "ch", "owner");
  assert.deepEqual(group2.memoryIds, mem.slice(10,20).map(x=>x.id),
    "second group must not overlap the first and must not skip memory at 10th boundary");
  const done = [{ id: group1.id, chatId: "ch", owner: "owner", kind: "batch", anchor: group1.anchor },
    { id: group2.id, chatId: "ch", owner: "owner", kind: "batch", anchor: group2.anchor }];
  assert.equal(M.checkpointPlan(mem, done, snap, "ch", "owner"), null,
    "no partially completed third group");
  const alternate = path.map((x,i)=>i===5 ? { ...x, swipeIdx: 1,
    swipes: x.swipes.concat([{ text: "Иное начало линии событий.", sceneOps: [] }]) } : x);
  assert.equal(M.checkpointPlan(mem, done, M.pathSnapshot(alternate), "ch", "owner"), null,
    "branch change invalidates all descendant Memory groups, never leaks sibling batches");
  console.log("PASS: checkpoint groups are disjoint, reload-safe and branch/swipe scoped");
}
async function batchFailureDoesNotRollbackCurrentReflection() {
  const h = harness(), M = PRP.memoryCycle;
  const path = [], mem = [];
  for (let i = 0; i < 9; i++) {
    const m = message("old" + i, "Произошёл памятный разговор " + i + ".", path.at(-1)?.id);
    path.push(m);
  }
  const snap = M.pathSnapshot(path);
  for (let i = 0; i < 9; i++) {
    const m = snap[i];
    const memory = { id: "prior-" + i, chatId: "ch", owner: "owner", event: "Память номер " + i,
      quote: m.text, kind: "observed", source: { messageId: m.id, swipeIdx: m.swipeIdx,
        textHash: m.textHash, prefixHash: m.prefixHash } };
    h.storage.memories.set(memory.id, memory);
  }
  h.path.push(...path);
  const tenth = message("tenth", "Десятая значимая встреча состоялась.", path.at(-1).id);
  h.path.push(tenth);
  let batches = 0;
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (data.sources) {
      return { text: JSON.stringify({ memories: data.sources.map((row) => ({
        messageId: row.messageId, quote: row.text,
        event: "Новая память для " + row.messageId, kind: "observed" })) }) };
    }
    if (Object.hasOwn(data, "previousExperience")) return { text: changed };
    batches++;
    return { text: "invalid JSON from batch Reflection" };
  };
  const first = await h.memory.observe(tenth, h.model);
  assert.equal(first.status, "reflected");
  assert.equal(h.storage.memories.size, 10);
  assert.equal(h.storage.reflections.size, 1, "batch failure must not corrupt current Experience");
  assert.equal(batches, 1);
  const next = message("next", "На следующий день персонаж вспомнил встречу.", tenth.id);
  h.path.push(next);
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (data.sources) return { text: JSON.stringify({ memories: data.sources.map((row) => ({
      messageId: row.messageId, quote: row.text,
      event: "Дополнительное событие " + row.messageId, kind: "observed" })) }) };
    if (Object.hasOwn(data, "previousExperience")) return { text: changed };
    return { text: JSON.stringify({ change: "unchanged", perspective: "" }) };
  };
  assert.equal((await h.memory.observe(next, h.model)).status, "remembered-unchanged");
  const checkpoint = [...h.storage.reflections.values()].find(r=>r.kind==="batch");
  assert.ok(checkpoint, "failed batch must retry when next Memory arrives");
  assert.equal(checkpoint.change, "unchanged");
  assert.equal(checkpoint.perspective, "");
  assert.equal(checkpoint.memoryIds.length, 10, "retry still covers only original ten memories");
  assert.equal(h.storage.memories.size, 11);
  assert.equal(h.memory.experience().perspective, JSON.parse(changed).perspective);
  console.log("PASS: batch failure retries after new Memory without rollback or false current Experience");
}

async function experienceIntegrationOverTwoHundredMemories() {
  const h = harness(), counts = { reflect: 0, batch: 0, integrated: 0 };
  const payloads = [];
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (data.sources) {
      const last = data.sources.at(-1);
      return { text: JSON.stringify({ memories: [{
        messageId: last.messageId, quote: last.text,
        event: "Персонаж запомнил независимое событие " + last.messageId, kind: "observed"
      }] }) };
    }
    if (data.batches) {
      counts.integrated++;
      payloads.push(data);
      assert.equal(data.batches.length, 10, "an integration wave only contains ten batch perspectives");
      assert.equal(data.batches[0].order, 1);
      assert.equal(data.batches[9].order, 10);
      assert.equal(Object.hasOwn(data, "memories"), false, "integration never transfers raw Memory");
      assert.equal(Object.hasOwn(data, "previousExperience"), false,
        "integration cannot recursively include current rolling Experience");
      return { text: JSON.stringify({ change: "changed",
        perspective: "Персонаж приобрёл общее восприятие после волны " + counts.integrated + "." }) };
    }
    if (Object.hasOwn(data, "previousExperience")) {
      counts.reflect++;
      if (counts.reflect === 101)
        assert.equal(data.previousExperience, "Персонаж приобрёл общее восприятие после волны 1.",
          "next continuous Reflection must inherit the active integration");
      return { text: changed };
    }
    counts.batch++;
    assert.equal(data.memories.length, 10);
    assert.equal(Object.hasOwn(data, "previousExperience"), false);
    return { text: JSON.stringify({ change: "changed",
      perspective: "Независимый опыт порции " + counts.batch + " сформирован." }) };
  };
  for (let i = 1; i <= 201; i++) {
    const prior = h.path.at(-1);
    const msg = message("long-" + i, "Состоялось самостоятельное памятное событие номер " + i + ".", prior?.id);
    h.path.push(msg);
    const outcome = await h.memory.observe(msg, h.model);
    assert.ok(["reflected", "remembered-unchanged"].includes(outcome.status), "cycle " + i);
    if ([9, 10, 11, 99, 100, 101, 200, 201].includes(i)) {
      const view = h.memory.timeline();
      assert.equal(view.memoryCount, i, "visible Memory count in timeline");
      assert.equal(view.memoryStep, i % 10, "Memory progress after " + i);
      assert.equal(view.batchCount, Math.floor(i / 10), "batch checkpoints after " + i);
      assert.equal(view.batchStep, Math.floor(i / 10) % 10);
      assert.equal(view.integratedCount, Math.floor(i / 100), "overall conclusions after " + i);
      assert.equal(view.batches.length, view.batchCount);
      assert.equal(view.integrations.length, view.integratedCount);
      assert.equal(view.checkpointPending, false);
      assert.equal(view.integrationPending, false);
    }
    if (i === 100 || i === 200) {
      const current = h.memory.experience();
      assert.equal(current.kind, "integrated", "integrated summary must be the single active Experience at a wave boundary");
      assert.equal(current.perspective, "Персонаж приобрёл общее восприятие после волны " + (i / 100) + ".");
    }
  }
  assert.deepEqual(counts, { reflect: 201, batch: 20, integrated: 2 },
    "continuous Reflection persists; only one integration call per ten independent batches");
  assert.equal(payloads[0].previousIntegrated, null);
  assert.equal(payloads[1].previousIntegrated, "Персонаж приобрёл общее восприятие после волны 1.",
    "subsequent integration inherits only previous integrated Experience");
  assert.equal(payloads[1].batches[0].perspective, "Независимый опыт порции 11 сформирован.",
    "second wave begins after first hundred Memory");
  assert.equal(payloads[1].batches[9].perspective, "Независимый опыт порции 20 сформирован.");
  const records = [...h.storage.reflections.values()];
  assert.equal(records.filter(r=>r.kind==="batch").length,20);
  const summaries=records.filter(r=>r.kind==="integrated");
  assert.equal(summaries.length,2);
  assert.equal(summaries[1].previousId,summaries[0].id);
  assert.equal(summaries[0].batchIds.length,10);
  assert.equal(summaries[1].batchIds.length,10);
  assert.ok(summaries[0].batchIds.every(id=>!summaries[1].batchIds.includes(id)),
    "old batch cannot re-enter a later integration wave");
  await h.memory.load("ch");
  const plan=PRP.memoryCycle.integrationPlan([...h.storage.memories.values()],
    [...h.storage.reflections.values()], PRP.memoryCycle.pathSnapshot(h.path),"ch","owner");
  assert.equal(plan,null,"reload must not repeat an already completed integration");
  assert.notEqual(h.memory.experience().kind,"batch","batch records never enter normal Prism");
  assert.equal(h.memory.timeline().integratedCount, 2, "reloaded timeline preserves completed integrations");
  console.log("PASS: 200 Memory -> 20 disjoint batches -> 2 cumulative integrations with one active Experience");
}
function integrationPlanRejectsWrongOwnershipAndBranch() {
  const M=PRP.memoryCycle,path=[],mem=[];
  for(let i=0;i<100;i++) {
    const node=message("src-int-"+i,"Состоялось самостоятельное событие "+i+".",path.at(-1)?.id);
    path.push(node);
  }
  const snap=M.pathSnapshot(path);
  for(let i=0;i<100;i++) {
    const row=snap[i];
    mem.push({id:"im"+i,event:"Эпизод "+i,
      source:{messageId:row.id,swipeIdx:row.swipeIdx,
        textHash:row.textHash,prefixHash:row.prefixHash}});
  }
  const batches=[];
  for(let i=0;i<10;i++) {
    const start=i*10, memoryIds=mem.slice(start,start+10).map(x=>x.id);
    batches.push({id:"exp-batch:"+JSON.stringify(["ch","owner",...memoryIds]),
      kind:"batch",chatId:"ch",owner:"owner",memoryIds,anchor:mem[start+9].source,
      change:"changed",perspective:"Сформировалась перспектива "+i});
  }
  const plan=M.integrationPlan(mem,batches,snap,"ch","owner");
  assert.equal(plan.batchIds.length,10);
  assert.equal(M.integrationPlan(mem,batches,snap,"another-chat","owner"),null,
    "cannot use batches owned by another chat");
  assert.equal(M.integrationPlan(mem,batches,snap,"ch","other-owner"),null,
    "cannot use batches owned by another character");
  assert.equal(M.integrationPlan(mem,batches.slice(1),snap,"ch","owner"),null,
    "missing earlier checkpoint blocks later integration");
  const alternative=path.map((x,i)=>i===30?{...x,swipeIdx:1,
    swipes:x.swipes.concat([{text:"Альтернативная встреча.",sceneOps:[]}])}:x);
  assert.equal(M.integrationPlan(mem,batches,M.pathSnapshot(alternative),"ch","owner"),null,
    "altered ancestor swipe blocks sibling integration input");
  const old=M.currentReflection([...batches, {kind:"current",anchor:mem[99].source,perspective:"Текущий опыт",createdAt:3}],
    snap);
  assert.equal(old.kind,"current","batch never selected as live Experience");
  const completed={id:plan.id,kind:"integrated",owner:"owner",chatId:"ch",
    batchIds:plan.batchIds,anchor:plan.anchor,perspective:"Общий опыт",
    previousId:null,createdAt:4};
  assert.equal(M.currentReflection([...batches, old, completed],snap).id,plan.id,
    "integrated perspective wins when anchored to same last source");
  assert.equal(M.integrationPlan(mem,batches.concat([completed]),snap,"ch","owner"),null,
    "an existing valid integration cannot be executed twice");
  console.log("PASS: integration verifies all ten source batches and selects branch-visible summary");
}

async function recoveredLateIntegrationDoesNotEraseRecentExperience() {
  const h = harness();
  let integrationAttempts = 0, currentCalls = 0, resumedInput;
  modelReply = async (_, messages) => {
    const data = JSON.parse(messages[1].content);
    if (data.sources) {
      const src = data.sources.at(-1);
      return { text: JSON.stringify({ memories: [{
        messageId: src.messageId, quote: src.text,
        event: "Новое эпизодическое воспоминание " + src.messageId, kind: "observed"
      }] }) };
    }
    if (data.batches) {
      integrationAttempts++;
      if (integrationAttempts === 1) return { text: "not valid JSON" };
      return { text: JSON.stringify({ change: "changed",
        perspective: "Долгосрочный общий опыт принят после поздней Reflection." }) };
    }
    if (Object.hasOwn(data, "previousExperience")) {
      currentCalls++;
      if (currentCalls === 102) resumedInput = data;
      if (currentCalls === 101) return { text: JSON.stringify({
        change: "changed", perspective: "Воспоминания о недавней встрече оказались особенно свежими."
      }) };
      return { text: currentCalls === 102 ? JSON.stringify({
        change: "changed", perspective: "Долгосрочный опыт включён вместе с последними событиями."
      }) : changed };
    }
    return { text: JSON.stringify({ change: "changed",
      perspective: "В отдельном блоке возникло новое субъективное ощущение." }) };
  };
  for (let i = 1; i <= 102; i++) {
    const p = h.path.at(-1);
    const msg = message("late-" + i, "Произошло отдельное наблюдаемое событие номер " + i + ".", p?.id);
    h.path.push(msg);
    await h.memory.observe(msg, h.model);
    if (i === 100)
      assert.equal([...h.storage.reflections.values()].filter(r=>r.kind==="integrated").length,0,
        "invalid integration must not commit");
    if (i === 101) {
      assert.equal([...h.storage.reflections.values()].filter(r=>r.kind==="integrated").length,1,
        "retry succeeded at 101st new Memory");
      assert.notEqual(h.memory.experience().kind,"integrated",
        "integration anchored at 100 must not erase a newer 101st current Experience");
    }
  }
  assert.equal(integrationAttempts,2);
  assert.equal(resumedInput.recentIntegrated,
    "Долгосрочный общий опыт принят после поздней Reflection.",
    "next current Reflection receives recovered integration as optional bounded context");
  assert.equal(h.memory.experience().perspective,
    "Долгосрочный опыт включён вместе с последними событиями.");
  const records=[...h.storage.reflections.values()].filter(r=>r.kind==="integrated");
  assert.equal(records.length,1,"recovery must not create duplicate summaries");
  console.log("PASS: delayed integration is incorporated without overwriting newer current Experience");
}

function experienceTimelineReadOnlyAndBranchBound() {
  const M=PRP.memoryCycle,path=[],mem=[];
  for(let i=0;i<100;i++) {
    const node=message("ui-"+i,"Произошёл эпизод для просмотра "+i+".",path.at(-1)?.id);
    path.push(node);
  }
  const snap=M.pathSnapshot(path);
  for(let i=0;i<100;i++) {
    const row=snap[i];
    mem.push({id:"ui-m"+i,chatId:"ch",owner:"owner",event:"Эпизод "+i,
      source:{messageId:row.id,swipeIdx:row.swipeIdx,textHash:row.textHash,
        prefixHash:row.prefixHash}});
  }
  const batches=[];
  for(let i=0;i<10;i++) {
    const ids=mem.slice(i*10,i*10+10).map(x=>x.id);
    batches.push({id:"exp-batch:"+JSON.stringify(["ch","owner",...ids]),
      kind:"batch",chatId:"ch",owner:"owner",memoryIds:ids,
      anchor:mem[i*10+9].source,change:i===4?"unchanged":"changed",
      perspective:i===4?"":"Субъективный опыт #"+(i+1)});
  }
  const before=M.experienceTimeline(mem,batches,snap,"ch","owner");
  assert.equal(before.memoryCount,100);
  assert.equal(before.memoryStep,0);
  assert.equal(before.batchCount,10);
  assert.equal(before.batchStep,0);
  assert.equal(before.integratedCount,0);
  assert.equal(before.integrationPending,true,"ten completed batches await integration");
  assert.equal(before.batches[4].perspective,"","unchanged checkpoint shown, not omitted");
  const integrationPlan=M.integrationPlan(mem,batches,snap,"ch","owner");
  const integrated={kind:"integrated",chatId:"ch",owner:"owner",
    id:integrationPlan.id,batchIds:integrationPlan.batchIds,
    previousId:null,anchor:integrationPlan.anchor,
    change:"changed",perspective:"Общее субъективное восприятие персонажа"};
  const after=M.experienceTimeline(mem,batches.concat([integrated]),snap,"ch","owner");
  assert.equal(after.integratedCount,1);
  assert.equal(after.integrationPending,false);
  assert.equal(after.integrations[0].perspective,integrated.perspective);
  assert.deepEqual(after, M.experienceTimeline(mem,batches.concat([integrated]),snap,"ch","owner"),
    "projection must be deterministic without storage mutations");
  const swapped=path.map((node,i)=>i===5?{...node,swipeIdx:1,
    swipes:node.swipes.concat([{text:"В другой ветке произошло новое событие.",sceneOps:[]}])}:node);
  const sibling=M.experienceTimeline(mem,batches.concat([integrated]),
    M.pathSnapshot(swapped),"ch","owner");
  assert.equal(sibling.memoryCount,5);
  assert.equal(sibling.batchCount,0);
  assert.equal(sibling.integratedCount,0);
  assert.equal(M.experienceTimeline(mem,batches.concat([integrated]),snap,"another","owner").memoryCount,0,
    "other chat can see neither memories nor stored experiences");
  assert.equal(M.experienceTimeline(mem,batches.concat([integrated]),snap,"ch","another").batchCount,0,
    "other character cannot read the history");
  const invalidBatch={...batches[0],memoryIds:["forged",...batches[0].memoryIds.slice(1)]};
  assert.equal(M.experienceTimeline(mem,[invalidBatch,...batches.slice(1),integrated],snap,"ch","owner").batchCount,0,
    "invalid checkpoint must not create false progress");
  const invalidIntegration={...integrated,batchIds:["forged",...integrated.batchIds.slice(1)]};
  assert.equal(M.experienceTimeline(mem,batches.concat([invalidIntegration]),snap,"ch","owner").integratedCount,0,
    "invalid integration must not be presented as completed");

  PRP.render={esc:s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;"),icon:()=>""};
  PRP.viewKit={SAMPLER_PRESETS:[],THEMES:[],WEATHER:[],loraRows:[]};
  require("../js/ui/views/drawer.js");
  const hostile='<img src=x onerror="alert(1)">';
  const ui = PRP.views.drawer({
    chat:{mode:"rp"},tab:"memory",observedMemories:[],currentExperience:{kind:"integrated",
      perspective:"Общий опыт"},memoryStatus:"reflected",
    memoryTimeline:{...after,batches:[{...after.batches[0],perspective:hostile}],
      integrations:[{...after.integrations[0],perspective:hostile}]}
  });
  assert.match(ui,/Memory → Experience · 0\/10/);
  assert.match(ui,/Experience → общий вывод · 0\/10/);
  assert.match(ui,/История объединений/);
  assert.match(ui,/Завершённые порции Experience/);
  assert.match(ui,/Сейчас активен общий Experience/);
  assert.ok(ui.includes("&lt;img"),"model-generated perspective is escaped in read-only UI");
  assert.ok(!ui.includes(hostile),"stored HTML must not run as markup");
  assert.ok(!ui.includes('data-act="experience-save"'),"no user authoring controls");
  console.log("PASS: read-only Experience timeline is branch-scoped, accurate, escaped and renderer-safe");
}

function extractionSelectionContract() {
  const M = PRP.memoryCycle;
  assert.match(M.EXTRACT_SYSTEM, /memories: \[\]/, "empty extraction must be the explicit default for routine messages");
  assert.match(M.EXTRACT_SYSTEM, /повседневные детали/, "small lived moments must stay eligible");
  const a = message("root", "Мы пришли на встречу в парк.");
  const b = message("later", "Мы купили игрушку и вернулись.", "root");
  const original = M.pathSnapshot([a, b]);
  const old = [{ id: "mem-old", event: "Вместе купили игрушку.", quote: "Мы купили игрушку",
    kind: "observed", source: { messageId: original[1].id,
      swipeIdx: original[1].swipeIdx, textHash: original[1].textHash,
      prefixHash: original[1].prefixHash } }];
  assert.deepEqual(M.extractionContext(old, original), [{
    event: "Вместе купили игрушку.", kind: "observed"
  }]);
  const alternativeRoot = { ...a, swipeIdx: 1,
    swipes: a.swipes.concat([{ text: "Мы пошли в кино.", sceneOps: [] }]) };
  assert.deepEqual(M.extractionContext(old, M.pathSnapshot([alternativeRoot, b])), [],
    "ancestor swipe change must hide old extraction context");
  assert.equal(M.distinctExtraction([
    { event: "Вместе купили игрушку!" }, { event: "Во вторник снова купили игрушку." }
  ], old).length, 1, "exact repeats are omitted but a new occasion survives");
  console.log("PASS: selective Memory contract, branch-safe context and conservative deduplication");
}

function backupJournalValidation() {
  const M = PRP.memoryCycle, snap = M.pathSnapshot([message("evt", QUOTE1)])[0];
  const row = { id: "r", chatId: "ch", owner: "owner",
    source: { messageId: snap.id, swipeIdx: snap.swipeIdx,
      textHash: snap.textHash, prefixHash: snap.prefixHash }, result: "empty" };
  row.sourceKey = M.sourceKey("ch", "owner", row.source);
  const data = { cards: [{ id: "owner" }, { id: "other" }],
    chats: [{ id: "ch", cardId: "owner" }], memorySources: [row] };
  const B = PRP.backup;
  assert.equal(B.check(data, { replace: true }).data.memorySources.length, 1);
  const foreign = { ...row, owner: "other", id: "foreign",
    sourceKey: M.sourceKey("ch", "other", row.source) };
  const bad = B.check({ ...data, memorySources: [foreign] }, { replace: true });
  assert.equal(bad.data.memorySources.length, 0, "foreign owner must not inject a processed marker");
  const forged = { ...row, id: "forged", sourceKey: "invented" };
  assert.equal(B.check({ ...data, memorySources: [forged] }, { replace: true }).data.memorySources.length, 0);
  const repeated = { ...row, id: "dupe" };
  assert.equal(B.check({ ...data, memorySources: [row, repeated] }, { replace: true }).data.memorySources.length, 0);
  console.log("PASS: backup refuses forged, cross-owner and repeated source receipts");
}
async function run() {
  await fifo();
  await deletionDuringMemoryWrite();
  await deletionDuringReflectionWrite();
  await sameIdRestoreKeepsOldWorkInvalid();
  await oneSourceOnlyAcrossTurnsAndReload();
  await noMemoryStillMarksSource();
  await repeatedMentionDoesNotBecomeSecondMemory();
  await distinctSimilarEventsRemainSeparate();
  await extractionBudgetYieldsPriorMemoryFirst();
  await reflectionDistinguishesSpeakerAndSubject();
  legacyMemorySpeakerDerivedFromActivePath();
  await tenMemoriesMakeIndependentBatch();
  checkpointPlanRespectsBranchAndGaps();
  await batchFailureDoesNotRollbackCurrentReflection();
  await experienceIntegrationOverTwoHundredMemories();
  integrationPlanRejectsWrongOwnershipAndBranch();
  await recoveredLateIntegrationDoesNotEraseRecentExperience();
  experienceTimelineReadOnlyAndBranchBound();
  await pathAndLegacyAreIndependent();
  extractionSelectionContract();
  backupJournalValidation();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
