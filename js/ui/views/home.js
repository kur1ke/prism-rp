/* Prism RP — левая навигация, стартовое приветствие и отдельный каталог персонажей. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Навигация слева ──────────────────────────────────────────────── */
  function rail(m) {
    const chats = m.chats.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40);
    return `
      <button class="brand" data-act="home" title="На главную">${R.GLYPH}<span>Prism RP</span></button>
      <nav class="rail-nav">
        <button class="rail-item ${m.view === "home" || m.view === "chat" ? "active" : ""}" data-act="home">${icon("home")}Главная</button>
        <button class="rail-item ${m.view === "characters" ? "active" : ""}" data-act="characters">${icon("card")}Персонажи</button>
        <button class="rail-item ${m.view === "assist" ? "active" : ""}" data-act="assist" title="Разговор с моделью вне игры: советы, карточки, разбор чата">${icon("assist")}Ассистент</button>
        <button class="rail-item ${m.view === "world" ? "active" : ""}" data-act="world" title="Общие паки мира для персонажей">${icon("globe")}Миры</button>
        <button class="rail-item" data-act="import">${icon("upload")}Импорт карточки</button>
      </nav>
      <div class="rail-head"><span>Последнее взаимодействие</span></div>
      <div class="rail-chats">
        ${chats.length ? chats.map((c) => {
          const cd = m.cards.find((x) => x.id === c.cardId);
          if (!cd) return "";
          const when = c.updatedAt || c.createdAt || 0;
          const date = when ? new Date(when) : null;
          const exact = date && Number.isFinite(date.getTime())
            ? date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
          const time = exact ? R.ago(when) : "Время неизвестно";
          return `<div class="rail-chat ${m.chat && m.chat.id === c.id && m.view === "chat" ? "active" : ""}" data-act="open-chat" data-id="${c.id}" role="button" tabindex="0">
            ${R.avatar(cd, 34)}
            <div style="min-width:0"><div class="t1" title="${esc(cd.name)}">${esc(cd.name)}</div><div class="t2" title="${esc(exact)}">${esc(time)}</div></div>
            <span class="kind" title="${c.mode === "messenger" ? "Переписка" : "Сцена"}" aria-label="${c.mode === "messenger" ? "Переписка" : "Сцена"}">${icon(c.mode === "messenger" ? "bubble" : "book")}</span>
          </div>`;
        }).join("") : `<p class="hint" style="padding:6px 10px">Здесь появятся ваши чаты.</p>`}
      </div>
      <div class="rail-foot">
        <button class="btn btn-ghost btn-sm" data-act="settings" style="flex:1;justify-content:flex-start">${icon("settings")}Настройки</button>
        <button class="icon-btn" data-act="cycle-theme" title="Сменить тему">${icon("palette")}</button>
      </div>`;
  }

  /* ── Главная: активный диалог отрисовывает chat view; иначе — приветствие ── */
  function home(m) {
    return `<div class="home home-welcome"><div class="home-inner">
      <div class="home-greeting">
        <div class="home-greeting-mark">${R.GLYPH}</div>
        <h1>Добро пожаловать в Prism RP</h1>
        <p class="sub">${m.chats.length
          ? "Выберите диалог в разделе «Последнее взаимодействие» слева или начните общение с другим персонажем."
          : "Чтобы начать, выберите персонажа и откройте сцену или переписку."}</p>
        <div class="row wrap home-greeting-actions">
          <button class="btn btn-primary" data-act="characters">${icon("card")}Персонажи</button>
          ${!m.cards.length ? `<button class="btn" data-act="import">${icon("upload")}Импортировать карточку</button>` : ""}
        </div>
      </div>
    </div></div>`;
  }

  /* ── Каталог персонажей: только карточки, без истории диалогов ── */
  function characters(m) {
    const q = (m.homeQuery || "").toLowerCase();
    const cards = m.cards.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.tags || []).join(" ").toLowerCase().includes(q));
    return `<div class="home"><div class="home-inner">
      <div class="home-top">
        <div><h1>Персонажи</h1>
          <p class="sub">${m.cards.length} ${R.plural(m.cards.length, "персонаж", "персонажа", "персонажей")}. Выберите карточку или начните новый чат.</p></div>
        ${m.cards.length ? `<div class="home-tools">
          <label class="search">${icon("search")}<input id="home-q" placeholder="Найти по имени или тегу" value="${esc(m.homeQuery || "")}"></label>
          <button class="btn" data-act="import">${icon("upload")}Импорт</button>
          <button class="btn btn-primary" data-act="new-card">${icon("plus")}Создать</button></div>` : ""}
      </div>
      ${!m.cards.length ? `<div class="welcome"><div class="step">
        <h3>Персонажей пока нет</h3>
        <p>Импортируйте карточку PNG или JSON либо создайте своего персонажа.</p>
        <div class="row"><button class="btn btn-sm" data-act="import">${icon("upload")}Импорт</button>
          <button class="btn btn-primary btn-sm" data-act="new-card">${icon("plus")}Создать</button></div>
      </div></div>` : ""}
      <div class="gallery">
        ${cards.map((cd) => {
          const last = m.chats.filter((c) => c.cardId === cd.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
          const at = last && last.updatedAt ? new Date(last.updatedAt) : null;
          const dateLabel = at && Number.isFinite(at.getTime()) ? at.toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
          return `<div class="tile" data-act="open-card" data-id="${cd.id}" title="Начать или продолжить чат с ${esc(cd.name)}" role="button" tabindex="0">
            ${R.art(cd)}<div class="tile-shade"></div>
            <div class="tile-actions" role="group" aria-label="Новый чат с ${esc(cd.name)}">
              <button class="tile-action" data-act="new-card-chat" data-id="${cd.id}" data-mode="rp" title="Новая сцена">Сцена</button>
              <button class="tile-action" data-act="new-card-chat" data-id="${cd.id}" data-mode="messenger" title="Новая переписка">Переписка</button>
            </div>
            <button class="tile-edit" data-act="edit-card" data-id="${cd.id}" title="Редактировать карточку">${icon("edit")}<span>Изменить</span></button>
            <div class="tile-body"><div class="tile-name">${esc(cd.name)}</div><div class="tile-tags">${esc((cd.tags || []).slice(0, 4).join(", ") || cd.creator || " ")}</div>
              <div class="tile-last"><span>Последнее взаимодействие</span>
                ${dateLabel ? `<time title="${esc(dateLabel)}" datetime="${at.toISOString()}">${esc(R.ago(last.updatedAt))} · ${esc(at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }))}</time>` : '<span class="tile-last-none">Ещё не было</span>'}
              </div></div>
          </div>`;
        }).join("")}
        ${m.cards.length ? `<div class="tile tile-new" role="group">
          ${icon("plus")}<button class="btn btn-sm" data-act="new-card">Создать</button><button class="btn btn-sm btn-ghost" data-act="import">Импорт</button></div>` : ""}
      </div>
      ${q && !cards.length ? `<p class="empty-note">Никого не нашлось по запросу «${esc(m.homeQuery)}».</p>` : ""}
    </div></div>`;
  }

  // База браузера не открылась. Ничего не удалено: сообщение только объясняет, что сделать.
  function storageError(e) {
    const busy = e.code === "DB_BLOCKED" || e.code === "DB_OPEN_TIMEOUT";
    return `<div class="home"><div class="home-inner"><div class="storage-error" data-code="${esc(e.code || "")}" role="alert">
      <h1>${icon("alert")} Не удалось открыть базу Prism RP</h1>
      ${busy ? `<p>Возможно, её держит другая вкладка Prism RP — например, редактор генератора или старая вкладка, открытая до обновления.</p>
        <p><b>Закройте другие вкладки Prism RP и обновите эту страницу.</b> Если не поможет — перезапустите браузер.</p>`
        : `<p>${esc(e.message || String(e))}</p><p>Обновите страницу. Если ошибка повторяется, перезапустите браузер.</p>`}
      <p class="hint">Ваши персонажи и чаты не удалены: они остаются в браузере и откроются, когда база станет доступна.</p>
      <button class="btn btn-primary" data-act="reload-page">Обновить страницу</button></div></div></div>`;
  }
  Object.assign((PRP.views = PRP.views || {}), { rail, home, characters, storageError });
})(typeof window !== "undefined" ? window : globalThis);
