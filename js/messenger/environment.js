/* Prism RP — среда переписки (Messenger Environment): текущее положение персонажа (WORLD). Чистый модуль.

   Одна запись на чат-переписку:
     { schema, chatId, timeZone, timeMode: "live" | "manual", manualNow, events, conversationEvents, createdAt, updatedAt }
   events — только добавляемые события среды; итоговое «текущее положение» не хранится, а каждый раз
   собирается по активной ветке (resolveWorld). conversationEvents — явные договорённости (messenger/conversation).

   Событие среды: { id, scope: "chat" | "branch", patch, provenance, effectiveAt, note, createdAt }
     patch: { location?, activity?, nearby?, ongoing?, availability? }
       ключ не указан — значение не меняется; null, "" или [] — очищается (становится неизвестным/пустым).
     availability: "available" | "busy" | "away" | "unknown" — контекст для Prism, не запрет отвечать.
     provenance ветки — chat/branch.anchorOf (все сообщения ветки и их варианты); у события «на весь чат» — null.
     effectiveAt — с какого момента времени переписки событие действует (ISO); позже «сейчас» — ещё не наступило.
   Среда — текущие обстоятельства, а не факт мира, не сцена RP и не опыт. Из текста ответов она не выводится.
   Время само ничего не меняет: без событий положение остаётся неизвестным.
   Без DOM, хранилища, сети, таймеров и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const BR = PRP.branch || (typeof require !== "undefined" ? require("../chat/branch.js") : null);
  const MT = PRP.messengerTime || (typeof require !== "undefined" ? require("./time.js") : null);

  const SCHEMA = 1;
  const AVAIL = ["available", "busy", "away", "unknown"];
  const STR_KEYS = ["location", "activity"];
  const LIST_KEYS = ["nearby", "ongoing"];
  const KEYS = STR_KEYS.concat(LIST_KEYS, ["availability"]);

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (v == null ? "" : String(v));
  const strList = (v) => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : []);
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  function emptyWorld() { return { location: null, activity: null, nearby: [], ongoing: [], availability: "unknown" }; }

  function blank(chatId, setup) {
    const s = setup || {};
    const now = Date.now();
    const tz = MT.validTimeZone(s.timeZone) ? s.timeZone : MT.systemTimeZone();
    const manual = s.timeMode === "manual";
    return { schema: SCHEMA, chatId: str(chatId), timeZone: tz, timeMode: manual ? "manual" : "live",
      manualNow: manual ? (MT.toIso(MT.toMs(s.manualNow)) || null) : null, events: [], conversationEvents: [], createdAt: now, updatedAt: now };
  }
  // Канонический вид записи. События копируются как есть: битые видны в отчёте и не применяются.
  function normalize(o, chatId) {
    const x = isObj(o) ? o : {};
    return {
      schema: SCHEMA, chatId: str(x.chatId || chatId),
      timeZone: MT.validTimeZone(x.timeZone) ? x.timeZone : MT.DEFAULT_TZ,
      timeMode: x.timeMode === "manual" ? "manual" : "live",
      manualNow: x.timeMode === "manual" ? (MT.toIso(MT.toMs(x.manualNow)) || null) : null,
      events: Array.isArray(x.events) ? clone(x.events) : [],
      conversationEvents: Array.isArray(x.conversationEvents) ? clone(x.conversationEvents) : [],
      createdAt: x.createdAt || Date.now(), updatedAt: x.updatedAt || Date.now(),
    };
  }

  /* Черновик правки → патч: только явно указанные ключи; null/""/[] — очистить. */
  function makePatch(p) {
    const x = isObj(p) ? p : {};
    const out = {};
    for (const k of STR_KEYS) if (k in x) out[k] = x[k] == null || !str(x[k]).trim() ? null : str(x[k]).trim();
    for (const k of LIST_KEYS) if (k in x) { const l = x[k] == null ? [] : strList(x[k]); out[k] = l.length ? l : null; }
    if ("availability" in x) out.availability = x.availability == null || x.availability === "" ? null : str(x.availability);
    return out;
  }
  function makeEvent(d) {
    const x = isObj(d) ? d : {};
    const scope = str(x.scope);
    const a = isObj(x.anchor) ? x.anchor : null;
    return {
      id: str(x.id).trim() || uid("me"), scope, patch: makePatch(x.patch),
      provenance: scope === "branch" && a ? { anchorId: str(a.anchorId), messageIds: strList(a.messageIds), swipes: Object.assign({}, a.swipes || {}) } : null,
      effectiveAt: MT.toIso(MT.toMs(x.effectiveAt)) || null, note: str(x.note).trim(), createdAt: Number(x.createdAt) || Date.now(),
    };
  }

  const issue = (level, code, message, ref) => Object.assign({ level, code, message }, ref != null ? { ref: String(ref) } : {});
  const hasErrors = (xs) => (xs || []).some((x) => x.level === "error");

  // Привязка: ветка — непустой список сообщений; весь чат — без привязки. Общая проверка для событий среды и договорённостей.
  function checkScope(e, out, id) {
    if (!["chat", "branch"].includes(e.scope)) out.push(issue("error", "scope", `Неизвестная область: ${str(e.scope) || "(пусто)"}.`, id));
    if (e.scope === "branch") {
      const p = e.provenance;
      if (!isObj(p) || !Array.isArray(p.messageIds) || !p.messageIds.length || (p.swipes != null && !isObj(p.swipes)))
        out.push(issue("error", "branch-no-provenance", "Нельзя привязать к ветке: в переписке ещё нет сообщений или привязка повреждена. Выберите «во всей переписке» явно.", id));
    }
    if (e.scope === "chat" && e.provenance != null) out.push(issue("error", "chat-provenance", "Событие на всю переписку не привязывается к сообщениям.", id));
  }

  function validateEvent(e) {
    const out = [];
    if (!isObj(e)) return [issue("error", "event-malformed", "Событие среды не является объектом.")];
    const id = str(e.id).trim();
    if (!id) out.push(issue("error", "event-no-id", "У события среды нет id."));
    checkScope(e, out, id);
    const p = e.patch;
    if (!isObj(p) || !Object.keys(p).length) out.push(issue("error", "event-empty", "Событие ничего не меняет.", id));
    else {
      for (const k of Object.keys(p)) if (!KEYS.includes(k)) out.push(issue("error", "event-key", `Неизвестное поле среды: ${k}.`, id));
      for (const k of STR_KEYS) if (p[k] !== undefined && p[k] !== null && typeof p[k] !== "string") out.push(issue("error", "event-type", `Поле ${k} должно быть строкой.`, id));
      for (const k of LIST_KEYS) if (p[k] !== undefined && p[k] !== null && !Array.isArray(p[k])) out.push(issue("error", "event-type", `Поле ${k} должно быть списком.`, id));
      if (p.availability !== undefined && p.availability !== null && !AVAIL.includes(p.availability)) out.push(issue("error", "event-availability", `Неизвестная доступность: ${p.availability}.`, id));
    }
    if (e.effectiveAt != null && MT.toMs(e.effectiveAt) == null) out.push(issue("error", "event-time", "Неверное время события.", id));
    return out;
  }

  /* Запись (например, из бэкапа): ошибки — только для самой записи; битые события — предупреждения. */
  function validateRecord(o) {
    if (!isObj(o)) return [issue("error", "env-malformed", "Среда переписки не является объектом.")];
    const out = [];
    if (!str(o.chatId).trim()) out.push(issue("error", "env-no-chat", "Среда переписки не привязана к чату."));
    if (o.events != null && !Array.isArray(o.events)) out.push(issue("error", "env-events", "Поле events должно быть списком."));
    if (o.conversationEvents != null && !Array.isArray(o.conversationEvents)) out.push(issue("error", "env-events", "Поле conversationEvents должно быть списком."));
    if (o.timeMode === "manual" && o.manualNow != null && MT.toMs(o.manualNow) == null) out.push(issue("warning", "env-manual-time", "Неверное время ручного режима."));
    (Array.isArray(o.events) ? o.events : []).forEach((e, i) => { for (const x of validateEvent(e)) out.push(issue("warning", x.code, `Событие №${i + 1}: ${x.message}`, x.ref)); });
    return out;
  }

  /* Видимость и порядок событий с привязкой. Порядок: «на весь чат» (effectiveAt → createdAt → id) — базовый слой;
     затем события видимой ветки в порядке повествования (глубина привязки → effectiveAt → createdAt → id).
     → { active: [{ e, row }], rows, warnings } */
  function order(list, path, nowMs, validate) {
    const rows = [], warnings = [], chat = [], branch = [];
    (list || []).forEach((e, i) => {
      const row = { index: i, id: e && e.id, scope: e && e.scope, effectiveAt: e && e.effectiveAt || null, createdAt: e && e.createdAt, active: false, code: "", reason: "" };
      rows.push(row);
      const errs = validate(e).filter((x) => x.level === "error");
      if (errs.length) {
        row.code = "malformed"; row.reason = errs.map((x) => x.message).join(" ");
        warnings.push({ level: "warning", code: "event-malformed", message: `Событие ${row.id || "№" + (i + 1)} повреждено и не применяется: ${row.reason}`, ref: row.id || String(i) });
        return;
      }
      const at = MT.toMs(e.effectiveAt);
      if (at != null && nowMs != null && at > nowMs) { row.code = "pending"; row.reason = "ещё не наступило"; return; }
      if (e.scope === "chat") { row.active = true; row.code = "chat"; row.reason = "во всей переписке"; chat.push({ e, row, at }); return; }
      const v = BR.visibleOnPath(e.provenance, path);
      row.code = v.code; row.reason = v.reason;
      if (!v.visible) return;
      row.active = true; row.depth = BR.depthOf(e.provenance, path);
      branch.push({ e, row, at });
    });
    const byTime = (a, b) => ((a.at == null ? -Infinity : a.at) - (b.at == null ? -Infinity : b.at)) || ((a.e.createdAt || 0) - (b.e.createdAt || 0)) || String(a.e.id).localeCompare(String(b.e.id));
    chat.sort(byTime);
    branch.sort((a, b) => (a.row.depth - b.row.depth) || byTime(a, b));
    return { active: chat.concat(branch), rows, warnings };
  }

  /* Текущее положение по активной ветке и моменту времени. Входные данные не меняются.
     record — запись среды (или null); c: { path: [{ id, swipeIdx }], now: мс | null }
     → { world, activeEvents, inactiveEvents, events, warnings } */
  function resolveWorld(record, c) {
    const cx = c || {};
    const world = emptyWorld();
    const o = order(record && Array.isArray(record.events) ? record.events : [], cx.path, cx.now, validateEvent);
    for (const { e } of o.active) {
      const p = e.patch;
      for (const k of STR_KEYS) if (k in p) world[k] = p[k] == null || !String(p[k]).trim() ? null : String(p[k]);
      for (const k of LIST_KEYS) if (k in p) world[k] = Array.isArray(p[k]) ? p[k].slice() : [];
      if ("availability" in p) world.availability = p.availability || "unknown";
    }
    return { world, activeEvents: o.rows.filter((r) => r.active), inactiveEvents: o.rows.filter((r) => !r.active), events: o.rows, warnings: o.warnings };
  }

  PRP.messengerEnv = { SCHEMA, AVAIL, KEYS, emptyWorld, blank, normalize, makePatch, makeEvent, validateEvent, validateRecord, checkScope, order, resolveWorld, hasErrors };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.messengerEnv;
})(typeof window !== "undefined" ? window : globalThis);
