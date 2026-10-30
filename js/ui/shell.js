/* Prism RP — оболочка интерфейса: модель представления, отрисовка областей экрана,
   поповеры, поиск по чату, потоковая отрисовка ответа, уведомления.
   Это «порт интерфейса» (ctx.ui), через который сервисы просят перерисовку, не трогая DOM сами.
   Разметку строят представления (js/ui/views/*), здесь — только куда и когда её вставить. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const SC = PRP.scene, OA = PRP.openai, IB = PRP.imgBackends, IC = PRP.imgCompose, R = PRP.render, V = PRP.views;

  function create(ctx) {
    const { S } = ctx;
    const $ = (sel, el) => (el || document).querySelector(sel);
    const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
    const narrow = () => window.innerWidth < 1280;
    const svc = () => ctx.svc;

    /* ── Уведомления ───────────────────────────────────────────────────── */
    let toastTimer = null;
    function toast(text, isErr) {
      const el = $("#toast");
      el.innerHTML = R.icon(isErr ? "alert" : "check") + `<span>${R.esc(text)}</span>`;
      el.className = "toast" + (isErr ? " err" : "");
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.hidden = true), isErr ? 8000 : 2800);
    }

    /* ── Модель представления ──────────────────────────────────────────── */
    const isMs = () => { const c = ctx.chat(); return !!(c && c.mode === "messenger" && svc().messenger); };
    function vm() {
      const path = svc().chat.path();
      return {
        S, view: S.view, cards: S.cards, chats: S.chats, card: ctx.card(), chat: ctx.chat(), persona: ctx.persona(), path,
        scene: ctx.chat() ? svc().chat.sceneState(path) : SC.emptyState(), gen: S.gen, editingMsg: S.editingMsg,
        provider: ctx.provider(), providers: ctx.providers(), settings: S.settings,
        exps: S.experience, expView: svc().exp.view(path), expDraft: S.expDraft,
        observedMemories: svc().memory.visibleMemories(path), currentExperience: svc().memory.experience(path), memoryStatus: S.memoryStatus,
        memoryTimeline: S.drawerOpen && S.tab === "memory" && ctx.chat() ? svc().memory.timeline(path) : null,
        // «Мир чата» собирает сервис мира чата (только чтение); считается, только когда вкладка открыта.
        worldChat: S.drawerOpen && S.tab === "world" && ctx.chat() && svc().worldChat ? svc().worldChat.view() : null, worldEdit: S.worldEdit,
        // Переписка: среда (только чтение) — для вкладки «Среда», статуса в шапке и времени сообщений в поясе переписки.
        messengerView: ((S.drawerOpen && (S.tab === "env" || S.tab === "scene")) || (S.modal && (S.modal.kind === "debug" || S.modal.kind === "messenger-time"))) && isMs() ? svc().messenger.view() : null, envEdit: S.envEdit,
        msWorld: isMs() ? (svc().messenger.context() || {}).world : null, msTz: isMs() ? (svc().messenger.current() || {}).timeZone : null, lastPrism: S.lastPrism, tab: S.tab, find: S.find,
        drawerOpen: S.drawerOpen, homeQuery: S.homeQuery, editProviderId: S.editProviderId,
        stats: `Персонажей: ${S.cards.length}, чатов: ${S.chats.length}.`,
        imgUrls: S.imgUrls, imgLists: S.imgLists, perchanceImages: IB.available("perchance"),
        origin: location.origin && location.origin !== "null" ? location.origin : "*",
        assist: S.assist, assistList: S.assistList,
        worldPacks: S.worldPacks, worldLenses: S.worldLenses, worldDraft: S.worldDraft, modal: S.modal,
        // Превью «Мир персонажа» готовит сервис мира; представление только показывает.
        lensPreview: S.modal && S.modal.kind === "card" && S.modal.section === "world" && S.modal.lens ? svc().world.preview(S.modal.lens) : null,
        assistCard: S.assist && S.assist.ctx.cardId ? S.cards.find((c) => c.id === S.assist.ctx.cardId) || null : null,
        assistChat: S.assist && S.assist.ctx.chatId ? S.chats.find((c) => c.id === S.assist.ctx.chatId) || null : null,
        // PERF-01: ход этого чата (ожидает разбора / пишет реплику / генерирует), идёт ли разбор, возвращённый текст.
        turn: S.turn && ctx.chat() && S.turn.chatId === ctx.chat().id ? S.turn : null,
        statePending: ctx.chat() && svc().state && svc().state.pending ? svc().state.pending(ctx.chat().id) > 0 : false,
        draft: ctx.chat() && S.sendDrafts ? S.sendDrafts[ctx.chat().id] || "" : "",
        perfSummary: S.settings && S.settings.developerMode && PRP.perfLog ? PRP.perfLog.summary(S.perf) : null, perfLog: S.perf || [],
        knowledgeShadow: S.modal && S.modal.kind === "debug" && S.modal.section === "knowledge" && S.knowledgeShadow && ctx.chat() && S.knowledgeShadow.chatId === ctx.chat().id ? (S.knowledgeShadow.anchor === JSON.stringify({chatId:ctx.chat().id,path:path.slice(-12),personaDescription:String((ctx.persona()||{}).description||"")}) ? S.knowledgeShadow : {error:"stale-selected-path"}) : null,
        debugWear: S.modal && S.modal.kind === "debug" && S.modal.section === "wear" &&
          ctx.chat() && svc().state && svc().state.debugWear ? svc().state.debugWear(path) : null,
        debugLastRpInput: S.modal && S.modal.kind === "debug" && S.modal.section === "prism" &&
          S.debugLastRpInput && ctx.chat() && S.debugLastRpInput.chatId === ctx.chat().id
          ? S.debugLastRpInput : null,
      };
    }

    /* ── Отрисовка областей ────────────────────────────────────────────── */
    function applyLook() {
      document.documentElement.setAttribute("data-theme", S.settings.theme || "dusk");
      document.documentElement.style.setProperty("--prose-fs", (S.settings.proseSize || 17) + "px");
    }
    function autoGrow(t) { if (!t) return; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 240) + "px"; }
    function renderRail() { $("#rail").innerHTML = V.rail(vm()); }
    /* PERF-01: текст поля ввода принадлежит своему чату (data-chat). При перерисовке в ДРУГОМ чате набранное
       не переносится туда, а сохраняется черновиком своего чата (S.sendDrafts) и вернётся при его открытии. */
    function takeInput() {
      const i = $("#input");
      if (!i) return null;
      return { v: i.value, s: i.selectionStart, f: document.activeElement === i, chat: i.dataset.chat || null };
    }
    function putInput(keep) {
      const i = $("#input");
      if (!i || !keep) return;
      const here = i.dataset.chat || null;
      if (keep.chat && here !== keep.chat) {
        if (keep.v.trim()) { S.sendDrafts = S.sendDrafts || {}; S.sendDrafts[keep.chat] = keep.v; }
        autoGrow(i);
        return;
      }
      i.value = keep.v || i.value; autoGrow(i);
      if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (e) {} }
    }
    function renderStage() {
      const app = $("#app");
      const m = vm();
      const keep = takeInput();
      // Уход из поля ввода чата в любой другой вид (другой чат, ассистент, «Персонажи», мир, главная):
      // набранное сохраняется черновиком своего чата и вернётся при его открытии.
      if (keep && keep.chat && keep.v.trim() && !(S.view === "chat" && m.chat && m.chat.id === keep.chat)) {
        S.sendDrafts = S.sendDrafts || {}; S.sendDrafts[keep.chat] = keep.v;
      }
      const feedEl = $("#feed");
      const scroll = feedEl ? feedEl.scrollTop : null;
      if (S.view === "assist" && S.assist) {
        $("#stage").innerHTML = V.assist(m);
        app.classList.remove("messenger");
        if (keep && !keep.chat) {
          const i = $("#input"); i.value = keep.v; autoGrow(i);
          if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (e) {} }
        }
        if (scroll != null && $("#feed")) $("#feed").scrollTop = scroll;
      } else if (S.view === "chat" && m.chat && m.card) {
        $("#stage").innerHTML = V.chat(m);
        app.classList.toggle("messenger", m.chat.mode === "messenger");
        // Поле ввода из того же чата сохраняется; из другого чата (или ассистента) сюда не переносится.
        if (keep && keep.chat) putInput(keep);
        else if (keep) {
          // Поле без чата (ассистент): прежнее поведение — набранное переносится, если в поле чата пусто.
          const i = $("#input"); i.value = i.value || keep.v; autoGrow(i);
          if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (e) {} }
        }
        if (scroll != null) $("#feed").scrollTop = scroll;
        if (S.find) applyFind(false);
      } else if (S.view === "world") {
        app.classList.remove("messenger");
        $("#stage").innerHTML = V.worldLibrary(m);
      } else if (S.view === "characters") {
        app.classList.remove("messenger");
        $("#stage").innerHTML = V.characters(m);
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
        const keep = takeInput();
        comp.outerHTML = V.composer(vm());
        putInput(keep);
      }
      $("#app").classList.toggle("generating", !!S.gen);
      if (S.find) applyFind(false);
    }
    function renderHead() { const head = $(".chat-head"); if (head) head.outerHTML = V.chatHead(vm()); }
    // PERF-01: только поле ввода (статус ожидающей отправки), с сохранением набранного текста и фокуса.
    function renderComposer() {
      if (S.view !== "chat") return;
      const comp = $(".composer-wrap");
      if (!comp) return;
      const keep = takeInput();
      comp.outerHTML = V.composer(vm());
      putInput(keep);
      $("#app").classList.toggle("generating", !!S.gen);
    }
    /* Текст не отправленного хода — обратно в поле ввода его чата. Если этот чат открыт — сразу в поле
       (перед уже набранным); иначе — в черновик, который покажется при открытии чата. */
    function restoreDraft(chatId, text) {
      if (!text) return;
      const i = $("#input");
      if (S.view === "chat" && S.chatId === chatId && i && i.dataset.chat === chatId) {
        i.value = i.value.trim() ? text + "\n" + i.value : text;
        autoGrow(i);
        return;
      }
      S.sendDrafts = S.sendDrafts || {};
      S.sendDrafts[chatId] = S.sendDrafts[chatId] ? text + "\n" + S.sendDrafts[chatId] : text;
    }
    function clearDraft(chatId) { if (S.sendDrafts) delete S.sendDrafts[chatId]; }
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
      const rootEl = $("#modal-root");
      if (!S.modal) { rootEl.innerHTML = ""; return; }
      const m = vm();
      const scroll = $(".modal-body") ? $(".modal-body").scrollTop : 0;
      // Repainting Debug after Observer must not close a message the user
      // opened to read its diagnostics. Keys are source IDs, not view indices.
      const expanded = S.modal.kind === "debug" ? new Set(
        Array.from(rootEl.querySelectorAll("details[data-debug-expand][open]"))
          .map(el => el.getAttribute("data-debug-expand"))) : new Set();
      if (S.modal.kind === "image") {
        const im = S.modal.im, url = S.imgUrls[im.id];
        rootEl.innerHTML = `<div class="modal-wrap lightbox" data-act="modal-bg"><figure class="lb-fig"><img src="${R.safeImageSrc(url)}" alt="">
        <figcaption><span>${R.esc(im.draw || "")}</span><span class="lb-tools">
          <button class="btn btn-sm" data-act="img-modal-regen">${R.icon("regen")}Заново</button>
          <button class="btn btn-sm" data-act="img-dl" data-mid="${R.esc(S.modal.mid)}" data-sw="${R.esc(S.modal.sw)}" data-img="${R.esc(im.id)}">${R.icon("download")}Скачать</button>
          <button class="icon-btn" data-act="modal-close" title="Закрыть">${R.icon("x")}</button></span></figcaption></figure></div>`;
        return;
      }
      rootEl.innerHTML = S.modal.kind === "settings" ? V.settingsModal(m, S.modal.section)
        : S.modal.kind === "import" ? V.importReview(m, S.modal)
        : S.modal.kind === "new-messenger" ? V.newMessengerModal(m, S.modal)
        : S.modal.kind === "debug" ? V.debugModal(m, S.modal)
        : S.modal.kind === "messenger-time" ? V.messengerTimeModal(m)
        : V.cardModal(m, S.modal.draft, S.modal.section);
      if (S.modal.kind === "debug" && expanded.size) {
        rootEl.querySelectorAll("details[data-debug-expand]").forEach(el => {
          if (expanded.has(el.getAttribute("data-debug-expand"))) el.open = true;
        });
      }
      if (S.modal.keepScroll && $(".modal-body")) $(".modal-body").scrollTop = scroll;
      // Узкий экран: лента разделов прокручивается по горизонтали и после перерисовки сбрасывается к началу —
      // вернуть в видимую часть активный раздел (на широком экране лента вертикальная, ничего не меняется).
      const act = $(".modal-nav .rail-item.active");
      if (act && act.parentElement.scrollWidth > act.parentElement.clientWidth) {
        const nav = act.parentElement;
        const a = act.getBoundingClientRect(), n = nav.getBoundingClientRect();
        nav.scrollLeft = Math.max(0, nav.scrollLeft + (a.left - n.left) - (nav.clientWidth - a.width) / 2);
      }
      S.modal.keepScroll = false;
    }
    function renderAll() { applyLook(); renderRail(); renderStage(); renderDrawer(); renderModal(); }
    function scrollBottom() { const el = $("#feed"); if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight)); }
    function syncScrim() {
      const railOpen = $("#rail").classList.contains("open");
      const drawerOverlay = S.drawerOpen && S.view === "chat" && narrow();
      $("#scrim").hidden = !(railOpen || drawerOverlay);
    }
    function openSettings(section) {
      closePop();
      S.modal = { kind: "settings", section: section || (S.modal && S.modal.kind === "settings" ? S.modal.section : "models") };
      renderModal();
    }
    // После смены настроек: пересобрать Prism и перерисовать то, что от них зависит.
    function refreshAfterSettings() {
      svc().prism.refresh();
      renderRail();
      if (S.view === "chat") { renderHead(); renderFeed(); } else renderStage();
      S.modal && (S.modal.keepScroll = true);
      renderModal();
    }

    /* ── Поповеры ──────────────────────────────────────────────────────── */
    function openPop(html, anchor) {
      const rootEl = $("#pop-root");
      rootEl.innerHTML = `<div class="pop" role="menu">${html}</div>`;
      const pop = rootEl.firstChild;
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

    /* ── Поиск по чату ─────────────────────────────────────────────────── */
    function applyFind(jump) {
      const feedEl = $("#feed-inner");
      const q = (S.find.q || "").trim().toLowerCase();
      const countEl = $("#find-count");
      if (!feedEl) return;
      if (!q) { if (countEl) countEl.textContent = ""; return; }
      const marks = [];
      $$(".prose, .bub", feedEl).forEach((rootEl) => {
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
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

    /* ── Потоковая отрисовка ответа ────────────────────────────────────── */
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
        if (ctx.chat().mode === "messenger") {
          el.innerHTML = R.bubbles(txt).map((p) => `<div class="bub">${R.esc(p)}</div>`).join("") + `<div class="bub typing"><i></i><i></i><i></i></div>`;
        } else el.innerHTML = R.rpText(S.gen.prefix + txt);
        const box = $("#feed");
        if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
      });
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

    // Запомнить, что открыто, чтобы после перезагрузки вернуться туда же.
    function rememberUi() {
      ctx.DB.setSetting("ui", { chatId: S.view === "chat" ? S.chatId : null, drawerOpen: S.drawerOpen, view: S.view, assistId: S.view === "assist" && S.assist && S.assist.messages.length ? S.assist.id : null });
    }

    return {
      $, $$, narrow, toast, vm, applyLook, autoGrow,
      renderRail, renderStage, renderFeed, renderHead, renderComposer, restoreDraft, clearDraft, renderDrawer, renderModal, renderAll, scrollBottom, syncScrim,
      openSettings, refreshAfterSettings, openPop, closePop, applyFind, runFind, paintStreaming, paintAssist, rememberUi,
    };
  }

  PRP.shell = { create };
})(typeof window !== "undefined" ? window : globalThis);
