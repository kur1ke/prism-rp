/* Prism RP — генерация ответа персонажа (прикладной уровень).
   Порядок хода: предварительная сборка Prism и проверка бюджета (до любых изменений дерева)
   → узел или вариант ответа → вызов модели через PRP.llm → разбор ответа ([scene:], [draw:],
   рассуждение) → сохранение → автокартинка.
   Режимы: "new" — новый ответ, "regen" — новый вариант, "continue" — дописать текущий вариант,
   "opening" — модель начинает сцену в пустом чате (см. opening ниже: дерево меняется только
   после успешного ответа).
   Сценарий карточки подаётся по правилу prism/scenario.js (граница первого ответа).
   Переписка: момент переписки выбирается при подготовке (живое время — часы, ручное — сохранённое) и вместе
   с положением персонажа записывается в вариант (messengerAt) ТОЛЬКО при успешном ответе. Ошибка, отмена,
   пустой ответ и переполнение время не записывают и не двигают. Среду переписки генерация не меняет никогда.
   Перерисовка — через порт ctx.ui (сервис не трогает DOM сам). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, SC = PRP.scene, OA = PRP.openai, IC = PRP.imgCompose, ST = PRP.settings, LLM = PRP.llm, SCN = PRP.scenario;

  const CONTINUE = "Продолжи последнее сообщение {{char}} ровно с того места, где оно оборвалось. Не повторяй уже написанное и не начинай заново.";
  // Временное указание для начала сцены моделью. В историю не попадает; учитывается в бюджете как часть протокола.
  const OPENING = "Начни сцену: напиши первое сообщение {{char}}. Открой её естественно, вводя только то, что следует из карточки, " +
    "начальных обстоятельств и текущей сцены; обстоятельства — отправная точка, а не сценарий, который нужно разыграть. " +
    "Не пиши действий, мыслей, реплик и решений {{user}} и оставь {{user}} место ответить.";
  const OPENING_ID = "opening"; // id временного пузыря начала сцены в ленте (в дереве такого узла нет)

  function create(ctx) {
    const { S, ui } = ctx;
    const chat = () => ctx.svc.chat, prism = () => ctx.svc.prism, images = () => ctx.svc.images;
    // Сервис среды — только для переписки.
    const messenger = () => { const c = ctx.chat(); return c && c.mode === "messenger" && ctx.svc.messenger ? ctx.svc.messenger : null; };

    async function generate(msgId, mode) {
      if (S.gen) return;
      const c = ctx.chat(), cd = ctx.card();
      const prov = ctx.provider();
      if (!c || !cd) return;
      if (!prov) { ui.toast("Модель не подключена. Откройте «Настройки → Модели».", true); ui.openSettings("models"); return; }
      mode = mode || (msgId ? "regen" : "new");
      const full = chat().path();
      // Пустой чат: отвечать не на что — это начало сцены.
      if (mode === "opening" || (mode === "new" && !full.length)) return opening(prov);

      // Предварительная проверка: контекст собирается ДО любых изменений дерева сообщений.
      // Если он не помещается, запрос не уходит и история не получает ни узла, ни варианта.
      let path = full;
      if (mode === "regen") path = full.slice(0, full.findIndex((m) => m.id === msgId));
      const target0 = msgId ? S.messages.find((m) => m.id === msgId) : null;
      // Другой вариант первого сообщения персонажа (корень ветки) — это снова начало сцены.
      const rootOpening = mode === "regen" && target0 && !target0.parentId && target0.role === "assistant";
      const extraPost = mode === "continue" ? CONTINUE : rootOpening ? OPENING : "";
      const ms = messenger();
      const msNow = ms ? ms.now() : undefined; // момент переписки для этого хода (выбран при подготовке)
      const built = prism().build(path, extraPost, SCN.forGeneration(full, { mode, targetId: msgId }), Object.assign(rootOpening ? { allowSyntheticUser: false, operation: "opening" } : {}, ms ? { messengerNow: msNow } : {}));
      if (preflightFailed(built, prov)) return;
      if (rootOpening && openingBlocked(built, prov)) return;

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
      // Переписка: [scene:] вырезается из текста, но сцену не пишет (chat/service.sceneFields — только неактивная копия).
      const sf = chat().sceneFields(parsed.ops);
      if (mode === "continue") {
        if (dr.text) sw.text = S.gen.prefix + dr.text;
        sw.sceneOps = (sw.sceneOps || []).concat(sf.sceneOps);
        if (sf.ignoredSceneOps && sf.ignoredSceneOps.length) sw.ignoredSceneOps = (sw.ignoredSceneOps || []).concat(sf.ignoredSceneOps);
        sw.draws = (sw.draws || []).concat(dr.draws);
      } else {
        sw.text = dr.text;
        sw.sceneOps = sf.sceneOps;
        if (sf.ignoredSceneOps && sf.ignoredSceneOps.length) sw.ignoredSceneOps = sf.ignoredSceneOps; else delete sw.ignoredSceneOps;
        sw.draws = dr.draws;
      }
      sw.reasoning = [sw.reasoning && mode === "continue" ? sw.reasoning : "", reasoning, th.reasoning].filter(Boolean).join("\n").trim();
      if (error) sw.error = error; else delete sw.error;
      /* Метка времени переписки — только у успешного ответа. «Продолжить» дописывает ту же единицу:
         прежняя метка не меняется, новая ставится, только если её не было. Ветка для положения — до этого сообщения. */
      if (ms && !error && !ctrl.signal.aborted && String(sw.text || "").trim() && !(mode === "continue" && sw.messengerAt)) {
        const snap = ms.snapshot(mode === "new" ? full : path, msNow);
        if (snap) sw.messengerAt = snap;
      }
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

    // Записать сборку для вкладки Prism; при переполнении — сообщить и вернуть true (запрос не уходит).
    function preflightFailed(built, prov) {
      S.lastPrism = Object.assign({ at: Date.now(), provider: prov.label }, built);
      if (!built.report.overflow) return false;
      ui.toast(`Контекст не помещается даже после всех сокращений (${built.report.used} из ${built.report.budget} токенов), запрос не отправлен. Увеличьте объём контекста в «Настройки → Генерация» или сократите сцену и карточку. Подробности — во вкладке Prism.`, true);
      if (S.drawerOpen) { S.tab = "prism"; ui.renderDrawer(); }
      ui.renderFeed();
      return true;
    }

    /* Начало сцены при «Одно системное сообщение». Реплику пользователя не подделываем никогда.
       Perchance получает текстовую инструкцию без шаблона чата — запрос только из system допустим.
       OpenAI-совместимый сервер со строгим шаблоном (Mistral, Gemma…) требует первый ход пользователя:
       без него шаблон бросает ошибку чередования или молча теряет system. Узнать шаблон заранее нельзя,
       поэтому для такого провайдера начало сцены отклоняется ДО вызова: ничего не меняется,
       пользователь может написать первым или выключить режим. → true, если отклонено. */
    function openingBlocked(built, prov) {
      if (!built.report.needsUserFirst || prov.kind === "perchance") return false;
      ui.toast("В режиме «Одно системное сообщение» модель со строгим шаблоном не может начать пустую сцену: шаблону нужен первый ход пользователя, а подделывать его Prism не будет. Напишите первым или выключите этот режим в «Настройки → Генерация».", true);
      ui.renderFeed();
      return true;
    }

    /* Начало сцены моделью (пустой чат, по явному действию пользователя).
       Транзакция: сборка Prism → проверка бюджета → вызов модели (поток — только во временном
       состоянии S.gen, в дереве узла нет) → разбор → ОДНА запись корневого сообщения → leafId → сохранение.
       Переполнение, ошибка, отмена или пустой ответ не меняют ни дерево, ни leafId: чат остаётся пустым,
       можно повторить. Фальшивой реплики пользователя нет: указание OPENING — временное, вне истории.
       → { ok, reason? } */
    async function opening(prov) {
      const c = ctx.chat(), cd = ctx.card();
      if (chat().path().length) return { ok: false, reason: "not-empty" };
      const ms = messenger();
      const msNow = ms ? ms.now() : undefined;
      const built = prism().build([], OPENING, SCN.forGeneration([], { mode: "opening" }), Object.assign({ allowSyntheticUser: false, operation: "opening" }, ms ? { messengerNow: msNow } : {}));
      if (preflightFailed(built, prov)) return { ok: false, reason: "overflow" };
      if (openingBlocked(built, prov)) return { ok: false, reason: "needs-user-first" };

      const ctrl = new AbortController();
      const chatId = c.id;
      S.gen = { ctrl, msgId: OPENING_ID, opening: true, raw: "", reasoning: "", prefix: "" };
      ui.renderFeed();
      if (S.drawerOpen && S.tab === "prism") ui.renderDrawer();
      ui.scrollBottom();

      const onDelta = (d) => { if (!S.gen) return; S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; ui.paintStreaming(); };
      let res = null, error = null;
      try {
        res = await LLM.chat(prov, built.messages, { names: { char: cd.name, user: ctx.persona().name }, sampler: S.settings.sampler, signal: ctrl.signal, onDelta });
      } catch (e) {
        if (e.name !== "AbortError") error = e.message || String(e);
      }
      const aborted = ctrl.signal.aborted;
      S.gen = null;
      let th = null, parsed = null, dr = null;
      if (!aborted && !error) {
        th = OA.splitThink((res && res.text) || "");
        parsed = SC.parse(th.text);
        dr = IC.parseDraws(parsed.text);
        if (!dr.text.trim()) error = "модель вернула пустой ответ";
      }
      if (aborted || error || S.chatId !== chatId) {
        if (error) ui.toast(`Не удалось начать сцену: ${error}. Можно попробовать ещё раз.`, true);
        prism().refresh();
        ui.renderFeed();
        if (S.drawerOpen) ui.renderDrawer();
        return { ok: false, reason: aborted ? "aborted" : error ? "error" : "chat-changed" };
      }

      const m = chat().newMsg("assistant", null, "");
      m.opening = "generated";
      m.swipes = [{ text: dr.text, ...chat().sceneFields(parsed.ops), draws: dr.draws, reasoning: [(res && res.reasoning) || "", th.reasoning].filter(Boolean).join("\n").trim(), createdAt: Date.now() }];
      if (ms) { const snap = ms.snapshot([], msNow); if (snap) m.swipes[0].messengerAt = snap; }
      await chat().putMsg(m);
      c.leafId = m.id;
      await chat().touch();
      prism().refresh();
      ui.renderFeed();
      ui.renderRail();
      if (S.drawerOpen) ui.renderDrawer();
      ui.scrollBottom();
      const sw = m.swipes[0];
      if (dr.draws.length && ST.imagesOn(S.settings, ctx.env.perchanceImages()) && S.settings.images.autoDraw) images().draw(m, sw, dr.draws[0]);
      return { ok: true, msgId: m.id };
    }

    function stop() { if (S.gen) S.gen.ctrl.abort(); }

    return { generate, stop, OPENING };
  }

  PRP.generationService = { create };
})(typeof window !== "undefined" ? window : globalThis);
