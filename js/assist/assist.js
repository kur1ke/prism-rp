/* Prism RP — ассистент: разговор с самой моделью вне ролевой игры.
   Консультации по карточкам, сценам, промптам, разбор чата. Модель здесь —
   помощник автора, а не персонаж; Prism-рамка (Card/Experience/Scene) не применяется.
   По желанию к разговору подключается карточка персонажа и выдержка из его чата. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util;

  const SYSTEM = [
    "Ты — ассистент внутри Prism RP, среды для ролевой игры с ИИ-персонажами. Сейчас ты говоришь с автором напрямую, вне игры: ты не персонаж и не продолжаешь сцену, если тебя об этом прямо не просят.",
    "Помогаешь с тем, что нужно автору: писать и улучшать карточки персонажей (поля Character Card V2: description, personality, scenario, first_mes, alternate_greetings, mes_example, system_prompt, post_history_instructions, лорбук), придумывать сюжетные ходы и приветствия, разбирать, почему персонаж ведёт себя так или иначе, подбирать теги для картинок (danbooru) и настройки моделей.",
    "Как устроен Prism RP: карточка задаёт склонности персонажа, а не команды; опыт — свидетельства прошлого, а не инструкции; сцену (время, место, одежду, отношения) ведёт приложение. Хорошая карточка описывает характер через конкретные привычки и реакции, а не через списки прилагательных.",
    "Отвечай по существу и на языке собеседника. Если просят текст для поля карточки — дай готовый текст, который можно скопировать целиком. Если вопрос неясен — уточни одним вопросом.",
  ].join("\n\n");

  // need: "" — без персонажа, "card" — нужен персонаж, "chat" — нужен и чат.
  const STARTERS = [
    { need: "", t: "Помоги придумать персонажа", q: "Помоги придумать нового персонажа для ролевой игры. Сначала задай мне 3–4 вопроса, потом собери черновик карточки по полям." },
    { need: "", t: "Как написать живую карточку", q: "Как написать карточку персонажа, чтобы он ощущался живым, а не набором прилагательных? Дай короткие правила и небольшой пример." },
    { need: "", t: "Какую модель выбрать", q: "Какие модели и настройки генерации лучше подходят для ролевой игры на русском языке? Учти, что у меня может быть бесплатная модель Perchance или локальная модель." },
    { need: "card", t: "Улучши описание персонажа", q: "Посмотри на описание персонажа и предложи, как сделать его живее: что убрать, что добавить. Затем дай переписанный вариант целиком." },
    { need: "card", t: "Придумай приветствие", q: "Придумай альтернативное приветствие для этого персонажа — другая ситуация знакомства, 2–3 абзаца." },
    { need: "card", t: "Теги для картинок", q: "Составь теги danbooru для внешности и основных нарядов этого персонажа в формате гардероба Prism: «название | alias: теги»." },
    { need: "chat", t: "Разбери поведение в чате", q: "Почему персонаж в этом чате ведёт себя именно так? Что в карточке или контексте на это влияет и что поправить, если я хочу иначе?" },
    { need: "chat", t: "Куда развить сюжет", q: "Предложи три разных направления, куда можно развить сюжет этого чата дальше, и как подтолкнуть к каждому своей репликой." },
  ];
  function starters(hasCard, hasChat) {
    return STARTERS.filter((x) => (x.need === "" && !hasCard) || (x.need === "card" && hasCard) || (x.need === "chat" && hasChat));
  }


  // Карточка → компактный текст для контекста ассистента.
  function cardText(card) {
    if (!card) return "";
    const f = (label, v) => (v && String(v).trim() ? `${label}:\n${String(v).trim()}` : "");
    const alts = (card.altGreetings || []).filter(Boolean);
    const lore = (card.lore || []).filter((e) => e && e.content).slice(0, 20)
      .map((e) => `- [${(e.keys || []).join(", ") || "без ключей"}${e.constant ? ", постоянная" : ""}] ${e.content}`).join("\n");
    const im = card.image || {};
    return [
      `Имя: ${card.name}`,
      f("Описание (description)", card.description),
      f("Личность (personality)", card.personality),
      f("Сценарий (scenario)", card.scenario),
      f("Первое сообщение (first_mes)", card.firstMes),
      alts.length ? `Альтернативные приветствия: ${alts.length}` : "",
      f("Примеры диалогов (mes_example)", card.mesExample),
      f("Системный промпт карточки", card.systemPrompt),
      f("Инструкции после истории", card.postHistory),
      lore ? `Лорбук:\n${lore}` : "",
      im.trigger || im.wardrobe || im.look ? f("Изображения — триггер", im.trigger) + (im.look ? `\nВнешность для картинок:\n${im.look}` : "") + (im.wardrobe ? `\nГардероб:\n${im.wardrobe}` : "") : "",
    ].filter(Boolean).join("\n\n");
  }

  // Последние сообщения чата → стенограмма (самые свежие важнее, режем с начала).
  function chatText(lines, budgetTokens) {
    const out = [];
    let used = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const s = `${lines[i].name}: ${lines[i].text}`;
      const c = U.estimateTokens(s) + 2;
      if (used + c > budgetTokens) break;
      out.unshift(s); used += c;
    }
    const cut = lines.length - out.length;
    return (cut > 0 ? `(ранние ${cut} сообщ. не поместились)\n\n` : "") + out.join("\n\n");
  }

  /* o: { system, card, chatLines, sceneLine, userName, history:[{role,text}], contextTokens, reserveTokens }
     → { messages, report } */
  function build(o) {
    const budget = Math.max(1024, (o.contextTokens || 8192) - (o.reserveTokens || 1200));
    const sys = [o.system || SYSTEM];
    if (o.userName) sys.push(`Собеседника зовут ${o.userName}.`);
    let used = U.estimateTokens(sys.join("\n\n"));
    const ct = cardText(o.card);
    if (ct) { const b = `### Карточка персонажа, о котором идёт речь\n${ct}`; sys.push(b); used += U.estimateTokens(b); }
    const hist = o.history || [];
    // История разговора с ассистентом: от новых к старым.
    const kept = [];
    let histBudget = Math.max(600, Math.floor((budget - used) * (o.chatLines && o.chatLines.length ? 0.5 : 1)));
    for (let i = hist.length - 1; i >= 0; i--) {
      const c = U.estimateTokens(hist[i].text) + 4;
      if (c > histBudget && kept.length) break;
      kept.unshift(hist[i]); histBudget -= c; used += c;
    }
    let chatBlock = "";
    if (o.chatLines && o.chatLines.length) {
      chatBlock = `### Выдержка из ролевого чата${o.sceneLine ? ` (сцена сейчас: ${o.sceneLine})` : ""}\n${chatText(o.chatLines, Math.max(300, budget - used))}`;
      sys.push(chatBlock);
      used += U.estimateTokens(chatBlock);
    }
    const messages = [{ role: "system", content: sys.join("\n\n") }]
      .concat(kept.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text })));
    return { messages, report: { budget, used, historyKept: kept.length, historyTotal: hist.length, card: !!ct, chat: !!chatBlock } };
  }

  // Заголовок разговора по первой реплике.
  function title(text) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length > 48 ? s.slice(0, 46).replace(/\s+\S*$/, "") + "…" : s || "Новый разговор";
  }

  function blank(ctx) {
    const now = Date.now();
    return { id: U.uid("as"), title: "Новый разговор", messages: [], ctx: Object.assign({ cardId: null, chatId: null }, ctx || {}), createdAt: now, updatedAt: now };
  }

  PRP.assist = { SYSTEM, STARTERS, starters, cardText, chatText, build, title, blank };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.assist;
})(typeof window !== "undefined" ? window : globalThis);
