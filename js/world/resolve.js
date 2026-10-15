/* Prism RP — разрешение статического мира: пак + линза → действующие факты. Чистый модуль.

   Порядок власти W1: линза (переопределения, добавления, выключения) > общий пак.
   (Наложение мира на конкретный чат — следующий этап, FOUNDATION-W2; здесь его нет.)

   Правила:
     • факт, выключенный в самом паке (enabled: false) или линзой (disabledFactIds), не действует;
     • переопределение заменяет факт пака с тем же id (targetFactId); незаданные поля метаданных
       берутся у исходного факта; id действующего факта — id факта пака;
     • добавления линзы идут после фактов пака, в своём порядке;
     • ссылки на несуществующие факты и повторы id — предупреждения в отчёте; совпадение по тексту
       не ищется никогда;
     • при повторе id в паке действует первый факт (детерминированно), остальные — в предупреждениях;
     • входные пак и линза не изменяются.
   В результат попадают только канонические поля пака и линзы: исходники карточек, их расширения,
   опыт, сцена, сценарий и указания автора сюда не читаются. provenance переносится только для показа.
   Результат — для просмотра (W1). В контекст модели он не подаётся. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const copy = (x) => JSON.parse(JSON.stringify(x));
  const META = ["entities", "topics", "locations", "timeline", "variant"];

  /* → { facts: [{ id, text, entities, topics, locations, timeline, variant, provenance, origin, overrideId?, note? }],
         excluded: [{ id, text, reason: "pack-disabled" | "lens-disabled" }],
         report: { packId, lensId, timelineVariant, packFacts, effective, disabled, packDisabled, overridden, additions, warnings } } */
  function resolve(pack, lens) {
    const warnings = [];
    const warn = (code, message, ref) => warnings.push({ level: "warning", code, message, ref });
    const p = pack ? copy(pack) : { id: "", facts: [] };
    const l = lens ? copy(lens) : null;
    if (l && l.packId && p.id && l.packId !== p.id) warn("pack-mismatch", "Линза относится к другому паку — её изменения не применены.", l.packId);
    const useLens = l && (!l.packId || !p.id || l.packId === p.id);

    // Факты пака: первый из повторяющихся id действует, остальные — предупреждение.
    const packFacts = [];
    const byId = new Map();
    for (const f of p.facts || []) {
      if (!f || typeof f !== "object" || !f.id) { warn("fact-malformed", "Факт пака без id пропущен.", ""); continue; }
      if (byId.has(f.id)) { warn("fact-duplicate-id", `Повторяется id факта ${f.id}: действует первый.`, f.id); continue; }
      byId.set(f.id, f);
      packFacts.push(f);
    }

    const disabledIds = new Set(useLens ? l.disabledFactIds || [] : []);
    for (const id of disabledIds) if (!byId.has(id)) warn("disabled-target-missing", `Выключаемого факта ${id} нет в паке — ссылка оставлена как есть.`, id);
    const overrides = new Map();
    for (const o of useLens ? l.overrides || [] : []) {
      if (!o || !o.targetFactId) { warn("override-no-target", "Переопределение без целевого факта пропущено.", o && o.id); continue; }
      if (overrides.has(o.targetFactId)) { warn("override-duplicate-target", `Факт ${o.targetFactId} переопределён повторно: действует первое переопределение.`, o.targetFactId); continue; }
      if (!byId.has(o.targetFactId)) { warn("override-target-missing", `Переопределяемого факта ${o.targetFactId} нет в паке — ссылка оставлена как есть.`, o.targetFactId); continue; }
      overrides.set(o.targetFactId, o);
    }

    const facts = [], excluded = [];
    const overridden = [], packDisabled = [], disabled = [];
    for (const f of packFacts) {
      if (f.enabled === false) { excluded.push({ id: f.id, text: f.text, reason: "pack-disabled" }); packDisabled.push(f.id); continue; }
      if (disabledIds.has(f.id)) { excluded.push({ id: f.id, text: f.text, reason: "lens-disabled" }); disabled.push(f.id); continue; }
      const o = overrides.get(f.id);
      const base = { id: f.id, text: f.text, entities: f.entities || [], topics: f.topics || [], locations: f.locations || [], timeline: f.timeline || "", variant: f.variant || "", provenance: f.provenance || { kind: "manual" } };
      if (o) {
        const eff = Object.assign(base, { text: o.text, origin: "override", overrideId: o.id, originalText: f.text });
        for (const k of META) if (o[k] !== undefined) eff[k] = o[k];
        if (o.note) eff.note = o.note;
        facts.push(eff);
        overridden.push({ targetFactId: f.id, overrideId: o.id });
      } else facts.push(Object.assign(base, { origin: "pack" }));
    }
    const seenAdd = new Set();
    let additions = 0;
    for (const a of useLens ? l.additions || [] : []) {
      if (!a || !a.id) { warn("addition-malformed", "Добавленный факт без id пропущен.", ""); continue; }
      if (seenAdd.has(a.id)) { warn("addition-duplicate-id", `Повторяется id добавленного факта ${a.id}: действует первый.`, a.id); continue; }
      seenAdd.add(a.id);
      if (byId.has(a.id)) warn("addition-id-collides", `id добавленного факта ${a.id} совпадает с фактом пака.`, a.id);
      if (a.enabled === false) { excluded.push({ id: a.id, text: a.text, reason: "lens-addition-disabled" }); continue; }
      facts.push({ id: a.id, text: a.text, entities: a.entities || [], topics: a.topics || [], locations: a.locations || [], timeline: a.timeline || "", variant: a.variant || "", provenance: a.provenance || { kind: "manual" }, origin: "lens" });
      additions++;
    }
    return {
      facts, excluded,
      report: {
        packId: p.id || "", lensId: useLens ? l.id || "" : "", timelineVariant: useLens ? l.timelineVariant || "" : "",
        focusEntities: useLens ? l.focusEntities || [] : [], focusTopics: useLens ? l.focusTopics || [] : [], relevanceHints: useLens ? l.relevanceHints || [] : [],
        packFacts: packFacts.length, effective: facts.length, disabled, packDisabled, overridden, additions, warnings,
      },
    };
  }

  PRP.worldResolve = { resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldResolve;
})(typeof window !== "undefined" ? window : globalThis);
