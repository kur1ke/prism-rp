/* PrismRP — automatic Memory -> Reflection -> Experience service.
   One bounded post-reply cycle. No user prompts, approval or manual edits.
   Domain and provider remain independent; commits only after both analyses validate. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const M = PRP.memoryCycle, U = PRP.util, LLM = PRP.llm;

  function create(ctx) {
    const { S, DB } = ctx;
    let pending = null;
    async function load(chatId) {
      const [memories, reflections] = await Promise.all([
        DB.byIndex("memories", "chatId", chatId),
        DB.byIndex("reflections", "chatId", chatId)
      ]);
      if (S.chatId === chatId) { S.memories = memories; S.reflections = reflections; }
    }
    function visibleMemories(path) { return M.recent(S.memories, M.pathSnapshot(path || ctx.svc.chat.path()), Infinity); }
    function experience(path) {
      const p = M.pathSnapshot(path || ctx.svc.chat.path());
      return M.currentReflection(S.reflections, p);
    }
    function footprint(text) { return U.estimateTokens(text); }
    function fits(system, user, maxOutput) {
      return ctx.contextTokens() >= maxOutput + 220 + footprint(system) + footprint(user);
    }
    function recordStatus(code) { S.memoryStatus = code; return { status: code }; }
    async function cycle(sourceMsg, prov) {
      const initialChat = ctx.chat();
      if (!initialChat || sourceMsg.chatId !== initialChat.id) return recordStatus("stale");
      const chatId = initialChat.id, owner = initialChat.cardId;
      const path = M.pathSnapshot(ctx.svc.chat.path());
      const anchor = path.find((x) => x.id === sourceMsg.id);
      if (!anchor || !anchor.text.trim()) return recordStatus("empty");
      const model = prov || (ctx.processingProvider ? ctx.processingProvider() : ctx.provider());
      if (!model) return recordStatus("no-provider");
      const sources = M.extractionInput(path.slice(0, path.indexOf(anchor) + 1));
      if (!sources.length) return recordStatus("empty");
      const extractionUser = JSON.stringify({ mode: initialChat.mode, sources });
      const MAX_EXTRACT_OUT = 600, MAX_REFLECT_OUT = 500;
      if (!fits(M.EXTRACT_SYSTEM, extractionUser, MAX_EXTRACT_OUT))
        return recordStatus("overflow-extract");
      const call = async (system, user, max_tokens) => {
        const response = await LLM.chat(model, [
          { role: "system", content: system },
          { role: "user", content: user }
        ], { names: { char: "Анализатор", user: "История" },
          outputFormat: "message-body", sampler: { temperature: 0.35, max_tokens } });
        return PRP.openai.splitThink(response.text || "").text;
      };
      const relevant = () => {
        if (!ctx.chat() || S.chatId !== chatId || ctx.chat().cardId !== owner) return false;
        return M.visible({messageId:anchor.id,swipeIdx:anchor.swipeIdx,
          textHash:anchor.textHash,prefixHash:anchor.prefixHash}, M.pathSnapshot(ctx.svc.chat.path()));
      };
      if (!relevant()) return recordStatus("stale");
      let proposed;
      try {
        proposed = M.parseExtraction(await call(M.EXTRACT_SYSTEM, extractionUser, MAX_EXTRACT_OUT), sources, path);
      } catch (e) { return recordStatus("extract-error"); }
      if (!relevant()) return recordStatus("stale");
      if (!proposed) return recordStatus("invalid-extract");
      const existing = (S.memories || []).filter((m) => m.chatId === chatId);
      const newOnes = proposed.filter((m) => !existing.some((x) =>
        x.source.messageId === m.source.messageId &&
        x.source.prefixHash === m.source.prefixHash && x.quote === m.quote))
        .map((m) => Object.assign({ id: U.uid("mem"), schema: 1, chatId, owner, createdAt: Date.now() }, m));
      if (!newOnes.length) return recordStatus("no-new-memory");
      const candidates = M.recent(existing.concat(newOnes), path, M.LIMIT);
      const prior = experience(ctx.svc.chat.path());
      const cd = ctx.card() || {};
      // Exactly the same Core interpretation as normal Prism assembly. Do not
      // let reflection construct a second, divergent character baseline.
      const canonical = PRP.cardContext.core(cd, (x) => x);
      const core = { name: cd.name, source: canonical.source,
        identity: canonical.identity, personality: canonical.personality,
        traits: canonical.traits, voice: canonical.voice, durableContext: canonical.durableContext };
      const payload = { mode: initialChat.mode, coreGuide: core,
        previousExperience: prior ? prior.perspective : null,
        memories: M.weighted(candidates) };
      let reflectionUser = JSON.stringify(payload);
      while (payload.memories.length && !fits(M.REFLECT_SYSTEM, reflectionUser, MAX_REFLECT_OUT)) {
        payload.memories.pop();
        reflectionUser = JSON.stringify(payload);
      }
      if (!payload.memories.length) return recordStatus("overflow-reflection");
      let result;
      try { result = M.parseReflection(await call(M.REFLECT_SYSTEM, reflectionUser, MAX_REFLECT_OUT)); }
      catch (_) { return recordStatus("reflect-error"); }
      if (!relevant()) return recordStatus("stale");
      if (!result) return recordStatus("invalid-reflection");
      const record = result.change === "changed" ? {
        id: U.uid("ref"), schema: 1, chatId, owner,
        anchor: { messageId: anchor.id, swipeIdx: anchor.swipeIdx, textHash: anchor.textHash, prefixHash: anchor.prefixHash },
        perspective: result.perspective, memoryIds: candidates.map((x) => x.id),
        createdAt: Date.now()
      } : null;
      const entries = newOnes.map((m) => ["memories", m]);
      if (record) entries.push(["reflections", record]);
      // Commit Memory and changed Experience in ONE transaction, after both
      // model replies validate and the selected ancestral context still matches.
      await DB.putAll(entries);
      if (S.chatId === chatId) {
        S.memories = (S.memories || []).concat(newOnes);
        if (record) S.reflections = (S.reflections || []).concat([record]);
        if (ctx.svc.prism) ctx.svc.prism.refresh();
        if (S.drawerOpen && S.tab === "memory") ctx.ui.renderDrawer();
      }
      return recordStatus(record ? "reflected" : "remembered-unchanged");
    }
    // Overlap is intentionally suppressed; a future turn may re-scan the last
    // four messages. No independent background task or continuous simulation.
    function observe(msg, prov) {
      if (pending) return Promise.resolve({ status: "busy" });
      const task = cycle(msg, prov).catch((e) => recordStatus("error"));
      pending = task;
      task.finally(() => { if (pending === task) pending = null; });
      return task;
    }
    return { load, visibleMemories, experience, observe };
  }
  PRP.memoryService = { create };
})(typeof window !== "undefined" ? window : globalThis);
