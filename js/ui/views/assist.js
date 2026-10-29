/* Prism RP — экран ассистента (разговор с моделью вне игры) и его поповеры. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Ассистент: разговор с моделью вне игры ───────────────────────── */
  function assist(m) {
    const a = m.assist;
    const AS = PRP.assist;
    const cd = m.assistCard, ch = m.assistChat;
    const ctxLabel = cd ? `${esc(cd.name)}${ch ? " + чат" : ""}` : "Без персонажа";
    const head = `<header class="chat-head assist-head">
      <button class="icon-btn only-narrow" data-act="rail" title="Меню">${icon("menu")}</button>
      <div class="assist-mark">${icon("assist")}</div>
      <div class="head-who"><div class="head-name">Ассистент</div><span class="head-scene">${esc(a.messages.length ? a.title : "Разговор с моделью вне игры")}</span></div>
      <div class="head-tools">
        <button class="pill" data-act="assist-ctx" title="Что ассистент видит: карточку персонажа и выдержку из чата">${cd ? R.avatar(cd, 18) : icon("card")}<span>${ctxLabel}</span></button>
        <button class="pill" data-act="vision-test" title="Проверить распознавание изображений через Perchance">Тест Vision</button>
        <button class="icon-btn" data-act="assist-list" title="Все разговоры">${icon("clock")}</button>
        <button class="icon-btn" data-act="assist-new" title="Новый разговор">${icon("plus")}</button>
        ${a.messages.length ? `<button class="icon-btn" data-act="assist-del" title="Удалить разговор">${icon("trash")}</button>` : ""}
      </div></header>`;
    const empty = !a.messages.length ? `<div class="assist-empty">
        <div class="assist-hero">${icon("assist")}</div>
        <h2>О чём поговорим?</h2>
        <p>Здесь модель — ваш помощник, а не персонаж. Спросите совета по карточке, сцене или настройкам. ${cd ? `Ассистент видит карточку ${esc(cd.name)}${ch ? " и выдержку из выбранного чата" : ""}.` : "Подключите персонажа кнопкой вверху — тогда ассистент увидит его карточку и, по желанию, чат."}</p>
        <div class="starters">${AS.starters(!!cd, !!ch).map((x) => `<button class="starter" data-act="assist-starter" data-q="${esc(x.q)}">${esc(x.t)}</button>`).join("")}</div>
      </div>` : "";
    const feed = a.messages.map((msg, i) => {
      const live = m.gen && m.gen.assist && m.gen.msgId === msg.id;
      const last = i === a.messages.length - 1;
      const text = live ? m.gen.raw : msg.text;
      const th = OA.splitThink(text || "");
      const reasoning = live ? (m.gen.reasoning || th.reasoning) : msg.reasoning;
      const body = msg.role === "user" ? `<div class="bubble-plain">${esc(msg.text).replace(/\n/g, "<br>")}</div>`
        : `${reasoning ? `<details class="think"><summary>${icon("think")}Рассуждение модели</summary><div>${esc(reasoning)}</div></details>` : ""}<div class="md ${live ? "cursor" : ""}" id="text-${msg.id}">${R.md(th.text)}</div>`;
      return `<article class="aturn ${msg.role} ${last ? "last" : ""}" data-mid="${esc(msg.id)}">
        ${body}
        ${msg.error ? `<div class="err">${icon("alert")}<span>${esc(msg.error)}</span></div>` : ""}
        ${live ? "" : `<div class="tools">
          <button class="tool" data-act="assist-copy" data-id="${esc(msg.id)}">${icon("copy")}Скопировать</button>
          ${msg.role === "assistant" && last ? `<button class="tool" data-act="assist-regen" data-id="${esc(msg.id)}">${icon("regen")}Другой ответ</button>` : ""}
          ${msg.role === "user" ? `<button class="tool" data-act="assist-edit" data-id="${esc(msg.id)}" title="Вернуть в поле ввода и переспросить">${icon("edit")}Изменить</button>` : ""}
          <button class="tool" data-act="assist-msg-del" data-id="${esc(msg.id)}" title="Удалить это и всё после">${icon("trash")}</button></div>`}
      </article>`;
    }).join("");
    const p = m.provider;
    const composer = `<div class="composer-wrap"><div class="composer">
      <textarea id="input" rows="1" placeholder="Спросите ассистента…" aria-label="Сообщение ассистенту"></textarea>
      <div class="composer-bar">
        <button class="pill" data-act="model-pop" title="Модель">${icon("cpu")}<span>${esc(p ? p.label : "Выбрать модель")}</span></button>
        <span class="spacer"></span>
        ${m.gen ? `<button class="send stop" data-act="stop" title="Остановить">${icon("stop")}</button>` : `<button class="send" data-act="send" title="Отправить (Enter)">${icon("send")}</button>`}
      </div></div></div>`;
    return `<section class="chat assist">${head}<div class="feed" id="feed"><div class="feed-inner" id="feed-inner">${empty}${feed}</div></div><div id="vision-test-status" role="status" aria-live="polite" style="display:none; white-space:pre-wrap; padding:12px; max-height:240px; overflow:auto; border-top:1px solid var(--border, #7775);"></div>${composer}</section>`;
  }

  function assistCtxPop(m) {
    const cd = m.assistCard;
    const chats = cd ? m.chats.filter((c) => c.cardId === cd.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12) : [];
    return `<div class="pop-title">Персонаж для разговора</div>
      <button class="pop-item ${!cd ? "on" : ""}" data-act="assist-pick-card" data-id="">${icon("x")}<span>Без персонажа</span></button>
      ${m.cards.map((c) => `<button class="pop-item ${cd && cd.id === c.id ? "on" : ""}" data-act="assist-pick-card" data-id="${esc(c.id)}">${R.avatar(c, 22)}<span>${esc(c.name)}</span></button>`).join("")}
      ${cd ? `<div class="pop-sep"></div><div class="pop-title">Показать ассистенту чат</div>
        <button class="pop-item ${!m.assistChat ? "on" : ""}" data-act="assist-pick-chat" data-id="">${icon("x")}<span>Не показывать</span></button>
        ${chats.map((c) => `<button class="pop-item ${m.assistChat && m.assistChat.id === c.id ? "on" : ""}" data-act="assist-pick-chat" data-id="${esc(c.id)}">${icon(c.mode === "messenger" ? "bubble" : "book")}<span><span>${esc(c.title || (c.mode === "messenger" ? "Переписка" : "Сцена"))}</span><small>${esc(R.ago(c.updatedAt))}${c.preview ? " · " + esc(c.preview.slice(0, 40)) : ""}</small></span></button>`).join("") || `<p class="hint" style="padding:4px 10px">У персонажа пока нет чатов.</p>`}` : ""}`;
  }

  function assistListPop(m) {
    const list = (m.assistList || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return `<div class="pop-title">Разговоры с ассистентом</div>
      <button class="pop-item" data-act="assist-new">${icon("plus")}<span>Новый разговор</span></button>
      ${list.length ? `<div class="pop-sep"></div>` : ""}
      ${list.map((a) => `<button class="pop-item ${m.assist && m.assist.id === a.id ? "on" : ""}" data-act="assist-open" data-id="${esc(a.id)}">${icon("assist")}<span><span>${esc(a.title)}</span><small>${esc(R.ago(a.updatedAt))} · ${a.messages.length} ${R.plural(a.messages.length, "сообщение", "сообщения", "сообщений")}</small></span></button>`).join("")}`;
  }

  Object.assign((PRP.views = PRP.views || {}), { assist, assistCtxPop, assistListPop });
})(typeof window !== "undefined" ? window : globalThis);
