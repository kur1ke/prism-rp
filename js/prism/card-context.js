/* Prism RP — карточка в Prism: устойчивое ядро + выборочные подробности (FOUNDATION-H). Чистый модуль.

   Источник истины — сама карточка: её поля не меняются, не переписываются и не урезаются при хранении.
   Prism на каждом ходе собирает из неё:

   1. ЯДРО (Prism Core) — компактное устойчивое представление персонажа, подаётся всегда.
      • Явное ядро — card.prismCore { schema: 1, identity, traits[], voice[], durableContext[], source, reviewed }.
        Его видно и можно править в редакторе карточки. Модель его не пишет, генерация его не меняет,
        вызовов модели для его сборки нет. Ядро из файла (extensions.prism_rp.prismCore) приходит
        непроверенным (reviewed: false) и не используется, пока пользователь не сохранит его сам.
      • Запасное ядро (нет явного) — детерминированно из полей карточки, без модели:
        имя, начало описания и личность, каждое — по абзацам и целым предложениям не длиннее CAP символов.
        Жёсткий предел: если уже первое предложение длиннее CAP (или знаков препинания нет), берётся начало
        до последнего пробела (или ровно CAP символов) с «…» — явно и с пометкой в отчёте (cut: word | hard).
        Что сокращено — в отчёте; остаток не теряется, а становится выборочными подробностями.
   2. ВЫБОРОЧНЫЕ ПОДРОБНОСТИ — остаток описания и личности, прошлое, внешность, разбитые на куски по абзацам
      (длинный абзац — по предложениям до CHUNK_MAX символов). Кусок входит только при положительной связи
      с текущим ходом: имя или термин из куска прозвучал в разговоре, сцене или среде переписки; или не меньше
      двух общих слов (одно слово в разных формах — по общему началу; без имён участников и служебных слов). Внешность — ещё и когда разговор или сцена касаются
      внешности/одежды, либо операция требует зрительной опоры (начало сцены). Важность, порядок и свежесть
      права войти не дают. Отбор решает только, войдёт ли кусок, — не то, верен ли он.
   3. ПРИМЕРЫ РЕЧИ — по числу ответов персонажа на ветке (живая история уже показывает голос):
      0–2 ответа — все примеры; 3–5 — только первый пример; 6 и больше — без примеров.
   Без DOM, хранилища, сети, таймеров и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const CORE_SCHEMA = 1;
  const CAP = 600;            // запасное ядро: символов на поле (по абзацам и предложениям)
  const CHUNK_MAX = 500;      // символов в куске подробностей
  const CHUNK_LIMIT = 4;      // кусков подробностей за ход
  const EXAMPLES = { fullUntil: 2, oneUntil: 5 };
  const FIELDS = ["description", "personality", "background", "appearance"];
  const FIELD_WORD = { description: "описание", personality: "личность", background: "прошлое", appearance: "внешность" };
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

  /* Начало текста не длиннее cap: по абзацам и целым предложениям.
     Жёсткий предел: если уже ПЕРВОЕ предложение длиннее cap (огромное предложение или текст без знаков препинания),
     оно не входит в ядро целиком — берётся начало до последнего пробела в пределах cap (cut: "word"),
     а если пробела нет — ровно cap символов (cut: "hard"); в конце ставится «…». Это явная, детерминированная
     обрезка, видимая в отчёте; текст не пересказывается, остаток не теряется — он уходит в подробности.
     → { kept, rest, truncated, cut: "" | "sentence" | "word" | "hard" } */
  function capText(text, cap) {
    const t = str(text).trim();
    if (!t || t.length <= cap) return { kept: t, rest: "", truncated: false, cut: "" };
    const first = sentences(paragraphs(t)[0])[0] || t;
    if (first.length > cap) {
      const lim = cap - 2; // место под « …»: итог не длиннее cap
      const head = t.slice(0, lim);
      const sp = head.search(/\s\S*$/);
      const at = sp > lim * 0.5 ? sp : lim;
      return { kept: t.slice(0, at).trimEnd() + " …", rest: t.slice(at).trim(), truncated: true, cut: at === lim ? "hard" : "word" };
    }
    // Предложения по порядку с границами абзацев; берём, пока помещаются (первое — всегда целиком).
    const items = [];
    paragraphs(t).forEach((p) => sentences(p).forEach((s, i) => items.push({ s, para: i === 0 })));
    let used = 0, n = 0;
    for (; n < items.length; n++) {
      const add = items[n].s.length + (n ? (items[n].para ? 2 : 1) : 0);
      if (n && used + add > cap) break;
      used += add;
    }
    const join = (xs) => xs.map((x, i) => (i ? (x.para ? "\n\n" : " ") : "") + x.s).join("");
    const rest = items.slice(n);
    if (rest.length) rest[0] = Object.assign({}, rest[0], { para: true });
    return { kept: join(items.slice(0, n)), rest: join(rest), truncated: rest.length > 0, cut: rest.length ? "sentence" : "" };
  }

  /* Ядро для этой карточки. m — подстановка макросов ({{char}}, {{user}}).
     → { source: "explicit" | "fallback", reason, identity, personality, traits, voice, durableContext, truncated: [{field, kept, total}], rest: {description, personality} } */
  function core(card, m) {
    const mm = m || ((x) => x);
    const cd = card || {};
    const desc = mm(str(cd.description)).trim(), pers = mm(str(cd.personality)).trim();
    const ex = normCore(cd.prismCore);
    if (ex && ex.reviewed) {
      return { source: "explicit", reason: "задано в карточке", identity: mm(ex.identity), personality: "", traits: ex.traits.map(mm), voice: ex.voice.map(mm),
        durableContext: ex.durableContext.map(mm), truncated: [], rest: { description: desc, personality: pers } };
    }
    const d = capText(desc, CAP), p = capText(pers, CAP);
    const truncated = [];
    if (d.truncated) truncated.push({ field: "description", kept: d.kept.length, total: desc.length, cut: d.cut });
    if (p.truncated) truncated.push({ field: "personality", kept: p.kept.length, total: pers.length, cut: p.cut });
    return { source: "fallback", reason: ex && !ex.reviewed ? "ядро из файла не проверено — собрано из полей карточки" : "собрано из полей карточки",
      identity: d.kept, personality: p.kept, traits: [], voice: [], durableContext: [], truncated, rest: { description: d.rest, personality: p.rest } };
  }

  // Явное ядро из полей карточки (кнопка «Собрать из карточки»): детерминированно, без модели. Пользователь правит и сохраняет сам.
  function deriveCore(card) {
    const cd = card || {};
    const d = capText(str(cd.description), CAP), p = capText(str(cd.personality), CAP);
    return { schema: CORE_SCHEMA, identity: d.kept, traits: p.kept ? paragraphs(p.kept) : [], voice: [], durableContext: [], source: "derived", reviewed: true };
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
  // Куски подробностей: остаток описания и личности (после ядра), прошлое, внешность. id — «поле#номер».
  function chunks(card, k, m) {
    const mm = m || ((x) => x);
    const cd = card || {};
    const src = { description: k.rest.description, personality: k.rest.personality, background: mm(str(cd.background)).trim(), appearance: mm(str(cd.appearance)).trim() };
    const out = [];
    for (const f of FIELDS) splitChunks(src[f]).forEach((text, i) => out.push({ id: `${f}#${i + 1}`, field: f, text, order: out.length }));
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
      const eligible = tm.length > 0 || ov.length >= 2 || vis;
      return { id: c.id, field: c.field, chars: c.text.length, overlap: ov.length, terms: tm.length, visual: vis, reasons, eligible, selected: false, rank: null, omitted: eligible ? "" : "no-relation", text: c.text, order: c.order };
    });
    const pool = rows.filter((r) => r.eligible).sort((a, b) => (b.terms - a.terms) || (b.overlap - a.overlap) || (b.visual - a.visual) || (a.order - b.order));
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

  PRP.cardContext = { CORE_SCHEMA, CAP, CHUNK_MAX, CHUNK_LIMIT, EXAMPLES, FIELD_WORD, normCore, capText, core, deriveCore, chunks, select, exampleBlocks, examplesFor, sentences, paragraphs };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.cardContext;
})(typeof window !== "undefined" ? window : globalThis);
