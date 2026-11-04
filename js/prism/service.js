/* Prism RP — сборка Prism для текущего чата (прикладной уровень).
   Связывает активную ветку, сцену, опыт и настройки с чистым сборщиком (prism/assembler.js):
   автоматический Experience (prism/memory-service) и отбор фактов мира (world/overlay-service: канон чата с учётом ветки → отбор по
   релевантности; только чтение) → сборка контекста (AS.build) → отчёт для вкладки Prism.
   Мир не зависит от режима: одни и те же факты получает и сцена, и переписка.
   Адаптер режима (prism/modes): сцена (rp) берёт текущее «сейчас» из сцены; переписка — из среды переписки
   (messenger/service: положение, состояние переписки, время; только чтение). Сцена RP в переписку не подаётся.
   Хранилище, сеть и DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, AS = PRP.assembler, IC = PRP.imgCompose, ST = PRP.settings, SCN = PRP.scenario;

  // Bring at most two latest selected-swipe visual directives back into the
  // text model history. These are shot references, NOT canonical scene updates.
  // They live inside history messages so normal context budgeting can evict them.
  function historyWithDraws(path, enabled) {
    const messages = Array.isArray(path) ? path : [];
    // A continued swipe can contain multiple authored shots; the LAST
    // shot is the current one, exactly as Observer/latestAuthoredShot read it.
    const latestDraw = (sw) => {
      const draws = sw && Array.isArray(sw.draws) ? sw.draws : [];
      const last = draws.length && draws[draws.length - 1];
      return last && typeof last.prompt === "string" && last.prompt.trim() ? last : null;
    };
    const chosen = [];
    if (enabled) for (let i = messages.length - 1; i >= 0 && chosen.length < 2; i--) {
      const m = messages[i];
      const sw = TR.activeSwipe(m);
      if (m.role === "assistant" && latestDraw(sw)) chosen.push(i);
    }
    const selected = new Set(chosen);
    return messages.map((m, i) => {
      const sw = TR.activeSwipe(m);
      const base = String(sw.text || "");
      if (!selected.has(i)) return { role: m.role, text: base };
      const d = latestDraw(sw);
      const prompt = String(d.prompt || "").replace(/\s+/g, " ").trim().slice(0, 700);
      const ratio = /^\d{1,2}:\d{1,2}$/.test(d.ratio || "") ? ", " + d.ratio : "";
      return { role: m.role, text: base + (base ? "\n" : "") + "[draw: " + prompt + ratio + "]" };
    }).filter((h) => h.text);
  }
  function create(ctx) {
    const { S } = ctx;
    const chat = () => ctx.svc.chat;

    /* path — ветка, которая уходит в модель как история; extraPost — дополнительное указание в конце
       (например, «продолжи» или «начни сцену»). scenario — решение prism/scenario.js для этой генерации;
       без него — как для нового ответа после path (так же собирается предпросмотр следующего хода). */
    // extra — дополнительные параметры сборщика (например, allowSyntheticUser: false для начала сцены);
    // extra.messengerNow — момент переписки, выбранный при подготовке генерации (иначе — «сейчас»).
    function build(path, extraPost, scenario, extra) {
      const c = ctx.chat(), cd = ctx.card();
      const s = S.settings;
      // Модель получает инструкцию [draw:] только согласно явно выбранной
      // политике. В обычной переписке просьба о фото — не скрытый побочный эффект.
      const allowDraw = ST.imagesOn(s, ctx.env.perchanceImages()) &&
        ST.modelDrawAllowed(s, path.map((m) => ({ role: m.role, text: TR.activeSwipe(m).text })));
      if (allowDraw) {
        const di = IC.drawInstruction({ format: s.images.format, qualityPinned: ST.qualityPinned(s), mode: c.mode, fixedIdentity: !!(cd.image && (cd.image.trigger || cd.image.look)), intentMode: s.images.drawPromptMode === "intent" || s.images.drawPromptMode === "hybrid", hybrid: s.images.drawPromptMode === "hybrid", characterName: cd.name });
        extraPost = [di, extraPost].filter(Boolean).join("\n\n");
      }
      const messenger = c.mode === "messenger" && ctx.svc.messenger ? ctx.svc.messenger.context(path, extra && extra.messengerNow !== undefined ? extra.messengerNow : undefined) : null;
      // Read the one canonical Tracker snapshot; Messenger remains a remote report.
      const tracked = ctx.svc.state ? ctx.svc.state.context(path, { now: extra && extra.messengerNow }) : null;
      const snapshot = tracked ? tracked.state : PRP.stateTracker.fold({mode:c.mode,initialState:c.initialState,path,charName:cd.name,userName:ctx.persona().name});
      const st = PRP.stateTracker.view(snapshot);
      // В RP здесь видимое общее пространство; в переписке — заявленные персонажем обстоятельства,
      // используемые для поиска мира без утверждения, что пользователь их наблюдал.
      const here = messenger ? { loc: messenger.world.location || "", present: messenger.world.nearby || [] } : st;
      const history = historyWithDraws(path, allowDraw);
      const wctx = ctx.svc.worldChat ? ctx.svc.worldChat.context(path, here) : { facts: [], report: null };
      const wearFacts = PRP.stateTracker.wearFacts(snapshot);
      const provider = ctx.provider();
      const imageMessage = c.mode === "messenger" ? (path || []).slice().reverse().find((x) => x.role === "user") : null;
      const transport = Object.assign({
        names: { char: cd.name, user: ctx.persona().name },
        outputFormat: c.mode === "messenger" ? "message-body" : null,
        imageDataUrl: imageMessage && TR.activeSwipe(imageMessage).imageDataUrl || null,
      }, extra && extra.transport);
      const perchanceInput = provider && provider.kind === "perchance";
      const built = AS.build(Object.assign({
        mode: c.mode, card: cd, userName: ctx.persona().name, userDesc: ctx.persona().description,
        stateSnapshot: messenger ? null : snapshot, messenger, wearFacts,
        reflection: ctx.svc.memory ? ctx.svc.memory.experience(path) : null,
        worldFacts: wctx.facts, history, extraPost,
        contextTokens: ctx.contextTokens(), reserveTokens: s.sampler.max_tokens || 700,
        singleSystem: s.singleSystem, stateToolEnabled: !!s.stateToolEnabled, noPostHistory: !!s.noPostHistory,
        includeScenario: (scenario || SCN.forGeneration(path, { mode: "new" })).included,
        inputCost: perchanceInput ? (messages) => PRP.perchance.inputCost(transport.names, messages, transport) : undefined,
      }, extra));
      built.report.inputFormat = perchanceInput ? "perchance" : "messages";
      built.report.imageDirectiveAllowed = allowDraw;
      built.report.imageDirectivePolicy = ST.modelDrawPolicy(s);
      built.report.world = wctx.report;
      if (messenger) built.report.messengerState = messenger.report;
      return built;
    }

    // Предпросмотр для следующего хода (вкладка Prism, счётчик контекста).
    function refresh() {
      if (!ctx.chat() || !ctx.card()) { S.lastPrism = null; return; }
      S.lastPrism = Object.assign({ at: Date.now(), preview: true }, build(chat().path()));
    }

    return { build, refresh };
  }

  PRP.prismService = { create, historyWithDraws };
})(typeof window !== "undefined" ? window : globalThis);
