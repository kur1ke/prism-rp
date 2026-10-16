/* Prism RP — отбор фактов мира для следующей генерации. Чистый модуль, детерминированный:
   без эмбеддингов, без вызова модели и без сети — только канонические поля фактов и текущий контекст.

   Власть решена раньше (world/canon); здесь решается только, что относится к делу.
   Факт входит, только если у него есть положительная связь с происходящим:
     1. прямое совпадение метаданных с текстом хода: сущность (entities), тема (topics), место (locations);
     2. сцена: место факта совпадает с текущим местом сцены, сущность факта сейчас в сцене;
     3. заметное совпадение слов текста факта с текстом хода (не меньше LEX_MIN длинных слов);
     4. подсказка линзы (relevanceHints): подсказка прозвучала в ходе и есть в самом факте.
   Не дают права войти: недавность, принадлежность ветке, власть слоя (ветка/чат/линза/пак),
   само наличие в паке. Фокус линзы (focusEntities, focusTopics) только поднимает подходящий факт в порядке.
   Имена персонажа и собеседника (skipNames) не считаются совпадением: иначе любой факт о персонаже входил бы всегда.

   Порядок среди подходящих: прямые совпадения → сцена → фокус линзы → совпадение слов → подсказки →
   исходный порядок мира → id. → { ranked: [факты, самый релевантный первым], rows: отчёт } */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const LEX_MIN = 2;      // сколько длинных слов текста факта должно совпасть
  const LEX_LEN = 5;      // «длинное» слово
  const DEFAULT_LIMIT = 8;

  const lc = (s) => String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е");
  function tokens(text) { return lc(text).match(/[\p{L}\p{N}]+/gu) || []; }
  // Грубая основа для русского словоизменения: «духи» ~ «духов», «экзамены» ~ «экзамены»/«экзаменов».
  function stem(w) { w = lc(w).trim(); return w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w.length >= 4 ? w.slice(0, w.length - 1) : w; }
  const norm = (s) => lc(s).trim().replace(/\s+/g, " ");

  /* Словарь: уникальные слова (не короче 3 букв) без слов из имён персонажа и собеседника. */
  function vocab(text, skip) {
    const set = new Set();
    for (const t of tokens(text)) if (t.length >= 3 && !skip.has(t)) set.add(t);
    return [...set];
  }
  // Термин (сущность, тема, место, подсказка) совпал, если каждое его слово по основе встречается в словаре.
  function termHit(term, words, skip) {
    const parts = tokens(term).filter((t) => t.length >= 3 && !skip.has(t));
    if (!parts.length) return false;
    return parts.every((p) => { const s = stem(p); return words.some((w) => w.startsWith(s)); });
  }

  /* facts — действующие и прошедшие отбор по таймлайну/варианту, в исходном порядке мира.
     q: { text, sceneLoc, present: [имена в сцене], skipNames: [имя персонажа, имя собеседника],
          focusEntities, focusTopics, relevanceHints, limit } */
  function retrieve(facts, q) {
    const o = q || {};
    const limit = o.limit != null ? Math.max(0, Number(o.limit) || 0) : DEFAULT_LIMIT;
    const skip = new Set();
    for (const n of o.skipNames || []) tokens(n).forEach((t) => skip.add(t));
    const textW = vocab(o.text, skip);
    const sceneW = vocab(o.sceneLoc, skip);
    const presentW = vocab((o.present || []).join(" "), skip);
    const focusE = new Set((o.focusEntities || []).map(norm).filter(Boolean));
    const focusT = new Set((o.focusTopics || []).map(norm).filter(Boolean));
    const activeHints = (o.relevanceHints || []).filter((h) => termHit(h, textW, skip));

    const rows = (facts || []).map((f, i) => {
      const ents = f.entities || [], tops = f.topics || [], locs = f.locations || [];
      const entText = ents.filter((x) => termHit(x, textW, skip));
      const topText = tops.filter((x) => termHit(x, textW, skip));
      const locText = locs.filter((x) => termHit(x, textW, skip));
      const entScene = ents.filter((x) => termHit(x, presentW, skip));
      const locScene = locs.filter((x) => termHit(x, sceneW, skip));
      const factW = vocab([f.text].concat(ents, tops, locs).join(" "), skip);
      const longStems = [...new Set(tokens(f.text).filter((t) => t.length >= LEX_LEN && !skip.has(t)).map(stem))];
      const lex = longStems.filter((s) => textW.some((w) => w.startsWith(s))).length;
      const hints = activeHints.filter((h) => termHit(h, factW, skip));
      const focus = ents.filter((x) => focusE.has(norm(x))).length + tops.filter((x) => focusT.has(norm(x))).length;
      const direct = new Set(entText.concat(topText, locText)).size;
      const scene = new Set(entScene.concat(locScene)).size;
      const relevant = direct > 0 || scene > 0 || lex >= LEX_MIN || hints.length > 0;
      const reasons = [];
      if (entText.length) reasons.push("сущность: " + entText.join(", "));
      if (topText.length) reasons.push("тема: " + topText.join(", "));
      if (locText.length) reasons.push("место в тексте: " + locText.join(", "));
      if (locScene.length) reasons.push("место сцены: " + locScene.join(", "));
      if (entScene.length) reasons.push("в сцене: " + entScene.join(", "));
      if (lex >= LEX_MIN) reasons.push("слова текста: " + lex);
      if (hints.length) reasons.push("подсказка: " + hints.join(", "));
      if (relevant && focus) reasons.push("фокус линзы: " + focus);
      return { f, index: i, id: f.id, text: f.text, origin: f.origin, direct, scene, focus, lex, hints: hints.length, relevant, reasons, selected: false, omitted: "" };
    });
    const cmp = (a, b) => (b.direct - a.direct) || (b.scene - a.scene) || (b.focus - a.focus) || (b.lex - a.lex) || (b.hints - a.hints) || (a.index - b.index) || String(a.id).localeCompare(String(b.id));
    const pool = rows.filter((x) => x.relevant).sort(cmp);
    pool.forEach((x, i) => { x.rank = i + 1; if (i < limit) x.selected = true; else x.omitted = "limit"; });
    for (const x of rows) if (!x.relevant) x.omitted = "not-relevant";
    return {
      ranked: pool.filter((x) => x.selected).map((x) => x.f),
      rows: rows.slice().sort((a, b) => (b.relevant - a.relevant) || (a.rank && b.rank ? a.rank - b.rank : 0) || (a.index - b.index))
        .map(({ f, ...r }) => r),
      relevantCount: pool.length,
    };
  }

  PRP.worldRetrieve = { retrieve, termHit, tokens, stem, LEX_MIN, DEFAULT_LIMIT };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldRetrieve;
})(typeof window !== "undefined" ? window : globalThis);
