/* Prism RP — представления. Чистые функции: состояние (m) → HTML.
   Действия пользователя размечены data-act и обрабатываются в app.js. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;

  const SAMPLER_PRESETS = [
    { id: "precise", name: "Точный", hint: "держится карточки, меньше сюрпризов", v: { temperature: 0.7, top_p: 0.9, min_p: 0.08, top_k: 0, repetition_penalty: 1.05 } },
    { id: "balanced", name: "Сбалансированный", hint: "по умолчанию", v: { temperature: 0.9, top_p: 0.95, min_p: 0.05, top_k: 0, repetition_penalty: 1.05 } },
    { id: "lively", name: "Живой", hint: "больше инициативы и неожиданностей", v: { temperature: 1.1, top_p: 0.98, min_p: 0.03, top_k: 0, repetition_penalty: 1.08 } },
  ];
  const THEMES = [
    { id: "dusk", name: "Сумерки", c: ["#15131d", "#252233", "#b79cff", "#ff9ec7"] },
    { id: "dawn", name: "Рассвет", c: ["#f1eef7", "#ffffff", "#6b4edb", "#e05596"] },
    { id: "paper", name: "Бумага", c: ["#efe8dc", "#f8f3ea", "#7a4d9e", "#c98a2a"] },
  ];
  const WEATHER = ["ясно", "облачно", "пасмурно", "дождь", "ливень", "снег", "туман", "гроза", "жара", "мороз", "ветрено"];

  /* ── Навигация слева ──────────────────────────────────────────────── */
  function rail(m) {
    const chats = m.chats.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40);
    return `
      <button class="brand" data-act="home" title="На главную">${R.GLYPH}<span>Prism RP</span></button>
      <nav class="rail-nav">
        <button class="rail-item ${m.view === "home" ? "active" : ""}" data-act="home">${icon("home")}Персонажи</button>
        <button class="rail-item" data-act="import">${icon("upload")}Импорт карточки</button>
      </nav>
      <div class="rail-head"><span>Недавние чаты</span></div>
      <div class="rail-chats">
        ${chats.length ? chats.map((c) => {
          const cd = m.cards.find((x) => x.id === c.cardId);
          if (!cd) return "";
          return `<div class="rail-chat ${m.chat && m.chat.id === c.id && m.view === "chat" ? "active" : ""}" data-act="open-chat" data-id="${c.id}" role="button" tabindex="0">
            ${R.avatar(cd, 34)}
            <div style="min-width:0"><div class="t1">${esc(cd.name)}</div><div class="t2">${esc(c.preview || c.title || "")}</div></div>
            <span class="kind" title="${c.mode === "messenger" ? "Переписка" : "Сцена"}">${icon(c.mode === "messenger" ? "bubble" : "book")}</span>
          </div>`;
        }).join("") : `<p class="hint" style="padding:6px 10px">Здесь появятся ваши чаты.</p>`}
      </div>
      <div class="rail-foot">
        <button class="btn btn-ghost btn-sm" data-act="settings" style="flex:1;justify-content:flex-start">${icon("settings")}Настройки</button>
        <button class="icon-btn" data-act="cycle-theme" title="Сменить тему">${icon("palette")}</button>
      </div>`;
  }

  /* ── Главный экран ────────────────────────────────────────────────── */
  function home(m) {
    const q = (m.homeQuery || "").toLowerCase();
    const cards = m.cards.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.tags || []).join(" ").toLowerCase().includes(q));
    const prov = m.provider;
    const welcome = !m.cards.length ? `
      <div class="welcome">
        <div class="step"><div class="n">1</div><h3>Добавьте персонажа</h3><p>Импортируйте карточку PNG или JSON (форматы V1–V3) или создайте с нуля.</p>
          <div class="row"><button class="btn btn-primary btn-sm" data-act="import">${icon("upload")}Импорт</button><button class="btn btn-sm" data-act="new-card">${icon("plus")}Создать</button></div></div>
        <div class="step"><div class="n">2</div><h3>Подключите модель</h3><p>${prov ? `Сейчас выбрана: ${esc(prov.label)}.` : "На Perchance бесплатная модель готова сразу; можно подключить свой API."}</p>
          <button class="btn btn-sm" data-act="settings" data-section="models">${icon("cpu")}Модели</button></div>
        <div class="step"><div class="n">3</div><h3>Начните сцену или переписку</h3><p>Сцена — ролевая проза с учётом места, времени и одежды. Переписка — короткие сообщения, как в мессенджере.</p></div>
      </div>` : "";
    const recent = m.chats.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
    return `<div class="home"><div class="home-inner">
      <div class="home-top">
        <div><h1>${m.cards.length ? "Персонажи" : "Добро пожаловать в Prism RP"}</h1>
          <p class="sub">${m.cards.length ? `${m.cards.length} ${R.plural(m.cards.length, "персонаж", "персонажа", "персонажей")}. Выберите, с кем продолжить.` : "Среда для ролевой игры, где персонаж реагирует на сцену через свой характер и пережитый опыт, а время, место и одежду ведёт приложение."}</p></div>
        ${m.cards.length ? `<div class="home-tools">
          <label class="search">${icon("search")}<input id="home-q" placeholder="Найти по имени или тегу" value="${esc(m.homeQuery || "")}"></label>
          <button class="btn" data-act="import">${icon("upload")}Импорт</button>
          <button class="btn btn-primary" data-act="new-card">${icon("plus")}Создать</button></div>` : ""}
      </div>
      ${welcome}
      ${recent.length ? `<div class="section-title">Продолжить</div>
        <div class="gallery" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
        ${recent.map((c) => {
          const cd = m.cards.find((x) => x.id === c.cardId);
          if (!cd) return "";
          return `<div class="rail-chat panel" style="margin:0" data-act="open-chat" data-id="${c.id}" role="button" tabindex="0">${R.avatar(cd, 34)}
            <div style="min-width:0"><div class="t1">${esc(cd.name)} <span class="tag">${c.mode === "messenger" ? "переписка" : "сцена"}</span></div><div class="t2">${esc(c.preview || "Новый чат")}</div></div>
            <span class="t2">${esc(R.ago(c.updatedAt))}</span></div>`;
        }).join("")}</div>` : ""}
      ${m.cards.length ? `<div class="section-title">Все персонажи</div>` : ""}
      <div class="gallery">
        ${cards.map((cd) => {
          const n = m.chats.filter((c) => c.cardId === cd.id).length;
          return `<button class="tile" data-act="open-card" data-id="${cd.id}" title="${esc(cd.name)}">
            ${R.art(cd)}<div class="tile-shade"></div>
            ${n ? `<span class="tile-count">${n} ${R.plural(n, "чат", "чата", "чатов")}</span>` : ""}
            <div class="tile-body"><div class="tile-name">${esc(cd.name)}</div><div class="tile-tags">${esc((cd.tags || []).slice(0, 4).join(", ") || cd.creator || " ")}</div></div>
          </button>`;
        }).join("")}
        ${m.cards.length ? `<div class="tile tile-new" role="group">
          ${icon("plus")}<button class="btn btn-sm" data-act="new-card">Создать</button><button class="btn btn-sm btn-ghost" data-act="import">Импорт</button></div>` : ""}
      </div>
      ${q && !cards.length ? `<p class="empty-note">Никого не нашлось по запросу «${esc(m.homeQuery)}».</p>` : ""}
    </div></div>`;
  }

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
      ${R.avatar(cd, 40)}
      <div class="head-who"><div class="head-name">${esc(cd.name)} <button class="tool rename" data-act="rename-chat" title="Переименовать чат">${esc(c.title || "")} ${icon("edit")}</button></div>${status}</div>
      <div class="head-tools">
        <div class="seg wide" role="group" aria-label="Режим">
          <button class="${c.mode === "rp" ? "on" : ""}" data-act="mode" data-mode="rp" title="Сцена">${icon("book")}<span>Сцена</span></button>
          <button class="${c.mode === "messenger" ? "on" : ""}" data-act="mode" data-mode="messenger" title="Переписка">${icon("bubble")}<span>Переписка</span></button>
        </div>
        <button class="icon-btn ${m.find ? "on" : ""}" data-act="find" title="Поиск (Ctrl+F)">${icon("search")}</button>
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
      <button class="pop-item" data-act="edit-card">${icon("card")}Редактировать персонажа</button>
      <button class="pop-item" data-act="rename-chat">${icon("edit")}Переименовать чат</button>
      <button class="pop-item" data-act="export-chat" data-fmt="txt">${icon("download")}Скачать чат как текст</button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="delete-chat" style="color:var(--danger)">${icon("trash")}Удалить чат</button>`;
  }

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
    const list = m.exps.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
      <p class="hint">Пережитые события. Персонаж помнит их во всех своих чатах и учитывает, но может поступить вопреки.</p>
      <button class="btn btn-sm" data-act="exp-new">${icon("plus")}Добавить событие</button></div>
      ${list.map((r) => `<div class="memo ${r.status !== "active" ? "off" : ""}" data-act="exp-edit" data-id="${r.id}" role="button" tabindex="0">
        <span class="memo-bar" style="background:${valColor(r.valence)}"></span>
        <div class="ev">${esc(r.event || "Без описания")}</div>
        ${r.interpretation ? `<div class="in">${esc(r.interpretation)}</div>` : ""}
        <div class="mt"><span class="tag ${r.valence > 0 ? "pos" : r.valence < 0 ? "neg" : ""}">${valWord[r.valence]}</span>
          ${(r.domains || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
          ${r.status === "superseded" ? `<span class="tag">пересмотрено</span>` : ""}${r.source && r.source.sceneTime ? `<span class="tag">${esc(r.source.sceneTime)}</span>` : ""}</div>
      </div>`).join("") || `<p class="empty-note">Пока пусто. Нажмите «В опыт» под важным сообщением.</p>`}`;
  }

  const LAYERS = [["frame", "Рамка", "#7fd1ff"], ["card", "Карточка", "#b79cff"], ["memory", "Опыт", "#ff9ec7"], ["scene", "Сцена", "#ffd08a"], ["lore", "Лорбук", "#8ff0c3"], ["history", "История", "#8d86a6"], ["post", "Протокол", "#5c5670"]];
  function prismTab(m) {
    const p = m.lastPrism;
    if (!p) return `<p class="hint">Здесь видно, что получает модель: карточку как склонности, опыт как свидетельства, сцену как факты.</p>
      <button class="btn btn-sm" data-act="prism-preview">${icon("prism")}Собрать для следующего хода</button>`;
    const r = p.report;
    const total = Object.values(r.layers).reduce((a, b) => a + b, 0) || 1;
    return `<div class="block"><div class="block-title">Контекст <small>${r.used} из ${r.budget} токенов, оценка</small></div>
        <div class="bar-meter">${LAYERS.map(([k, , c]) => `<i style="width:${(r.layers[k] / Math.max(total, r.budget)) * 100}%;background:${c}" title="${k}"></i>`).join("")}</div>
        <div class="legend">${LAYERS.filter(([k]) => r.layers[k]).map(([k, n, c]) => `<span style="--c:${c}">${n} ${r.layers[k]}</span>`).join("")}</div></div>
      <div class="block"><dl class="kv">
        <dt>История</dt><dd>${r.historyKept} из ${r.historyTotal} сообщений</dd>
        <dt>Опыт</dt><dd>${r.experienceKept} ${R.plural(r.experienceKept, "запись", "записи", "записей")}${r.experienceDropped ? `, не поместилось ${r.experienceDropped}` : ""}</dd>
        <dt>Лорбук</dt><dd>${r.loreKept} из ${r.loreMatched} сработавших</dd>
        <dt>Примеры речи</dt><dd>${r.examples ? "вошли" : "не вошли"}</dd></dl></div>
      <div class="block"><div class="block-title">Что ушло в модель <button class="btn btn-sm btn-ghost" data-act="prism-preview">${icon("regen")}Обновить</button></div>
        <div class="code">${p.messages.map((x) => `<span class="role">${esc(x.role)}</span>\n${esc(x.content)}`).join("\n\n")}</div></div>`;
  }

  /* ── Настройки ────────────────────────────────────────────────────── */
  function settingsModal(m, section) {
    const nav = [["models", "Модели", "cpu"], ["gen", "Генерация", "sliders"], ["images", "Изображения", "image"], ["persona", "Вы", "user"], ["look", "Внешний вид", "palette"], ["data", "Данные", "data"]];
    const s = m.settings;
    let body = "";
    if (section === "models") {
      const editing = m.settings.providers.find((p) => p.id === m.editProviderId);
      body = `<h3>Модели</h3><p class="lead">Какая модель пишет за персонажей. Можно держать несколько и переключать прямо в чате.</p>
        ${m.providers.map((p) => `<div class="prov ${m.provider && m.provider.id === p.id ? "on" : ""}" data-act="pick-provider" data-id="${p.id}" role="radio" tabindex="0" aria-checked="${m.provider && m.provider.id === p.id}">
          <span class="radio"></span><div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="ds">${esc(p.kind === "perchance" ? "Бесплатная модель Perchance, ключ не нужен" : `${p.baseUrl || "адрес не задан"}${p.model ? " · " + p.model : ""}`)}</div></div>
          ${p.kind === "openai" ? `<button class="btn btn-sm btn-ghost" data-act="prov-edit" data-id="${p.id}">Изменить</button>` : ""}</div>`).join("")}
        ${!m.providers.some((p) => p.kind === "perchance") ? `<p class="hint">Бесплатная модель Perchance появится здесь, когда приложение запущено как генератор на Perchance.</p>` : ""}
        ${editing ? providerForm(editing) : `<div class="block-title" style="margin-top:20px">Подключить API</div>
          <div class="presets">${OA.PRESETS.map((pr) => `<button class="preset" data-act="prov-add" data-preset="${pr.id}"><b>${esc(pr.name)}</b><small>${pr.local ? "на этом компьютере" : pr.id === "custom" ? "любой совместимый" : "облачный API"}</small></button>`).join("")}</div>`}`;
    } else if (section === "gen") {
      const sm = s.sampler;
      const num = (k, label, step, help) => `<div class="field"><label>${label}</label><input type="number" step="${step}" data-sampler="${k}" value="${sm[k] != null ? sm[k] : ""}">${help ? `<span class="help">${help}</span>` : ""}</div>`;
      body = `<h3>Генерация</h3><p class="lead">Стиль, длина ответа и объём памяти. Для бесплатной модели Perchance параметры сэмплирования не применяются.</p>
        <div class="presets">${SAMPLER_PRESETS.map((p) => `<button class="preset ${s.samplerPreset === p.id ? "on" : ""}" data-act="pick-preset" data-id="${p.id}"><b>${p.name}</b><small>${p.hint}</small></button>`).join("")}
          <button class="preset ${s.samplerPreset === "custom" ? "on" : ""}" data-act="pick-preset" data-id="custom"><b>Свой</b><small>значения ниже</small></button></div>
        <div class="row">${num("temperature", "Температура", "0.05", "выше — смелее")}${num("top_p", "Top P", "0.01")}${num("min_p", "Min P", "0.01")}</div>
        <div class="row">${num("top_k", "Top K", "1", "0 — выключено")}${num("repetition_penalty", "Штраф за повторы", "0.01")}${num("max_tokens", "Длина ответа", "50", "в токенах")}</div>
        <div class="row"><div class="field"><label>Объём контекста</label><input type="number" step="512" data-set-num="contextTokens" value="${s.contextTokens}"><span class="help">в токенах; для Perchance берётся из плагина</span></div>
          <div class="field"><label>Записей опыта за ход</label><input type="number" min="0" max="30" data-set-num="expLimit" value="${s.expLimit}"></div></div>
        <label class="check"><input type="checkbox" data-set="autoContext" ${s.autoContext ? "checked" : ""}><span>Брать объём контекста из плагина Perchance</span></label>
        <label class="check"><input type="checkbox" data-set="singleSystem" ${s.singleSystem ? "checked" : ""}><span>Одно системное сообщение<small>Для локальных моделей со строгими шаблонами чата, которые ломаются от нескольких system.</small></span></label>
        <label class="check"><input type="checkbox" data-set="sceneProtocol" ${s.sceneProtocol ? "checked" : ""}><span>Модель сообщает изменения сцены<small>Время, место, одежда, настроение — короткой служебной строкой, которую приложение прячет.</small></span></label>`;
    } else if (section === "images") {
      body = imagesSettings(m);
    } else if (section === "persona") {
      const pi = m.persona.image || {};
      body = `<h3>Вы</h3><p class="lead">Как персонажи вас видят. Имя подставляется вместо {{user}} в карточках.</p>
        <div class="field"><label>Имя</label><input id="p-name" value="${esc(m.persona.name)}"></div>
        <div class="field"><label>Описание</label><textarea id="p-desc" rows="5" placeholder="Внешность, характер, кем вы приходитесь персонажам">${esc(m.persona.description)}</textarea></div>
        <div class="block-title" style="margin-top:20px">Вы на картинках</div>
        <div class="field"><label>Как рисовать сцену</label><select id="p-view"><option value="third" ${pi.view !== "first" ? "selected" : ""}>Со стороны — вы тоже в кадре</option><option value="first" ${pi.view === "first" ? "selected" : ""}>От первого лица — камера это ваши глаза (POV)</option></select></div>
        <div class="field"><label>Ваша внешность для картинок</label><textarea id="p-appearance" rows="4" placeholder="base: 1boy, short black hair, grey eyes&#10;костюм | suit: black suit, white shirt">${esc(pi.appearance || "")}</textarea>
          <span class="help">Теги, которые добавляются, когда вы в кадре. Строка base: — всегда; «ключ: теги» — когда ключ упомянут в сцене или так зовут присутствующего. Можно указать свою LoRA: &lt;lora:имя:0.8&gt;.</span></div>
        <div class="field"><label>Видимые части тела в POV</label><input id="p-povtags" value="${esc(pi.povTags || "")}" placeholder="pov hands"><span class="help">Только если они должны быть в кадре.</span></div>
        <div class="modal-foot"><button class="btn btn-primary" data-act="persona-save">Сохранить</button></div>`;
    } else if (section === "look") {
      body = `<h3>Внешний вид</h3><p class="lead">Тема и размер текста сцены.</p>
        <div class="themes">${THEMES.map((t) => `<button class="theme ${s.theme === t.id ? "on" : ""}" data-act="theme" data-id="${t.id}">
          <div class="sw" style="background:${t.c[0]}"><i style="width:36%;background:${t.c[1]}"></i><i style="width:18%;background:${t.c[2]}"></i><i style="width:12%;background:${t.c[3]}"></i></div><div class="nm">${t.name}</div></button>`).join("")}</div>
        <div class="field" style="margin-top:18px"><label>Размер текста сцены: <span id="fs-out">${s.proseSize}</span> px</label><input type="range" min="14" max="22" step="1" data-set-range="proseSize" value="${s.proseSize}" style="accent-color:var(--accent)"></div>`;
    } else {
      body = `<h3>Данные</h3><p class="lead">Всё хранится только в этом браузере. Бэкап переносит персонажей, чаты, опыт и настройки — в том числе на другую платформу.</p>
        <div class="row"><button class="btn" data-act="backup">${icon("download")}Скачать бэкап</button><button class="btn" data-act="restore">${icon("upload")}Загрузить бэкап</button></div>
        <p class="hint" style="margin-top:14px">${m.stats}</p>`;
    }
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Настройки">
      <div class="modal-head"><h2>Настройки</h2><button class="icon-btn" data-act="modal-close" title="Закрыть">${icon("x")}</button></div>
      <nav class="modal-nav">${nav.map(([id, n, ic]) => `<button class="rail-item ${section === id ? "active" : ""}" data-act="settings" data-section="${id}">${icon(ic)}${n}</button>`).join("")}</nav>
      <div class="modal-body">${body}</div></div></div>`;
  }

  function imagesSettings(m) {
    const c = m.settings.images, lists = m.imgLists || {};
    const backs = [["perchance", "Perchance", "бесплатно, без настроек", m.perchanceImages], ["a1111", "Forge / A1111 / ReForge", "ваш локальный сервер Stable Diffusion", true], ["openai", "OpenAI-совместимый API", "облачные сервисы изображений", true]];
    const dl = (id, arr) => `<datalist id="${id}">${(arr || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`;
    const inp = (k, label, ph, list, help, type) => `<div class="field"><label>${label}</label><input data-imgcfg="${k}" ${type ? `type="${type}"` : ""} ${list ? `list="${list}"` : ""} value="${esc(c[k] != null ? c[k] : "")}" placeholder="${esc(ph || "")}">${help ? `<span class="help">${help}</span>` : ""}</div>`;
    const chk = (k, label, help) => `<label class="check"><input type="checkbox" data-img-check="${k}" ${c[k] ? "checked" : ""}><span>${label}${help ? `<small>${help}</small>` : ""}</span></label>`;
    let conn = "";
    if (c.backend === "a1111") {
      conn = `${inp("url", "Адрес сервера", "http://127.0.0.1:7860", "", "Forge/A1111 запускается с флагами --api и --cors-allow-origins=" + esc(m.origin))}
        <div class="row" style="align-items:center;margin:-4px 0 12px"><button class="btn btn-sm" data-act="img-lists">${icon("regen")}Проверить и загрузить списки</button><span class="hint" style="margin:0">${lists.at ? `Модели: ${(lists.models || []).length}, LoRA: ${(lists.loras || []).length}` : "модели, VAE, сэмплеры, LoRA с сервера"}</span></div>
        <div class="row">${inp("model", "Модель (checkpoint)", "как на сервере", "dl-models")}${inp("vae", "VAE", "Automatic", "dl-vaes")}</div>
        <div class="row">${inp("sampler", "Сэмплер", "Euler a", "dl-samplers")}${inp("scheduler", "Планировщик", "", "dl-schedulers")}</div>
        <div class="row">${inp("steps", "Шаги", "28", "", "", "number")}${inp("cfg", "CFG", "5.5", "", "", "number")}${inp("seed", "Seed", "случайный", "", "пусто — каждый раз новый")}</div>
        <div class="row"><div class="field"><label>Размер</label><select data-img-sel="sizeMode"><option value="auto" ${c.sizeMode !== "fixed" ? "selected" : ""}>По пропорциям сцены</option><option value="fixed" ${c.sizeMode === "fixed" ? "selected" : ""}>Всегда один</option></select></div>
          ${c.sizeMode === "fixed" ? inp("fixedSize", "Размер", "1024x1024") : inp("maxSide", "Макс. сторона", "1216", "", "", "number")}</div>
        ${chk("hires", "Hires fix — второй проход", "Заметно улучшает лица и руки на SDXL-моделях, но рисует дольше.")}
        ${c.hires ? `<div class="row">${inp("hiresScale", "Масштаб", "1.5", "", "", "number")}${inp("hiresUpscaler", "Апскейлер", "R-ESRGAN 4x+ Anime6B", "dl-upscalers")}${inp("hiresDenoise", "Denoise", "0.4", "", "", "number")}</div>` : ""}
        ${dl("dl-models", lists.models)}${dl("dl-vaes", lists.vaes)}${dl("dl-samplers", lists.samplers)}${dl("dl-schedulers", lists.schedulers)}${dl("dl-upscalers", lists.upscalers)}`;
    } else if (c.backend === "openai") {
      conn = `${inp("url", "Адрес API", "https://api.example.com/v1")}
        <div class="field"><label>Ключ API</label><input data-imgcfg="key" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(c.key || "")}"></div>
        ${inp("model", "Модель", "")}`;
    } else if (!m.perchanceImages) {
      conn = `<p class="hint">Генерация Perchance доступна, когда приложение запущено как генератор на Perchance. Здесь выберите локальный сервер или API.</p>`;
    }
    const loras = (c.loras || []);
    return `<h3>Изображения</h3><p class="lead">Чем рисовать и как собирается промпт. Персональные настройки — LoRA, триггеры, гардероб — задаются в карточке персонажа.</p>
      ${chk("enabled", "Рисовать картинки")}
      <div class="block-title" style="margin-top:14px">Чем рисовать</div>
      ${backs.map(([id, n, d, ok]) => `<div class="prov ${c.backend === id ? "on" : ""} ${ok ? "" : "dim"}" data-act="img-backend" data-id="${id}" role="radio" tabindex="0" aria-checked="${c.backend === id}"><span class="radio"></span><div><div class="nm">${n}</div><div class="ds">${d}${ok ? "" : " — только на Perchance"}</div></div><span></span></div>`).join("")}
      ${conn}
      <div class="block-title" style="margin-top:20px">Промпт</div>
      <div class="row"><div class="field"><label>Формат</label><select data-img-sel="format"><option value="tags" ${c.format !== "description" ? "selected" : ""}>Теги danbooru (аниме-модели, Pony, Illustrious)</option><option value="description" ${c.format === "description" ? "selected" : ""}>Описание словами (SDXL base, Flux)</option></select></div></div>
      ${chk("translate", "Переводить сцену на английский", "Модели изображений не понимают русский: сцену перепишет текстовая модель, перевод кэшируется.")}
      <div class="field"><label>Закреплённый блок</label><textarea data-imgcfg="fixedPrompt" rows="2" placeholder="masterpiece, best quality, amazing quality, absurdres">${esc(c.fixedPrompt || "")}</textarea><span class="help">Одинаковые теги качества и стиля в каждой картинке. Если блок задан, модель свои теги качества не пишет.</span></div>
      <div class="field"><label>Куда ставить блок</label><select data-img-sel="promptMode">${[["append", "в конец"], ["prepend", "в начало"], ["replace", "только блок, без сцены"], ["off", "не использовать"]].map(([v, l]) => `<option value="${v}" ${c.promptMode === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label>Негатив</label><textarea data-imgcfg="negative" rows="2" placeholder="lowres, bad anatomy, bad hands, extra digits">${esc(c.negative || "")}</textarea></div>
      ${c.backend === "a1111" ? `<div class="field"><label>LoRA для всех картинок</label>${loraRows("img-lora", loras)}<span class="help">Стиль, детализация. LoRA персонажа задаются в его карточке.</span></div>` : ""}
      <div class="block-title" style="margin-top:20px">Когда рисовать</div>
      ${chk("modelDraws", "Модель сама решает, когда показать картинку", "Она пишет короткую служебную строку [draw: …]; приложение её прячет и рисует.")}
      ${chk("autoDraw", "Рисовать сразу", "Иначе под сообщением появится кнопка «Нарисовать».")}
      ${dl("dl-loras", lists.loras)}`;
  }

  function loraRows(act, list) {
    return `<div class="lora-rows">${list.map((l, i) => `<div class="row lora-row"><input class="input" data-${act}-name="${i}" list="dl-loras" value="${esc(l.name)}" placeholder="имя LoRA" style="flex:3">
      <input class="input" type="number" step="0.05" data-${act}-w="${i}" value="${esc(String(l.weight))}" style="flex:1;max-width:90px">
      <button class="icon-btn" data-act="${act}-del" data-i="${i}" title="Убрать">${icon("x")}</button></div>`).join("")}
      <button class="btn btn-sm" data-act="${act}-add">${icon("plus")}LoRA</button></div>`;
  }

  function providerForm(p) {
    return `<div class="panel" style="margin-top:16px"><div class="block-title">${esc(p.name)}</div>
      <div class="field"><label>Название</label><input id="prov-name" value="${esc(p.name)}"></div>
      <div class="field"><label>Адрес API</label><input id="prov-url" value="${esc(p.baseUrl)}" placeholder="https://…/v1"><span class="help">Обычно заканчивается на /v1</span></div>
      <div class="field"><label>Ключ API</label><input id="prov-key" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(p.apiKey || "")}" placeholder="для локальных серверов не нужен"></div>
      <div class="field"><label>Модель</label><div class="row" style="align-items:center"><input id="prov-model" list="prov-models" value="${esc(p.model || "")}" style="flex:1"><button class="btn btn-sm" data-act="prov-models">Загрузить список</button></div>
        <datalist id="prov-models">${(p.models || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>${p.models ? `<span class="help">Доступно моделей: ${p.models.length}</span>` : ""}</div>
      <label class="check"><input type="checkbox" id="prov-ext" ${p.extendedSamplers ? "checked" : ""}><span>Расширенные параметры<small>min_p, top_k, штраф за повторы — для локальных серверов и OpenRouter</small></span></label>
      <div class="row"><button class="btn btn-primary btn-sm" data-act="prov-save">Сохранить</button><button class="btn btn-sm btn-ghost" data-act="prov-close">Готово</button>
        <span style="flex:1"></span><button class="btn btn-danger btn-sm" data-act="prov-del">Удалить</button></div>
      <p class="hint" style="margin:10px 0 0">Ключ хранится только в этом браузере.</p></div>`;
  }

  /* ── Редактор персонажа ───────────────────────────────────────────── */
  function cardModal(m, d, section) {
    const nav = [["main", "Основное", "card"], ["greet", "Приветствия", "bubble"], ["speech", "Речь и указания", "edit"], ["lore", "Лорбук", "book"], ["images", "Изображения", "image"], ["file", "Файл", "download"]];
    const f = (id, label, value, rows, help, ph) => `<div class="field"><label for="${id}">${label}</label>${rows
      ? `<textarea id="${id}" rows="${rows}" data-cf="${id}" placeholder="${esc(ph || "")}">${esc(value || "")}</textarea>` : `<input id="${id}" data-cf="${id}" value="${esc(value || "")}" placeholder="${esc(ph || "")}">`}${help ? `<span class="help">${help}</span>` : ""}</div>`;
    let body = "";
    if (section === "main") {
      body = `<div class="card-edit"><div><div class="portrait" style="${d.avatar ? "" : R.artBg(d.name)}">${d.avatar ? `<img src="${d.avatar}" alt="">` : esc((d.name || "?").charAt(0).toUpperCase())}
          <button class="btn btn-sm chg" data-act="avatar-pick">${icon("upload")}Портрет</button></div></div>
        <div>${f("cf-name", "Имя", d.name)}${f("cf-tags", "Теги", (d.tags || []).join(", "), 0, "через запятую")}
          ${f("cf-desc", "Описание", d.description, 8, "Внешность, характер, прошлое. Модель читает это как склонности, а не как команды.", "Студентка второго курса, ревнивая, но отходчивая…")}
          ${f("cf-pers", "Личность коротко", d.personality, 2)}${f("cf-scen", "Обстоятельства", d.scenario, 3, "Где и почему всё происходит")}</div></div>`;
    } else if (section === "greet") {
      body = `${f("cf-first", "Первое сообщение", d.firstMes, 7, "С него начинается новая сцена. Можно добавить в конце строку [scene: …] с начальным местом и одеждой.")}
        ${f("cf-alt", "Другие приветствия", (d.altGreetings || []).join("\n---\n"), 6, "Разделяйте строкой из трёх дефисов ---. В чате их можно листать стрелками.")}`;
    } else if (section === "speech") {
      body = `${f("cf-ex", "Примеры речи", d.mesExample, 7, "Как персонаж говорит: блоки начинаются с &lt;START&gt;, реплики — {{char}}: и {{user}}:")}
        ${f("cf-sys", "Указания автора карточки", d.systemPrompt, 3)}${f("cf-post", "Указания после истории", d.postHistory, 3, "Добавляются в конец контекста, ближе всего к ответу")}`;
    } else if (section === "lore") {
      body = `<p class="lead">Сведения о мире, которые подмешиваются в контекст, когда в разговоре звучат ключевые слова.</p>
        ${(d.lore || []).map((e, i) => `<div class="lore">
          <div class="field"><label>Ключевые слова</label><input data-lore="${i}" data-k="keys" value="${esc((e.keys || []).join(", "))}" placeholder="кафе, кампус"></div>
          <div class="field"><label>Текст</label><textarea data-lore="${i}" data-k="content" rows="3">${esc(e.content)}</textarea></div>
          <div class="row" style="align-items:center"><label class="check"><input type="checkbox" data-lore="${i}" data-k="constant" ${e.constant ? "checked" : ""}><span>Всегда в контексте</span></label>
          <label class="check"><input type="checkbox" data-lore="${i}" data-k="enabled" ${e.enabled !== false ? "checked" : ""}><span>Включено</span></label>
          <span style="flex:1"></span><button class="btn btn-sm btn-ghost" data-act="lore-del" data-i="${i}">${icon("trash")}Удалить</button></div></div>`).join("") || `<p class="empty-note">Лорбук пуст.</p>`}
        <button class="btn btn-sm" data-act="lore-add">${icon("plus")}Добавить запись</button>`;
    } else if (section === "images") {
      const im = d.image || {};
      const fi = (k, label, rows, help, ph) => `<div class="field"><label>${label}</label>${rows ? `<textarea data-ci="${k}" rows="${rows}" placeholder="${esc(ph || "")}">${esc(im[k] || "")}</textarea>` : `<input data-ci="${k}" value="${esc(im[k] != null ? im[k] : "")}" placeholder="${esc(ph || "")}">`}${help ? `<span class="help">${help}</span>` : ""}</div>`;
      body = `<p class="lead">Как рисовать ${esc(d.name || "персонажа")}. Триггер, негатив и LoRA персонажа применяются, только когда он в кадре.</p>
        ${fi("trigger", "Триггер — кто это", 2, "Имя персонажа в модели и 2–4 главные приметы. Идёт в каждую картинку с ним.", "orihime inoue, long orange hair, brown eyes, hair ornament")}
        ${fi("aliases", "Другие имена в сценах", 0, "Через запятую: как модель может назвать персонажа в [draw:] (латиницей).", "orihime, hime")}
        ${fi("styleTrigger", "Стилевые теги", 1, "Добавляются, только если сцена их упоминает.")}
        ${fi("negative", "Негатив персонажа", 1, "", "short hair, flat chest")}
        <div class="field"><label>LoRA персонажа</label>${loraRows("card-lora", im.loras || [])}<datalist id="dl-loras">${((m.imgLists || {}).loras || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div>
        ${fi("seed", "Закреплённый seed", 0, "Пусто — случайный. Кнопкой у картинки можно закрепить удачный.")}
        ${fi("look", "Внешность", 3, "base: — всегда; «ключ: теги» — когда ключ есть в сцене (улыбка: gentle smile).", "base: brown eyes, large breasts\nочки | glasses: round glasses")}
        ${fi("wardrobe", "Гардероб", 5, "Образ подбирается по одежде из панели сцены: «худи | hoodie: теги». Теги идут в промпт без перевода — как их знает ваша LoRA. Если сцена одевает иначе, образ не добавляется.", "школьная форма | school uniform: serafuku, red neckerchief, pleated skirt\nхуди | hoodie: grey hoodie, denim shorts, <lora:outfit:0.7>")}
        ${fi("nsfw", "Откровенные модификаторы", 3, "Срабатывают только по тексту самой сцены, никогда по одежде из трекера.", "голая | nude: nude, nipples, navel")}`;
    } else {
      body = `<h3>Файл карточки</h3><p class="lead">Экспорт совместим с другими приложениями (Character Card V2/V3). Неизвестные им поля сохраняются.</p>
        <div class="row"><button class="btn" data-act="card-png">${icon("download")}PNG с портретом</button><button class="btn" data-act="card-json">${icon("download")}JSON</button></div>
        ${d.id ? `<div class="block-title" style="margin-top:28px">Удаление</div><p class="hint">Удалит персонажа вместе со всеми чатами и опытом.</p>
        <button class="btn btn-danger" data-act="card-del">${icon("trash")}Удалить ${esc(d.name)}</button>` : ""}`;
    }
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Персонаж">
      <div class="modal-head"><h2>${esc(d.name || "Новый персонаж")}</h2>
        <button class="btn btn-primary btn-sm" data-act="card-save">${icon("check")}Сохранить</button>
        <button class="icon-btn" data-act="modal-close" title="Закрыть без сохранения">${icon("x")}</button></div>
      <nav class="modal-nav">${nav.map(([id, n, ic]) => `<button class="rail-item ${section === id ? "active" : ""}" data-act="card-section" data-section="${id}">${icon(ic)}${n}</button>`).join("")}</nav>
      <div class="modal-body">${body}</div></div></div>`;
  }

  PRP.views = { rail, home, chat, chatHead, feed, composer, drawer, modelPop, chatMenu, settingsModal, cardModal, imageInfo, SAMPLER_PRESETS, THEMES };
})(typeof window !== "undefined" ? window : globalThis);
