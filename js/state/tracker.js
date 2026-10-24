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
  const emptyWear = () => ({ known: false, complete: false, worn: [], removed: [], partiallyWorn: [], last: null });
  const emptyActor = (name) => ({ name: str(name), fields: {}, wearState: emptyWear(), intentions: [], notes: [] });
  const garmentKey = (value) => str(value).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const sameGarment = (a, b) => garmentKey(a) === garmentKey(b);

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
    if (event.action === "set" || event.action === "clear") {
      wear.known = true;
      wear.complete = true;
      wear.worn = event.action === "set"
        ? event.value.filter((item, index) => event.value.findIndex((x) => sameGarment(x, item)) === index)
          .map((item, i) => fact(item, i))
        : [];
      wear.removed = [];
      wear.partiallyWorn = [];
    } else {
      if (event.action === "add" || event.action === "adjust") wear.known = true;
      for (const item of event.value) {
        const order = orderOf(item);
        const existing = previous.find((x) => sameGarment(x.item, item));
        // One garment, one current state. Repeated reports of the same
        // intermediate position do not create a new transition or erase its
        // original provenance. An ordinary "adjusted" remark is not a new
        // placement; Observer must supply a grounded position to use adjust.
        if (event.action === "add" && wear.worn.some((x) => sameGarment(x.item, item))) continue;
        if (event.action === "adjust" && wear.partiallyWorn.some((x) =>
          sameGarment(x.item, item) && x.placement === event.placement)) continue;
        drop(item);
        const target = event.action === "remove" ? "removed" :
          event.action === "adjust" ? "partiallyWorn" : "worn";
        // Preserve the established item label across abbreviated, but
        // exactly matching, reports; no fuzzy garment identity guessing.
        wear[target].push(fact(existing ? existing.item : item, order,
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
    if (!["set", "clear", "add", "remove", "adjust"].includes(e.action)) return "неизвестное действие";
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
    if (e.evidenceType != null && !drawn) return "неизвестный источник цитаты";
    // A photo proves only depicted items. Even a full-body frame cannot
    // establish all potentially hidden clothes or clear the entire outfit.
    if (drawn && !["add", "remove", "adjust"].includes(e.action))
      return "draw не подтверждает полный комплект или очистку гардероба";
    if (drawn && e.visualScope !== "current-self")
      return "draw не подтверждён как актуальное изображение самого персонажа";
    // A continued swipe may contain several shots. Only the final authored
    // shot is its current visual statement; older pictures in that same swipe
    // must not silently preserve stale clothing after a new photo was sent.
    const currentDraw = source && Array.isArray(source.draws) && source.draws.length
      ? source.draws[source.draws.length - 1] : null;
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
      value: e.action === "clear" ? null : (LIST.has(e.field) ? e.value.map(str) : str(e.value)),
      evidence: str(e.evidence),
      ...(e.evidenceType === "draw" ? { evidenceType: "draw", visualScope: "current-self" } : {}),
      ...(e.action === "adjust" ? { placement: str(e.placement) } : {}),
      ...(e.reference ? { reference: clone(e.reference) } : {}),
    } };
  }

  function apply(state, input, source) {
    const out = clone(state);
    const refSource = input && input.reference
      ? Object.assign({}, source || {}, { references: references(out, input.actor, [input.action]) }) : source;
    const n = normalize(input, refSource);
    if (n.error) { out.diagnostics.push({ source: source && source.messageId || null, issue: n.error }); return out; }
    const e = n.event, actor = out.actors[e.actor];
    const value = e.action === "clear" ? (LIST.has(e.field) ? [] : null) : e.value;
    const provenance = { messageId: source && source.messageId || null,
      swipeIdx: source && source.swipeIdx || 0, role: source && source.role || null, evidence: e.evidence,
      ...(source && source.kind ? { kind: source.kind } : {}),
      ...(e.evidenceType === "draw" ? { evidenceType: "draw", visualScope: "current-self" } : {}) };
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
    function syncSceneActor(actorId, field, sceneValue, source, fullOutfit = true) {
      // Legacy Scene stores a resulting full wear list. It remains a single
      // authoritative replacement in the new canonical fold.
      if (field === "wear") {
        const actor = st.actors[actorId];
        const previouslyComplete = actor.wearState.complete;
        transitionWear(actor,
          { action: "set", value: Array.isArray(sceneValue) ? clone(sceneValue) : [], certainty: "established" }, source);
        // Scene.add/remove supplies a resulting list, not evidence that the
        // character's entire outfit was established. Preserve that distinction.
        if (!fullOutfit) actor.wearState.complete = previouslyComplete;
      } else st.actors[actorId].fields[field] = { value: clone(sceneValue), certainty: "established", source };
    }
    function charInScene(cursor, actorName) {
      const key = Object.keys(cursor.chars || {}).find((n) => normName(n) === normName(actorName));
      return key ? cursor.chars[key] : null;
    }
    if (opts.mode === "rp") {
      st.scene = SC.fold(opts.sceneInit || "", (opts.path || []).map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })),
        { charName: opts.charName, userName: opts.userName });
      sceneCursor = SC.fold(opts.sceneInit || "", [], { charName: opts.charName, userName: opts.userName });
      for (const actorId of ["char", "user"]) {
        const ch = charInScene(sceneCursor, aliases[actorId]);
        if (!ch) continue;
        if (ch.wear.length) syncSceneActor(actorId, "wear", ch.wear, { kind: "scene-init" });
        if (ch.pose) syncSceneActor(actorId, "pose", ch.pose, { kind: "scene-init" });
      }
    }
    let turn = 0;
    for (const m of opts.path || []) {
      const sw = TR.activeSwipe(m);
      if (sceneCursor) {
        if (m.role === "assistant") turn++;
        const r = SC.apply(sceneCursor, sw.sceneOps || [], { msgId: m.id, turn, charName: opts.charName, userName: opts.userName });
        sceneCursor = r.state;
        // Важен именно ПОРЯДОК событий. Если поздняя ручная дельта меняет
        // одежду, раннее извлечённое событие не должно её вернуть.
        for (const op of r.applied) {
          if (!op.subject || !["wear", "add", "remove", "pose"].includes(op.key)) continue;
          for (const actorId of ["char", "user"]) {
            const name = aliases[actorId];
            if (!name || normName(op.subject) !== normName(name) && op.subject !== (actorId === "char" ? "{{char}}" : "{{user}}")) continue;
            const ch = charInScene(sceneCursor, name);
            if (!ch) continue;
            const field = op.key === "pose" ? "pose" : "wear";
            syncSceneActor(actorId, field, field === "pose" ? ch.pose : ch.wear, { kind: "legacy-rp-scene", messageId: m.id, swipeIdx: m.swipeIdx || 0 }, op.key === "wear");
          }
        }
      }
      for (const e of Array.isArray(sw.stateEvents) ? sw.stateEvents : []) {
        st = apply(st, e, { role: m.role, mode: opts.mode, text: sw.text, draws: sw.draws || [], messageId: m.id, swipeIdx: m.swipeIdx || 0 });
      }
      // Пользовательская коррекция всегда после извлечённых событий ЭТОГО сообщения,
      // но следующее реальное изменение может её обновить.
      for (const e of Array.isArray(sw.stateCorrections) ? sw.stateCorrections : []) {
        st = apply(st, e, { role: "manual", mode: opts.mode, messageId: m.id, swipeIdx: m.swipeIdx || 0 });
      }
    }
    return st;
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
  PRP.stateTracker = { FIELDS, empty, references, validateEvent, normalize, apply, fold, fieldOf, forCharacter, forUser };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.stateTracker;
})(typeof window !== "undefined" ? window : globalThis);
