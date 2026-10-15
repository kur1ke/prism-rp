/* Prism RP — сборщик контекста.
   Prism не хранится: на каждом ходе он собирается из Card + Scene + релевантного
   Experience. Каждый слой подаётся своей формулировкой, чтобы модель читала
   склонности и воспоминания как контекст восприятия, а не как приказы. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util || (typeof require !== "undefined" ? require("../core/util.js") : null);
  const SCENE = PRP.scene || (typeof require !== "undefined" ? require("./scene.js") : null);
  const EXP = PRP.experience || (typeof require !== "undefined" ? require("./experience.js") : null);

  const TEMPLATES = {
    rp: {
      frame:
        "Ты ведёшь ролевую игру за {{char}}. Собеседник играет {{user}}.\n" +
        "Решай, как {{char}} поступит именно сейчас, исходя из сцены, характера и памяти. " +
        "Черты характера влияют на то, как {{char}} воспринимает происходящее, но не предписывают поступков. " +
        "Воспоминания — свидетельства прошлого: {{char}} может поступить вопреки им, но не забывает их без причины. " +
        "Не пиши реплики, мысли и действия за {{user}}.",
      card: "Склонности и характер {{char}} (влияют на восприятие, не диктуют поступки)",
      memory: "Что {{char}} помнит (свидетельства прошлого; {{char}} может действовать вопреки им, но не забывает их)",
      scene: "Сейчас (факты)",
      persona: "Кто такой {{user}}",
      lore: "Сведения о мире",
      examples: "Примеры манеры речи {{char}} (стиль, не сюжет)",
    },
    messenger: {
      frame:
        "{{char}} переписывается с {{user}} в мессенджере. Пиши только сообщения, которые {{char}} отправляет: " +
        "коротко, живо, в манере {{char}}, без описаний действий, прозы и ремарок в звёздочках. " +
        "Можно отправить несколько сообщений подряд — разделяй их пустой строкой. " +
        "Черты характера влияют на восприятие, но не предписывают поступков; воспоминания — свидетельства прошлого, а не инструкции. " +
        "Не пиши за {{user}}.",
      card: "Склонности и характер {{char}} (влияют на восприятие, не диктуют поступки)",
      memory: "Что {{char}} помнит (свидетельства прошлого; {{char}} может действовать вопреки им, но не забывает их)",
      scene: "Жизнь {{char}} сейчас, вне переписки (видит только {{char}}; рассказывает о ней, только если сам(а) захочет)",
      persona: "Кто такой {{user}}",
      lore: "Сведения о мире",
      examples: "Примеры манеры {{char}} (стиль, не сюжет)",
    },
  };

  function matchLore(entries, text) {
    const low = String(text || "").toLowerCase();
    return (entries || [])
      .filter((e) => e && e.enabled !== false && e.content)
      .filter((e) => e.constant || (e.keys || []).some((k) => k && low.includes(String(k).toLowerCase().trim())))
      .sort((a, b) => (a.insertion_order || 0) - (b.insertion_order || 0));
  }

  function section(title, body) {
    body = String(body || "").trim();
    return body ? `### ${title}\n${body}` : "";
  }

  /* opts: {
       mode: 'rp'|'messenger', card, userName, userDesc, sceneState,
       experiences: [] (уже отобранные), history: [{role, text}],
       contextTokens, reserveTokens, singleSystem, minHistory, sceneProtocol
     } */
  function build(opts) {
    const o = Object.assign({ mode: "rp", contextTokens: 8192, reserveTokens: 700, singleSystem: false, minHistory: 4, sceneProtocol: true }, opts);
    const T = TEMPLATES[o.mode] || TEMPLATES.rp;
    const card = o.card || {};
    const vars = { char: card.name || "Персонаж", user: o.userName || "Пользователь" };
    const m = (s) => U.macros(s, vars);
    const tok = U.estimateTokens;
    const budget = Math.max(512, o.contextTokens - o.reserveTokens);

    const cardBody = [
      card.description,
      card.personality ? "Личность: " + card.personality : "",
      card.scenario ? "Обстоятельства: " + card.scenario : "",
      card.systemPrompt ? "Указания автора карточки: " + card.systemPrompt : "",
    ].filter(Boolean).join("\n\n");

    const fixed = {
      frame: m(T.frame),
      card: section(m(T.card), m(cardBody)),
      persona: section(m(T.persona), m(o.userDesc || "")),
      scene: section(m(T.scene), SCENE.describe(o.sceneState, { userName: vars.user })),
      post: [m(card.postHistory || ""), o.sceneProtocol ? SCENE.PROTOCOL : "", o.extraPost ? m(o.extraPost) : ""].filter(Boolean).join("\n\n"),
    };
    let used = Object.values(fixed).reduce((n, s) => n + tok(s), 0);

    const history = (o.history || []).filter((h) => h && h.text);
    const minH = history.slice(-o.minHistory);
    used += minH.reduce((n, h) => n + tok(h.text) + 4, 0);

    // Опыт: противовесы и сильные записи не выбрасываются первыми.
    let exps = (o.experiences || []).slice();
    const expCost = (list) => tok(EXP.format(list)) + 30;
    while (exps.length && used + expCost(exps) > budget) {
      const weakest = exps.filter((e) => !e.__counter).sort((a, b) => (a.weight || 1) - (b.weight || 1))[0] || exps[0];
      exps = exps.filter((e) => e !== weakest);
    }
    const droppedExp = (o.experiences || []).length - exps.length;
    const memory = exps.length ? section(m(T.memory), EXP.format(exps)) : "";
    used += tok(memory);

    // Лорбук — по ключам из последних сообщений.
    const recentText = history.slice(-4).map((h) => h.text).join("\n");
    const loreAll = matchLore(card.lore, recentText);
    const lore = [];
    for (const e of loreAll) {
      const c = tok(e.content) + 2;
      if (used + c > budget) break;
      lore.push(m(e.content)); used += c;
    }
    const loreBlock = lore.length ? section(m(T.lore), lore.join("\n\n")) : "";

    // Примеры речи — если остаётся место.
    let examples = "";
    if (card.mesExample) {
      const ex = section(m(T.examples), m(card.mesExample).replace(/<START>/gi, "").trim());
      if (used + tok(ex) <= budget - 200) { examples = ex; used += tok(ex); }
    }

    // История: от новых к старым, сколько влезает.
    const older = history.slice(0, Math.max(0, history.length - minH.length));
    const keptOlder = [];
    for (let i = older.length - 1; i >= 0; i--) {
      const c = tok(older[i].text) + 4;
      if (used + c > budget) break;
      keptOlder.unshift(older[i]); used += c;
    }
    const keptHistory = keptOlder.concat(minH);

    const head = [fixed.frame, fixed.card, examples, fixed.persona, loreBlock, memory, fixed.scene].filter(Boolean).join("\n\n");
    const msgs = keptHistory.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text }));
    let messages;
    if (o.singleSystem) {
      // Строгие Jinja-шаблоны: одно system в начале, затем строго user/assistant.
      const merged = [];
      for (const x of msgs) {
        const last = merged[merged.length - 1];
        if (last && last.role === x.role) last.content += "\n\n" + x.content;
        else merged.push(Object.assign({}, x));
      }
      if (!merged.length || merged[0].role !== "user") merged.unshift({ role: "user", content: "[Начало]" });
      messages = [{ role: "system", content: [head, fixed.post].filter(Boolean).join("\n\n") }].concat(merged);
    } else {
      messages = [{ role: "system", content: head }].concat(msgs);
      if (fixed.post) messages.push({ role: "system", content: fixed.post });
    }

    return {
      messages,
      report: {
        budget,
        used,
        historyKept: keptHistory.length,
        historyTotal: history.length,
        experienceKept: exps.length,
        experienceDropped: droppedExp,
        loreKept: lore.length,
        loreMatched: loreAll.length,
        examples: !!examples,
        layers: {
          frame: tok(fixed.frame),
          card: tok(fixed.card) + tok(examples) + tok(fixed.persona),
          memory: tok(memory),
          scene: tok(fixed.scene),
          lore: tok(loreBlock),
          history: keptHistory.reduce((n, h) => n + tok(h.text) + 4, 0),
          post: tok(fixed.post),
        },
      },
    };
  }

  PRP.assembler = { build, matchLore, TEMPLATES };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.assembler;
})(typeof window !== "undefined" ? window : globalThis);
