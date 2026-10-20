/* Prism RP — сервис переписки (прикладной уровень): среда переписки текущего чата.

   • Хранение: коллекция messengerEnvironments, одна запись на чат-переписку (ключ chatId). У сцен (rp) записи нет.
     Старая переписка без записи открывается с пустой средой ТОЛЬКО В ПАМЯТИ (всё неизвестно, живое время,
     пояс браузера); запись появляется при явной правке среды.
   • «Сейчас» переписки: live — часы ctx.clock (в тестах подставные), manual — сохранённое время; само не идёт.
   • Для Prism всё только читается: context() и snapshot() ничего не пишут. Метку времени сообщения
     (messengerAt на варианте) записывают отправка пользователя и успешная генерация — вместе с самим сообщением.
   • Legacy Environment events и договорённости изменяются только явными действиями пользователя.
     НОВЫЙ UT-1: context() / view() читают общий State Tracker поверх legacy-среды;
     автоматические события хранятся В ВАРИАНТАХ СООБЩЕНИЙ, а не дублируются в Environment.
   DOM не трогает; ветку берёт у сервиса чата. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const MT = PRP.messengerTime, ENV = PRP.messengerEnv, CONV = PRP.messengerConversation, BR = PRP.branch;

  const STORE = "messengerEnvironments";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isMessenger = (c) => !!c && c.mode === "messenger";

  function create(ctx) {
    const { S, DB } = ctx;
    const chat = () => ctx.svc.chat;
    const clock = () => (typeof ctx.clock === "function" ? ctx.clock() : Date.now());

    async function load(chatId) {
      const c = (S.chats || []).find((x) => x.id === chatId);
      if (!isMessenger(c)) { S.messengerEnv = null; return null; }
      const rec = await DB.get(STORE, chatId);
      S.messengerEnv = rec ? Object.assign(ENV.normalize(rec, chatId), { persisted: true }) : Object.assign(ENV.blank(chatId), { persisted: false });
      return S.messengerEnv;
    }
    // Среда текущего чата: только своя; у сцены — null. Без записи — пустая среда в памяти (ничего не придумано).
    function current() {
      const c = ctx.chat();
      if (!isMessenger(c)) return null;
      if (S.messengerEnv && S.messengerEnv.chatId === c.id) return S.messengerEnv;
      return Object.assign(ENV.blank(c.id), { persisted: false });
    }
    function now(env) { return MT.nowOf(env || current(), clock); }
    const pathCtx = (p) => chat().pathCtx(p);

    // Положение персонажа на ветке p в момент t (по умолчанию — сейчас).
    function worldAt(p, t) {
      const env = current();
      return ENV.resolveWorld(env, { path: pathCtx(p), now: t !== undefined ? t : now(env) });
    }

    /* Для Prism (только чтение): положение, состояние переписки, время. t — момент, выбранный при подготовке генерации. */
    function context(p, t) {
      const env = current();
      if (!env) return null;
      const path = p || chat().path();
      const at = t !== undefined ? t : now(env);
      const w = ENV.resolveWorld(env, { path: pathCtx(path), now: at });
      // Один трекер для обоих режимов. Старая среда является только
      // совместимым базовым слоем; сообщения дополняют/изменяют его автоматически.
      if (ctx.svc.state) {
        const tracked = ctx.svc.state.context(path, { now: at, legacyWorld: w.world });
        const known = tracked.character;
        for (const field of ["location", "activity", "visualWear", "visualPose", "visualHair", "nearby", "ongoing", "availability"]) {
          if (!Object.prototype.hasOwnProperty.call(known.fieldStatus, field)) continue;
          w.world[field] = known[field];
        }
        w.world.fieldStatus = known.fieldStatus;
        w.world.intentions = known.intentions;
      }
      const conv = CONV.derive(path, { now: at, record: env });
      const open = conv.promises.concat(conv.plans).filter((m) => m.status === "open").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return {
        world: w.world, conversation: conv, plans: open,
        temporal: { now: at, timeZone: env.timeZone, timeMode: env.timeMode },
        report: { activeEvents: w.activeEvents.length, inactiveEvents: w.inactiveEvents.length, warnings: w.warnings.concat(conv.warnings) },
      };
    }
    /* Неизменяемая метка для нового сообщения: момент и положение персонажа на ветке перед ним.
       Мир (пак, линза, наложение) сюда не копируется. → { at, timeZone, world } | null (не переписка или время неизвестно) */
    function snapshot(p, t) {
      const env = current();
      if (!env) return null;
      const at = t !== undefined ? t : now(env);
      if (at == null) return null;
      return { at: MT.toIso(at), timeZone: env.timeZone, world: ENV.resolveWorld(env, { path: pathCtx(p), now: at }).world };
    }
    function stampForNew() { return snapshot(chat().path()); }

    async function persist(next) {
      const rec = clone(next); delete rec.persisted;
      await DB.put(STORE, rec);
      S.messengerEnv = Object.assign(ENV.normalize(rec, rec.chatId), { persisted: true });
      return S.messengerEnv;
    }
    /* Новая переписка: явная настройка времени при создании. → { env } | { error } */
    function checkSetup(setup) {
      const s = setup || {};
      if (!MT.validTimeZone(s.timeZone)) return "Неизвестный часовой пояс.";
      if (s.timeMode === "manual" && MT.toMs(s.manualNow) == null) return "Для ручного времени укажите дату и время.";
      return null;
    }
    async function createFor(chatId, setup) {
      const err = checkSetup(setup);
      if (err) return { error: err };
      return { env: await persist(ENV.blank(chatId, setup)) };
    }
    // Явная смена пояса, режима или ручного времени. Записанные метки сообщений не меняются.
    async function setTime(t) {
      const env = current();
      if (!env) return { error: "Это не переписка." };
      const x = t || {};
      const next = clone(env);
      if (x.timeZone !== undefined) { if (!MT.validTimeZone(x.timeZone)) return { error: "Неизвестный часовой пояс." }; next.timeZone = x.timeZone; }
      if (x.timeMode !== undefined) next.timeMode = x.timeMode === "manual" ? "manual" : "live";
      if (next.timeMode === "manual") {
        const ms = x.manualNow !== undefined ? MT.toMs(x.manualNow) : MT.toMs(next.manualNow) != null ? MT.toMs(next.manualNow) : clock();
        if (ms == null) return { error: "Укажите дату и время." };
        next.manualNow = MT.toIso(ms);
      } else next.manualNow = null;
      return { env: await persist(next) };
    }
    async function advance(minutes) {
      const env = current();
      if (!env || env.timeMode !== "manual") return { error: "Сдвигать время можно только в ручном режиме." };
      return setTime({ manualNow: MT.toIso(MT.toMs(env.manualNow) + minutes * 60000) });
    }

    // Явная правка положения: черновик → привязка → проверка → запись. Ветку без сообщений не к чему привязать.
    async function commitEvent(draft) {
      const env = current();
      if (!env) return { error: "Это не переписка." };
      const d = draft || {};
      const anchor = d.scope === "branch" ? BR.anchorOf(pathCtx(chat().path())) : null;
      const e = ENV.makeEvent(Object.assign({}, d, { anchor, effectiveAt: d.effectiveAt !== undefined ? d.effectiveAt : MT.toIso(now(env)) }));
      const issues = ENV.validateEvent(e);
      if (ENV.hasErrors(issues)) return { error: issues.filter((x) => x.level === "error").map((x) => x.message).join(" "), issues };
      const next = clone(env); next.events.push(e);
      await persist(next);
      return { event: e };
    }
    async function addMarker(d) {
      const env = current();
      if (!env) return { error: "Это не переписка." };
      const x = d || {};
      const anchor = x.scope === "branch" ? BR.anchorOf(pathCtx(chat().path())) : null;
      const e = CONV.makeMarkerEvent(Object.assign({}, x, { op: "add", anchor }));
      const issues = CONV.validateMarkerEvent(e);
      if (ENV.hasErrors(issues)) return { error: issues.filter((y) => y.level === "error").map((y) => y.message).join(" "), issues };
      const next = clone(env); next.conversationEvents.push(e);
      await persist(next);
      return { marker: e };
    }
    async function markerStatus(markerId, status, scope) {
      const env = current();
      if (!env) return { error: "Это не переписка." };
      const visible = CONV.resolveMarkers(env, { path: pathCtx(chat().path()) }).markers.some((m) => m.id === markerId);
      if (!visible) return { error: "Этой договорённости нет на этой ветке." };
      const anchor = scope === "branch" ? BR.anchorOf(pathCtx(chat().path())) : null;
      const e = CONV.makeMarkerEvent({ op: "status", markerId, status, scope, anchor });
      const issues = CONV.validateMarkerEvent(e);
      if (ENV.hasErrors(issues)) return { error: issues.filter((y) => y.level === "error").map((y) => y.message).join(" "), issues };
      const next = clone(env); next.conversationEvents.push(e);
      await persist(next);
      return { marker: e };
    }

    // Чат удалён — его среда тоже. Мир, пак, линза и наложение не трогаются.
    async function removeForChat(chatId) {
      await DB.del(STORE, chatId);
      if (S.messengerEnv && S.messengerEnv.chatId === chatId) S.messengerEnv = null;
    }

    /* Восстановление бэкапа: проверка ДО записи (та же дисциплина, что у мира чата).
       Запись принимается, только если: проходит проверку формы; её чат — ПЕРЕПИСКА там, куда восстанавливаем
       (замена — только чаты бэкапа; добавление — чаты бэкапа ∪ существующие); она единственная для своего чата.
       Запись для сцены — отклоняется; несколько записей одного чата — отклоняются все. Ничего не переназначается.
       При добавлении режим уже существующего чата берётся ЛОКАЛЬНЫЙ (он главнее входящего чата с тем же id).
       opts: { replace, existingChats: [{ id, mode }] } → { data, rejected, warnings, issues } */
    function checkBackup(data, opts) {
      if (!data || !Array.isArray(data[STORE])) return { data, rejected: 0, warnings: 0, issues: [] };
      const o = opts || {};
      const replace = o.replace !== false;
      const mode = new Map();
      for (const c of Array.isArray(data.chats) ? data.chats : []) if (c && c.id) mode.set(String(c.id), c.mode);
      if (!replace) for (const c of o.existingChats || []) if (c && c.id) mode.set(String(c.id), c.mode); // локальный режим главнее
      const per = new Map();
      for (const r of data[STORE]) { const id = r && typeof r === "object" ? String(r.chatId || "").trim() : ""; if (id) per.set(id, (per.get(id) || 0) + 1); }
      const issues = [], ok = [];
      let rejected = 0, warnings = 0;
      for (const r of data[STORE]) {
        const iss = ENV.validateRecord(r);
        if (ENV.hasErrors(iss)) { rejected++; issues.push(...iss.filter((x) => x.level === "error")); continue; }
        const chatId = String(r.chatId).trim();
        const reject = (code, message) => { rejected++; issues.push({ level: "error", code, message, chatId }); };
        if (per.get(chatId) > 1) { reject("env-duplicate-chat", "В бэкапе несколько записей среды для одного чата — ни одна не восстановлена."); continue; }
        if (!mode.has(chatId)) { reject("env-orphan-chat", "Среда относится к чату, которого нет" + (replace ? " в бэкапе." : " ни в бэкапе, ни здесь.")); continue; }
        if (mode.get(chatId) !== "messenger") { reject("env-not-messenger", "Среда переписки относится к сцене, а не к переписке."); continue; }
        warnings += iss.length;
        ok.push(ENV.normalize(r));
      }
      return { data: Object.assign({}, data, { [STORE]: ok }), rejected, warnings, issues };
    }

    // Для вкладки «Среда».
    function view() {
      const env = current();
      if (!env) return null;
      const path = chat().path();
      const t = now(env);
      const w = ENV.resolveWorld(env, { path: pathCtx(path), now: t });
      if (ctx.svc.state) {
        const tracked = ctx.svc.state.context(path, { now: t, legacyWorld: w.world });
        const known = tracked.character;
        for (const field of ["location", "activity", "visualWear", "visualPose", "visualHair", "nearby", "ongoing", "availability"]) {
          if (!Object.prototype.hasOwnProperty.call(known.fieldStatus, field)) continue;
          w.world[field] = known[field];
        }
        w.world.fieldStatus = known.fieldStatus;
        w.world.intentions = known.intentions;
      }
      const conv = CONV.derive(path, { now: t, record: env });
      const last = path[path.length - 1];
      const stateStatus = last && last.swipes && last.swipes[last.swipeIdx || 0] && last.swipes[last.swipeIdx || 0].stateStatus || null;
      return { env, now: t, world: w.world, events: w.events, warnings: w.warnings.concat(conv.warnings),
        conversation: conv, canBranch: path.length > 0, stateStatus,
        statePending: !!S.tracking && !(stateStatus && last && stateStatus.sourceText === last.swipes[last.swipeIdx || 0].text) };
    }

    return { load, current, now, worldAt, context, snapshot, stampForNew, createFor, checkSetup, setTime, advance, commitEvent, addMarker, markerStatus, removeForChat, checkBackup, view, STORE };
  }

  PRP.messengerService = { create };
})(typeof window !== "undefined" ? window : globalThis);
