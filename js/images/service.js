/* Prism RP — картинки в чате (прикладной уровень).
   Порядок: промпт из сцены (compose) → перевод текстовой моделью (compile, через PRP.llm)
   → финальная сборка (finalise) → бэкенд (backends) → сохранение картинки.
   Также: загрузка картинок чата, восстановление прерванного рисования, списки с сервера A1111.
   Перерисовка — через порт ctx.ui. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, IC = PRP.imgCompose, ICP = PRP.imgCompile, IB = PRP.imgBackends, ST = PRP.settings, LLM = PRP.llm;

  function create(ctx) {
    const { S, DB, ui } = ctx;
    const chat = () => ctx.svc.chat;

    function textGen(instruction) { return LLM.simple(ctx.provider(), instruction); }

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
      const cfg = S.settings.images, cd = ctx.card();
      if (!cfg.enabled) { ui.toast("Картинки выключены. Включите их в «Настройки → Изображения».", true); return; }
      if (cfg.backend === "perchance" && !IB.available("perchance")) { ui.toast("Рисование через Perchance доступно только в генераторе на Perchance. Выберите Forge/A1111 или API.", true); ui.openSettings("images"); return; }
      if (cfg.backend !== "perchance" && !String(cfg.url || "").trim()) { ui.toast("Укажите адрес сервера изображений.", true); ui.openSettings("images"); return; }
      const entry = reuse || { id: U.uid("img"), draw: d.prompt, ratio: d.ratio || "1:1" };
      Object.assign(entry, { status: "pending", stage: "Готовлю промпт…" });
      delete entry.error;
      if (!reuse) (sw.images = sw.images || []).push(entry);
      S.drawing.add(entry.id);
      const repaint = () => { if (ctx.chat() && ctx.chat().id === msg.chatId) ui.renderFeed(); };
      await chat().putMsg(msg);
      repaint();
      try {
        const path = chat().path();
        const upto = path.indexOf(msg) >= 0 ? path.slice(0, path.indexOf(msg) + 1) : path;
        /* Зрительное состояние: у сцены RP — одежда и поза из сцены; у переписки сцены нет (chat/service.sceneState —
           пустое состояние), поэтому картинка строится только из [draw:], карточки и персоны: одежду и место «вне кадра»
           ничто не придумывает. Картинка — производное: её данные в Prism не возвращаются. */
        const st = chat().sceneState(upto);
        const pers = ctx.persona();
        const composed = IC.compose({ draw: entry.draw, card: cd, scene: st, persona: pers });
        if (cfg.translate && IC.needsRewrite(composed.scene)) { entry.stage = "Перевожу сцену в промпт…"; repaint(); }
        const comp = await ICP.compile(composed.scene, { format: cfg.format, translate: cfg.translate, pov: (pers.image || {}).view === "first", qualityPinned: ST.qualityPinned(S.settings), identity: identityFor(cd) }, textGen);
        const fin = IC.finalise({ composed, compiled: comp.text, card: cd, settings: cfg, backend: cfg.backend, persona: pers });
        entry.stage = cfg.backend === "a1111" ? "Рисую на вашем сервере…" : "Рисую…";
        repaint();
        const seed = o.seed != null ? o.seed : (cd.image && String(cd.image.seed || "").trim() !== "" ? Number(cd.image.seed) : undefined);
        const res = await IB.generate(cfg, { prompt: fin.prompt, negative: fin.negative, ratio: entry.ratio, seed });
        await DB.put("images", { id: entry.id, chatId: msg.chatId, msgId: msg.id, dataUrl: res.dataUrl });
        S.imgUrls[entry.id] = res.dataUrl;
        const dims = res.info && res.info.width ? [res.info.width, res.info.height]
          : res.info && (res.info.resolution || res.info.size) ? String(res.info.resolution || res.info.size).split("x").map(Number) : null;
        Object.assign(entry, { status: "done", prompt: fin.prompt, negative: fin.negative, seed: res.seed, backend: cfg.backend, info: res.info, compiledFrom: comp.compiled ? composed.scene : "" });
        if (dims) { entry.w = dims[0]; entry.h = dims[1]; }
        delete entry.stage;
      } catch (e) {
        entry.status = "error";
        entry.error = e.message || String(e);
        delete entry.stage;
      }
      S.drawing.delete(entry.id);
      await chat().putMsg(msg);
      repaint();
    }

    // Нарисовать момент из сообщения: директива [draw:] модели или сам текст ответа.
    function drawFromMessage(msgId) {
      const msg = S.messages.find((x) => x.id === msgId);
      const sw = TR.activeSwipe(msg);
      const d = (sw.draws && sw.draws[0]) || { prompt: sw.text.replace(/\s+/g, " ").slice(0, 700), ratio: "1:1" };
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

  PRP.imageService = { create };
})(typeof window !== "undefined" ? window : globalThis);
