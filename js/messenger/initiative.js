/* Prism RP — инициатива персонажа в переписке (FOUNDATION-D). Чистый модуль.

   Только по явному действию пользователя («Проверить инициативу»): ни таймеров, ни фона, ни расписаний.
   Цепочка: СУЩЕСТВУЮЩЕЕ СОСТОЯНИЕ → ДОПУСТИМОСТЬ → ВОЗМОЖНЫЕ ПОВОДЫ → PRISM → РЕШЕНИЕ ПЕРСОНАЖА → СООБЩЕНИЕ ИЛИ НИЧЕГО.
     • Допустимость (eligibility) — можно ли вообще проверять: структурные правила, а не желание персонажа.
     • Возможные поводы (reasons) — уже известные обстоятельства: открытые договорённости пользователя
       и долгое молчание (≥ 12 ч по времени переписки). Это возможность, не обязанность и не приказ.
       Повод «внешних нет» тоже нормален: личный повод модель выводит из характера и опыта сама.
       Срок договорённости не угадывается (в модели договорённостей нет времени) — «завтра» не становится датой.
     • Решение — за моделью: сообщение или ровно [no-message].
   Этот модуль ничего не пишет и не вызывает модель. Без DOM, хранилища, сети, таймеров и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const CONV = PRP.messengerConversation || (typeof require !== "undefined" ? require("./conversation.js") : null);
  const MT = PRP.messengerTime || (typeof require !== "undefined" ? require("./time.js") : null);

  const SCHEMA = 1;
  const DECLINE = "[no-message]";
  const QUIET_MS = CONV.QUIET_MS; // 12 ч — тот же порог «затихшей» переписки (FOUNDATION-C)
  const MAX_MARKERS = 5;

  const str = (v) => (v == null ? "" : String(v));
  const swipeOf = (m) => (m && m.swipes && m.swipes.length ? m.swipes[Math.min(m.swipeIdx || 0, m.swipes.length - 1)] : {});

  // Логическое сообщение — инициатива, если хоть один его вариант создан проверкой инициативы.
  const isInitiative = (m) => !!(m && m.role === "assistant" && (m.swipes || []).some((s) => s && s.initiative && s.initiative.trigger === "user-check"));

  /* Не больше одной инициативы подряд: среди сообщений после последней реплики пользователя на АКТИВНОМ пути
     уже есть сообщение-инициатива. Только структура ветки — без времени и без скрытых счётчиков. */
  function consecutiveBlocked(path) {
    const p = path || [];
    for (let i = p.length - 1; i >= 0 && p[i].role !== "user"; i--) if (isInitiative(p[i])) return true;
    return false;
  }

  /* Допустимость проверки. o: { mode, hasCard, generating, path, provider: { kind }, singleSystem, regen }
     regen — другой вариант уже существующего сообщения-инициативы: правила «ждёт ответа» и «подряд» к нему не применяются
     (это та же логическая единица, второй инициативы не появляется).
     → { eligible, code, reason } */
  function eligibility(o) {
    const x = o || {};
    const no = (code, reason) => ({ eligible: false, code, reason });
    if (x.mode !== "messenger") return no("not-messenger", "Инициатива есть только в переписке.");
    if (!x.hasCard) return no("no-card", "Нет персонажа.");
    if (x.generating) return no("busy", "Уже идёт генерация.");
    if (!x.provider) return no("no-provider", "Модель не подключена.");
    // Без фальшивой реплики пользователя: строгому шаблону (одно системное сообщение у OpenAI-совместимого сервера)
    // нужен ход пользователя последним, а у проверки инициативы его по определению нет.
    if (x.singleSystem && x.provider.kind !== "perchance") return no("needs-user-first", "В режиме «Одно системное сообщение» строгий шаблон модели требует, чтобы последним писал пользователь; подделывать реплику Prism не будет. Выключите этот режим в «Настройки → Генерация» или используйте Perchance.");
    if (!x.regen) {
      const p = x.path || [];
      const last = p[p.length - 1];
      if (last && last.role === "user") return no("reply-pending", "Последним писали вы — это обычный ответ, а не инициатива.");
      if (consecutiveBlocked(p)) return no("already-initiated", "Персонаж уже написал первым — дождитесь вашего ответа.");
    }
    return { eligible: true, code: "ok", reason: "" };
  }

  /* Возможные поводы — детерминированно из уже известного. conv — messenger/conversation.derive(path, { now, record }).
     → [{ id, kind, status, label, value }] (в порядке: договорённости, затем молчание) */
  function reasons(conv, now) {
    const c = conv || {};
    const out = [];
    const open = (c.promises || []).concat(c.plans || []).filter((m) => m.status === "open")
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, MAX_MARKERS);
    for (const m of open) out.push({ id: "marker:" + m.id, kind: "open-marker", status: "ESTABLISHED", label: m.kind === "promise" ? "открытое обещание" : "открытый план", value: str(m.text) });
    const lastAt = c.lastMessageAt ? MT.toMs(c.lastMessageAt) : null;
    if (lastAt != null && now != null && now - lastAt >= QUIET_MS) out.push({ id: "quiet", kind: "quiet", status: "DERIVED", label: "молчание с последнего сообщения", value: MT.elapsedWords(now - lastAt) });
    return out;
  }

  /* Разбор ответа модели (после отделения рассуждения). Строго:
     • весь очищенный ответ (без пробелов по краям, без регистра) — ровно [no-message] → отказ;
     • пусто → empty; маркер внутри обычного текста → malformed (служебный маркер в историю не попадает никогда);
     • иначе — сообщение. → { kind: "decline" | "message" | "empty" | "malformed", text } */
  function parse(text) {
    const t = str(text).trim();
    if (!t) return { kind: "empty", text: "" };
    if (t.toLowerCase() === DECLINE) return { kind: "decline", text: "" };
    if (t.toLowerCase().includes(DECLINE)) return { kind: "malformed", text: t };
    return { kind: "message", text: t };
  }

  // Происхождение варианта: только метаданные (не факт мира, не опыт).
  function provenance(list) { return { schema: SCHEMA, trigger: "user-check", reasonIds: (list || []).map((r) => r.id) }; }

  // Временное указание операции (в историю не попадает; считается в бюджете).
  const INSTRUCTION = [
    "Проверка инициативы: {{user}} не присылал(а) нового сообщения. Реши, захотел(а) бы {{char}} сейчас сам(а) написать {{user}}.",
    "Писать не обязательно: промолчать — нормальный выбор. Прошедшее время — обстоятельство, а не приказ; договорённости — свидетельства, а не команды.",
    "Если повод есть, он должен следовать из характера, опыта и известного; не выдумывай как факт события вне переписки. Не пиши за {{user}}.",
    "Если {{char}} сейчас не пишет — ответь ровно " + DECLINE + " и ничего больше. Иначе — только текст сообщения {{char}}.",
  ].join("\n");
  // Последняя строка инструкции Perchance (вместо «Напиши следующее сообщение»).
  const CLOSING = "Реши за {{char}}: написать {{user}} сейчас первым или нет. Если нет — ответь ровно " + DECLINE + ". Если да — только сообщение {{char}}, без пометок и без текста за {{user}}.";

  PRP.messengerInitiative = { SCHEMA, DECLINE, QUIET_MS, MAX_MARKERS, isInitiative, consecutiveBlocked, eligibility, reasons, parse, provenance, INSTRUCTION, CLOSING, swipeOf };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.messengerInitiative;
})(typeof window !== "undefined" ? window : globalThis);
