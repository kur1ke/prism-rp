"use strict";
// Adapter contract probes; real IndexedDB concurrency/restore is covered in E2E.
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../js/core/store.js"), "utf8");
function harness(options = {}) {
  const clone = x => JSON.parse(JSON.stringify(x));
  const rows = {}, transactions = [], requests = [];
  let writeQueued = false, written = false, release;
  const db = {
    transaction(names, mode) {
      const stores = typeof names === "string" ? [names] : Array.from(names);
      const snapshot = clone(rows), t = { error: null };
      transactions.push({ stores, mode });
      let pending = 0, aborted = false;
      t.abort = () => { if (aborted) return; aborted = true; queueMicrotask(() => t.onabort && t.onabort()); };
      const complete = () => {
        if (aborted) return;
        if (options.abort) { t.error = Error("snapshot abort"); t.abort(); return; }
        t.oncomplete && t.oncomplete();
        if (writeQueued && !written) {
          written = true;
          rows.cards = [{ id: "card-new" }];
          rows.chats = [{ id: "chat-new", cardId: "card-new" }];
          rows.messages = [{ id: "message-new", chatId: "chat-new" }];
        }
      };
      t.objectStore = name => ({ getAll() {
        if (!stores.includes(name)) throw Error("store outside transaction");
        if (options.throwRead === name) throw Error("getAll setup failure");
        const req = {}; pending++; requests.push(name);
        queueMicrotask(() => {
          if (aborted) return;
          if (options.failRead === name) {
            req.error = t.error = Error("getAll request failure");
            req.onerror && req.onerror({ target: req }); t.onerror && t.onerror(); t.abort(); return;
          }
          req.result = snapshot[name] || [];
          req.onsuccess && req.onsuccess();
          if (options.writer && name === "cards") writeQueued = true;
          if (!--pending) queueMicrotask(() => { if (options.hold) release = complete; else complete(); });
        });
        return req;
      } });
      return t;
    }
  };
  const context = vm.createContext({ __PRP_TEST_MIRROR: true, setTimeout, clearTimeout,
    indexedDB: { open() { const req = {}; queueMicrotask(() => { req.result = db; req.onsuccess(); }); return req; } } });
  vm.runInContext(source, context);
  return { api: context.PRP.store, rows, options, transactions, requests,
    release: () => { options.hold = false; release(); } };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS: " + name); }
(async () => {
  await test("concurrent atomic card/chat/message write cannot split exported collections", async () => {
    const h = harness({ writer: true }), out = await h.api.exportAll();
    assert.equal(out.cards.length, out.chats.length); assert.equal(out.cards.length, out.messages.length);
    assert.equal(h.rows.cards.length, 1, "fixture writer must actually run");
    assert.equal(h.transactions.length, 1); assert.equal(h.transactions[0].mode, "readonly");
    assert.deepEqual(h.transactions[0].stores, Array.from(h.api.STORES));
  });
  await test("backup metadata, all collections and preserved data keep their contract", async () => {
    const h = harness(); for (const s of h.api.STORES) h.rows[s] = [{ id: s, raw: { untouched: true } }];
    const out = await h.api.exportAll();
    assert.equal(out.app, "prism-rp"); assert.equal(out.version, 8); assert.ok(Number.isFinite(Date.parse(out.exportedAt)));
    for (const s of h.api.STORES) assert.deepEqual(JSON.parse(JSON.stringify(out[s])), h.rows[s]);
  });
  await test("noImages excludes image store and retains other collections", async () => {
    const h = harness({ failRead: "images" }), out = await h.api.exportAll({ noImages: true });
    assert.equal("images" in out, false); assert.ok(!h.requests.includes("images"));
    assert.equal(h.transactions.length, 1); assert.equal(h.transactions[0].stores.length, h.api.STORES.length - 1);
  });
  await test("failed read rejects the snapshot; retry remains available", async () => {
    const h = harness({ failRead: "messages" });
    await assert.rejects(h.api.exportAll(), /getAll request failure/);
    h.options.failRead = null; assert.ok(Array.isArray((await h.api.exportAll()).messages));
  });
  await test("synchronous request failure and transaction abort reject instead of returning partial data", async () => {
    await assert.rejects(harness({ throwRead: "messages" }).api.exportAll(), /getAll setup failure/);
    await assert.rejects(harness({ abort: true }).api.exportAll(), /snapshot abort/);
  });
  await test("export remains pending until the complete transaction finishes", async () => {
    const h = harness({ hold: true }); let settled = false;
    const pending = h.api.exportAll().then(value => { settled = true; return value; });
    await new Promise(setImmediate); assert.equal(settled, false);
    h.release(); await pending; assert.equal(settled, true);
  });
  console.log(`${passed} backup snapshot checks passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
