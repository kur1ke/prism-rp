/* Prism RP — разметка переписки: окно новой переписки (настройка времени) и вкладка «Среда» панели чата.
   Только разметка: правила среды, времени и состояния переписки — в messenger/*. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, MT = PRP.messengerTime;
  const { esc, icon } = R;

  const ZONES = ["Europe/Moscow", "Europe/Kaliningrad", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Irkutsk",
    "Asia/Vladivostok", "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Europe/London", "Europe/Berlin", "Europe/Kyiv", "America/New_York", "America/Los_Angeles", "UTC"];
  const AVAIL = [["available", "свободен(а)"], ["busy", "занят(а)"], ["away", "не на связи"], ["unknown", "неизвестно"]];
  const availWord = (a) => (AVAIL.find((x) => x[0] === a) || AVAIL[3])[1];
  const zoneList = () => `<datalist id="tz-list">${ZONES.map((z) => `<option value="${z}">`).join("")}</datalist>`;

  // Окно новой переписки: режим выбран (переписка), задаётся только время.
  function newMessengerModal(m, modal) {
    const tz = modal.timeZone || MT.systemTimeZone();
    const manual = modal.timeMode === "manual";
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal narrow ms-new" role="dialog" aria-modal="true" aria-label="Новая переписка">
      <div class="modal-head"><h2>Новая переписка${m.card ? " с " + esc(m.card.name) : ""}</h2>
        <button class="icon-btn" data-act="modal-close" title="Отмена">${icon("x")}</button></div>
      <div class="modal-body"><p class="lead">Переписка — отдельный мир: режим потом не меняется. Сцену с этим персонажем можно начать отдельно.</p>
        <div class="field"><label>Часовой пояс переписки</label><input id="ms-tz" list="tz-list" value="${esc(tz)}">${zoneList()}</div>
        <div class="field"><label>Время</label>
          <label class="check"><input type="radio" name="ms-mode" value="live" ${manual ? "" : "checked"}><span>Текущее<small>Сообщения получают текущее время; время между сообщениями — настоящее.</small></span></label>
          <label class="check"><input type="radio" name="ms-mode" value="manual" ${manual ? "checked" : ""}><span>Задаю сам(а)<small>Время стоит, пока вы его не сдвинете.</small></span></label></div>
        <div class="field"><label>Начальные дата и время (для «задаю сам»)</label><input id="ms-manual" type="datetime-local" value="${esc(modal.manualLocal || "")}"></div>
        <div class="modal-foot"><button class="btn" data-act="modal-close">Отмена</button>
          <button class="btn btn-primary" data-act="ms-create">${icon("bubble")}Начать переписку</button></div></div></div></div>`;
  }

  const OPS_LINE = (p) => Object.keys(p || {}).map((k) => {
    const v = p[k];
    const name = { location: "где", activity: "чем занят(а)", nearby: "рядом", ongoing: "происходит", availability: "доступность", visualWear: "одежда", visualPose: "поза", visualHair: "причёска" }[k] || k;
    if (v == null || (Array.isArray(v) && !v.length)) return name + ": очищено";
    return name + ": " + (k === "availability" ? availWord(v) : Array.isArray(v) ? v.join(", ") : v);
  }).join(" · ");

  // Вкладка «Среда» (только у переписки).
  function envTab(m) {
    const v = m.messengerView;
    if (!v) return `<p class="empty-note">Откройте переписку.</p>`;
    const env = v.env, w = v.world, c = v.conversation, tz = env.timeZone;
    const d = m.envEdit;
    const scopeRadios = (name, cur) => `<label class="check"><input type="radio" name="${name}" value="branch" ${cur === "branch" ? "checked" : ""} ${v.canBranch ? "" : "disabled"}><span>В этой ветке${v.canBranch ? "" : "<small>Пока нет сообщений — привязать не к чему.</small>"}</span></label>
      <label class="check"><input type="radio" name="${name}" value="chat" ${cur === "chat" ? "checked" : ""}><span>Во всей переписке</span></label>`;
    const fld = (k, label, val, ph) => `<div class="field"><label>${label}</label><input id="env-${k}" value="${esc(val)}" placeholder="${esc(ph)}">
      <label class="check sm"><input type="checkbox" data-env-clear="${k}"><span>очистить</span></label></div>`;
    const form = d ? `<div class="block env-edit"><div class="block-title">Изменить положение</div>
        <p class="hint">Пустое поле — не менять. «Очистить» — сделать неизвестным.</p>
        ${fld("location", "Где", "", w.location || "")}${fld("activity", "Чем занят(а)", "", w.activity || "")}
        ${fld("nearby", "Рядом (через запятую)", "", (w.nearby || []).join(", "))}${fld("ongoing", "Происходит (через запятую)", "", (w.ongoing || []).join(", "))}
        <div class="block-title" style="margin-top:16px">Внешний вид для изображений</div>
        <p class="hint">Только установленное явно. Из генераций изображений это состояние не обновляется. Правка относится к выбранной области и времени переписки.</p>
        ${fld("visualWear", "Одежда (через запятую)", "", (w.visualWear || []).join(", "))}${fld("visualPose", "Поза", "", w.visualPose || "")}${fld("visualHair", "Причёска", "", w.visualHair || "")}
        <div class="field"><label>Доступность</label><select id="env-availability"><option value="">не менять</option>${AVAIL.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
        <div class="field"><label>Где действует</label>${scopeRadios("env-scope", d.scope)}</div>
        <div class="row"><button class="btn btn-primary btn-sm" data-act="env-save">Сохранить</button><button class="btn btn-sm btn-ghost" data-act="env-cancel">Отмена</button></div></div>` : "";
    const markers = c.promises.concat(c.plans).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const stWord = { open: "открыто", done: "выполнено", cancelled: "отменено" };
    const evs = v.events.slice().reverse().map((e) => {
      const ev = (env.events || []).find((x) => x.id === e.id) || {};
      return `<li class="${e.active ? "" : "off"}"><div>${esc(OPS_LINE(ev.patch))}</div>
        <div class="mt"><span class="tag">${e.scope === "chat" ? "вся переписка" : "ветка"}</span>${ev.effectiveAt ? `<span class="tag">${esc(MT.format(MT.toMs(ev.effectiveAt), tz))}</span>` : ""}<span class="tag">${e.active ? "действует" : esc(e.reason || "не действует")}</span></div></li>`;
    }).join("");
    return `<div class="block"><div class="block-title">Положение ${esc(m.card.name)}</div>
        <p class="hint">Текущие обстоятельства вне переписки. Указанные вами положения и визуальные детали сохраняются между изображениями; ответы модели и картинки не переписывают их автоматически.</p>
        <dl class="kv env-world"><dt>Где</dt><dd>${esc(w.location || "неизвестно")}</dd><dt>Чем занят(а)</dt><dd>${esc(w.activity || "неизвестно")}</dd>
          <dt>Рядом</dt><dd>${esc((w.nearby || []).join(", ") || "—")}</dd><dt>Происходит</dt><dd>${esc((w.ongoing || []).join(", ") || "—")}</dd>
          <dt>Доступность</dt><dd>${esc(availWord(w.availability))}</dd></dl>
        <div class="block-title" style="margin-top:14px">Внешний вид для изображений</div>
        <dl class="kv env-world"><dt>Одежда</dt><dd>${esc((w.visualWear || []).join(", ") || "неизвестно")}</dd><dt>Поза</dt><dd>${esc(w.visualPose || "неизвестно")}</dd><dt>Причёска</dt><dd>${esc(w.visualHair || "неизвестно")}</dd></dl>
        ${d ? "" : `<button class="btn btn-sm" data-act="env-edit">${icon("edit")}Изменить положение</button>`}</div>
      ${form}
      <div class="block"><div class="block-title">Время переписки</div>
        <dl class="kv"><dt>Сейчас</dt><dd id="env-now">${v.now != null ? esc(MT.format(v.now, tz)) : "не задано"}</dd>
          <dt>Последнее сообщение</dt><dd>${c.lastMessageAt ? esc(MT.format(MT.toMs(c.lastMessageAt), tz)) : "время неизвестно"}</dd>
          <dt>Прошло</dt><dd>${esc(c.elapsedSinceLastMessage || "—")}</dd></dl>
        <div class="field"><label>Часовой пояс</label><input id="env-tz" list="tz-list" value="${esc(tz)}">${zoneList()}</div>
        <div class="field"><label>Время</label>
          <label class="check"><input type="radio" name="env-mode" value="live" ${env.timeMode === "live" ? "checked" : ""}><span>Текущее</span></label>
          <label class="check"><input type="radio" name="env-mode" value="manual" ${env.timeMode === "manual" ? "checked" : ""}><span>Задаю сам(а)</span></label></div>
        ${env.timeMode === "manual" ? `<div class="field"><label>Сейчас в переписке</label><input id="env-manual" type="datetime-local" value="${esc(MT.toLocalInput(MT.toMs(env.manualNow), tz))}"></div>
          <div class="quick">${[[15, "+15 мин"], [60, "+1 час"], [180, "+3 часа"], [1440, "+1 день"]].map(([n, l]) => `<button class="btn btn-sm btn-ghost" data-act="env-advance" data-min="${n}">${icon("clock")}${l}</button>`).join("")}</div>` : ""}
        <button class="btn btn-sm" data-act="env-time-save">Применить</button>
        <p class="hint">Метки времени уже отправленных сообщений не меняются.</p></div>
      <div class="block"><div class="block-title">Переписка</div>
        <dl class="kv"><dt>Последним писал(а)</dt><dd>${c.lastSender === "user" ? esc(m.persona.name) : c.lastSender === "assistant" ? esc(m.card.name) : "никто"}</dd>
          <dt>Без ответа</dt><dd>${c.unansweredUserCount ? c.unansweredUserCount + " от " + esc(m.persona.name) : "—"}</dd>
          <dt>Состояние</dt><dd>${esc(String(c.reason || "").replace(/\{\{user\}\}/g, m.persona.name).replace(/\{\{char\}\}/g, m.card.name))}</dd></dl>
        <div class="block-title" style="margin-top:10px">Договорённости <small>${markers.length}</small></div>
        <p class="hint">Только то, что вы отметили сами; из сообщений ничего не извлекается.</p>
        <ul class="wc-list">${markers.map((x) => `<li class="${x.status === "open" ? "" : "off"}"><div>${esc(x.text)}</div><div class="mt"><span class="tag">${x.kind === "promise" ? "обещание" : "план"}</span><span class="tag">${stWord[x.status]}</span>
          ${x.status === "open" ? `<span style="flex:1"></span><button class="tool" data-act="env-mk-status" data-id="${esc(x.id)}" data-status="done">Выполнено</button><button class="tool" data-act="env-mk-status" data-id="${esc(x.id)}" data-status="cancelled">Отменено</button>` : ""}</div></li>`).join("") || `<li class="empty-note">Нет.</li>`}</ul>
        <div class="row" style="margin-top:8px"><select id="env-mk-kind"><option value="promise">обещание</option><option value="plan">план</option></select>
          <input id="env-mk-text" placeholder="«Созвонимся завтра вечером»"></div>
        <div class="field">${scopeRadios("env-mk-scope", v.canBranch ? "branch" : "")}</div>
        <button class="btn btn-sm" data-act="env-mk-add">${icon("plus")}Отметить</button></div>
      <details class="block"><summary class="block-title" style="cursor:pointer">История среды <small>${v.events.length}</small></summary>
        <p class="hint">События не переписываются. События другой ветки или другого варианта ответа хранятся и снова действуют, когда вы туда вернётесь.</p>
        <ul class="wc-list">${evs || `<li class="empty-note">Пока пусто.</li>`}</ul></details>
      ${v.warnings.length ? `<div class="block"><div class="block-title">Предупреждения</div><ul class="wc-list">${v.warnings.map((x) => `<li class="off">${esc(String(x.message).replace(/\{\{user\}\}/g, m.persona.name).replace(/\{\{char\}\}/g, m.card.name))}</li>`).join("")}</ul></div>` : ""}`;
  }

  // Строка статуса в шапке переписки — из среды (не из сцены RP).
  function messengerStatus(world) {
    if (!world) return "";
    return [world.availability && world.availability !== "unknown" ? availWord(world.availability) : "", world.location, world.activity].filter(Boolean).join(" · ");
  }

  Object.assign((PRP.views = PRP.views || {}), { newMessengerModal, envTab, messengerStatus });
})(typeof window !== "undefined" ? window : globalThis);
