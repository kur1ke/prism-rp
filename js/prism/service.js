/* Prism RP — сборка Prism для текущего чата (прикладной уровень).
   Связывает активную ветку, сцену, опыт и настройки с чистым сборщиком (prism/assembler.js):
   отбор опыта (EX.rank) → сборка контекста (AS.build) → отчёт для вкладки Prism.
   Хранилище, сеть и DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, EX = PRP.experience, AS = PRP.assembler, IC = PRP.imgCompose, ST = PRP.settings, SCN = PRP.scenario;

  function create(ctx) {
    const { S } = ctx;
    const chat = () => ctx.svc.chat;

    /* path — ветка, которая уходит в модель как история; extraPost — дополнительное указание в конце
       (например, «продолжи» или «начни сцену»). scenario — решение prism/scenario.js для этой генерации;
       без него — как для нового ответа после path (так же собирается предпросмотр следующего хода). */
    function build(path, extraPost, scenario) {
      const c = ctx.chat(), cd = ctx.card();
      const s = S.settings;
      if (ST.imagesOn(s, ctx.env.perchanceImages()) && s.images.modelDraws) {
        const di = IC.drawInstruction({ format: s.images.format, qualityPinned: ST.qualityPinned(s), pov: (ctx.persona().image || {}).view === "first" });
        extraPost = [di, extraPost].filter(Boolean).join("\n\n");
      }
      const st = chat().sceneState(path);
      const history = path.map((m) => ({ role: m.role, text: TR.activeSwipe(m).text })).filter((h) => h.text);
      const recent = history.slice(-4).map((h) => h.text).join("\n");
      const ex = EX.rank(S.experience, {
        chatId: c.id, path: chat().pathCtx(path), ownerId: cd.id, present: ["user"].concat(st.present),
        text: recent, names: [cd.name, ctx.persona().name].concat(st.present), limit: s.expLimit,
      });
      const built = AS.build({
        mode: c.mode, card: cd, userName: ctx.persona().name, userDesc: ctx.persona().description,
        sceneState: st, experiences: ex.ranked, history, extraPost,
        contextTokens: ctx.contextTokens(), reserveTokens: s.sampler.max_tokens || 700,
        singleSystem: s.singleSystem, sceneProtocol: s.sceneProtocol, noPostHistory: !!s.noPostHistory,
        includeScenario: (scenario || SCN.forGeneration(path, { mode: "new" })).included,
      });
      built.report.expDebug = ex.debug;
      built.report.experienceVisible = ex.visibleCount;
      built.report.legacyUnscoped = S.experience.filter((r) => EX.scopeOf(r) === "legacy").length;
      return built;
    }

    // Предпросмотр для следующего хода (вкладка Prism, счётчик контекста).
    function refresh() {
      if (!ctx.chat() || !ctx.card()) { S.lastPrism = null; return; }
      S.lastPrism = Object.assign({ at: Date.now(), preview: true }, build(chat().path()));
    }

    return { build, refresh };
  }

  PRP.prismService = { create };
})(typeof window !== "undefined" ? window : globalThis);
