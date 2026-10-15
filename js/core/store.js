/* Prism RP — хранилище в IndexedDB. Всё хранится локально в браузере;
   бэкап — один JSON со всеми коллекциями. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const DB_NAME = "prism-rp";
  const DB_VERSION = 2;
  const STORES = ["cards", "chats", "messages", "experience", "settings", "images"];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
        if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" }).createIndex("cardId", "cardId");
        if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" }).createIndex("chatId", "chatId");
        if (!db.objectStoreNames.contains("experience")) db.createObjectStore("experience", { keyPath: "id" }).createIndex("owner", "owner");
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
        // v2: картинки отдельно от сообщений, чтобы правка текста не переписывала мегабайты.
        if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "id" }).createIndex("chatId", "chatId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("База занята другой вкладкой"));
    });
    return dbPromise;
  }

  function wrap(req) {
    return new Promise((ok, fail) => { req.onsuccess = () => ok(req.result); req.onerror = () => fail(req.error); });
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((ok, fail) => {
      const t = db.transaction(store, mode);
      let result;
      Promise.resolve(fn(t.objectStore(store))).then((r) => { result = r; }, fail);
      t.oncomplete = () => ok(result);
      t.onerror = () => fail(t.error);
      t.onabort = () => fail(t.error || new Error("Транзакция прервана"));
    });
  }

  const api = {
    get: (store, id) => tx(store, "readonly", (s) => wrap(s.get(id))),
    all: (store) => tx(store, "readonly", (s) => wrap(s.getAll())),
    byIndex: (store, index, value) => tx(store, "readonly", (s) => wrap(s.index(index).getAll(value))),
    put: (store, obj) => {
      if (store !== "settings") obj.updatedAt = Date.now();
      return tx(store, "readwrite", (s) => wrap(s.put(obj))).then(() => obj);
    },
    putMany: (store, list) => tx(store, "readwrite", (s) => Promise.all(list.map((o) => wrap(s.put(o))))),
    del: (store, id) => tx(store, "readwrite", (s) => wrap(s.delete(id))),
    delMany: (store, ids) => tx(store, "readwrite", (s) => Promise.all(ids.map((id) => wrap(s.delete(id))))),

    async getSetting(key, fallback) {
      const r = await api.get("settings", key);
      return r ? r.value : fallback;
    },
    setSetting: (key, value) => api.put("settings", { key, value }),

    async exportAll(opts) {
      const out = { app: "prism-rp", version: 2, exportedAt: new Date().toISOString() };
      for (const s of STORES) if (!(opts && opts.noImages && s === "images")) out[s] = await api.all(s);
      return out;
    },
    // replace=true очищает коллекции перед загрузкой
    async importAll(data, replace) {
      if (!data || data.app !== "prism-rp") throw new Error("Это не бэкап Prism RP");
      for (const s of STORES) {
        if (!Array.isArray(data[s])) continue;
        if (replace) await tx(s, "readwrite", (st) => wrap(st.clear()));
        await api.putMany(s, data[s]);
      }
    },
  };

  PRP.store = api;
})(typeof window !== "undefined" ? window : globalThis);
