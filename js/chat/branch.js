/* Prism RP — правило активной ветки для привязанных к ветке записей. Чистый модуль.

   Одно определение «видно в этой ветке» для всего, что привязано к сообщениям чата:
   опыт персонажа (prism/experience) и наложение мира на чат (world/canon).

   source: { messageIds: [id], swipes: { id: индекс варианта } }
   path:   активная ветка [{ id, swipeIdx }] от корня к листу.

   Запись видна, только если ВСЕ её сообщения лежат на активной ветке и у каждого сообщения,
   для которого записан вариант, сейчас выбран тот же вариант. Скрытая запись не удаляется:
   вернулись в ветку или к тому варианту — она снова видна. Ничего не угадывается.
   Без DOM, хранилища, сети и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

  /* → { visible, code: "on-branch" | "other-branch" | "other-swipe", reason } */
  function visibleOnPath(source, path) {
    const src = source || {};
    const onPath = new Map((path || []).map((p) => [p.id, p.swipeIdx || 0]));
    const sw = isObj(src.swipes) ? src.swipes : {};
    for (const id of src.messageIds || []) {
      if (!onPath.has(id)) return { visible: false, code: "other-branch", reason: "другая ветка" };
      if (sw[id] != null && onPath.get(id) !== sw[id]) return { visible: false, code: "other-swipe", reason: "другой вариант ответа" };
    }
    return { visible: true, code: "on-branch", reason: "в этой ветке" };
  }

  /* Привязка к текущей активной ветке: все сообщения от корня до листа и их выбранные варианты.
     Пустая ветка (пустой чат) привязки не даёт → null. */
  function anchorOf(path) {
    const p = path || [];
    if (!p.length) return null;
    const swipes = {};
    for (const x of p) swipes[x.id] = x.swipeIdx || 0;
    return { anchorId: p[p.length - 1].id, messageIds: p.map((x) => x.id), swipes };
  }

  /* Место привязки в активной ветке (глубина): индекс anchorId, иначе самого глубокого из messageIds; -1 — нет на ветке. */
  function depthOf(source, path) {
    const idx = new Map((path || []).map((p, i) => [p.id, i]));
    const src = source || {};
    if (src.anchorId && idx.has(src.anchorId)) return idx.get(src.anchorId);
    let d = -1;
    for (const id of src.messageIds || []) if (idx.has(id)) d = Math.max(d, idx.get(id));
    return d;
  }

  PRP.branch = { visibleOnPath, anchorOf, depthOf };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.branch;
})(typeof window !== "undefined" ? window : globalThis);
