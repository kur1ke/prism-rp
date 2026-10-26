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
    const targetCard = ((m.cards || []).find((c) => c.id === modal.cardId)) || m.card;
    const tz = modal.timeZone || MT.systemTimeZone();
    const manual = modal.timeMode === "manual";
    if (modal.creating) return `<div class="modal-wrap"><div class="modal narrow ms-new" role="dialog" aria-modal="true"
      aria-label="Создание переписки" aria-busy="true">
      <div class="modal-head"><h2>Создаём переписку${targetCard ? " с " + esc(targetCard.name) : ""}</h2></div>
      <div class="modal-body"><div class="block" role="status" aria-live="polite">
        <p class="lead"><span class="ms-create-spin" aria-hidden="true"></span>Определяем начальное состояние персонажа…</p>
        <p class="hint">Выполняется один скрытый запрос к RP-модели. Сообщение в чат не добавляется.</p>
        <p class="hint">Окно закроется, когда переписка будет готова.</p>
      </div><div class="modal-foot"><button class="btn btn-primary" disabled aria-disabled="true">Создаём…</button></div></div>
    </div></div>`;
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal narrow ms-new" role="dialog" aria-modal="true" aria-label="Новая переписка">
      <div class="modal-head"><h2>Новая переписка${targetCard ? " с " + esc(targetCard.name) : ""}</h2>
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
        <p class="hint">Только исправление неверно определённого факта. Повседневное состояние отслеживается автоматически; изображения его не переписывают.</p>
        ${fld("visualWear", "Одежда (через запятую)", "", (w.visualWear || []).join(", "))}${fld("visualPose", "Поза", "", w.visualPose || "")}${fld("visualHair", "Причёска", "", w.visualHair || "")}
        <div class="field"><label>Доступность</label><select id="env-availability"><option value="">не менять</option>${AVAIL.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
        <div class="field"><label>Где действует</label>${scopeRadios("env-scope", d.scope)}</div>
        <div class="row"><button class="btn btn-primary btn-sm" data-act="env-save">Сохранить</button><button class="btn btn-sm btn-ghost" data-act="env-cancel">Отмена</button></div></div>` : "";
    const evs = v.events.slice().reverse().map((e) => {
      const ev = (env.events || []).find((x) => x.id === e.id) || {};
      return `<li class="${e.active ? "" : "off"}"><div>${esc(OPS_LINE(ev.patch))}</div>
        <div class="mt"><span class="tag">${e.scope === "chat" ? "вся переписка" : "ветка"}</span>${ev.effectiveAt ? `<span class="tag">${esc(MT.format(MT.toMs(ev.effectiveAt), tz))}</span>` : ""}<span class="tag">${e.active ? "действует" : esc(e.reason || "не действует")}</span></div></li>`;
    }).join("");
    const rows = (items) => items.filter(([,value]) => value != null && value !== "" && value !== "unknown").map(([label,value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("");
    const last = w.lastReported || {};
    const position = rows([["Где", w.location], ["Чем занят(а)", w.activity],
      ["Последнее сообщение о месте", last.location ? last.location.value + " (" + MT.format(MT.toMs(last.location.at), tz) + ")" : null],
      ["Последнее сообщение о занятии", last.activity ? last.activity.value + " (" + MT.format(MT.toMs(last.activity.at), tz) + ")" : null],
      ["Рядом", (w.nearby || []).join(", ")], ["Происходит", (w.ongoing || []).join(", ")],
      ["Доступность", w.availability && w.availability !== "unknown" ? availWord(w.availability) : ""]]);
    const appearance = rows([["Одежда", (w.visualWear || []).join(", ")], ["Поза", w.visualPose], ["Причёска", w.visualHair]]);
    return `<div class="block"><div class="block-title">Положение ${esc(m.card.name)}</div>
        ${position ? `<dl class="kv env-world">${position}</dl>` : '<p class="empty-note">Пока нет сведений о положении.</p>'}
        ${appearance ? `<div class="block-title" style="margin-top:20px">Внешний вид</div><dl class="kv env-world">${appearance}</dl>` : ""}
        ${d ? "" : `<button class="btn btn-sm btn-ghost" style="margin-top:14px" data-act="env-edit">${icon("edit")}Исправить состояние</button>`}</div>
      ${form}
`;
  }

  // Отдельное окно управления временем переписки: не перегружает «Среду».
  function messengerTimeModal(m) {
    const v = m.messengerView;
    if (!v) return "";
    const env = v.env, tz = env.timeZone;
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="Время переписки">
      <div class="modal-head"><h2>Время переписки</h2><button class="icon-btn" data-act="modal-close" title="Закрыть">${icon("x")}</button></div>
      <div class="modal-body">
              <div class="block"><div class="block-title">Текущее время</div>
                <dl class="kv"><dt>Сейчас</dt><dd id="env-now">${v.now != null ? esc(MT.format(v.now, tz)) : "не задано"}</dd>
                  </dl>
                <div class="field"><label>Часовой пояс</label><input id="env-tz" list="tz-list" value="${esc(tz)}">${zoneList()}</div>
                <div class="field"><label>Время</label>
                  <label class="check"><input type="radio" name="env-mode" value="live" ${env.timeMode === "live" ? "checked" : ""}><span>Текущее</span></label>
                  <label class="check"><input type="radio" name="env-mode" value="manual" ${env.timeMode === "manual" ? "checked" : ""}><span>Задаю сам(а)</span></label></div>
                ${env.timeMode === "manual" ? `<div class="field"><label>Сейчас в переписке</label><input id="env-manual" type="datetime-local" value="${esc(MT.toLocalInput(MT.toMs(env.manualNow), tz))}"></div>
                  <div class="quick">${[[15, "+15 мин"], [60, "+1 час"], [180, "+3 часа"], [1440, "+1 день"]].map(([n, l]) => `<button class="btn btn-sm btn-ghost" data-act="env-advance" data-min="${n}">${icon("clock")}${l}</button>`).join("")}</div>` : ""}
                <button class="btn btn-sm" data-act="env-time-save">Применить</button>
                <p class="hint">Метки времени уже отправленных сообщений не меняются.</p></div>
      </div></div></div>`;
  }

  // Строка статуса в шапке переписки — из среды (не из сцены RP).
  function messengerStatus(world) {
    if (!world) return "";
    return [world.availability && world.availability !== "unknown" ? availWord(world.availability) : "", world.location, world.activity].filter(Boolean).join(" · ");
  }

  Object.assign((PRP.views = PRP.views || {}), { newMessengerModal, messengerTimeModal, envTab, messengerStatus });
})(typeof window !== "undefined" ? window : globalThis);
