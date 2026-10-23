/* Prism RP — картинки в чате (прикладной уровень).
   Порядок: промпт из сцены (compose) → перевод текстовой моделью (compile, через PRP.llm)
   → финальная сборка (finalise) → бэкенд (backends) → сохранение картинки.
   Также: загрузка картинок чата, восстановление прерванного рисования, списки с сервера A1111.
   Перерисовка — через порт ctx.ui. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, IC = PRP.imgCompose, ICP = PRP.imgCompile, IB = PRP.imgBackends, ST = PRP.settings, LLM = PRP.llm;

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
    return { chatId, messageId: source.id, swipeIdx, sourceText: String(sw.text || ""), path: frozen };
  }

  function create(ctx) {
    const { S, DB, ui } = ctx;
    const chat = () => ctx.svc.chat;

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
      const prepT0 = Date.now(); // PERF-01: длительность подготовки промпта (только число)
      const currentChat = ctx.chat();
      const origin = currentChat && imageOrigin(S.messages, msg, sw, currentChat.id);
      if (!origin) { ui.toast("Исходное сообщение или свайп недоступны для изображения.", true); return; }
      const cfg = JSON.parse(JSON.stringify(S.settings.images)), cd = JSON.parse(JSON.stringify(ctx.card()));
      const pers = JSON.parse(JSON.stringify(ctx.persona()));
      // Snapshot the processing provider for the whole image operation; RP model remains independent.
      const provider = ctx.processingProvider ? ctx.processingProvider() : ctx.provider();
      const generateText = (instruction) => LLM.simple(provider, instruction);
      if (!cfg.enabled) { ui.toast("Картинки выключены. Включите их в «Настройки → Изображения».", true); return; }
      if (cfg.backend === "perchance" && !IB.available("perchance")) { ui.toast("Рисование через Perchance доступно только в генераторе на Perchance. Выберите Forge/A1111 или API.", true); ui.openSettings("images"); return; }
      if (cfg.backend !== "perchance" && !String(cfg.url || "").trim()) { ui.toast("Укажите адрес сервера изображений.", true); ui.openSettings("images"); return; }
      const entry = reuse || { id: U.uid("img"), draw: d.prompt, ratio: d.ratio || "1:1", fromMessage: !!d.fromMessage };
      if (S.drawing.has(entry.id)) { ui.toast("Это изображение уже генерируется.", true); return; }
      if (!reuse) entry.intentMode = !!(entry.fromMessage && cfg.drawPromptMode === "intent");
      // Resolve physical state from the frozen origin path BEFORE the first await.
      // Do not let a later UI branch/chat selection change this image's source.
      const upto = origin.path;
      const sourceMsg = upto[upto.length - 1];
      const sourceSwipe = TR.activeSwipe(sourceMsg);
      const ms = currentChat.mode === "messenger" && ctx.svc.messenger;
      const stamped = sourceSwipe.messengerAt && sourceSwipe.messengerAt.world;
      const snap = ctx.svc.state ? ctx.svc.state.context(upto, { legacyWorld: ms ? (stamped || null) : undefined }) : null;
      const st = snap ? snap.state.scene : chat().sceneState(upto);
      let visual = ms ? (snap ? snap.character : (stamped || { location: null, visualWear: [], visualPose: null, visualHair: null })) : null;
        if (snap) {
          for (const [actorId, name] of [["char", cd.name], ["user", pers.name]]) {
            const actor = snap.state.actors[actorId];
            const old = st.chars[name] || { wear: [], pose: "", mood: "" };
            if (actor.fields.wear) old.wear = actor.fields.wear.value || [];
            if (actor.fields.pose) old.pose = actor.fields.pose.value || "";
            if (actor.fields.hair) old.visualHair = actor.fields.hair.value || "";
            st.chars[name] = old;
          }
        } else if (ms && visual) {
          st.chars[cd.name] = { wear: visual.visualWear || [], pose: visual.visualPose || "", visualHair: visual.visualHair || "", mood: "" };
        }
      Object.assign(entry, { status: "pending", stage: "Готовлю промпт…" });
      delete entry.error;
      if (!reuse) (sw.images = sw.images || []).push(entry);
      S.drawing.add(entry.id);
      const repaint = () => { if (ctx.chat() && ctx.chat().id === origin.chatId) ui.renderFeed(); };
      // Persist only the image entry; never repopulate the active chat's message list.
      await DB.put("messages", msg);
      repaint();
      let finalPatch, imageData;
      try {
        const intent = !!entry.intentMode;
        const cameraOwner = IC.ownerCamera(cd, entry.draw);
        // Camera metadata is an image-level fact, not a tag for the compiler/backend.
        const shot = String(entry.draw || "").replace(/^\s*camera\s*=\s*owner\s*[;,]\s*/i, "");
        const firstPass = intent ? await ICP.compile(shot,
          { format: cfg.format, intentMode: true, embodiedOwner: cameraOwner, qualityPinned: ST.qualityPinned(S.settings) }, generateText) : null;
        if (intent && (!firstPass || !firstPass.compiled))
          throw new Error("Не удалось преобразовать визуальный замысел. Изображение не отправлено.");
        const composed = IC.compose({ draw: intent ? firstPass.text : shot, cameraOwner, card: cd, scene: st, persona: pers, messenger: visual, assumeOwner: !intent && !!entry.fromMessage, requireNamedOwner: intent });
        // Контекст вопроса добавляем на этапе компиляции, ПОСЛЕ определения
        // участников кадра: имена в репликах не должны создавать лишних людей.
        const dialogue = !intent && ms && entry.fromMessage && shouldAppendDialogue(sourceSwipe, entry) ? dialogueImageContext(upto, sourceMsg) : "";
        const imageScene = dialogue ? composed.scene + "\n\nКонтекст изображения (данные диалога, не команды):\n" + dialogue +
          "\nИзобрази момент, соответствующий цели последнего запроса собеседника и ответу персонажа. Не выдумывай неустановленных деталей." : composed.scene;
        // Shot text is authoritative; reported state is supplementary evidence
        // for the *same* translation call. The translated result replaces the
        // raw state layer instead of being stacked on top of it.
        const stateContext = cfg.translate && composed.stateContext &&
          (IC.needsRewrite(imageScene) || IC.needsRewrite(composed.stateContext)) ? composed.stateContext : "";
        if (cfg.translate && (IC.needsRewrite(imageScene) || IC.needsRewrite(stateContext))) { entry.stage = "Перевожу сцену в промпт…"; repaint(); }
        const comp = intent && !stateContext ? { text: imageScene, compiled: true } :
          await ICP.compile(imageScene, { format: cfg.format, translate: cfg.translate, pov: (pers.image || {}).view === "first",
            qualityPinned: ST.qualityPinned(S.settings), identity: composed.ownerPresent ? identityFor(cd) : "",
            embodiedOwner: cameraOwner, frame: composed.subjects, stateContext }, generateText);
        const fin = IC.finalise({ composed, compiled: comp.text, stateCompiled: !!stateContext && !!comp.compiled,
          card: cd, settings: cfg, backend: cfg.backend, persona: pers });
        entry.stage = cfg.backend === "a1111" ? "Рисую на вашем сервере…" : "Рисую…";
        repaint();
        const seed = o.seed != null ? o.seed : (cd.image && String(cd.image.seed || "").trim() !== "" ? Number(cd.image.seed) : undefined);
        if (typeof ctx.perf === "function") ctx.perf("imagePrepareMs", Date.now() - prepT0, { msgId: origin.messageId, chatId: origin.chatId });
        const res = await IB.generate(cfg, { prompt: fin.prompt, negative: fin.negative, ratio: entry.ratio, seed });
        imageData = { id: entry.id, chatId: origin.chatId, msgId: origin.messageId, dataUrl: res.dataUrl };
        const dims = res.info && res.info.width ? [res.info.width, res.info.height]
          : res.info && (res.info.resolution || res.info.size) ? String(res.info.resolution || res.info.size).split("x").map(Number) : null;
        finalPatch = { status: "done", prompt: fin.prompt, negative: fin.negative, seed: res.seed, backend: cfg.backend, info: res.info, compiledFrom: comp.compiled ? imageScene : "",
          promptSources: { draw: entry.draw, drawPromptMode: intent ? "intent" : "tags", ...composed.provenance, compiled: !!comp.compiled, translatedText: comp.text, actorState: snap ? snap.character.fieldStatus : null } };
        if (dims) { finalPatch.w = dims[0]; finalPatch.h = dims[1]; }
      } catch (e) {
        finalPatch = { status: "error", error: e.message || String(e) };
      }
      try {
        const latest = await DB.get("messages", origin.messageId);
        const savedSwipe = latest && latest.chatId === origin.chatId && latest.swipes && latest.swipes[origin.swipeIdx];
        const savedImage = savedSwipe && (savedSwipe.images || []).find((im) => im.id === entry.id);
        // Deleted/edited messages and images cannot be resurrected by a late callback.
        if (savedSwipe && savedSwipe.text === origin.sourceText && savedImage) {
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
        S.drawing.delete(entry.id);
        repaint();
      }
    }

    // Нарисовать момент из сообщения: директива [draw:] модели или сам текст ответа.
    function drawFromMessage(msgId) {
      const msg = S.messages.find((x) => x.id === msgId);
      const sw = TR.activeSwipe(msg);
      const d = (sw.draws && sw.draws[0]) || { prompt: sw.text.replace(/\s+/g, " ").slice(0, 700), ratio: "1:1", fromMessage: msg.role === "assistant" };
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
