/* Prism RP — генерация ответа персонажа (прикладной уровень).
   Порядок хода: предварительная сборка Prism и проверка бюджета (до любых изменений дерева)
   → узел или вариант ответа → вызов модели через PRP.llm → разбор ответа ([scene:], [draw:],
   рассуждение) → сохранение → автокартинка.
   Режимы: "new" — новый ответ, "regen" — новый вариант, "continue" — дописать текущий вариант.
   Перерисовка — через порт ctx.ui (сервис не трогает DOM сам). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, SC = PRP.scene, OA = PRP.openai, IC = PRP.imgCompose, ST = PRP.settings, LLM = PRP.llm;

  const CONTINUE = "Продолжи последнее сообщение {{char}} ровно с того места, где оно оборвалось. Не повторяй уже написанное и не начинай заново.";

  function create(ctx) {
    const { S, ui } = ctx;
    const chat = () => ctx.svc.chat, prism = () => ctx.svc.prism, images = () => ctx.svc.images;

    async function generate(msgId, mode) {
      if (S.gen) return;
      const c = ctx.chat(), cd = ctx.card();
      const prov = ctx.provider();
      if (!c || !cd) return;
      if (!prov) { ui.toast("Модель не подключена. Откройте «Настройки → Модели».", true); ui.openSettings("models"); return; }
      mode = mode || (msgId ? "regen" : "new");

      // Предварительная проверка: контекст собирается ДО любых изменений дерева сообщений.
      // Если он не помещается, запрос не уходит и история не получает ни узла, ни варианта.
      let path = chat().path();
      if (mode === "regen") path = path.slice(0, path.findIndex((m) => m.id === msgId));
      const extraPost = mode === "continue" ? CONTINUE : "";
      const built = prism().build(path, extraPost);
      S.lastPrism = Object.assign({ at: Date.now(), provider: prov.label }, built);
      if (built.report.overflow) {
        ui.toast(`Контекст не помещается даже после всех сокращений (${built.report.used} из ${built.report.budget} токенов), запрос не отправлен. Увеличьте объём контекста в «Настройки → Генерация» или сократите сцену и карточку. Подробности — во вкладке Prism.`, true);
        if (S.drawerOpen) { S.tab = "prism"; ui.renderDrawer(); }
        ui.renderFeed();
        return;
      }

      let target, prefix = "";
      if (mode === "regen") {
        target = S.messages.find((m) => m.id === msgId);
        target.swipes.push({ text: "", sceneOps: [], createdAt: Date.now() });
        target.swipeIdx = target.swipes.length - 1;
      } else if (mode === "continue") {
        target = S.messages.find((m) => m.id === msgId);
        prefix = TR.activeSwipe(target).text;
      } else {
        target = chat().newMsg("assistant", c.leafId, "");
        c.leafId = target.id;
        await chat().putChat(c);
      }
      await chat().putMsg(target);

      const sw = TR.activeSwipe(target);
      const ctrl = new AbortController();
      S.gen = { ctrl, msgId: target.id, raw: "", reasoning: "", prefix: prefix ? prefix + (/\s$/.test(prefix) ? "" : " ") : "" };
      ui.renderFeed();
      if (S.drawerOpen && S.tab === "prism") ui.renderDrawer();
      ui.scrollBottom();

      const onDelta = (d) => { S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; ui.paintStreaming(); };
      let raw = "", reasoning = "", error = null;
      try {
        const res = await LLM.chat(prov, built.messages, {
          names: { char: cd.name, user: ctx.persona().name }, sampler: S.settings.sampler,
          signal: ctrl.signal, onDelta, continueFrom: prefix || null,
        });
        raw = res.text; reasoning = res.reasoning;
      } catch (e) {
        raw = e.partial != null ? e.partial : S.gen.raw;
        reasoning = S.gen.reasoning;
        if (e.name !== "AbortError") error = e.message || String(e);
      }
      const th = OA.splitThink(raw || "");
      const parsed = SC.parse(th.text);
      const dr = IC.parseDraws(parsed.text);
      if (mode === "continue") {
        if (dr.text) sw.text = S.gen.prefix + dr.text;
        sw.sceneOps = (sw.sceneOps || []).concat(parsed.ops);
        sw.draws = (sw.draws || []).concat(dr.draws);
      } else {
        sw.text = dr.text;
        sw.sceneOps = parsed.ops;
        sw.draws = dr.draws;
      }
      sw.reasoning = [sw.reasoning && mode === "continue" ? sw.reasoning : "", reasoning, th.reasoning].filter(Boolean).join("\n").trim();
      if (error) sw.error = error; else delete sw.error;
      S.gen = null;
      await chat().putMsg(target);
      await chat().touch();
      prism().refresh();
      ui.renderFeed();
      ui.renderRail();
      if (S.drawerOpen) ui.renderDrawer();
      ui.scrollBottom();
      if (!error && dr.draws.length && ST.imagesOn(S.settings, ctx.env.perchanceImages()) && S.settings.images.autoDraw) images().draw(target, sw, dr.draws[0]);
    }

    function stop() { if (S.gen) S.gen.ctrl.abort(); }

    return { generate, stop };
  }

  PRP.generationService = { create };
})(typeof window !== "undefined" ? window : globalThis);
