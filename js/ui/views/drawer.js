/* Prism RP — выдвижная панель: сцена, опыт, Prism (что ушло в модель). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Выдвижная панель ─────────────────────────────────────────────── */
  function drawer(m) {
    const tabs = [["scene", "Сцена", "scene"], ["memory", "Опыт", "memory"], ["prism", "Prism", "prism"]];
    let body = "";
    if (!m.chat) body = `<p class="empty-note">Откройте чат.</p>`;
    else if (m.tab === "scene") body = sceneTab(m);
    else if (m.tab === "memory") body = memoryTab(m);
    else body = prismTab(m);
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
      const ch = key ? st.chars[key] : { wear: [], pose: "", mood: "", rel: 0, relLog: [] };
      const isMain = n.toLowerCase() === m.card.name.toLowerCase();
      return `<div class="panel" data-person="${esc(n)}">
        <div class="who">${R.avatar(isMain ? m.card : { name: n }, 34)}<b>${esc(n)}</b>
          ${st.present.some((p) => p.toLowerCase() === n.toLowerCase()) ? `<span class="tag">в сцене</span>` : `<button class="tool" data-act="sc-enter" data-name="${esc(n)}">в сцену</button>`}</div>
        <div class="field"><span class="label">${icon("shirt", "")} Одежда</span>
          <div class="chips">${ch.wear.map((w) => `<span class="chip"><span>${esc(w)}</span><button data-act="sc-remove" data-name="${esc(n)}" data-item="${esc(w)}" title="Снять">${icon("x")}</button></span>`).join("")}
            <input class="chip-add" data-sc-add="${esc(n)}" placeholder="+ надеть…"></div></div>
        <div class="row"><div class="field"><label>Поза, где</label><input data-sc-field="pose" data-name="${esc(n)}" value="${esc(ch.pose)}" placeholder="сидит у окна"></div>
          <div class="field"><label>Настроение</label><input data-sc-field="mood" data-name="${esc(n)}" value="${esc(ch.mood)}" placeholder="спокойна"></div></div>
        ${isMain ? `<div class="field"><label>Как относится к вам</label>
          <div class="rel"><input type="range" min="-10" max="10" step="1" value="${ch.rel}" data-sc-rel="${esc(n)}" aria-label="Отношение">
          <output id="rel-out">${esc(SC.relWord(ch.rel))} (${ch.rel > 0 ? "+" : ""}${ch.rel})</output>
          ${ch.relLog.length ? `<div class="rel-log">${ch.relLog.slice(-3).reverse().map((r) => esc(`${r.delta > 0 ? "+" : ""}${r.delta} — ${r.why || "без причины"}`)).join("<br>")}</div>` : ""}</div>
          <span class="help">Это рабочая оценка: модель видит её словом и с причиной, а не как приказ.</span></div>` : ""}
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
      <div class="block"><div class="block-title">Как модель ведёт сцену</div>
        <label class="check"><input type="checkbox" data-set="sceneProtocol" ${m.settings.sceneProtocol ? "checked" : ""}><span>Модель сообщает изменения сама<small>В конце ответа она пишет короткую служебную строку; приложение применяет её и прячет из текста.</small></span></label>
        <details><summary class="hint" style="cursor:pointer">Начальная сцена в текстовом виде</summary>
          <div class="field" style="margin-top:8px"><textarea id="scene-init" placeholder="time=14.05 18:00; loc=Кафе; Химэ.wear=белая блузка, юбка">${esc(m.chat.sceneInit || "")}</textarea></div>
          <button class="btn btn-sm" data-act="scene-init-save">Сохранить</button></details>
      </div>`;
  }

  function memoryTab(m) {
    const d = m.expDraft;
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
      <button class="btn btn-sm" data-act="exp-new">${icon("plus")}Добавить событие</button></div>
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

  const TRUNC = { history: "старая история", examples: "примеры речи", lore: "лорбук", experience: "опыт", postHistory: "указания после истории", persona: "описание собеседника", "card.scenario": "сценарий", authorSys: "указания автора", "card.description": "описание" };
  const LAYERS = [["frame", "Рамка", "#7fd1ff"], ["author", "Указания автора", "#c9a2ff"], ["card", "Карточка", "#b79cff"], ["memory", "Опыт", "#ff9ec7"], ["scene", "Сцена", "#ffd08a"], ["lore", "Лорбук", "#8ff0c3"], ["history", "История", "#8d86a6"], ["post", "Протокол", "#5c5670"]];
  function prismTab(m) {
    const p = m.lastPrism;
    if (!p) return `<p class="hint">Здесь видно, что получает модель: карточку как склонности, опыт как свидетельства, сцену как факты.</p>
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
        <dt>Примеры речи</dt><dd>${r.examples ? "вошли" : "не вошли"}</dd>
        ${r.postHistoryDisabled ? `<dt>После истории</dt><dd>указания автора выключены в настройках</dd>` : ""}
        ${(r.truncated || []).length ? `<dt>Сокращено</dt><dd>${r.truncated.map((t) => esc(TRUNC[t.layer] || t.layer) + (t.dropped ? ` −${t.dropped}` : "") + (t.detail && t.layer === "card.description" ? ` (${esc(t.detail)})` : "")).join(", ")}</dd>` : ""}
        </dl></div>
      ${(r.expDebug || []).length ? `<details class="block exp-debug"><summary>Отбор опыта</summary>
        <table><thead><tr><th>Событие</th><th title="совпадение по темам">тема</th><th title="о присутствующих">участ.</th><th title="важность">важн.</th><th title="ранг свежести, только при равенстве">свеж.</th><th>итог</th></tr></thead><tbody>
        ${r.expDebug.map((x) => `<tr class="${x.selected ? "sel" : ""}"><td>${esc((x.event || "").slice(0, 60))}</td><td>${x.topic}</td><td>${x.participant}</td><td>${x.weight}</td><td>${x.recencyRank}</td><td>${x.selected ? "в контексте" : !x.visible ? esc(x.reason) : !x.active ? "не действует" : "не выбрано"}</td></tr>`).join("")}
        </tbody></table></details>` : ""}
      <div class="block"><div class="block-title">Что ушло в модель <button class="btn btn-sm btn-ghost" data-act="prism-preview">${icon("regen")}Обновить</button></div>
        <div class="code">${p.messages.map((x) => `<span class="role">${esc(x.role)}</span>\n${esc(x.content)}`).join("\n\n")}</div></div>`;
  }

  Object.assign((PRP.views = PRP.views || {}), { drawer });
})(typeof window !== "undefined" ? window : globalThis);
