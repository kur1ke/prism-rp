/* Prism RP — картинки в чате (прикладной уровень).
   Порядок: промпт из сцены (compose) → перевод текстовой моделью (compile, через PRP.llm)
   → финальная сборка (finalise) → бэкенд (backends) → сохранение картинки.
   Также: загрузка картинок чата, восстановление прерванного рисования, списки с сервера A1111.
   Перерисовка — через порт ctx.ui. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, IC = PRP.imgCompose, ICP = PRP.imgCompile, IB = PRP.imgBackends, ST = PRP.settings, LLM = PRP.llm, SR = PRP.stateResolver, VP = PRP.visualPlan, TRACK = PRP.stateTracker;

    // В мессенджере цель отправленного изображения определяется не только последним
    // ответом персонажа: он может отвечать на вопрос несколькими репликами.
    // Это контекст ОДНОГО кадра, не новый физический факт и не stateEvents.
    function dialogueImageContext(path, msg) {
      const p = Array.isArray(path) ? path : [];
      const index = p.indexOf(msg);
      if (index < 0 || !msg || msg.role !== "assistant") return "";
      const before = p.slice(Math.max(0, index - 7), index);
      const lastUser = before.map((m, i) => m.role === "user" ? i : -1).filter((i) => i >= 0).pop();
      if (lastUser === undefined) return "";
      const chosen = before.slice(Math.max(0, lastUser - 3)).filter((m) => m.role === "user" || m.role === "assistant");
      const entries = chosen.map((m) => {
        const sw = TR.activeSwipe(m);
        const line = String(sw && sw.text || "").replace(/\[[^\]\n]{0,30}:[^\]]*\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 260);
        return line ? (m.role === "user" ? "Собеседник: " : "Персонаж: ") + line : "";
      }).filter(Boolean);
      return entries.join("\n").slice(-1100);
    }

  // A model-authored [draw:] is already the decided shot. Do not pass earlier
  // dialogue into the prompt rewriter: it can reinterpret an unrelated camera
  // angle, replace the subject, or override a deliberate refusal/tease.
  function shouldAppendDialogue(sw, entry) {
    const draws = sw && Array.isArray(sw.draws) ? sw.draws : [];
    return !draws.some((d) => String(d && d.prompt || "").trim() === String(entry && entry.draw || "").trim());
  }

  // Only the inputs determining branch-specific physical/scene state. Images
  // and transient image status are deliberately excluded from this fingerprint.
  function stateVersion(message, selectedSwipe, shotOnly) {
    if (!message || !Array.isArray(message.swipes)) return "";
    const index = selectedSwipe == null ? (message.swipeIdx || 0) : selectedSwipe;
    const sw = message.swipes[index];
    if (!sw) return "";
    const shot = [message.id, message.chatId, message.parentId || null, index, sw.text, sw.draws];
    // The character has already authored this exact photograph. Changes to
    // an Observer's inferred facts do not invalidate the photo itself.
    return JSON.stringify(shotOnly ? shot : shot.concat([
      sw.sceneOps, sw.stateEvents, sw.stateCorrections, sw.messengerAt,
      sw.stateStatus && sw.stateStatus.frameObjects,
    ]));
  }

  async function sourceStillCurrent(DB, origin, shotOnly) {
    const live = await DB.get("messages", origin.messageId);
    if (!live || live.chatId !== origin.chatId) return false;
    return stateVersion(live, origin.swipeIdx, shotOnly) ===
      (shotOnly ? origin.sourceDrawVersion : origin.sourceStateVersion);
  }

  async function imageOriginStillCurrent(DB, origin, shotOnly) {
    const before = origin.path.slice(0, -1);
    const live = await Promise.all(before.map((m) => DB.get("messages", m.id)));
    return before.every((m, i) => live[i] && stateVersion(live[i], null, shotOnly) === stateVersion(m, null, shotOnly));
  }

  // Capture the selected swipe and its ancestry once, before any async request.
  // This is a read-only generation source, NOT a new visual/canonical state.
  function imageOrigin(messages, msg, sw, chatId) {
    const source = (messages || []).find((m) => m.id === (msg && msg.id) && m.chatId === chatId);
    if (!source || source !== msg || !Array.isArray(source.swipes)) return null;
    const swipeIdx = source.swipes.indexOf(sw);
    if (swipeIdx < 0) return null;
    const path = TR.path(TR.index(messages), source.id);
    if (!path.length || path[path.length - 1] !== source || path.some((m) => m.chatId !== chatId)) return null;
    const frozen = JSON.parse(JSON.stringify(path));
    frozen[frozen.length - 1].swipeIdx = swipeIdx;
    return { chatId, messageId: source.id, swipeIdx, sourceText: String(sw.text || ""),
      sourceStateVersion: stateVersion(frozen[frozen.length - 1], swipeIdx),
      sourceDrawVersion: stateVersion(frozen[frozen.length - 1], swipeIdx, true), path: frozen };
  }

  function create(ctx) {
    const { S, DB, ui } = ctx;
    const chat = () => ctx.svc.chat;
    const clock = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const perf = (metric, started, origin, outcome) => {
      if (typeof ctx.perf === "function") ctx.perf(metric, clock() - started,
        { chatId: origin.chatId, msgId: origin.messageId, outcome });
    };

    function textGen(instruction) { return LLM.simple(ctx.processingProvider ? ctx.processingProvider() : ctx.provider(), instruction); }

    // Подсказка переводчику: кто это и какие теги уже добавятся сами.
    function identityFor(cd) {
      const im = cd.image || {};
      const bits = ["name: " + cd.name];
      if (im.trigger) bits.push("already injected later (do NOT repeat these tags): " + im.trigger);
      const base = IC.parseMap(im.look).filter((e) => /^(|base|always)$/i.test(e.key)).map((e) => e.tags).join(", ");
      if (base) bits.push("look: " + base);
      return bits.join("\n");
    }

    // Картинки чата в память; рисование, прерванное закрытием страницы, не должно висеть «в работе».
    async function loadForChat(chatId) {
      S.imgUrls = {};
      (await DB.byIndex("images", "chatId", chatId)).forEach((x) => (S.imgUrls[x.id] = x.dataUrl));
      for (const msg of S.messages) for (const sw of msg.swipes) for (const im of sw.images || []) {
        if (im.status === "pending" && !S.drawing.has(im.id)) { im.status = "error"; im.error = "Рисование прервано. Попробуйте ещё раз."; }
      }
    }

    // reuse — существующая запись картинки (перерисовать); opts.seed — свой seed.
    async function draw(msg, sw, d, reuse, opts) {
      const o = opts || {};
      const prepT0 = clock(); // PERF-03: covers completed and failed preparation
      const currentChat = ctx.chat();
      const origin = currentChat && imageOrigin(S.messages, msg, sw, currentChat.id);
      if (!origin) { ui.toast("Исходное сообщение или свайп недоступны для изображения.", true); return; }
      const cfg = JSON.parse(JSON.stringify(S.settings.images)), cd = JSON.parse(JSON.stringify(ctx.card()));
      const pers = JSON.parse(JSON.stringify(ctx.persona()));
      // Snapshot the processing provider for the whole image operation; RP model remains independent.
      const provider = ctx.processingProvider ? ctx.processingProvider() : ctx.provider();
      const generateText = async (instruction) => {
        const started = clock();
        let outcome = "ok";
        try { return await LLM.simple(provider, instruction); }
        catch (e) { outcome = "error"; throw e; }
        finally { perf("imageTranslateMs", started, origin, outcome); }
      };
      const measuredCompile = async (scene, options) => {
        const started = clock();
        let outcome = "error";
        try {
          const result = await ICP.compile(scene, options, generateText);
          outcome = result.compiled ? result.cached ? "cached" : "compiled"
            : result.error ? "error" : "bypass";
          return result;
        } finally { perf("imageCompileMs", started, origin, outcome); }
      };
      if (!cfg.enabled) { ui.toast("Картинки выключены. Включите их в «Настройки → Изображения».", true); return; }
      if (cfg.backend === "perchance" && !IB.available("perchance")) { ui.toast("Рисование через Perchance доступно только в генераторе на Perchance. Выберите Forge/A1111 или API.", true); ui.openSettings("images"); return; }
      if (cfg.backend !== "perchance" && !String(cfg.url || "").trim()) { ui.toast("Укажите адрес сервера изображений.", true); ui.openSettings("images"); return; }
      const originSwipe = TR.activeSwipe(origin.path[origin.path.length - 1]);
      const authorDraws = Array.isArray(originSwipe.draws) ? originSwipe.draws : [];
      const selectedDraw = String(reuse ? reuse.draw : d.prompt || "");
      const selectedRatio = String((reuse ? reuse.ratio : d.ratio) || "1:1");
      const matching = authorDraws.map((x, i) => x &&
        String(x.prompt || "") === selectedDraw && String(x.ratio || "1:1") === selectedRatio ? i : -1)
        .filter((i) => i >= 0);
      // Duplicate author photos are ambiguous unless the original image is
      // explicitly pinned to one photo index. The caller may pass the exact
      // authored draw object to disambiguate a newly requested image.
      const providedIndex = !reuse && Array.isArray(sw.draws) ? sw.draws.indexOf(d) : -1;
      const pinnedIndex = reuse && Number.isInteger(reuse.sourceDrawIndex)
        ? reuse.sourceDrawIndex : providedIndex;
      const authoredIndex = pinnedIndex >= 0
        ? (matching.includes(pinnedIndex) ? pinnedIndex : -1)
        : matching.length === 1 ? matching[0] : -1;
      const drawAuthored = authoredIndex >= 0;
      // Historical authored photo: derive a read-only source snapshot from
      // this exact swipe's indexed photo events. Do not borrow the final photo's
      // garment state. Ambiguous narration/Scene/corrections fail closed.
      const historical = drawAuthored && authoredIndex !== authorDraws.length - 1
        ? TRACK.historicalDrawPath(origin.path, authoredIndex) : null;
      if (historical && !historical.ok) {
        ui.toast("Нельзя достоверно восстановить одежду на момент прежнего кадра (" +
          historical.reason + "). Рисование отменено.", true);
        return;
      }
      if (matching.length > 1 && !drawAuthored) {
        ui.toast("Невозможно определить исходный Draw среди одинаковых снимков. Рисование отменено.", true);
        return;
      }
      if (reuse && Number.isInteger(reuse.sourceDrawIndex) && !drawAuthored) {
        ui.toast("Исходный Draw этого изображения изменён. Повторное рисование отменено.", true);
        return;
      }
      const entry = reuse || { id: U.uid("img"), draw: d.prompt, ratio: d.ratio || "1:1",
        fromMessage: drawAuthored || !!d.fromMessage,
        ...(drawAuthored ? { sourceDrawIndex: authoredIndex } : {}) };
      if (S.drawing.has(entry.id)) { ui.toast("Это изображение уже генерируется.", true); return; }
      // Regeneration retains the source image's mode instead of silently
      // converting an older tagged/intent image using today's settings.
      const savedMode = reuse && (reuse.drawPromptMode || reuse.promptSources && reuse.promptSources.drawPromptMode);
      const drawMode = ["tags", "intent", "hybrid"].includes(savedMode) ? savedMode :
        ["tags", "intent", "hybrid"].includes(cfg.drawPromptMode) ? cfg.drawPromptMode : "tags";
      if (!reuse) {
        entry.intentMode = !!(drawAuthored && drawMode !== "tags");
        entry.drawPromptMode = drawMode;
      }
      // Resolve physical state from the frozen origin path BEFORE the first await.
      // Do not let a later UI branch/chat selection change this image's source.
      const upto = historical ? historical.path : origin.path;
      const sourceMsg = upto[upto.length - 1];
      const sourceSwipe = TR.activeSwipe(sourceMsg);
      const ms = currentChat.mode === "messenger" && ctx.svc.messenger;
      const stamped = sourceSwipe.messengerAt && sourceSwipe.messengerAt.world;
      if (historical && !ctx.svc.state) {
        ui.toast("Для восстановления прежнего кадра необходим StateTracker.", true);
        return;
      }
      const snap = ctx.svc.state ? ctx.svc.state.context(upto, { legacyWorld: ms ? (stamped || null) : undefined }) : null;
      if (historical && snap && snap.state && (snap.state.diagnostics || []).some(x => x.source === origin.messageId)) {
        ui.toast("Историческое состояние снимка содержит неподтверждённые события. Рисование отменено.", true);
        return;
      }
      // The frozen image-origin path is authoritative. Use the same
      // projection as Prism; do not mutate the folded StateTracker snapshot.
      const projected = SR.resolve({
        tracked: snap, scene: snap ? snap.state.scene : chat().sceneState(upto),
        names: { char: cd.name, user: pers.name },
      });
      const st = projected.scene;
      let visual = ms ? (snap ? snap.character : (stamped || { location: null, visualWear: [], visualPose: null, visualHair: null })) : null;
      if (!snap && ms && visual) {
        st.chars = st.chars || {};
        st.chars[cd.name] = { wear: visual.visualWear || [], pose: visual.visualPose || "", visualHair: visual.visualHair || "", mood: "" };
      }
      Object.assign(entry, { status: "pending", stage: "Готовлю промпт…" });
      delete entry.error;
      delete entry.translationFailure;
      if (!reuse) (sw.images = sw.images || []).push(entry);
      S.drawing.add(entry.id);
      const repaint = () => { if (ctx.chat() && ctx.chat().id === origin.chatId) ui.renderFeed(); };
      // Persist only the image entry; never repopulate the active chat's message list.
      await DB.put("messages", msg);
      repaint();
      let finalPatch, imageData, translationFailure;
      let preparationRecorded = false;
      const finishPreparation = (outcome) => {
        if (preparationRecorded) return;
        preparationRecorded = true;
        perf("imagePrepareMs", prepT0, origin, outcome);
      };
      let shotOnlyGate = drawAuthored;
      try {
        const intent = !!entry.intentMode;
        const hybrid = intent && drawAuthored && drawMode === "hybrid";
        const shot = String(entry.draw || "");
        // VC-01: the canonical snapshot already includes this accepted message's
        // validated Observer events. It is END-OF-TURN, not stale pre-shot wear.
        // The first (and only) intent translation must receive those facts.
        // Subject scoping happens on the ORIGINAL authored shot, before a
        // translator can hallucinate the card owner into a product screenshot.
        const shotActors = IC.frameActors(cd, pers, shot, { requireNamedOwner: true,
          requireNamedUser: currentChat.mode === "messenger" });
        // A current authored selfie need not repeat the card owner's name.
        // Do not infer the owner from a mere portrait or screenshot.
        const currentSelfie = drawAuthored &&
          /(?:\bmy\s+selfie\b|\btaking\s+(?:a\s+)?selfie\b|\bselfie\s+of\s+myself\b|(?:^|[\s,;:])я\s+[^.!?]{0,60}селфи|(?:^|[\s,;:])сво[её]\s+селфи)/iu.test(shot) &&
          !/(?:скриншот|screenshot|чужое\s+селфи|someone\s+else)/iu.test(shot) &&
          !shotActors.empty && !shotActors.userNamed;
        // Use only Observer metadata tied to the exact active authored shot.
        // Rewrites, stale statuses, manual prompts and older continued photos
        // never supply canonical frame roles.
        const frameStatus = sourceSwipe.stateStatus;
        const verifiedFrameObjects = drawAuthored && frameStatus &&
          frameStatus.sourceDraw === String(entry.draw || "") &&
          frameStatus.sourceText === String(sourceSwipe.text || "") &&
          Array.isArray(frameStatus.frameObjects) ? frameStatus.frameObjects : [];
        // Lock the authored frame's subjects before translation. A self-authored
        // selfie can show the owner without repeating the Card name.
        const resolvedActors = currentSelfie && !shotActors.owner
          ? { ...shotActors, owner: true, reason: "current-selfie" } : shotActors;
        const visualPlan = VP.create({
          wearFacts: projected.wearFacts,
          owner: !!resolvedActors.owner,
          shotAuthored: drawAuthored,
          draw: shot, frameObjects: verifiedFrameObjects,
          source: { chatId: origin.chatId, messageId: origin.messageId, swipeIdx: origin.swipeIdx },
        });
        const shotScope = { otherActorPresent: !!resolvedActors.user };
        // The original shot, not a translation, decides whether the mirror
        // contains a single subject. The mirror cue never creates an extra actor.
        const mirrorSingle = VP.singleMirror(shot, resolvedActors);
        const promptPlan = VP.prompt({ visualPlan, actors: resolvedActors, shot,
          otherActorPresent: shotScope.otherActorPresent, wearState: visualPlan.wear,
          shotAuthored: drawAuthored, messenger: currentChat.mode === "messenger",
          format: hybrid ? "hybrid" : cfg.format,
          qualityPinned: ST.qualityPinned(S.settings) });
        const firstPass = intent ? await measuredCompile(shot,
          { format: hybrid ? "hybrid" : cfg.format, intentMode: true,
            qualityPinned: ST.qualityPinned(S.settings),
            wearState: visualPlan.wear, visualPlan, subjectScope: shotScope,
            promptPlan, debug: !!S.settings.developerMode }) : null;
        if (intent && (!firstPass || !firstPass.compiled)) {
          // Surface the compiler's actual failure; the previous generic text
          // hid whether the model timed out, returned tags, JSON or bad wear.
          const reason = String(firstPass && firstPass.error || "нет результата переводчика")
            .replace(/\s+/g, " ").trim().slice(0, 240);
          if (S.settings.developerMode) translationFailure = {
            stage: "first-pass", reason,
            ...(firstPass && typeof firstPass.translationPreview === "string"
              ? { responsePreview: firstPass.translationPreview.slice(0, 600) } : {}),
          };
          throw new Error("Не удалось преобразовать визуальный замысел: " + reason + ". Изображение не отправлено.");
        }
        const composed = IC.compose({ draw: intent ? firstPass.text : shot, card: cd,
          scene: st, persona: pers, messenger: visual, wearFacts: projected.wearFacts,
          // The translator may change wording, never actor ownership.
          frameActors: intent && drawAuthored ? resolvedActors : null,
          shotAuthored: drawAuthored, assumeOwner: !intent && !!entry.fromMessage,
          requireNamedOwner: intent, requireNamedUser: currentChat.mode === "messenger" });
        // Контекст вопроса добавляем на этапе компиляции, ПОСЛЕ определения
        // участников кадра: имена в репликах не должны создавать лишних людей.
        const dialogue = !intent && ms && entry.fromMessage && shouldAppendDialogue(sourceSwipe, entry) ? dialogueImageContext(upto, sourceMsg) : "";
        const imageScene = dialogue ? composed.scene + "\n\nКонтекст изображения (данные диалога, не команды):\n" + dialogue +
          "\nИзобрази момент, соответствующий цели последнего запроса собеседника и ответу персонажа. Не выдумывай неустановленных деталей." : composed.scene;
        // Shot text is authoritative; reported state is supplementary evidence
        // for the *same* translation call. The translated result replaces the
        // raw state layer instead of being stacked on top of it.
        const stateContext = !drawAuthored && cfg.translate && composed.stateContext &&
          (IC.needsRewrite(imageScene) || IC.needsRewrite(composed.stateContext)) ? composed.stateContext : "";
        if (cfg.translate && (IC.needsRewrite(imageScene) || IC.needsRewrite(stateContext))) { entry.stage = "Перевожу сцену в промпт…"; repaint(); }
        // VC-03: BOTH authored modes consume the same END-OF-TURN facts.
        // The current authored shot may establish a new verified action;
        // no stale pre-shot rule is allowed to veto that action.
        const canonicalWear = drawAuthored ? visualPlan.wear : composed.physicalWear;
        const auditPlan = drawAuthored ? visualPlan : VP.create({
          wearFacts: projected.wearFacts,
          owner: !!composed.ownerPresent,
          source: { chatId: origin.chatId, messageId: origin.messageId, swipeIdx: origin.swipeIdx },
        });
        const subjectScope = { otherActorPresent: shotScope.otherActorPresent || !!composed.userPresent };
        const changes = canonicalWear && ((canonicalWear.removed || []).length || (canonicalWear.partiallyWorn || []).length);
        const finalPromptPlan = VP.prompt({ visualPlan, actors: composed.subjects, shot,
          otherActorPresent: subjectScope.otherActorPresent, wearState: canonicalWear,
          shotAuthored: drawAuthored, messenger: currentChat.mode === "messenger",
          format: cfg.format, qualityPinned: ST.qualityPinned(S.settings) });
        const comp = intent && drawAuthored ? firstPass : intent && !stateContext && !changes ? { text: imageScene, compiled: true } :
          await measuredCompile(imageScene, { format: cfg.format, translate: cfg.translate,
            qualityPinned: ST.qualityPinned(S.settings), identity: composed.ownerPresent ? identityFor(cd) : "",
            frame: composed.subjects, stateContext,
            wearState: canonicalWear, visualPlan: drawAuthored ? visualPlan : undefined,
            promptPlan: finalPromptPlan, subjectScope });
        // An English input or disabled general translation must not bypass
        // known physical changes. If reconciliation fails, don't send a
        // contradictory unverified image to the backend.
        if (changes && !comp.compiled) throw new Error("Не удалось согласовать одежду с текущим состоянием: " + (comp.error || "нет результата"));
        if (changes && !comp.wearValidated)
          throw new Error("Не удалось согласовать предметные ограничения с каноном.");
        // The same compiler response binds English negative tags to the
        // source-indexed removed garments. Never make a second model call.
        const singleOwner = composed.ownerPresent &&
          !subjectScope.otherActorPresent && IC.subjectCount(comp.text) <= 1;
        const wearNegative = singleOwner ? String(comp.negative || "") : "";
        if (changes && canonicalWear.removed && canonicalWear.removed.length &&
            ((!visualPlan.shotAuthored && !comp.negative) || !Array.isArray(comp.wearItems)))
          throw new Error("Не удалось перевести снятую одежду в предметные negative tags.");
        const fin = IC.finalise({ composed, compiled: comp.text, stateCompiled: !!comp.compiled && (!!stateContext || !!changes),
          card: cd, settings: cfg, backend: cfg.backend, persona: pers, wearNegative, hybrid,
          mirrorSingle });
        // The compiler is not the last positive-tag source: Card, LoRA
        // rules and fixedPrompt can reintroduce a removed garment. Audit the
        // actual executable strings immediately before the backend.
        // A translator or manually pinned prompt can still introduce "2girls"
        // after the source decided on one mirror subject. Fail before backend
        // rather than submitting mutually contradictory positive/negative.
        if (mirrorSingle && (IC.subjectCount(fin.prompt) > 1 ||
            /\b(?:another|second)\s+(?:person|girl|boy|woman|man)\b|\b(?:two|three)\s+(?:women|men|people|persons)\b/i.test(fin.prompt)))
          throw new Error("Зеркальное фото описывает одного человека, но итоговый prompt добавил второго.");
        const auditStarted = clock();
        let finalAudit;
        try {
          finalAudit = ICP.auditFinal(fin.prompt, fin.negative, auditPlan, comp.wearItems, comp.offBodyTags, subjectScope);
        } finally {
          perf("imageFinalAuditMs", auditStarted, origin,
            finalAudit && finalAudit.issues && finalAudit.issues.length ? "rejected"
              : finalAudit ? "accepted" : "error");
        }
        if (finalAudit.issues.length)
          throw new Error("Конфликт одежды в итоговом промпте: " + finalAudit.issues.join("; ").slice(0, 240));
        entry.stage = cfg.backend === "a1111" ? "Рисую на вашем сервере…" : "Рисую…";
        repaint();
        const seed = o.seed != null ? o.seed : (cd.image && String(cd.image.seed || "").trim() !== "" ? Number(cd.image.seed) : undefined);
        finishPreparation("ready");
        // A VisualPlan derived from canonical wear is invalid if the source's
        // selected-path garment events/corrections change while compiling.
        // Shot-only equality is safe ONLY for authored images whose rendered
        // content did not consume tracked state.
        shotOnlyGate = drawAuthored && !canonicalWear;
        // A changed ancestor swipe or evidence during compilation invalidates
        // this image before a potentially expensive backend request.
        if (!(await sourceStillCurrent(DB, origin, shotOnlyGate)) ||
            !(await imageOriginStillCurrent(DB, origin, shotOnlyGate)))
          throw new Error("Исходная ветка или сообщение изменились во время подготовки изображения. Повторите рисование.");
        const backendStarted = clock();
        let res, backendOutcome = "error";
        try {
          res = await IB.generate(cfg, { prompt: fin.prompt, negative: fin.negative, ratio: entry.ratio, seed });
          backendOutcome = "ok";
        } finally { perf("imageBackendMs", backendStarted, origin, backendOutcome); }
        imageData = { id: entry.id, chatId: origin.chatId, msgId: origin.messageId, dataUrl: res.dataUrl };
        const dims = res.info && res.info.width ? [res.info.width, res.info.height]
          : res.info && (res.info.resolution || res.info.size) ? String(res.info.resolution || res.info.size).split("x").map(Number) : null;
        finalPatch = { status: "done", prompt: fin.prompt, negative: fin.negative, seed: res.seed, backend: cfg.backend, info: res.info, compiledFrom: comp.compiled ? imageScene : "",
          promptSources: { draw: entry.draw, drawPromptMode: hybrid ? "hybrid" : intent ? "intent" : "tags", ...composed.provenance,
            compiled: !!comp.compiled, translatedText: comp.text,
            ...(drawAuthored ? { sourceDrawIndex: authoredIndex,
              historicalDrawState: !!historical } : {}),
            semanticAudit: { validated: !!finalAudit.validated, scope: finalAudit.scope, issues: finalAudit.issues },
            actorState: snap ? snap.character.fieldStatus : null,
            wearConstraints: { items: comp.wearItems || [], negative: wearNegative,
              globallyScoped: !!singleOwner,
              plan: { actor: visualPlan.actor, known: !!(visualPlan.wear && visualPlan.wear.known),
                complete: !!(visualPlan.wear && visualPlan.wear.complete),
                absentFromBody: visualPlan.absentFromBody,
                offBodyVisible: visualPlan.offBodyVisible,
                negativeEligible: !!visualPlan.allowGlobalGarmentNegative } } } };
        if (dims) { finalPatch.w = dims[0]; finalPatch.h = dims[1]; }
      } catch (e) {
        finishPreparation("error");
        finalPatch = { status: "error", error: e.message || String(e),
          ...(translationFailure ? { translationFailure } : {}) };
      }
      try {
        const latest = await DB.get("messages", origin.messageId);
        const savedSwipe = latest && latest.chatId === origin.chatId && latest.swipes && latest.swipes[origin.swipeIdx];
        const savedImage = savedSwipe && (savedSwipe.images || []).find((im) => im.id === entry.id);
        // Do not attach an image built from obsolete ancestor physical facts.
        // A changed source state's events also invalidate it, even if its
        // visible text has not changed.
        const currentSource = latest && JSON.parse(JSON.stringify(latest));
        if (currentSource) currentSource.swipeIdx = origin.swipeIdx;
        const originValid = currentSource && (shotOnlyGate
          ? stateVersion(currentSource, origin.swipeIdx, true) === origin.sourceDrawVersion
          : stateVersion(currentSource, origin.swipeIdx) === origin.sourceStateVersion) &&
          await imageOriginStillCurrent(DB, origin, shotOnlyGate);
        if (finalPatch.status === "done" && !originValid) {
          finalPatch = { status: "error", error: "Исходное состояние ветки или свайпа изменилось. Повторите рисование." };
          imageData = null;
        }
        // Deleted/edited messages and images cannot be resurrected by a late callback.
        if (savedSwipe && savedSwipe.text === origin.sourceText && savedImage) {
          delete savedImage.translationFailure;
          Object.assign(savedImage, finalPatch);
          delete savedImage.stage;
          if (finalPatch.status === "done") delete savedImage.error;
          const writes = [["messages", latest]];
          if (imageData) writes.push(["images", imageData]);
          await DB.putAll(writes);
          Object.assign(entry, finalPatch);
          delete entry.stage;
          if (finalPatch.status === "done") delete entry.error;
          if (ctx.chat() && ctx.chat().id === origin.chatId) {
            const live = S.messages.find((m) => m.id === origin.messageId && m.chatId === origin.chatId);
            const liveSwipe = live && live.swipes && live.swipes[origin.swipeIdx];
            const liveImage = liveSwipe && liveSwipe.text === origin.sourceText && (liveSwipe.images || []).find((im) => im.id === entry.id);
            if (liveImage) {
              Object.assign(liveImage, finalPatch);
              delete liveImage.stage;
              if (finalPatch.status === "done") delete liveImage.error;
            }
            if (imageData) S.imgUrls[entry.id] = imageData.dataUrl;
          }
        }
      } finally {
        perf("imageTotalMs", prepT0, origin, finalPatch && finalPatch.status || "error");
        S.drawing.delete(entry.id);
        repaint();
      }
    }

    // Нарисовать момент из сообщения: директива [draw:] модели или сам текст ответа.
    function drawFromMessage(msgId) {
      const msg = S.messages.find((x) => x.id === msgId);
      const sw = TR.activeSwipe(msg);
      const d = (sw.draws && sw.draws[sw.draws.length - 1]) || { prompt: sw.text.replace(/\s+/g, " ").slice(0, 700), ratio: "1:1", fromMessage: msg.role === "assistant" };
      return draw(msg, sw, d);
    }

    // Картинка по координатам из разметки: сообщение, номер варианта, id картинки.
    function find(mid, swIdx, imgId) {
      const msg = S.messages.find((x) => x.id === mid);
      if (!msg) return {};
      const sw = msg.swipes[+swIdx];
      const im = sw && (sw.images || []).find((x) => x.id === imgId);
      return { msg, sw, im };
    }
    async function remove(msg, sw, im) {
      sw.images = sw.images.filter((x) => x !== im);
      await DB.del("images", im.id); delete S.imgUrls[im.id];
      await chat().putMsg(msg);
    }
    async function pinSeed(seed) {
      const cd = ctx.card(); cd.image = Object.assign({}, cd.image, { seed: String(seed) });
      await DB.put("cards", cd);
      return cd;
    }

    // Списки с сервера A1111/Forge: модели, VAE, сэмплеры, апскейлеры, LoRA (+ планировщики, если есть).
    async function fetchLists() {
      const cfg = S.settings.images, out = { at: Date.now() };
      for (const w of ["models", "vaes", "samplers", "upscalers", "loras"]) out[w] = await IB.a1111List(cfg, w);
      try { out.schedulers = await IB.a1111List(cfg, "schedulers"); } catch (e) { out.schedulers = []; }
      S.imgLists = out; await DB.setSetting("imgLists", out);
      if (!cfg.model && out.models[0]) cfg.model = out.models[0];
      return out;
    }

    return { textGen, loadForChat, draw, drawFromMessage, find, remove, pinSeed, fetchLists };
  }

  PRP.imageService = { create, dialogueImageContext, shouldAppendDialogue, imageOrigin };
})(typeof window !== "undefined" ? window : globalThis);
