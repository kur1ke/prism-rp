/* Prism RP — ссылочная целостность бэкапа перед восстановлением (FOUNDATION-H). Чистый модуль.

   Проверка идёт ДО записи; ничего не переназначается и не угадывается. Отклоняются:
     • повторы id внутри одной коллекции бэкапа — все записи с этим id (нет «побеждает последняя»);
     • чат без своего персонажа (chat.cardId);
     • сообщение и картинка без своего чата;
     • опыт без своего персонажа (owner); опыт, привязанный к чату (chatId), — без этого чата;
       старый опыт без чата (legacy) проверяется только по персонажу;
     • линза без своего персонажа или пака; две линзы одного персонажа (в бэкапе или вместе с уже существующей).
   Что считается существующим: при замене — только то, что есть в бэкапе (остальное будет удалено);
   при добавлении — бэкап и то, что уже есть здесь (existing).
   Мир чата и среда переписки проверяются своими сервисами по уже проверенному списку чатов
   (world/overlay-service.checkBackup, messenger/service.checkBackup); режимы чатов — chat/service.checkBackupChats.
   Без DOM, хранилища, сети и S.

   data — объект бэкапа; opts: { replace, existing: { cards: [id], chats: [id], packs: [id], lenses: [{ id, cardId }] } }
   → { data (отфильтрованная копия), rejected: { store: число }, issues: [{ level, code, message, store, id }] } */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const ID_STORES = ["cards", "chats", "messages", "experience", "images", "assist", "worldPacks", "worldLenses", "memories", "reflections"];
  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const sid = (v) => (v == null ? "" : String(v));

  function check(data, opts) {
    const o = opts || {};
    const replace = o.replace !== false;
    const ex = o.existing || {};
    if (!isObj(data)) return { data, rejected: {}, issues: [] };
    const out = Object.assign({}, data);
    const issues = [], rejected = {};
    const reject = (store, id, code, message) => { rejected[store] = (rejected[store] || 0) + 1; issues.push({ level: "error", code, message, store, id: sid(id) }); };

    // 1. Повторы id и битые записи.
    for (const st of ID_STORES.concat(["settings"])) {
      if (!Array.isArray(data[st])) continue;
      const key = st === "settings" ? "key" : "id";
      const count = new Map();
      for (const r of data[st]) if (isObj(r) && sid(r[key])) count.set(sid(r[key]), (count.get(sid(r[key])) || 0) + 1);
      out[st] = data[st].filter((r) => {
        if (!isObj(r) || !sid(r[key])) { reject(st, "", "record-malformed", "Запись без id не восстановлена."); return false; }
        if (count.get(sid(r[key])) > 1) { reject(st, r[key], "duplicate-id", "В бэкапе несколько записей с одним id — ни одна не восстановлена."); return false; }
        return true;
      });
    }
    const ids = (st, extra) => new Set((Array.isArray(out[st]) ? out[st].map((r) => sid(r.id)) : []).concat(replace ? [] : (extra || []).map(sid)));

    // 2. Персонажи и паки → линзы и чаты.
    const cards = ids("cards", ex.cards), packs = ids("worldPacks", ex.packs);
    if (Array.isArray(out.worldLenses)) {
      const perCard = new Map();
      for (const l of out.worldLenses) perCard.set(sid(l.cardId), (perCard.get(sid(l.cardId)) || 0) + 1);
      const localLens = new Map(replace ? [] : (ex.lenses || []).map((l) => [sid(l.cardId), sid(l.id)]));
      out.worldLenses = out.worldLenses.filter((l) => {
        if (!cards.has(sid(l.cardId))) { reject("worldLenses", l.id, "lens-orphan-card", "Линза относится к персонажу, которого нет."); return false; }
        if (!packs.has(sid(l.packId))) { reject("worldLenses", l.id, "lens-orphan-pack", "Линза относится к паку мира, которого нет."); return false; }
        if (perCard.get(sid(l.cardId)) > 1) { reject("worldLenses", l.id, "lens-duplicate-card", "В бэкапе несколько линз одного персонажа — ни одна не восстановлена."); return false; }
        if (localLens.has(sid(l.cardId)) && localLens.get(sid(l.cardId)) !== sid(l.id)) { reject("worldLenses", l.id, "lens-duplicate-card", "У этого персонажа здесь уже есть другая линза — линза из бэкапа не восстановлена."); return false; }
        return true;
      });
    }
    if (Array.isArray(out.chats)) out.chats = out.chats.filter((c) => {
      if (!cards.has(sid(c.cardId))) { reject("chats", c.id, "chat-orphan-card", "Чат относится к персонажу, которого нет."); return false; }
      return true;
    });

    // 3. Чаты → сообщения, картинки, опыт.
    const chats = ids("chats", ex.chats);
    const byChat = (st, code, what) => {
      if (!Array.isArray(out[st])) return;
      out[st] = out[st].filter((r) => {
        if (!chats.has(sid(r.chatId))) { reject(st, r.id, code, `${what} относится к чату, которого нет.`); return false; }
        return true;
      });
    };
    byChat("messages", "message-orphan-chat", "Сообщение");
    byChat("images", "image-orphan-chat", "Картинка");
    byChat("memories", "memory-orphan-chat", "Воспоминание");
    byChat("reflections", "reflection-orphan-chat", "Осмысление");
    if (Array.isArray(out.experience)) out.experience = out.experience.filter((r) => {
      if (!cards.has(sid(r.owner))) { reject("experience", r.id, "experience-orphan-card", "Запись опыта относится к персонажу, которого нет."); return false; }
      if (r.chatId != null && r.chatId !== "" && !chats.has(sid(r.chatId))) { reject("experience", r.id, "experience-orphan-chat", "Запись опыта относится к чату, которого нет."); return false; }
      return true;
    });
    return { data: out, rejected, issues };
  }

  const total = (rejected) => Object.values(rejected || {}).reduce((a, b) => a + b, 0);

  PRP.backup = { check, total, ID_STORES };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.backup;
})(typeof window !== "undefined" ? window : globalThis);
