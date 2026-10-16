/* Prism RP — опыт персонажа (Experience).
   Запись = свидетельство прошлого, а не инструкция.

   Канон (этап 1):
   • Каждый чат — отдельный мир. Опыт принадлежит чату: record.chatId === chat.id.
     Одна и та же карточка в другом чате этот опыт не видит.
   • Внутри чата опыт подчиняется веткам так же, как сцена:
       – source.messageIds пуст → запись «на весь чат», видна во всех ветках;
       – иначе запись видна, только если ВСЕ её сообщения лежат на активном пути,
         и (если записан source.swipes) у них активен тот же вариант ответа.
     Скрытые записи не удаляются: вернулись в ветку — запись снова видна.
   • Записи без надёжной привязки к чату (старые данные) не угадываются:
     они помечаются legacyUnscoped, хранятся целиком и в Prism не попадают,
     пока пользователь сам не привяжет их к чату.

   Отбор: входит только запись, совпавшая по теме с происходящим. Среди подходящих порядок:
   тема → участники → важность → свежесть (только при равенстве). Важность не создаёт
   релевантность; знак события (valence) — метаданные и отбор не запускает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const BR = PRP.branch || (typeof require !== "undefined" ? require("../chat/branch.js") : null);

  function blank(ownerId, chatId) {
    return {
      id: null,
      chatId: chatId || null,
      owner: ownerId || null,
      witnesses: [],
      event: "",
      interpretation: "",
      consequences: "",
      domains: [],
      about: [],
      valence: 0,
      weight: 1,
      source: { chatId: chatId || null, messageIds: [], swipes: {}, sceneTime: "" },
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /* ── Канон: чат и ветка ─────────────────────────────────────────────── */

  // "branch" — привязана к сообщениям; "chat" — на весь чат; "legacy" — без надёжного чата.
  function scopeOf(r) {
    if (!r || r.legacyUnscoped || !r.chatId) return "legacy";
    return (r.source && r.source.messageIds && r.source.messageIds.length) ? "branch" : "chat";
  }

  /* ctx: { chatId, path: [{id, swipeIdx}] } — активный путь текущего чата.
     → { visible, reason } */
  function visibility(r, ctx) {
    const c = ctx || {};
    if (!r) return { visible: false, reason: "нет записи" };
    const scope = scopeOf(r);
    if (scope === "legacy") return { visible: false, reason: "не привязана к чату" };
    if (r.chatId !== c.chatId) return { visible: false, reason: "другой чат" };
    if (scope === "chat") return { visible: true, reason: "на весь чат" };
    // Правило ветки — общее с наложением мира на чат (chat/branch.js).
    const v = BR.visibleOnPath(r.source, c.path);
    return { visible: v.visible, reason: v.reason };
  }

  /* Миграция старых записей. Чистая функция, идемпотентна.
     lookup.messageChat(id) → chatId сообщения или null (если сообщения нет).
     → { records: [новые объекты], changed: [id], legacy: число } */
  function migrate(records, lookup) {
    const L = lookup || {};
    const out = [], changed = [];
    let legacy = 0;
    for (const r0 of records || []) {
      const r = JSON.parse(JSON.stringify(r0));
      r.source = r.source || {};
      if (!Array.isArray(r.source.messageIds)) r.source.messageIds = [];
      let chatId = r.chatId || null;
      if (!chatId && r.source.chatId) chatId = r.source.chatId;
      if (!chatId && r.source.messageIds.length && L.messageChat) {
        const chats = new Set(r.source.messageIds.map((id) => L.messageChat(id)));
        // Только однозначно: все сообщения найдены и все из одного чата.
        if (chats.size === 1 && !chats.has(null) && !chats.has(undefined)) chatId = [...chats][0];
      }
      if (chatId) {
        if (r.chatId !== chatId || r.legacyUnscoped) {
          r.chatId = chatId;
          delete r.legacyUnscoped;
          if (!r.source.chatId) r.source.chatId = chatId;
          changed.push(r.id);
        }
      } else {
        legacy++;
        if (!r.legacyUnscoped || r.chatId) { r.legacyUnscoped = true; r.chatId = null; changed.push(r.id); }
      }
      out.push(r);
    }
    return { records: out, changed, legacy };
  }

  // Ручная привязка старой записи к чату. Происхождение сохраняется в source.originMessageIds;
  // запись становится «на весь чат», потому что её сообщения этому чату не принадлежат.
  function assignToChat(r0, chatId) {
    const r = JSON.parse(JSON.stringify(r0));
    r.source = r.source || {};
    if ((r.source.messageIds || []).length) r.source.originMessageIds = r.source.messageIds.slice();
    r.source.messageIds = [];
    r.source.swipes = {};
    r.source.assignedManually = true;
    r.chatId = chatId;
    delete r.legacyUnscoped;
    return r;
  }

  /* ── Отбор по теме ───────────────────────────────────────────────────── */

  function stem(w) {
    w = String(w || "").toLowerCase().trim();
    return w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w;
  }
  function tokens(text) {
    return String(text || "").toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) || [];
  }
  // Словарь контекста: уникальные слова без имён участников.
  function contextVocab(text, names) {
    const skip = new Set();
    for (const n of names || []) tokens(n).forEach((t) => skip.add(t));
    const set = new Set();
    for (const t of tokens(text)) if (t.length >= 3 && !skip.has(t)) set.add(t);
    return { words: [...set], skip };
  }
  // Тема (домен) совпала, если каждое её слово (по основе) встречается в контексте.
  function domainHit(domain, vocab) {
    const parts = tokens(domain).filter((t) => t.length >= 3 && !vocab.skip.has(t));
    if (!parts.length) return false;
    return parts.every((p) => { const s = stem(p); return vocab.words.some((w) => w.startsWith(s)); });
  }

  // Числа отбора для одной записи.
  function relevance(r, ctx, vocab) {
    const doms = [...new Set((r.domains || []).map((d) => String(d).toLowerCase().trim()).filter(Boolean))];
    const domainHits = doms.filter((d) => domainHit(d, vocab)).length;
    // Слабый запасной сигнал: длинные слова самого события, если темы не заданы или не совпали.
    let wordHits = 0;
    if (!domainHits) {
      const ev = new Set(tokens(r.event).filter((t) => t.length >= 5 && !vocab.skip.has(t)).map(stem));
      for (const s of ev) if (vocab.words.some((w) => w.startsWith(s))) wordHits++;
    }
    const topic = domainHits + 0.25 * Math.min(wordHits, 3);
    const present = new Set(ctx.present || []);
    const participant = (r.about || []).some((a) => present.has(a)) ? 1 : 0;
    return { topic, domainHits, wordHits, participant, weight: Number(r.weight) || 1 };
  }


  /* records: все записи; ctx: { chatId, path, present: [ids], text, names: [имена], limit, ownerId? }
     → { selected: [записи в хронологическом порядке], debug: [строки отбора] } */
  function rank(records, ctx) {
    const c = ctx || {};
    const limit = c.limit != null ? c.limit : 8;
    const vocab = contextVocab(c.text, c.names);
    const rows = [];
    for (const r of records || []) {
      if (c.ownerId && r.owner && r.owner !== c.ownerId) continue;
      const vis = visibility(r, c);
      const inChat = r.chatId === c.chatId && scopeOf(r) !== "legacy";
      if (!inChat) continue; // чужие чаты и непривязанные записи даже не показываем в отладке
      const rel = relevance(r, c, vocab);
      // Релевантность решает, может ли запись войти; важность лишь упорядочивает подходящие.
      const eligible = vis.visible && r.status === "active" && rel.topic > 0;
      rows.push({ r, visible: vis.visible, reason: vis.reason, active: r.status === "active", eligible, ...rel, recencyRank: 0, selected: false });
    }
    // Свежесть: ранг среди записей чата (1 — самая новая). Только для разрешения равенства.
    rows.slice().sort((a, b) => (b.r.createdAt || 0) - (a.r.createdAt || 0)).forEach((x, i) => { x.recencyRank = i + 1; });
    const cmp = (a, b) => (b.topic - a.topic) || (b.participant - a.participant) || (b.weight - a.weight) || (a.recencyRank - b.recencyRank);
    const pool = rows.filter((x) => x.eligible).sort(cmp);
    pool.slice(0, limit).forEach((x, i) => { x.selected = true; x.priority = i + 1; });
    const selectedRows = pool.filter((x) => x.selected);
    return {
      // Порядок важности (priority) нужен сборщику: при нехватке места уходят последние.
      ranked: selectedRows.map((x) => x.r),
      // Хронологический порядок читается моделью как история, а не как рейтинг.
      selected: selectedRows.map((x) => x.r).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      debug: rows.sort((a, b) => (b.selected - a.selected) || cmp(a, b)).map((x) => ({
        id: x.r.id, event: x.r.event, topic: x.topic, domainHits: x.domainHits, wordHits: x.wordHits, participant: x.participant,
        weight: x.weight, recencyRank: x.recencyRank, visible: x.visible, reason: x.reason, active: x.active, selected: x.selected, priority: x.priority || null,
      })),
      visibleCount: rows.filter((x) => x.visible && x.active).length,
    };
  }

  // Совместимость: только список в хронологическом порядке.
  function select(records, ctx) { return rank(records, ctx).selected; }

  function formatOne(r) {
    const parts = ["— " + (r.source && r.source.sceneTime ? `[${r.source.sceneTime}] ` : "") + String(r.event || "").trim()];
    if (r.interpretation) parts.push("  тогда понял(а) это так: " + r.interpretation.trim());
    if (r.consequences) parts.push("  последствия: " + r.consequences.trim());
    return parts.join("\n");
  }
  function format(list) { return (list || []).map(formatOne).join("\n"); }

  PRP.experience = { blank, scopeOf, visibility, migrate, assignToChat, rank, select, format, formatOne, tokens, stem };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.experience;
})(typeof window !== "undefined" ? window : globalThis);
