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

    // Bounded, read-only references: never copy another chat, a sibling swipe,
    // imported memory or a whole unbounded transcript into Observer.
    function observationContext(path, role) {
      const prior = Array.isArray(path) ? path : [];
      const state = snapshot(prior);
      const actor = role === "user" ? "user" : "char";
      return {
        recent: prior.slice(-5).map((m) => ({
          messageId: m.id, swipeIdx: m.swipeIdx || 0, role: m.role,
          text: String(TR.activeSwipe(m).text || "").slice(0, 500),
        })),
        references: TRACK.references(state, actor),
      };
    }
    function pathFingerprint(path) {
      // Including text and state events protects a contextual interpretation
      // against a changed ancestor swipe, edited text, or corrected garment.
      return JSON.stringify((path || []).map((m) => [
        m.id, m.swipeIdx || 0, TR.activeSwipe(m).text,
        TR.activeSwipe(m).stateEvents, TR.activeSwipe(m).stateCorrections,
        TR.activeSwipe(m).sceneOps,
      ]));
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

    // PERF-02B: model-only analysis can start while an earlier message is still
    // being observed. It never writes state; observeMessage validates the active
    // chat, path, swipe and text before any persistent commit.
    async function analyse(options, provider) {
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
      return result;
    }
    function prepareUser(text, provider) {
      const c = ctx.chat(), source = String(text || "");
      if (!c || !source.trim() || !INT.mayChangeState(source)) return null;
      const options = { mode: c.mode, role: "user", text: source.slice(0, MAX_TEXT),
        speakerName: (ctx.persona() || {}).name, ...observationContext(chat().path(), "user") };
      // A cancelled or stale turn simply discards this promise; it never commits.
      return { chatId: c.id, providerId: provider && provider.id, options, promise: analyse(options, provider) };
    }

    async function observeMessage(msg, provider, opts) {
      const c = ctx.chat();
      if (!c || !msg || msg.chatId !== c.id || !["assistant", "user"].includes(msg.role)) return { skipped: "not-message" };
      const sw = TR.activeSwipe(msg), sourceText = String(sw.text || ""), swipeIdx = msg.swipeIdx || 0;
      if (!sourceText.trim()) return { skipped: "empty" };
      if (!INT.mayChangeState(sourceText)) return { skipped: "non-event-greeting" };
      if (sw.stateStatus && ["ok", "partial", "no-changes"].includes(sw.stateStatus.status) && sw.stateStatus.sourceText === sourceText && !(opts && opts.force)) return { skipped: "already-processed" };
      const initialPath = chat().path();
      const index = initialPath.indexOf(msg);
      if (index < 0) return { skipped: "off-path" };
      const originalKey = pathFingerprint(initialPath);
      const chatId = c.id;
      const options = { mode: c.mode, role: msg.role, text: sourceText.slice(0, MAX_TEXT),
        speakerName: msg.role === "assistant" ? (ctx.card() || {}).name : (ctx.persona() || {}).name,
        ...observationContext(initialPath.slice(0, index), msg.role) };
      // Reuse a read-only early result only when its interpretation inputs still
      // match. Changed persona/mode/text cannot silently inherit stale events.
      const prepared = opts && opts.prepared;
      const sameInputs = prepared && prepared.chatId === msg.chatId &&
        prepared.providerId === (provider && provider.id) && prepared.options &&
        ["mode", "role", "text", "speakerName"].every((key) => prepared.options[key] === options[key]) &&
        JSON.stringify(prepared.options.recent) === JSON.stringify(options.recent);
      if (prepared && typeof console !== "undefined" && /Я снял шарф\./.test(sourceText)) {
        console.log("OBSERVER_DIFF_DEBUG", JSON.stringify({
          sameInputs: !!sameInputs, preparedChat: prepared.chatId, liveChat: msg.chatId,
          prepProv: prepared.providerId, liveProv: provider && provider.id,
          equal: ["mode","role","text","speakerName"].map(k => [k,prepared.options[k] === options[k]]),
          preRecent: prepared.options.recent, nowRecent: options.recent,
          preRefs: prepared.options.references, nowRefs: options.references
        }));
      }
      let result;
      if (sameInputs) {
        const early = await prepared.promise;
        const refsSame = JSON.stringify(prepared.options.references) === JSON.stringify(options.references);
        // PERF-02B: if the prior assistant's state finished meanwhile, reuse
        // an explicit, non-referential early result or even its error. Only
        // retry when newly available references could change an unresolved
        // interpretation, or a previously resolved reference became stale.
        const mayNeedReferences = early.valid && (early.events.some((e) => e.reference) ||
          early.issues.some((issue) => issue.startsWith("Неоднозначная ссылка:")));
        result = refsSame || !mayNeedReferences ? early : await analyse(options, provider);
      } else result = await analyse(options, provider);
      // Высокоточные явные самоописания не должны исчезать только потому,
      // что Perchance вернул неполный JSON или не распознал простое предложение.
      // Более сложные случаи по-прежнему требуют модельного извлечения.
      const fallback = INT.grounded(sourceText.slice(0, MAX_TEXT), options);
      const events = result.events.slice();
      // Compare common Russian inflections ('синяя куртка'/'синей куртке')
      // to avoid adding the same garment twice when model and fallback agree.
      const garmentKey = (value) => (String(value || "").toLowerCase().replace(/ё/g, "е")
        .match(/[\p{L}\p{N}]+/gu) || []).map((word) => word.length > 4
          ? word.replace(/(?:ого|ему|ому|ыми|ими|ая|яя|ый|ий|ой|ей|ие|ые|ую|юю|ых|их|ым|им|ом|ем|а|я|е|у|ю|ы|и)$/u, "")
          : word).join(" ");
      for (const e of fallback) {
        if (events.length >= INT.MAX) break;
        const sameField = events.filter((x) => x.actor === e.actor && x.field === e.field && x.certainty !== "intent");
        if (e.field === "wear" && e.action === "add" && Array.isArray(e.value)) {
          // A model may return one garment (or an invalid second garment).
          // Preserve correctly grounded items missing from that partial list;
          // don't discard all of fallback just because a wear field exists.
          const known = sameField.flatMap((x) => Array.isArray(x.value) ? x.value : []).map(garmentKey);
          const missing = e.value.filter((item) => !known.includes(garmentKey(item)));
          if (missing.length) events.push(Object.assign({}, e, { value: missing }));
        } else if (!sameField.length) events.push(e);
      }
      if (!ctx.chat() || ctx.chat().id !== chatId || (msg.swipeIdx || 0) !== swipeIdx ||
          String(TR.activeSwipe(msg).text || "") !== sourceText ||
          pathFingerprint(chat().path()) !== originalKey) {
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
    /* PERF-01: разбор сообщения как управляемая задача.
       • Одна задача на (чат, сообщение, свайп, текст): повторный вызов возвращает ту же.
       • Никогда не отклоняется: ошибка хранилища или наблюдателя → { error } (нет unhandled rejection).
       • Проверка актуальности — прежняя, внутри observeMessage; здесь не ослабляется.
       • S.tracking = есть незавершённые задачи (совместимость с панелью переписки).
       Ожидание ограничено таймаутом наблюдателя (simpleWithLimit) плюс запас в settle(). */
    const jobs = new Map();
    const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    const jobKey = (msg) => [msg.chatId, msg.id, msg.swipeIdx || 0, String(TR.activeSwipe(msg).text || "")].join("\u0001");
    function sync() {
      S.tracking = jobs.size > 0;
      if (ctx.ui && typeof ctx.ui.renderComposer === "function") ctx.ui.renderComposer();
    }
    function track(msg, provider, opts) {
      if (!msg || !msg.swipes) return Promise.resolve({ skipped: "not-message" });
      const k = jobKey(msg), existing = jobs.get(k);
      if (existing && !(opts && opts.force)) return existing.promise;
      const job = { key: k, chatId: msg.chatId, msgId: msg.id, role: msg.role, startedAt: now() };
      job.promise = Promise.resolve()
        .then(() => observeMessage(msg, provider, opts))
        .catch((e) => ({ error: String(e && e.message || e).slice(0, 200) }))
        .then((r) => {
          const res = r || {};
          // Тайминг — только числа и роль; без текста сообщения.
          res.ms = Math.round(now() - job.startedAt);
          if (typeof ctx.perf === "function") ctx.perf(msg.role === "user" ? "userStateMs" : "assistantStateMs", res.ms, { msgId: msg.id, chatId: msg.chatId, outcome: res.status || res.skipped || (res.error ? "error" : "") });
          return res;
        })
        .finally(() => { if (jobs.get(k) === job) jobs.delete(k); sync(); });
      jobs.set(k, job);
      sync();
      return job.promise;
    }
    // Сколько разборов этого чата ещё не завершено.
    function pending(chatId) { let n = 0; for (const j of jobs.values()) if (!chatId || j.chatId === chatId) n++; return n; }
    /* Дождаться всех разборов чата (и тех, что добавятся за время ожидания). Ограничено: каждый разбор
       сам ограничен таймаутом наблюдателя; settle добавляет общий предел и сообщает, если он истёк. */
    async function settle(chatId, maxMs) {
      const limit = Math.max(500, Number(maxMs) || (Math.max(300, Math.min(60000, Number(ctx.observerTimeoutMs) || 20000)) + 5000));
      const t0 = now();
      let timer;
      const deadline = new Promise((r) => { timer = setTimeout(() => r("timeout"), limit); });
      try {
        for (;;) {
          const list = [...jobs.values()].filter((j) => j.chatId === chatId).map((j) => j.promise);
          if (!list.length) return { waitedMs: Math.round(now() - t0), timedOut: false };
          if ((await Promise.race([Promise.all(list), deadline])) === "timeout") return { waitedMs: Math.round(now() - t0), timedOut: true };
        }
      } finally { clearTimeout(timer); }
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
    return { snapshot, context, prepareUser, observeMessage, track, pending, settle, correct };
  }
  PRP.stateService = { create };
})(typeof window !== "undefined" ? window : globalThis);
