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
  await pathAndLegacyAreIndependent();
  extractionSelectionContract();
  backupJournalValidation();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
