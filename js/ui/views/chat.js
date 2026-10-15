/* Prism RP — экран чата: шапка, лента (сцена и переписка), картинки в сообщениях, поле ввода, поповеры чата. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Чат ──────────────────────────────────────────────────────────── */
  function chat(m) {
    return `<section class="chat">
      ${chatHead(m)}
      ${m.find ? `<div class="findbar"><label class="search">${icon("search")}<input id="find-q" placeholder="Поиск по этому чату" value="${esc(m.find.q || "")}"></label>
        <span class="count" id="find-count"></span>
        <button class="icon-btn" data-act="find-prev" title="Предыдущее">${icon("left")}</button><button class="icon-btn" data-act="find-next" title="Следующее">${icon("right")}</button>
        <button class="icon-btn" data-act="find-close" title="Закрыть поиск">${icon("x")}</button></div>` : ""}
      <div class="feed" id="feed"><div class="feed-inner" id="feed-inner">${feed(m)}</div></div>
      ${composer(m)}
    </section>`;
  }

  function chatHead(m) {
    const cd = m.card, c = m.chat;
    const line = SC.summaryLine(m.scene);
    const status = c.mode === "messenger"
      ? (m.gen ? `<span class="head-scene live">печатает…</span>` : `<span class="head-scene"><span class="status-dot"></span> ${esc(messengerStatus(m) || "в сети")}</span>`)
      : `<span class="head-scene ${m.gen ? "live" : ""}">${m.gen ? "пишет…" : esc(line || "Сцена не задана — откройте панель сцены")}</span>`;
    return `<header class="chat-head">
      <button class="icon-btn only-narrow" data-act="rail" title="Меню">${icon("menu")}</button>
      <button class="head-av" data-act="edit-card" title="Карточка персонажа">${R.avatar(cd, 40)}</button>
      <div class="head-who"><div class="head-name"><button class="head-card" data-act="edit-card" title="Открыть карточку персонажа">${esc(cd.name)}</button> <button class="tool rename" data-act="rename-chat" title="Переименовать чат">${esc(c.title || "")} ${icon("edit")}</button></div>${status}</div>
      <div class="head-tools">
        <div class="seg wide" role="group" aria-label="Режим">
          <button class="${c.mode === "rp" ? "on" : ""}" data-act="mode" data-mode="rp" title="Сцена">${icon("book")}<span>Сцена</span></button>
          <button class="${c.mode === "messenger" ? "on" : ""}" data-act="mode" data-mode="messenger" title="Переписка">${icon("bubble")}<span>Переписка</span></button>
        </div>
        <button class="icon-btn ${m.find ? "on" : ""}" data-act="find" title="Поиск (Ctrl+F)">${icon("search")}</button>
        <button class="icon-btn" data-act="edit-card" title="Карточка персонажа">${icon("card")}</button>
        <button class="icon-btn ${m.drawerOpen ? "on" : ""}" data-act="drawer" title="Сцена, опыт, Prism">${icon("panel")}</button>
        <button class="icon-btn" data-act="chat-menu" title="Ещё">${icon("more")}</button>
      </div>
    </header>`;
  }

  function messengerStatus(m) {
    const st = m.scene;
    const k = Object.keys(st.chars).find((n) => n.toLowerCase() === m.card.name.toLowerCase());
    return [st.loc, k && st.chars[k].pose].filter(Boolean).join(", ");
  }

  function feed(m) {
    if (!m.path.length) {
      return `<div class="empty-note">${m.chat.mode === "messenger"
        ? `Напишите ${esc(m.card.name)} первым — например, «привет, чем занята?»`
        : `Опишите, с чего начинается сцена, или задайте место и время в панели сцены.`}</div>`;
    }
    return m.chat.mode === "messenger" ? messengerFeed(m) : rpFeed(m);
  }

  function swipeNav(msg, isLast) {
    if (msg.role !== "assistant") return "";
    const n = msg.swipes.length, i = (msg.swipeIdx || 0) + 1;
    if (n < 2 && !isLast) return "";
    return `<span class="swipes"><button class="tool" data-act="swipe" data-dir="-1" data-id="${msg.id}" title="Предыдущий вариант" ${i === 1 ? "disabled" : ""}>${icon("left")}</button>${i}/${n}<button class="tool" data-act="swipe" data-dir="1" data-id="${msg.id}" title="${isLast && i === n ? "Новый вариант" : "Следующий вариант"}">${icon("right")}</button></span>`;
  }

  function tools(msg, isLast) {
    return `<div class="tools">${swipeNav(msg, isLast)}
      ${msg.role === "assistant" && isLast ? `<button class="tool" data-act="regen" data-id="${msg.id}">${icon("regen")}Другой вариант</button>
        <button class="tool" data-act="continue" data-id="${msg.id}">${icon("cont")}Продолжить</button>` : ""}
      ${msg.role === "assistant" ? `<button class="tool" data-act="draw" data-id="${msg.id}" title="Нарисовать этот момент">${icon("brush")}Нарисовать</button>` : ""}
      <button class="tool" data-act="edit" data-id="${msg.id}">${icon("edit")}Править</button>
      <button class="tool" data-act="to-exp" data-id="${msg.id}" title="Сохранить событие в опыт персонажа">${icon("memory")}В опыт</button>
      <button class="tool" data-act="delete" data-id="${msg.id}" title="Удалить с этого места">${icon("trash")}</button></div>`;
  }

  function editor(msg, sw) {
    const raw = sw.text + (msg.role === "assistant" && sw.sceneOps && sw.sceneOps.length ? "\n\n[scene: " + sw.sceneOps.map((o) => o.raw).join("; ") + "]" : "");
    return `<textarea class="editor" id="edit-${msg.id}">${esc(raw)}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn btn-primary btn-sm" data-act="save-edit" data-id="${msg.id}">Сохранить</button>
      <button class="btn btn-sm btn-ghost" data-act="cancel-edit">Отмена</button></div>`;
  }

  // Изменения сцены от модели под сообщением; ручные правки видны в панели сцены.
  function deltas(sw) {
    const ops = (sw.sceneOps || []).filter((o) => !o.manual);
    if (!ops.length) return "";
    const shown = ops.slice(0, 6);
    return `<div class="turn-meta">${shown.map((o) => `<span class="delta">${esc(SC.opLabel(o))}</span>`).join("")}${ops.length > 6 ? `<span class="delta">ещё ${ops.length - 6}</span>` : ""}</div>`;
  }

  function liveText(m) {
    return PRP.imgCompose.stripDrawsForDisplay(SC.stripForDisplay(OA.splitThink(m.gen.raw).text));
  }

  // Картинки сообщения: в работе, готовые, с ошибкой.
  function shots(m, msg, sw, bubble) {
    const list = sw.images || [];
    if (!list.length) return "";
    const idx = msg.swipes.indexOf(sw);
    return `<div class="shots ${bubble ? "in-bubble" : ""}">${list.map((im) => {
      const ar = im.w && im.h ? `${im.w}/${im.h}` : (im.ratio || "1:1").replace(":", "/");
      const base = `data-mid="${msg.id}" data-sw="${idx}" data-img="${im.id}"`;
      if (im.status === "pending") {
        return `<figure class="shot wait" style="aspect-ratio:${ar}"><div class="shot-wait"><span>${esc(im.stage || "Рисую…")}</span></div>
          <figcaption class="shot-cap">${esc(im.draw || "")}</figcaption></figure>`;
      }
      if (im.status === "error") {
        return `<figure class="shot failed"><div class="err">${icon("alert")}<span>${esc(im.error || "Не получилось нарисовать.")}</span></div>
          <div class="row"><button class="btn btn-sm" data-act="img-regen" ${base}>${icon("regen")}Попробовать ещё раз</button><button class="btn btn-sm btn-ghost" data-act="img-del" ${base}>Убрать</button></div></figure>`;
      }
      const url = m.imgUrls && m.imgUrls[im.id];
      return `<figure class="shot" style="aspect-ratio:${ar}">
        ${url ? `<img src="${url}" alt="${esc(im.draw || "картинка")}" data-act="img-view" ${base} loading="lazy">` : `<div class="shot-wait"><span>Загрузка…</span></div>`}
        <div class="shot-tools">
          <button class="icon-btn" data-act="img-regen" ${base} title="Нарисовать заново, другой seed">${icon("regen")}</button>
          <button class="icon-btn" data-act="img-pin" ${base} title="Закрепить seed ${im.seed != null ? im.seed : ""} за персонажем">${icon("pin")}</button>
          <button class="icon-btn" data-act="img-info" ${base} title="Промпт и параметры">${icon("info")}</button>
          <button class="icon-btn" data-act="img-dl" ${base} title="Скачать">${icon("download")}</button>
          <button class="icon-btn" data-act="img-del" ${base} title="Удалить картинку">${icon("trash")}</button>
        </div></figure>`;
    }).join("")}</div>`;
  }

  function imageInfo(im) {
    return `<div class="pop-title">Промпт</div><div class="code" style="max-height:200px">${esc(im.prompt || "")}</div>
      ${im.negative ? `<div class="pop-title">Негатив</div><div class="code" style="max-height:120px">${esc(im.negative)}</div>` : ""}
      ${im.compiledFrom ? `<div class="pop-title">Сцена до перевода</div><div class="code" style="max-height:120px">${esc(im.compiledFrom)}</div>` : ""}
      <dl class="kv" style="padding:8px 10px;font-size:13px"><dt>Seed</dt><dd>${esc(im.seed != null ? String(im.seed) : "—")}</dd>
      <dt>Размер</dt><dd>${esc(im.w && im.h ? im.w + "×" + im.h : (im.info && im.info.resolution) || "—")}</dd>
      <dt>Где</dt><dd>${esc({ perchance: "Perchance", a1111: "Forge / A1111", openai: "API" }[im.backend] || im.backend || "—")}${im.info && im.info.model ? " · " + esc(im.info.model) : ""}</dd></dl>`;
  }

  function rpFeed(m) {
    const me = { name: m.persona.name, me: true };
    return m.path.map((msg, idx) => {
      const isLast = idx === m.path.length - 1;
      const sw = TR.activeSwipe(msg);
      const live = m.gen && m.gen.msgId === msg.id;
      const who = msg.role === "user" ? me : m.card;
      let body;
      if (m.editingMsg === msg.id) body = editor(msg, sw);
      else {
        const reasoning = live ? m.gen.reasoning : sw.reasoning;
        const text = live ? (m.gen.prefix || "") + liveText(m) : sw.text;
        const prose = R.rpText(text);
        body = `${reasoning ? `<details class="think"><summary>${icon("think")}Рассуждение модели</summary><div>${esc(reasoning)}</div></details>` : ""}
          <div class="prose ${live ? "cursor" : ""}" id="text-${msg.id}">${msg.role === "user" ? `<span class="bubble-plain">${prose}</span>` : prose}</div>
          ${sw.error ? `<div class="err">${icon("alert")}<span>${esc(sw.error)}</span></div>` : ""}
          ${!live ? shots(m, msg, sw) : ""}
          ${!live ? deltas(sw) : ""}
          ${live ? "" : tools(msg, isLast)}`;
      }
      return `<article class="turn ${msg.role} ${isLast ? "last" : ""}" data-mid="${msg.id}">${R.avatar(who, 40)}<div style="min-width:0">
        <div class="turn-head"><span class="turn-name">${esc(who.name)}</span><span class="turn-time">${R.time(sw.createdAt || msg.createdAt)}</span></div>${body}</div></article>`;
    }).join("");
  }

  function messengerFeed(m) {
    let lastDay = "";
    return m.path.map((msg, idx) => {
      const isLast = idx === m.path.length - 1;
      const sw = TR.activeSwipe(msg);
      const live = m.gen && m.gen.msgId === msg.id;
      const side = msg.role === "user" ? "me" : "them";
      const d = R.day(sw.createdAt || msg.createdAt);
      const mark = d !== lastDay ? `<div class="daymark">${esc(d)}</div>` : "";
      lastDay = d;
      if (m.editingMsg === msg.id) return mark + `<div class="msg-row ${side}">${editor(msg, sw)}</div>`;
      if (live) {
        const parts = R.bubbles(liveText(m));
        return mark + `<div class="msg-row them" id="text-${msg.id}">${parts.map((p) => `<div class="bub">${esc(p)}</div>`).join("")}<div class="bub typing"><i></i><i></i><i></i></div></div>`;
      }
      const parts = R.bubbles(sw.text);
      return mark + `<div class="msg-row ${side} ${isLast ? "last" : ""}" data-mid="${msg.id}">${parts.map((p) => `<div class="bub">${esc(p)}</div>`).join("")}${shots(m, msg, sw, true)}
        ${sw.error ? `<div class="err">${icon("alert")}<span>${esc(sw.error)}</span></div>` : ""}
        <div class="stamp">${R.time(sw.createdAt || msg.createdAt)}</div>${tools(msg, isLast)}</div>`;
    }).join("");
  }

  function meter(m) {
    const r = m.lastPrism && m.lastPrism.report;
    if (!r) return "";
    const frac = Math.max(0, Math.min(1, r.used / r.budget));
    const C = 2 * Math.PI * 8.5;
    return `<svg class="meter ${frac > 0.9 ? "hot" : ""}" viewBox="0 0 22 22" role="img" aria-label="Контекст заполнен на ${Math.round(frac * 100)}%"><circle class="bg" cx="11" cy="11" r="8.5"/><circle class="fg" cx="11" cy="11" r="8.5" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 11 11)"/></svg>`;
  }

  function composer(m) {
    const p = m.provider;
    const preset = SAMPLER_PRESETS.find((x) => x.id === m.settings.samplerPreset);
    const r = m.lastPrism && m.lastPrism.report;
    return `<div class="composer-wrap"><div class="composer">
      <textarea id="input" rows="1" placeholder="${m.chat.mode === "messenger" ? "Сообщение" : `Что делает и говорит ${esc(m.persona.name)}…`}" aria-label="Сообщение"></textarea>
      <div class="composer-bar">
        <button class="pill" data-act="model-pop" title="Модель и стиль генерации">${icon("cpu")}<span>${esc(p ? p.label : "Выбрать модель")}${preset && p && p.kind !== "perchance" ? " · " + esc(preset.name) : ""}</span></button>
        ${r ? `<button class="pill" data-act="open-prism" title="Сколько контекста занято: ${r.used} из ${r.budget} токенов">${meter(m)}<span>${Math.round((r.used / r.budget) * 100)}%</span></button>` : ""}
        <span class="spacer"></span>
        ${m.gen ? `<button class="send stop" data-act="stop" title="Остановить">${icon("stop")}</button>`
          : `<button class="send" data-act="send" title="Отправить (Enter)">${icon("send")}</button>`}
      </div></div></div>`;
  }

  /* ── Поповеры ─────────────────────────────────────────────────────── */
  function modelPop(m) {
    const act = m.provider;
    const edit = act && act.kind === "openai" ? m.settings.providers.find((x) => x.id === act.id) : null;
    return `<div class="pop-title">Модель</div>
      ${m.providers.map((p) => `<button class="pop-item ${act && act.id === p.id ? "on" : ""}" data-act="pick-provider" data-id="${p.id}">${icon(p.kind === "perchance" ? "star" : "cpu")}<span><span>${esc(p.name)}</span><small>${esc(p.kind === "perchance" ? "бесплатно, без ключа" : (p.model || "модель не выбрана"))}</small></span></button>`).join("")}
      ${edit && edit.models && edit.models.length ? `<div class="pop-sep"></div><div class="pop-title">Модели ${esc(edit.name)}</div>
        ${edit.models.slice(0, 30).map((md) => `<button class="pop-item ${md === edit.model ? "on" : ""}" data-act="pick-model" data-model="${esc(md)}">${esc(md)}</button>`).join("")}` : ""}
      ${act && act.kind !== "perchance" ? `<div class="pop-sep"></div><div class="pop-title">Стиль генерации</div>
        ${SAMPLER_PRESETS.map((s) => `<button class="pop-item ${m.settings.samplerPreset === s.id ? "on" : ""}" data-act="pick-preset" data-id="${s.id}"><span><span>${s.name}</span><small>${s.hint}</small></span></button>`).join("")}` : ""}
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="settings" data-section="models">${icon("settings")}Все настройки моделей</button>`;
  }

  function chatMenu(m) {
    return `<button class="pop-item" data-act="new-chat" data-mode="rp">${icon("book")}Новая сцена с ${esc(m.card.name)}</button>
      <button class="pop-item" data-act="new-chat" data-mode="messenger">${icon("bubble")}Новая переписка</button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="assist-about-chat">${icon("assist")}Спросить ассистента об этом чате</button>
      <button class="pop-item" data-act="edit-card">${icon("card")}Редактировать персонажа</button>
      <button class="pop-item" data-act="rename-chat">${icon("edit")}Переименовать чат</button>
      <button class="pop-item" data-act="export-chat" data-fmt="txt">${icon("download")}Скачать чат как текст</button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="delete-chat" style="color:var(--danger)">${icon("trash")}Удалить чат</button>`;
  }

  Object.assign((PRP.views = PRP.views || {}), { chat, chatHead, feed, composer, modelPop, chatMenu, imageInfo });
})(typeof window !== "undefined" ? window : globalThis);
