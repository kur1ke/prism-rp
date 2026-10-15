/* Prism RP — приложение: состояние, действия, генерация, события.
   Платформонезависимо: на Perchance добавляется провайдер ai-text-plugin,
   везде доступны OpenAI-совместимые API. Данные — в IndexedDB текущего сайта,
   переезд между платформами — через бэкап JSON. */
(function () {
  "use strict";
  const { util: U, store: DB, scene: SC, experience: EX, assembler: AS, ccard: CC, openai: OA, perchance: PC, tree: TR, render: R, views: V, imgCompose: IC, imgBackends: IB, imgCompile: ICP, assist: AST } = window.PRP;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  const DEFAULTS = {
    activeProvider: "perchance",
    providers: [],
    samplerPreset: "balanced",
    sampler: { temperature: 0.9, top_p: 0.95, min_p: 0.05, top_k: 0, repetition_penalty: 1.05, max_tokens: 700 },
    contextTokens: 8192,
    autoContext: true,
    singleSystem: false,
    sceneProtocol: true,
    noPostHistory: false,
    expLimit: 8,
    theme: "dusk",
    proseSize: 17,
    persona: { name: "Пользователь", description: "" },
    images: {
      enabled: true, backend: "perchance", url: "", key: "", model: "", vae: "", sampler: "", scheduler: "",
      steps: 28, cfg: 5.5, seed: "", sizeMode: "auto", fixedSize: "1024x1024", maxSide: 1216,
      hires: false, hiresScale: 1.5, hiresUpscaler: "R-ESRGAN 4x+ Anime6B", hiresDenoise: 0.4, hiresSteps: 0,
      fixedPrompt: "", promptMode: "append", negative: "", format: "tags", translate: true,
      modelDraws: true, autoDraw: true, extra: "",
    },
  };

  const S = {
    settings: null, cards: [], chats: [],
    view: "home", cardId: null, chatId: null, messages: [], experience: [],
    gen: null, lastPrism: null, editingMsg: null, expDraft: null,
    drawerOpen: false, tab: "scene", find: null, homeQuery: "",
    modal: null, editProviderId: null, pop: null,
    imgUrls: {}, imgLists: {}, drawing: new Set(),
    assist: null, assistList: [],
  };

  /* ── Мелочи ─────────────────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(text, isErr) {
    const el = $("#toast");
    el.innerHTML = R.icon(isErr ? "alert" : "check") + `<span>${R.esc(text)}</span>`;
    el.className = "toast" + (isErr ? " err" : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), isErr ? 8000 : 2800);
  }
  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[\\/:*?"<>|]+/g, "_");
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function readFile(file, as) {
    return new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => fail(r.error);
      if (as === "text") r.readAsText(file);
      else if (as === "dataurl") r.readAsDataURL(file);
      else r.readAsArrayBuffer(file);
    });
  }
  const card = () => S.cards.find((c) => c.id === S.cardId) || null;
  const chat = () => S.chats.find((c) => c.id === S.chatId) || null;
  const persona = () => S.settings.persona || DEFAULTS.persona;
  const narrow = () => window.innerWidth < 1280;

  /* ── Провайдер ──────────────────────────────────────────────────────── */
  function providerList() {
    const list = [];
    if (PC.available()) list.push({ id: "perchance", name: "Perchance", kind: "perchance", label: "Perchance" });
    for (const p of S.settings.providers) list.push(Object.assign({ kind: "openai", label: p.model ? `${p.name} · ${p.model}` : p.name }, p));
    return list;
  }
  function activeProvider() {
    const list = providerList();
    return list.find((p) => p.id === S.settings.activeProvider) || list[0] || null;
  }
  function contextTokens() {
    const p = activeProvider();
    if (S.settings.autoContext && p && p.kind === "perchance") {
      const m = PC.meta();
      if (m && m.idealMaxContextTokens) return m.idealMaxContextTokens;
    }
    return S.settings.contextTokens || 8192;
  }

  /* ── Опыт: канон чата и ветки ───────────────────────────────────────── */
  function pathCtx(path) { return (path || activePath()).map((m) => ({ id: m.id, swipeIdx: m.swipeIdx || 0 })); }
  // Что показывать во вкладке «Опыт»: видимое в этой ветке, скрытое в других ветках, непривязанное.
  function expView(path) {
    const ctx = { chatId: S.chatId, path: pathCtx(path) };
    const inChat = S.experience.filter((r) => r.chatId === S.chatId && !r.legacyUnscoped);
    const visible = inChat.filter((r) => EX.visibility(r, ctx).visible);
    return { visible, hiddenInChat: inChat.length - visible.length, legacy: S.experience.filter((r) => EX.scopeOf(r) === "legacy") };
  }
  // Однократная (и повторяемая без вреда) миграция старых записей: привязка к чату без догадок.
  async function migrateExperience() {
    const all = await DB.all("experience");
    const need = all.filter((r) => !r.chatId && !(r.source && r.source.chatId) && r.source && (r.source.messageIds || []).length);
    const msgChat = new Map();
    for (const r of need) for (const id of r.source.messageIds) {
      if (msgChat.has(id)) continue;
      const msg = await DB.get("messages", id);
      msgChat.set(id, msg ? msg.chatId : null);
    }
    const res = EX.migrate(all, { messageChat: (id) => (msgChat.has(id) ? msgChat.get(id) : null) });
    const changed = res.records.filter((r) => res.changed.includes(r.id));
    if (changed.length) await DB.putMany("experience", changed);
    S.legacyExperience = res.legacy;
    return res;
  }

  /* ── Модель представления ───────────────────────────────────────────── */
  function activePath() {
    const c = chat();
    return c ? TR.path(TR.index(S.messages), c.leafId) : [];
  }
  function sceneState(path) {
    const c = chat();
    return SC.fold(c ? c.sceneInit : "", (path || activePath()).map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })));
  }
  function vm() {
    const path = activePath();
    return {
      S, view: S.view, cards: S.cards, chats: S.chats, card: card(), chat: chat(), persona: persona(), path,
      scene: chat() ? sceneState(path) : SC.emptyState(), gen: S.gen, editingMsg: S.editingMsg,
      provider: activeProvider(), providers: providerList(), settings: S.settings,
      exps: S.experience, expView: expView(path), expDraft: S.expDraft, lastPrism: S.lastPrism, tab: S.tab, find: S.find,
      drawerOpen: S.drawerOpen, homeQuery: S.homeQuery, editProviderId: S.editProviderId,
      stats: `Персонажей: ${S.cards.length}, чатов: ${S.chats.length}.`,
      imgUrls: S.imgUrls, imgLists: S.imgLists, perchanceImages: IB.available("perchance"),
      origin: location.origin && location.origin !== "null" ? location.origin : "*",
      assist: S.assist, assistList: S.assistList,
      assistCard: S.assist && S.assist.ctx.cardId ? S.cards.find((c) => c.id === S.assist.ctx.cardId) || null : null,
      assistChat: S.assist && S.assist.ctx.chatId ? S.chats.find((c) => c.id === S.assist.ctx.chatId) || null : null,
    };
  }

  /* ── Отрисовка ──────────────────────────────────────────────────────── */
  function applyLook() {
    document.documentElement.setAttribute("data-theme", S.settings.theme || "dusk");
    document.documentElement.style.setProperty("--prose-fs", (S.settings.proseSize || 17) + "px");
  }
  function renderRail() { $("#rail").innerHTML = V.rail(vm()); }
  function renderStage() {
    const app = $("#app");
    const m = vm();
    const input = $("#input");
    const keep = input ? { v: input.value, s: input.selectionStart, f: document.activeElement === input } : null;
    const feedEl = $("#feed");
    const scroll = feedEl ? feedEl.scrollTop : null;
    if (S.view === "assist" && S.assist) {
      $("#stage").innerHTML = V.assist(m);
      app.classList.remove("messenger");
      if (keep) {
        const i = $("#input"); i.value = keep.v; autoGrow(i);
        if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (e) {} }
      }
      if (scroll != null && $("#feed")) $("#feed").scrollTop = scroll;
    } else if (S.view === "chat" && m.chat && m.card) {
      $("#stage").innerHTML = V.chat(m);
      app.classList.toggle("messenger", m.chat.mode === "messenger");
      if (keep) {
        const i = $("#input"); i.value = keep.v; autoGrow(i);
        if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (e) {} }
      }
      if (scroll != null) $("#feed").scrollTop = scroll;
      if (S.find) applyFind(false);
    } else {
      app.classList.remove("messenger");
      $("#stage").innerHTML = V.home(m);
    }
    app.classList.toggle("generating", !!S.gen);
  }
  function renderFeed() {
    if (S.view === "assist") return renderStage();
    const inner = $("#feed-inner");
    if (!inner) return renderStage();
    inner.innerHTML = V.feed(vm());
    const head = $(".chat-head");
    if (head) head.outerHTML = V.chatHead(vm());
    const comp = $(".composer-wrap");
    if (comp) {
      const i = $("#input");
      const keep = i ? i.value : "";
      const focused = document.activeElement === i;
      comp.outerHTML = V.composer(vm());
      const ni = $("#input"); ni.value = keep; autoGrow(ni);
      if (focused) ni.focus();
    }
    $("#app").classList.toggle("generating", !!S.gen);
    if (S.find) applyFind(false);
  }
  function renderDrawer() {
    const d = $("#drawer");
    d.classList.toggle("open", S.drawerOpen && S.view === "chat");
    $("#app").classList.toggle("drawer-open", S.drawerOpen && S.view === "chat");
    const body = $("#drawer-body");
    const scroll = body ? body.scrollTop : 0;
    d.innerHTML = S.drawerOpen && S.view === "chat" ? V.drawer(vm()) : "";
    const nb = $("#drawer-body");
    if (nb) nb.scrollTop = scroll;
    syncScrim();
  }
  function renderModal() {
    const root = $("#modal-root");
    if (!S.modal) { root.innerHTML = ""; return; }
    const m = vm();
    const scroll = $(".modal-body") ? $(".modal-body").scrollTop : 0;
    if (S.modal.kind === "image") {
      const im = S.modal.im, url = S.imgUrls[im.id];
      root.innerHTML = `<div class="modal-wrap lightbox" data-act="modal-bg"><figure class="lb-fig"><img src="${url}" alt="">
        <figcaption><span>${R.esc(im.draw || "")}</span><span class="lb-tools">
          <button class="btn btn-sm" data-act="img-modal-regen">${R.icon("regen")}Заново</button>
          <button class="btn btn-sm" data-act="img-dl" data-mid="${S.modal.mid}" data-sw="${S.modal.sw}" data-img="${im.id}">${R.icon("download")}Скачать</button>
          <button class="icon-btn" data-act="modal-close" title="Закрыть">${R.icon("x")}</button></span></figcaption></figure></div>`;
      return;
    }
    root.innerHTML = S.modal.kind === "settings" ? V.settingsModal(m, S.modal.section) : V.cardModal(m, S.modal.draft, S.modal.section);
    if (S.modal.keepScroll && $(".modal-body")) $(".modal-body").scrollTop = scroll;
    S.modal.keepScroll = false;
  }
  function renderAll() { applyLook(); renderRail(); renderStage(); renderDrawer(); renderModal(); }
  function scrollBottom() { const el = $("#feed"); if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight)); }
  function syncScrim() {
    const railOpen = $("#rail").classList.contains("open");
    const drawerOverlay = S.drawerOpen && S.view === "chat" && narrow();
    $("#scrim").hidden = !(railOpen || drawerOverlay);
  }

  /* ── Загрузка ───────────────────────────────────────────────────────── */
  async function saveSettings() { await DB.setSetting("app", S.settings); }
  async function loadAll() {
    const saved = await DB.getSetting("app", null);
    S.settings = Object.assign(U.clone(DEFAULTS), saved || {});
    S.settings.sampler = Object.assign({}, DEFAULTS.sampler, S.settings.sampler || {});
    S.settings.persona = Object.assign({}, DEFAULTS.persona, S.settings.persona || {});
    S.settings.images = Object.assign({}, DEFAULTS.images, S.settings.images || {});
    if (!saved && !IB.available("perchance")) S.settings.images.backend = "a1111";
    S.imgLists = (await DB.getSetting("imgLists", {})) || {};
    ICP.setStore({ load: () => DB.getSetting("imgPromptCache", {}), save: (o) => DB.setSetting("imgPromptCache", o) });
    S.cards = (await DB.all("cards")).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    S.chats = await DB.all("chats");
    S.assistList = await DB.all("assist");
    await migrateExperience();
    const ui = (await DB.getSetting("ui", {})) || {};
    S.drawerOpen = !!ui.drawerOpen && !narrow();
    if (ui.chatId && S.chats.some((c) => c.id === ui.chatId)) await openChat(ui.chatId, true);
    else if (ui.view === "assist") openAssist(ui.assistId, null, true);
  }
  function rememberUi() {
    DB.setSetting("ui", { chatId: S.view === "chat" ? S.chatId : null, drawerOpen: S.drawerOpen, view: S.view, assistId: S.view === "assist" && S.assist && S.assist.messages.length ? S.assist.id : null });
  }

  async function openChat(chatId, quiet) {
    const c = S.chats.find((x) => x.id === chatId);
    if (!c) return;
    S.chatId = chatId;
    S.cardId = c.cardId;
    S.view = "chat";
    S.messages = await DB.byIndex("messages", "chatId", chatId);
    S.experience = await DB.byIndex("experience", "owner", c.cardId);
    S.imgUrls = {};
    (await DB.byIndex("images", "chatId", chatId)).forEach((x) => (S.imgUrls[x.id] = x.dataUrl));
    // Рисование, прерванное закрытием страницы, не должно висеть «в работе».
    for (const msg of S.messages) for (const sw of msg.swipes) for (const im of sw.images || []) {
      if (im.status === "pending" && !S.drawing.has(im.id)) { im.status = "error"; im.error = "Рисование прервано. Попробуйте ещё раз."; }
    }
    S.editingMsg = null; S.expDraft = null; S.find = null;
    refreshPrism();
    rememberUi();
    if (!quiet) { renderAll(); scrollBottom(); }
    $("#rail").classList.remove("open");
    syncScrim();
  }
  function goHome() {
    S.view = "home";
    S.find = null;
    rememberUi();
    $("#rail").classList.remove("open");
    renderAll();
  }

  /* ── Сообщения ──────────────────────────────────────────────────────── */
  async function putMsg(m) {
    await DB.put("messages", m);
    const i = S.messages.findIndex((x) => x.id === m.id);
    if (i >= 0) S.messages[i] = m; else S.messages.push(m);
  }
  async function putChat(c) {
    await DB.put("chats", c);
    const i = S.chats.findIndex((x) => x.id === c.id);
    if (i >= 0) S.chats[i] = c; else S.chats.push(c);
  }
  async function touchChat() {
    const c = chat();
    if (!c) return;
    const last = activePath().slice(-1)[0];
    const t = last ? TR.activeSwipe(last).text : "";
    c.preview = (last && last.role === "user" ? "Вы: " : "") + t.replace(/\s+/g, " ").slice(0, 90);
    await putChat(c);
  }
  function newMsg(role, parentId, text) {
    const now = Date.now();
    return { id: U.uid("m"), chatId: S.chatId, parentId: parentId || null, role, swipes: [{ text: text || "", sceneOps: [], createdAt: now }], swipeIdx: 0, createdAt: now };
  }

  async function newChat(mode, cardId) {
    const cd = S.cards.find((x) => x.id === (cardId || S.cardId));
    if (!cd) return;
    const c = { id: U.uid("chat"), cardId: cd.id, mode, title: mode === "messenger" ? "Переписка" : "Сцена", sceneInit: "", leafId: null, createdAt: Date.now() };
    S.chatId = c.id; S.cardId = cd.id; S.messages = [];
    if (mode === "rp" && (cd.firstMes || (cd.altGreetings || []).length)) {
      const vars = { char: cd.name, user: persona().name };
      const m = newMsg("assistant", null, "");
      m.swipes = [cd.firstMes].concat(cd.altGreetings || []).filter(Boolean).map((g) => {
        const parsed = SC.parse(U.macros(g, vars));
        return { text: parsed.text, sceneOps: parsed.ops, createdAt: Date.now() };
      });
      await putMsg(m);
      c.leafId = m.id;
      c.preview = m.swipes[0].text.replace(/\s+/g, " ").slice(0, 90);
    }
    await putChat(c);
    await openChat(c.id);
  }

  async function openCard(cardId) {
    const chats = S.chats.filter((c) => c.cardId === cardId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (chats[0]) return openChat(chats[0].id);
    return newChat("rp", cardId);
  }

  async function sendUser() {
    const input = $("#input");
    if (!input) return;
    const text = input.value.trim();
    if (!text || S.gen) return;
    if (S.view === "assist") { input.value = ""; autoGrow(input); return assistSend(text); }
    const c = chat();
    input.value = "";
    autoGrow(input);
    const m = newMsg("user", c.leafId, text);
    await putMsg(m);
    c.leafId = m.id;
    await touchChat();
    renderFeed();
    scrollBottom();
    await generate();
  }

  function imagesOn() {
    const ic = S.settings.images;
    return ic.enabled && (ic.backend !== "perchance" || IB.available("perchance"));
  }
  function qualityPinned() {
    const ic = S.settings.images;
    return ic.promptMode !== "off" && !!String(ic.fixedPrompt || "").trim();
  }
  function buildPrism(path, extraPost) {
    const c = chat(), cd = card();
    if (imagesOn() && S.settings.images.modelDraws) {
      const di = IC.drawInstruction({ format: S.settings.images.format, qualityPinned: qualityPinned(), pov: (persona().image || {}).view === "first" });
      extraPost = [di, extraPost].filter(Boolean).join("\n\n");
    }
    const st = sceneState(path);
    const history = path.map((m) => ({ role: m.role, text: TR.activeSwipe(m).text })).filter((h) => h.text);
    const recent = history.slice(-4).map((h) => h.text).join("\n");
    const ex = EX.rank(S.experience, {
      chatId: c.id, path: pathCtx(path), ownerId: cd.id, present: ["user"].concat(st.present),
      text: recent, names: [cd.name, persona().name].concat(st.present), limit: S.settings.expLimit,
    });
    const built = AS.build({
      mode: c.mode, card: cd, userName: persona().name, userDesc: persona().description,
      sceneState: st, experiences: ex.ranked, history, extraPost,
      contextTokens: contextTokens(), reserveTokens: S.settings.sampler.max_tokens || 700,
      singleSystem: S.settings.singleSystem, sceneProtocol: S.settings.sceneProtocol, noPostHistory: !!S.settings.noPostHistory,
    });
    built.report.expDebug = ex.debug;
    built.report.experienceVisible = ex.visibleCount;
    built.report.legacyUnscoped = S.experience.filter((r) => EX.scopeOf(r) === "legacy").length;
    return built;
  }
  function refreshPrism() {
    if (!chat() || !card()) { S.lastPrism = null; return; }
    S.lastPrism = Object.assign({ at: Date.now(), preview: true }, buildPrism(activePath()));
  }

  // mode: "new" | "regen" (новый свайп) | "continue" (дописать текущий свайп)
  async function generate(msgId, mode) {
    if (S.gen) return;
    const c = chat(), cd = card();
    const prov = activeProvider();
    if (!c || !cd) return;
    if (!prov) { toast("Модель не подключена. Откройте «Настройки → Модели».", true); openSettings("models"); return; }
    mode = mode || (msgId ? "regen" : "new");

    // Предварительная проверка: контекст собирается ДО любых изменений дерева сообщений.
    // Если он не помещается, запрос не уходит и история не получает ни узла, ни варианта.
    let path = activePath();
    if (mode === "regen") path = path.slice(0, path.findIndex((m) => m.id === msgId));
    const extraPost = mode === "continue" ? "Продолжи последнее сообщение {{char}} ровно с того места, где оно оборвалось. Не повторяй уже написанное и не начинай заново." : "";
    const built = buildPrism(path, extraPost);
    S.lastPrism = Object.assign({ at: Date.now(), provider: prov.label }, built);
    if (built.report.overflow) {
      toast(`Контекст не помещается даже после всех сокращений (${built.report.used} из ${built.report.budget} токенов), запрос не отправлен. Увеличьте объём контекста в «Настройки → Генерация» или сократите сцену и карточку. Подробности — во вкладке Prism.`, true);
      if (S.drawerOpen) { S.tab = "prism"; renderDrawer(); }
      renderFeed();
      return;
    }

    let target, prefix = "";
    if (mode === "regen") {
      target = S.messages.find((m) => m.id === msgId);
      target.swipes.push({ text: "", sceneOps: [], createdAt: Date.now() });
      target.swipeIdx = target.swipes.length - 1;
    } else if (mode === "continue") {
      target = S.messages.find((m) => m.id === msgId);
      prefix = TR.activeSwipe(target).text;
    } else {
      target = newMsg("assistant", c.leafId, "");
      c.leafId = target.id;
      await putChat(c);
    }
    await putMsg(target);

    const sw = TR.activeSwipe(target);
    const ctrl = new AbortController();
    S.gen = { ctrl, msgId: target.id, raw: "", reasoning: "", prefix: prefix ? prefix + (/\s$/.test(prefix) ? "" : " ") : "" };
    renderFeed();
    if (S.drawerOpen && S.tab === "prism") renderDrawer();
    scrollBottom();

    const onDelta = (d) => { S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; paintStreaming(); };
    let raw = "", reasoning = "", error = null;
    try {
      const res = prov.kind === "perchance"
        ? await PC.chat({ char: cd.name, user: persona().name }, built.messages, { signal: ctrl.signal, onDelta, continueFrom: prefix || null })
        : await OA.chat(prov, built.messages, S.settings.sampler, { signal: ctrl.signal, onDelta });
      raw = res.text; reasoning = res.reasoning;
    } catch (e) {
      raw = e.partial != null ? e.partial : S.gen.raw;
      reasoning = S.gen.reasoning;
      if (e.name !== "AbortError") error = e.message || String(e);
    }
    const th = OA.splitThink(raw || "");
    const parsed = SC.parse(th.text);
    const dr = IC.parseDraws(parsed.text);
    if (mode === "continue") {
      if (dr.text) sw.text = S.gen.prefix + dr.text;
      sw.sceneOps = (sw.sceneOps || []).concat(parsed.ops);
      sw.draws = (sw.draws || []).concat(dr.draws);
    } else {
      sw.text = dr.text;
      sw.sceneOps = parsed.ops;
      sw.draws = dr.draws;
    }
    sw.reasoning = [sw.reasoning && mode === "continue" ? sw.reasoning : "", reasoning, th.reasoning].filter(Boolean).join("\n").trim();
    if (error) sw.error = error; else delete sw.error;
    S.gen = null;
    await putMsg(target);
    await touchChat();
    refreshPrism();
    renderFeed();
    renderRail();
    if (S.drawerOpen) renderDrawer();
    scrollBottom();
    if (!error && dr.draws.length && imagesOn() && S.settings.images.autoDraw) drawImage(target, sw, dr.draws[0]);
  }

  /* ── Картинки ───────────────────────────────────────────────────────── */
  async function textGen(instruction) {
    const prov = activeProvider();
    if (!prov) throw new Error("нет текстовой модели");
    if (prov.kind === "perchance") return PC.simple(instruction);
    const r = await OA.chat(prov, [{ role: "user", content: instruction }], { temperature: 0.3, max_tokens: 400 }, {});
    return OA.splitThink(r.text).text;
  }
  function identityFor(cd) {
    const im = cd.image || {};
    const bits = ["name: " + cd.name];
    if (im.trigger) bits.push("already injected later (do NOT repeat these tags): " + im.trigger);
    const base = IC.parseMap(im.look).filter((e) => /^(|base|always)$/i.test(e.key)).map((e) => e.tags).join(", ");
    if (base) bits.push("look: " + base);
    return bits.join("\n");
  }

  async function drawImage(msg, sw, draw, reuse, opts) {
    const o = opts || {};
    const cfg = S.settings.images, cd = card();
    if (!cfg.enabled) { toast("Картинки выключены. Включите их в «Настройки → Изображения».", true); return; }
    if (cfg.backend === "perchance" && !IB.available("perchance")) { toast("Рисование через Perchance доступно только в генераторе на Perchance. Выберите Forge/A1111 или API.", true); openSettings("images"); return; }
    if (cfg.backend !== "perchance" && !String(cfg.url || "").trim()) { toast("Укажите адрес сервера изображений.", true); openSettings("images"); return; }
    const entry = reuse || { id: U.uid("img"), draw: draw.prompt, ratio: draw.ratio || "1:1" };
    Object.assign(entry, { status: "pending", stage: "Готовлю промпт…" });
    delete entry.error;
    if (!reuse) (sw.images = sw.images || []).push(entry);
    S.drawing.add(entry.id);
    const repaint = () => { if (chat() && chat().id === msg.chatId) renderFeed(); };
    await putMsg(msg);
    repaint();
    try {
      const path = activePath();
      const upto = path.indexOf(msg) >= 0 ? path.slice(0, path.indexOf(msg) + 1) : path;
      const st = sceneState(upto);
      const pers = persona();
      const composed = IC.compose({ draw: entry.draw, card: cd, scene: st, persona: pers });
      if (cfg.translate && IC.needsRewrite(composed.scene)) { entry.stage = "Перевожу сцену в промпт…"; repaint(); }
      const comp = await ICP.compile(composed.scene, { format: cfg.format, translate: cfg.translate, pov: (pers.image || {}).view === "first", qualityPinned: qualityPinned(), identity: identityFor(cd) }, textGen);
      const fin = IC.finalise({ composed, compiled: comp.text, card: cd, settings: cfg, backend: cfg.backend, persona: pers });
      entry.stage = cfg.backend === "a1111" ? "Рисую на вашем сервере…" : "Рисую…";
      repaint();
      const seed = o.seed != null ? o.seed : (cd.image && String(cd.image.seed || "").trim() !== "" ? Number(cd.image.seed) : undefined);
      const res = await IB.generate(cfg, { prompt: fin.prompt, negative: fin.negative, ratio: entry.ratio, seed });
      await DB.put("images", { id: entry.id, chatId: msg.chatId, msgId: msg.id, dataUrl: res.dataUrl });
      S.imgUrls[entry.id] = res.dataUrl;
      const dims = res.info && res.info.width ? [res.info.width, res.info.height]
        : res.info && (res.info.resolution || res.info.size) ? String(res.info.resolution || res.info.size).split("x").map(Number) : null;
      Object.assign(entry, { status: "done", prompt: fin.prompt, negative: fin.negative, seed: res.seed, backend: cfg.backend, info: res.info, compiledFrom: comp.compiled ? composed.scene : "" });
      if (dims) { entry.w = dims[0]; entry.h = dims[1]; }
      delete entry.stage;
    } catch (e) {
      entry.status = "error";
      entry.error = e.message || String(e);
      delete entry.stage;
    }
    S.drawing.delete(entry.id);
    await putMsg(msg);
    repaint();
  }

  function findImg(t) {
    const msg = S.messages.find((x) => x.id === t.dataset.mid);
    if (!msg) return {};
    const sw = msg.swipes[+t.dataset.sw];
    const im = sw && (sw.images || []).find((x) => x.id === t.dataset.img);
    return { msg, sw, im };
  }

  function drawFromMessage(msgId) {
    const msg = S.messages.find((x) => x.id === msgId);
    const sw = TR.activeSwipe(msg);
    const d = (sw.draws && sw.draws[0]) || { prompt: sw.text.replace(/\s+/g, " ").slice(0, 700), ratio: "1:1" };
    return drawImage(msg, sw, d);
  }

  let paintQueued = false;
  function paintStreaming() {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      if (!S.gen) return;
      const el = document.getElementById("text-" + S.gen.msgId);
      if (!el) return;
      const txt = IC.stripDrawsForDisplay(SC.stripForDisplay(OA.splitThink(S.gen.raw).text));
      if (chat().mode === "messenger") {
        el.innerHTML = R.bubbles(txt).map((p) => `<div class="bub">${R.esc(p)}</div>`).join("") + `<div class="bub typing"><i></i><i></i><i></i></div>`;
      } else el.innerHTML = R.rpText(S.gen.prefix + txt);
      const box = $("#feed");
      if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
    });
  }

  async function swipe(msgId, dir) {
    const m = S.messages.find((x) => x.id === msgId);
    if (!m || S.gen) return;
    const next = (m.swipeIdx || 0) + dir;
    if (next < 0) return;
    const isLast = activePath().slice(-1)[0] === m;
    if (next >= m.swipes.length) { if (m.role === "assistant" && isLast) return generate(m.id, "regen"); return; }
    m.swipeIdx = next;
    await putMsg(m);
    await touchChat();
    refreshPrism();
    renderFeed();
    if (S.drawerOpen) renderDrawer();
  }

  async function deleteFrom(msgId) {
    if (S.gen) return;
    const m = S.messages.find((x) => x.id === msgId);
    if (!m || !confirm("Удалить это сообщение и всё, что идёт после него в этой ветке?")) return;
    const ids = [msgId].concat(TR.descendants(S.messages, msgId));
    const imgIds = [];
    S.messages.filter((x) => ids.includes(x.id)).forEach((x) => x.swipes.forEach((sw) => (sw.images || []).forEach((im) => imgIds.push(im.id))));
    await DB.delMany("images", imgIds);
    await DB.delMany("messages", ids);
    S.messages = S.messages.filter((x) => !ids.includes(x.id));
    const c = chat();
    const lastRoot = TR.children(S.messages, null).slice(-1)[0];
    c.leafId = m.parentId ? TR.latestLeaf(S.messages, m.parentId) : lastRoot ? TR.latestLeaf(S.messages, lastRoot.id) : null;
    await touchChat();
    refreshPrism();
    renderFeed();
    renderRail();
    if (S.drawerOpen) renderDrawer();
  }

  async function saveEdit(msgId, text) {
    const m = S.messages.find((x) => x.id === msgId);
    if (!m) return;
    const sw = TR.activeSwipe(m);
    const parsed = SC.parse(text);
    sw.text = m.role === "assistant" ? parsed.text : text.trim();
    if (m.role === "assistant") sw.sceneOps = parsed.ops;
    S.editingMsg = null;
    await putMsg(m);
    await touchChat();
    refreshPrism();
    renderFeed();
    if (S.drawerOpen) renderDrawer();
  }

  /* ── Сцена из форм ──────────────────────────────────────────────────── */
  function op(subject, key, value) {
    return { subject: subject || undefined, key, value, raw: `${subject ? subject + "." : ""}${key}=${value}`, manual: true };
  }
  async function applySceneOps(ops) {
    if (!ops.length) return;
    const c = chat();
    const leaf = activePath().slice(-1)[0];
    if (leaf) {
      const sw = TR.activeSwipe(leaf);
      sw.sceneOps = (sw.sceneOps || []).concat(ops);
      await putMsg(leaf);
    } else {
      c.sceneInit = [c.sceneInit, ops.map((o) => o.raw).join("; ")].filter(Boolean).join("; ");
      await putChat(c);
    }
    refreshPrism();
    renderDrawer();
    const head = $(".chat-head");
    if (head) head.outerHTML = V.chatHead(vm());
  }

  /* ── Опыт ───────────────────────────────────────────────────────────── */
  function collectExp() {
    const d = S.expDraft;
    if (!d || !$("#x-event")) return d;
    d.event = $("#x-event").value;
    d.interpretation = $("#x-interp").value;
    d.consequences = $("#x-cons").value;
    d.status = $("#x-status").value;
    const aboutUser = $("#x-about-user").checked;
    d.about = (d.about || []).filter((a) => a !== "user");
    if (aboutUser) d.about.unshift("user");
    return d;
  }
  function expFromMessage(msgId) {
    const path = activePath();
    const idx = path.findIndex((m) => m.id === msgId);
    const st = sceneState(path.slice(0, idx + 1));
    const d = EX.blank(S.cardId, S.chatId);
    d.about = ["user"];
    const msg = path[idx];
    d.source = { chatId: S.chatId, messageIds: [msgId], swipes: { [msgId]: (msg && msg.swipeIdx) || 0 }, sceneTime: st.clock.m != null || st.clock.min != null ? SC.formatClock(st.clock) : "" };
    S.expDraft = d;
    S.tab = "memory";
    S.drawerOpen = true;
    renderDrawer();
    renderFeed();
    setTimeout(() => { const e = $("#x-event"); if (e) e.focus(); }, 280);
  }
  async function saveExp() {
    const d = collectExp();
    d.event = d.event.trim();
    if (!d.event) { toast("Опишите, что произошло.", true); return; }
    if (!d.id) d.id = U.uid("x");
    d.owner = S.cardId;
    // Новая запись всегда принадлежит текущему чату; непривязанные старые не трогаем.
    if (!d.chatId && !d.legacyUnscoped) { d.chatId = S.chatId; d.source = Object.assign({ messageIds: [] }, d.source, { chatId: S.chatId }); }
    await DB.put("experience", d);
    const i = S.experience.findIndex((x) => x.id === d.id);
    if (i >= 0) S.experience[i] = d; else S.experience.push(d);
    S.expDraft = null;
    refreshPrism();
    renderDrawer();
    toast("Событие сохранено в опыт.");
  }


  /* ── Ассистент: разговор с моделью вне игры ─────────────────────────── */
  function openAssist(id, ctx, quiet) {
    if (S.gen) { toast("Дождитесь окончания ответа или остановите его.", true); return; }
    const found = id && S.assistList.find((a) => a.id === id);
    if (found) S.assist = found;
    else if (!ctx && S.assist && !S.assist.messages.length) { /* пустой разговор уже открыт */ }
    else {
      // Новый разговор наследует персонажа из текущего контекста.
      const base = ctx || (S.assist ? { cardId: S.assist.ctx.cardId, chatId: null } : (S.view === "chat" && S.cardId ? { cardId: S.cardId, chatId: null } : {}));
      S.assist = AST.blank(base);
    }
    S.view = "assist";
    S.find = null;
    S.drawerOpen = S.drawerOpen && !narrow();
    rememberUi();
    $("#rail").classList.remove("open");
    if (!quiet) { renderAll(); scrollBottom(); setTimeout(() => { const i = $("#input"); if (i && !narrow()) i.focus(); }, 30); }
  }
  async function saveAssist() {
    const a = S.assist;
    await DB.put("assist", a);
    if (!S.assistList.includes(a)) S.assistList.push(a);
    rememberUi();
  }
  async function assistChatLines(chatId) {
    const c = S.chats.find((x) => x.id === chatId);
    if (!c) return { lines: [], scene: "" };
    const msgs = await DB.byIndex("messages", "chatId", chatId);
    const path = TR.path(TR.index(msgs), c.leafId);
    const cd = S.cards.find((x) => x.id === c.cardId);
    const lines = path.map((m) => ({ name: m.role === "user" ? persona().name : (cd ? cd.name : "Персонаж"), text: TR.activeSwipe(m).text || "" })).filter((l) => l.text.trim());
    const st = SC.fold(c.sceneInit, path.map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })));
    return { lines, scene: SC.summaryLine(st) || "" };
  }
  async function assistSend(text) {
    const a = S.assist;
    if (!a || S.gen) return;
    if (!a.messages.length) a.title = AST.title(text);
    a.messages.push({ id: U.uid("am"), role: "user", text, at: Date.now() });
    await saveAssist();
    await assistGenerate();
  }
  async function assistGenerate() {
    const a = S.assist;
    const prov = activeProvider();
    if (!prov) { toast("Модель не подключена. Откройте «Настройки → Модели».", true); openSettings("models"); return; }
    const cd = a.ctx.cardId ? S.cards.find((c) => c.id === a.ctx.cardId) : null;
    const chatCtx = a.ctx.chatId ? await assistChatLines(a.ctx.chatId) : { lines: [], scene: "" };
    const target = { id: U.uid("am"), role: "assistant", text: "", at: Date.now() };
    const history = a.messages.map((x) => ({ role: x.role, text: x.text }));
    a.messages.push(target);
    const built = AST.build({
      system: (S.settings.assistSystem || "").trim() || AST.SYSTEM, card: cd, chatLines: chatCtx.lines, sceneLine: chatCtx.scene,
      userName: persona().name, history, contextTokens: contextTokens(), reserveTokens: 1500,
    });
    const ctrl = new AbortController();
    S.gen = { ctrl, msgId: target.id, raw: "", reasoning: "", assist: true };
    renderStage();
    scrollBottom();
    const onDelta = (d) => { if (!S.gen) return; S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; paintAssist(); };
    let raw = "", reasoning = "", error = null;
    try {
      const sp = S.settings.sampler;
      const res = prov.kind === "perchance"
        ? await PC.chat({ char: "Ассистент", user: persona().name }, built.messages, { signal: ctrl.signal, onDelta })
        : await OA.chat(prov, built.messages, Object.assign({}, sp, { temperature: Math.min(sp.temperature || 0.7, 0.8), max_tokens: Math.max(sp.max_tokens || 0, 1500) }), { signal: ctrl.signal, onDelta });
      raw = res.text; reasoning = res.reasoning;
    } catch (e) {
      raw = e.partial != null ? e.partial : (S.gen ? S.gen.raw : "");
      reasoning = S.gen ? S.gen.reasoning : "";
      if (e.name !== "AbortError") error = e.message || String(e);
    }
    const th = OA.splitThink(raw || "");
    target.text = th.text.trim();
    target.reasoning = [reasoning, th.reasoning].filter(Boolean).join("\n").trim();
    if (error) target.error = error;
    S.gen = null;
    if (!target.text && !error) a.messages.pop();
    await saveAssist();
    if (S.view === "assist") { renderStage(); scrollBottom(); }
  }
  let assistPaintQueued = false;
  function paintAssist() {
    if (assistPaintQueued) return;
    assistPaintQueued = true;
    requestAnimationFrame(() => {
      assistPaintQueued = false;
      if (!S.gen || !S.gen.assist) return;
      const el = document.getElementById("text-" + S.gen.msgId);
      if (!el) return;
      el.innerHTML = R.md(OA.splitThink(S.gen.raw).text);
      const box = $("#feed");
      if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
    });
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
    toast("Скопировано.");
  }
  async function assistCutFrom(id) {
    const a = S.assist;
    const i = a.messages.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const removed = a.messages.splice(i);
    await saveAssist();
    return removed;
  }

  /* ── Персонажи ──────────────────────────────────────────────────────── */
  function openCardEditor(cd) {
    S.modal = { kind: "card", section: "main", draft: U.clone(cd || Object.assign(CC.normalize({ name: "" }), { id: null })) };
    renderModal();
    setTimeout(() => { const n = $("#cf-name"); if (n && !S.modal.draft.name) n.focus(); }, 30);
  }
  function collectCard() {
    const d = S.modal.draft;
    const map = { "cf-name": "name", "cf-desc": "description", "cf-pers": "personality", "cf-scen": "scenario", "cf-first": "firstMes", "cf-ex": "mesExample", "cf-sys": "systemPrompt", "cf-post": "postHistory", "cf-creator": "creator", "cf-version": "version", "cf-notes": "creatorNotes" };
    $$("[data-cf]").forEach((el) => {
      const id = el.dataset.cf;
      if (map[id]) d[map[id]] = el.value;
      else if (id === "cf-tags") d.tags = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    });
    if ($("[data-alt]") || S.modal.section === "greet") {
      d.altGreetings = (d.altGreetings || []).slice();
      $$("[data-alt]").forEach((el) => { d.altGreetings[+el.dataset.alt] = el.value; });
    }
    if ($("[data-ci]") || $("[data-card-lora-name]")) {
      d.image = Object.assign({}, d.image);
      $$("[data-ci]").forEach((el) => { d.image[el.dataset.ci] = el.value; });
      d.image.loras = $$("[data-card-lora-name]").map((el) => {
        const w = $(`[data-card-lora-w="${el.dataset.cardLoraName}"]`);
        return { name: el.value.trim(), weight: w && w.value !== "" ? Number(w.value) : 1 };
      });
    }
    $$("[data-lore]").forEach((el) => {
      const e = d.lore[+el.dataset.lore];
      if (!e) return;
      const k = el.dataset.k;
      if (k === "keys" || k === "secondary_keys") e[k] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (k === "content" || k === "comment" || k === "position") e[k] = el.value;
      else if (k === "insertion_order") e[k] = el.value === "" ? 0 : Number(el.value) || 0;
      else e[k] = el.checked;
    });
    return d;
  }
  async function saveCard() {
    const d = collectCard();
    d.name = (d.name || "").trim();
    if (!d.name) { toast("Дайте персонажу имя.", true); S.modal.section = "main"; renderModal(); return; }
    if (d.image && d.image.loras) d.image.loras = d.image.loras.filter((l) => l.name);
    d.altGreetings = (d.altGreetings || []).map((g) => String(g || "").trim()).filter(Boolean);
    d.updatedAt = Date.now();
    const isNew = !d.id;
    if (isNew) { d.id = U.uid("card"); d.createdAt = Date.now(); }
    await DB.put("cards", d);
    const i = S.cards.findIndex((x) => x.id === d.id);
    if (i >= 0) S.cards[i] = d; else S.cards.unshift(d);
    S.modal = null;
    renderAll();
    toast(isNew ? `${d.name} создан(а). Нажмите на портрет, чтобы начать.` : "Изменения сохранены.");
  }
  async function importCards(files) {
    let last = null;
    for (const file of files) {
      try {
        let json, avatar = null;
        if (/\.json$/i.test(file.name) || file.type === "application/json") json = JSON.parse(await readFile(file, "text"));
        else { json = CC.cardJsonFromPng(new Uint8Array(await readFile(file))); avatar = await readFile(file, "dataurl"); }
        const cd = CC.normalize(json);
        cd.id = U.uid("card");
        cd.avatar = avatar;
        await DB.put("cards", cd);
        S.cards.unshift(cd);
        last = cd;
      } catch (e) {
        toast(`${file.name}: ${e.message}`, true);
      }
    }
    if (last) { S.view = "home"; renderAll(); toast(`Добавлен(а): ${last.name}`); }
  }
  function avatarPngBytes(cd) {
    return new Promise((ok, fail) => {
      const draw = (img) => {
        const cv = document.createElement("canvas");
        cv.width = img ? img.naturalWidth : 600; cv.height = img ? img.naturalHeight : 800;
        const g = cv.getContext("2d");
        if (img) g.drawImage(img, 0, 0);
        else {
          const h = R.hue(cd.name);
          const gr = g.createLinearGradient(0, 0, 600, 800);
          gr.addColorStop(0, `hsl(${h} 55% 52%)`); gr.addColorStop(1, `hsl(${(h + 80) % 360} 45% 22%)`);
          g.fillStyle = gr; g.fillRect(0, 0, 600, 800);
          g.fillStyle = "rgba(255,255,255,.88)"; g.font = "bold 300px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText((cd.name || "?").charAt(0).toUpperCase(), 300, 420);
        }
        cv.toBlob(async (b) => ok(new Uint8Array(await b.arrayBuffer())), "image/png");
      };
      if (cd.avatar && cd.avatar.startsWith("data:image/png")) fetch(cd.avatar).then((r) => r.arrayBuffer()).then((b) => ok(new Uint8Array(b)), fail);
      else if (cd.avatar) { const img = new Image(); img.onload = () => draw(img); img.onerror = () => draw(null); img.src = cd.avatar; }
      else draw(null);
    });
  }
  async function deleteCard(cd) {
    if (!confirm(`Удалить «${cd.name}» вместе со всеми чатами и опытом? Это нельзя отменить.`)) return;
    for (const c of S.chats.filter((x) => x.cardId === cd.id)) {
      const ms = await DB.byIndex("messages", "chatId", c.id);
      await DB.delMany("messages", ms.map((m) => m.id));
      await DB.delMany("images", (await DB.byIndex("images", "chatId", c.id)).map((x) => x.id));
      await DB.del("chats", c.id);
    }
    const xs = await DB.byIndex("experience", "owner", cd.id);
    await DB.delMany("experience", xs.map((x) => x.id));
    await DB.del("cards", cd.id);
    S.cards = S.cards.filter((c) => c.id !== cd.id);
    S.chats = S.chats.filter((c) => c.cardId !== cd.id);
    if (S.cardId === cd.id) { S.cardId = null; S.chatId = null; S.messages = []; S.view = "home"; }
    S.modal = null;
    renderAll();
    toast(`${cd.name} удалён(а).`);
  }
  async function deleteChat() {
    const c = chat();
    if (!c || !confirm("Удалить этот чат? Вместе с ним удалится опыт персонажа, накопленный в этом мире.")) return;
    const ms = await DB.byIndex("messages", "chatId", c.id);
    await DB.delMany("experience", (await DB.byIndex("experience", "owner", c.cardId)).filter((x) => x.chatId === c.id).map((x) => x.id));
    await DB.delMany("messages", ms.map((m) => m.id));
    await DB.delMany("images", (await DB.byIndex("images", "chatId", c.id)).map((x) => x.id));
    await DB.del("chats", c.id);
    S.chats = S.chats.filter((x) => x.id !== c.id);
    S.chatId = null; S.messages = [];
    goHome();
  }
  function exportChatText() {
    const c = chat(), cd = card();
    const lines = activePath().map((m) => `${m.role === "user" ? persona().name : cd.name}: ${TR.activeSwipe(m).text}`);
    download(`${cd.name} — ${c.title || "чат"}.txt`, lines.join("\n\n"), "text/plain;charset=utf-8");
  }

  /* ── Настройки ──────────────────────────────────────────────────────── */
  function openSettings(section) {
    closePop();
    S.modal = { kind: "settings", section: section || (S.modal && S.modal.kind === "settings" ? S.modal.section : "models") };
    renderModal();
  }
  function editingProvider() { return S.settings.providers.find((p) => p.id === S.editProviderId); }
  function readProviderForm(p) {
    if (!$("#prov-name")) return;
    p.name = $("#prov-name").value.trim() || "API";
    p.baseUrl = $("#prov-url").value.trim();
    p.apiKey = $("#prov-key").value.trim();
    p.model = $("#prov-model").value.trim();
    p.extendedSamplers = $("#prov-ext").checked;
  }
  function collectImgForm() {
    const c = S.settings.images;
    $$("[data-imgcfg]").forEach((el) => {
      const k = el.dataset.imgcfg;
      c[k] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value.trim();
    });
    delete c.loras; // LoRA живут только в карточках персонажей
  }

  function refreshAfterSettings() {
    refreshPrism();
    renderRail();
    if (S.view === "chat") renderFeed(); else renderStage();
    S.modal && (S.modal.keepScroll = true);
    renderModal();
  }

  /* ── Поповеры ───────────────────────────────────────────────────────── */
  function openPop(html, anchor) {
    const root = $("#pop-root");
    root.innerHTML = `<div class="pop" role="menu">${html}</div>`;
    const pop = root.firstChild;
    const r = anchor.getBoundingClientRect();
    const h = pop.offsetHeight, w = pop.offsetWidth;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    let left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    if (r.left + w < window.innerWidth - 8 && anchor.closest(".composer")) left = Math.max(8, r.left);
    pop.style.top = top + "px";
    pop.style.left = left + "px";
    S.pop = anchor;
  }
  function closePop() { $("#pop-root").innerHTML = ""; S.pop = null; }

  /* ── Поиск по чату ──────────────────────────────────────────────────── */
  function applyFind(jump) {
    const feedEl = $("#feed-inner");
    const q = (S.find.q || "").trim().toLowerCase();
    const countEl = $("#find-count");
    if (!feedEl) return;
    if (!q) { if (countEl) countEl.textContent = ""; return; }
    const marks = [];
    $$(".prose, .bub", feedEl).forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const low = node.nodeValue.toLowerCase();
        let i = low.indexOf(q);
        if (i < 0) continue;
        const frag = document.createDocumentFragment();
        let pos = 0;
        while (i >= 0) {
          frag.appendChild(document.createTextNode(node.nodeValue.slice(pos, i)));
          const mk = document.createElement("mark");
          mk.textContent = node.nodeValue.slice(i, i + q.length);
          frag.appendChild(mk); marks.push(mk);
          pos = i + q.length;
          i = low.indexOf(q, pos);
        }
        frag.appendChild(document.createTextNode(node.nodeValue.slice(pos)));
        node.parentNode.replaceChild(frag, node);
      }
    });
    S.find.total = marks.length;
    if (S.find.idx >= marks.length) S.find.idx = 0;
    if (countEl) countEl.textContent = marks.length ? `${S.find.idx + 1} из ${marks.length}` : "нет";
    const cur = marks[S.find.idx];
    if (cur) { cur.classList.add("cur"); if (jump) cur.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  function runFind(jump) { $("#feed-inner").innerHTML = V.feed(vm()); applyFind(jump); }

  /* ── События ────────────────────────────────────────────────────────── */
  function autoGrow(t) { if (!t) return; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 240) + "px"; }

  const ACTS = {
    home: goHome,
    import: () => $("#file-card").click(),
    "new-card": () => openCardEditor(null),
    "open-card": (t) => openCard(t.dataset.id),
    "open-chat": (t) => openChat(t.dataset.id),
    settings: (t) => openSettings(t.dataset.section),
    rail: () => { $("#rail").classList.toggle("open"); syncScrim(); },
    "cycle-theme": async () => {
      const ids = V.THEMES.map((t) => t.id);
      S.settings.theme = ids[(ids.indexOf(S.settings.theme) + 1) % ids.length];
      applyLook(); await saveSettings();
      toast("Тема: " + V.THEMES.find((t) => t.id === S.settings.theme).name);
    },
    mode: async (t) => { const c = chat(); if (c.mode === t.dataset.mode) return; c.mode = t.dataset.mode; await putChat(c); refreshPrism(); renderStage(); renderRail(); scrollBottom(); },
    find: () => { S.find = S.find ? null : { q: "", idx: 0 }; renderStage(); const f = $("#find-q"); if (f) f.focus(); },
    "find-close": () => { S.find = null; renderStage(); },
    "find-next": () => { if (!S.find.total) return; S.find.idx = (S.find.idx + 1) % S.find.total; runFind(true); },
    "find-prev": () => { if (!S.find.total) return; S.find.idx = (S.find.idx - 1 + S.find.total) % S.find.total; runFind(true); },
    drawer: () => { S.drawerOpen = !S.drawerOpen; rememberUi(); renderDrawer(); renderFeed(); },
    "drawer-close": () => { S.drawerOpen = false; rememberUi(); renderDrawer(); renderFeed(); },
    tab: (t) => { collectExp(); S.tab = t.dataset.tab; if (S.tab === "prism") refreshPrism(); renderDrawer(); },
    "open-prism": () => { S.tab = "prism"; S.drawerOpen = true; refreshPrism(); renderDrawer(); renderFeed(); },
    "chat-menu": (t) => openPop(V.chatMenu(vm()), t),
    "model-pop": (t) => openPop(V.modelPop(vm()), t),
    assist: () => openAssist(S.assist && S.assist.messages.length ? S.assist.id : null),
    "assist-new": () => { closePop(); if (S.assist && !S.assist.messages.length) { $("#input") && $("#input").focus(); return; } openAssist(null, S.assist ? { cardId: S.assist.ctx.cardId, chatId: S.assist.ctx.chatId } : null); },
    "assist-open": (t) => { closePop(); openAssist(t.dataset.id); },
    "assist-list": (t) => openPop(V.assistListPop(vm()), t),
    "assist-ctx": (t) => openPop(V.assistCtxPop(vm()), t),
    "assist-pick-card": async (t) => {
      const a = S.assist; a.ctx.cardId = t.dataset.id || null; a.ctx.chatId = null;
      if (a.messages.length) await saveAssist();
      renderStage();
      const anchor = $("[data-act=assist-ctx]");
      if (a.ctx.cardId && anchor) openPop(V.assistCtxPop(vm()), anchor); else closePop();
    },
    "assist-pick-chat": async (t) => {
      const a = S.assist; a.ctx.chatId = t.dataset.id || null;
      if (a.messages.length) await saveAssist();
      closePop(); renderStage();
    },
    "assist-about-chat": () => { closePop(); openAssist(null, { cardId: S.cardId, chatId: S.chatId }); },
    "assist-starter": (t) => { if (S.gen) return; assistSend(t.dataset.q); },
    "assist-copy": (t) => { const m = S.assist.messages.find((x) => x.id === t.dataset.id); if (m) copyText(m.text); },
    "copy-code": (t) => { const c = t.parentElement.querySelector("code"); if (c) copyText(c.textContent); },
    "assist-regen": async (t) => { if (S.gen) return; await assistCutFrom(t.dataset.id); await assistGenerate(); },
    "assist-edit": async (t) => {
      if (S.gen) return;
      const removed = await assistCutFrom(t.dataset.id);
      renderStage();
      const i = $("#input"); if (i && removed) { i.value = removed[0].text; autoGrow(i); i.focus(); }
    },
    "assist-msg-del": async (t) => { if (S.gen) return; await assistCutFrom(t.dataset.id); renderStage(); },
    "assist-del": async () => {
      const a = S.assist;
      if (!a || S.gen || !confirm(`Удалить разговор «${a.title}»?`)) return;
      await DB.del("assist", a.id);
      S.assistList = S.assistList.filter((x) => x !== a);
      S.assist = null;
      openAssist(null);
      toast("Разговор удалён.");
    },
    "new-chat": (t) => { closePop(); newChat(t.dataset.mode); },
    "edit-card": (t) => { closePop(); const id = t.dataset.id; openCardEditor(id ? S.cards.find((x) => x.id === id) : card()); },
    "rename-chat": async () => {
      closePop();
      const c = chat();
      const name = prompt("Название чата", c.title || "");
      if (name == null) return;
      c.title = name.trim() || c.title; await putChat(c); renderStage(); renderRail();
    },
    "export-chat": () => { closePop(); exportChatText(); },
    "delete-chat": () => { closePop(); deleteChat(); },
    send: sendUser,
    stop: () => S.gen && S.gen.ctrl.abort(),
    swipe: (t) => swipe(t.dataset.id, +t.dataset.dir),
    regen: (t) => generate(t.dataset.id, "regen"),
    continue: (t) => generate(t.dataset.id, "continue"),
    edit: (t) => { S.editingMsg = t.dataset.id; renderFeed(); const e = document.getElementById("edit-" + t.dataset.id); if (e) { e.focus(); e.style.height = Math.min(e.scrollHeight + 4, 520) + "px"; } },
    "save-edit": (t) => saveEdit(t.dataset.id, document.getElementById("edit-" + t.dataset.id).value),
    "cancel-edit": () => { S.editingMsg = null; renderFeed(); },
    delete: (t) => deleteFrom(t.dataset.id),
    "to-exp": (t) => expFromMessage(t.dataset.id),
    draw: (t) => drawFromMessage(t.dataset.id),
    "img-regen": (t) => { const { msg, sw, im } = findImg(t); if (im) drawImage(msg, sw, null, im, { seed: Math.floor(Math.random() * 1e9) }); },
    "img-pin": async (t) => {
      const { im } = findImg(t);
      if (!im || im.seed == null) { toast("У этой картинки нет seed.", true); return; }
      const cd = card(); cd.image = Object.assign({}, cd.image, { seed: String(im.seed) });
      await DB.put("cards", cd); toast(`Seed ${im.seed} закреплён за ${cd.name}.`);
    },
    "img-info": (t) => { const { im } = findImg(t); if (im) openPop(V.imageInfo(im), t); },
    "img-dl": (t) => {
      const { im } = findImg(t);
      const url = im && S.imgUrls[im.id];
      if (url) fetch(url).then((r) => r.blob()).then((b) => download(`${card().name} ${im.seed != null ? im.seed : im.id}.png`, b));
    },
    "img-del": async (t) => {
      const { msg, sw, im } = findImg(t);
      if (!im) return;
      sw.images = sw.images.filter((x) => x !== im);
      await DB.del("images", im.id); delete S.imgUrls[im.id];
      await putMsg(msg); renderFeed();
    },
    "img-view": (t) => { const { im } = findImg(t); if (im) { S.modal = { kind: "image", im, mid: t.dataset.mid, sw: t.dataset.sw }; renderModal(); } },
    "img-backend": (t) => {
      // Сначала перерисовать (синхронно), потом сохранить: иначе ввод в новое поле во время сохранения теряется.
      collectImgForm(); S.settings.images.backend = t.dataset.id; S.modal.keepScroll = true; renderModal(); saveSettings();
    },
    "img-lists": async () => {
      collectImgForm(); await saveSettings();
      const cfg = S.settings.images, out = { at: Date.now() };
      try {
        for (const w of ["models", "vaes", "samplers", "upscalers", "loras"]) out[w] = await IB.a1111List(cfg, w);
        try { out.schedulers = await IB.a1111List(cfg, "schedulers"); } catch (e) { out.schedulers = []; }
        S.imgLists = out; await DB.setSetting("imgLists", out);
        if (!cfg.model && out.models[0]) cfg.model = out.models[0];
        await saveSettings();
        toast(`Сервер на связи: моделей ${out.models.length}, LoRA ${out.loras.length}.`);
      } catch (e) { toast(e.message, true); }
      S.modal.keepScroll = true; renderModal();
    },
    "card-lora-add": () => { const d = collectCard(); d.image = d.image || {}; d.image.loras = (d.image.loras || []).concat([{ name: "", weight: 0.8 }]); S.modal.keepScroll = true; renderModal(); },
    "card-lora-del": (t) => { const d = collectCard(); d.image.loras.splice(+t.dataset.i, 1); S.modal.keepScroll = true; renderModal(); },
    "img-modal-regen": () => { const { mid, sw, im } = S.modal; const msg = S.messages.find((x) => x.id === mid); S.modal = null; renderModal(); drawImage(msg, msg.swipes[+sw], null, im, { seed: Math.floor(Math.random() * 1e9) }); },
    "pick-provider": async (t) => {
      if (t.closest("[data-act=prov-edit]")) return;
      S.settings.activeProvider = t.dataset.id; await saveSettings(); closePop(); refreshAfterSettings();
    },
    "pick-model": async (t) => {
      const p = S.settings.providers.find((x) => x.id === activeProvider().id);
      p.model = t.dataset.model; await saveSettings(); closePop(); refreshAfterSettings();
    },
    "pick-preset": async (t) => {
      S.settings.samplerPreset = t.dataset.id;
      const pr = V.SAMPLER_PRESETS.find((x) => x.id === t.dataset.id);
      if (pr) Object.assign(S.settings.sampler, pr.v);
      await saveSettings(); closePop(); refreshAfterSettings();
    },
    // Сцена
    "sc-time-set": () => {
      const d = $("#sc-date").value.trim(), tm = $("#sc-time").value.trim();
      if (d && !/^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(d)) { toast("Дата в виде 14.05 или 14.05.2026", true); return; }
      const v = [d, tm].filter(Boolean).join(" ");
      if (v) applySceneOps([op(null, "time", v)]);
    },
    "sc-shift": (t) => applySceneOps([op(null, "time", t.dataset.v)]),
    "sc-leave": (t) => applySceneOps([op(null, "leave", t.dataset.name)]),
    "sc-enter": (t) => applySceneOps([op(null, "enter", t.dataset.name)]),
    "sc-remove": (t) => applySceneOps([op(t.dataset.name, "remove", t.dataset.item)]),
    "scene-init-save": async () => { const c = chat(); c.sceneInit = $("#scene-init").value.trim(); await putChat(c); refreshPrism(); renderDrawer(); renderFeed(); toast("Начальная сцена сохранена."); },
    // Опыт
    "exp-new": () => { S.expDraft = Object.assign(EX.blank(S.cardId, S.chatId), { about: ["user"] }); renderDrawer(); },
    "exp-assign": async (t) => {
      const r = S.experience.find((x) => x.id === t.dataset.id);
      if (!r || !confirm("Привязать эту запись к текущему чату? Она станет частью этого мира и будет видна во всех его ветках.")) return;
      const nr = EX.assignToChat(r, S.chatId);
      await DB.put("experience", nr);
      S.experience = S.experience.map((x) => (x.id === nr.id ? nr : x));
      S.legacyExperience = Math.max(0, (S.legacyExperience || 1) - 1);
      refreshPrism(); renderDrawer();
      toast("Запись привязана к этому чату.");
    },
    "exp-edit": (t) => { S.expDraft = U.clone(S.experience.find((x) => x.id === t.dataset.id)); renderDrawer(); },
    "exp-cancel": () => { S.expDraft = null; renderDrawer(); },
    "exp-save": saveExp,
    "exp-del": async () => {
      if (!confirm("Удалить это событие из опыта?")) return;
      await DB.del("experience", S.expDraft.id);
      S.experience = S.experience.filter((x) => x.id !== S.expDraft.id);
      S.expDraft = null; refreshPrism(); renderDrawer();
    },
    "x-val": (t) => { collectExp().valence = +t.dataset.v; renderDrawer(); },
    "x-weight": (t) => { collectExp().weight = +t.dataset.v; renderDrawer(); },
    "x-domain-del": (t) => { const d = collectExp(); d.domains = d.domains.filter((x) => x !== t.dataset.v); renderDrawer(); },
    "prism-preview": () => { refreshPrism(); renderDrawer(); renderFeed(); },
    // Модалки
    "modal-bg": (t, e) => { if (e.target === t) { S.modal = null; renderModal(); } },
    "modal-close": () => { S.modal = null; renderModal(); },
    "card-section": (t) => { collectCard(); S.modal.section = t.dataset.section; renderModal(); },
    "card-save": saveCard,
    "avatar-pick": () => { collectCard(); $("#file-avatar").click(); },
    "lore-add": () => { const d = collectCard(); d.lore = (d.lore || []).concat([{ keys: [], secondary_keys: [], selective: false, content: "", comment: "", enabled: true, constant: false, case_sensitive: false, position: "after_char", insertion_order: (d.lore || []).length * 10 }]); S.modal.keepScroll = true; renderModal(); },
    "alt-add": () => { const d = collectCard(); d.altGreetings = (d.altGreetings || []).concat([""]); S.modal.keepScroll = true; renderModal(); setTimeout(() => { const el = $(`[data-alt="${d.altGreetings.length - 1}"]`); if (el) el.focus(); }, 30); },
    "alt-del": (t) => { const d = collectCard(); d.altGreetings.splice(+t.dataset.i, 1); S.modal.keepScroll = true; renderModal(); },
    "lore-del": (t) => { const d = collectCard(); d.lore.splice(+t.dataset.i, 1); S.modal.keepScroll = true; renderModal(); },
    "card-json": () => { const d = collectCard(); download(`${d.name || "персонаж"}.json`, JSON.stringify(CC.toSpec(d, "v3"), null, 2), "application/json"); },
    "card-png": async () => { const d = collectCard(); download(`${d.name || "персонаж"}.png`, new Blob([CC.embedInPng(await avatarPngBytes(d), d)], { type: "image/png" })); },
    "card-del": () => deleteCard(S.modal.draft),
    // Провайдеры
    "prov-add": async (t) => {
      const pr = OA.PRESETS.find((x) => x.id === t.dataset.preset);
      const p = { id: U.uid("prov"), presetId: pr.id, name: pr.id === "custom" ? "Мой API" : pr.name, baseUrl: pr.baseUrl, apiKey: "", model: "", extendedSamplers: pr.extendedSamplers };
      S.settings.providers.push(p);
      S.settings.activeProvider = p.id;
      S.editProviderId = p.id;
      await saveSettings(); refreshAfterSettings();
      setTimeout(() => { const el = $(pr.baseUrl ? (pr.local ? "#prov-model" : "#prov-key") : "#prov-url"); if (el) el.focus(); }, 30);
    },
    "prov-edit": (t, e) => { e.stopPropagation(); S.editProviderId = t.dataset.id; S.modal.keepScroll = true; renderModal(); },
    "prov-close": () => { const p = editingProvider(); if (p) readProviderForm(p); saveSettings(); S.editProviderId = null; refreshAfterSettings(); },
    "prov-save": async () => { readProviderForm(editingProvider()); await saveSettings(); refreshAfterSettings(); toast("Сохранено."); },
    "prov-del": async () => {
      const p = editingProvider();
      if (!confirm(`Удалить «${p.name}»?`)) return;
      S.settings.providers = S.settings.providers.filter((x) => x !== p);
      if (S.settings.activeProvider === p.id) S.settings.activeProvider = (providerList()[0] || {}).id || "";
      S.editProviderId = null;
      await saveSettings(); refreshAfterSettings();
    },
    "prov-models": async () => {
      const p = editingProvider(); readProviderForm(p);
      try { p.models = await OA.listModels(p); if (!p.model && p.models[0]) p.model = p.models[0]; await saveSettings(); refreshAfterSettings(); toast(`Найдено моделей: ${p.models.length}`); }
      catch (err) { toast(err.message, true); }
    },
    theme: async (t) => { S.settings.theme = t.dataset.id; applyLook(); await saveSettings(); S.modal.keepScroll = true; renderModal(); },
    "persona-save": async () => {
      S.settings.persona = { name: $("#p-name").value.trim() || "Пользователь", description: $("#p-desc").value,
        image: { view: $("#p-view").value, appearance: $("#p-appearance").value, povTags: $("#p-povtags").value.trim() } };
      await saveSettings(); refreshAfterSettings(); toast("Сохранено.");
    },
    backup: async () => download(`prism-rp-бэкап-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await DB.exportAll()), "application/json"),
    restore: () => $("#file-backup").click(),
  };

  async function onClick(e) {
    if (S.pop && !e.target.closest(".pop") && !e.target.closest("[data-act=model-pop],[data-act=chat-menu],[data-act=assist-ctx],[data-act=assist-list]")) closePop();
    const t = e.target.closest("[data-act]");
    if (!t || t.disabled) return;
    const fn = ACTS[t.dataset.act];
    if (!fn) return;
    if (t.dataset.act === "modal-bg" && e.target !== t) return;
    try { await fn(t, e); } catch (err) { console.error(err); toast(err.message || String(err), true); }
  }

  async function onChange(e) {
    const t = e.target;
    try {
      if (t.id === "file-card") { await importCards([...t.files]); t.value = ""; return; }
      if (t.id === "file-backup" && t.files[0]) {
        const data = JSON.parse(await readFile(t.files[0], "text"));
        const replace = confirm("Заменить текущие данные бэкапом?\n\nОК — заменить, Отмена — добавить к существующим.");
        await DB.importAll(data, replace);
        t.value = "";
        S.modal = null; S.view = "home";
        await loadAll(); renderAll();
        toast("Бэкап загружен.");
        return;
      }
      if (t.id === "file-avatar" && t.files[0]) { S.modal.draft.avatar = await readFile(t.files[0], "dataurl"); t.value = ""; renderModal(); return; }
      if (t.dataset.scTop) { applySceneOps([op(null, t.dataset.scTop, t.value.trim() || "-")]); return; }
      if (t.dataset.scField) { applySceneOps([op(t.dataset.name, t.dataset.scField, t.value.trim() || "-")]); return; }
      if (t.dataset.scRel) { applySceneOps([op(t.dataset.scRel, "relset", t.value + " поправлено вручную")]); return; }
      if (t.dataset.lore !== undefined && t.dataset.k === "selective" && S.modal && S.modal.kind === "card") { collectCard(); S.modal.keepScroll = true; renderModal(); return; }
      if (t.dataset.imgcfg !== undefined) { collectImgForm(); await saveSettings(); return; }
      if (t.dataset.imgCheck) { collectImgForm(); S.settings.images[t.dataset.imgCheck] = t.checked; refreshAfterSettings(); await saveSettings(); return; }
      if (t.dataset.imgSel) { collectImgForm(); S.settings.images[t.dataset.imgSel] = t.value; refreshAfterSettings(); await saveSettings(); return; }
      if (t.dataset.sampler) { S.settings.sampler[t.dataset.sampler] = t.value === "" ? null : +t.value; S.settings.samplerPreset = "custom"; await saveSettings(); refreshAfterSettings(); return; }
      if (t.dataset.setText) { S.settings[t.dataset.setText] = t.value; await saveSettings(); return; }
      if (t.dataset.setNum) { S.settings[t.dataset.setNum] = +t.value; await saveSettings(); refreshAfterSettings(); return; }
      if (t.dataset.setRange) { S.settings[t.dataset.setRange] = +t.value; applyLook(); await saveSettings(); return; }
      if (t.dataset.set) { S.settings[t.dataset.set] = t.checked; await saveSettings(); refreshAfterSettings(); if (S.drawerOpen) renderDrawer(); return; }
    } catch (err) { console.error(err); toast(err.message || String(err), true); }
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === "input") autoGrow(t);
    if (t.id === "home-q") {
      S.homeQuery = t.value;
      const pos = t.selectionStart;
      renderStage();
      const n = $("#home-q"); n.focus(); n.setSelectionRange(pos, pos);
    }
    if (t.id === "find-q") { S.find.q = t.value; S.find.idx = 0; runFind(true); }
    if (t.dataset.scRel) { const o = $("#rel-out"); if (o) o.textContent = `${SC.relWord(+t.value)} (${+t.value > 0 ? "+" : ""}${t.value})`; }
    if (t.dataset.setRange) { const o = $("#fs-out"); if (o) o.textContent = t.value; document.documentElement.style.setProperty("--prose-fs", t.value + "px"); }
  }

  function onKey(e) {
    const t = e.target;
    if (t.id === "input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendUser(); return; }
    if (t.id === "find-q" && e.key === "Enter") { e.preventDefault(); (e.shiftKey ? ACTS["find-prev"] : ACTS["find-next"])(); return; }
    if (e.key === "Enter" && t.classList && t.classList.contains("chip-add")) {
      e.preventDefault();
      const v = t.value.trim();
      if (!v) return;
      if (t.dataset.scAdd) applySceneOps([op(t.dataset.scAdd, "add", v)]);
      else if (t.id === "sc-enter-new") applySceneOps([op(null, "enter", v)]);
      else if (t.id === "x-domain-add") { const d = collectExp(); v.split(",").map((s) => s.trim()).filter(Boolean).forEach((x) => { if (!d.domains.includes(x)) d.domains.push(x); }); renderDrawer(); setTimeout(() => { const n = $("#x-domain-add"); if (n) n.focus(); }, 0); }
      return;
    }
    if (e.key === "Enter" && t.tagName === "INPUT" && (t.dataset.scTop || t.dataset.scField)) { t.blur(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && S.view === "chat") { e.preventDefault(); if (!S.find) ACTS.find(); else { const f = $("#find-q"); if (f) f.focus(); } return; }
    if (e.key === "Escape") {
      if (S.pop) return closePop();
      if (S.modal) { S.modal = null; return renderModal(); }
      if (S.editingMsg) { S.editingMsg = null; return renderFeed(); }
      if (S.find) return ACTS["find-close"]();
      if (S.drawerOpen && narrow()) return ACTS["drawer-close"]();
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
      if (S.drawerOpen && narrow()) { S.drawerOpen = false; renderDrawer(); renderFeed(); }
      syncScrim();
    });
    window.addEventListener("resize", () => { syncScrim(); if (S.pop) closePop(); });
  }

  async function init() {
    bind();
    try {
      await loadAll();
      if (!providerList().some((p) => p.id === S.settings.activeProvider)) S.settings.activeProvider = (providerList()[0] || {}).id || "";
      renderAll();
      scrollBottom();
    } catch (e) {
      console.error(e);
      S.settings = S.settings || U.clone(DEFAULTS);
      renderAll();
      toast("Не удалось открыть хранилище браузера: " + e.message, true);
    }
  }

  window.PRP.app = { S, generate, refreshPrism };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
