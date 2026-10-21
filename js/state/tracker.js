/* Prism RP — UT-1: общий фактический трекер состояния персонажа для RP и Messenger.
   Чистый, детерминированный. Истина хранится не в UI, а в событиях на swipes сообщений;
   изображение не является событием. Перспектива задаёт видимость, не физическое существование.
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
  const emptyActor = (name) => ({ name: str(name), fields: {}, intentions: [], notes: [] });
  const empty = (names) => ({ schema: 1, actors: { char: emptyActor(names && names.char), user: emptyActor(names && names.user) }, scene: SC.emptyState(), diagnostics: [] });

  function validateEvent(e, source) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return "событие не объект";
    if (!ALLOWED_ACTORS.has(e.actor)) return "неизвестный участник";
    if (!FIELDS.includes(e.field)) return "неизвестное поле";
    if (!CERTAINTY.has(e.certainty)) return "неизвестный статус";
    if (!["set", "clear", "add", "remove"].includes(e.action)) return "неизвестное действие";
    if (["add", "remove"].includes(e.action) && e.field !== "wear") return "дополнение допустимо только для одежды";
    if (source && source.role === "user" && e.actor !== "user") return "пользователь не управляет чужим персонажем";
    if (source && source.role === "assistant" && e.actor !== "char") return "модель не управляет пользователем";
    if (e.certainty === "established" && source && source.mode === "messenger" && source.role !== "manual") return "сообщения мессенджера не доказывают физическое состояние";
    if (["set", "add", "remove"].includes(e.action)) {
      if (LIST.has(e.field)) {
        if (!Array.isArray(e.value) || e.value.length < 1 || e.value.length > 12 || e.value.some((x) => typeof x !== "string" || !x.trim() || x.length > 160)) return "некорректный список";
      } else if (typeof e.value !== "string" || !e.value.trim() || e.value.length > 240) return "некорректное значение";
    }
    if (e.evidence != null && (typeof e.evidence !== "string" || e.evidence.length > 450)) return "некорректная цитата";
    if (source && source.text != null) {
      // Интерпретация обязательна с точной цитатой из исходного сообщения; отсутствие доказательства не применяется.
      if (!str(e.evidence) || !String(source.text).includes(e.evidence)) return "нет точного подтверждения в сообщении";
      if (e.action !== "clear") {
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
    } };
  }

  function apply(state, input, source) {
    const out = clone(state);
    const n = normalize(input, source);
    if (n.error) { out.diagnostics.push({ source: source && source.messageId || null, issue: n.error }); return out; }
    const e = n.event, actor = out.actors[e.actor];
    let value = e.action === "clear" ? (LIST.has(e.field) ? [] : null) : e.value;
    if ((e.action === "add" || e.action === "remove") && e.certainty !== "intent") {
      // Отсутствующее исходное состояние неизвестно: снятая куртка не даёт
      // права придумать, какая осталась одежда. Добавление допускается.
      const previous = actor.fields.wear;
      if (!previous && e.action === "remove") return out;
      const list = previous && Array.isArray(previous.value) ? previous.value.slice() : [];
      const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      value = e.action === "add" ? list.concat(e.value.filter((x) => !list.some((y) => norm(x) === norm(y))))
        : list.filter((x) => !e.value.some((y) => norm(x) === norm(y)));
    }
    const datum = { value, certainty: e.certainty, source: { messageId: source && source.messageId || null,
      swipeIdx: source && source.swipeIdx || 0, role: source && source.role || null, evidence: e.evidence } };
    if (e.certainty === "intent") {
      actor.intentions.push({ field: e.field, value, ...datum.source });
      if (actor.intentions.length > 12) actor.intentions.shift();
    } else {
      // Явная отмена/смена значения закрывает намерение только этого поля.
      actor.intentions = actor.intentions.filter((i) => i.field !== e.field);
      actor.fields[e.field] = datum;
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
    const legacy = opts.legacyWorld || null;
    if (legacy) {
      const compat = { location: legacy.location, activity: legacy.activity, wear: legacy.visualWear, pose: legacy.visualPose,
        hair: legacy.visualHair, nearby: legacy.nearby, ongoing: legacy.ongoing, availability: legacy.availability };
      for (const [field, v] of Object.entries(compat)) {
        if (v == null || (Array.isArray(v) && !v.length) || (field === "availability" && v === "unknown")) continue;
        st.actors.char.fields[field] = { value: clone(v), certainty: "established", source: { kind: "legacy-manual" } };
      }
    }
    let sceneCursor = null;
    const aliases = { char: opts.charName, user: opts.userName };
    const normName = (x) => String(x || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    function syncSceneActor(actorId, field, sceneValue, source) {
      st.actors[actorId].fields[field] = { value: clone(sceneValue), certainty: "established", source };
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
            syncSceneActor(actorId, field, field === "pose" ? ch.pose : ch.wear, { kind: "legacy-rp-scene", messageId: m.id, swipeIdx: m.swipeIdx || 0 });
          }
        }
      }
      for (const e of Array.isArray(sw.stateEvents) ? sw.stateEvents : []) {
        st = apply(st, e, { role: m.role, mode: opts.mode, text: sw.text, messageId: m.id, swipeIdx: m.swipeIdx || 0 });
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
    return snapshot && snapshot.actors && snapshot.actors[actor] && snapshot.actors[actor].fields[field] || null;
  }
  function forCharacter(snapshot) {
    const a = snapshot && snapshot.actors && snapshot.actors.char;
    const result = { location: null, activity: null, visualWear: [], visualPose: null, visualHair: null, nearby: [], ongoing: [], availability: "unknown", fieldStatus: {}, intentions: a ? a.intentions.slice() : [] };
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
    for (const [field, datum] of Object.entries(char.fields)) {
      if (mode === "rp" && datum.certainty === "established") view.visible[field] = clone(datum.value);
      else if (datum.certainty === "reported") view.reported[field] = clone(datum.value);
    }
    view.intentions = char.intentions.slice();
    return view;
  }
  PRP.stateTracker = { FIELDS, empty, validateEvent, normalize, apply, fold, fieldOf, forCharacter, forUser };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.stateTracker;
})(typeof window !== "undefined" ? window : globalThis);
