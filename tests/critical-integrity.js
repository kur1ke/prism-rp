"use strict";
// Regression probes for untrusted image URLs, chat persistence and async navigation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function load(name) { require(path.join(root, "js", name)); }
load("core/util.js");
load("prism/data.js");
load("prism/scene.js");
load("chat/tree.js");
load("chat/service.js");
load("ui/render.js");
const PRP = globalThis.PRP;
const unsafe = 'https://example.test/p.png" onerror="alert(1)';
assert.ok(PRP.render.safeImageSrc(unsafe).includes("&quot;"));
assert.ok(!PRP.render.safeImageSrc(unsafe).includes('" onerror="'));
assert.equal(PRP.render.safeImageSrc("javascript:alert(1)"), "");
assert.equal(PRP.render.safeImageSrc("data:image/svg+xml,<svg onload=alert(1)>"), "");
assert.ok(PRP.render.safeImageSrc("data:image/png;base64,AAAA"));
assert.ok(!PRP.render.avatar({ name: "X", avatar: unsafe }, 40).includes('" onerror="'));
assert.ok(!PRP.render.art({ name: "X", avatar: unsafe }).includes('" onerror="'));

async function persistence() {
  const records = { chats: new Map(), messages: new Map() };
  let fail = false;
  const db = {
    putAll: async (entries) => {
      if (fail) throw new Error("simulated IndexedDB abort");
      for (const [store, object] of entries)
        records[store].set(object.id, JSON.parse(JSON.stringify(object)));
    },
    put: async (store, object) => {
      if (fail) throw new Error("simulated IndexedDB abort");
      records[store].set(object.id, JSON.parse(JSON.stringify(object)));
    },
  };
  const S = { cards: [{ id: "card", name: "Тест", firstMes: "Привет." }], cardId: "card", chats: [], chatId: null, messages: [] };
  const ctx = { S, DB: db, chat: () => S.chats.find(c => c.id === S.chatId), persona: () => ({ name: "Игрок" }), card: () => S.cards[0] };
  const svc = PRP.chatService.create(ctx);
  fail = true;
  await assert.rejects(svc.createChat("rp", "card"), /abort/);
  assert.equal(S.chats.length, 0);
  assert.equal(S.messages.length, 0);
  assert.equal(records.messages.size, 0);
  fail = false;
  const chatId = await svc.createChat("rp", "card");
  assert.equal(records.chats.get(chatId).leafId, S.messages[0].id);
  assert.equal(records.messages.size, 1);
  const oldLeaf = ctx.chat().leafId;
  fail = true;
  await assert.rejects(svc.addUserMessage("Тест"), /abort/);
  assert.equal(ctx.chat().leafId, oldLeaf);
  assert.equal(S.messages.length, 1);
  assert.equal(records.messages.size, 1);
  fail = false;
  const next = await svc.addUserMessage("Тест");
  assert.equal(ctx.chat().leafId, next.id);
  assert.equal(records.chats.get(chatId).leafId, next.id);
  assert.equal(records.messages.size, 2);
}

function navigationHarness() {
  const renders = [], toasts = [];
  const factories = {};
  const noop = () => {};
  let ctx;
  const ui = {
    $: () => ({ classList: { remove: noop } }), narrow: () => false,
    rememberUi: noop, syncScrim: noop, renderAll: () => renders.push("all"),
    scrollBottom: noop, toast: value => toasts.push(value)
  };
  const service = (name, extra) => { factories[name] = { create: c => (ctx = c, extra || {}) }; };
  service("chatService", { loadMessages: async () => [] });
  service("experienceService", { loadForCard: async () => [] });
  service("memoryService", { load: async () => {} });
  service("prismService", { refresh: noop });
  service("imageService", { loadForChat: async () => {} });
  service("stateService");
  service("generationService");
  service("cardService");
  service("assistService");
  service("worldService");
  service("worldOverlayService", { load: async () => {} });
  service("messengerService", { load: async () => {} });
  const controllers = {};
  for (const name of ["chat", "drawer", "cards", "settings", "images", "assist", "world", "messenger"])
    controllers[name] = () => ({ actions: {}, shortcut: () => false });
  const namespace = {
    util: { clone: x => JSON.parse(JSON.stringify(x)) },
    store: {}, settings: {}, perchance: {}, imgBackends: {}, imgCompile: {},
    shell: { create: () => ui }, controllers, views: {},
    perfLog: { create: () => noop, resetOnChatChange: noop },
    ...factories
  };
  const win = { PRP: namespace };
  const doc = { readyState: "loading", addEventListener: noop };
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8"), { window: win, document: doc, console });
  const S = win.PRP.app.S;
  S.cards = [{ id: "ca" }, { id: "cb" }];
  S.chats = [{ id: "a", cardId: "ca" }, { id: "b", cardId: "cb" }];
  return { S, svc: win.PRP.app.ctx.svc, nav: win.PRP.app.ctx.nav, renders, toasts };
}
async function navigation() {
  const h = navigationHarness();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let active = 0, concurrent = false;
  h.svc.chat.loadMessages = async id => {
    active++;
    if (active > 1) concurrent = true;
    if (id === "a") await gate;
    active--;
    return [{ id: "message-" + id }];
  };
  h.svc.exp.loadForCard = async id => [{ id: "experience-" + id }];
  h.svc.memory.load = async id => { h.S.memories = [{ id: "memory-" + id }]; };
  h.svc.worldChat.load = async id => { h.S.worldOverlay = { chatId: id }; };
  h.svc.messenger.load = async id => { h.S.messengerEnv = { chatId: id }; };
  h.svc.images.loadForChat = async id => { h.S.imgUrls = { [id]: "image" }; };
  const first = h.nav.openChat("a");
  await Promise.resolve();
  await Promise.resolve();
  const second = h.nav.openChat("b");
  release();
  await Promise.all([first, second]);
  assert.equal(concurrent, false, "chat activations must be serialized");
  assert.equal(h.S.chatId, "b");
  assert.equal(h.S.messages[0].id, "message-b");
  assert.equal(h.S.experience[0].id, "experience-cb");
  assert.equal(h.S.memories[0].id, "memory-b");
  assert.equal(h.S.worldOverlay.chatId, "b");
  assert.equal(h.S.messengerEnv.chatId, "b");
  assert.deepEqual(Object.keys(h.S.imgUrls), ["b"]);
  h.S.gen = { ctrl: {} };
  await h.nav.openChat("a");
  assert.equal(h.S.chatId, "b", "a running generation must not be redirected to a different chat");
  assert.ok(h.toasts.length > 0);
}
(async () => {
  await persistence();
  await navigation();
  console.log("Critical integrity checks: image URL safety, atomic chat roots, navigation races — OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
