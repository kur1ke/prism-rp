/* Prism RP — контроллер выдвижной панели: сцена (ручные правки), опыт (форма записи), мир чата (явные действия), Prism (предпросмотр). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const SC = PRP.scene, U = PRP.util;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.drawer = function (ctx) {
    const { S, ui, svc } = ctx;
    const { $ } = ui;
    const op = (...a) => svc.chat.op(...a);

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

    // Ручные изменения сцены → в ветку; затем Prism, панель и шапка.
    async function applySceneOps(ops) {
      if (!(await svc.chat.applySceneOps(ops))) {
        ui.toast("Изменение сцены отклонено: проверьте значение. Сдвиг минут/часов возможен после установки времени суток.", true);
        return;
      }
      svc.prism.refresh();
      ui.renderDrawer();
      ui.renderHead();
    }

    // Форма «Мир чата» → черновик действия (S.worldEdit). Область — только явный выбор пользователя.
    const csv = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
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

    const actions = {
      drawer: () => { S.drawerOpen = !S.drawerOpen; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      "drawer-close": () => { S.drawerOpen = false; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      tab: (t) => { collectWorld(); S.tab = t.dataset.tab; if (S.tab === "prism") svc.prism.refresh(); ui.renderDrawer(); },
      "debug-open": () => { svc.prism.refresh(); S.modal = { kind: "debug", section: "prism" }; ui.renderModal(); },
      "debug-section": (t) => { if (S.modal && S.modal.kind === "debug") { S.modal.section = t.dataset.section; ui.renderModal(); } },
      "debug-knowledge-run": async () => {
        if (!S.modal || S.modal.kind !== "debug" || S.modal.section !== "knowledge" ||
            !S.settings || !S.settings.developerMode || S.gen || S.turn) return;
        if (S.knowledgeShadow && S.knowledgeShadow.running) return;
        const chat = ctx.chat(), provider = ctx.provider();
        if (!chat || !provider) { ui.toast("Текстовый провайдер не выбран.", true); return; }
        const path = svc.chat.path().slice(-12);
        const anchor = JSON.stringify({chatId:chat.id, path});
        const current = {chatId:chat.id, anchor, running:true, result:null, error:null};
        S.knowledgeShadow = current;
        ui.renderModal();
        try {
          const result = await PRP.knowledgeProviderShadow.run({chatId:chat.id,path,
            personaDescription:String((ctx.persona()||{}).description||"")},{provider});
          const now = JSON.stringify({chatId:S.chatId,path:svc.chat.path().slice(-12)});
          if (S.knowledgeShadow !== current) return;
          if (now !== anchor) current.error = "stale-selected-path";
          else if (result.error) current.error = result.error;
          else current.result = result;
        } catch (_) { if (S.knowledgeShadow === current) current.error = "shadow-run-failed"; }
        finally { if (S.knowledgeShadow === current) {
          current.running = false;
          if (S.modal && S.modal.kind === "debug" && S.modal.section === "knowledge") ui.renderModal();
        }}
      },
      "debug-copy": async () => {
        if (!S.modal || S.modal.kind !== "debug") return;
        const body = $(".debug-modal .debug-body");
        if (!body) return;
        const title = { prism: "Prism", wear: "Одежда", tracker: "Трекер", events: "События", images: "Изображения", errors: "Ошибки", timing: "Тайминги", knowledge: "K1.5" }[S.modal.section || "prism"] || "Debug";
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
      // Сцена
      "sc-time-set": () => {
        const d = $("#sc-date").value.trim(), tm = $("#sc-time").value.trim();
        if (d && !/^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(d)) { ui.toast("Дата в виде 14.05 или 14.05.2026", true); return; }
        const v = [d, tm].filter(Boolean).join(" ");
        if (v) applySceneOps([op(null, "time", v)]);
      },
      "sc-shift": (t) => applySceneOps([op(null, "time", t.dataset.v)]),
      "sc-leave": (t) => applySceneOps([op(null, "leave", t.dataset.name)]),
      "sc-enter": (t) => applySceneOps([op(null, "enter", t.dataset.name)]),
      "sc-remove": (t) => applySceneOps([op(t.dataset.name, "remove", t.dataset.item)]),
      "scene-init-save": async () => {
        const c = ctx.chat(), value = $("#scene-init").value.trim();
        const ops = SC.parseBody(value);
        const check = SC.apply(SC.emptyState(), ops, { charName: ctx.card() && ctx.card().name, userName: ctx.persona() && ctx.persona().name });
        if (check.ignored.length) { ui.toast("Начальная сцена содержит недопустимые команды. Исправьте их перед сохранением.", true); return; }
        c.sceneInit = value; await svc.chat.putChat(c);
        svc.prism.refresh(); ui.renderDrawer(); ui.renderFeed(); ui.toast("Начальная сцена сохранена.");
      },
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
      if (t.dataset.scTop) { applySceneOps([op(null, t.dataset.scTop, t.value.trim() || "-")]); return true; }
      if (t.dataset.scField) { applySceneOps([op(t.dataset.name, t.dataset.scField, t.value.trim() || "-")]); return true; }
      return false;
    }
    function input() { /* полей с живым обновлением на панели сцены нет */ }
    function key(e, t) {
      if (e.key === "Enter" && t.classList && t.classList.contains("chip-add")) {
        e.preventDefault();
        const v = t.value.trim();
        if (!v) return true;
        if (t.dataset.scAdd) applySceneOps([op(t.dataset.scAdd, "add", v)]);
        else if (t.id === "sc-enter-new") applySceneOps([op(null, "enter", v)]);
        return true;
      }
      if (e.key === "Enter" && t.tagName === "INPUT" && (t.dataset.scTop || t.dataset.scField)) { t.blur(); return true; }
      return false;
    }

    return { actions, change, input, key };
  };
})(typeof window !== "undefined" ? window : globalThis);
