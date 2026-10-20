/* Prism RP — контроллер чата: отправка, генерация, варианты, правка, удаление, поиск, меню чата (режим меняется только созданием нового чата).
   Обработчики тонкие: прочитать ввод → вызвать сервис → перерисовать. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.chat = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $ } = ui;

    async function sendUser() {
      const input = $("#input");
      if (!input) return;
      const text = input.value.trim();
      if (!text || S.gen || S.tracking) return;
      if (S.view === "assist") { input.value = ""; ui.autoGrow(input); return svc.assist.send(text); }
      input.value = "";
      ui.autoGrow(input);
      // Переписка: у отправленного сообщения — неизменяемая метка времени и положения (её даёт сервис переписки).
      const c = ctx.chat();
      const stamp = c && c.mode === "messenger" ? svc.messenger.stampForNew() : null;
      const sent = await svc.chat.addUserMessage(text, stamp ? { messengerAt: stamp } : null);
      // Интерпретация событий — служебный этап, пользователь не заполняет трекер.
      if (svc.state) {
        S.tracking = true;
        try { await svc.state.observeMessage(sent, ctx.provider()); }
        finally { S.tracking = false; }
      }
      ui.renderFeed();
      ui.scrollBottom();
      await svc.gen.generate();
    }
    async function afterBranchChange() {
      svc.prism.refresh();
      ui.renderFeed();
      if (S.drawerOpen) ui.renderDrawer();
    }

    const actions = {
      send: sendUser,
      stop: () => svc.gen.stop(),
      // Модель начинает сцену — только по этой кнопке, никогда сама при открытии чата.
      opening: () => { if (!S.gen) return svc.gen.generate(null, "opening"); },
      // Проверка инициативы (только переписка, только по этой кнопке): правила и сообщения — в сервисе генерации.
      initiative: () => { if (!S.gen) return svc.gen.initiative(); },
      regen: (t) => svc.gen.generate(t.dataset.id, "regen"),
      continue: (t) => svc.gen.generate(t.dataset.id, "continue"),
      swipe: async (t) => {
        if (S.gen) return;
        const r = await svc.chat.swipe(t.dataset.id, +t.dataset.dir);
        if (r === "regen") return svc.gen.generate(t.dataset.id, "regen");
        if (r) await afterBranchChange();
      },
      edit: (t) => { S.editingMsg = t.dataset.id; ui.renderFeed(); const e = document.getElementById("edit-" + t.dataset.id); if (e) { e.focus(); e.style.height = Math.min(e.scrollHeight + 4, 520) + "px"; } },
      "save-edit": async (t) => {
        if (!S.messages.find((x) => x.id === t.dataset.id)) return;
        S.editingMsg = null;
        await svc.chat.saveEdit(t.dataset.id, document.getElementById("edit-" + t.dataset.id).value);
        const edited = S.messages.find((x) => x.id === t.dataset.id);
        if (svc.state && edited) await svc.state.observeMessage(edited, ctx.provider());
        await afterBranchChange();
      },
      "cancel-edit": () => { S.editingMsg = null; ui.renderFeed(); },
      delete: async (t) => {
        if (S.gen) return;
        if (!S.messages.find((x) => x.id === t.dataset.id) || !confirm("Удалить это сообщение и всё, что идёт после него в этой ветке?")) return;
        await svc.chat.deleteFrom(t.dataset.id);
        svc.prism.refresh();
        ui.renderFeed();
        ui.renderRail();
        if (S.drawerOpen) ui.renderDrawer();
      },
      find: () => { S.find = S.find ? null : { q: "", idx: 0 }; ui.renderStage(); const f = $("#find-q"); if (f) f.focus(); },
      "find-close": () => { S.find = null; ui.renderStage(); },
      "find-next": () => { if (!S.find.total) return; S.find.idx = (S.find.idx + 1) % S.find.total; ui.runFind(true); },
      "find-prev": () => { if (!S.find.total) return; S.find.idx = (S.find.idx - 1 + S.find.total) % S.find.total; ui.runFind(true); },
      "chat-menu": (t) => ui.openPop(V.chatMenu(ui.vm()), t),
      "model-pop": (t) => ui.openPop(V.modelPop(ui.vm()), t),
      // Режим выбирается только при создании. Переписке нужна настройка времени — сначала окно.
      "new-chat": (t) => {
        ui.closePop();
        if (t.dataset.mode === "messenger") { S.modal = { kind: "new-messenger", cardId: S.cardId, timeMode: "live" }; ui.renderModal(); return; }
        nav.newChat(t.dataset.mode);
      },
      "rename-chat": async () => {
        ui.closePop();
        const c = ctx.chat();
        const name = prompt("Название чата", c.title || "");
        if (name == null) return;
        c.title = name.trim() || c.title; await svc.chat.putChat(c); ui.renderStage(); ui.renderRail();
      },
      "export-chat": () => { ui.closePop(); const e = svc.chat.exportText(); ctx.files.download(e.name, e.text, "text/plain;charset=utf-8"); },
      "delete-chat": async () => {
        ui.closePop();
        const c = ctx.chat();
        if (!c || !confirm("Удалить этот чат? Вместе с ним удалится опыт персонажа, накопленный в этом мире.")) return;
        await svc.chat.deleteChat(c);
        nav.goHome();
      },
    };

    function input(t) {
      if (t.id === "input") ui.autoGrow(t);
      if (t.id === "find-q") { S.find.q = t.value; S.find.idx = 0; ui.runFind(true); }
    }
    function key(e, t) {
      if (t.id === "input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendUser(); return true; }
      if (t.id === "find-q" && e.key === "Enter") { e.preventDefault(); (e.shiftKey ? actions["find-prev"] : actions["find-next"])(); return true; }
      return false;
    }
    // Ctrl+F в чате — открыть поиск или перейти в его поле.
    function shortcut(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && S.view === "chat") { e.preventDefault(); if (!S.find) actions.find(); else { const f = $("#find-q"); if (f) f.focus(); } return true; }
      return false;
    }

    return { actions, input, key, shortcut };
  };
})(typeof window !== "undefined" ? window : globalThis);
