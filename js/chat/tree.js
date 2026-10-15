/* Prism RP — дерево сообщений. Каждое сообщение знает родителя;
   у ответа модели есть свайпы (варианты), активный свайп выбирает ветку текста.
   Активная ветка = путь от выбранного листа к корню. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  function index(list) {
    const byId = new Map();
    for (const m of list || []) byId.set(m.id, m);
    return byId;
  }

  function path(byId, leafId) {
    const out = [];
    const seen = new Set();
    let cur = leafId ? byId.get(leafId) : null;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return out;
  }

  function children(list, parentId) {
    return (list || []).filter((m) => (m.parentId || null) === (parentId || null)).sort((a, b) => a.createdAt - b.createdAt);
  }

  // Все потомки (для удаления ветки).
  function descendants(list, id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const m of list) if (m.parentId === cur) { out.push(m.id); stack.push(m.id); }
    }
    return out;
  }

  // Самый свежий лист под узлом — куда переходить после переключения ветки.
  function latestLeaf(list, id) {
    let cur = id;
    for (;;) {
      const kids = children(list, cur);
      if (!kids.length) return cur;
      cur = kids[kids.length - 1].id;
    }
  }

  function activeSwipe(m) {
    if (!m || !m.swipes || !m.swipes.length) return { text: "", sceneOps: [] };
    return m.swipes[Math.min(m.swipeIdx || 0, m.swipes.length - 1)];
  }

  PRP.tree = { index, path, children, descendants, latestLeaf, activeSwipe };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.tree;
})(typeof window !== "undefined" ? window : globalThis);
