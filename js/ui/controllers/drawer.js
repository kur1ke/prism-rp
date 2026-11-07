/* Prism RP — контроллер выдвижной панели: сцена (ручные правки), опыт (форма записи), мир чата (явные действия), Prism (предпросмотр). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.drawer = function (ctx) {
    const { S, ui, svc } = ctx;
    const { $ } = ui;
    const csv = (value) => String(value || "").split(",").map((part) => part.trim()).filter(Boolean);

    // Copy only the currently open Debug section, not other tabs or hidden
    // application state. A legacy fallback is needed in embedded Perchance frames.
    function copyLegacy(value) {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(field);
      try {
        field.select();
        if (!document.execCommand || !document.execCommand("copy")) throw new Error("Буфер обмена недоступен в этом браузере");
      } finally { field.remove(); }
    }


    function collectWorld() {
      const d = S.worldEdit;
      if (!d) return d;
      const sc = document.querySelector("input[name=wc-scope]:checked");
      d.scope = sc ? sc.value : d.scope;
      if (d.op !== "retract" && $("#wc-text")) d.fact = Object.assign({}, d.fact, { text: $("#wc-text").value });
      if (d.op === "assert" && $("#wc-ent")) Object.assign(d.fact, { entities: csv($("#wc-ent").value), topics: csv($("#wc-top").value), locations: csv($("#wc-loc").value), timeline: $("#wc-tl").value, variant: $("#wc-vr").value });
      return d;
    }
    function worldDraft(op, id) {
      // По умолчанию — текущая ветка, если к ней есть привязка; иначе область не выбрана (пользователь выбирает «весь чат» сам).
      const scope = svc.chat.path().length ? "branch" : "";
      const f = id ? (svc.worldChat.view().facts.find((x) => x.id === id) || null) : null;
      S.worldEdit = { op, targetFactId: id || null, scope, fact: op === "override" ? { text: f ? f.text : "" } : op === "assert" ? { text: "" } : null };
      S.tab = "world"; S.drawerOpen = true;
      ui.renderDrawer();
      setTimeout(() => { const e = $("#wc-text"); if (e) e.focus(); }, 30);
    }

    function treeUi() {
      const c = ctx.chat();
      if (!c) return null;
      if (!S.branchTreeUi || S.branchTreeUi.chatId !== c.id) S.branchTreeUi = { chatId: c.id, selectedId: null, variant: null, zoom: 1 };
      return S.branchTreeUi;
    }
    function refreshMap() { if (S.modal && S.modal.kind === "tree") ui.renderModal(); }
    const actions = {
      drawer: () => { S.drawerOpen = !S.drawerOpen; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      "drawer-close": () => { S.drawerOpen = false; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      tab: (t) => { collectWorld(); S.tab = t.dataset.tab; if (S.tab === "tree") return actions["tree-open"](); if (S.tab === "prism") svc.prism.refresh(); ui.renderDrawer(); },
      "tree-open": () => { ui.closePop(); const state = treeUi(); if (!state) return; state.selectedId = null; state.variant = null; S.tab = "tree"; S.modal = { kind: "tree" }; ui.renderDrawer(); ui.renderModal(); },
      "tree-select": async (t) => {
        if (S.gen || S.turn) return;
        try {
          const pending = svc.chat.selectBranch(t.dataset.id, t.dataset.swipe === undefined ? undefined : Number(t.dataset.swipe));
          refreshMap();
          if (!await pending) { ui.toast("Не удалось открыть ветку: сообщение или связанный вариант недоступны.", true); return; }
          S.editingMsg = null;
          svc.prism.refresh(); S.modal = null; ui.renderModal(); ui.rememberUi(); ui.renderFeed(); ui.renderHead(); ui.renderRail(); ui.renderDrawer(); ui.scrollBottom();
        } catch (e) { ui.toast("Ветка не переключена: " + (e.message || String(e)), true); refreshMap(); }
      },
      "map-pick": (t) => {
        const state = treeUi(), msg = S.messages.find((m) => m.id === t.dataset.id && m.chatId === S.chatId);
        if (!state || !msg) return;
        state.selectedId = msg.id; state.variant = msg.swipeIdx || 0; refreshMap();
      },
      "map-zoom": (t) => { const state = treeUi(); if (state) { state.zoom = Math.max(.4, Math.min(1.6, Math.round((state.zoom + Number(t.dataset.dir) * .2) * 10) / 10)); refreshMap(); } },
      "map-center": () => { const viewport = $("#map-viewport"); if (viewport) { viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2); viewport.scrollTop = 0; } },
      "debug-open": () => { svc.prism.refresh(); S.modal = { kind: "debug", section: "prism" }; ui.renderModal(); },
      "debug-section": (t) => { if (S.modal && S.modal.kind === "debug") { S.modal.section = t.dataset.section; ui.renderModal(); } },
      "debug-copy": async () => {
        if (!S.modal || S.modal.kind !== "debug") return;
        const body = $(".debug-modal .debug-body");
        if (!body) return;
        const title = { prism: "Prism", wear: "Одежда", tracker: "Трекер", events: "События", images: "Изображения", errors: "Ошибки", timing: "Тайминги" }[S.modal.section || "prism"] || "Debug";
        const content = (body.innerText || body.textContent || "").trim();
        const value = "Debug — " + ((ctx.card() || {}).name || "чат") + " / " + title + "\n\n" + content;
        const clipboard = typeof navigator !== "undefined" && navigator.clipboard;
        if (clipboard && clipboard.writeText) {
          try { await clipboard.writeText(value); }
          catch (_) { copyLegacy(value); }
        } else copyLegacy(value);
        ui.toast("Раздел Debug скопирован.");
      },
      "open-prism": () => { svc.prism.refresh(); S.modal = { kind: "debug", section: "prism" }; ui.renderModal(); },
      "prism-preview": () => { svc.prism.refresh(); if (S.modal && S.modal.kind === "debug") ui.renderModal(); else ui.renderDrawer(); },
      // Мир чата: только явные действия; ничего не извлекается из текста ответов.
      "wc-new": () => worldDraft("assert"),
      "wc-override": (t) => worldDraft("override", t.dataset.id),
      "wc-retract": (t) => worldDraft("retract", t.dataset.id),
      "wc-cancel": () => { S.worldEdit = null; ui.renderDrawer(); },
      "wc-save": async () => {
        const d = collectWorld();
        if (!d.scope) { ui.toast("Выберите, где действует факт: в этой ветке или во всём чате.", true); return; }
        const r = await svc.worldChat.commit(d);
        if (r.error) { ui.toast(r.error, true); return; }
        S.worldEdit = null;
        svc.prism.refresh();
        ui.renderDrawer();
        ui.toast(d.op === "retract" ? "Факт убран из мира чата." : "Факт закреплён в мире чата.");
      },
      "wc-sel-save": async () => {
        await svc.worldChat.setSelectors({ timeline: $("#wc-timeline").value, variant: $("#wc-variant").value });
        svc.prism.refresh();
        ui.renderDrawer();
        ui.toast("Таймлайн и вариант чата сохранены.");
      },
    };

    function change(t) {
      if (t.dataset.mapVariant !== undefined) { const state = treeUi(); if (state) { state.variant = Number(t.value); refreshMap(); } return true; }
      return false;
    }
    function input() {}
    function key(e, t) {
      return false;
    }

    return { actions, change, input, key };
  };
})(typeof window !== "undefined" ? window : globalThis);
