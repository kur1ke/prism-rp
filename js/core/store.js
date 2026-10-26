/* Prism RP — хранилище в IndexedDB. Всё хранится локально в браузере;
   бэкап — один JSON со всеми коллекциями.

   Жизненный цикл соединения (без удаления и сброса данных):
     • открытое соединение уступает обновлению схемы: на versionchange (другая вкладка открывает
       более новую версию) оно сразу закрывается, а кэш соединения сбрасывается — старая вкладка
       не держит базу;
     • обновление, которое держит другая вкладка, завершается ошибкой с кодом DB_BLOCKED;
     • если открытие не ответило ни успехом, ни ошибкой, ни «занято» за OPEN_TIMEOUT_MS —
       ошибка DB_OPEN_TIMEOUT; прочие ошибки — DB_OPEN_FAILED;
     • неудачное открытие не кэшируется: следующая попытка открывает базу заново;
       соединение, открывшееся уже после отказа, сразу закрывается (лишних соединений нет). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  // Тестовый загрузчик выбирает отдельную IndexedDB до подключения приложения.
  const DB_NAME = root.__PRP_TEST_MIRROR === true ? "prism-rp-testing" : "prism-rp";
  const DB_VERSION = 7;
  const STORES = ["cards", "chats", "messages", "experience", "settings", "images", "assist", "worldPacks", "worldLenses", "worldOverlays", "messengerEnvironments", "memories", "reflections"];
  // Время ожидания открытия базы. Для тестов можно задать window.__PRP_DB_OPEN_TIMEOUT_MS до загрузки приложения.
  const OPEN_TIMEOUT_MS = 7000;
  let dbPromise = null;

  function dbError(code, message, cause) {
    const e = new Error(message);
    e.code = code;
    if (cause) e.cause = cause;
    return e;
  }
  const BUSY = "База Prism RP занята другой вкладкой. Закройте другие вкладки Prism RP и обновите эту страницу.";

  function open() {
    if (dbPromise) return dbPromise;
    const timeoutMs = Number(root.__PRP_DB_OPEN_TIMEOUT_MS) > 0 ? Number(root.__PRP_DB_OPEN_TIMEOUT_MS) : OPEN_TIMEOUT_MS;
    const p = new Promise((resolve, reject) => {
      let settled = false, timer = null;
      const finish = (fn, v) => { if (settled) return false; settled = true; clearTimeout(timer); fn(v); return true; };
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { finish(reject, dbError("DB_OPEN_FAILED", "Не удалось открыть базу Prism RP: " + (e.message || e), e)); return; }
      timer = setTimeout(() => finish(reject, dbError("DB_OPEN_TIMEOUT", "Не удалось открыть базу Prism RP: браузер не ответил. " + BUSY)), timeoutMs);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
        if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" }).createIndex("cardId", "cardId");
        if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" }).createIndex("chatId", "chatId");
        if (!db.objectStoreNames.contains("experience")) db.createObjectStore("experience", { keyPath: "id" }).createIndex("owner", "owner");
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
        // v2: картинки отдельно от сообщений, чтобы правка текста не переписывала мегабайты.
        if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "id" }).createIndex("chatId", "chatId");
        // v3: разговоры с ассистентом (вне ролевой игры), сообщения хранятся внутри разговора.
        if (!db.objectStoreNames.contains("assist")) db.createObjectStore("assist", { keyPath: "id" });
        // v4: общие паки мира и линзы персонажей (FOUNDATION-W1). Только добавление коллекций — старые данные не трогаются.
        if (!db.objectStoreNames.contains("worldPacks")) db.createObjectStore("worldPacks", { keyPath: "id" });
        if (!db.objectStoreNames.contains("worldLenses")) {
          const l = db.createObjectStore("worldLenses", { keyPath: "id" });
          // Одна линза на персонажа — ограничение схемы, а не договорённость: вторую запись с тем же cardId база отклонит.
          l.createIndex("cardId", "cardId", { unique: true });
          l.createIndex("packId", "packId");
        }
        // v5: наложение мира на чат (FOUNDATION-W2), одна запись на чат. Только добавление коллекции — данные W1 и прочие не трогаются.
        if (!db.objectStoreNames.contains("worldOverlays")) db.createObjectStore("worldOverlays", { keyPath: "chatId" });
        // v6: среда переписки (FOUNDATION-C), одна запись на чат-переписку. Только добавление коллекции.
        if (!db.objectStoreNames.contains("messengerEnvironments")) db.createObjectStore("messengerEnvironments", { keyPath: "chatId" });
        // v7: Memory (episodic evidence) and Experience (reflective interpretations) are separate stores.
        if (!db.objectStoreNames.contains("memories")) db.createObjectStore("memories", { keyPath: "id" }).createIndex("chatId", "chatId");
        if (!db.objectStoreNames.contains("reflections")) db.createObjectStore("reflections", { keyPath: "id" }).createIndex("chatId", "chatId");
      };
      req.onsuccess = () => {
        const db = req.result;
        // Старая вкладка уступает обновлению схемы в другой вкладке: закрыть соединение и забыть кэш.
        db.onversionchange = () => {
          db.close();
          if (dbPromise === p) dbPromise = null;
          if (typeof api.onVersionChange === "function") { try { api.onVersionChange(); } catch (e) { /* только уведомление */ } }
        };
        // Открылось уже после отказа (DB_BLOCKED / DB_OPEN_TIMEOUT) — не оставлять лишнее соединение.
        if (!finish(resolve, db)) db.close();
      };
      req.onerror = () => finish(reject, dbError("DB_OPEN_FAILED", "Не удалось открыть базу Prism RP: " + ((req.error && req.error.message) || "ошибка браузера"), req.error));
      req.onblocked = () => finish(reject, dbError("DB_BLOCKED", BUSY));
    });
    dbPromise = p;
    // Отказ не кэшируется: следующая попытка (например, после закрытия другой вкладки) откроет базу заново.
    p.catch(() => { if (dbPromise === p) dbPromise = null; });
    return p;
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
    // Уведомление для интерфейса: соединение закрыто, потому что другая вкладка обновляет базу.
    onVersionChange: null,
    get: (store, id) => tx(store, "readonly", (s) => wrap(s.get(id))),
    all: (store) => tx(store, "readonly", (s) => wrap(s.getAll())),
    byIndex: (store, index, value) => tx(store, "readonly", (s) => wrap(s.index(index).getAll(value))),
    put: (store, obj) => {
      if (store !== "settings") obj.updatedAt = Date.now();
      return tx(store, "readwrite", (s) => wrap(s.put(obj))).then(() => obj);
    },
    putMany: (store, list) => tx(store, "readwrite", (s) => Promise.all(list.map((o) => wrap(s.put(o))))),
    /* Несколько записей в РАЗНЫЕ коллекции одной транзакцией: всё или ничего (FOUNDATION-D: сообщение + чат).
       entries: [[store, obj], …]. Запросы ставятся синхронно; успех — по oncomplete; ошибка запроса или исключение
       при постановке — abort, ни одна запись не остаётся. updatedAt — как у put (кроме настроек). */
    async putAll(entries) {
      const list = (entries || []).filter((e) => e && e[0] && e[1]);
      if (!list.length) return;
      const db = await open();
      const names = [...new Set(list.map((e) => e[0]))];
      return new Promise((ok, fail) => {
        let t;
        try { t = db.transaction(names, "readwrite"); } catch (e) { fail(e); return; }
        let failure = null;
        t.oncomplete = () => ok();
        t.onerror = () => { if (!failure) failure = t.error; };
        t.onabort = () => fail(failure || t.error || new Error("Запись прервана — ничего не сохранено"));
        try {
          for (const [st, obj] of list) {
            if (st !== "settings") obj.updatedAt = Date.now();
            const req = t.objectStore(st).put(obj);
            req.onerror = () => { failure = failure || req.error; };
          }
        } catch (e) { failure = e; try { t.abort(); } catch (_) { /* уже прервана */ } }
      });
    },
    del: (store, id) => tx(store, "readwrite", (s) => wrap(s.delete(id))),
    delMany: (store, ids) => tx(store, "readwrite", (s) => Promise.all(ids.map((id) => wrap(s.delete(id))))),

    async getSetting(key, fallback) {
      const r = await api.get("settings", key);
      return r ? r.value : fallback;
    },
    setSetting: (key, value) => api.put("settings", { key, value }),

    async exportAll(opts) {
      const out = { app: "prism-rp", version: 7, exportedAt: new Date().toISOString() };
      for (const s of STORES) if (!(opts && opts.noImages && s === "images")) out[s] = await api.all(s);
      return out;
    },
    /* Восстановление (данные уже проверены ДО вызова: chat.checkBackupChats → core/backup.check →
       worldChat.checkBackup → messenger.checkBackup). ОДНА транзакция readwrite на ВСЕ известные коллекции:
         replace=true  — ЗАМЕНА всего набора данных Prism RP: clear() каждой коллекции и put() каждой записи бэкапа;
                         коллекции нет в бэкапе — после замены она пустая (настройки — значения по умолчанию после перезагрузки);
         replace=false — добавление: только put() записей бэкапа (поверх существующих с тем же ключом).
       Все запросы ставятся в очередь синхронно, пока транзакция активна (без await между ними — иначе она
       завершилась бы раньше времени). Успех — только по oncomplete всей транзакции. Ошибка любого запроса,
       исключение при постановке в очередь или прерывание — abort: ни одна коллекция не меняется (старые данные целы),
       промис отклоняется. Сама база не удаляется; открытие базы — тот же open() с DB_BLOCKED / таймаутом / versionchange. */
    async importAll(data, replace) {
      if (!data || data.app !== "prism-rp") throw new Error("Это не бэкап Prism RP");
      const db = await open();
      return new Promise((ok, fail) => {
        let t;
        try { t = db.transaction(STORES, "readwrite"); }
        catch (e) { fail(e); return; }
        let failure = null;
        t.oncomplete = () => ok();
        t.onerror = (ev) => { if (!failure) failure = t.error || (ev && ev.target && ev.target.error) || new Error("Ошибка записи бэкапа"); };
        t.onabort = () => fail(failure || t.error || new Error("Восстановление прервано — данные не изменены"));
        try {
          for (const s of STORES) {
            const st = t.objectStore(s);
            if (replace) st.clear();
            const list = Array.isArray(data[s]) ? data[s] : [];
            for (const o of list) {
              const req = st.put(o);
              // Ошибку не гасим (без preventDefault): IndexedDB прерывает всю транзакцию, затем onabort → reject.
              req.onerror = () => { failure = failure || req.error; };
            }
          }
        } catch (e) {
          failure = e;
          try { t.abort(); } catch (_) { /* уже прервана */ }
        }
      });
    },
    STORES: STORES.slice(),
  };

  PRP.store = api;
})(typeof window !== "undefined" ? window : globalThis);
