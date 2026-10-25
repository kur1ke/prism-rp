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
    const readingFiles = new Set();

    /* PERF-01: отправка принимается и во время разбора предыдущего ответа. Порядок хода (дождаться разбора,
       сверить чат и ветку, записать реплику, разобрать её, сгенерировать) — в сервисе генерации (gen.send). */
    async function sendUser() {
      const input = $("#input");
      if (!input) return;
      const text = input.value.trim();
      if (S.view === "assist") { if (!text || S.gen) return; input.value = ""; ui.autoGrow(input); return svc.assist.send(text); }
      const c = ctx.chat();
      if (c && readingFiles.has(c.id)) { ui.toast("Дождитесь чтения прикреплённых файлов.", true); return; }
      const files = c ? (S.chatFiles[c.id] || []).slice() : [];
      if (!text && !files.length) return;
      // Ход этого чата уже принят или идёт ответ: второе нажатие ничего не отправляет, текст остаётся в поле.
      if (!c || S.gen || (S.turn && S.turn.chatId === c.id)) return;
      input.value = "";
      ui.autoGrow(input);
      ui.clearDraft(c.id);
      // Переписка: метка времени и положения — на момент нажатия (её даёт сервис переписки).
      const stamp = c.mode === "messenger" ? svc.messenger.stampForNew() : null;
      const outcome = await svc.gen.send(text, Object.assign({}, stamp ? { messengerAt: stamp } : {}, files.length ? { attachments: files } : {}));
      // Снимаем только уже отправленные вложения — файлы, добавленные во время ответа, остаются в черновике.
      if (outcome && (outcome.outcome === "sent" || outcome.outcome === "left-chat")) {
        S.chatFiles[c.id] = (S.chatFiles[c.id] || []).filter((f) => !files.includes(f));
        if (S.view === "chat" && S.chatId === c.id) ui.renderComposer();
      }
    }
    async function change(t) {
      if (t.id !== "file-chat") return false;
      const c = ctx.chat(), id = c && c.id;
      const chosen = Array.from(t.files || []);
      t.value = ""; // повторно выбрать тот же файл можно без дополнительного сброса
      if (!id || readingFiles.has(id)) return true;
      readingFiles.add(id);
      try {
        const pending = (S.chatFiles[id] = S.chatFiles[id] || []);
        for (const file of chosen) {
          if (pending.length >= PRP.chatAttachments.MAX_FILES) {
            ui.toast("Можно прикрепить не более четырёх файлов.", true);
            break;
          }
          try { pending.push(await ctx.files.readChatAttachment(file)); }
          catch (e) { ui.toast(e.message || String(e), true); }
        }
      } finally {
        readingFiles.delete(id);
        if (S.view === "chat" && S.chatId === id) ui.renderComposer();
      }
      return true;
    }
    async function afterBranchChange() {
      svc.prism.refresh();
      ui.renderFeed();
      if (S.drawerOpen) ui.renderDrawer();
    }

    const actions = {
      send: sendUser,
      "attach-chat-file": () => { const input = $("#file-chat"); if (input) { input.value = ""; input.click(); } },
      "remove-chat-file": (t) => {
        const files = S.chatFiles[S.chatId] || [];
        const idx = Number(t.dataset.index);
        if (Number.isInteger(idx) && idx >= 0 && idx < files.length) files.splice(idx, 1);
        ui.renderComposer();
      },
      "download-chat-file": async (t) => {
        const msg = S.messages.find((m) => m.id === t.dataset.mid);
        const sw = msg && PRP.tree.activeSwipe(msg);
        const file = sw && sw.attachments && sw.attachments[Number(t.dataset.index)];
        if (!file) throw new Error("Файл не найден в выбранном варианте сообщения.");
        await ctx.files.saveChatAttachment(file);
      },
      // Отменить отправку, ожидающую разбора предыдущего ответа: текст вернётся в поле ввода.
      "send-cancel": () => svc.gen.cancelTurn(),
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
        // Разбор правки — управляемая задача (дедуп, без отклонений); ожидающая отправка дождётся его.
        if (svc.state && edited) await svc.state.track(edited, ctx.processingProvider ? ctx.processingProvider() : ctx.provider());
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
      if (t.id === "input") { ui.autoGrow(t); if (S.chatId) ui.clearDraft(S.chatId); }
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

    return { actions, change, input, key, shortcut };
  };
})(typeof window !== "undefined" ? window : globalThis);
