/* Prism RP — ассистент (прикладной уровень): разговоры с моделью вне игры.
   Выбор и сохранение разговоров, контекст из карточки и выдержки чата, генерация через PRP.llm.
   Смысловые правила (инструкция, сборка контекста) — в assist/assist.js. Перерисовка — через ctx.ui. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, SC = PRP.scene, OA = PRP.openai, AST = PRP.assist, LLM = PRP.llm;

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
      const st = SC.fold(c.sceneInit, path.map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })));
      return { lines, scene: SC.summaryLine(st) || "" };
    }

    async function send(text) {
      const a = S.assist;
      if (!a || S.gen) return;
      if (!a.messages.length) a.title = AST.title(text);
      a.messages.push({ id: U.uid("am"), role: "user", text, at: Date.now() });
      await save(); ui.rememberUi();
      await generate();
    }

    async function generate() {
      const a = S.assist;
      const prov = ctx.provider();
      if (!prov) { ui.toast("Модель не подключена. Откройте «Настройки → Модели».", true); ui.openSettings("models"); return; }
      const cd = a.ctx.cardId ? S.cards.find((c) => c.id === a.ctx.cardId) : null;
      const chatCtx = a.ctx.chatId ? await chatLines(a.ctx.chatId) : { lines: [], scene: "" };
      const target = { id: U.uid("am"), role: "assistant", text: "", at: Date.now() };
      const history = a.messages.map((x) => ({ role: x.role, text: x.text }));
      a.messages.push(target);
      const built = AST.build({
        system: (S.settings.assistSystem || "").trim() || AST.SYSTEM, card: cd, chatLines: chatCtx.lines, sceneLine: chatCtx.scene,
        userName: ctx.persona().name, history, contextTokens: ctx.contextTokens(), reserveTokens: 1500,
      });
      const ctrl = new AbortController();
      S.gen = { ctrl, msgId: target.id, raw: "", reasoning: "", assist: true };
      ui.renderStage();
      ui.scrollBottom();
      const onDelta = (d) => { if (!S.gen) return; S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; ui.paintAssist(); };
      let raw = "", reasoning = "", error = null;
      try {
        const sp = S.settings.sampler;
        const res = await LLM.chat(prov, built.messages, {
          names: { char: "Ассистент", user: ctx.persona().name },
          sampler: Object.assign({}, sp, { temperature: Math.min(sp.temperature || 0.7, 0.8), max_tokens: Math.max(sp.max_tokens || 0, 1500) }),
          signal: ctrl.signal, onDelta,
        });
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
      await save(); ui.rememberUi();
      if (S.view === "assist") { ui.renderStage(); ui.scrollBottom(); }
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
