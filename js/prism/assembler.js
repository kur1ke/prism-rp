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
        "Ты играешь за {{char}}. {{user}} управляет только собой.\n" +
        "Реагируй естественно, исходя из текущей сцены, характера {{char}} и релевантного прошлого опыта. " +
        "Характер и прошлый опыт влияют на решения, но не являются жёстким сценарием.\n" +
        "Не пиши мысли, действия или реплики за {{user}}.",
      card: "Характер {{char}}",
      memory: "Релевантный прошлый опыт {{char}}",
      scene: "Сейчас (факты)",
      persona: "Кто такой {{user}}",
      lore: "Сведения о мире",
      examples: "Примеры манеры речи {{char}} (стиль, не сюжет)",
      origin: "С чего начинается история (исходные обстоятельства, а не сценарий, который нужно разыграть)",
      author: "Указания автора карточки (правила игры от автора, а не черты персонажа)",
      authorPost: "Указания автора карточки (после истории)",
    },
    messenger: {
      frame:
        "{{char}} переписывается с {{user}} в мессенджере. Пиши только сообщения, которые {{char}} отправляет: " +
        "коротко, живо, в манере {{char}}, без описаний действий, прозы и ремарок в звёздочках. " +
        "Можно отправить несколько сообщений подряд — разделяй их пустой строкой. " +
        "Черты характера влияют на восприятие, но не предписывают поступков; воспоминания — свидетельства прошлого, а не инструкции. " +
        "Не пиши за {{user}}.",
      card: "Характер {{char}}",
      memory: "Релевантный прошлый опыт {{char}}",
      scene: "Жизнь {{char}} сейчас, вне переписки (видит только {{char}}; рассказывает о ней, только если сам(а) захочет)",
      persona: "Кто такой {{user}}",
      lore: "Сведения о мире",
      examples: "Примеры манеры {{char}} (стиль, не сюжет)",
      origin: "С чего начинается история (исходные обстоятельства, а не сценарий, который нужно разыграть)",
      author: "Указания автора карточки (правила игры от автора, а не черты персонажа)",
      authorPost: "Указания автора карточки (после истории)",
    },
  };

  function matchLore(entries, text) {
    const raw = String(text || ""), low = raw.toLowerCase();
    const hit = (e, keys) => (keys || []).some((k) => {
      k = String(k || "").trim();
      return k && (e.case_sensitive ? raw.includes(k) : low.includes(k.toLowerCase()));
    });
    return (entries || [])
      .filter((e) => e && e.enabled !== false && e.content)
      // Выборочная запись (selective): нужен основной ключ И хотя бы один дополнительный.
      .filter((e) => e.constant || (hit(e, e.keys) && (!e.selective || !(e.secondary_keys || []).length || hit(e, e.secondary_keys))))
      .sort((a, b) => (a.insertion_order || 0) - (b.insertion_order || 0));
  }

  // Текст указания автора, который можно отправить: только включённое и непустое (cards/model.js).
  // Никаких запасных путей к исходнику карточки, расширениям или старым полям.
  function directiveText(card, which) {
    const d = card && card.directives && card.directives[which];
    return d && d.enabled && String(d.text || "").trim() ? String(d.text) : "";
  }

  function section(title, body) {
    body = String(body || "").trim();
    return body ? `### ${title}\n${body}` : "";
  }

  /* Сборка контекста со строгим бюджетом.

     opts: {
       mode: 'rp'|'messenger', card, userName, userDesc, sceneState,
       experiences: [] — уже отобранные, В ПОРЯДКЕ ВАЖНОСТИ (первая — самая релевантная),
       history: [{role, text}], contextTokens, reserveTokens, singleSystem, minHistory,
       sceneProtocol, extraPost, noPostHistory,
       includeScenario — подавать ли сценарий карточки (решение prism/scenario.js; по умолчанию да),
       allowSyntheticUser — можно ли при singleSystem подставить служебную реплику пользователя «[Начало]»
         (по умолчанию да, как раньше; для начала сцены — нет, см. report.needsUserFirst)
     }

     Итоговый порядок (обычный транспорт):
       system: РАМКА → УКАЗАНИЯ АВТОРА (system_prompt) → лорбук «до персонажа» → КАРТОЧКА
               → примеры речи → ПЕРСОНА → лорбук → ОПЫТ → НАЧАЛО ИСТОРИИ (сценарий, пока действует) → СЦЕНА
       user/assistant: ИСТОРИЯ
       system: УКАЗАНИЯ АВТОРА ПОСЛЕ ИСТОРИИ (post_history) → протокол сцены и рисования
     При singleSystem всё служебное идёт одним system в начале, затем строго user/assistant.

     Бюджет: итоговая оценка (Σ токены сообщений + 4 на сообщение) ≤ budget.
     Если не помещается, уступают по порядку:
       1 старая история → 2 примеры речи → 3 лорбук → 4 менее релевантный опыт
       → 5 указания после истории → 6 персона, сценарий, указания автора, прошлое, внешность, хвост описания
       (по абзацам, затем по предложениям) → 7 самый релевантный опыт → 8 история до последнего сообщения.
     Рамка, сцена, протокол, имя и личность персонажа не режутся никогда. Если и они
     не помещаются — report.overflow = true (без молчаливого превышения). */
  function build(opts) {
    const o = Object.assign({ mode: "rp", contextTokens: 8192, reserveTokens: 700, singleSystem: false, minHistory: 4, sceneProtocol: true, noPostHistory: false, includeScenario: true, allowSyntheticUser: true }, opts);
    const T = TEMPLATES[o.mode] || TEMPLATES.rp;
    const card = o.card || {};
    const vars = { char: card.name || "Персонаж", user: o.userName || "Пользователь" };
    const m = (x) => U.macros(x, vars);
    const tok = U.estimateTokens;
    const budget = Math.max(512, o.contextTokens - o.reserveTokens);

    const history = (o.history || []).filter((h) => h && h.text);
    const recentText = history.slice(-4).map((h) => h.text).join("\n");
    const loreAll = matchLore(card.lore, recentText);

    // Изменяемое состояние сборки: что сейчас входит.
    const st = {
      authorSys: m(directiveText(card, "system")).trim(),
      description: m(card.description || "").trim(),
      appearance: m(card.appearance || "").trim(),
      personality: m(card.personality || "").trim(),
      background: m(card.background || "").trim(),
      // Сценарий — исходные обстоятельства; подаётся только до границы первого ответа (prism/scenario.js).
      scenario: o.includeScenario ? m(card.scenario || "").trim() : "",
      examples: card.mesExample ? m(card.mesExample).replace(/<START>/gi, "").trim() : "",
      persona: m(o.userDesc || "").trim(),
      lore: loreAll.slice(),
      exps: (o.experiences || []).slice(),
      postHistory: o.noPostHistory ? "" : m(directiveText(card, "postHistory")).trim(),
      keepOld: null, // сколько старых сообщений (сверх minHistory) оставить; null — все
      minH: Math.min(o.minHistory, history.length),
    };
    const frame = m(T.frame);
    const scene = section(m(T.scene), SCENE.describe(o.sceneState, { userName: vars.user }));
    const protocol = [o.sceneProtocol ? SCENE.PROTOCOL : "", o.extraPost ? m(o.extraPost) : ""].filter(Boolean).join("\n\n");

    function parts() {
      const loreText = (pos) => st.lore.filter((e) => (e.position === "before_char") === (pos === "before")).map((e) => m(e.content)).join("\n\n");
      const cardBody = [st.description, st.appearance ? "Внешность: " + st.appearance : "", st.personality ? "Личность: " + st.personality : "",
        st.background ? "Прошлое: " + st.background : ""].filter(Boolean).join("\n\n");
      const older = history.slice(0, history.length - st.minH);
      const keptOlder = st.keepOld == null ? older : older.slice(older.length - st.keepOld);
      const kept = keptOlder.concat(history.slice(history.length - st.minH));
      return {
        head: [
          frame,
          section(T.author, st.authorSys),
          section(m(T.lore), loreText("before")),
          section(m(T.card), cardBody || "(описания нет)"),
          section(m(T.examples), st.examples),
          section(m(T.persona), st.persona),
          section(m(T.lore), loreText("after")),
          section(m(T.memory), EXP.format(st.exps.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))),
          section(m(T.origin), st.scenario),
          scene,
        ].filter(Boolean),
        post: [section(T.authorPost, st.postHistory), protocol].filter(Boolean),
        history: kept,
      };
    }
    function render() {
      const p = parts();
      const msgs = p.history.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text }));
      if (o.singleSystem) {
        /* Строгие Jinja-шаблоны (Mistral, Gemma и подобные): одно system в начале, затем строго
           user/assistant, начиная с user — иначе шаблон бросает «Conversation roles must alternate
           user/assistant/…». Поэтому, если история начинается с ответа персонажа (приветствие),
           в обычном разговоре подставляется служебная реплика «[Начало]». Для начала сцены это
           запрещено (allowSyntheticUser: false): реплика не подставляется, а needsUserFirst
           сообщает, что строгому шаблону не хватит первого хода пользователя. */
        const merged = [];
        for (const x of msgs) {
          const last = merged[merged.length - 1];
          if (last && last.role === x.role) last.content += "\n\n" + x.content;
          else merged.push(Object.assign({}, x));
        }
        const userFirst = merged.length && merged[0].role === "user";
        if (!userFirst && o.allowSyntheticUser) merged.unshift({ role: "user", content: "[Начало]" });
        return { p, synthetic: !userFirst && o.allowSyntheticUser, needsUserFirst: !userFirst && !o.allowSyntheticUser,
          messages: [{ role: "system", content: p.head.concat(p.post).join("\n\n") }].concat(merged) };
      }
      const out = [{ role: "system", content: p.head.join("\n\n") }].concat(msgs);
      if (p.post.length) out.push({ role: "system", content: p.post.join("\n\n") });
      return { p, messages: out };
    }
    const cost = (msgs) => msgs.reduce((n, x) => n + tok(x.content) + 4, 0);
    const fits = () => cost(render().messages) <= budget;

    const truncated = [];
    const note = (layer, detail) => {
      const t = truncated.find((x) => x.layer === layer);
      if (t) { if (typeof detail === "number") t.dropped = (t.dropped || 0) + detail; else if (detail) t.detail = detail; }
      else truncated.push(Object.assign({ layer }, typeof detail === "number" ? { dropped: detail } : detail ? { detail } : {}));
    };

    // Порядок уступок. Каждая функция убирает одну порцию и возвращает true, либо false, если убирать нечего.
    const olderCount = Math.max(0, history.length - st.minH);
    const reducers = [
      function oldHistory() {
        const cur = st.keepOld == null ? olderCount : st.keepOld;
        if (!cur) return false;
        // Двоичный поиск: сколько самых свежих старых сообщений можно оставить.
        let lo = 0, hi = cur - 1;
        st.keepOld = 0;
        if (!fits()) { note("history", cur); return true; }
        while (lo < hi) {
          const mid = Math.ceil((lo + hi + 1) / 2);
          st.keepOld = mid;
          if (fits()) lo = mid; else hi = mid - 1;
        }
        st.keepOld = lo;
        note("history", cur - lo);
        return true;
      },
      function examples() { if (!st.examples) return false; st.examples = ""; note("examples", "примеры речи"); return true; },
      function lore() { if (!st.lore.length) return false; st.lore.pop(); note("lore", 1); return true; },
      function lowExperience() { if (st.exps.length <= 1) return false; st.exps.pop(); note("experience", 1); return true; },
      function postHistory() { if (!st.postHistory) return false; st.postHistory = ""; note("postHistory", "указания после истории"); return true; },
      function persona() { if (!st.persona) return false; st.persona = ""; note("persona", "описание собеседника"); return true; },
      function scenario() { if (!st.scenario) return false; st.scenario = ""; note("card.scenario", "сценарий"); return true; },
      function authorSys() { if (!st.authorSys) return false; st.authorSys = ""; note("authorSys", "указания автора"); return true; },
      function background() { if (!st.background) return false; st.background = ""; note("card.background", "прошлое"); return true; },
      function appearance() { if (!st.appearance) return false; st.appearance = ""; note("card.appearance", "внешность"); return true; },
      function descriptionTail() {
        const d = st.description;
        if (!d) return false;
        const paras = d.split(/\n\s*\n/);
        let next;
        if (paras.length > 1) next = paras.slice(0, -1).join("\n\n");
        else {
          const sents = d.match(/[^.!?…]+[.!?…]+[»")\]]*\s*|[^.!?…]+$/g) || [d];
          if (sents.length <= 1) return false; // первое предложение — минимум описания
          next = sents.slice(0, -1).join("").trim();
        }
        st.description = next;
        note("card.description", `описание сокращено до ${next.length} симв. из ${(m(card.description || "").trim()).length}`);
        return true;
      },
      function topExperience() { if (!st.exps.length) return false; st.exps.pop(); note("experience", 1); return true; },
      function recentHistory() { if (st.minH <= 1) return false; st.minH--; st.keepOld = 0; note("history", 1); return true; },
    ];

    let overflow = false;
    if (!fits()) {
      for (const r of reducers) {
        while (!fits() && r()) { /* уступаем порциями */ }
        if (fits()) break;
      }
      overflow = !fits();
    }

    const { p, messages, synthetic, needsUserFirst } = render();
    const used = cost(messages);
    const keptHistory = p.history;
    const tokLayer = (x) => tok(x) + (x ? 2 : 0);
    const loreKept = st.lore.length;
    return {
      messages,
      report: {
        budget,
        used,
        fits: used <= budget,
        overflow,
        truncated,
        historyKept: keptHistory.length,
        historyTotal: history.length,
        experienceKept: st.exps.length,
        experienceDropped: (o.experiences || []).length - st.exps.length,
        loreKept,
        loreMatched: loreAll.length,
        loreDropped: loreAll.length - loreKept,
        examples: !!st.examples,
        postHistory: !!st.postHistory,
        postHistoryDisabled: !!o.noPostHistory && !!directiveText(card, "postHistory").trim(),
        // Сценарий: included — вошёл; иначе почему нет: "none" (в карточке пусто), "past-first-turn"
        // (граница первого ответа пройдена), "budget" (не поместился).
        scenarioIncluded: !!st.scenario,
        // singleSystem: подставлена служебная реплика «[Начало]» / её нельзя было подставить, а шаблону нужен ход пользователя.
        syntheticUser: !!synthetic,
        needsUserFirst: !!needsUserFirst,
        scenarioState: st.scenario ? "included" : !String(card.scenario || "").trim() ? "none" : !o.includeScenario ? "past-first-turn" : "budget",
        layers: {
          frame: tok(frame),
          author: tokLayer(section(T.author, st.authorSys)) + tokLayer(section(T.authorPost, st.postHistory)),
          card: tokLayer(p.head.find((x) => x.startsWith("### " + m(T.card))) || "") + tokLayer(st.examples ? section(m(T.examples), st.examples) : "") + tokLayer(st.persona ? section(m(T.persona), st.persona) : "") + tokLayer(section(m(T.origin), st.scenario)),
          memory: tokLayer(st.exps.length ? section(m(T.memory), EXP.format(st.exps)) : ""),
          scene: tok(scene),
          lore: tokLayer(st.lore.length ? st.lore.map((e) => m(e.content)).join("\n\n") : ""),
          history: keptHistory.reduce((n, h) => n + tok(h.text) + 4, 0),
          post: tok(protocol),
        },
      },
    };
  }

  PRP.assembler = { build, matchLore, TEMPLATES };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.assembler;
})(typeof window !== "undefined" ? window : globalThis);
