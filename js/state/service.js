/* Prism RP — UT-1: автоматическая интерпретация сообщения и получение общего State Snapshot.
   Никаких фоновых таймеров и независимой среды для разных режимов. Результат наблюдателя
   сохраняется внутри выбранного свайпа; смена чата/ветки/текста до ответа отменяет запись.
*/
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, TRACK = PRP.stateTracker, INT = PRP.stateInterpreter, WI = PRP.wearInquiry;
  const MAX_TEXT = 4500;
  function create(ctx) {
    const { S } = ctx;
    const chat = () => ctx.svc.chat;
    const clock = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const measure = (metric, since, chatId, msgId, outcome) => {
      if (typeof ctx.perf === "function") ctx.perf(metric, clock() - since,
        { chatId, msgId, outcome });
    };

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
        charName: cd.name, userName: ctx.persona().name, legacyWorld: legacy, initialWear: c.initialWear });
    }

    function context(path, opts) {
      const state = snapshot(path, opts);
      return { state, character: TRACK.forCharacter(state), userView: TRACK.forUser(state, ctx.chat() && ctx.chat().mode),
        latestPhotoWear: TRACK.latestPhotoWear(path || chat().path()),
        latestAuthoredShot: TRACK.latestAuthoredShot(path || chat().path()) };
    }

    // InitialOutfit: invoked ONCE by new Messenger chat orchestration, after
    // environment setup and before presenting the empty chat. The RP provider
    // chooses the entire outfit. No hidden chat message, no parallel inventory.
    // A malformed/failed model response leaves wear UNKNOWN, never naked.
    const initializing = new Map();
    function initializeOutfit(provider, setup) {
      const c = ctx.chat(), card = ctx.card();
      if (!c || c.mode !== "messenger" || !card || c.cardId !== card.id || c.initialWear || chat().path().length ||
          (S.messages || []).length) return Promise.resolve({ status: "skipped" });
      if (snapshot([]).actors.char.wearState.known)
        return Promise.resolve({ status: "already-known" });
      if (!provider || !PRP.llm || typeof PRP.llm.simple !== "function")
        return Promise.resolve({ status: "unavailable" });
      if (initializing.has(c.id)) return initializing.get(c.id);
      const id = c.id, cardId = c.cardId;
      // Diagnostics are metadata on the new chat, never a second source
      // of outfit truth. Do not persist prompts, raw model outputs or secrets.
      async function failed(reason) {
        const current = ctx.chat();
        if (!current || current.id !== id || current.cardId !== cardId ||
            S.chatId !== id || S.cardId !== cardId || chat().path().length ||
            (S.messages || []).length || current.initialWear)
          return { status: "stale" };
        const next = Object.assign({}, current, {
          initialOutfitCheck: { status: "error", reason: String(reason).slice(0, 160) },
        });
        try { await ctx.DB.put("chats", next); Object.assign(current, next); }
        catch (_e) { /* Non-canonical diagnostics cannot block chat creation. */ }
        return { status: "error", reason };
      }
      const instruction = INT.initialOutfitInstruction(card, setup || {});
      const tokens = PRP.util && typeof PRP.util.estimateTokens === "function"
        ? PRP.util.estimateTokens(instruction) : Math.ceil(instruction.length / 3);
      if (tokens + 650 > (typeof ctx.contextTokens === "function" ? ctx.contextTokens() : 8192))
        return Promise.resolve({ status: "overflow" });
      const started = clock();
      const task = (async () => {
        let raw;
        try { raw = await simpleWithLimit(provider, instruction); }
        catch (e) {
          const message = String(e && e.message || e || "");
          return failed(/превышено время ожидания/i.test(message) ? "timeout"
            : /ai-text-plugin недоступен/i.test(message) ? "plugin-unavailable"
            : /\b(?:401|403|429)\b/.test(message) ? "provider-rejected"
            : "provider-error");
        }
        const parsed = INT.parseInitialOutfit(raw);
        if (parsed.error) return failed(parsed.error);
        const event = TRACK.normalize({
          actor: "char", field: "wear", action: parsed.worn.length ? "set" : "clear",
          ...(parsed.worn.length ? { value: parsed.worn } : {}),
          certainty: "reported", evidence: "",
        }, { role: "initial", mode: "messenger" });
        if (!event.event) return failed(event.error);
        // One origin event belongs to this exact new chat, never to a sibling
        // or to an already active conversation. A delayed response cannot
        // retroactively dress a character after the first message.
        const current = ctx.chat();
        if (!current || current.id !== id || current.cardId !== cardId ||
            S.chatId !== id || S.cardId !== cardId || !ctx.card() || ctx.card().id !== cardId ||
            current.initialWear || chat().path().length ||
            (S.messages || []).length || snapshot([]).actors.char.wearState.known)
          return { status: "stale" };
        const record = { schema: 1, kind: "initial-outfit", event: event.event };
        const next = Object.assign({}, current, { initialWear: record });
        try { await ctx.DB.put("chats", next); }
        catch (_e) { return { status: "error", reason: "storage" }; }
        Object.assign(current, next);
        if (ctx.svc.prism && typeof ctx.svc.prism.refresh === "function") ctx.svc.prism.refresh();
        return { status: "ok", worn: parsed.worn.length };
      })().then((result) => {
        measure("initialOutfitMs", started, id, "", result && result.status || "error");
        return result;
      }, (error) => {
        measure("initialOutfitMs", started, id, "", "error");
        throw error;
      }).finally(() => { if (initializing.get(id) === task) initializing.delete(id); });
      initializing.set(id, task);
      return task;
    }

    // Bounded, read-only references: never copy another chat, a sibling swipe,
    // imported memory or a whole unbounded transcript into Observer.
    function observationContext(path, role) {
      const prior = Array.isArray(path) ? path : [];
      const state = snapshot(prior);
      const actor = role === "user" ? "user" : "char";
      const previous = {};
      // State already derived from this exact branch. Use it only to decide
      // whether a completed action supersedes a previous activity/location,
      // never to invent an unobserved destination or promote Memory to fact.
      for (const field of ["location", "activity"]) {
        const datum = TRACK.fieldOf(state, actor, field);
        if (datum) previous[field] = { value: datum.value, certainty: datum.certainty };
      }
      return {
        previous,
        recent: prior.slice(-5).map((m) => ({
          messageId: m.id, swipeIdx: m.swipeIdx || 0, role: m.role,
          ...(TR.activeSwipe(m).messengerAt && TR.activeSwipe(m).messengerAt.at
            ? { at: String(TR.activeSwipe(m).messengerAt.at) } : {}),
          text: String(TR.activeSwipe(m).text || "").slice(0, 500),
          ...(m.role === "assistant" && Array.isArray(TR.activeSwipe(m).draws) &&
            TR.activeSwipe(m).draws.length && TR.activeSwipe(m).draws[TR.activeSwipe(m).draws.length - 1].prompt
            ? { draw: String(TR.activeSwipe(m).draws[TR.activeSwipe(m).draws.length - 1].prompt).slice(0, 400) } : {}),
        })),
        references: TRACK.references(state, actor, ["remove", "adjust", "add"]),
      };
    }
    function pathFingerprint(path) {
      // Including text and state events protects a contextual interpretation
      // against a changed ancestor swipe, edited text, or corrected garment.
      return JSON.stringify((path || []).map((m) => [
        m.id, m.swipeIdx || 0, TR.activeSwipe(m).text,
        TR.activeSwipe(m).stateEvents, TR.activeSwipe(m).stateCorrections,
        TR.activeSwipe(m).sceneOps, TR.activeSwipe(m).draws,
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
        if (S.modal && S.modal.kind === "debug" && ["wear", "tracker", "events", "errors"].includes(S.modal.section) &&
            typeof ctx.ui.renderModal === "function") {
          S.modal.keepScroll = true;
          ctx.ui.renderModal();
        }
      }
    }

    const OBSERVER_DEFAULT_MS = 40000;
    // Opening-chat outfit discovery keeps its original 20s bound; the
    // post-reply Observer can have more time without blocking the chat turn.
    function observerLimit(defaultMs) {
      return Math.max(300, Math.min(60000, Number(ctx.observerTimeoutMs) || defaultMs));
    }
    async function simpleWithLimit(provider, instruction, defaultMs) {
      // Служебный запрос не может бесконечно блокировать обычную переписку.
      // Таймаут не создаёт факты и не применяет запоздалый ответ.
      const maxMs = observerLimit(defaultMs || 20000);
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
        const chatId = (ctx.chat() || {}).id;
        const started = clock();
        try {
          const instruction = INT.instruction(options);
          const raw = await simpleWithLimit(provider, instruction, OBSERVER_DEFAULT_MS);
          result = INT.parse(raw, options);
        } catch (e) {
          result = { valid: false, events: [], issues: ["Ошибка наблюдателя: " + String(e && e.message || e).slice(0, 200)] };
        } finally {
          measure("observerModelMs", started, chatId, options && options.messageId || "",
            result.valid ? "accepted" : "error");
        }
      }
      return result;
    }
    // A narrow second call to the RP provider is warranted only when an
    // authored DRAW reports new clothing, while formerly known clothing may
    // conflict or have hidden layers. Failure leaves the Observer events as-is.
    async function inquireWear(o) {
      if (!WI || !WI.needed(o) || !PRP.llm || typeof PRP.llm.simple !== "function")
        return { skipped: "not-needed" };
      const roleProvider = typeof ctx.provider === "function" ? ctx.provider() : null;
      if (!roleProvider) return { skipped: "no-rp-provider" };
      const instruction = WI.instruction(o);
      const tokens = PRP.util && typeof PRP.util.estimateTokens === "function"
        ? PRP.util.estimateTokens(instruction) : Math.ceil(instruction.length / 3);
      if (tokens + 450 > (typeof ctx.contextTokens === "function" ? ctx.contextTokens() : 8192))
        return { skipped: "budget" };
      let timer, outcome = "error";
      const started = clock(), chatId = (ctx.chat() || {}).id;
      try {
        const raw = await Promise.race([
          PRP.llm.simple(roleProvider, instruction, { maxTokens: 450 }),
          new Promise((_,reject) => { timer=setTimeout(() => reject(new Error("timeout")), 10000); })
        ]);
        const parsed = WI.parse(raw, o);
        outcome = parsed.answer ? "accepted" : parsed.error || "invalid";
        return parsed;
      } catch(e) {
        const error = String(e && e.message || e).slice(0,100);
        outcome = error === "timeout" ? "timeout" : "error";
        return { error };
      } finally {
        clearTimeout(timer);
        measure("wearInquiryMs", started, chatId, o && o.messageId || "", outcome);
      }
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
      // Only a current assistant-authored [draw:] is observational evidence;
      // manual image prompts, rewritten tags and backend pixels never feed canon.
      // Continue may append a newer shot within the same swipe. The latest
      // authored draw is the current observation; all source draws stay in
      // the original swipe for exact evidence/provenance replay.
      const lastDraw = msg.role === "assistant" && Array.isArray(sw.draws) && sw.draws.length
        ? sw.draws[sw.draws.length - 1] : null;
      const sourceDraw = lastDraw ? String(lastDraw.prompt || "") : "";
      if (!sourceText.trim() && !sourceDraw.trim()) return { skipped: "empty" };
      if (!sourceDraw && !INT.mayChangeState(sourceText)) return { skipped: "non-event-greeting" };
      if (sw.stateStatus && ["ok", "partial", "no-changes"].includes(sw.stateStatus.status) &&
          sw.stateStatus.sourceText === sourceText && (sw.stateStatus.sourceDraw || "") === sourceDraw &&
          !(opts && opts.force)) return { skipped: "already-processed" };
      const initialPath = chat().path();
      const index = initialPath.indexOf(msg);
      if (index < 0) return { skipped: "off-path" };
      const originalKey = pathFingerprint(initialPath);
      const chatId = c.id;
      // VC-04: continued swipes contain several authored photographs. Preserve
      // ONLY previously interpreted, source-bound visual facts whose exact
      // prior draw still exists. The latest observer still interprets only
      // the newest photograph, and an old crop cannot become new authority.
      // Legacy stateEvents without a matching earlier stateStatus are never
      // promoted into historical events.
      const draws = msg.role === "assistant" && Array.isArray(sw.draws) ? sw.draws : [];
      const latestIndex = draws.length - 1;
      const priorStatus = sw.stateStatus;
      const archivedDrawEvents = [];
      const archivedWearInquiries = [];
      let previousIndex = -1;
      if (latestIndex > 0 && priorStatus &&
          ["ok", "partial", "no-changes"].includes(priorStatus.status) &&
          typeof priorStatus.sourceText === "string" &&
          sourceText.startsWith(priorStatus.sourceText) &&
          typeof priorStatus.sourceDraw === "string") {
        const candidates = draws.slice(0, -1).map((d, i) =>
          d && String(d.prompt || "") === priorStatus.sourceDraw ? i : -1).filter(i => i >= 0);
        previousIndex = Number.isInteger(priorStatus.sourceDrawIndex)
          ? priorStatus.sourceDrawIndex
          : candidates.length === 1 ? candidates[0] : -1;
        if (previousIndex >= 0 && previousIndex < latestIndex &&
            draws[previousIndex] && String(draws[previousIndex].prompt || "") === priorStatus.sourceDraw) {
          for (const note of Array.isArray(sw.wearInquiries) ? sw.wearInquiries : []) {
            const d = note && draws[note.drawIndex];
            if (note && note.schema === 1 && Number.isInteger(note.drawIndex) &&
                note.drawIndex <= previousIndex && d &&
                note.sourceDraw === String(d.prompt || "") &&
                typeof note.sourceText === "string" &&
                sourceText.startsWith(note.sourceText)) archivedWearInquiries.push(note);
          }
          for (const event of Array.isArray(sw.stateEvents) ? sw.stateEvents : []) {
            if (!event || event.certainty === "intent") continue;
            const drawIndex = event.drawIndex == null ? previousIndex : event.drawIndex;
            const exactDraw = draws[drawIndex];
            if (!Number.isInteger(drawIndex) || drawIndex < 0 || drawIndex > previousIndex ||
                !exactDraw || typeof exactDraw.prompt !== "string") continue;
            if (event.evidenceType === "draw" && event.evidence &&
                exactDraw.prompt.includes(event.evidence))
              archivedDrawEvents.push({ ...event, drawIndex });
            else if (event.evidenceType === "wear-inquiry" &&
                !TRACK.normalize(event, { role: msg.role, mode: c.mode,
                  text: sourceText, draws, wearInquiries: archivedWearInquiries }).error)
              archivedDrawEvents.push({ ...event, drawIndex });
          }
        }
      }
      // Same-swipe photo history is valid local context for references, but
      // never an extra instruction or independently persisted inventory.
      // Build a bounded *read-only* intermediate snapshot using only the
      // exact previously verified photo events; do not pull future text or
      // later Scene directives back into that earlier moment.
      const contextual = observationContext(initialPath.slice(0, index), msg.role);
      let priorDrawState = null;
      if (previousIndex >= 0 && archivedDrawEvents.length) {
        const priorMessage = {
          id: msg.id, chatId: msg.chatId, parentId: msg.parentId,
          role: msg.role, swipeIdx: 0,
          swipes: [{
            text: priorStatus.sourceText,
            draws: draws.slice(0, previousIndex + 1),
            sceneOps: [], stateCorrections: [],
            stateEvents: archivedDrawEvents.slice(-32),
            wearInquiries: archivedWearInquiries,
          }],
        };
        const localState = snapshot(initialPath.slice(0, index).concat([priorMessage]));
        priorDrawState = localState;
        contextual.references = TRACK.references(localState, "char", ["remove", "adjust", "add"]);
      }
      const options = { mode: c.mode, role: msg.role, text: sourceText.slice(0, MAX_TEXT),
        ...(sourceDraw ? { draw: sourceDraw.slice(0, 1600), draws: [{ prompt: sourceDraw }] } : {}),
        speakerName: msg.role === "assistant" ? (ctx.card() || {}).name : (ctx.persona() || {}).name,
        ...contextual };
      // Reuse a read-only early result only when its interpretation inputs still
      // match. Changed persona/mode/text cannot silently inherit stale events.
      const prepared = opts && opts.prepared;
      const sameInputs = prepared && prepared.chatId === msg.chatId &&
        prepared.providerId === (provider && provider.id) && prepared.options &&
        ["mode", "role", "text", "draw", "speakerName"].every((key) => prepared.options[key] === options[key]) &&
        JSON.stringify(prepared.options.recent) === JSON.stringify(options.recent);
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
      // Fallback never invents frame objects; semantic photo references
      // are determined only by the validated main Observer result.
      const fallback = INT.grounded(sourceText.slice(0, MAX_TEXT), options);
      // Grounded fallback intentionally reads only text. Image descriptions
      // are interpreted by the SAME Observer and independently verified
      // against their exact draw evidence on every StateTracker fold.
      const currentEvents = result.events.map((e) => e.evidenceType === "draw" && latestIndex > 0
        ? { ...e, drawIndex: latestIndex } : e);
      const events = currentEvents.slice();
      let wearInquiries = archivedWearInquiries.slice();
      // Diagnostic metadata only: never treat the status as a clothing fact.
      // Unlike successful normalized inquiry answers, failures/skips have
      // previously been invisible to the person testing the RP provider.
      let wearInquiryStatus = {
        status: "skipped", reason: !sourceDraw ? "no-draw"
          : msg.role !== "assistant" ? "not-author"
          : sourceDraw.length > 1600 ? "draw-too-long"
          : !result.valid ? "observer-failed"
          : wearInquiries.length >= 8 ? "inquiry-limit"
          : "not-eligible",
        drawIndex: latestIndex,
      };
      // Separate hidden self-report only after a positive, verified current
      // DRAW garment change. No report is created by a mere crop/portrait.
      if (sourceDraw && sourceDraw.length <= 1600 &&
          msg.role === "assistant" && result.valid && wearInquiries.length < 8) {
        const previousWear = (priorDrawState ||
          snapshot(initialPath.slice(0,index))).actors.char.wearState;
        const probe = await inquireWear({
          messageId: msg.id, mode: c.mode, role: msg.role, draw: sourceDraw.slice(0,1600),
          drawIndex: latestIndex, text: sourceText.slice(0,400),
          sourceText, character: (ctx.card()||{}).name,
          previous: previousWear,
          visible: currentEvents.filter(e => e.field === "wear" &&
            e.evidenceType === "draw" && e.action === "add")
            .flatMap(e => e.value || []).slice(0,12),
          events: currentEvents,
        });
        if (probe.answer) {
          wearInquiries.push(probe.answer);
          wearInquiryStatus = { status: "ok", drawIndex: latestIndex };
          const newEvents = WI.events(probe.answer).filter(e =>
            !TRACK.normalize(e, { role: msg.role, mode: c.mode,
              text: sourceText, draws, wearInquiries }).error);
          events.push(...newEvents);
        } else if (probe.skipped) {
          wearInquiryStatus = { status: "skipped", reason: probe.skipped,
            drawIndex: latestIndex };
        } else if (probe.error) {
          wearInquiryStatus = { status: "error",
            reason: String(probe.error).slice(0, 100), drawIndex: latestIndex };
          result.issues.push("Уточнение одежды: " + probe.error);
        }
      }
      // Prior snapshots are evidence, not an unbounded event log. Bound the
      // archival slice, report truncation and never override a fresh event.
      const MAX_ARCHIVED_DRAW_EVENTS = 32;
      const retained = archivedDrawEvents.slice(-MAX_ARCHIVED_DRAW_EVENTS);
      events.push(...retained);

      // Compare common Russian inflections ('синяя куртка'/'синей куртке')
      // to avoid adding the same garment twice when model and fallback agree.
      const garmentKey = (value) => (String(value || "").toLowerCase().replace(/ё/g, "е")
        .match(/[\p{L}\p{N}]+/gu) || []).map((word) => word.length > 4
          ? word.replace(/(?:ого|ему|ому|ыми|ими|ая|яя|ый|ий|ой|ей|ие|ые|ую|юю|ых|их|ым|им|ом|ем|а|я|е|у|ю|ы|и)$/u, "")
          : word).join(" ");
      // Fallback is lexical Russian text extraction, not a bilingual item
      // identity resolver. A confirmed current visual removal/adjustment must
      // not be undone by an uncorrelated fallback "wear.add" derived from
      // caption words (e.g. шорты vs shorts). The primary Observer can still
      // report independently grounded compatible text facts; don't guess.
      const visualChange = result.events.some((e) => e.actor === "char" &&
        e.field === "wear" && e.evidenceType === "draw" &&
        ["set", "clear", "remove", "adjust", "invalidate"].includes(e.action));
      // An authoritative current outfit replacement must not be followed by a
      // lexical fallback that re-adds garments from the pre-replacement text.
      const outfitReplaced = result.events.some((e) => e.field === "wear" &&
        e.certainty !== "intent" && ["set", "clear", "invalidate"].includes(e.action));
      for (const e of fallback) {
        if (events.length >= INT.MAX) break;
        if ((visualChange || outfitReplaced) && e.field === "wear") continue;
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
      // One message may assert clothing both in its caption and in the photo.
      // Apply text observations first; the intentional current photo is the
      // later visual observation of that same moment. Neither is a second
      // canonical store. Preserve relative ordering within each evidence kind.
      // Text is processed first as before; visual events follow the exact
      // photo order so the newest explicit observation wins only on its item.
      const drawOrder = (event) => ["draw","wear-inquiry"].includes(event.evidenceType)
        ? (event.drawIndex == null ? latestIndex : event.drawIndex) : -1;
      const phase = (event) => event.evidenceType === "wear-inquiry" &&
        event.action === "invalidate" ? -1 :
        event.evidenceType === "wear-inquiry" ? 1 : 0;
      events.sort((a, b) => drawOrder(a) - drawOrder(b) || phase(a) - phase(b));
      if (!ctx.chat() || ctx.chat().id !== chatId || (msg.swipeIdx || 0) !== swipeIdx ||
          String(TR.activeSwipe(msg).text || "") !== sourceText ||
          pathFingerprint(chat().path()) !== originalKey) {
        return { skipped: "stale-branch" };
      }
      const issues = result.issues.slice();
      if (archivedDrawEvents.length > MAX_ARCHIVED_DRAW_EVENTS)
        issues.push("Лимит архивных draw-событий: предыдущие факты требуют ручной проверки");
      const status = !result.valid ? events.length ? "partial" : "error" : issues.length ? "partial" : events.length ? "ok" : "no-changes";
      const stateStatus = { status, sourceText, sourceDraw, sourceDrawIndex: latestIndex,
        issues, at: Date.now(),
        method: fallback.length ? "model+grounded" : "model", eventCount: events.length,
        // Current-swipe, bounded diagnostics only; failed model guesses never
        // become state events, memory, instructions or a separate garment DB.
        rejectedObservations: Array.isArray(result.rejectedObservations)
          ? result.rejectedObservations.slice(0, INT.MAX) : [],
        wearInquiry: wearInquiryStatus,
        // Shot-local provenance, not wardrobe state. Same-swipe image use only.
        frameObjects: Array.isArray(result.frameObjects) ? result.frameObjects.slice(0, INT.MAX) : [] };
      const next = JSON.parse(JSON.stringify(msg));
      next.swipes[swipeIdx].stateEvents = events;
      next.swipes[swipeIdx].wearInquiries = wearInquiries;
      next.swipes[swipeIdx].stateStatus = stateStatus;
      await ctx.DB.put("messages", next);
      sw.stateEvents = events;
      sw.wearInquiries = wearInquiries;
      sw.stateStatus = stateStatus;
      updateUi();
      return { events, issues, status };
    }
    /* PERF-01: разбор сообщения как управляемая задача.
       • Одна задача на (чат, сообщение, свайп, текст): повторный вызов возвращает ту же.
       • Никогда не отклоняется: ошибка хранилища или наблюдателя → { error } (нет unhandled rejection).
       • Проверка актуальности — прежняя, внутри observeMessage; здесь не ослабляется.
       • S.tracking = есть незавершённые задачи (совместимость с панелью переписки).
       Ожидание ограничено таймаутом наблюдателя (simpleWithLimit) плюс запас в settle(). */
    const jobs = new Map();
    const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    const jobKey = (msg) => [msg.chatId, msg.id, msg.swipeIdx || 0, String(TR.activeSwipe(msg).text || ""),
      msg.role === "assistant" ? JSON.stringify(TR.activeSwipe(msg).draws || []) : ""].join("\u0001");
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
      const limit = Math.max(500, Number(maxMs) || (observerLimit(OBSERVER_DEFAULT_MS) + 15000));
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
    // Developer-only read: replay precisely the selected path; never persist a
    // second garment inventory or reinterpret the source narrative.
    function debugWear(path) {
      const c = ctx.chat();
      if (!c) return null;
      const p = Array.isArray(path) ? path : chat().path();
      const origin = snapshot([]);
      const current = snapshot(p);
      const relevant = (e) => e && e.actor === "char" && e.field === "wear";
      const candidates = [];
      for (let i = 0; i < p.length; i++) {
        const msg = p[i], sw = TR.activeSwipe(msg);
        const events = (sw.stateEvents || []).filter(relevant);
        const corrections = (sw.stateCorrections || []).filter(relevant);
        const status = sw.stateStatus || null;
        const rejected = status && Array.isArray(status.rejectedObservations)
          ? status.rejectedObservations.filter(x => x && (x.field === "wear" || x.action)) : [];
        if (!events.length && !corrections.length && !rejected.length &&
            !(status && ["error", "partial"].includes(status.status))) continue;
        candidates.push({ index: i, messageId: msg.id, swipeIdx: msg.swipeIdx || 0,
          role: msg.role, events, corrections, rejected,
          status: status ? { status: status.status, method: status.method,
            issues: (status.issues || []).slice(0, 8), wearInquiry: status.wearInquiry || null } : null });
      }
      const changes = candidates.slice(-20).map(entry => {
        const before = snapshot(p.slice(0, entry.index)).actors.char.wearState;
        const after = snapshot(p.slice(0, entry.index + 1));
        return { ...entry, before, after: after.actors.char.wearState,
          replayIssues: after.diagnostics.filter(x => x && x.source === entry.messageId).slice(-8) };
      }).reverse();
      const recent = p.slice(-10).map(msg => {
        const sw = TR.activeSwipe(msg), s = sw.stateStatus;
        return { messageId: msg.id, swipeIdx: msg.swipeIdx || 0, role: msg.role,
          status: s ? s.status : "not-analysed", eventCount: s ? s.eventCount : null,
          method: s && s.method || "", issues: s && Array.isArray(s.issues) ? s.issues.slice(0, 5) : [],
          wearInquiry: s && s.wearInquiry || null };
      }).reverse();
      return { mode: c.mode, origin: c.initialWear || null,
        sceneInit: c.mode === "rp" ? String(c.sceneInit || "") : "",
        baseline: origin.actors.char.wearState, current: current.actors.char.wearState,
        replayIssues: current.diagnostics.slice(-12), changes, changeCount: candidates.length, recent };
    }

    return { snapshot, context, initializeOutfit, prepareUser, observeMessage, track, pending, settle, correct, debugWear };
  }
  PRP.stateService = { create };
})(typeof window !== "undefined" ? window : globalThis);
