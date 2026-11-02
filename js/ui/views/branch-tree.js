/* Prism RP — compact dialogue map; message text is shown only on selection. */
(function (root) {
  "use strict";
  const P = root.PRP = root.PRP || {}, R = P.render, { esc, icon } = R;
  function branchTree() {
    return `<div class="map-launch"><button class="btn" data-act="tree-open">${icon("tree")}Открыть карту диалога</button></div>`;
  }
  function dialogueMap(m) {
    const graph = m.dialogueMap || { nodes: [], links: [], width: 320, height: 400 };
    const state = m.branchTreeUi || {}, zoom = state.zoom || 1;
    const selected = graph.nodes.find((n) => n.id === state.selectedId);
    const variant = selected ? (state.variant == null ? selected.swipeIdx : state.variant) : 0;
    const text = selected && selected.variants[variant] ? selected.variants[variant].text : "";
    const busy = !!(m.gen || m.turn);
    const label = (node) => node.role === "user" ? m.persona.name : m.card.name;
    const point = (node) => node.role === "assistant" && R.safeImageSrc(m.card.avatar)
      ? `<img src="${R.safeImageSrc(m.card.avatar)}" alt="">` : "";
    return `<div class="modal-wrap" data-act="modal-bg"><section class="modal dialogue-map-modal" role="dialog" aria-modal="true" aria-labelledby="dialogue-map-title">
      <header class="map-head"><h2 id="dialogue-map-title">Карта диалога</h2><button class="icon-btn" data-act="modal-close" aria-label="Закрыть карту">${icon("x")}</button></header>
      <div class="map-viewport" id="map-viewport" tabindex="0" aria-label="Карта сообщений; прокрутка перемещает карту">
        <div class="map-scaled" style="width:${graph.width * zoom}px;height:${graph.height * zoom}px"><div class="map-stage" style="width:${graph.width}px;height:${graph.height}px;transform:scale(${zoom})">
          <svg class="map-links" width="${graph.width}" height="${graph.height}" aria-hidden="true">${graph.links.map((e) => `<path class="${e.active ? "active" : ""}" d="M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}"/>`).join("")}</svg>
          <div class="map-root" style="left:${graph.width / 2}px;top:32px"><span>Начало</span><i></i></div>
          ${graph.nodes.map((n) => `<button class="map-node ${n.active ? "active" : ""} ${n.current ? "current" : ""} ${state.selectedId === n.id ? "selected" : ""}" style="left:${n.x}px;top:${n.y}px" data-act="map-pick" data-id="${esc(n.id)}" aria-label="${esc(label(n))}: ${esc(n.text.replace(/\s+/g, " ").slice(0, 90))}" title="${esc(n.text.replace(/\s+/g, " ").slice(0, 150))}"><span>${esc(label(n))}</span><i>${point(n)}</i></button>`).join("")}
        </div></div>
      </div>
      ${selected ? `<div class="map-inspector"><div class="map-selection"><b>${esc(label(selected))}</b>${selected.variants.length > 1 ? `<select data-map-variant aria-label="Вариант ответа">${selected.variants.map((v) => `<option value="${v.index}" ${v.index === variant ? "selected" : ""}>Вариант ${v.index + 1}</option>`).join("")}</select>` : ""}<button class="btn btn-sm" data-act="tree-select" data-id="${esc(selected.id)}" data-swipe="${variant}" ${busy ? "disabled" : ""}>Продолжить отсюда</button></div><p class="map-message">${esc(text)}</p></div>` : ""}
      <footer class="map-footer"><div class="map-legend"><span><i class="active"></i>Текущая ветка</span><span><i></i>Другие ветки</span><span><i class="current"></i>Точка продолжения</span></div><div class="map-controls"><button class="tool" data-act="map-zoom" data-dir="-1" aria-label="Уменьшить">−</button><button class="tool" data-act="map-center" title="По центру">${Math.round(zoom * 100)}%</button><button class="tool" data-act="map-zoom" data-dir="1" aria-label="Увеличить">+</button></div></footer>
    </section></div>`;
  }
  P.views = Object.assign(P.views || {}, { branchTree, dialogueMap });
})(typeof window !== "undefined" ? window : globalThis);
