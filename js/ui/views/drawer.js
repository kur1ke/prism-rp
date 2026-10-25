/* Prism RP — выдвижная панель: сцена, опыт, мир чата, Prism (что ушло в модель). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Выдвижная панель ─────────────────────────────────────────────── */
  function drawer(m) {
    // У сцены — «Сцена», у переписки — «Среда» (сцены RP в переписке нет). Мир, опыт и Prism — у обоих режимов.
    const ms = m.chat && m.chat.mode === "messenger";
    const tabs = [ms ? ["env", "Среда", "clock"] : ["scene", "Сцена", "scene"], ["memory", "Опыт", "memory"], ["world", "Мир", "globe"]];
    const tab = m.tab === "prism" ? (ms ? "env" : "scene") : ms && m.tab === "scene" ? "env" : !ms && m.tab === "env" ? "scene" : m.tab;
    m = Object.assign({}, m, { tab });
    let body = "";
    if (!m.chat) body = `<p class="empty-note">Откройте чат.</p>`;
    else if (m.tab === "env") body = PRP.views.envTab(m);
    else if (m.tab === "scene") body = sceneTab(m);
    else if (m.tab === "memory") body = memoryTab(m);
    else if (m.tab === "world") body = worldTab(m);
    else body = ms ? PRP.views.envTab(m) : sceneTab(m);
    return `<div class="drawer-head"><nav class="drawer-tabs">${tabs.map(([id, name, ic]) => `<button class="dtab ${m.tab === id ? "on" : ""}" data-act="tab" data-tab="${id}">${icon(ic)}${name}</button>`).join("")}</nav>
      <button class="icon-btn" data-act="drawer-close" title="Закрыть панель">${icon("x")}</button></div>
      <div class="drawer-body" id="drawer-body">${body}</div>`;
  }

  function sceneTab(m) {
    const st = m.scene, c = st.clock;
    const date = c.m != null ? `${String(c.d).padStart(2, "0")}.${String(c.m).padStart(2, "0")}${c.y != null ? "." + c.y : ""}` : "";
    const tm = c.min != null ? `${String(Math.floor(c.min / 60)).padStart(2, "0")}:${String(c.min % 60).padStart(2, "0")}` : "";
    const names = [];
    const add = (n) => { if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n); };
    add(m.card.name);
    st.present.forEach(add);
    Object.keys(st.chars).forEach(add);
    const people = names.map((n) => {
      const key = Object.keys(st.chars).find((k) => k.toLowerCase() === n.toLowerCase());
      const ch = key ? st.chars[key] : { wear: [], pose: "", mood: "" };
      const isMain = n.toLowerCase() === m.card.name.toLowerCase();
      return `<div class="panel" data-person="${esc(n)}">
        <div class="who">${R.avatar(isMain ? m.card : { name: n }, 34)}<b>${esc(n)}</b>
          ${st.present.some((p) => p.toLowerCase() === n.toLowerCase()) ? `<span class="tag">в сцене</span>` : `<button class="tool" data-act="sc-enter" data-name="${esc(n)}">в сцену</button>`}</div>
        <div class="field"><span class="label">${icon("shirt", "")} Одежда</span>
          <div class="chips">${ch.wear.map((w) => `<span class="chip"><span>${esc(w)}</span><button data-act="sc-remove" data-name="${esc(n)}" data-item="${esc(w)}" title="Снять">${icon("x")}</button></span>`).join("")}
            <input class="chip-add" data-sc-add="${esc(n)}" placeholder="+ надеть…"></div></div>
        <div class="row"><div class="field"><label>Поза, где</label><input data-sc-field="pose" data-name="${esc(n)}" value="${esc(ch.pose)}" placeholder="сидит у окна"></div>
          <div class="field"><label>Настроение (оценка)</label><input data-sc-field="mood" data-name="${esc(n)}" value="${esc(ch.mood)}" placeholder="спокойна"></div></div>
        ${isMain && ch.mood ? `<span class="help">Модель видит настроение как предполагаемую оценку, а не как факт.</span>` : ""}
      </div>`;
    }).join("");
    return `
      <div class="block"><div class="block-title">Когда и где</div>
        <div class="row"><div class="field"><label>Дата</label><input id="sc-date" value="${esc(date)}" placeholder="14.05"></div>
          <div class="field"><label>Время</label><input id="sc-time" type="time" value="${esc(tm)}"></div>
          <button class="btn btn-sm" data-act="sc-time-set" style="margin-bottom:12px">Задать</button></div>
        <div class="quick">${[["+15m", "+15 мин"], ["+1h", "+1 час"], ["+3h", "+3 часа"], ["+1d", "+1 день"]].map(([v, l]) => `<button class="btn btn-sm btn-ghost" data-act="sc-shift" data-v="${v}">${icon("clock")}${l}</button>`).join("")}</div>
        <div class="field" style="margin-top:12px"><label>Место</label><input data-sc-top="loc" value="${esc(st.loc)}" placeholder="Кафе у кампуса, терраса"></div>
        <div class="field"><label>Погода</label><input data-sc-top="weather" list="weather-list" value="${esc(st.weather)}" placeholder="дождь"><datalist id="weather-list">${WEATHER.map((w) => `<option value="${w}">`).join("")}</datalist></div>
      </div>
      <div class="block"><div class="block-title">Кто рядом <small>${st.present.length || "никого"}</small></div>
        <div class="chips">${st.present.map((p) => `<span class="chip"><span>${esc(p)}</span><button data-act="sc-leave" data-name="${esc(p)}" title="Ушёл из сцены">${icon("x")}</button></span>`).join("")}
          <input class="chip-add" id="sc-enter-new" placeholder="+ добавить…"></div></div>
      <div class="block"><div class="block-title">Персонажи</div>${people}</div>
      ${st.legacyIgnored ? `<p class="hint legacy-note">На этой ветке есть устаревшие отметки сцены (отношение, отметки сюжета): ${st.legacyIgnored}. Они сохранены в сообщениях, но больше не действуют и в модель не подаются.</p>` : ""}
      ${st.invalidOps ? `<details class="block"><summary class="hint">Не применены команды трекера: ${st.invalidOps}</summary>
        <p class="hint">Такие команды не меняют состояние сцены. Исходные сообщения не переписываются.</p>
        <ul class="imp-issues">${(st.invalidEntries || []).map((x) => `<li><code>${esc(x.raw)}</code> <small>(${esc(x.source)})</small></li>`).join("")}</ul>
      </details>` : ""}
      <div class="block"><div class="block-title">Как модель ведёт сцену</div>
        <label class="check"><input type="checkbox" data-set="sceneProtocol" ${m.settings.sceneProtocol ? "checked" : ""}><span>Модель сообщает изменения сама<small>В конце ответа она пишет короткую служебную строку; приложение применяет её и прячет из текста.</small></span></label>
        <details><summary class="hint" style="cursor:pointer">Начальная сцена в текстовом виде</summary>
          <div class="field" style="margin-top:8px"><textarea id="scene-init" placeholder="time=14.05 18:00; loc=Кафе; Химэ.wear=белая блузка, юбка">${esc(m.chat.sceneInit || "")}</textarea></div>
          <button class="btn btn-sm" data-act="scene-init-save">Сохранить</button></details>
      </div>`;
  }

  function memoryTab(m) {
    const d = m.expDraft;
    const proposed = m.expCandidates || [];
    const ev = m.expView || { visible: [], hiddenInChat: 0, legacy: [] };
    const list = ev.visible.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const scopeTag = (r) => (PRP.experience.scopeOf(r) === "branch" ? `<span class="tag" title="Видна только в этой ветке чата">ветка</span>` : `<span class="tag" title="Видна во всех ветках этого чата">весь чат</span>`);
    const valColor = (v) => (v > 0 ? "var(--ok)" : v < 0 ? "var(--danger)" : "var(--line)");
    const valWord = { "-3": "тяжело", "-2": "плохо", "-1": "неприятно", "0": "нейтрально", "1": "приятно", "2": "хорошо", "3": "очень важно" };
    if (d) {
      return `<div class="block"><div class="block-title">${d.id ? "Запись опыта" : "Новая запись опыта"}</div>
        ${d.source && d.source.sceneTime ? `<p class="hint">Время сцены: ${esc(d.source.sceneTime)}${d.source.messageIds && d.source.messageIds.length ? ", из сообщения" : ""}</p>` : ""}
        <div class="field"><label>Что произошло</label><textarea id="x-event" placeholder="Факт, без оценок: «Кира соврал Химэ, что был на работе»">${esc(d.event)}</textarea></div>
        <div class="field"><label>Как ${esc(m.card.name)} это поняла тогда</label><textarea id="x-interp" placeholder="Может быть ошибочным: «Решила, что он её не уважает»">${esc(d.interpretation)}</textarea></div>
        <div class="field"><label>Последствия</label><textarea id="x-cons" placeholder="Обещания, долги, раны: «Обещала больше не спрашивать»">${esc(d.consequences)}</textarea></div>
        <div class="field"><label>Насколько это было хорошо или плохо</label>
          <div class="pick" role="group">${[-3, -2, -1, 0, 1, 2, 3].map((v) => `<button data-act="x-val" data-v="${v}" class="${+d.valence === v ? "on" : ""}" title="${valWord[v]}">${v > 0 ? "+" + v : v}</button>`).join("")}</div>
          <span class="help" id="x-val-word">${valWord[d.valence]}</span></div>
        <div class="field"><label>Насколько важно</label>
          <div class="pick" role="group">${[1, 2, 3].map((v) => `<button data-act="x-weight" data-v="${v}" class="${+d.weight === v ? "on" : ""}">${["мелочь", "заметно", "важно"][v - 1]}</button>`).join("")}</div></div>
        <div class="field"><label>Темы — по ним опыт вспоминается к месту</label>
          <div class="chips" id="x-domains">${(d.domains || []).map((t) => `<span class="chip"><span>${esc(t)}</span><button data-act="x-domain-del" data-v="${esc(t)}">${icon("x")}</button></span>`).join("")}
          <input class="chip-add" id="x-domain-add" placeholder="+ деньги, доверие…"></div></div>
        <label class="check"><input type="checkbox" id="x-about-user" ${(d.about || []).includes("user") ? "checked" : ""}><span>Это про ${esc(m.persona.name)}</span></label>
        <div class="field"><label>Статус</label><select id="x-status">${[["active", "действует"], ["superseded", "пересмотрено — персонаж понял иначе"], ["archived", "в архиве"]].map(([v, l]) => `<option value="${v}" ${d.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="row"><button class="btn btn-primary btn-sm" data-act="exp-save">Сохранить</button><button class="btn btn-sm btn-ghost" data-act="exp-cancel">Отмена</button>
          ${d.id ? `<span style="flex:1"></span><button class="btn btn-danger btn-sm" data-act="exp-del">Удалить</button>` : ""}</div></div>`;
    }
    return `<div class="block"><div class="block-title">Опыт ${esc(m.card.name)} <small>${list.length}</small></div>
      <p class="hint">Пережитое в этом чате — в этом мире. Другие чаты с ${esc(m.card.name)} его не видят. Событие из сообщения видно только в своей ветке; добавленное вручную — во всех ветках чата.${ev.hiddenInChat ? ` В других ветках этого чата ещё ${ev.hiddenInChat} ${R.plural(ev.hiddenInChat, "запись", "записи", "записей")}.` : ""}</p>
      <div class="row">
        <button class="btn btn-sm" data-act="exp-new">${icon("plus")}Добавить событие</button>
        <button class="btn btn-sm" data-act="exp-extract" ${m.expExtractBusy ? "disabled" : ""}>${m.expExtractBusy ? "Анализ…" : "Извлечь из переписки"}</button>
      </div>
      <p class="hint">Извлечение проверяет последние 16 сообщений активной ветки. Нужна текстовая модель; результаты — только предложения, пока вы их не проверите и не сохраните. Возможен отдельный платный запрос.</p>
      ${proposed.length ? `<div class="block"><div class="block-title">Предложенные воспоминания <small>${proposed.length}</small></div>
        ${proposed.map((c, i) => `<div class="memo">
          <div class="ev">${esc(c.event)}</div>
          <p class="hint">Источник: ${esc(c.quote)} · сообщение ${esc(c.messageId)}</p>
          ${c.interpretation ? `<div class="in">${esc(c.interpretation)}</div>` : ""}
          <button class="btn btn-sm" data-act="exp-candidate" data-v="${i}">Проверить и сохранить…</button>
        </div>`).join("")}
        <button class="btn btn-sm btn-ghost" data-act="exp-discard">Скрыть предложения</button>
      </div>` : ""}
      </div>
      ${list.map((r) => `<div class="memo ${r.status !== "active" ? "off" : ""}" data-act="exp-edit" data-id="${r.id}" role="button" tabindex="0">
        <span class="memo-bar" style="background:${valColor(r.valence)}"></span>
        <div class="ev">${esc(r.event || "Без описания")}</div>
        ${r.interpretation ? `<div class="in">${esc(r.interpretation)}</div>` : ""}
        <div class="mt"><span class="tag ${r.valence > 0 ? "pos" : r.valence < 0 ? "neg" : ""}">${valWord[r.valence]}</span>
          ${(r.domains || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
          ${r.status === "superseded" ? `<span class="tag">пересмотрено</span>` : ""}${r.source && r.source.sceneTime ? `<span class="tag">${esc(r.source.sceneTime)}</span>` : ""}${scopeTag(r)}</div>
      </div>`).join("") || `<p class="empty-note">Пока пусто. Нажмите «В опыт» под важным сообщением.</p>`}
      ${ev.legacy.length ? `<div class="block legacy-block"><div class="block-title">Без привязки к чату <small>${ev.legacy.length}</small></div>
        <p class="hint">Старые записи, для которых нельзя точно сказать, в каком чате они случились. В контекст они не попадают. Привяжите к этому чату те, что относятся к нему.</p>
        ${ev.legacy.map((r) => `<div class="memo off"><span class="memo-bar" style="background:${valColor(r.valence)}"></span>
          <div class="ev">${esc(r.event || "Без описания")}</div>${r.interpretation ? `<div class="in">${esc(r.interpretation)}</div>` : ""}
          <div class="mt"><span class="tag">не привязана</span><span style="flex:1"></span><button class="btn btn-sm" data-act="exp-assign" data-id="${r.id}">Привязать к этому чату</button></div></div>`).join("")}</div>` : ""}`;
  }

  /* ── Мир чата ─────────────────────────────────────────────────────────
     Только разметка: канон, отбор и проверки — в world/canon, world/overlay и сервисе мира чата. */
  const ORIGIN = { pack: "пак", "lens-override": "линза: замена", "lens-addition": "линза: свой факт", "chat-overlay": "чат", "branch-overlay": "ветка" };
  const OPS = { assert: "новый факт", override: "замена", retract: "убрано" };
  const FILTER = { "timeline-unselected": "таймлайн не выбран", "timeline-mismatch": "другой таймлайн", "variant-unselected": "вариант не выбран", "variant-mismatch": "другой вариант" };
  const metaLine = (f) => [(f.entities || []).join(", "), (f.topics || []).join(", "), (f.locations || []).join(", "), f.timeline ? "таймлайн: " + f.timeline : "", f.variant ? "вариант: " + f.variant : ""].filter(Boolean).join(" · ");
  function worldTab(m) {
    const w = m.worldChat;
    if (!w) return `<p class="empty-note">Откройте чат.</p>`;
    const ov = w.overlay || {};
    const head = `<div class="block"><div class="block-title">Мир чата</div>
      <p class="hint">Канон этого чата: ${w.pack ? `пак «${esc(w.pack.name)}» с линзой персонажа` : "у персонажа нет пака мира"} и то, что вы явно закрепили здесь. Текст ответов, сцена и опыт сами в мир не попадают. Факт ветки виден только в своей ветке; факт на весь чат — во всех.</p>
      <div class="row"><div class="field"><label>Таймлайн</label><input id="wc-timeline" value="${esc(ov.timeline || "")}" placeholder="не выбран"></div>
        <div class="field"><label>Вариант</label><input id="wc-variant" value="${esc(ov.variant || "")}" placeholder="не выбран"></div>
        <button class="btn btn-sm" data-act="wc-sel-save" style="margin-bottom:12px">Применить</button></div>
      <p class="hint">Факт с меткой таймлайна или варианта подаётся, только если здесь выбрана точно такая же метка.${w.lens && w.lens.timelineVariant ? ` В линзе персонажа указано «${esc(w.lens.timelineVariant)}» — это пометка линзы, сама она не выбирается.` : ""}</p></div>`;
    const d = m.worldEdit;
    let form = "";
    if (d) {
      const target = d.targetFactId ? (w.facts.find((f) => f.id === d.targetFactId) || w.excluded.find((x) => x.id === d.targetFactId)) : null;
      const val = d.fact || {};
      const list = (k) => esc((val[k] || []).join(", "));
      form = `<div class="block world-edit"><div class="block-title">${{ assert: "Новый факт мира", override: "Заменить факт", retract: "Убрать факт из мира" }[d.op]}</div>
        ${target ? `<p class="hint">Факт: «${esc(target.text)}»</p>` : ""}
        ${d.op !== "retract" ? `<div class="field"><label>Текст факта</label><textarea id="wc-text" placeholder="Утверждение о мире: «Кафе у кампуса закрылось на ремонт»">${esc(val.text || "")}</textarea></div>` : ""}
        ${d.op === "assert" ? `<div class="row"><div class="field"><label>Сущности</label><input id="wc-ent" value="${list("entities")}" placeholder="Тацуки, Ичиго"></div>
          <div class="field"><label>Темы</label><input id="wc-top" value="${list("topics")}" placeholder="учёба"></div></div>
          <div class="row"><div class="field"><label>Места</label><input id="wc-loc" value="${list("locations")}" placeholder="Каракура"></div>
          <div class="field"><label>Таймлайн</label><input id="wc-tl" value="${esc(val.timeline || "")}"></div><div class="field"><label>Вариант</label><input id="wc-vr" value="${esc(val.variant || "")}"></div></div>` : ""}
        ${d.op === "override" ? `<span class="help">Метки (сущности, темы, места, таймлайн) остаются как у факта.</span>` : ""}
        <div class="field"><label>Где действует</label>
          <label class="check"><input type="radio" name="wc-scope" value="branch" ${d.scope === "branch" ? "checked" : ""} ${w.canBranch ? "" : "disabled"}><span>В этой ветке${w.canBranch ? "" : "<small>Пока нет сообщений — привязать не к чему.</small>"}</span></label>
          <label class="check"><input type="radio" name="wc-scope" value="chat" ${d.scope === "chat" ? "checked" : ""}><span>Во всём чате<small>Во всех ветках этого чата. Другие чаты не затрагиваются.</small></span></label></div>
        <div class="row"><button class="btn btn-primary btn-sm" data-act="wc-save">${d.op === "retract" ? "Убрать" : "Сохранить"}</button><button class="btn btn-sm btn-ghost" data-act="wc-cancel">Отмена</button></div></div>`;
    }
    const facts = w.facts.map((f) => {
      const off = w.filteredIds.has(f.id) ? (w.filtered.find((x) => x.id === f.id) || {}).reason : "";
      return `<li class="${off ? "off" : ""}" data-wc-fact="${esc(f.id)}"><div>${esc(f.text)}</div>
        <div class="mt"><span class="tag">${esc(ORIGIN[f.origin] || f.origin)}</span>${f.reestablished ? `<span class="tag">возвращён</span>` : ""}${off ? `<span class="tag">${esc(FILTER[off] || off)}</span>` : ""}
          ${metaLine(f) ? `<small>${esc(metaLine(f))}</small>` : ""}<span style="flex:1"></span>
          <button class="tool" data-act="wc-override" data-id="${esc(f.id)}">Заменить</button><button class="tool" data-act="wc-retract" data-id="${esc(f.id)}">Убрать</button></div></li>`;
    }).join("");
    const retracted = w.excluded.filter((x) => x.reason === "retracted");
    const w1off = w.excluded.filter((x) => x.reason !== "retracted");
    const evs = w.events.slice().reverse().map((e) => `<li class="${e.active && e.applied ? "" : "off"}"><div><b>${esc(OPS[e.op] || e.op || "?")}</b> ${esc(e.text || "")}${e.targetFactId ? ` <small>→ ${esc(e.targetFactId)}</small>` : ""}</div>
      <div class="mt"><span class="tag">${e.scope === "chat" ? "весь чат" : e.scope === "branch" ? "ветка" : esc(e.scope || "?")}</span>
        <span class="tag">${e.active ? (e.applied ? "действует" : esc(e.reason)) : esc(e.reason || "не действует")}</span></div></li>`).join("");
    return head + form + `<div class="block"><div class="block-title">Действует сейчас <small>${w.facts.length}</small></div>
        <button class="btn btn-sm" data-act="wc-new">${icon("plus")}Добавить факт</button>
        <ul class="wc-list">${facts || `<li class="empty-note">Фактов нет.</li>`}</ul></div>
      ${retracted.length || w1off.length ? `<div class="block"><div class="block-title">Не действует</div><ul class="wc-list">
        ${retracted.map((x) => `<li class="off"><div>${esc(x.text)}</div><div class="mt"><span class="tag">убрано${x.scope === "chat" ? " во всём чате" : " в ветке"}</span><span style="flex:1"></span><button class="tool" data-act="wc-override" data-id="${esc(x.id)}">Вернуть с текстом</button></div></li>`).join("")}
        ${w1off.map((x) => `<li class="off"><div>${esc(x.text || x.id)}</div><div class="mt"><span class="tag">${esc({ "pack-disabled": "выключено в паке", "lens-disabled": "выключено линзой", "addition-id-collides": "повтор id" }[x.reason] || x.reason)}</span></div></li>`).join("")}</ul></div>` : ""}
      <details class="block"><summary class="block-title" style="cursor:pointer">История мира чата <small>${w.events.length}</small></summary>
        <p class="hint">События не переписываются: исправление — новая замена или убирание. События другой ветки или другого варианта ответа хранятся и снова действуют, когда вы туда вернётесь.</p>
        <ul class="wc-list wc-history">${evs || `<li class="empty-note">Пока пусто.</li>`}</ul></details>
      ${w.warnings.length ? `<div class="block"><div class="block-title">Предупреждения</div><ul class="wc-list">${w.warnings.map((x) => `<li class="off">${esc(x.message)}</li>`).join("")}</ul></div>` : ""}`;
  }

  const TRUNC = { history: "старая история", examples: "примеры речи", lore: "лорбук", world: "факты мира", "messenger.plans": "договорённости", "messenger.lists": "списки положения", experience: "опыт", postHistory: "указания после истории", persona: "описание собеседника", "card.scenario": "сценарий", authorSys: "указания автора", "card.chunks": "подробности карточки", "card.core": "вторичное ядро карточки" };
  const CHUNK_STATE = { selected: "в контексте", budget: "не поместилось", limit: "сверх лимита", "no-relation": "не относится" };
  // Карточка в Prism: ядро (явное или запасное), кандидаты подробностей, примеры речи.
  function cardDebug(c) {
    if (!c) return "";
    const CUT = { sentence: "по предложениям", word: "длинное предложение обрезано по слову", hard: "текст без пробелов обрезан по символам" };
    const tr = (c.core.truncated || []).map((x) => `${{ description: "описание", personality: "личность" }[x.field] || x.field} ${x.kept} из ${x.total} симв. (${CUT[x.cut] || "по предложениям"})`).join(", ");
    return `<details class="block exp-debug card-debug"><summary>Карточка: ядро и подробности</summary>
      <dl class="kv"><dt>Ядро</dt><dd>${c.core.source === "explicit" ? "задано в карточке" : "запасное — " + esc(c.core.reason)}; ${c.core.tokens} ток.${tr ? `; сокращено: ${esc(tr)} (остаток — в подробностях)` : ""}</dd>
        <dt>Примеры речи</dt><dd>${c.examples.kept} из ${c.examples.total}; ${esc(c.examples.rule)}</dd>
        <dt>Подробности</dt><dd>${c.selected.length ? esc(c.selected.join(", ")) : "нет"}${c.dropped.length ? `; не поместилось: ${esc(c.dropped.join(", "))}` : ""}</dd></dl>
      ${c.candidates.length ? `<table><thead><tr><th>Кусок</th><th>почему</th><th>итог</th></tr></thead><tbody>
      ${c.candidates.map((x) => `<tr class="${x.state === "selected" ? "sel" : ""}"><td>${esc(x.id)}</td><td>${esc(x.reasons.join("; ") || "нет связи с ходом")}</td><td>${CHUNK_STATE[x.state]}</td></tr>`).join("")}</tbody></table>` : ""}</details>`;
  }
  const LAYERS = [["frame", "Рамка", "#7fd1ff"], ["author", "Указания автора", "#c9a2ff"], ["card", "Карточка", "#b79cff"], ["memory", "Опыт", "#ff9ec7"], ["scene", "Сцена", "#ffd08a"], ["lore", "Лорбук", "#8ff0c3"], ["world", "Мир", "#9fd9a8"], ["messenger", "Среда", "#ffd08a"], ["history", "История", "#8d86a6"], ["post", "Протокол", "#5c5670"]];
  function prismTab(m) {
    const p = m.lastPrism;
    if (!p) return `<p class="hint">Здесь видно, что получает модель: указания отдельно, а карточку, опыт, сцену и мир — как данные с пометками.</p>
      <button class="btn btn-sm" data-act="prism-preview">${icon("prism")}Собрать для следующего хода</button>`;
    const r = p.report;
    const total = Object.values(r.layers).reduce((a, b) => a + b, 0) || 1;
    return `<div class="block"><div class="block-title">Контекст <small>${r.used} из ${r.budget} токенов, оценка</small></div>
        <div class="bar-meter">${LAYERS.map(([k, , c]) => `<i style="width:${(r.layers[k] / Math.max(total, r.budget)) * 100}%;background:${c}" title="${k}"></i>`).join("")}</div>
        <div class="legend">${LAYERS.filter(([k]) => r.layers[k]).map(([k, n, c]) => `<span style="--c:${c}">${n} ${r.layers[k]}</span>`).join("")}</div></div>
      ${r.overflow ? `<div class="block err-block">${icon("alert")}<div><b>Не помещается.</b> Даже после всех сокращений нужно ${r.used} из ${r.budget} токенов: рамка, сцена и последние сообщения больше, чем позволяет модель. Запрос не будет отправлен.</div></div>` : ""}
      <div class="block"><dl class="kv">
        <dt>Бюджет</dt><dd>${r.used} из ${r.budget} — ${r.fits ? "помещается" : "<b>не помещается</b>"}</dd>
        <dt>История</dt><dd>${r.historyKept} из ${r.historyTotal} сообщений</dd>
        <dt>Опыт</dt><dd>${r.experienceKept} ${R.plural(r.experienceKept, "запись", "записи", "записей")}${r.experienceDropped ? `, не поместилось ${r.experienceDropped}` : ""}${r.experienceVisible != null ? `; видно в ветке ${r.experienceVisible}` : ""}</dd>
        ${r.legacyUnscoped ? `<dt>Без привязки</dt><dd>${r.legacyUnscoped} — в контекст не идут</dd>` : ""}
        <dt>Лорбук</dt><dd>${r.loreKept} из ${r.loreMatched} сработавших${r.loreDropped ? `, не поместилось ${r.loreDropped}` : ""}</dd>
        ${r.world ? `<dt>Мир</dt><dd>${r.worldKept} ${R.plural(r.worldKept, "факт", "факта", "фактов")} из ${r.world.relevant} релевантных${r.worldDropped ? `, не поместилось ${r.worldDropped}` : ""}; действует ${r.world.effective}, проходит отбор по таймлайну ${r.world.eligible}</dd>` : ""}
        <dt>Примеры речи</dt><dd>${r.examples ? "вошли" : "не вошли"}</dd>
        ${r.sceneLegacyIgnored ? `<dt>Устаревшее в сцене</dt><dd>${r.sceneLegacyIgnored} — не действует (отношение, отметки сюжета)</dd>` : ""}
        ${r.scenarioState && r.scenarioState !== "none" ? `<dt>Сценарий</dt><dd>${{ included: "в контексте — исходные обстоятельства, до первого ответа на вашу реплику", "past-first-turn": "больше не подаётся: первый ответ на вашу реплику уже прозвучал", budget: "не поместился" }[r.scenarioState]}</dd>` : ""}
        ${r.postHistoryDisabled ? `<dt>После истории</dt><dd>указания автора выключены в настройках</dd>` : ""}
        ${(r.truncated || []).length ? `<dt>Сокращено</dt><dd>${r.truncated.map((t) => esc(TRUNC[t.layer] || t.layer) + (t.dropped ? ` −${t.dropped}` : "")).join(", ")}</dd>` : ""}
        </dl></div>
      ${cardDebug(r.card)}
      ${(r.expDebug || []).length ? `<details class="block exp-debug"><summary>Отбор опыта</summary>
        <table><thead><tr><th>Событие</th><th title="совпадение по темам">тема</th><th title="о присутствующих">участ.</th><th title="важность">важн.</th><th title="ранг свежести, только при равенстве">свеж.</th><th>итог</th></tr></thead><tbody>
        ${r.expDebug.map((x) => `<tr class="${x.selected ? "sel" : ""}"><td>${esc((x.event || "").slice(0, 60))}</td><td>${x.topic}</td><td>${x.participant}</td><td>${x.weight}</td><td>${x.recencyRank}</td><td>${x.selected ? "в контексте" : !x.visible ? esc(x.reason) : !x.active ? "не действует" : "не выбрано"}</td></tr>`).join("")}
        </tbody></table></details>` : ""}
      ${r.world && r.world.rows.length ? `<details class="block exp-debug world-debug"><summary>Отбор мира</summary>
        <table><thead><tr><th>Факт</th><th>почему</th><th>итог</th></tr></thead><tbody>
        ${r.world.rows.map((x) => { const kept = (r.worldIds || []).includes(x.id); return `<tr class="${kept ? "sel" : ""}"><td>${esc((x.text || "").slice(0, 60))}</td><td>${esc(x.reasons.join("; ") || "нет связи с ходом")}</td><td>${kept ? "в контексте" : x.selected ? "не поместилось" : x.omitted === "limit" ? "сверх лимита" : "не относится"}</td></tr>`; }).join("")}
        </tbody></table></details>` : ""}
      <div class="block"><div class="block-title">Что ушло в модель <button class="btn btn-sm btn-ghost" data-act="prism-preview">${icon("regen")}Обновить</button></div>
        <div class="code">${p.messages.map((x) => `<span class="role">${esc(x.role)}</span>\n${esc(x.content)}`).join("\n\n")}</div></div>`;
  }

  /* PERF-01: длительности этапов хода (в памяти, только числа). readyAfterReplyMs — от показа ответа до того,
     как переписка снова принимает ввод; sendToRoleplayMs — от нажатия «Отправить» до запроса к модели. */
  const TIMING = { userStateMs: "Разбор реплики пользователя", roleplayMs: "Запрос к RP-модели", assistantStateMs: "Разбор ответа персонажа",
    imagePrepareMs: "Подготовка промпта изображения", readyAfterReplyMs: "Ответ показан → можно писать", sendToRoleplayMs: "«Отправить» → запрос к модели",
    stateWaitTimeout: "Ожидание разбора прервано по времени", postReplyError: "Ошибка обработки после ответа" };
  function timingTab(m) {
    const sum = m.perfSummary || [];
    const rows = (m.perfLog || []).slice(-30).reverse();
    return '<div class="block"><div class="block-title">Сводка <small>в памяти, последние ' + (m.perfLog || []).length + '</small></div>'
      + (sum.length ? '<dl class="kv">' + sum.map((x) => '<dt>' + esc(TIMING[x.metric] || x.metric) + ' <small>' + esc(x.metric) + '</small></dt><dd>' + x.last + ' мс · медиана ' + x.median + ' мс · ' + x.count + '×</dd>').join("") + '</dl>'
        : '<p class="empty-note">Замеров пока нет: отправьте сообщение.</p>') + '</div>'
      + (rows.length ? '<div class="block"><div class="block-title">Последние замеры</div><ul class="wc-list">' + rows.map((r) =>
        '<li><b>' + esc(r.metric) + '</b> · ' + r.ms + ' мс' + (r.outcome ? ' · ' + esc(r.outcome) : '') + '<small> ' + esc(r.msgId || "") + '</small></li>').join("") + '</ul></div>' : '');
  }

  /* VC-04: read-only inspection of the EXACT strings submitted to the
     image backend, and their branch-scoped garment provenance. Never derive
     or store wardrobe facts here; diagnostics from old images may be absent. */
  function imageAuditTab(m) {
    const rows = (m.path || []).flatMap((message) => {
      const idx = message.swipeIdx || 0;
      const sw = Array.isArray(message.swipes) ? message.swipes[idx] : null;
      return (sw && Array.isArray(sw.images) ? sw.images : []).map((im) =>
        ({ image: im, messageId: message.id, swipeIdx: idx }));
    }).filter((x) => x.image && x.image.status === "done").slice(-5).reverse();
    if (!rows.length) return '<p class="empty-note">На активной ветке пока нет готовых изображений.</p>';
    const show = (title, value) => '<dt>' + esc(title) + '</dt><dd>' + esc(value == null ? "нет данных" : String(value)) + '</dd>';
    const joined = (list) => (Array.isArray(list) ? list.map((x) => typeof x === "string" ? x : x && x.item || "").join(", ") : "");
    return rows.map(({ image: im, messageId, swipeIdx }) => {
      const src = im.promptSources || {};
      const wear = src.wearConstraints || {}, plan = wear.plan || {}, audit = src.semanticAudit || {};
      const proof = [
        ["Источник", String(messageId) + " · swipe " + swipeIdx],
        ["Режим Draw", src.drawPromptMode || "неизвестно"],
        ["Участник", plan.actor || "не установлен"],
        ["Полный комплект", plan.complete === true ? "да" : plan.known ? "нет" : "неизвестно"],
        ["Сняты с тела", joined(plan.absentFromBody)],
        ["Видны вне тела", joined(plan.offBodyVisible)],
        ["Negative из одежды", wear.negative || ""],
        ["Проверка positive", audit.validated === true ? "подтверждена (" + audit.scope + ")" :
          audit.scope ? "не подтверждена (" + audit.scope + ")" : "не выполнялась"],
        ["Причины", joined(audit.issues)],
        ["Модель/бэкенд", im.backend || "неизвестно"],
      ];
      const mappings = Array.isArray(wear.items) ? wear.items.slice(0, 12)
        .map((x) => String(x && x.index != null ? x.index : "?") + ": " +
          String(x && x.item || "") + " → " + String(x && x.tag || "")).join("; ") : "";
      return '<div class="block"><div class="block-title">Изображение · ' + esc(im.id || "") + '</div>'
        + '<dl class="kv">' + proof.map(([k, v]) => show(k, v)).join("") +
          show("Английские ссылки на снятые предметы", mappings) + '</dl>'
        + '<p class="hint">Финальный positive (точно отправлен в backend)</p>'
        + '<pre class="debug-prompt">' + esc(String(im.prompt || "").slice(0, 6000)) + '</pre>'
        + '<p class="hint">Финальный negative (точно отправлен в backend)</p>'
        + '<pre class="debug-prompt">' + esc(String(im.negative || "").slice(0, 6000)) + '</pre></div>';
    }).join("");
  }

  function debugModal(m, modal) {
    const section = modal.section || "prism";
    const names = [["prism", "Prism"], ["tracker", "Трекер"], ["events", "События"], ["images", "Изображения"], ["errors", "Ошибки"], ["timing", "Тайминги"]];
    const v = m.messengerView;
    const status = v && v.stateStatus;
    let content = "";
    if (section === "prism") content = prismTab(m);
    else if (section === "timing") content = timingTab(m);
    else if (section === "images") content = imageAuditTab(m);
    else if (!v) content = '<p class="empty-note">Диагностика состояния доступна в переписке.</p>';
    else if (section === "tracker") {
      const w = v.world || {};
      const pairs = [["Местоположение", w.location], ["Занятие", w.activity], ["Рядом", (w.nearby || []).join(", ")], ["Происходит", (w.ongoing || []).join(", ")], ["Доступность", w.availability], ["Одежда", (w.visualWear || []).join(", ")], ["Комплект", w.wearComplete === true ? "полный: неуказанная одежда отсутствует" : "неполный/неизвестный"], ["Поза", w.visualPose], ["Причёска", w.visualHair]];
      const removed = Array.isArray(w.visualWearRemoved) ? w.visualWearRemoved : [];
      content = '<div class="block"><div class="block-title">Текущее состояние</div><dl class="kv">' + pairs.map(([k,val]) => '<dt>' + esc(k) + '</dt><dd>' + esc(val || "неизвестно") + '</dd>').join("") + '</dl></div>'
        + '<div class="block"><div class="block-title">Снятые вещи <small>' + removed.length + '</small></div>'
        + (removed.length ? '<ul class="wc-list">' + removed.map(x => '<li><b>' + esc(x.item || "") + '</b>'
          + '<div class="hint">' + esc(x.certainty === "established" ? "установлено" : "со слов") + ' · '
          + esc(x.source && x.source.messageId || "ручной/старый источник")
          + ' · swipe ' + esc(x.source && x.source.swipeIdx != null ? String(x.source.swipeIdx) : "?") + '</div>'
          + (x.source && x.source.evidence ? '<small>' + esc(x.source.evidence) + '</small>' : "")
          + '</li>').join("") + '</ul>' : '<p class="hint">Нет подтверждённых снятых вещей. Остальной наряд может быть неизвестен.</p>') + '</div>';
    } else if (section === "events") {
      const active = (m.path || []).flatMap(msg => {
        const sw = msg.swipes && msg.swipes[msg.swipeIdx || 0];
        return (sw && sw.stateEvents || []).map(e => ({ e, msg }));
      });
      const corrections = (m.path || []).flatMap(msg => {
        const sw = msg.swipes && msg.swipes[msg.swipeIdx || 0];
        return (sw && sw.stateCorrections || []).map(e => ({ e, msg }));
      });
      const rows = active.concat(corrections);
      const origin = m.chat && m.chat.initialWear;
      const originContent = origin && origin.kind === "initial-outfit" && origin.event
        ? '<div class="block"><div class="block-title">Начальный комплект (до сообщений)</div>'
          + '<p class="hint">Источник: скрытый запрос к RP Provider; полный перечень, отсутствующие вещи не подразумеваются.</p>'
          + '<p>' + esc(origin.event.action === "clear" ? "ничего не надето"
            : (origin.event.value || []).join(", ")) + '</p></div>'
        : '';
      content = originContent + '<div class="block"><div class="block-title">События активной ветки <small>' + rows.length + '</small></div>'
        + (rows.length ? '<ul class="wc-list">' + rows.map(({e,msg}) =>
            '<li><span class="tag">' + esc(e.actor || "") + '</span> <b>' + esc(e.field || "") + '</b> · ' + esc(e.action || "")
            + '<div>' + esc(Array.isArray(e.value) ? e.value.join(", ") : e.value == null ? "" : String(e.value)) + '</div>'
            + '<small>' + esc(e.certainty || "") + ' · ' + esc(msg.id || "") + '</small></li>').join("") + '</ul>'
          : '<p class="empty-note">Извлечённых событий в активной ветке нет.</p>') + '</div>'
        + '<div class="block"><div class="block-title">Старые изменения среды <small>' + (v.events || []).length + '</small></div>'
        + ((v.events || []).length ? '<ul class="wc-list">' + v.events.slice().reverse().map(e =>
          '<li>' + esc(e.id || "") + ' · ' + (e.active ? "действует" : esc(e.reason || "не действует")) + '</li>').join("") + '</ul>'
          : '<p class="empty-note">Нет.</p>') + '</div>';
    } else {
      // The Observer status above is distinct from failed image translation.
      // Show only the latest failed image's bounded, developer-only diagnostic.
      const lastFailure = (m.path || []).flatMap(msg => {
        const sw = msg.swipes && msg.swipes[msg.swipeIdx || 0];
        return sw && Array.isArray(sw.images) ? sw.images : [];
      }).filter(im => im && im.status === "error" && im.translationFailure).slice(-1)[0];
      const diagnostic = lastFailure && lastFailure.translationFailure;
      const imageIssue = diagnostic
        ? '<div class="block"><div class="block-title">Последняя ошибка перевода Draw</div>'
          + '<p>' + esc(diagnostic.reason || lastFailure.error || "неизвестна") + '</p>'
          + (diagnostic.responsePreview ? '<div class="hint">Ответ переводчика (до 600 символов; только данные)</div>'
            + '<pre class="debug-prompt">' + esc(diagnostic.responsePreview) + '</pre>' : '') + '</div>'
        : '';
      const init = m.chat && m.chat.initialOutfitCheck;
      const initIssue = init && init.status === "error"
        ? '<div class="block"><div class="block-title">Начальная одежда: ошибка инициализации</div>'
          + '<p class="hint">Начальный комплект не был записан. Одежда осталась неизвестной; это не означает отсутствие одежды.</p>'
          + '<p>Причина: ' + esc(init.reason || "неизвестна") + '</p></div>'
        : '';
      content = initIssue + '<div class="block"><div class="block-title">Анализ последнего сообщения</div><p class="hint">' + (v.statePending ? "Анализ выполняется…" : status ? esc(status.status) + " · событий: " + (Number(status.eventCount) || 0) : "Анализ ещё не выполнялся") + '</p>'
        + (status && status.issues ? '<ul class="wc-list">' + status.issues.map(x => '<li>' + esc(x) + '</li>').join("") + '</ul>' : "")
        + '<button class="btn btn-sm" data-act="state-retry">Повторить анализ</button></div>'
        + imageIssue
        + (v.warnings || []).map(x => '<p class="hint">' + esc(x.message || "") + '</p>').join("");
    }
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal debug-modal" role="dialog" aria-modal="true" aria-label="Debug">
      <div class="modal-head"><h2>Debug — ${esc(m.card ? m.card.name : "чат")}</h2>
        <button class="btn btn-sm btn-ghost" data-act="debug-copy" title="Скопировать текущий раздел Debug">Копировать</button>
        <button class="icon-btn" data-act="modal-close" title="Закрыть">${icon("x")}</button></div>
      <nav class="debug-tabs">${names.map(([id,title]) => `<button class="dtab ${id === section ? "on" : ""}" data-act="debug-section" data-section="${id}">${title}</button>`).join("")}</nav>
      <div class="modal-body debug-body">${content}</div></div></div>`;
  }
  Object.assign((PRP.views = PRP.views || {}), { drawer, debugModal });
})(typeof window !== "undefined" ? window : globalThis);
