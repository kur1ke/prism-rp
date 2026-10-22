/* Prism RP — общее для адаптеров форматов карточек: реестр адаптеров и мелкие помощники.
   Адаптер — чистая функция (json, detection) → { draft, notes } в каноническую модель (cards/model.js).
   Особенности каждого формата живут только в своём файле cards/formats/<формат>.js. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const adapters = {};
  function register(format, fn) { adapters[format] = fn; }

  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const str = (v) => (typeof v === "string" ? v : v == null ? "" : typeof v === "number" ? String(v) : "");
  const strList = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map((x) => str(x).trim()).filter(Boolean);
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

  // Ключи объекта, которые адаптер не разобрал: путь вида "data.profile.age".
  function unmapped(obj, known, prefix) {
    if (!isObj(obj)) return [];
    return Object.keys(obj).filter((k) => !known.includes(k)).map((k) => (prefix ? prefix + "." : "") + k);
  }

  // Promote plain, unrecognised character facts to *disabled* custom data. Preserve
  // technical/instruction-shaped and structured values only in imported source.
  // Shape-based inference is deliberately conservative; no LLM or execution.
  const TECHNICAL_KEY = /(?:system|prompt|instruction|directive|override|script|code|config|setting|metadata|^meta|password|api.?key|access.?key|token|uuid|^id$|^source$|^assets?$|^image|^lora|^model|^spec|^version|^extension|^regex|^depth|^timestamp|^created|^updated|^tool|^plugin|^format|^url$|^uri$|^file|^path|^schema|^state|^log|^debug|^hash|^signature|creator|author|sampling|seed|temperature)/i;
  const LABELS = { occupation: "Профессия", profession: "Профессия", hobbies: "Увлечения", hobby: "Увлечения", fears: "Страхи", likes: "Нравится", dislikes: "Не нравится", skills: "Навыки", secrets: "Секреты", relationships: "Отношения", goals: "Цели", habits: "Привычки", preferences: "Предпочтения", nickname: "Прозвище" };
  function customFromUnknown(obj, known, prefix, format) {
    if (!isObj(obj)) return [];
    return Object.keys(obj).filter((key) => !known.includes(key) && !TECHNICAL_KEY.test(key)).flatMap((key) => {
      const raw = obj[key];
      let value = "";
      if (typeof raw === "string") value = raw;
      else if (typeof raw === "number" && Number.isFinite(raw)) value = String(raw);
      else if (Array.isArray(raw) && raw.length && raw.every((v) => typeof v === "string" || typeof v === "number" && Number.isFinite(v))) value = raw.join(", ");
      else return [];
      if (!value.trim() || value.length > 12000 || key.length > 100) return [];
      return [{
        id: "imported-" + prefix.replace(/[^a-z0-9]/gi, "-") + "-" + key.replace(/[^a-z0-9]/gi, "-"),
        label: LABELS[key.toLowerCase()] || key.replace(/[_-]+/g, " "),
        text: value,
        mode: "relevant",
        enabled: false,
        origin: { format, path: (prefix ? prefix + "." : "") + key, imported: true },
      }];
    });
  }

  // Запись лорбука в каноническом виде. raw — исходная запись (для экспорта и происхождения).
  function loreEntry(e, i, extra) {
    const x = isObj(e) ? e : { content: str(e) };
    return Object.assign({
      keys: strList(x.keys != null ? x.keys : x.key),
      secondary_keys: strList(x.secondary_keys),
      selective: !!x.selective,
      content: str(x.content != null ? x.content : x.text),
      enabled: x.enabled !== false && x.disable !== true,
      constant: !!x.constant,
      case_sensitive: !!x.case_sensitive,
      insertion_order: x.insertion_order != null ? Number(x.insertion_order) || 0 : x.priority != null ? Number(x.priority) || 0 : x.order != null ? Number(x.order) || 0 : i,
      position: x.position === "before_char" ? "before_char" : "after_char",
      comment: str(x.comment || x.name || x.title),
      raw: clone(x),
    }, extra || {});
  }

  // Заметка адаптера: уровень (error | warning | info), код и текст для экрана проверки.
  const note = (level, code, message, extra) => Object.assign({ level, code, message }, extra || {});

  PRP.cardFormats = Object.assign(PRP.cardFormats || {}, { adapters, register, helpers: { clone, str, strList, isObj, unmapped, customFromUnknown, loreEntry, note } });
})(typeof window !== "undefined" ? window : globalThis);
