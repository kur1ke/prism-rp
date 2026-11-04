/* Prism RP — выбранные основные поля целиком, необязательное явное ядро,
   выборочные дополнительные сведения и примеры. Чистый модуль.
   Основные поля и включённое проверенное ядро защищены от обрезания:
   если после сокращения остальных слоёв они не помещаются, сборщик сообщает overflow. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const CM = PRP.cardModel || (typeof require !== "undefined" ? require("../cards/model.js") : null);
  const CORE_SCHEMA = 1;
  const CHUNK_MAX = 500;      // символов в куске подробностей
  const CHUNK_LIMIT = 4;      // кусков подробностей за ход
  const EXAMPLES = { fullUntil: 2, oneUntil: 5 };
  const FIELD_WORD = { description: "описание", personality: "личность", appearance: "внешность", custom: "дополнительные сведения" };
  // Признаки разговора о внешности (по основам слов; рус. и англ.).
  // Только начало слова: «рост» не должен находиться в «просто», «лица» — в «улица».
  const VISUAL = /(?:^|[^\p{L}])(?:внешн|выгляд|одежд|одет|оделас|наряд|плать|юбк|рубашк|футболк|джинс|волос|причёс|причес|глаз|лицо|лица|фигур|рост[ау]?(?![\p{L}])|фото|селфи|снимок|снимк|портрет|похож|look|hair|eyes|outfit|dress|wear|photo|selfie|picture)/iu;
  const STOP = new Set(["котор", "когда", "этот", "этого", "этой", "очень", "только", "своих", "свои", "своей", "своего", "всегда", "никогда", "тоже", "также", "потом", "сейчас", "если", "чтобы", "будет", "было", "была", "были", "есть", "даже", "ещё", "еще", "where", "with", "that", "this", "have", "from", "they", "their", "about"]);

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (v == null ? "" : String(v));
  const strList = (v) => (Array.isArray(v) ? v : String(v || "").split("\n")).map((x) => str(x).trim()).filter(Boolean);

  /* ── Ядро ─────────────────────────────────────────────────────────── */
  // Канонический вид явного ядра или null (пустое ядро — как нет ядра).
  function normCore(x) {
    if (!isObj(x)) return null;
    const c = {
      schema: CORE_SCHEMA, identity: str(x.identity).trim(), traits: strList(x.traits), voice: strList(x.voice), durableContext: strList(x.durableContext),
      source: ["manual", "derived", "imported"].includes(x.source) ? x.source : "manual", reviewed: x.reviewed !== false,
    };
    return c.identity || c.traits.length || c.voice.length || c.durableContext.length ? c : null;
  }

  const paragraphs = (t) => str(t).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const sentences = (t) => (str(t).match(/[^.!?…]+[.!?…]+[»")\]]*\s*|[^.!?…]+$/g) || [str(t)]).map((s) => s.trim()).filter(Boolean);

  // Full selected primary fields; a reviewed explicit Core is an opt-in addition.
  function core(card, m) {
    const mm = m || ((x) => x), cd = card || {}, fields = CM.normalizeContextFields(cd.contextFields);
    const primary = {
      description: fields.description ? mm(str(cd.description)).trim() : "",
      personality: fields.personality ? mm(str(cd.personality)).trim() : "",
      appearance: fields.appearance ? mm(str(cd.appearance)).trim() : "",
    };
    const ex = fields.prismCore ? normCore(cd.prismCore) : null;
    const explicit = ex && ex.reviewed;
    return { source: explicit ? "explicit" : "fallback",
      reason: ex && !ex.reviewed ? "ядро из файла не проверено; выбранные основные поля передаются целиком" : "выбранные основные поля передаются целиком",
      identity: explicit ? mm(ex.identity) : primary.description,
      personality: explicit ? "" : primary.personality,
      traits: explicit ? ex.traits.map(mm) : [], voice: explicit ? ex.voice.map(mm) : [],
      durableContext: explicit ? ex.durableContext.map(mm) : [],
      primary, fields, truncated: [], rest: { description: "", personality: "" } };
  }

  // Optional manual Core starts from complete text, never from a character cap.
  function deriveCore(card) {
    const cd = card || {};
    return { schema: CORE_SCHEMA, identity: str(cd.description).trim(), traits: paragraphs(cd.personality),
      voice: [], durableContext: [], source: "derived", reviewed: true };
  }

  // Text-only estimate for the permanent selection, not the complete request.
  // Colours use 20% / 40% of the configured input window (after output reserve).
  function tokenUsage(card, budget) {
    const k = core(card), estimate = PRP.util.estimateTokens, ex = normCore((card || {}).prismCore);
    const fields = { description: estimate(str((card || {}).description)), personality: estimate(str((card || {}).personality)),
      appearance: estimate(str((card || {}).appearance)), prismCore: estimate(ex ? [ex.identity, ...ex.traits, ...ex.voice, ...ex.durableContext].join("\n") : "") };
    const total = Object.keys(fields).reduce((n, key) => n + (k.fields[key] && (key !== "prismCore" || k.source === "explicit") ? fields[key] : 0), 0);
    const level = total === 0 || budget > 0 && total <= budget * .2 ? "normal" : budget > 0 && total <= budget * .4 ? "warn" : "danger";
    return { fields, total, budget, level };
  }

  /* ── Подробности ──────────────────────────────────────────────────── */
  function splitChunks(text) {
    const out = [];
    for (const p of paragraphs(text)) {
      if (p.length <= CHUNK_MAX) { out.push(p); continue; }
      let cur = "";
      for (const s of sentences(p)) {
        if (cur && cur.length + s.length + 1 > CHUNK_MAX) { out.push(cur); cur = ""; }
        cur = cur ? cur + " " + s : s;
      }
      if (cur) out.push(cur);
    }
    return out;
  }
  // Optional custom details; primary fields never enter this selector.
  function chunks(card, k, m) {
    const mm = m || ((x) => x);
    const cd = card || {};
    const out = [];
    // Custom fields are opt-in card facts. Never interpret their labels as prompt roles.
    (Array.isArray(cd.customFields) ? cd.customFields : []).forEach((f, i) => {
      if (!f || f.enabled !== true || !str(f.label).trim() || !str(f.text).trim()) return;
      splitChunks(mm(str(f.text))).forEach((part, j) => out.push({
        id: `custom#${i + 1}#${j + 1}`, field: "custom",
        text: str(f.label).trim() + ": " + part, order: out.length,
        force: f.mode === "always",
      }));
    });
    return out;
  }

  const tokens = (t) => str(t).toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) || [];
  /* Одно слово в разных формах: общий префикс не короче max(3, длина короткого − 2), для слов от 6 букв —
     длина короткого − 3 («Сора» / «Сорой», «волосы» / «волос», «боится» / «боишься»). Слова короче 4 букв не сравниваются. */
  function near(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 4) return false;
    let p = 0;
    while (p < n && a[p] === b[p]) p++;
    return p >= Math.max(3, n - (n >= 6 ? 3 : 2));
  }
  const hits = (w, list) => list.some((x) => near(w, x));
  // Значимые слова: от 4 букв, без служебных и без имён участников (в любой форме).
  function words(text, skip) {
    const out = [];
    for (const w of tokens(text)) if (w.length >= 4 && !STOP.has(w) && !hits(w, skip) && !out.includes(w)) out.push(w);
    return out;
  }
  // Имена и термины в куске: слово с заглавной не в начале предложения (имена людей, мест, организаций).
  function terms(text, skip) {
    const out = [];
    const re = /(^|[.!?…]\s+|\n)?([\p{Lu}][\p{L}\p{N}\-]{2,})/gu;
    let mt;
    while ((mt = re.exec(str(text)))) {
      if (mt[1] !== undefined) continue; // начало предложения — не признак имени
      const w = mt[2].toLowerCase().replace(/ё/g, "е");
      if (w.length >= 4 && !hits(w, skip) && !out.includes(w)) out.push(w);
    }
    return out;
  }

  /* Отбор подробностей. o: { text — последние реплики, context — сцена/среда/сценарий одной строкой,
     names — имена участников (не дают связи), visual — операция требует зрительной опоры, limit }
     → { rows: [{ id, field, chars, overlap, terms, visual, reasons, eligible, selected, rank, omitted }], selected: [куски по рангу] } */
  function select(list, o) {
    const x = o || {};
    const skip = [];
    for (const n of x.names || []) tokens(n).forEach((w) => { if (w.length >= 3) skip.push(w); });
    const hay = [x.text, x.context].filter(Boolean).join("\n");
    const ctxWords = words(hay, skip);
    const visualCue = VISUAL.test(hay);
    const rows = (list || []).map((c) => {
      const ov = words(c.text, skip).filter((w) => hits(w, ctxWords));
      const tm = terms(c.text, skip).filter((w) => hits(w, ctxWords));
      const vis = c.field === "appearance" && (visualCue || !!x.visual);
      const reasons = [];
      if (tm.length) reasons.push("прозвучало: " + tm.slice(0, 3).join(", "));
      if (ov.length >= 2) reasons.push(`общих слов: ${ov.length}`);
      if (vis) reasons.push(x.visual && !visualCue ? "нужна зрительная опора" : "разговор о внешности");
      if (c.force) reasons.push("пользователь включил постоянную подачу");
      const eligible = !!c.force || tm.length > 0 || ov.length >= 2 || vis;
      return { id: c.id, field: c.field, chars: c.text.length, overlap: ov.length, terms: tm.length, visual: vis, force: !!c.force, reasons, eligible, selected: false, rank: null, omitted: eligible ? "" : "no-relation", text: c.text, order: c.order };
    });
    const pool = rows.filter((r) => r.eligible).sort((a, b) => (Number(b.force) - Number(a.force)) || (b.terms - a.terms) || (b.overlap - a.overlap) || (b.visual - a.visual) || (a.order - b.order));
    const limit = x.limit != null ? x.limit : CHUNK_LIMIT;
    pool.forEach((r, i) => { if (i < limit) { r.selected = true; r.rank = i + 1; } else r.omitted = "limit"; });
    return { rows, selected: pool.filter((r) => r.selected) };
  }

  /* ── Примеры речи ─────────────────────────────────────────────────── */
  function exampleBlocks(card, m) {
    const mm = m || ((x) => x);
    return mm(str((card || {}).mesExample)).split(/<START>/i).map((b) => b.trim()).filter(Boolean);
  }
  // Сколько примеров подать по числу ответов персонажа на ветке. → { keep, rule }
  function examplesFor(total, assistantTurns) {
    const n = Number(assistantTurns) || 0;
    if (n <= EXAMPLES.fullUntil) return { keep: total, rule: `ответов персонажа ${n} (≤ ${EXAMPLES.fullUntil}) — все примеры` };
    if (n <= EXAMPLES.oneUntil) return { keep: Math.min(1, total), rule: `ответов персонажа ${n} (≤ ${EXAMPLES.oneUntil}) — только первый пример` };
    return { keep: 0, rule: `ответов персонажа ${n} — голос уже виден в истории, примеры не подаются` };
  }

  PRP.cardContext = { CORE_SCHEMA, CHUNK_MAX, CHUNK_LIMIT, EXAMPLES, FIELD_WORD, normCore, core, deriveCore, tokenUsage, chunks, select, exampleBlocks, examplesFor, sentences, paragraphs };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.cardContext;
})(typeof window !== "undefined" ? window : globalThis);
