/* Prism RP — корень приложения (composition root).
   Здесь: состояние сессии, сборка контекста зависимостей, навигация, загрузка,
   разбор событий DOM по контроллерам, запуск. Правил предметной области здесь нет:
     события  → контроллеры (js/ui/controllers/*) — тонкие обработчики
              → сервисы (chat, generation, prism, experience, cards, images, assist)
              → чистые модули (prism/*, chat/tree, cards/ccard, images/*, assist/assist)
              → хранилище (core/store) и транспорт моделей (providers/*)
     перерисовка — через порт интерфейса (js/ui/shell.js).
   Платформонезависимо: на Perchance добавляется провайдер ai-text-plugin, везде доступны
   OpenAI-совместимые API. Данные — в IndexedDB текущего сайта, переезд — через бэкап JSON. */
(function () {
  "use strict";
  const PRP = window.PRP;
  const { util: U, store: DB, settings: ST, perchance: PC, imgBackends: IB, imgCompile: ICP } = PRP;

  /* ── Состояние сессии ────────────────────────────────────────────────
     Данные: settings, cards, chats, messages (текущего чата), experience (персонажа), worldOverlay (мир текущего чата),
     messengerEnv (среда текущей переписки), assistList.
     Навигация: view, cardId, chatId, assist (открытый разговор).
     Генерация (временное): gen, drawing (id картинок в работе).
     Интерфейс: drawerOpen, tab, find, homeQuery, modal, editProviderId, pop, editingMsg, expDraft.
     Кэш: lastPrism (последняя сборка), imgUrls (картинки чата), imgLists (списки A1111), legacyExperience. */
  const S = {
    settings: null, cards: [], chats: [],
    view: "home", cardId: null, chatId: null, messages: [], experience: [],
    gen: null, lastPrism: null, editingMsg: null, expDraft: null,
    drawerOpen: false, tab: "scene", find: null, homeQuery: "",
    modal: null, editProviderId: null, pop: null,
    imgUrls: {}, imgLists: {}, drawing: new Set(),
    assist: null, assistList: [],
    worldPacks: [], worldLenses: [], worldDraft: null,
    worldOverlay: null, worldEdit: null, // наложение мира текущего чата; черновик действия во вкладке «Мир чата»
    messengerEnv: null, envEdit: null, // среда текущей переписки (у сцены — null); черновик правки во вкладке «Среда»
  };

  /* ── Контекст зависимостей ───────────────────────────────────────────
     Передаётся явно в сервисы и контроллеры. Сервисы не трогают DOM: перерисовку
     просят через ctx.ui; контроллеры читают DOM и вызывают сервисы. */
  const ctx = {
    S, DB,
    files: PRP.files,
    env: { perchanceImages: () => IB.available("perchance") },
    // Часы для живого времени переписки (в тестах подменяются). Таймеров нет: время читается только при действии.
    clock: () => Date.now(),
    card: () => S.cards.find((c) => c.id === S.cardId) || null,
    chat: () => S.chats.find((c) => c.id === S.chatId) || null,
    persona: () => ST.persona(S.settings),
    providers: () => ST.providerList(S.settings, PC.available()),
    provider: () => ST.activeProvider(S.settings, ctx.providers()),
    contextTokens: () => ST.contextTokens(S.settings, ctx.provider(), () => PC.meta()),
    saveSettings: () => DB.setSetting("app", S.settings),
    svc: {},
    nav: {},
  };
  ctx.ui = PRP.shell.create(ctx);
  ctx.svc.chat = PRP.chatService.create(ctx);
  ctx.svc.exp = PRP.experienceService.create(ctx);
  ctx.svc.prism = PRP.prismService.create(ctx);
  ctx.svc.images = PRP.imageService.create(ctx);
  ctx.svc.gen = PRP.generationService.create(ctx);
  ctx.svc.cards = PRP.cardService.create(ctx);
  ctx.svc.assist = PRP.assistService.create(ctx);
  ctx.svc.world = PRP.worldService.create(ctx);
  ctx.svc.worldChat = PRP.worldOverlayService.create(ctx);
  ctx.svc.messenger = PRP.messengerService.create(ctx);
  const { ui, svc } = ctx;
  const { $ } = ui;

  /* ── Загрузка ─────────────────────────────────────────────────────── */
  async function loadAll() {
    S.worldOverlay = null; S.worldEdit = null; S.messengerEnv = null; S.envEdit = null;
    const saved = await DB.getSetting("app", null);
    S.settings = ST.merge(saved, { perchanceImages: IB.available("perchance") });
    S.imgLists = (await DB.getSetting("imgLists", {})) || {};
    ICP.setStore({ load: () => DB.getSetting("imgPromptCache", {}), save: (o) => DB.setSetting("imgPromptCache", o) });
    S.cards = (await DB.all("cards")).map(PRP.cardModel.upgradeStored).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    S.chats = await DB.all("chats");
    S.assistList = await svc.assist.loadAll();
    await svc.world.loadAll();
    await svc.exp.migrate();
    const saveUi = (await DB.getSetting("ui", {})) || {};
    S.drawerOpen = !!saveUi.drawerOpen && !ui.narrow();
    if (saveUi.chatId && S.chats.some((c) => c.id === saveUi.chatId)) await openChat(saveUi.chatId, true);
    else if (saveUi.view === "assist") openAssist(saveUi.assistId, null, true);
  }

  /* ── Навигация ───────────────────────────────────────────────────── */
  async function openChat(chatId, quiet) {
    const c = S.chats.find((x) => x.id === chatId);
    if (!c) return;
    S.chatId = chatId;
    S.cardId = c.cardId;
    S.view = "chat";
    S.messages = await svc.chat.loadMessages(chatId);
    S.experience = await svc.exp.loadForCard(c.cardId);
    await svc.worldChat.load(chatId);
    await svc.messenger.load(chatId);
    await svc.images.loadForChat(chatId);
    S.editingMsg = null; S.expDraft = null; S.worldEdit = null; S.envEdit = null; S.find = null;
    svc.prism.refresh();
    ui.rememberUi();
    if (!quiet) { ui.renderAll(); ui.scrollBottom(); }
    $("#rail").classList.remove("open");
    ui.syncScrim();
  }
  function goHome() {
    S.view = "home";
    S.find = null;
    ui.rememberUi();
    $("#rail").classList.remove("open");
    ui.renderAll();
  }
  /* Новый чат. Режим выбирается здесь и потом не меняется. Для переписки — явная настройка времени (setup:
     { timeZone, timeMode, manualNow }); она проверяется до создания чата. */
  async function newChat(mode, cardId, setup) {
    if (mode === "messenger") {
      const err = svc.messenger.checkSetup(setup || { timeZone: PRP.messengerTime.systemTimeZone(), timeMode: "live" });
      if (err) { ui.toast(err, true); return null; }
    }
    const id = await svc.chat.createChat(mode, cardId);
    if (id && mode === "messenger") await svc.messenger.createFor(id, setup || { timeZone: PRP.messengerTime.systemTimeZone(), timeMode: "live" });
    if (id) await openChat(id);
    return id;
  }
  async function openCard(cardId) {
    const latest = svc.chat.latestForCard(cardId);
    if (latest) return openChat(latest.id);
    return newChat("rp", cardId);
  }
  function openAssist(id, base, quiet) {
    if (S.gen) { ui.toast("Дождитесь окончания ответа или остановите его.", true); return; }
    svc.assist.pick(id, base);
    S.view = "assist";
    S.find = null;
    S.drawerOpen = S.drawerOpen && !ui.narrow();
    ui.rememberUi();
    $("#rail").classList.remove("open");
    if (!quiet) { ui.renderAll(); ui.scrollBottom(); setTimeout(() => { const i = $("#input"); if (i && !ui.narrow()) i.focus(); }, 30); }
  }
  // Библиотека миров. keepDraft — оставить открытым текущий черновик пака (например, после импорта).
  function openWorld(keepDraft) {
    if (!keepDraft) S.worldDraft = null;
    S.view = "world";
    S.find = null;
    ui.rememberUi();
    $("#rail").classList.remove("open");
    ui.renderAll();
  }
  Object.assign(ctx.nav, { loadAll, openChat, goHome, newChat, openCard, openAssist, openWorld });

  /* ── Контроллеры и разбор событий ─────────────────────────────────── */
  const C = PRP.controllers;
  const controllers = [C.chat, C.drawer, C.cards, C.settings, C.images, C.assist, C.world, C.messenger].map((make) => make(ctx));
  const ACTS = Object.assign({
    home: goHome,
    "open-chat": (t) => openChat(t.dataset.id),
    rail: () => { $("#rail").classList.toggle("open"); ui.syncScrim(); },
    "reload-page": () => location.reload(),
    "modal-bg": (t, e) => { if (e.target === t) { S.modal = null; ui.renderModal(); } },
    "modal-close": () => { S.modal = null; ui.renderModal(); },
  }, ...controllers.map((c) => c.actions));
  const chatCtl = controllers[0];

  // Поповеры закрываются кликом мимо, кроме кнопок, которые их открывают.
  const POP_ANCHORS = "[data-act=model-pop],[data-act=chat-menu],[data-act=assist-ctx],[data-act=assist-list]";
  async function onClick(e) {
    if (S.pop && !e.target.closest(".pop") && !e.target.closest(POP_ANCHORS)) ui.closePop();
    const t = e.target.closest("[data-act]");
    if (!t || t.disabled) return;
    const fn = ACTS[t.dataset.act];
    if (!fn) return;
    if (t.dataset.act === "modal-bg" && e.target !== t) return;
    try { await fn(t, e); } catch (err) { console.error(err); ui.toast(err.message || String(err), true); }
  }
  async function onChange(e) {
    const t = e.target;
    try {
      for (const c of controllers) if (c.change && (await c.change(t))) return;
    } catch (err) { console.error(err); ui.toast(err.message || String(err), true); }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === "home-q") {
      S.homeQuery = t.value;
      const pos = t.selectionStart;
      ui.renderStage();
      const n = $("#home-q"); n.focus(); n.setSelectionRange(pos, pos);
    }
    for (const c of controllers) if (c.input) c.input(t);
  }
  function onKey(e) {
    const t = e.target;
    for (const c of controllers) if (c.key && c.key(e, t)) return;
    if (chatCtl.shortcut(e)) return;
    if (e.key === "Escape") {
      if (S.pop) return ui.closePop();
      if (S.modal) { S.modal = null; return ui.renderModal(); }
      if (S.editingMsg) { S.editingMsg = null; return ui.renderFeed(); }
      if (S.find) return ACTS["find-close"]();
      if (S.drawerOpen && ui.narrow()) return ACTS["drawer-close"]();
    }
    if ((e.key === "Enter" || e.key === " ") && t.getAttribute && t.getAttribute("role") === "button" && t.dataset.act) { e.preventDefault(); t.click(); }
  }
  function bind() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("keydown", onKey);
    $("#scrim").addEventListener("click", () => {
      $("#rail").classList.remove("open");
      if (S.drawerOpen && ui.narrow()) { S.drawerOpen = false; ui.renderDrawer(); ui.renderFeed(); }
      ui.syncScrim();
    });
    window.addEventListener("resize", () => { ui.syncScrim(); if (S.pop) ui.closePop(); });
  }

  async function init() {
    bind();
    try {
      await loadAll();
      if (!ctx.providers().some((p) => p.id === S.settings.activeProvider)) S.settings.activeProvider = (ctx.providers()[0] || {}).id || "";
      ui.renderAll();
      ui.scrollBottom();
    } catch (e) {
      console.error(e);
      S.settings = S.settings || U.clone(ST.DEFAULTS);
      ui.renderAll();
      // База не открылась (занята другой вкладкой, не ответила или ошибка браузера): постоянное сообщение
      // вместо пустого экрана. Данные не трогаются; помогает закрыть другие вкладки и обновить страницу.
      if (e && /^DB_/.test(e.code || "")) $("#stage").innerHTML = PRP.views.storageError(e);
      else ui.toast("Не удалось открыть хранилище браузера: " + e.message, true);
    }
  }
  // Другая вкладка обновляет базу — это соединение уже закрыто; работать дальше можно только после обновления страницы.
  DB.onVersionChange = () => ui.toast("Prism RP открыт в другой вкладке с более новой версией. Обновите эту страницу, чтобы продолжить.", true);

  PRP.app = { S, ctx, generate: (...a) => svc.gen.generate(...a), refreshPrism: () => svc.prism.refresh() };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
