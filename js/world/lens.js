/* Prism RP — линза персонажа (Character Lens). Чистый модуль.

   Линза — то, что отличается или важно для одной карточки поверх ОДНОГО общего пака мира:
     • focusEntities / focusTopics / relevanceHints — на чём сосредоточиться (для отбора в W2);
     • timelineVariant — какая ветка канона или AU у этого персонажа (метаданные для W2);
     • disabledFactIds — факты пака, которые для этого персонажа не действуют (явно по id);
     • overrides — замена конкретного факта пака по его id (targetFactId);
     • additions — факты мира, нужные только этому персонажу.
   Линза никогда не меняет сам пак и не содержит его копию. Связь с карточкой — по cardId
   (одна линза на карточку), с паком — по packId. Без DOM, хранилища, сети и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const WM = PRP.worldModel;

  const SCHEMA = 1;
  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (v == null ? "" : String(v));
  const issue = (level, code, message, ref) => Object.assign({ level, code, message }, ref ? { ref } : {});

  // Переопределение факта пака. Необязательные поля метаданных: если не заданы — берутся у целевого факта.
  function override(o) {
    const x = isObj(o) ? o : {};
    const out = { id: str(x.id).trim() || WM.uid("wo"), targetFactId: str(x.targetFactId).trim(), text: str(x.text) };
    for (const k of ["entities", "topics", "locations"]) if (Array.isArray(x[k])) out[k] = WM.strList(x[k]);
    for (const k of ["timeline", "variant"]) if (x[k] != null) out[k] = str(x[k]).trim();
    if (x.note) out.note = str(x.note);
    return out;
  }

  function blank(cardId, packId) {
    const now = Date.now();
    return {
      id: WM.uid("wl"), schema: SCHEMA, cardId: str(cardId), packId: str(packId),
      focusEntities: [], focusTopics: [], relevanceHints: [], timelineVariant: "",
      disabledFactIds: [], overrides: [], additions: [], createdAt: now, updatedAt: now,
    };
  }

  function normalize(l) {
    const o = isObj(l) ? l : {};
    return {
      id: str(o.id).trim(), schema: SCHEMA, cardId: str(o.cardId).trim(), packId: str(o.packId).trim(),
      focusEntities: WM.strList(o.focusEntities), focusTopics: WM.strList(o.focusTopics), relevanceHints: WM.strList(o.relevanceHints),
      timelineVariant: str(o.timelineVariant).trim(),
      disabledFactIds: WM.strList(o.disabledFactIds),
      overrides: Array.isArray(o.overrides) ? o.overrides.map(override) : [],
      additions: Array.isArray(o.additions) ? o.additions.map((f) => WM.fact(f, "wa")) : [],
      createdAt: o.createdAt || Date.now(), updatedAt: o.updatedAt || Date.now(),
    };
  }

  /* Проверка линзы. pack (необязательно) — чтобы показать ссылки на несуществующие факты:
     это предупреждения, а не ошибки — ссылка остаётся видимой и ничего не угадывается. */
  function validateLens(l, pack) {
    const out = [];
    if (!isObj(l)) return [issue("error", "not-object", "Линза должна быть объектом.")];
    if (!str(l.id).trim()) out.push(issue("error", "no-id", "У линзы нет id."));
    if (!str(l.cardId).trim()) out.push(issue("error", "no-card", "Линза не привязана к персонажу."));
    if (!str(l.packId).trim()) out.push(issue("error", "no-pack", "Линза не привязана к паку мира."));
    for (const k of ["disabledFactIds", "overrides", "additions", "focusEntities", "focusTopics", "relevanceHints"]) {
      if (l[k] != null && !Array.isArray(l[k])) out.push(issue("error", "not-array", `Поле ${k} должно быть списком.`, k));
    }
    const overrides = Array.isArray(l.overrides) ? l.overrides : [];
    const targets = new Set();
    overrides.forEach((o, i) => {
      if (!isObj(o)) { out.push(issue("error", "override-malformed", `Переопределение №${i + 1} не является объектом.`, String(i))); return; }
      const t = str(o.targetFactId).trim();
      if (!t) out.push(issue("error", "override-no-target", `У переопределения №${i + 1} нет целевого факта.`, str(o.id)));
      else if (targets.has(t)) out.push(issue("error", "override-duplicate-target", `Факт ${t} переопределён больше одного раза — неясно, какой вариант действует.`, t));
      else targets.add(t);
    });
    const addIds = new Set();
    (Array.isArray(l.additions) ? l.additions : []).forEach((f, i) => {
      if (!isObj(f)) { out.push(issue("error", "addition-malformed", `Добавленный факт №${i + 1} не является объектом.`, String(i))); return; }
      const id = str(f.id).trim();
      if (!id) out.push(issue("error", "addition-no-id", `У добавленного факта №${i + 1} нет id.`, String(i)));
      else if (addIds.has(id)) out.push(issue("error", "addition-duplicate-id", `Повторяется id добавленного факта: ${id}.`, id));
      else addIds.add(id);
    });
    if (pack && isObj(pack)) {
      const ids = new Set((pack.facts || []).map((f) => f && f.id));
      if (str(l.packId) && str(pack.id) && str(l.packId) !== str(pack.id)) out.push(issue("error", "pack-mismatch", "Линза относится к другому паку."));
      for (const t of targets) if (!ids.has(t)) out.push(issue("warning", "override-target-missing", `Переопределяемого факта ${t} нет в паке.`, t));
      for (const d of WM.strList(l.disabledFactIds)) if (!ids.has(d)) out.push(issue("warning", "disabled-target-missing", `Выключаемого факта ${d} нет в паке.`, d));
      for (const a of addIds) if (ids.has(a)) out.push(issue("warning", "addition-id-collides", `id добавленного факта ${a} совпадает с фактом пака.`, a));
    }
    return out;
  }

  PRP.worldLens = { SCHEMA, blank, normalize, override, validateLens };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldLens;
})(typeof window !== "undefined" ? window : globalThis);
