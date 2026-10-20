/* Prism RP — UT-1: автоматическая интерпретация сообщения и получение общего State Snapshot.
   Никаких фоновых таймеров и независимой среды для разных режимов. Результат наблюдателя
   сохраняется внутри выбранного свайпа; смена чата/ветки/текста до ответа отменяет запись.
*/
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, TRACK = PRP.stateTracker, INT = PRP.stateInterpreter;
  const MAX_TEXT = 4500;
  function create(ctx) {
    const { S } = ctx;
    const chat = () => ctx.svc.chat;

    function snapshot(path, opts) {
      const c = ctx.chat(), cd = ctx.card();
      if (!c || !cd) return TRACK.empty({});
      const p = path || chat().path(), extra = opts || {};
      let legacy = extra.legacyWorld;
      if (legacy === undefined && c.mode === "messenger" && ctx.svc.messenger) {
        const world = ctx.svc.messenger.worldAt(p, extra.now);
        legacy = world && world.world;
      }
      return TRACK.fold({ mode: c.mode, sceneInit: c.sceneInit, path: p,
        charName: cd.name, userName: ctx.persona().name, legacyWorld: legacy });
    }

    function context(path, opts) {
      const state = snapshot(path, opts);
      return { state, character: TRACK.forCharacter(state), userView: TRACK.forUser(state, ctx.chat() && ctx.chat().mode) };
    }

    /* Observe AFTER a committed text message, BEFORE continuing generation/drawing.
       If interpretation fails, no world fact is manufactured. A missing model leaves
       the normal chat functional. No model-output data can control another actor.
       Only same chat, same active swipe, same source text may be committed. */
    async function observeMessage(msg, provider) {
      const c = ctx.chat();
      if (!c || !msg || msg.chatId !== c.id || !["assistant", "user"].includes(msg.role)) return { skipped: "not-message" };
      const sw = TR.activeSwipe(msg), sourceText = String(sw.text || ""), swipeIdx = msg.swipeIdx || 0;
      if (!sourceText.trim()) return { skipped: "empty" };
      if (!INT.mayChangeState(sourceText)) return { skipped: "non-event-greeting" };
      if (sw.stateStatus && sw.stateStatus.status === "ok" && sw.stateStatus.sourceText === sourceText) return { skipped: "already-processed" };
      if (!provider) return { skipped: "no-provider" };
      const initialPath = chat().path();
      if (!initialPath.includes(msg)) return { skipped: "off-path" };
      const originalKey = initialPath.map((m) => m.id + ":" + (m.swipeIdx || 0)).join(">");
      const chatId = c.id;
      let result;
      try {
        const instruction = INT.instruction({ mode: c.mode, role: msg.role, text: sourceText.slice(0, MAX_TEXT) });
        const raw = await PRP.llm.simple(provider, instruction, { maxTokens: 650 });
        result = INT.parse(raw, { mode: c.mode, role: msg.role, text: sourceText.slice(0, MAX_TEXT) });
      } catch (e) {
        return { error: "interpretation-failed", detail: String(e && e.message || e) };
      }
      if (!ctx.chat() || ctx.chat().id !== chatId || (msg.swipeIdx || 0) !== swipeIdx ||
          String(TR.activeSwipe(msg).text || "") !== sourceText ||
          chat().path().map((m) => m.id + ":" + (m.swipeIdx || 0)).join(">") !== originalKey) {
        return { skipped: "stale-branch" };
      }
      const stateStatus = { status: "ok", sourceText, issues: result.issues, at: Date.now() };
      const next = JSON.parse(JSON.stringify(msg));
      next.swipes[swipeIdx].stateEvents = result.events;
      next.swipes[swipeIdx].stateStatus = stateStatus;
      // Persist first; keep the SAME message + swipe objects in S.messages.
      // Replacing their identity would make an ongoing image draw rewrite old
      // records over just-extracted stateEvents.
      await ctx.DB.put("messages", next);
      sw.stateEvents = result.events;
      sw.stateStatus = stateStatus;
      return { events: result.events, issues: result.issues };
    }
    async function correct(patch) {
      const c = ctx.chat();
      const path = chat().path(), m = path[path.length - 1];
      if (!c || !m) return { error: "Для исправления в ветке необходимо хотя бы одно сообщение." };
      const choices = { location: "location", activity: "activity", visualWear: "wear", visualPose: "pose", visualHair: "hair", nearby: "nearby", ongoing: "ongoing", availability: "availability" };
      const changes = [], issues = [];
      for (const [key, val] of Object.entries(patch || {})) {
        const field = choices[key];
        if (!field) { issues.push("неизвестное поле: " + key); continue; }
        const empty = val == null || (Array.isArray(val) && !val.length) || val === "";
        const e = { actor: "char", field, action: empty ? "clear" : "set", value: val, certainty: "established", evidence: "" };
        const r = TRACK.normalize(e, { role: "manual", mode: c.mode });
        if (r.error) issues.push(r.error); else changes.push(r.event);
      }
      if (!changes.length || issues.length) return { error: issues.join("; ") || "Нет изменений." };
      const swIdx = m.swipeIdx || 0, sw = TR.activeSwipe(m);
      const next = JSON.parse(JSON.stringify(m));
      next.swipes[swIdx].stateCorrections = (next.swipes[swIdx].stateCorrections || []).concat(changes);
      await ctx.DB.put("messages", next);
      sw.stateCorrections = next.swipes[swIdx].stateCorrections;
      return { corrections: changes };
    }
    return { snapshot, context, observeMessage, correct };
  }
  PRP.stateService = { create };
})(typeof window !== "undefined" ? window : globalThis);
