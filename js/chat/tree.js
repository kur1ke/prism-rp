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
    const seen = new Set([id]);
    while (stack.length) {
      const cur = stack.pop();
      for (const m of list) if (m.parentId === cur && !seen.has(m.id)) {
        seen.add(m.id); out.push(m.id); stack.push(m.id);
      }
    }
    return out;
  }

  // Самый свежий лист под узлом — куда переходить после переключения ветки.
  function latestLeaf(list, id) {
    let cur = id;
    const seen = new Set();
    for (;;) {
      if (seen.has(cur)) return null; // A corrupt cycle has no leaf.
      seen.add(cur);
      const kids = children(list, cur);
      if (!kids.length) return cur;
      cur = kids[kids.length - 1].id;
    }
  }

  function activeSwipe(m) {
    if (!m || !m.swipes || !m.swipes.length) return { text: "" };
    return m.swipes[Math.min(m.swipeIdx || 0, m.swipes.length - 1)];
  }

  // Restore the variants recorded on parent edges, without mutating messages.
  // Legacy edges have no variant metadata: retain their current selection.
  function selection(list, leafId, swipeIdx) {
    const byId = index(list), route = [], seen = new Set();
    let node = byId.get(leafId), selected = swipeIdx;
    if (!node) return null;
    while (node) {
      if (seen.has(node.id)) return null;
      seen.add(node.id);
      const variant = selected == null ? (node.swipeIdx || 0) : selected;
      if (!Number.isInteger(variant) || variant < 0 || !node.swipes || variant >= node.swipes.length) return null;
      route.unshift({ id: node.id, swipeIdx: variant });
      if (!node.parentId) break;
      selected = node.parentSwipeIdx;
      node = byId.get(node.parentId);
      if (!node) return null;
    }
    return route;
  }

  // Flat preorder keeps large trees renderable without recursive DOM building.
  function outline(list, leafId) {
    const groups = new Map(), nodes = index(list), active = new Set(path(nodes, leafId).map((m) => m.id));
    for (const m of list || []) {
      const key = nodes.has(m.parentId) ? m.parentId : null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    for (const group of groups.values()) group.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
    const stack = (groups.get(null) || []).slice().reverse().map((m) => ({ m, depth: 0 }));
    const rows = [], seen = new Set();
    while (stack.length) {
      const { m, depth } = stack.pop();
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      rows.push({ id: m.id, parentId: m.parentId, role: m.role, text: String(activeSwipe(m).text || ""),
        depth, active: active.has(m.id), current: m.id === leafId, swipeIdx: m.swipeIdx || 0,
        variants: (m.swipes || []).map((sw, i) => ({ index: i, text: String(sw.text || "") })) });
      const children = groups.get(m.id) || [];
      for (let i = children.length - 1; i >= 0; i--) stack.push({ m: children[i], depth: depth + 1 });
    }
    return rows;
  }

  function layout(list, leafId) {
    const rows = outline(list, leafId), byId = new Map(rows.map((n) => [n.id, n])), children = new Map(), spans = new Map();
    for (const n of rows) {
      const parent = byId.has(n.parentId) ? n.parentId : null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(n);
    }
    for (const n of rows.slice().reverse()) spans.set(n.id, Math.max(1, (children.get(n.id) || []).reduce((v, c) => v + spans.get(c.id), 0)));
    const roots = children.get(null) || [], total = roots.reduce((v, n) => v + spans.get(n.id), 0);
    const width = Math.max(320, total * 112 + 100), height = Math.max(420, (Math.max(0, ...rows.map((n) => n.depth)) + 2) * 92 + 80);
    const positions = new Map(); let cursor = (width - total * 112) / 2;
    const place = (group, start) => { let x = start; for (const n of group) { positions.set(n.id, { x: x + spans.get(n.id) * 56, start: x }); x += spans.get(n.id) * 112; } };
    place(roots, cursor);
    for (const n of rows) place(children.get(n.id) || [], positions.get(n.id).start);
    const nodes = rows.map((n) => Object.assign({}, n, { x: positions.get(n.id).x, y: 124 + n.depth * 92 }));
    const points = new Map(nodes.map((n) => [n.id, n]));
    const links = nodes.map((n) => { const parent = points.get(n.parentId); return { x1: parent ? parent.x : width / 2, y1: parent ? parent.y : 32, x2: n.x, y2: n.y, active: n.active }; });
    return { nodes, links, width, height };
  }

  PRP.tree = { index, path, children, descendants, latestLeaf, activeSwipe, selection, layout };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.tree;
})(typeof window !== "undefined" ? window : globalThis);
