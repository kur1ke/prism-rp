/* Prism RP — экраны мира: библиотека общих паков мира и раздел «Мир» в редакторе персонажа
   (линза персонажа и превью «Мир персонажа»). Только разметка: правила разрешения — в world/resolve,
   данные для превью готовит world/service. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render;
  const { esc, icon } = R;

  const list = (a) => esc((a || []).join(", "));
  const PROV = (p) => (p && p.kind === "imported" ? `импорт${p.sourceFormat ? " · " + esc(p.sourceFormat) : ""}` : "вручную");

  /* ── Библиотека миров ─────────────────────────────────────────────── */
  function worldLibrary(m) {
    const packs = m.worldPacks || [];
    const d = m.worldDraft;
    const users = (id) => (m.worldLenses || []).filter((l) => l.packId === id).map((l) => (m.cards.find((c) => c.id === l.cardId) || {}).name).filter(Boolean);
    return `<div class="home"><div class="home-inner">
      <div class="home-top"><div><h1>Миры</h1>
        <p class="sub">Общие паки мира: знания о мире или фандоме, которые разделяют разные персонажи. Что у конкретного персонажа иначе — задаётся в его карточке, в разделе «Мир».</p></div>
        <div class="home-tools"><button class="btn" data-act="world-import">${icon("upload")}Импорт пака</button>
          <button class="btn btn-primary" data-act="world-new">${icon("plus")}Новый мир</button></div></div>
      <div class="world-layout">
        <div class="world-list">${packs.length ? packs.map((p) => {
          const u = users(p.id);
          return `<button class="world-item ${d && d.id === p.id ? "on" : ""}" data-act="world-open" data-id="${p.id}">
            <b>${esc(p.name || "Без названия")}</b><small>${p.facts.length} ${R.plural(p.facts.length, "факт", "факта", "фактов")}${u.length ? ` · персонажей: ${u.length}` : ""}</small></button>`;
        }).join("") : `<p class="empty-note">Паков мира пока нет.</p>`}</div>
        <div class="world-editor">${d ? packEditor(d, users(d.id)) : `<p class="hint">Выберите мир слева или создайте новый. Факт мира — утверждение о мире («Университет находится в Каракуре»), а не указание модели и не черта характера.</p>`}</div>
      </div></div></div>`;
  }

  function packEditor(d, users) {
    return `<div class="field"><label for="wp-name">Название</label><input id="wp-name" data-wp="name" value="${esc(d.name)}"></div>
      <div class="field"><label for="wp-desc">Описание</label><textarea id="wp-desc" data-wp="description" rows="2">${esc(d.description)}</textarea></div>
      <div class="block-title" style="margin-top:14px">Факты мира <small>${d.facts.length}</small></div>
      <p class="hint" style="margin-top:0">Декларативные утверждения о мире. Метки (персонажи, темы, места, хронология, вариант) пригодятся для отбора фактов на следующих этапах.</p>
      ${d.facts.map((f, i) => `<div class="lore world-fact ${f.enabled === false ? "off" : ""}" data-wf-row="${i}">
        <div class="field"><label>Факт <span class="spec-key">${esc(f.id)}</span></label><textarea data-wf="${i}" data-k="text" rows="2" placeholder="Тацуки живёт в Каракуре.">${esc(f.text)}</textarea></div>
        <div class="row wrap">
          <div class="field"><label>Персонажи, сущности</label><input data-wf="${i}" data-k="entities" value="${list(f.entities)}" placeholder="Тацуки, Орихимэ"></div>
          <div class="field"><label>Темы</label><input data-wf="${i}" data-k="topics" value="${list(f.topics)}" placeholder="дом, семья"></div>
          <div class="field"><label>Места</label><input data-wf="${i}" data-k="locations" value="${list(f.locations)}" placeholder="Каракура"></div></div>
        <div class="row wrap">
          <div class="field"><label>Хронология</label><input data-wf="${i}" data-k="timeline" value="${esc(f.timeline)}" placeholder="канон"></div>
          <div class="field"><label>Вариант</label><input data-wf="${i}" data-k="variant" value="${esc(f.variant)}" placeholder="основной"></div></div>
        <div class="row" style="justify-content:space-between"><label class="check"><input type="checkbox" data-wf="${i}" data-k="enabled" ${f.enabled !== false ? "checked" : ""}><span>Действует</span></label>
          <span class="hint" style="margin:0">Источник: ${PROV(f.provenance)}</span>
          <button class="btn btn-sm btn-ghost" data-act="world-fact-del" data-i="${i}">${icon("trash")}Удалить</button></div>
      </div>`).join("")}
      <button class="btn btn-sm" data-act="world-fact-add">${icon("plus")}Добавить факт</button>
      <div class="row" style="margin-top:20px;flex-wrap:wrap">
        <button class="btn btn-primary" data-act="world-save">${icon("check")}Сохранить мир</button>
        <button class="btn" data-act="world-export">${icon("download")}Экспорт JSON</button>
        <span class="spacer"></span>
        <button class="btn btn-danger" data-act="world-delete">${icon("trash")}Удалить мир</button></div>
      ${users.length ? `<p class="hint" style="margin-top:8px">Этот мир используют: ${esc(users.join(", "))}. Удалить его можно, только когда ни один персонаж на него не ссылается.</p>` : ""}`;
  }

  /* ── Раздел «Мир» в редакторе персонажа ───────────────────────────── */
  function lensSection(m, d) {
    if (!d.id) return `<p class="lead">Мир персонажа</p><p class="hint">Сначала сохраните персонажа — затем можно привязать его к общему паку мира.</p>`;
    const packs = m.worldPacks || [];
    const lens = m.modal && m.modal.lens;
    const pv = m.lensPreview;
    const sel = `<div class="field"><label for="lens-pack">Общий пак мира</label><select id="lens-pack" data-lens-pack>
      <option value="">— без мира —</option>${packs.map((p) => `<option value="${p.id}" ${lens && lens.packId === p.id ? "selected" : ""}>${esc(p.name || "Без названия")}</option>`).join("")}</select>
      <span class="help">Пак общий для многих персонажей; здесь хранится только то, что у ${esc(d.name || "персонажа")} иначе. Сам пак отсюда не меняется.${packs.length ? "" : " Паков пока нет — создайте их в разделе «Миры»."}</span></div>`;
    if (!lens || !lens.packId) return `<p class="lead">Мир персонажа</p>${sel}`;
    if (!pv || !pv.pack) return `<p class="lead">Мир персонажа</p>${sel}<p class="err">${icon("alert")}<span>Пак мира не найден.</span></p>`;
    const pack = pv.pack;
    const ovrByTarget = new Map((lens.overrides || []).map((o, i) => [o.targetFactId, { o, i }]));
    const factIds = new Set(pack.facts.map((f) => f.id));
    const dangling = (lens.overrides || []).map((o, i) => ({ o, i })).filter((x) => !factIds.has(x.o.targetFactId));
    const danglingDis = (lens.disabledFactIds || []).filter((id) => !factIds.has(id));
    return `<p class="lead">Мир персонажа</p>${sel}
      <div class="row wrap">
        <div class="field"><label>В фокусе: персонажи, сущности</label><input data-lens="focusEntities" value="${list(lens.focusEntities)}"></div>
        <div class="field"><label>В фокусе: темы</label><input data-lens="focusTopics" value="${list(lens.focusTopics)}"></div></div>
      <div class="row wrap">
        <div class="field"><label>Подсказки о важном</label><input data-lens="relevanceHints" value="${list(lens.relevanceHints)}" placeholder="соседи, университет"></div>
        <div class="field"><label>Хронология / вариант персонажа</label><input data-lens="timelineVariant" value="${esc(lens.timelineVariant)}" placeholder="university-au"></div></div>
      <div class="block-title" style="margin-top:14px">Факты пака «${esc(pack.name)}»</div>
      <p class="hint" style="margin-top:0">Для этого персонажа факт можно выключить или заменить своим текстом. Пак и другие персонажи это не затрагивает.</p>
      ${pack.facts.map((f) => {
        const ov = ovrByTarget.get(f.id);
        const off = (lens.disabledFactIds || []).includes(f.id);
        return `<div class="lore lens-fact ${off ? "off" : ""}">
          <div class="lf-text">${esc(f.text) || "<i>без текста</i>"} <span class="spec-key">${esc(f.id)}</span>${f.enabled === false ? ` <span class="tag">выключен в паке</span>` : ""}</div>
          <div class="row" style="flex-wrap:wrap">
            <label class="check"><input type="checkbox" data-lens-disable="${esc(f.id)}" ${off ? "checked" : ""}><span>Не действует для персонажа</span></label>
            ${ov ? "" : `<button class="btn btn-sm" data-act="lens-override-add" data-fid="${esc(f.id)}">${icon("edit")}Заменить для персонажа</button>`}</div>
          ${ov ? `<div class="field"><label>Для персонажа вместо этого</label><textarea data-lens-ovr="${ov.i}" rows="2">${esc(ov.o.text)}</textarea>
            <button class="btn btn-sm btn-ghost" data-act="lens-override-del" data-i="${ov.i}">${icon("x")}Убрать замену</button></div>` : ""}
        </div>`;
      }).join("") || `<p class="empty-note">В паке нет фактов.</p>`}
      ${dangling.length || danglingDis.length ? `<div class="block err-block">${icon("alert")}<div><b>Ссылки на факты, которых в паке нет.</b> Они сохранены как есть и не применяются; подходящий факт не подбирается по тексту.
        <ul>${dangling.map((x) => `<li>Замена факта <span class="spec-key">${esc(x.o.targetFactId)}</span>: «${esc(x.o.text)}» <button class="btn btn-sm btn-ghost" data-act="lens-override-del" data-i="${x.i}">Убрать</button></li>`).join("")}
        ${danglingDis.map((id) => `<li>Выключение факта <span class="spec-key">${esc(id)}</span> <button class="btn btn-sm btn-ghost" data-act="lens-disabled-del" data-fid="${esc(id)}">Убрать</button></li>`).join("")}</ul></div></div>` : ""}
      <div class="block-title" style="margin-top:14px">Факты только этого персонажа</div>
      ${(lens.additions || []).map((f, i) => `<div class="lore">
        <div class="field"><label>Факт <span class="spec-key">${esc(f.id)}</span></label><textarea data-lens-add="${i}" data-k="text" rows="2" placeholder="Живёт напротив {{user}}.">${esc(f.text)}</textarea></div>
        <div class="row wrap"><div class="field"><label>Персонажи, сущности</label><input data-lens-add="${i}" data-k="entities" value="${list(f.entities)}"></div>
          <div class="field"><label>Темы</label><input data-lens-add="${i}" data-k="topics" value="${list(f.topics)}"></div>
          <div class="field"><label>Места</label><input data-lens-add="${i}" data-k="locations" value="${list(f.locations)}"></div></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-sm btn-ghost" data-act="lens-add-del" data-i="${i}">${icon("trash")}Удалить</button></div></div>`).join("")}
      <button class="btn btn-sm" data-act="lens-add">${icon("plus")}Добавить факт персонажа</button>
      ${effective(pv)}
      <div class="row" style="margin-top:16px"><button class="btn btn-ghost btn-sm" data-act="lens-clear">${icon("x")}Снять связь с миром</button></div>`;
  }

  // Превью «Мир персонажа»: что получится из пака и линзы. Только просмотр — в модель это не уходит.
  function effective(pv) {
    const ORIGIN = { pack: ["пак", ""], override: ["заменено для персонажа", "ovr"], lens: ["только у персонажа", "own"] };
    const WHY = { "pack-disabled": "выключен в паке", "lens-disabled": "не действует для персонажа", "lens-addition-disabled": "выключен", "addition-id-collides": "id совпадает с фактом пака" };
    const r = pv.report;
    const warns = (r.warnings || []).concat((pv.lensIssues || []).filter((x) => x.level === "error"));
    return `<div class="block-title" style="margin-top:22px">Мир персонажа <small>${r.effective} из ${r.packFacts} фактов пака${r.additions ? ` + ${r.additions} своих` : ""}</small></div>
      <p class="hint" style="margin-top:0">Итог: пак с учётом линзы. Только для просмотра — в контекст модели мир пока не подаётся.</p>
      <ul class="eff-world">${pv.facts.map((f) => `<li class="${ORIGIN[f.origin][1]}"><span class="tag">${ORIGIN[f.origin][0]}</span> ${esc(f.text)}${f.origin === "override" ? ` <s>${esc(f.originalText)}</s>` : ""}</li>`).join("")}
        ${pv.excluded.map((x) => `<li class="off"><span class="tag">${WHY[x.reason] || x.reason}</span> <s>${esc(x.text)}</s></li>`).join("")}</ul>
      ${warns.length ? `<ul class="imp-issues">${warns.map((w) => `<li class="${w.level}"><b>${w.level === "error" ? "Ошибка" : "Внимание"}:</b> ${esc(w.message)}</li>`).join("")}</ul>` : ""}`;
  }

  Object.assign((PRP.views = PRP.views || {}), { worldLibrary, lensSection });
})(typeof window !== "undefined" ? window : globalThis);
