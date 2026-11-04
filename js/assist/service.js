/* Prism RP — ассистент (прикладной уровень): разговоры с моделью вне игры.
   Выбор и сохранение разговоров, контекст из карточки и выдержки чата, генерация через PRP.llm.
   Смысловые правила (инструкция, сборка контекста) — в assist/assist.js. Перерисовка — через ctx.ui. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, TRACK = PRP.stateTracker, OA = PRP.openai, AST = PRP.assist, LLM = PRP.llm;

  function create(ctx) {
    const { S, DB, ui } = ctx;

    function loadAll() { return DB.all("assist"); }

    // Выбрать разговор: по id, оставить уже открытый пустой или начать новый (наследуя персонажа).
    function pick(id, base) {
      const found = id && S.assistList.find((a) => a.id === id);
      if (found) S.assist = found;
      else if (!base && S.assist && !S.assist.messages.length) { /* пустой разговор уже открыт */ }
      else {
        const b = base || (S.assist ? { cardId: S.assist.ctx.cardId, chatId: null } : (S.view === "chat" && S.cardId ? { cardId: S.cardId, chatId: null } : {}));
        S.assist = AST.blank(b);
      }
    }
    async function save() {
      const a = S.assist;
      await DB.put("assist", a);
      if (!S.assistList.includes(a)) S.assistList.push(a);
    }
    async function remove(a) {
      await DB.del("assist", a.id);
      S.assistList = S.assistList.filter((x) => x !== a);
      S.assist = null;
    }

    // Выдержка из ролевого чата для контекста ассистента: реплики активной ветки и строка сцены.
    async function chatLines(chatId) {
      const c = S.chats.find((x) => x.id === chatId);
      if (!c) return { lines: [], scene: "" };
      const msgs = await DB.byIndex("messages", "chatId", chatId);
      const path = TR.path(TR.index(msgs), c.leafId);
      const cd = S.cards.find((x) => x.id === c.cardId);
      const lines = path.map((m) => ({ name: m.role === "user" ? ctx.persona().name : (cd ? cd.name : "Персонаж"), text: TR.activeSwipe(m).text || "" })).filter((l) => l.text.trim());
      // Строка сцены — только у сцены RP: у переписки отдельные время и удалённые reported-сведения.
      if (c.mode === "messenger") return { lines, scene: "" };
      const st = TRACK.fold({ mode:c.mode, initialState:c.initialState, path, charName:cd && cd.name, userName:ctx.persona().name });
      return { lines, scene: TRACK.summary(st) };
    }

    async function send(text) { return generate(null, String(text || "").trim()); }

    async function generate(regenId, text) {
      const a = S.assist;
      if (!a || S.gen) return { outcome: "busy" };
      if (text !== undefined && !text) return { outcome: "empty" };
      const prov = ctx.provider();
      if (!prov) { ui.toast("Модель не подключена. Откройте «Настройки → Модели».", true); ui.openSettings("models"); return { outcome: "no-provider" }; }
      const at = regenId != null ? a.messages.findIndex((m) => m.id === regenId) : -1;
      if (regenId != null && (at < 0 || at !== a.messages.length - 1 || a.messages[at].role !== "assistant"))
        return { outcome: "invalid" };
      const sourceKey = JSON.stringify([a.ctx, a.messages]);
      const proposed = (regenId != null ? a.messages.slice(0, at) : a.messages.slice());
      if (text !== undefined) proposed.push({ id: U.uid("am"), role: "user", text, at: Date.now() });
      const sp = S.settings.sampler;
      const sampler = Object.assign({}, sp, {
        temperature: Math.min(sp.temperature || 0.7, 0.8),
        max_tokens: Math.max(sp.max_tokens || 0, 1500),
      });
      const names = { char: "Ассистент", user: ctx.persona().name };
      const ctrl = new AbortController();
      // Hold the accepted operation while reading attached chat context; no message exists yet.
      const lock = S.gen = { ctrl, msgId: "pending-assist", raw: "", reasoning: "", assist: true };
      let accepted = false;
      try {
        const cd = a.ctx.cardId ? S.cards.find((c) => c.id === a.ctx.cardId) : null;
        const chatCtx = a.ctx.chatId ? await chatLines(a.ctx.chatId) : { lines: [], scene: "" };
        const built = AST.build({
          system: (S.settings.assistSystem || "").trim() || AST.SYSTEM, card: cd,
          chatLines: chatCtx.lines, sceneLine: chatCtx.scene, userName: names.user,
          history: proposed, contextTokens: ctx.contextTokens(prov), reserveTokens: sampler.max_tokens,
          inputCost: prov.kind === "perchance" ? (messages) => PRP.perchance.inputCost(names, messages) : undefined,
        });
        S.lastAssistBudget = built.report;
        if (built.report.overflow) {
          ui.toast("Контекст ассистента не помещается (" + built.report.used + " из " + built.report.budget +
            " токенов), запрос не отправлен. Увеличьте окно, уменьшите длину ответа или объём выбранной карточки/вопроса.", true);
          return { outcome: "overflow", report: built.report };
        }
        if (S.assist !== a || sourceKey !== JSON.stringify([a.ctx, a.messages]) || ctrl.signal.aborted)
          return { outcome: "stale" };
        const target = { id: U.uid("am"), role: "assistant", text: "", at: Date.now() };
        const next = Object.assign({}, a, {
          title: !a.messages.length && text !== undefined ? AST.title(text) : a.title,
          messages: proposed.concat(target),
        });
        await DB.put("assist", next);
        Object.assign(a, next);
        accepted = true;
        if (!S.assistList.includes(a)) S.assistList.push(a);
        if (text !== undefined && typeof ui.acceptAssistInput === "function") ui.acceptAssistInput(text);
        lock.msgId = target.id;
        ui.rememberUi(); ui.renderStage(); ui.scrollBottom();
        const onDelta = (d) => {
          if (S.gen !== lock) return;
          lock.raw += d.text || ""; lock.reasoning += d.reasoning || ""; ui.paintAssist();
        };
        let raw = "", reasoning = "", error = null;
        try {
          const res = await LLM.chat(prov, built.messages, { names, sampler, signal: ctrl.signal, onDelta });
          raw = res.text; reasoning = res.reasoning;
        } catch (e) {
          raw = e.partial != null ? e.partial : lock.raw;
          reasoning = lock.reasoning;
          if (e.name !== "AbortError") error = e.message || String(e);
        }
        const th = OA.splitThink(raw || "");
        const response = Object.assign({}, target, {
          text: th.text.trim(), reasoning: [reasoning, th.reasoning].filter(Boolean).join("\n").trim(),
          ...(error ? { error } : {}),
        });
        const completed = Object.assign({}, a, {
          messages: a.messages.filter((m) => m.id !== target.id).concat(response.text || error ? [response] : []),
        });
        await DB.put("assist", completed);
        Object.assign(a, completed);
        ui.rememberUi();
        return { outcome: "sent", report: built.report };
      } finally {
        if (S.gen === lock) S.gen = null;
        if (S.view === "assist") { ui.renderStage(); if (accepted) ui.scrollBottom(); }
      }
    }

    // Убрать сообщение и всё после него. → удалённые сообщения или null.
    async function cutFrom(id) {
      const a = S.assist;
      const i = a.messages.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const removed = a.messages.splice(i);
      await save(); ui.rememberUi();
      return removed;
    }

    return { loadAll, pick, save, remove, chatLines, send, generate, cutFrom };
  }

  PRP.assistService = { create };
})(typeof window !== "undefined" ? window : globalThis);
