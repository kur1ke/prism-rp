/* Prism RP — UT-1: общий фактический трекер состояния персонажа для RP и Messenger.
   Чистый, детерминированный. Истина хранится не в UI, а в событиях на swipes сообщений;
   raw/compiled изображение не является событием; подтверждённое описание текущего
   авторского [draw:] может стать источником wear-события. Перспектива задаёт видимость, не физическое существование.
   Поля legacy Messenger Environment — совместимый начальный слой/ручные исправления.
   Не определяет, что произошло из свободного текста (это работа state/interpreter).
*/
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const SC = PRP.scene || (typeof require !== "undefined" ? require("../prism/scene.js") : null);
  const TR = PRP.tree || (typeof require !== "undefined" ? require("../chat/tree.js") : null);
  const WO = PRP.wearObservation || (typeof require !== "undefined" ? require("./wear-observation.js") : null);
  const FIELDS = Object.freeze(["location", "activity", "wear", "pose", "hair", "nearby", "ongoing", "availability"]);
  const LIST = new Set(["wear", "nearby", "ongoing"]);
  const CERTAINTY = new Set(["established", "reported", "intent"]);
  const ALLOWED_ACTORS = new Set(["char", "user"]);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const str = (v) => String(v == null ? "" : v).trim();
  // Wear facts are derived from the selected swipe path; there is no second
  // persisted inventory. A removed item remains explicitly absent even if
  // the rest of the outfit has never been established.
  // Canonical state is folded, never persisted as a separate inventory.
  // "known" distinguishes no positive evidence from an established empty list;
  // "complete" means a full outfit was explicitly established, not guessed.
  // fields.wear below is ONLY a compatibility projection, never an input.
  const emptyWear = () => ({ known: false, complete: false, worn: [], removed: [], partiallyWorn: [], invalidated: false, last: null });
  const emptyActor = (name) => ({ name: str(name), fields: {}, wearState: emptyWear(), intentions: [], notes: [] });
  const garmentKey = (value) => str(value).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const sameGarment = (a, b) => garmentKey(a) === garmentKey(b);

  // Explicitly named clothing can be shortened or declined in Russian across
  // turns ("светло-бежевая юбка-плиссе" → "бежевую юбку"). Match only if
  // every lexical stem in the new report is present in exactly ONE item of
  // this actor's active-path wardrobe. This is NOT fuzzy semantic inference.
  // Without a unique match, retain the existing explicit-event semantics.
  function garmentStems(value) {
    return (str(value).toLowerCase().replace(/ё/g, "е")
      .match(/[\p{L}\p{N}]+/gu) || []).map((word) => {
      const stem = word.length > 3 ? word.replace(
        /(?:ого|его|ому|ему|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ую|юю|ых|их|ым|им|ой|ей|ом|ем|а|я|у|ю|ы|и|е)$/u, "") : word;
      return stem.length >= 3 ? stem : word;
    }).filter((word) => word.length >= 3);
  }
  function canonicalWearItem(item, previous) {
    const exact = previous.find((x) => sameGarment(x.item, item));
    if (exact) return exact;
    const stems = garmentStems(item);
    if (!stems.length) return null;
    const matches = previous.filter((x) => {
      const known = garmentStems(x.item);
      return stems.every((word) => known.includes(word));
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function wearDatum(actor) {
    const wear = actor && actor.wearState;
    if (!wear || !wear.known) return null;
    const items = wear.worn.concat(wear.partiallyWorn)
      .slice().sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((x) => x.item);
    const last = wear.last || { certainty: "established", source: { kind: "legacy" } };
    return { value: items, certainty: last.certainty, source: clone(last.source) };
  }

  function syncWearProjection(actor) {
    const datum = wearDatum(actor);
    if (datum) actor.fields.wear = datum;
    else delete actor.fields.wear;
  }

  // One transition owns all three disjoint garment sets. Projections are
  // rebuilt after the transition; no event writes fields.wear independently.
  function transitionWear(actor, event, source) {
    const wear = actor.wearState;
    const buckets = ["worn", "removed", "partiallyWorn"];
    const previous = buckets.flatMap((key) => wear[key]);
    const orderOf = (item) => {
      const current = previous.find((x) => sameGarment(x.item, item));
      return current ? current.order || 0 : Math.max(-1, ...previous.map((x) => x.order == null ? -1 : x.order)) + 1;
    };
    const drop = (item) => {
      for (const key of buckets) wear[key] = wear[key].filter((x) => !sameGarment(x.item, item));
    };
    const fact = (item, order, placement) => ({
      item, order, certainty: event.certainty, source: clone(source),
      ...(placement ? { placement } : {}),
    });
    if (event.action === "invalidate") {
      // The author explicitly superseded the old outfit without describing
      // the new one. Unknown is neither "still worn" nor "removed".
      // History is replayable from source events; no second inventory is stored.
      wear.known = false;
      wear.complete = false;
      wear.invalidated = true;
      wear.worn = [];
      wear.removed = [];
      wear.partiallyWorn = [];
    } else if (event.action === "set" || event.action === "clear") {
      wear.invalidated = false;
      wear.known = true;
      wear.complete = true;
      wear.worn = event.action === "set"
        ? event.value.filter((item, index) => event.value.findIndex((x) => sameGarment(x, item)) === index)
          .map((item, i) => fact(item, i))
        : [];
      wear.removed = [];
      wear.partiallyWorn = [];
    } else {
      if (event.action === "add" || event.action === "adjust") {
        wear.known = true;
        wear.invalidated = false;
      }
      for (const item of event.value) {
        const existing = canonicalWearItem(item, previous);
        const name = existing ? existing.item : item;
        // A generic "юбку" cannot mean an arbitrary one of several known
        // skirts. Nor may removing an unknown-colored skirt create a phantom
        // second skirt while another skirt is in the closed known outfit.
        // A genuinely new explicit "add" can still introduce a new garment.
        if (!existing) {
          const stems = garmentStems(item);
          const sameType = stems.length && previous.filter((x) =>
            garmentStems(x.item).includes(stems[stems.length - 1]));
          const subsetMatches = previous.filter((x) => stems.length &&
            stems.every((word) => garmentStems(x.item).includes(word)));
          if (subsetMatches.length > 1 ||
              (wear.complete && event.action !== "add" && sameType && sameType.length))
            continue;
        }
        const order = orderOf(name);
        // One garment, one current state. Repeated reports of the same
        // intermediate position do not create a new transition or erase its
        // original provenance. An ordinary "adjusted" remark is not a new
        // placement; Observer must supply a grounded position to use adjust.
        if (event.action === "add" && wear.worn.some((x) => sameGarment(x.item, name))) continue;
        if (event.action === "adjust" && wear.partiallyWorn.some((x) =>
          sameGarment(x.item, name) && x.placement === event.placement)) continue;
        drop(name);
        const target = event.action === "remove" ? "removed" :
          event.action === "adjust" ? "partiallyWorn" : "worn";
        // Canonical identity survives grounded, uniquely matching abbreviated
        // reports; no new inventory is manufactured from a changed adjective.
        wear[target].push(fact(name, order,
          event.action === "adjust" ? event.placement : ""));
      }
    }
    wear.last = { certainty: event.certainty, source: clone(source) };
    syncWearProjection(actor);
  }
  // Reference IDs are only meaningful inside one branch-derived snapshot.
  // The source of each item is the original reported/established event.
  function references(state, actorId, actions) {
    const actor = state && state.actors && state.actors[actorId];
    if (!actor || !actor.wearState || !Array.isArray(actor.wearState.worn)) return [];
    // Existing remove reference IDs remain byte-for-byte compatible with
    // stored VIS-REF-1 events. Adjustment gets a distinct typed ID, derived
    // from the SAME bounded active-path garment facts, not a new registry.
    const requested = Array.isArray(actions) ? actions : ["remove"];
    const allowed = ["remove", "adjust", "add"].filter((action) => requested.includes(action));
    const present = actor.wearState.worn.concat(actor.wearState.partiallyWorn || [])
      .sort((a, b) => (a.order || 0) - (b.order || 0)).slice(0, 12);
    const removed = (actor.wearState.removed || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).slice(0, 12);
    const items = present.flatMap((x, i) => allowed.filter((action) => action !== "add").map((action) => ({ x, i, action })))
      .concat(removed.flatMap((x, i) => allowed.includes("add") ? [{ x, i, action: "add" }] : []));
    return items.map(({ x, i, action }) => ({
      id: "wear:" + actorId + ":" + i + (action === "adjust" ? ":adjust" : action === "add" ? ":add" : ""),
      actor: actorId, field: "wear", action, item: x.item, source: clone(x.source),
    }));
  }
  const empty = (names) => ({ schema: 1, actors: { char: emptyActor(names && names.char), user: emptyActor(names && names.user) }, scene: SC.emptyState(), diagnostics: [] });

  function validateEvent(e, source) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return "событие не объект";
    if (!ALLOWED_ACTORS.has(e.actor)) return "неизвестный участник";
    if (!FIELDS.includes(e.field)) return "неизвестное поле";
    if (!CERTAINTY.has(e.certainty)) return "неизвестный статус";
    if (!["set", "clear", "add", "remove", "adjust", "invalidate"].includes(e.action)) return "неизвестное действие";
    if (e.action === "invalidate" && (e.field !== "wear" || e.certainty === "intent")) return "отмена актуальности допустима только для подтверждённого переодевания";
    if (["add", "remove", "adjust"].includes(e.action) && e.field !== "wear") return "дополнение допустимо только для одежды";
    if (e.action === "adjust" && (typeof e.placement !== "string" || !e.placement.trim() ||
        e.placement.length > 160 || !str(e.evidence).includes(e.placement))) return "положение одежды не подтверждается цитатой";
    if (e.action === "adjust" && (!Array.isArray(e.value) || e.value.length !== 1)) return "изменение положения требует один предмет";
    if (source && source.role === "user" && e.actor !== "user") return "пользователь не управляет чужим персонажем";
    if (source && source.role === "assistant" && e.actor !== "char") return "модель не управляет пользователем";
    if (e.certainty === "established" && source && source.mode === "messenger" && source.role !== "manual") return "сообщения мессенджера не доказывают физическое состояние";
    if (["set", "add", "remove", "adjust"].includes(e.action)) {
      if (LIST.has(e.field)) {
        if (!Array.isArray(e.value) || e.value.length < 1 || e.value.length > 12 || e.value.some((x) => typeof x !== "string" || !x.trim() || x.length > 160)) return "некорректный список";
      } else if (typeof e.value !== "string" || !e.value.trim() || e.value.length > 240) return "некорректное значение";
    }
    if (e.evidence != null && (typeof e.evidence !== "string" || e.evidence.length > 450)) return "некорректная цитата";
    // Text and author-generated [draw:] are distinct evidence surfaces of
    // ONE swipe. A draw never becomes a hidden instruction or a separate store:
    // replay must prove the exact quoted fragment is still in its source shot.
    const drawn = e.evidenceType === "draw";
    const inquiry = e.evidenceType === "wear-inquiry";
    if (e.evidenceType != null && !drawn && !inquiry) return "неизвестный источник цитаты";
    // An RP-model clarification is a bound self-report about its own authored
    // DRAW. It is never an unanchored invisible garment or a second outfit.
    // Every event must replay against the ORIGINAL stored answer on this swipe.
    if (inquiry) {
      if (!source || source.role !== "assistant" || e.actor !== "char" ||
          e.field !== "wear" || e.certainty !== "reported" ||
          !Number.isInteger(e.drawIndex) || e.drawIndex < 0 ||
          e.drawIndex >= (Array.isArray(source.draws) ? source.draws.length : 0) ||
          e.reference || e.placement) return "неверный источник уточнения одежды";
      const note = (Array.isArray(source.wearInquiries) ? source.wearInquiries : [])
        .find(n => n && n.schema === 1 && n.drawIndex === e.drawIndex);
      const draw = source.draws[e.drawIndex];
      if (!note || !draw || note.sourceDraw !== String(draw.prompt || "") ||
          typeof note.sourceText !== "string" || !String(source.text || "").startsWith(note.sourceText) ||
          !["yes","no","unknown"].includes(note.changed)) return "уточнение не принадлежит авторскому draw";
      if (e.action === "invalidate" && note.changed === "yes" && e.evidence === "changed")
        return null;
      const values = Array.isArray(e.value) ? e.value : [];
      if (!values.length || values.length > 3) return "некорректный результат уточнения";
      if (e.action === "remove" && values.length === 1 && e.evidence === values[0] &&
          note.changed !== "yes" && Array.isArray(note.previous) &&
          note.previous.some(x => x && x.item === values[0] && x.status === "not_worn"))
        return null;
      if (e.action === "add" && values.length === 1 && !e.wearSlot && e.evidence === values[0] &&
          note.changed === "yes" && Array.isArray(note.previous) &&
          note.previous.some(x => x && x.item === values[0] && x.status === "worn"))
        return null;
      if (e.action === "add" && typeof e.wearSlot === "string" && e.evidence === e.wearSlot &&
          Array.isArray(note.hidden) && note.hidden.some(x => x && x.slot === e.wearSlot &&
            x.status === "worn" && Array.isArray(x.items) &&
            JSON.stringify(x.items) === JSON.stringify(values)))
        return null;
      return "событие не подтверждается ответом RP-модели";
    }
    // A frame alone is not an exhaustive outfit. A current authored DRAW may
    // explicitly assert the complete outfit (including what is NOT worn).
    // Require an exact source-local claim rather than a model's bare boolean:
    // "full body", cropped shots and merely unseen garments never suffice.
    if (drawn && !["set", "clear", "add", "remove", "adjust", "invalidate"].includes(e.action))
      return "недопустимое действие из draw";
    if (drawn && e.action === "set" &&
        !/(?:на\s+не[йм]\s+только|из\s+одежды\s+(?:на\s+не[йм]\s+)?только|одет[а-яё]*\s+только\s+в|wear(?:s|ing)?\s+only|only\s+wearing|nothing\s+else\s+(?:on|worn))/iu.test(str(e.evidence)))
      return "draw не содержит однозначного полного перечня одежды";
    if (drawn && e.action === "clear" &&
        !/(?:совсем\s+без\s+одежды|полностью\s+обнаж|без\s+единой\s+вещи|ничего\s+не\s+надето|completely\s+naked|fully\s+nude|wearing\s+nothing)/iu.test(str(e.evidence)))
      return "draw не подтверждает отсутствие всей одежды";
    if (drawn && e.visualScope !== "current-self")
      return "draw не подтверждён как актуальное изображение самого персонажа";
    // A continued swipe may contain several shots. An explicitly indexed
    // event retains exact provenance to an earlier authenticated shot and
    // stays chronologically before later shots. Legacy unindexed events
    // are valid against ONLY the current final shot (never retrospectively
    // promoted to an earlier draw by matching the evidence text).
    const drawList = source && Array.isArray(source.draws) ? source.draws : [];
    if (drawn && e.drawIndex != null &&
        (!Number.isInteger(e.drawIndex) || e.drawIndex < 0 || e.drawIndex >= drawList.length))
      return "недопустимый индекс авторского draw";
    if (!drawn && !inquiry && e.drawIndex != null) return "индекс draw указан без draw-события";
    const currentDraw = drawList.length
      ? drawList[e.drawIndex == null ? drawList.length - 1 : e.drawIndex] : null;
    if (drawn && (e.field !== "wear" || !source || source.role !== "assistant" ||
      !currentDraw || typeof currentDraw.prompt !== "string" ||
      !str(e.evidence) || !currentDraw.prompt.includes(e.evidence)))
      return "нет точного подтверждения в авторском draw";
    if (e.reference && (!source || (source.text == null && !drawn)))
      return "контекстная ссылка без текста действия";
    if (source && (source.text != null || drawn)) {
      // Current swipe's text OR authored shot proves only the quoted details.
      // Prior branch-local state may resolve an item's exact identity.
      const evidenceText = drawn ? currentDraw.prompt : String(source.text);
      if (!str(e.evidence) || !evidenceText.includes(e.evidence))
        return "нет точного подтверждения в сообщении";
      if (e.reference) {
        if (e.field !== "wear" || !["remove", "adjust", "add"].includes(e.action) || !Array.isArray(e.value) || e.value.length !== 1) return "недопустимая контекстная ссылка";
        const candidates = Array.isArray(source.references) ? source.references : [];
        const match = candidates.find((x) => x.id === e.reference.id && x.actor === e.actor &&
          x.field === e.field && x.action === e.action && x.item === e.value[0] &&
          JSON.stringify(x) === JSON.stringify(e.reference));
        if (!match) return "ссылка не подтверждена текущей веткой";
        // New resolved observations preserve their short literal garment
        // mention. Revalidate independently at every branch/swipe replay.
        // Old stored VIS-REF-1 events without itemMention remain compatible.
        if (e.itemMention != null &&
            (!WO || !WO.proof(e.itemMention,e.evidence,match)))
          return "упоминание предмета не соответствует текущей ссылке";
      } else if (e.itemMention != null) {
        return "упоминание предмета без проверенной ссылки";
      }
      if (e.action !== "clear" && !e.reference) {
        // Точная цитата сама по себе не гарантирует, что модель не придумала
        // значение. Требуем хотя бы один содержательный корень значения в
        // самой цитате; нормализованные словоформы допускаются.
        const meaningful = (s) => String(s || "").toLowerCase().replace(/ё/g, "е")
          .match(/[\p{L}\p{N}]+/gu) || [];
        const original = meaningful(e.evidence);
        const near = (a, b) => {
          const len = Math.min(a.length, b.length);
          return len >= 3 && a.slice(0, Math.max(3, len - 2)) === b.slice(0, Math.max(3, len - 2));
        };
        const found = (word) => original.some((sourceWord) => near(word, sourceWord));
        if (LIST.has(e.field) && Array.isArray(e.value)) {
          // Список нельзя подтверждать одним совпавшим словом. Прежде модель
          // могла приписать вторую, не названную вещь к настоящему свитеру:
          // ["свитер", "кожаные штаны"] проходил по слову "свитер".
          // У каждого элемента все содержательные слова должны иметь
          // текстовую опору; служебные местоимения и союзы не учитываем.
          const fillers = new Set(["мой", "моя", "мои", "мое", "это", "этот", "эти", "там", "тут", "для", "или", "при", "еще", "как", "над"]);
          for (const entry of e.value) {
            const words = meaningful(entry).filter((word) => word.length >= 3 && !fillers.has(word));
            if (!words.length || !words.every(found)) return "элемент списка не подтверждается цитатой";
          }
        } else {
          // Для скалярных состояний пока допускается осторожная лемматизация:
          // "дома" / "доме", "лежу" / "лежит". Слова не должны быть
          // выдуманы целиком; список проверяется отдельно, строже.
          const words = meaningful(e.value).filter((x) => x.length >= 3);
          if (words.length && !words.some(found)) return "значение не подтверждается цитатой";
        }
      }
    }
    return null;
  }

  function normalize(e, source) {
    const error = validateEvent(e, source);
    if (error) return { error };
    return { event: {
      actor: e.actor, field: e.field, action: e.action, certainty: e.certainty,
      value: ["clear", "invalidate"].includes(e.action) ? null : (LIST.has(e.field) ? e.value.map(str) : str(e.value)),
      evidence: str(e.evidence),
      ...(e.evidenceType === "draw" ? { evidenceType: "draw", visualScope: "current-self",
        ...(e.drawIndex != null ? { drawIndex: e.drawIndex } : {}) } :
        e.evidenceType === "wear-inquiry" ? { evidenceType: "wear-inquiry", drawIndex: e.drawIndex,
          ...(e.wearSlot ? { wearSlot: str(e.wearSlot) } : {}) } : {}),
      ...(e.action === "adjust" ? { placement: str(e.placement) } : {}),
      ...(e.reference ? { reference: clone(e.reference),
        ...(e.itemMention ? { itemMention: str(e.itemMention) } : {}) } : {}),
    } };
  }

  function apply(state, input, source) {
    const out = clone(state);
    const refSource = input && input.reference
      ? Object.assign({}, source || {}, { references: references(out, input.actor, [input.action]) }) : source;
    const n = normalize(input, refSource);
    if (n.error) { out.diagnostics.push({ source: source && source.messageId || null, issue: n.error }); return out; }
    const e = n.event, actor = out.actors[e.actor];
    const value = ["clear", "invalidate"].includes(e.action) ? (LIST.has(e.field) ? [] : null) : e.value;
    const provenance = { messageId: source && source.messageId || null,
      swipeIdx: source && source.swipeIdx || 0, role: source && source.role || null, evidence: e.evidence,
      ...(source && source.kind ? { kind: source.kind } : {}),
      ...(e.evidenceType === "draw" ? { evidenceType: "draw", visualScope: "current-self",
        ...(e.drawIndex != null ? { drawIndex: e.drawIndex } : {}) } :
        e.evidenceType === "wear-inquiry" ? { evidenceType: "wear-inquiry", drawIndex: e.drawIndex,
          ...(e.wearSlot ? { wearSlot: e.wearSlot } : {}) } : {}) };
    if (e.certainty === "intent") {
      actor.intentions.push({ field: e.field, value, ...provenance });
      if (actor.intentions.length > 12) actor.intentions.shift();
    } else {
      actor.intentions = actor.intentions.filter((intent) => intent.field !== e.field);
      if (e.field === "wear") transitionWear(actor, e, provenance);
      else actor.fields[e.field] = { value, certainty: e.certainty, source: provenance };
    }
    return out;
  }

  /* Свёртка активной ветки: старые RP [scene:] и новые события одного формата.
     Путь передаётся ровно до нужного сообщения (особенно для старых картинок).
     Legacy Messenger events передаются через legacyWorld как начальный слой —
     применяются до событий из истории, чтобы явная хронология имела приоритет. */
  function fold(o) {
    const opts = o || {};
    let st = empty({ char: opts.charName, user: opts.userName });
    // A newly created Messenger chat may have ONE persisted origin event.
    // It is replayed before branch events (and before explicit legacy/manual
    // environment), never written into a message or a second outfit registry.
    const initial = opts.mode === "messenger" && opts.initialWear;
    if (initial && initial.schema === 1 && initial.kind === "initial-outfit" &&
        initial.event && initial.event.actor === "char" && initial.event.field === "wear" &&
        ["set", "clear"].includes(initial.event.action) && initial.event.certainty === "reported" &&
        initial.event.evidence === "") {
      st = apply(st, initial.event, { role: "initial", mode: opts.mode, kind: "initial-outfit" });
    }
    const legacy = opts.legacyWorld || null;
    if (legacy) {
      const compat = { location: legacy.location, activity: legacy.activity, wear: legacy.visualWear, pose: legacy.visualPose,
        hair: legacy.visualHair, nearby: legacy.nearby, ongoing: legacy.ongoing, availability: legacy.availability };
      for (const [field, v] of Object.entries(compat)) {
        if (v == null || (Array.isArray(v) && !v.length) || (field === "availability" && v === "unknown")) continue;
        if (field === "wear" && Array.isArray(v))
          transitionWear(st.actors.char, { action: "set", value: clone(v), certainty: "established" }, { kind: "legacy-manual" });
        else st.actors.char.fields[field] = { value: clone(v), certainty: "established", source: { kind: "legacy-manual" } };
      }
    }
    let sceneCursor = null;
    const aliases = { char: opts.charName, user: opts.userName };
    const normName = (x) => String(x || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    function charInScene(cursor, actorName) {
      const key = Object.keys(cursor.chars || {}).find((n) => normName(n) === normName(actorName));
      return key ? cursor.chars[key] : null;
    }
    function matchesSceneActor(subject, actorId) {
      const name = aliases[actorId];
      return !!name && (normName(subject) === normName(name) ||
        subject === (actorId === "char" ? "{{char}}" : "{{user}}"));
    }
    function syncSceneWear(actorId, sceneWear, source) {
      transitionWear(st.actors[actorId], {
        action: "set", value: clone(sceneWear), certainty: "established",
      }, source);
    }
    // VC-04: replay each successfully applied legacy Scene directive in
    // chronological order. The Scene projection remains SC.fold's result,
    // while add/remove become item-level garment deltas instead of a full
    // outfit replacement that discarded explicit absence and partial facts.
    // Use Scene's existing sameItem matching to preserve a prior item label.
    function replaySceneOps(cursor, ops, source, meta) {
      let current = cursor;
      for (const op of ops || []) {
        const step = SC.apply(current, [op], meta);
        if (!step.applied.length) { current = step.state; continue; }
        const prior = current;
        current = step.state;
        if (!op.subject || !["wear", "add", "remove", "pose"].includes(op.key)) continue;
        for (const actorId of ["char", "user"]) {
          if (!matchesSceneActor(op.subject, actorId)) continue;
          const name = aliases[actorId], after = charInScene(current, name);
          if (!after) continue;
          if (op.key === "pose") {
            st.actors[actorId].fields.pose = { value: clone(after.pose), certainty: "established", source: clone(source) };
            continue;
          }
          if (op.key === "wear") { syncSceneWear(actorId, after.wear, source); continue; }
          const before = charInScene(prior, name);
          const actor = st.actors[actorId];
          const existing = actor.wearState.worn.concat(actor.wearState.partiallyWorn, actor.wearState.removed);
          const named = String(op.value || "").split(",").map((v) => v.trim())
            .filter((v) => v && !/^(?:-|—|–|нет|none)$/i.test(v));
          const items = named.map((name) => {
            const earlier = existing.find((x) => SC.sameItem(x.item, name));
            const legacy = before && before.wear.find((x) => SC.sameItem(x, name));
            return earlier ? earlier.item : legacy || name;
          });
          if (items.length) transitionWear(actor, { action: op.key, value: items, certainty: "established" }, source);
        }
      }
      return current;
    }
    if (opts.mode === "rp") {
      st.scene = SC.fold(opts.sceneInit || "", (opts.path || []).map((m) => ({
        msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [],
      })), { charName: opts.charName, userName: opts.userName });
      const meta = { charName: opts.charName, userName: opts.userName, turn: 0 };
      sceneCursor = replaySceneOps(SC.emptyState(), SC.parseBody(opts.sceneInit || ""),
        { kind: "scene-init" }, meta);
    }
    let turn = 0;
    for (const m of opts.path || []) {
      const sw = TR.activeSwipe(m);
      if (sceneCursor) {
        if (m.role === "assistant") turn++;
        sceneCursor = replaySceneOps(sceneCursor, sw.sceneOps || [],
          { kind: "legacy-rp-scene", messageId: m.id, swipeIdx: m.swipeIdx || 0 },
          { msgId: m.id, turn, charName: opts.charName, userName: opts.userName });
      }
      for (const e of Array.isArray(sw.stateEvents) ? sw.stateEvents : []) {
        st = apply(st, e, { role: m.role, mode: opts.mode, text: sw.text, draws: sw.draws || [],
          wearInquiries: sw.wearInquiries || [], messageId: m.id, swipeIdx: m.swipeIdx || 0 });
      }
      // Пользовательская коррекция всегда после извлечённых событий ЭТОГО сообщения,
      // но следующее реальное изменение может её обновить.
      for (const e of Array.isArray(sw.stateCorrections) ? sw.stateCorrections : []) {
        st = apply(st, e, { role: "manual", mode: opts.mode, messageId: m.id, swipeIdx: m.swipeIdx || 0 });
      }
    }
    return st;
  }

  // VC-05: derive a read-only, source-scoped replay path for a previous
  // authored photograph in a continued swipe. The persisted swipe is NEVER
  // shortened or changed. Refuse if same-swipe text/Scene/corrections may have
  // happened between photos, or if indexed evidence cannot prove chronology.
  // Prior path ancestry stays intact and is checked again by ImageService.
  function historicalDrawPath(path, drawIndex) {
    const original = Array.isArray(path) ? path : [];
    const source = original[original.length - 1];
    const swipe = source && TR.activeSwipe(source);
    const draws = swipe && Array.isArray(swipe.draws) ? swipe.draws : [];
    if (!source || source.role !== "assistant" || !swipe ||
        !Number.isInteger(drawIndex) || drawIndex < 0 || drawIndex >= draws.length - 1)
      return { ok: false, reason: "not-an-earlier-authored-draw" };
    const status = swipe.stateStatus;
    const finalIndex = draws.length - 1;
    if (!status || !["ok", "no-changes"].includes(status.status) ||
        status.sourceDrawIndex !== finalIndex ||
        status.sourceText !== String(swipe.text || "") ||
        status.sourceDraw !== String(draws[finalIndex] && draws[finalIndex].prompt || ""))
      return { ok: false, reason: "unverified-photo-history" };
    if ((swipe.sceneOps || []).length || (swipe.stateCorrections || []).length)
      return { ok: false, reason: "unsequenced-operations" };
    const events = Array.isArray(swipe.stateEvents) ? swipe.stateEvents : [];
    if (events.length > 32) return { ok: false, reason: "unbounded-photo-history" };
    const kept = [];
    for (const e of events) {
      if (!e || e.field !== "wear" || e.certainty === "intent" ||
          !["draw", "wear-inquiry"].includes(e.evidenceType) ||
          !Number.isInteger(e.drawIndex) || e.drawIndex < 0 || e.drawIndex >= draws.length)
        return { ok: false, reason: "unsequenced-state-event" };
      if (validateEvent(e, { role: source.role, mode: "messenger",
        text: swipe.text, draws, wearInquiries: swipe.wearInquiries || [] }))
        return { ok: false, reason: "edited-photo-evidence" };
      if (e.drawIndex <= drawIndex) kept.push(clone(e));
    }
    // The target photo must have an independently attributed observation.
    // A legacy image or an unobserved earlier crop is not sufficient proof
    // of its historical end-of-photo wardrobe state.
    if (!kept.some((e) => e.drawIndex === drawIndex))
      return { ok: false, reason: "target-photo-not-observed" };
    const derived = clone(original);
    const last = derived[derived.length - 1];
    const chosen = last.swipes[last.swipeIdx || 0];
    chosen.draws = chosen.draws.slice(0, drawIndex + 1);
    chosen.stateEvents = kept;
    chosen.wearInquiries = (chosen.wearInquiries || [])
      .filter(n => n && Number.isInteger(n.drawIndex) && n.drawIndex <= drawIndex);
    chosen.stateCorrections = [];
    chosen.sceneOps = [];
    delete chosen.stateStatus;
    return { ok: true, path: derived };
  }

  // Last authored DRAW is history, not a garment fact. An Observer with
  // zero accepted events cannot be worked around by inventing wear.remove.
  function latestAuthoredShot(path) {
    const messages = Array.isArray(path) ? path : [];
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 8); i--) {
      const m = messages[i], sw = m && TR.activeSwipe(m);
      const draws = m && m.role === "assistant" && sw && Array.isArray(sw.draws) ? sw.draws : [];
      const last = draws.length ? draws[draws.length - 1] : null;
      if (last && typeof last.prompt === "string" && last.prompt.trim())
        return { text: last.prompt.trim().slice(0, 440), messageId: m.id, swipeIdx: m.swipeIdx || 0 };
      // A subsequent confirmed clothing change supersedes the earlier shot.
      // Otherwise a stale 8-turn hint can resurrect it in the next Prism.
      if (sw && ([...(sw.stateEvents || []), ...(sw.stateCorrections || [])]
        .some(e => e && e.actor === "char" && e.field === "wear" &&
          e.certainty !== "intent"))) return null;
    }
    return null;
  }

  // Read-only last photographed clothes. This is a bounded VIEW of already
  // validated, active-swipe author DRAW events, never a new wardrobe or proof
  // that other garments were removed. A later wear change supersedes this
  // visual cue; unrelated chat messages do not.
  function latestPhotoWear(path) {
    const messages = Array.isArray(path) ? path : [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i], sw = m && TR.activeSwipe(m);
      const events = sw && Array.isArray(sw.stateEvents) ? sw.stateEvents : [];
      if (sw && (sw.stateCorrections || []).some(e => e && e.actor === "char" && e.field === "wear"))
        return null;
      const wear = events.filter(e => e && e.actor === "char" && e.field === "wear" && e.certainty !== "intent");
      if (!wear.length) {
        // A newer authored photograph without verified wear observations
        // provides no grounds to keep calling an older photo the latest.
        if (m.role === "assistant" && Array.isArray(sw.draws) && sw.draws.length) return null;
        continue;
      }
      // Any later text/correction changes the outfit; older photo cannot
      // silently override it. Nor can an unverified source status be used.
      if ((sw.stateCorrections || []).some(e => e && e.actor === "char" && e.field === "wear") ||
          m.role !== "assistant" || !sw.stateStatus ||
          !["ok", "partial", "no-changes"].includes(sw.stateStatus.status) ||
          sw.stateStatus.sourceText !== String(sw.text || "")) return null;
      const draws = Array.isArray(sw.draws) ? sw.draws : [];
      const last = draws.length - 1;
      if (last < 0 || sw.stateStatus.sourceDraw !== String(draws[last].prompt || "") ||
          sw.stateStatus.sourceDrawIndex !== last) return null;
      const visual = wear.filter(e => e.evidenceType === "draw" &&
        e.visualScope === "current-self" && ["set", "add", "adjust"].includes(e.action) &&
        (e.drawIndex == null ? last : e.drawIndex) === last &&
        !validateEvent(e, { role: m.role, draws, text: sw.text, mode: "messenger" }));
      // A later text change in this very message has no unambiguous temporal
      // order relative to its photograph; refuse to assert a photo override.
      if (wear.some(e => e.evidenceType !== "draw" || (e.drawIndex != null && e.drawIndex !== last)))
        return null;
      const complete = visual.some(e => e.action === "set");
      const items = [...new Set(visual.flatMap(e => e.value || []))].slice(0, 12);
      return items.length ? { items, complete, messageId: m.id, swipeIdx: m.swipeIdx || 0, drawIndex: last } : null;
    }
    return null;
  }

  // Одна каноническая запись в обоих режимах; вывод в разные перспективы ниже.
  function fieldOf(snapshot, actor, field) {
    const current = snapshot && snapshot.actors && snapshot.actors[actor];
    if (!current) return null;
    if (field === "wear" && current.wearState && typeof current.wearState.known === "boolean")
      return wearDatum(current);
    return current.fields[field] || null;
  }
  function forCharacter(snapshot) {
    const a = snapshot && snapshot.actors && snapshot.actors.char;
    const result = { location: null, activity: null, visualWear: [], visualWearRemoved: a ? clone(a.wearState.removed) : [], visualWearPartial: a ? clone(a.wearState.partiallyWorn || []) : [], visualPose: null, visualHair: null, nearby: [], ongoing: [], availability: "unknown", fieldStatus: {}, intentions: a ? a.intentions.slice() : [] };
    const mapping = { location: "location", activity: "activity", wear: "visualWear", pose: "visualPose", hair: "visualHair", nearby: "nearby", ongoing: "ongoing", availability: "availability" };
    for (const [field, key] of Object.entries(mapping)) {
      const datum = fieldOf(snapshot, "char", field);
      if (datum) { result[key] = clone(datum.value); result.fieldStatus[key] = { certainty: datum.certainty, source: datum.source }; }
    }
    return result;
  }
  // Для пользователя в удалённой переписке доступны сообщения/изображения, но не скрытое физическое состояние.
  function forUser(snapshot, mode) {
    const view = { mode, visible: {}, reported: {}, unknown: [], intentions: [] };
    const char = snapshot && snapshot.actors && snapshot.actors.char || emptyActor("");
    for (const field of FIELDS) {
      const datum = fieldOf(snapshot, "char", field);
      if (!datum) continue;
      if (mode === "rp" && datum.certainty === "established") view.visible[field] = clone(datum.value);
      else if (datum.certainty === "reported") view.reported[field] = clone(datum.value);
    }
    if (char.wearState.removed.length) {
      const key = mode === "rp" && char.wearState.removed.every((x) => x.certainty === "established") ? "visible" : "reported";
      view[key].wearRemoved = char.wearState.removed.map((x) => x.item);
    }
    if (char.wearState.partiallyWorn && char.wearState.partiallyWorn.length) {
      for (const fact of char.wearState.partiallyWorn) {
        const target = mode === "rp" && fact.certainty === "established" ? view.visible : view.reported;
        (target.wearPartial = target.wearPartial || []).push(clone(fact));
      }
    }
    view.intentions = char.intentions.slice();
    return view;
  }
  PRP.stateTracker = { FIELDS, empty, references, validateEvent, normalize, apply, fold, historicalDrawPath, latestAuthoredShot, latestPhotoWear, fieldOf, forCharacter, forUser };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.stateTracker;
})(typeof window !== "undefined" ? window : globalThis);
