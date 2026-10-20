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
    function updateUi() {
      // Раньше панель отрисовывалась ДО завершения служебного запроса и
      // продолжала показывать "неизвестно" даже после записи результата.
      if (ctx.svc.prism && typeof ctx.svc.prism.refresh === "function") ctx.svc.prism.refresh();
      if (ctx.ui) {
        if (typeof ctx.ui.renderHead === "function") ctx.ui.renderHead();
        if (S.drawerOpen && typeof ctx.ui.renderDrawer === "function") ctx.ui.renderDrawer();
      }
    }

    async function simpleWithLimit(provider, instruction) {
      // Служебный запрос не может бесконечно блокировать обычную переписку.
      // Таймаут не создаёт факты и не применяет запоздалый ответ.
      const maxMs = Math.max(300, Math.min(60000, Number(ctx.observerTimeoutMs) || 20000));
      let timer;
      try {
        return await Promise.race([
          PRP.llm.simple(provider, instruction, { maxTokens: 650 }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("превышено время ожидания " + maxMs + " мс")), maxMs); }),
        ]);
      } finally { clearTimeout(timer); }
    }

    async function observeMessage(msg, provider, opts) {
      const c = ctx.chat();
      if (!c || !msg || msg.chatId !== c.id || !["assistant", "user"].includes(msg.role)) return { skipped: "not-message" };
      const sw = TR.activeSwipe(msg), sourceText = String(sw.text || ""), swipeIdx = msg.swipeIdx || 0;
      if (!sourceText.trim()) return { skipped: "empty" };
      if (!INT.mayChangeState(sourceText)) return { skipped: "non-event-greeting" };
      if (sw.stateStatus && ["ok", "partial", "no-changes"].includes(sw.stateStatus.status) && sw.stateStatus.sourceText === sourceText && !(opts && opts.force)) return { skipped: "already-processed" };
      const initialPath = chat().path();
      if (!initialPath.includes(msg)) return { skipped: "off-path" };
      const originalKey = initialPath.map((m) => m.id + ":" + (m.swipeIdx || 0)).join(">");
      const chatId = c.id;
      const options = { mode: c.mode, role: msg.role, text: sourceText.slice(0, MAX_TEXT),
        speakerName: msg.role === "assistant" ? (ctx.card() || {}).name : (ctx.persona() || {}).name };
      let result = { valid: false, events: [], issues: ["Текстовая модель недоступна"] };
      if (provider) {
        try {
          const instruction = INT.instruction(options);
          const raw = await simpleWithLimit(provider, instruction);
          result = INT.parse(raw, options);
        } catch (e) {
          result = { valid: false, events: [], issues: ["Ошибка наблюдателя: " + String(e && e.message || e).slice(0, 200)] };
        }
      }
      // Высокоточные явные самоописания не должны исчезать только потому,
      // что Perchance вернул неполный JSON или не распознал простое предложение.
      // Более сложные случаи по-прежнему требуют модельного извлечения.
      const fallback = INT.grounded(sourceText.slice(0, MAX_TEXT), options);
      const events = result.events.slice();
      for (const e of fallback) if (!events.some((x) => x.actor === e.actor && x.field === e.field && x.certainty !== "intent")) events.push(e);
      if (!ctx.chat() || ctx.chat().id !== chatId || (msg.swipeIdx || 0) !== swipeIdx ||
          String(TR.activeSwipe(msg).text || "") !== sourceText ||
          chat().path().map((m) => m.id + ":" + (m.swipeIdx || 0)).join(">") !== originalKey) {
        return { skipped: "stale-branch" };
      }
      const status = !result.valid ? events.length ? "partial" : "error" : result.issues.length ? "partial" : events.length ? "ok" : "no-changes";
      const stateStatus = { status, sourceText, issues: result.issues, at: Date.now(),
        method: fallback.length ? "model+grounded" : "model", eventCount: events.length };
      const next = JSON.parse(JSON.stringify(msg));
      next.swipes[swipeIdx].stateEvents = events;
      next.swipes[swipeIdx].stateStatus = stateStatus;
      await ctx.DB.put("messages", next);
      sw.stateEvents = events;
      sw.stateStatus = stateStatus;
      updateUi();
      return { events, issues: result.issues, status };
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
