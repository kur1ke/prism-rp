/* Prism RP — наложение мира на чат (Chat World Overlay). Чистый модуль.

   Одна запись на чат: { schema, chatId, timeline, variant, entries, createdAt, updatedAt }.
   Хранятся только события наложения, а не собранный мир: действующий мир каждый раз
   собирается заново (world/canon) из пака, линзы и этих событий.

   Событие (entry) — только добавляется; старые события не переписываются:
     • assert   — новый факт чата; получает свой постоянный id факта (fact.id), цели нет;
     • override — заменяет действующее значение известного факта по его id (targetFactId);
                  получившийся факт сохраняет id цели, у события — свой id;
     • retract  — убирает известный факт (targetFactId) из мира с этого места.
   Область (scope):
     • "branch" — привязано к активной ветке (provenance: сообщения ветки и их варианты, chat/branch.anchorOf);
     • "chat"   — на весь чат, только по явному выбору; provenance = null, без подставных сообщений.
   Отсутствие привязки никогда не превращается в «на весь чат».
   Таймлайн и вариант чата (timeline, variant) — явные селекторы отбора фактов; пусто — не выбран.
   Ничего не угадывается: ни цель по тексту, ни привязка по похожим сообщениям.
   Без DOM, хранилища, сети и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const SCHEMA = 1;
  const OPS = ["assert", "override", "retract"];
  const SCOPES = ["chat", "branch"];
  const META_LISTS = ["entities", "topics", "locations"];
  const META_STR = ["timeline", "variant"];

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (v == null ? "" : String(v));
  const strList = (v) => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : []);
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  // Селекторы и метки таймлайна/варианта сравниваются только точно, после нормализации регистра и пробелов.
  const normSel = (v) => str(v).trim().replace(/\s+/g, " ").toLowerCase();

  function blank(chatId) {
    const now = Date.now();
    return { schema: SCHEMA, chatId: str(chatId), timeline: "", variant: "", entries: [], createdAt: now, updatedAt: now };
  }

  /* Канонический вид записи. События копируются как есть: битые остаются видимыми в отчёте
     и безопасно исключаются при разрешении, но не «чинятся» молча. */
  function normalize(o, chatId) {
    const x = isObj(o) ? o : {};
    return {
      schema: SCHEMA,
      chatId: str(x.chatId || chatId),
      timeline: str(x.timeline).trim(),
      variant: str(x.variant).trim(),
      entries: Array.isArray(x.entries) ? clone(x.entries) : [],
      createdAt: x.createdAt || Date.now(),
      updatedAt: x.updatedAt || Date.now(),
    };
  }

  /* Значение факта в событии. assert — полный факт со своим id. override — текст и только заданные метаданные:
     не задано/null — наследуется у цели, задано (в том числе [] или "") — заменяет (как замены линзы, W1). */
  function factPayload(op, f) {
    const o = isObj(f) ? f : {};
    if (op === "assert") {
      return { id: str(o.id).trim() || uid("wc"), text: str(o.text), entities: strList(o.entities), topics: strList(o.topics),
        locations: strList(o.locations), timeline: str(o.timeline).trim(), variant: str(o.variant).trim() };
    }
    const out = { text: str(o.text) };
    for (const k of META_LISTS) if (Array.isArray(o[k])) out[k] = strList(o[k]);
    for (const k of META_STR) if (o[k] != null) out[k] = str(o[k]).trim();
    return out;
  }

  /* Новое событие из черновика. anchor — привязка ветки (chat/branch.anchorOf) или null.
     Область не подменяется: "branch" без привязки остаётся "branch" без привязки и не пройдёт проверку. */
  function makeEntry(d) {
    const x = isObj(d) ? d : {};
    const op = str(x.op);
    const scope = str(x.scope);
    const a = isObj(x.anchor) ? x.anchor : null;
    return {
      id: str(x.id).trim() || uid("we"),
      op,
      targetFactId: op === "assert" ? null : str(x.targetFactId).trim(),
      fact: op === "retract" ? null : factPayload(op, x.fact),
      scope,
      provenance: scope === "branch" && a ? { anchorId: str(a.anchorId), messageIds: strList(a.messageIds), swipes: Object.assign({}, a.swipes || {}) } : null,
      note: str(x.note).trim(),
      createdAt: Number(x.createdAt) || Date.now(),
    };
  }

  const issue = (level, code, message, ref) => Object.assign({ level, code, message }, ref != null ? { ref: String(ref) } : {});
  const hasErrors = (xs) => (xs || []).some((x) => x.level === "error");

  /* Проверка одного события (форма). → [issue] */
  function validateEntry(e) {
    const out = [];
    if (!isObj(e)) return [issue("error", "entry-malformed", "Событие мира не является объектом.")];
    const id = str(e.id).trim();
    if (!id) out.push(issue("error", "entry-no-id", "У события мира нет id."));
    if (!OPS.includes(e.op)) out.push(issue("error", "entry-op", `Неизвестное действие: ${str(e.op) || "(пусто)"}.`, id));
    if (!SCOPES.includes(e.scope)) out.push(issue("error", "entry-scope", `Неизвестная область: ${str(e.scope) || "(пусто)"}.`, id));
    if (e.op === "assert") {
      if (e.targetFactId) out.push(issue("error", "assert-target", "Новый факт не может ссылаться на другой факт.", id));
      if (!isObj(e.fact) || !str(e.fact.id).trim()) out.push(issue("error", "assert-no-fact-id", "У нового факта нет id.", id));
    }
    if (e.op === "override" || e.op === "retract") {
      if (!str(e.targetFactId).trim()) out.push(issue("error", "entry-no-target", "Не указан факт, к которому относится действие.", id));
    }
    if (e.op === "assert" || e.op === "override") {
      if (!isObj(e.fact)) out.push(issue("error", "entry-no-fact", "Нет значения факта.", id));
      else {
        if (typeof e.fact.text !== "string" || !e.fact.text.trim()) out.push(issue("error", "entry-empty-text", "Факт без текста.", id));
        for (const k of META_LISTS) if (e.fact[k] != null && !Array.isArray(e.fact[k])) out.push(issue("error", "entry-meta", `Поле ${k} должно быть списком.`, id));
      }
    }
    if (e.op === "retract" && e.fact != null) out.push(issue("error", "retract-fact", "Убирание факта не несёт значения.", id));
    if (e.scope === "branch") {
      const p = e.provenance;
      if (!isObj(p) || !Array.isArray(p.messageIds) || !p.messageIds.length || (p.swipes != null && !isObj(p.swipes)))
        out.push(issue("error", "branch-no-provenance", "Нельзя привязать к ветке: у чата ещё нет сообщений или привязка повреждена. Выберите «весь чат» явно или напишите первое сообщение.", id));
    }
    if (e.scope === "chat" && e.provenance != null) out.push(issue("error", "chat-provenance", "Событие на весь чат не привязывается к сообщениям.", id));
    return out;
  }

  /* Проверка нового события перед сохранением: форма + цель известна (без угадывания) + id нового факта свободен.
     known: { ids: Set — id известных фактов (действующих и убранных на этой ветке) } */
  function validateNew(e, known) {
    const out = validateEntry(e);
    const ids = (known && known.ids) || new Set();
    if ((e.op === "override" || e.op === "retract") && str(e.targetFactId).trim() && !ids.has(e.targetFactId))
      out.push(issue("error", "target-unknown", `Факта ${e.targetFactId} нет в мире этого чата на этой ветке.`, e.targetFactId));
    if (e.op === "assert" && isObj(e.fact) && ids.has(e.fact.id))
      out.push(issue("error", "assert-id-collides", `id ${e.fact.id} уже занят другим фактом.`, e.fact.id));
    return out;
  }

  /* Проверка записи наложения (например, при восстановлении бэкапа). Ошибки — только для самой записи
     (без chatId её нельзя сохранить); битые события — предупреждения: они хранятся и исключаются при разрешении. */
  function validateOverlay(o) {
    if (!isObj(o)) return [issue("error", "overlay-malformed", "Наложение мира не является объектом.")];
    const out = [];
    if (!str(o.chatId).trim()) out.push(issue("error", "overlay-no-chat", "Наложение мира не привязано к чату."));
    if (o.entries != null && !Array.isArray(o.entries)) out.push(issue("error", "overlay-entries", "Поле entries должно быть списком."));
    (Array.isArray(o.entries) ? o.entries : []).forEach((e, i) => {
      for (const x of validateEntry(e)) out.push(issue("warning", x.code, `Событие №${i + 1}: ${x.message}`, x.ref));
    });
    return out;
  }

  PRP.worldOverlay = { SCHEMA, OPS, SCOPES, blank, normalize, makeEntry, factPayload, validateEntry, validateNew, validateOverlay, hasErrors, normSel };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldOverlay;
})(typeof window !== "undefined" ? window : globalThis);
