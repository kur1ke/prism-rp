/* Prism RP — состояние переписки (CONVERSATION). Чистый модуль.

   Выводится из АКТИВНОЙ ветки каждый раз заново; отдельной изменяемой копии не хранится.
   Из структуры сообщений (детерминированно): кто писал последним, сколько сообщений подряд без ответа,
   когда было последнее сообщение (по его неизменяемой метке времени переписки), сколько прошло.
   Открыта ли переписка — небольшое правило с объяснением (state, reason), а не «последним писал персонаж → закрыта».
   Это сведения для Prism и будущей логики инициативы; сам модуль ничего не начинает и не отправляет.

   Договорённости (promises/plans) — только явные записи пользователя (conversationEvents),
   из текста сообщений ничего не извлекается. События договорённостей:
     { id, op: "add", kind: "promise" | "plan", text, scope, provenance, createdAt }
     { id, op: "status", markerId, status: "open" | "done" | "cancelled", scope, provenance, createdAt }
   Видимость по ветке — то же правило chat/branch, что у среды, опыта и мира чата.
   Без DOM, хранилища, сети, таймеров и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const ENV = PRP.messengerEnv || (typeof require !== "undefined" ? require("./environment.js") : null);
  const MT = PRP.messengerTime || (typeof require !== "undefined" ? require("./time.js") : null);

  const KINDS = ["promise", "plan"];
  const STATUSES = ["open", "done", "cancelled"];
  const QUIET_MS = 12 * 3600 * 1000; // после стольких часов без ответа переписка считается затихшей
  const RETURN_GAP_MS = 60 * 60 * 1000; // long absence before a user returns

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (v == null ? "" : String(v));
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const swipeOf = (m) => (m && m.swipes && m.swipes.length ? m.swipes[Math.min(m.swipeIdx || 0, m.swipes.length - 1)] : {});
  const issue = (level, code, message, ref) => Object.assign({ level, code, message }, ref != null ? { ref: String(ref) } : {});

  function makeMarkerEvent(d) {
    const x = isObj(d) ? d : {};
    const scope = str(x.scope), a = isObj(x.anchor) ? x.anchor : null;
    const base = { id: str(x.id).trim() || uid("mk"), op: x.op === "status" ? "status" : "add", scope,
      provenance: scope === "branch" && a ? { anchorId: str(a.anchorId), messageIds: (a.messageIds || []).map(String), swipes: Object.assign({}, a.swipes || {}) } : null,
      createdAt: Number(x.createdAt) || Date.now() };
    if (base.op === "add") return Object.assign(base, { kind: str(x.kind), text: str(x.text).trim() });
    return Object.assign(base, { markerId: str(x.markerId).trim(), status: str(x.status) });
  }
  function validateMarkerEvent(e) {
    const out = [];
    if (!isObj(e)) return [issue("error", "marker-malformed", "Запись договорённости не является объектом.")];
    const id = str(e.id).trim();
    if (!id) out.push(issue("error", "marker-no-id", "У записи договорённости нет id."));
    ENV.checkScope(e, out, id);
    if (e.op === "add") {
      if (!KINDS.includes(e.kind)) out.push(issue("error", "marker-kind", "Вид договорённости: обещание или план.", id));
      if (!str(e.text).trim()) out.push(issue("error", "marker-empty", "Пустая договорённость.", id));
    } else if (e.op === "status") {
      if (!str(e.markerId).trim()) out.push(issue("error", "marker-no-target", "Не указано, к какой договорённости относится отметка.", id));
      if (!STATUSES.includes(e.status)) out.push(issue("error", "marker-status", "Статус: открыто, выполнено или отменено.", id));
    } else out.push(issue("error", "marker-op", "Неизвестное действие с договорённостью.", id));
    return out;
  }

  /* Договорённости, видимые на активной ветке. → { markers: [{ id, kind, text, status, scope, createdAt }], rows, warnings } */
  function resolveMarkers(record, c) {
    const cx = c || {};
    const o = ENV.order(record && Array.isArray(record.conversationEvents) ? record.conversationEvents : [], cx.path, null, validateMarkerEvent);
    const byId = new Map(), list = [], warnings = o.warnings.slice();
    for (const { e, row } of o.active) {
      if (e.op === "add") {
        if (byId.has(e.id)) { row.reason = "повтор id"; continue; }
        const m = { id: e.id, kind: e.kind, text: e.text, status: "open", scope: e.scope, createdAt: e.createdAt };
        byId.set(e.id, m); list.push(m);
      } else {
        const m = byId.get(e.markerId);
        if (!m) { row.reason = "договорённости нет на этой ветке — отметка не применена"; warnings.push({ level: "warning", code: "marker-target-missing", message: `Отметка ${e.id} относится к договорённости, которой нет на этой ветке.`, ref: e.markerId }); continue; }
        m.status = e.status;
      }
    }
    return { markers: list, rows: o.rows, warnings };
  }

  /* path — активная ветка (сообщения с вариантами), от корня; o: { now: мс | null, record } */
  function derive(path, o) {
    const opt = o || {};
    const p = (path || []).filter((m) => m && (m.role === "user" || m.role === "assistant"));
    const last = p[p.length - 1] || null;
    let trailing = 0;
    for (let i = p.length - 1; i >= 0 && last && p[i].role === last.role; i--) trailing++;
    const sw = swipeOf(last);
    const lastAt = last && sw.messengerAt ? MT.toMs(sw.messengerAt.at) : null;
    const now = opt.now != null ? opt.now : null;
    const elapsedMs = lastAt != null && now != null ? now - lastAt : null;
    const warnings = [];
    if (last && lastAt == null) warnings.push({ level: "warning", code: "time-unknown", message: "У последнего сообщения нет времени переписки (старое сообщение или ответ прерван) — сколько прошло, неизвестно." });
    if (elapsedMs != null && elapsedMs < 0) warnings.push({ level: "warning", code: "time-before-last", message: "Текущее время переписки раньше последнего сообщения." });
    // After a new user message, lastMessageAt points to this new message and
    // elapsedSinceLastMessage becomes ~0. Recover the actual preceding gap
    // from stamps on the active selected path, without inventing activities.
    let returnGap = null;
    if (last && last.role === "user") {
      let firstUser = p.length - 1;
      while (firstUser > 0 && p[firstUser - 1].role === "user") firstUser--;
      const before = p[firstUser - 1];
      if (before && before.role === "assistant") {
        const prev = swipeOf(before), returned = swipeOf(p[firstUser]);
        const fromMs = MT.toMs(prev.messengerAt && prev.messengerAt.at);
        const toMs = MT.toMs(returned.messengerAt && returned.messengerAt.at);
        if (fromMs != null && toMs != null && toMs - fromMs >= RETURN_GAP_MS &&
            (now == null || now >= toMs)) {
          returnGap = { from: MT.toIso(fromMs), to: MT.toIso(toMs),
            elapsedMs: toMs - fromMs, elapsedWords: MT.elapsedWords(toMs - fromMs),
            fromMessageId: before.id, fromSwipeIdx: before.swipeIdx || 0,
            returnMessageId: p[firstUser].id, returnSwipeIdx: p[firstUser].swipeIdx || 0 };
        }
      }
    }

    let state, open, reason;
    if (!last) { state = "empty"; open = false; reason = "переписка ещё не начата"; }
    else if (last.role === "user") { state = "awaiting-character"; open = true; reason = `последние сообщения от {{user}} без ответа: ${trailing}`; }
    else if (elapsedMs != null && elapsedMs >= QUIET_MS) { state = "quiet"; open = false; reason = `после ответа {{char}} прошло ${MT.elapsedWords(elapsedMs)} без продолжения`; }
    else if (/[?？]\s*$/.test(str(sw.text).trim())) { state = "awaiting-user"; open = true; reason = "{{char}} задал(а) вопрос и ждёт ответа"; }
    else { state = "idle"; open = true; reason = "{{char}} ответил(а); вопрос не задан, разговор может продолжиться"; }

    const mk = resolveMarkers(opt.record, { path: (path || []).map((m) => ({ id: m.id, swipeIdx: m.swipeIdx || 0 })) });
    return {
      lastSender: last ? last.role : null,
      unansweredUserCount: last && last.role === "user" ? trailing : 0,
      unansweredAssistantCount: last && last.role === "assistant" ? trailing : 0,
      open, state, reason,
      lastMessageAt: lastAt != null ? MT.toIso(lastAt) : null,
      elapsedMs: elapsedMs != null && elapsedMs >= 0 ? elapsedMs : null,
      elapsedSinceLastMessage: elapsedMs != null && elapsedMs >= 0 ? MT.elapsedWords(elapsedMs) : null,
      returnGap,
      promises: mk.markers.filter((m) => m.kind === "promise"),
      plans: mk.markers.filter((m) => m.kind === "plan"),
      markerRows: mk.rows,
      warnings: warnings.concat(mk.warnings),
    };
  }

  PRP.messengerConversation = { KINDS, STATUSES, QUIET_MS, RETURN_GAP_MS, makeMarkerEvent, validateMarkerEvent, resolveMarkers, derive };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.messengerConversation;
})(typeof window !== "undefined" ? window : globalThis);
