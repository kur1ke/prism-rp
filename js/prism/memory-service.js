/* PrismRP — automatic Memory -> Reflection -> Experience service.
   One bounded post-reply cycle. No user prompts, approval or manual edits.
   Domain and provider remain independent; Memory survives failed Reflection. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const M = PRP.memoryCycle, U = PRP.util, LLM = PRP.llm;

  function create(ctx) {
    const { S, DB } = ctx;
    // Per-chat concurrency gate: a slow cycle in another chat may not
    // suppress the new chat's automatic Memory/Experience processing.
    const pendingByChat = new Map();
    // A deleted chat cannot receive late model results, including writes that
    // were already waiting for IndexedDB when deletion started.
    const retiredChats = new Set();
    function retireChat(chatId) { if (chatId) retiredChats.add(chatId); }
    async function load(chatId) {
      const [memories, reflections] = await Promise.all([
        DB.byIndex("memories", "chatId", chatId),
        DB.byIndex("reflections", "chatId", chatId)
      ]);
      if (S.chatId === chatId) { S.memories = memories; S.reflections = reflections; S.memoryStatus = ""; }
    }
    function visibleMemories(path) { const c = ctx.chat(); return c ? M.recent((S.memories || []).filter(x => x.chatId === c.id && x.owner === c.cardId), M.pathSnapshot(path || ctx.svc.chat.path()), Infinity) : []; }
    function experience(path) {
      const p = M.pathSnapshot(path || ctx.svc.chat.path());
      const c = ctx.chat();
      return c ? M.currentReflection((S.reflections || []).filter(x => x.chatId === c.id && x.owner === c.cardId), p) : null;
    }
    function footprint(text) { return U.estimateTokens(text); }
    function fits(system, user, maxOutput) {
      return ctx.contextTokens() >= maxOutput + 220 + footprint(system) + footprint(user);
    }
    function recordStatus(code) {
      S.memoryStatus = code;
      if (S.drawerOpen && S.tab === "memory" && ctx.ui && ctx.ui.renderDrawer) ctx.ui.renderDrawer();
      return { status: code };
    }
    async function cycle(sourceMsg, prov) {
      const initialChat = ctx.chat();
      if (!initialChat || sourceMsg.chatId !== initialChat.id) return { status: "stale" };
      const chatId = initialChat.id, owner = initialChat.cardId;
      if (retiredChats.has(chatId)) return { status: "stale" };
      const finish = (code) => S.chatId === chatId ? recordStatus(code) : { status: code };
      const path = M.pathSnapshot(ctx.svc.chat.path());
      const anchor = path.find((x) => x.id === sourceMsg.id);
      if (!anchor || !anchor.text.trim()) return finish("empty");
      const model = prov || (ctx.processingProvider ? ctx.processingProvider() : ctx.provider());
      if (!model) return finish("no-provider");
      const sources = M.extractionInput(path.slice(0, path.indexOf(anchor) + 1));
      if (!sources.length) return finish("empty");
      const extractionUser = JSON.stringify({ mode: initialChat.mode, sources });
      const MAX_EXTRACT_OUT = 600, MAX_REFLECT_OUT = 500;
      if (!fits(M.EXTRACT_SYSTEM, extractionUser, MAX_EXTRACT_OUT))
        return finish("overflow-extract");
      const call = async (system, user, max_tokens) => {
        const response = await LLM.chat(model, [
          { role: "system", content: system },
          { role: "user", content: user }
        ], { names: { char: "Анализатор", user: "История" },
          outputFormat: "message-body", sampler: { temperature: 0.35, max_tokens } });
        return PRP.openai.splitThink(response.text || "").text;
      };
      const relevant = () => {
        if (retiredChats.has(chatId) || !ctx.chat() || S.chatId !== chatId || ctx.chat().cardId !== owner) return false;
        return M.visible({messageId:anchor.id,swipeIdx:anchor.swipeIdx,
          textHash:anchor.textHash,prefixHash:anchor.prefixHash}, M.pathSnapshot(ctx.svc.chat.path()));
      };
      if (!relevant()) return finish("stale");
      let proposed;
      try {
        proposed = M.parseExtraction(await call(M.EXTRACT_SYSTEM, extractionUser, MAX_EXTRACT_OUT), sources, path, initialChat.mode);
      } catch (e) { return finish("extract-error"); }
      if (!relevant()) return finish("stale");
      if (!proposed) return finish("invalid-extract");
      const existing = (S.memories || []).filter((m) => m.chatId === chatId && m.owner === owner);
      const newOnes = proposed.filter((m) => !existing.some((x) =>
        x.source.messageId === m.source.messageId &&
        x.source.prefixHash === m.source.prefixHash && x.quote === m.quote))
        .map((m) => Object.assign({ id: U.uid("mem"), schema: 1, chatId, owner, createdAt: Date.now() }, m));
      if (!newOnes.length) return finish("no-new-memory");
      // Memory is independent of Experience. Its valid evidence is committed
      // immediately; failure of later reflection must never erase an episode.
      if (!relevant()) return finish("stale");
      await DB.putAll(newOnes.map((m) => ["memories", m]));
      if (retiredChats.has(chatId)) {
        await DB.delMany("memories", newOnes.map((m) => m.id));
        return finish("stale");
      }
      if (!relevant()) return finish("stale");
      if (S.chatId === chatId) {
        S.memories = (S.memories || []).concat(newOnes);
        if (S.drawerOpen && S.tab === "memory") ctx.ui.renderDrawer();
      }
      const candidates = M.recent(existing.concat(newOnes), path, M.LIMIT);
      const prior = experience(ctx.svc.chat.path());
      const cd = ctx.card() || {};
      // Exactly the same Core interpretation as normal Prism assembly. Do not
      // let reflection construct a second, divergent character baseline.
      const macroNames = { char: cd.name || "Персонаж",
        user: ctx.persona && ctx.persona() && ctx.persona().name || "Пользователь" };
      const canonical = PRP.cardContext.core(cd, (x) => U.macros(x, macroNames));
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
      if (!payload.memories.length) return finish("overflow-reflection");
      const includedMemoryIds = candidates.slice(0, payload.memories.length).map((m) => m.id);
      let result;
      try { result = M.parseReflection(await call(M.REFLECT_SYSTEM, reflectionUser, MAX_REFLECT_OUT)); }
      catch (_) { return finish("reflect-error"); }
      if (!relevant()) return finish("stale");
      if (!result) return finish("invalid-reflection");
      const record = result.change === "changed" && (!prior || result.perspective !== prior.perspective) ? {
        id: U.uid("ref"), schema: 1, chatId, owner,
        anchor: { messageId: anchor.id, swipeIdx: anchor.swipeIdx, textHash: anchor.textHash, prefixHash: anchor.prefixHash },
        perspective: result.perspective, memoryIds: includedMemoryIds,
        createdAt: Date.now()
      } : null;
      // A new Experience version commits only after validated reflection;
      // Memory is already safely stored as a separate class of evidence.
      if (record) {
        await DB.put("reflections", record);
        if (retiredChats.has(chatId)) {
          await DB.del("reflections", record.id);
          return finish("stale");
        }
      }
      if (S.chatId === chatId) {
        if (record) S.reflections = (S.reflections || []).concat([record]);
        if (ctx.svc.prism) ctx.svc.prism.refresh();
        if (S.drawerOpen && S.tab === "memory") ctx.ui.renderDrawer();
      }
      return finish(record ? "reflected" : "remembered-unchanged");
    }
    // Preserve every committed reply: same-chat cycles run in FIFO order,
    // while different chats remain independent. No continuous/background loop.
    function observe(msg, prov) {
      const chatId = msg && msg.chatId;
      if (!chatId) return Promise.resolve({ status: "no-source" });
      if (retiredChats.has(chatId)) return Promise.resolve({ status: "stale" });
      const preceding = pendingByChat.get(chatId);
      const run = () => cycle(msg, prov).catch(() =>
        S.chatId === chatId ? recordStatus("error") : { status: "error" });
      const task = preceding ? preceding.then(run, run) : run();
      pendingByChat.set(chatId, task);
      task.finally(() => { if (pendingByChat.get(chatId) === task) pendingByChat.delete(chatId); });
      return task;
    }
    return { load, visibleMemories, experience, observe, retireChat };
  }
  PRP.memoryService = { create };
})(typeof window !== "undefined" ? window : globalThis);
