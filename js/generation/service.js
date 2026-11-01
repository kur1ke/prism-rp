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
   пустой ответ и переполнение время не записывают и не двигают. Legacy Environment генерация не меняет;
   UT-1 записывает проверенные автоматические события состояния в тот же вариант сообщения.
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
  const INITIATIVE_ID = "initiative"; // id временного пузыря проверки инициативы (в дереве такого узла нет до успешного ответа)
  const INI = PRP.messengerInitiative, U = PRP.util;
  // Ключ активного контекста: чат + сообщения пути и их выбранные варианты (сверка перед записью).
  const pathKey = (p) => (p || []).map((m) => m.id + ":" + (m.swipeIdx || 0)).join(">");
  /* PERF-01: ключ контекста ожидающего хода — путь, выбранные свайпы И текст каждого сообщения пути
     (отпечаток FNV-1a + длина). Правка любого сообщения истории, пока ход ждёт, — это другой контекст:
     реплика не отправляется, текст возвращается в поле ввода. */
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
  const turnKey = (p) => (p || []).map((m) => { const t = String(TR.activeSwipe(m).text || ""); return m.id + ":" + (m.swipeIdx || 0) + ":" + t.length + ":" + fnv(t); }).join(">");

  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  function recordToolStatus(swipe, issues) {
    if (!swipe || swipe.stateProtocol !== 1) return;
    const shots = Array.isArray(swipe.draws) ? swipe.draws : [];
    const last = shots.length ? shots[shots.length - 1] : null;
    const problems = Array.isArray(issues) ? issues.slice(0,8) : [];
    swipe.stateStatus = {
      status:problems.length ? "partial" :
        (swipe.stateEvents || []).length ? "ok" : "no-changes",
      method:"state-tool", issues:problems,
      sourceText:swipe.text || "", sourceDraw:last && last.prompt || "",
      sourceDrawIndex:shots.length-1,
      eventCount:(swipe.stateEvents || []).length, at:Date.now(),
    };
  }


  function create(ctx) {
    const { S, ui } = ctx;
    const chat = () => ctx.svc.chat, prism = () => ctx.svc.prism, images = () => ctx.svc.images, state = () => ctx.svc.state;
    const perf = (metric, ms, meta) => { if (typeof ctx.perf === "function") ctx.perf(metric, ms, meta); };
    const renderComposer = () => { if (typeof ui.renderComposer === "function") ui.renderComposer(); else ui.renderFeed(); };

    /* PERF-01: обработка после ответа. Ответ уже записан и показан, замок генерации снят.
       Разбор ответа — задача сервиса состояния (track: дедуп, без отклонений, ограничена по времени);
       картинка — строго ПОСЛЕ разбора, как и раньше (её снимок состояния включает события ответа).
       Возвращается Promise, который никогда не отклоняется. */
    function afterReply(msg, prov, draw) {
      const st = state();
      // Entire automatic image delivery, including waiting for Observer.
      const deliveryStarted = now();
      const autoImage = !!draw && ST.imagesOn(S.settings, ctx.env.perchanceImages()) &&
        !!S.settings.images.autoDraw;
      /* Источник картинки фиксируется в момент ответа: этот вариант (объект свайпа), его номер и текст.
         Директива [draw:] принадлежит ИМЕННО этому варианту: если за время разбора выбран другой свайп,
         вариант изменён, изменился путь до него или сообщение ушло с активной ветки — авто-картинка не рисуется. */
      const sw = TR.activeSwipe(msg), swIdx = msg.swipeIdx || 0, text = String(sw.text || "");
      /* Якорь происхождения: весь активный путь ДО и включая это сообщение (id, выбранные свайпы, текст).
         Смена свайпа или правка ПРЕДКА не убирает сообщение с пути (путь строится по parentId), но меняет
         контекст, в котором был дан ответ, — тогда авто-картинка тоже пропускается. Потомки (ход из очереди)
         якорь не меняют. */
      const prefixKey = () => { const p = chat().path(), i = p.indexOf(msg); return i < 0 ? null : turnKey(p.slice(0, i + 1)); };
      const anchor = prefixKey();
      const observerProvider = ctx.processingProvider ? ctx.processingProvider() : prov;
      const hasAuthoredDraw = Array.isArray(sw.draws) && sw.draws.some(d =>
        d && typeof d.prompt === "string" && d.prompt.trim());
      const analysed = sw.stateProtocol === 1 ? Promise.resolve({ status: "state-tool" }) :
        st && msg && (text.trim() || hasAuthoredDraw)
          ? st.track(msg, observerProvider) : Promise.resolve(null);
      return analysed.then((res) => {
        // Independent non-blocking Memory → Reflection cycle after a committed answer.
        // No manual interaction, no writes on failed/stale generation.
        if (ctx.svc.memory && !(res && res.skipped === "stale-branch"))
          ctx.svc.memory.observe(msg, observerProvider).catch(() => {});
        if (!draw) return null;
        const c = ctx.chat();
        const same = c && c.id === msg.chatId && (msg.swipeIdx || 0) === swIdx && msg.swipes[swIdx] === sw &&
          String(sw.text || "") === text && (sw.draws || []).some((d) => d === draw || (d && d.prompt === draw.prompt && d.ratio === draw.ratio)) &&
          anchor != null && prefixKey() === anchor && !(res && res.skipped === "stale-branch");
        if (!same) { perf("imageSkipped", 0, { msgId: msg.id, chatId: msg.chatId, outcome: res && res.skipped === "stale-branch" ? "analysis-stale" : "source-changed" }); return null; }
        if (!ST.imagesOn(S.settings, ctx.env.perchanceImages()) || !S.settings.images.autoDraw) return null;
        return images().draw(msg, sw, draw);
      }).catch((e) => { perf("postReplyError", 0, { msgId: msg && msg.id, chatId: msg && msg.chatId, outcome: String(e && e.message || e).slice(0, 120) }); return null; })
        .finally(() => {
          if (!autoImage) return;
          const entries = sw && Array.isArray(sw.images) ? sw.images : [];
          const image = entries.slice().reverse().find(im => im && im.draw === draw.prompt);
          perf("imageDeliveryMs", now() - deliveryStarted,
            { msgId: msg.id, chatId: msg.chatId, outcome: image ? image.status : "skipped" });
        });
    }

    /* PERF-01: операция, которой нужно полное состояние чата, ждёт незавершённых разборов этого чата —
       видимо (S.turn, фаза "waiting-state") и ограниченно (state.settle). После ожидания контекст сверяется:
       тот же чат и тот же путь (сообщения + выбранные свайпы). Иначе операция не выполняется.
       → { turn } | { refused } */
    async function waitForState(kind, extra) {
      const c = ctx.chat(), st = state();
      const turn = Object.assign({ chatId: c.id, kind, key: turnKey(chat().path()), phase: "waiting-state", at: now() }, extra || {});
      S.turn = turn;
      renderComposer();
      // Отмена прерывает ожидание сразу: ход не висит до конца чужого разбора.
      const cancelled = new Promise((r) => { turn.onCancel = () => r({ waitedMs: Math.round(now() - turn.at), timedOut: false, cancelled: true }); });
      const w = st && st.pending(c.id) ? await Promise.race([st.settle(c.id), cancelled]) : { waitedMs: 0, timedOut: false };
      turn.waitedMs = w.waitedMs;
      if (w.timedOut) perf("stateWaitTimeout", w.waitedMs, { chatId: c.id });
      if (S.turn !== turn || turn.cancelled) return { refused: "cancelled", turn };
      if (S.chatId !== turn.chatId || !ctx.chat() || turnKey(chat().path()) !== turn.key) return { refused: "context-changed", turn };
      if (w.timedOut) return { refused: "state-timeout", turn };
      return { turn };
    }
    const releaseTurn = (turn) => { if (turn && S.turn === turn) { S.turn = null; renderComposer(); } };
    // Сервис среды — только для переписки.
    const messenger = () => { const c = ctx.chat(); return c && c.mode === "messenger" && ctx.svc.messenger ? ctx.svc.messenger : null; };

    // Only the last actually submitted RP payload, only in developer mode.
    // This is an in-memory Debug snapshot, never a saved chat event or state fact.
    function debugRpPayload(chatId, operation, messages) {
      if (!S.settings.developerMode) return;
      S.debugLastRpInput = { chatId, operation, at: Date.now(),
        messages: messages.map(x => ({ role: x.role, content: x.content })) };
      if (S.modal && S.modal.kind === "debug" && S.modal.section === "prism") {
        S.modal.keepScroll = true;
        ui.renderModal();
      }
    }

    async function generate(msgId, mode, opts) {
      const o = opts || {};
      if (S.gen) return;
      // Ход уже принят (ждёт разбора или идёт) — вторая операция не запускается; своя операция хода проходит.
      if (S.turn && S.turn !== o.turn && S.turn.chatId === S.chatId) return;
      const c = ctx.chat(), cd = ctx.card();
      const prov = ctx.provider();
      if (!c || !cd) return;
      // Незавершённый разбор предыдущих сообщений этого чата: сначала дождаться его (видимо, ограниченно).
      if (!o.turn && state() && state().pending(c.id)) {
        const w = await waitForState(mode || (msgId ? "regen" : "new"));
        if (w.refused) { releaseTurn(w.turn); if (w.refused === "context-changed") ui.toast("Пока шёл разбор предыдущего ответа, чат, ветка или текст истории изменились — действие отменено.", true); else if (w.refused === "state-timeout") ui.toast("Разбор предыдущего ответа ещё не завершён. Повторите действие после его завершения.", true); return; }
        let reply = null;
        try { reply = await generate(msgId, mode, { turn: w.turn }); return reply; }
        finally { releaseTurn(w.turn); ready(reply); }
      }
      if (!prov) { ui.toast("Модель не подключена. Откройте «Настройки → Модели».", true); ui.openSettings("models"); return; }
      mode = mode || (msgId ? "regen" : "new");
      // Другой вариант сообщения-инициативы — снова проверка инициативы (тот же смысл операции, та же логическая единица).
      if (mode === "regen" && c.mode === "messenger" && INI.isInitiative(S.messages.find((m) => m.id === msgId))) return initiative(msgId, { turn: o.turn });
      const full = chat().path();
      // Пустой чат: отвечать не на что — это начало сцены.
      if (mode === "opening" || (mode === "new" && !full.length)) return opening(prov);

      // Предварительная проверка: контекст собирается ДО любых изменений дерева сообщений.
      // Если он не помещается, запрос не уходит и история не получает ни узла, ни варианта.
      const target0 = msgId ? S.messages.find((m) => m.id === msgId) : null;
      // Never build a replacement for a sibling/off-path message: findIndex(-1)
      // would otherwise produce an unrelated history ending one turn early.
      if ((mode === "regen" || mode === "continue") &&
          (!target0 || target0.role !== "assistant" || !full.includes(target0))) {
        ui.toast("Сообщение не принадлежит активной ветке персонажа. Действие отменено.", true);
        return;
      }
      let path = full;
      if (mode === "regen") path = full.slice(0, full.indexOf(target0));
      // Другой вариант первого сообщения персонажа (корень ветки) — это снова начало сцены.
      const rootOpening = mode === "regen" && target0 && !target0.parentId && target0.role === "assistant";
      const extraPost = mode === "continue" ? CONTINUE : rootOpening ? OPENING : "";
      const ms = messenger();
      const msNow = ms ? ms.now() : undefined; // момент переписки для этого хода (выбран при подготовке)
      const built = prism().build(path, extraPost, SCN.forGeneration(full, { mode, targetId: msgId }), Object.assign(rootOpening ? { allowSyntheticUser: false, operation: "opening" } : {}, ms ? { messengerNow: msNow } : {}));
      if (preflightFailed(built, prov)) return;
      if (rootOpening && openingBlocked(built, prov)) return;

      // Reserve the lock BEFORE the first asynchronous IndexedDB write.
      // Without this, another click may switch chats while a pending root is
      // being committed but S.gen still reports idle.
      const ctrl = new AbortController();
      const lock = S.gen = { ctrl, msgId: msgId || "pending", raw: "", reasoning: "", prefix: "" };
      let target, prefix = "";
      try {
        if (mode === "regen") {
          target = S.messages.find((m) => m.id === msgId);
          target.swipes.push({ text: "", sceneOps: [], createdAt: Date.now() });
          target.swipeIdx = target.swipes.length - 1;
        } else if (mode === "continue") {
          target = S.messages.find((m) => m.id === msgId);
          prefix = TR.activeSwipe(target).text;
        } else {
          const draft = chat().newMsg("assistant", c.leafId, "");
          target = await chat().commitMessage(draft, draft.id);
        }
        if (mode !== "new") await chat().putMsg(target);
      } catch (e) {
        if (S.gen === lock) S.gen = null;
        throw e;
      }
      lock.msgId = target.id;
      lock.prefix = prefix ? prefix + (/\s$/.test(prefix) ? "" : " ") : "";
      const sw = TR.activeSwipe(target);
      ui.renderFeed();
      if (S.drawerOpen && S.tab === "prism") ui.renderDrawer();
      ui.scrollBottom();

      const onDelta = (d) => { S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; ui.paintStreaming(); };
      let raw = "", reasoning = "", error = null;
      const rpT0 = now();
      try {
        const imageMessage = ms && prov.kind === "perchance" ? path.slice().reverse().find((m) => m.role === "user") : null;
        const imageDataUrl = imageMessage && TR.activeSwipe(imageMessage).imageDataUrl || null;
        debugRpPayload(c.id, mode, built.messages);
        const res = await LLM.chat(prov, built.messages, {
          names: { char: cd.name, user: ctx.persona().name }, sampler: S.settings.sampler,
          signal: ctrl.signal, onDelta, continueFrom: prefix || null,
          outputFormat: ms ? "message-body" : null,
          imageDataUrl,
        });
        raw = res.text; reasoning = res.reasoning;
      } catch (e) {
        raw = e.partial != null ? e.partial : S.gen.raw;
        reasoning = S.gen.reasoning;
        if (e.name !== "AbortError") error = e.message || String(e);
      }
      perf("roleplayMs", Math.round(now() - rpT0), { msgId: target.id, chatId: c.id, outcome: error ? "error" : mode });
      const th = OA.splitThink(raw || "");
      const parsed = SC.parse(th.text);
      const dr = IC.parseDraws(parsed.text);
      const stateParsed = S.settings.stateToolEnabled ? IC.parseStateCalls(dr.text) : { text:dr.text, calls:[], issues:[] };
      dr.text = stateParsed.text; dr.stateCalls = stateParsed.calls; dr.stateIssues = stateParsed.issues;
      // Даже если модель сама добавила [draw:] без разрешения, картинка не
      // создаётся. Служебный текст при этом всё равно удалён из ответа.
      if (!built.report.imageDirectiveAllowed) dr.draws = [];
      else dr.draws = dr.draws.slice(0, 1);
      // Переписка: [scene:] вырезается из текста, но сцену не пишет (chat/service.sceneFields — только неактивная копия).
      const sf = chat().sceneFields(parsed.ops);
      if (mode === "continue") {
        if (dr.text) sw.text = S.gen.prefix + dr.text;
        sw.sceneOps = (sw.sceneOps || []).concat(sf.sceneOps);
        if (sf.ignoredSceneOps && sf.ignoredSceneOps.length) sw.ignoredSceneOps = (sw.ignoredSceneOps || []).concat(sf.ignoredSceneOps);
        sw.draws = (sw.draws || []).concat(dr.draws);
        if (S.settings.stateToolEnabled) {
        const offset = (sw.stateCalls || []).length;
        sw.stateCalls = (sw.stateCalls || []).concat(dr.stateCalls);
        sw.stateEvents = (sw.stateEvents || []).concat(
          PRP.stateTracker.eventsFromStateCalls(dr.stateCalls, c.mode)
            .map(e => ({ ...e, stateCallIndex: e.stateCallIndex + offset })));
        sw.stateProtocol = 1;
        }
      } else {
        sw.text = dr.text;
        sw.sceneOps = sf.sceneOps;
        if (sf.ignoredSceneOps && sf.ignoredSceneOps.length) sw.ignoredSceneOps = sf.ignoredSceneOps; else delete sw.ignoredSceneOps;
        sw.draws = dr.draws;
        if (S.settings.stateToolEnabled) {
        sw.stateCalls = dr.stateCalls;
        sw.stateEvents = PRP.stateTracker.eventsFromStateCalls(dr.stateCalls, c.mode);
        sw.stateProtocol = 1;
        }
      }
      recordToolStatus(sw, dr.stateIssues);
      sw.reasoning = [sw.reasoning && mode === "continue" ? sw.reasoning : "", reasoning, th.reasoning].filter(Boolean).join("\n").trim();
      if (error) sw.error = error; else delete sw.error;
      /* Метка времени переписки — только у успешного ответа. «Продолжить» дописывает ту же единицу:
         прежняя метка не меняется, новая ставится, только если её не было. Ветка для положения — до этого сообщения. */
      if (ms && !error && !ctrl.signal.aborted &&
          (String(sw.text || "").trim() || dr.draws.length) &&
          !(mode === "continue" && sw.messengerAt)) {
        const snap = ms.snapshot(mode === "new" ? full : path, msNow);
        if (snap) sw.messengerAt = snap;
      }
      // Do not release the generation lock until the final message and preview
      // have reached IndexedDB. Otherwise a second operation can interleave.
      try {
        await chat().putMsg(target);
        await chat().touch();
      } finally {
        S.gen = null;
      }
      prism().refresh();
      ui.renderFeed();
      ui.renderRail();
      if (S.drawerOpen) ui.renderDrawer();
      ui.scrollBottom();
      const shownAt = now();
      // Ответ сохранён и показан, замок снят: разбор и картинка идут отдельно и не держат переписку.
      const post = !error && (String(sw.text || "").trim() || dr.draws.length)
        ? afterReply(target, prov, dr.draws.length ? dr.draws[0] : null) : Promise.resolve(null);
      const reply = { msgId: target.id, chatId: c.id, shownAt, post };
      if (!o.turn) ready(reply); // без хода ничего больше не держит ввод
      return reply;
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
        debugRpPayload(c.id, "opening", built.messages);
        res = await LLM.chat(prov, built.messages, { names: { char: cd.name, user: ctx.persona().name }, sampler: S.settings.sampler, signal: ctrl.signal, onDelta });
      } catch (e) {
        if (e.name !== "AbortError") error = e.message || String(e);
      }
      const aborted = ctrl.signal.aborted;
      let th = null, parsed = null, dr = null;
      if (!aborted && !error) {
        th = OA.splitThink((res && res.text) || "");
        parsed = SC.parse(th.text);
        dr = IC.parseDraws(parsed.text);
        const stateParsed = S.settings.stateToolEnabled ? IC.parseStateCalls(dr.text) : { text:dr.text, calls:[], issues:[] };
        dr.text = stateParsed.text; dr.stateCalls = stateParsed.calls; dr.stateIssues = stateParsed.issues;
        if (!built.report.imageDirectiveAllowed) dr.draws = [];
        else dr.draws = dr.draws.slice(0, 1);
        if (!dr.text.trim()) error = "модель вернула пустой ответ";
      }
      if (aborted || error || S.chatId !== chatId) {
        S.gen = null;
        if (error) ui.toast(`Не удалось начать сцену: ${error}. Можно попробовать ещё раз.`, true);
        prism().refresh();
        ui.renderFeed();
        if (S.drawerOpen) ui.renderDrawer();
        return { ok: false, reason: aborted ? "aborted" : error ? "error" : "chat-changed" };
      }

      const m = chat().newMsg("assistant", null, "");
      m.opening = "generated";
      m.swipes = [{ text: dr.text, ...chat().sceneFields(parsed.ops), draws: dr.draws,
        ...(S.settings.stateToolEnabled ? { stateCalls:dr.stateCalls, stateEvents:PRP.stateTracker.eventsFromStateCalls(dr.stateCalls,c.mode), stateProtocol:1 } : {}), reasoning: [(res && res.reasoning) || "", th.reasoning].filter(Boolean).join("\n").trim(), createdAt: Date.now() }];
      recordToolStatus(m.swipes[0], dr.stateIssues);
      if (ms) { const snap = ms.snapshot([], msNow); if (snap) m.swipes[0].messengerAt = snap; }
      try { await chat().commitMessage(m, m.id); }
      finally { S.gen = null; }
      prism().refresh();
      ui.renderFeed();
      ui.renderRail();
      if (S.drawerOpen) ui.renderDrawer();
      ui.scrollBottom();
      const shownAt = now();
      return { ok: true, msgId: m.id, chatId: c.id, shownAt, post: afterReply(m, prov, dr.draws.length ? dr.draws[0] : null) };
    }

    /* Проверка инициативы (FOUNDATION-D): только переписка и только по явному действию пользователя.
       Транзакция, как у начала сцены: допустимость → поводы → сборка Prism (с разделом поводов и временным указанием)
       → проверка бюджета → вызов модели (поток — только во временном S.gen, в дереве узла нет) → разбор →
       сверка контекста (тот же чат, тот же путь и варианты) → ОДНА запись: новое сообщение (или новый вариант
       сообщения-инициативы при regenId). Отказ [no-message], переполнение, ошибка, отмена, пустой или испорченный
       ответ, смена чата/ветки — ничего не записывают (ни сообщения, ни варианта, ни метки времени).
       Среда, договорённости, мир, опыт, сцена и карточка не меняются никогда.
       → { ok, outcome: "sent" | "declined" | "ineligible" | "overflow" | "error" | "aborted" | "empty" | "malformed" | "stale", code?, msgId? } */
    async function initiative(regenId, opts) {
      const o = opts || {};
      const c0 = ctx.chat();
      // Ход уже принят в этом чате — проверка не запускается; незавершённый разбор — сначала дождаться (видимо).
      if (c0 && !o.turn && S.turn && S.turn.chatId === c0.id) return { ok: false, outcome: "ineligible", code: "busy" };
      if (c0 && !o.turn && !S.gen && state() && state().pending(c0.id)) {
        const w = await waitForState("initiative");
        if (w.refused) { releaseTurn(w.turn); if (w.refused === "context-changed") ui.toast("Пока шёл разбор предыдущего ответа, чат или ветка изменились — проверка не запущена.", true); else if (w.refused === "state-timeout") ui.toast("Разбор предыдущего ответа ещё не завершён. Проверка не запущена.", true); return { ok: false, outcome: "stale" }; }
        let r = null;
        try { r = await initiative(regenId, { turn: w.turn }); return r; }
        finally { releaseTurn(w.turn); ready(r); }
      }
      const c = ctx.chat(), cd = ctx.card(), prov = ctx.provider();
      const ms = messenger();
      const full = c ? chat().path() : [];
      const target = regenId ? S.messages.find((m) => m.id === regenId) : null;
      const regen = !!(target && INI.isInitiative(target));
      const done = (outcome, extra) => Object.assign({ ok: outcome === "sent", outcome }, extra || {});
      if (regenId && !regen) return done("ineligible", { code: "not-initiative" });
      // Другой вариант — только у сообщения на АКТИВНОЙ ветке; иначе контекст был бы неверным (indexOf = -1).
      if (regen && full.indexOf(target) < 0) return done("ineligible", { code: "not-on-path" });
      const path = regen ? full.slice(0, full.indexOf(target)) : full;
      const el = INI.eligibility({ mode: c && c.mode, hasCard: !!cd, generating: !!S.gen, path, provider: prov, singleSystem: !!S.settings.singleSystem, regen });
      if (!el.eligible) {
        if (el.code !== "busy") ui.toast(el.reason, el.code !== "already-initiated" && el.code !== "reply-pending");
        return done("ineligible", { code: el.code });
      }
      // Момент переписки — один раз, при подготовке (живое время — часы, ручное — сохранённое); после ответа не пересчитывается.
      const msNow = ms.now();
      const conv = ms.context(path, msNow).conversation;
      const reasons = INI.reasons(conv, msNow);
      const built = prism().build(path, INI.INSTRUCTION, SCN.forGeneration(path, { mode: "new" }),
        { allowSyntheticUser: false, messengerNow: msNow, initiative: { reasons } });
      if (preflightFailed(built, prov)) return done("overflow");

      const chatId = c.id, key = pathKey(full);
      const ctrl = new AbortController();
      S.gen = { ctrl, msgId: regen ? target.id : INITIATIVE_ID, initiative: true, raw: "", reasoning: "", prefix: "" };
      ui.renderFeed();
      if (S.drawerOpen && S.tab === "prism") ui.renderDrawer();
      ui.scrollBottom();

      const onDelta = (d) => { if (!S.gen) return; S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; ui.paintStreaming(); };
      const vars = { char: cd.name, user: ctx.persona().name };
      let res = null, error = null;
      try {
        debugRpPayload(c.id, "initiative", built.messages);
        res = await LLM.chat(prov, built.messages, { names: vars, sampler: S.settings.sampler, signal: ctrl.signal, onDelta, outputFormat: "message-body", closing: U.macros(INI.CLOSING, vars) });
      } catch (e) {
        if (e.name !== "AbortError") error = e.message || String(e);
      }
      const aborted = ctrl.signal.aborted;
      /* Замок генерации (S.gen) держится до конца записи: пока сообщение сохраняется и меняется leafId, повторная проверка
         и любая другая генерация отклоняются как «busy». Снимается в finally — и при ошибке хранилища тоже, только если он наш. */
      const lock = S.gen;
      const release = () => { if (S.gen === lock) S.gen = null; };
      const finish = (outcome, msg, isErr) => {
        release();
        if (msg) ui.toast(msg, !!isErr);
        prism().refresh();
        ui.renderFeed();
        if (S.drawerOpen) ui.renderDrawer();
        return done(outcome);
      };
      if (aborted) return finish("aborted");
      if (error) return finish("error", `Проверка инициативы не удалась: ${error}. Ничего не изменилось — можно попробовать ещё раз.`, true);
      const th = OA.splitThink((res && res.text) || "");
      const parsed = SC.parse(th.text);
      const dr = IC.parseDraws(parsed.text);
      const stateParsed = S.settings.stateToolEnabled ? IC.parseStateCalls(dr.text) : { text:dr.text, calls:[], issues:[] };
      dr.text = stateParsed.text; dr.stateCalls = stateParsed.calls; dr.stateIssues = stateParsed.issues;
      if (!built.report.imageDirectiveAllowed) dr.draws = [];
      else dr.draws = dr.draws.slice(0, 1);
      const r = INI.parse(dr.text);
      // Ответ пришёл в другой контекст (чат, ветка или вариант сменились) — не дописываем не туда.
      if (S.chatId !== chatId || !ctx.chat() || pathKey(chat().path()) !== key) return finish("stale", "Пока шла проверка, чат или ветка изменились — ответ не сохранён.", true);
      if (r.kind === "decline") return finish("declined", "Персонаж решил пока не писать.");
      if (r.kind === "empty") return finish("empty", "Модель вернула пустой ответ — ничего не сохранено.", true);
      if (r.kind === "malformed") return finish("malformed", "Модель вернула служебный маркер вперемешку с текстом — ответ не сохранён, можно попробовать ещё раз.", true);

      const sw = { text: r.text, ...chat().sceneFields(parsed.ops), draws: dr.draws,
        ...(S.settings.stateToolEnabled ? { stateCalls:dr.stateCalls, stateEvents:PRP.stateTracker.eventsFromStateCalls(dr.stateCalls,c.mode), stateProtocol:1 } : {}),
        reasoning: [(res && res.reasoning) || "", th.reasoning].filter(Boolean).join("\n").trim(), createdAt: Date.now(), initiative: INI.provenance(reasons) };
      recordToolStatus(sw, dr.stateIssues);
      const snap = ms.snapshot(path, msNow);
      if (snap) sw.messengerAt = snap;
      let msg;
      if (lock) lock.committing = true;
      try {
        /* Сообщение (или новый вариант) и чат (leafId, превью) — одной транзакцией (chat/service.commitMessage):
           либо записано всё, либо ничего; память меняется только после успеха. */
        if (regen) {
          const next = JSON.parse(JSON.stringify(target));
          next.swipes.push(sw);
          next.swipeIdx = next.swipes.length - 1;
          msg = await chat().commitMessage(next);
        } else {
          const next = chat().newMsg("assistant", c.leafId, "");
          next.swipes = [sw];
          msg = await chat().commitMessage(next, next.id);
        }
      } catch (e) {
        return finish("error", `Не удалось сохранить сообщение: ${e && (e.message || e.name) || "ошибка хранилища"}.`, true);
      } finally {
        release();
      }
      prism().refresh();
      ui.renderFeed();
      ui.renderRail();
      if (S.drawerOpen) ui.renderDrawer();
      ui.scrollBottom();
      return Object.assign(done("sent"), { msgId: msg.id, chatId: c.id, shownAt: now(), post: afterReply(msg, prov, dr.draws.length ? dr.draws[0] : null) });
    }

    /* PERF-01: отправка реплики пользователя как один ход.
       Реплика принимается сразу, даже пока разбирается предыдущий ответ: она держится в памяти (S.turn),
       узла в дереве нет. Ход привязан к чату и пути (сообщения + свайпы) на момент нажатия.
       Порядок: дождаться разборов этого чата → сверить чат и путь → записать реплику → разобрать её
       (следующей генерации нужны её события) → генерация. Отмена, смена чата/ветки/свайпа — реплика
       не пишется, текст возвращается в поле ввода своего чата (ui.restoreDraft). Двойное нажатие —
       одна реплика: пока ход этого чата не завершён, второй не принимается.
       extra: { messengerAt } — метка переписки, снятая в момент нажатия.
       → { outcome: "busy" | "sent" | "cancelled" | "context-changed" | "left-chat", msgId?, reply? } */
    async function send(text, extra) {
      const c = ctx.chat();
      const body = String(text || "").trim();
      if (!c || !body) return { outcome: "busy" };
      if (S.gen || (S.turn && S.turn.chatId === c.id)) return { outcome: "busy" };
      // Ход, ждущий в другом чате, отменяется: его текст вернётся в тот чат.
      if (S.turn) cancelTurn();
      const pressedAt = now();
      const st = state(), w0 = st && st.pending(c.id);
      // PERF-02B: only with a separately configured processing provider, overlap
      // the read-only user interpretation with an already-running assistant
      // observer. The user message is NOT inserted until the branch gate passes.
      // Provider and input are snapped at send time; stale/cancelled previews
      // have no persistent effect.
      const observerProvider = ctx.processingProvider ? ctx.processingProvider() : ctx.provider();
      const roleProvider = ctx.provider();
      const prepared = w0 && st && st.prepareUser && observerProvider && roleProvider &&
        observerProvider.id !== roleProvider.id ? st.prepareUser(body, observerProvider) : null;
      let turn;
      if (w0) {
        const w = await waitForState("send", { text: body, extra: extra || null, pressedAt });
        turn = w.turn;
        if (w.refused) {
          if (!turn.cancelled) restore(turn, w.refused === "context-changed" ? "Пока разбирался предыдущий ответ, чат, ветка или текст истории изменились — сообщение не отправлено, текст возвращён в поле ввода." : w.refused === "state-timeout" ? "Разбор предыдущего ответа ещё не завершён — сообщение не отправлено, текст возвращён в поле ввода." : "");
          releaseTurn(turn);
          return { outcome: w.refused };
        }
      } else {
        turn = S.turn = { chatId: c.id, kind: "send", key: turnKey(chat().path()), text: body, extra: extra || null, pressedAt, phase: "user-state", at: pressedAt, waitedMs: 0 };
        renderComposer();
      }
      let reply = null;
      try {
        turn.phase = "user-state";
        renderComposer();
        const sent = await chat().addUserMessage(body, extra || null);
        ui.renderFeed();
        ui.scrollBottom();
        // Следующей генерации нужны события этой реплики и всего, что ещё разбирается в этом чате.
        if (st) { await st.track(sent, observerProvider, prepared ? { prepared } : undefined); const settled = await st.settle(c.id); if (settled.timedOut) { ui.toast("Обработка состояния ещё не завершена. Сообщение сохранено, но ответ персонажа не запущен.", true); return { outcome: "state-timeout", msgId: sent.id }; } }
        // Пользователь мог уйти в другой чат или ветку, пока разбиралась его реплика: она сохранена, ответ не запускается.
        if (S.chatId !== turn.chatId || !ctx.chat() || !chat().path().includes(sent)) return { outcome: "left-chat", msgId: sent.id };
        turn.phase = "generating";
        perf("sendToRoleplayMs", Math.round(now() - pressedAt), { chatId: c.id, msgId: sent.id, outcome: w0 ? "queued" : "direct" });
        reply = await generate(null, "new", { turn });
        return { outcome: "sent", msgId: sent.id, reply };
      } finally {
        releaseTurn(turn);
        ready(reply);
      }
    }
    // Ответ показан → переписка снова принимает ввод: сколько прошло (мс). Только число.
    function ready(reply) { if (reply && reply.shownAt != null) perf("readyAfterReplyMs", Math.round(now() - reply.shownAt), { msgId: reply.msgId, chatId: reply.chatId }); }
    function restore(turn, message) {
      if (typeof ui.restoreDraft === "function") ui.restoreDraft(turn.chatId, turn.text);
      if (message) ui.toast(message, true);
    }
    // Отменить ход, ожидающий разбора (кнопка «Отменить» у поля ввода или новый ход в другом чате).
    function cancelTurn() {
      const t = S.turn;
      if (!t || t.phase !== "waiting-state") return false;
      t.cancelled = true;
      if (typeof t.onCancel === "function") t.onCancel();
      if (t.kind === "send") restore(t);
      releaseTurn(t);
      return true;
    }

    function stop() { if (S.gen) S.gen.ctrl.abort(); }

    return { generate, initiative, send, cancelTurn, stop, OPENING, INITIATIVE_ID };
  }

  PRP.generationService = { create };
})(typeof window !== "undefined" ? window : globalThis);
