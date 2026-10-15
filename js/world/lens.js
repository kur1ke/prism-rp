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

  /* Переопределение факта пака. Поля метаданных различают «не задано» и «задано пустым»:
     отсутствует или null → наследуется у целевого факта; задано (в том числе [] или "") → заменяет,
     то есть пустой список очищает метаданные. Никаких проверок на «истинность». */
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

  PRP.worldLens = { SCHEMA, blank, normalize, override };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldLens;
})(typeof window !== "undefined" ? window : globalThis);
