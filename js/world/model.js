/* Prism RP — общий пак мира (Shared World Pack) и факт мира (World Fact). Чистый модуль.

   Пак — переиспользуемое знание о мире или фандоме, общее для многих карточек.
   Факт мира — декларативное утверждение о мире («Тацуки живёт в Каракуре»). Это НЕ указание модели,
   НЕ черта характера, НЕ опыт, НЕ сценарий и НЕ состояние сцены.
   Метаданные (entities, topics, locations, timeline, variant) — для будущего отбора (FOUNDATION-W2).
   provenance — откуда факт; только сведения для человека, во время работы не исполняется.
   Режим (сцена / переписка) миру не принадлежит: полей, зависящих от режима, здесь нет.
   Без DOM, хранилища, сети и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const SCHEMA = 1;
  const FORMAT = "prismrp-world-pack"; // собственный формат экспорта паков PrismRP

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (v == null ? "" : String(v));
  const strList = (v) => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : []);
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function provenance(p) {
    const o = isObj(p) ? p : {};
    const out = { kind: o.kind === "imported" ? "imported" : "manual" };
    if (o.sourceFormat) out.sourceFormat = str(o.sourceFormat);
    if (o.sourceId) out.sourceId = str(o.sourceId);
    if (o.note) out.note = str(o.note);
    return out;
  }

  // Факт мира в каноническом виде. Пустой id получает новый; существующий не меняется никогда.
  function fact(f, idPrefix) {
    const o = isObj(f) ? f : {};
    return {
      id: str(o.id).trim() || uid(idPrefix || "wf"),
      text: str(o.text),
      entities: strList(o.entities),
      topics: strList(o.topics),
      locations: strList(o.locations),
      timeline: str(o.timeline).trim(),
      variant: str(o.variant).trim(),
      enabled: o.enabled !== false,
      provenance: provenance(o.provenance),
    };
  }

  function blank(name) {
    const now = Date.now();
    return { id: uid("wp"), schema: SCHEMA, name: str(name), description: "", facts: [], source: { kind: "manual" }, createdAt: now, updatedAt: now };
  }

  // Приведение пака к каноническому виду (без исправления смысловых ошибок: повторы id остаются и видны в проверке).
  function normalize(p) {
    const o = isObj(p) ? p : {};
    return {
      id: str(o.id).trim(),
      schema: SCHEMA,
      name: str(o.name),
      description: str(o.description),
      facts: Array.isArray(o.facts) ? o.facts.map((f) => fact(f)) : [],
      source: isObj(o.source) ? Object.assign({ kind: o.source.kind === "imported" ? "imported" : "manual" },
        o.source.format ? { format: str(o.source.format) } : {}, o.source.importedAt ? { importedAt: o.source.importedAt } : {}) : { kind: "manual" },
      createdAt: o.createdAt || Date.now(),
      updatedAt: o.updatedAt || Date.now(),
    };
  }

  const issueOf = (level, code, message) => ({ level, code, message });

  /* Экспорт: канонический JSON пака. Линзы персонажей в экспорт пака не входят. */
  function exportPack(p) {
    return { app: "prism-rp", format: FORMAT, schema: SCHEMA, exportedAt: new Date().toISOString(), pack: normalize(p) };
  }

  /* Импорт: текст → проверенный пак или ошибки. Ничего не сохраняет и ничего не исполняет.
     Принимается только собственный формат PrismRP; чужие форматы лорбуков не поддерживаются.
     Новый id пака выдаётся всегда (чтобы не затереть существующий); id фактов сохраняются —
     на них ссылаются переопределения. → { ok, pack | null, issues } */
  function importPackText(text) {
    let json;
    try { json = JSON.parse(text); }
    catch (e) { return { ok: false, pack: null, issues: [issueOf("error", "invalid-json", "Файл не является корректным JSON: " + e.message)] }; }
    if (!isObj(json) || json.app !== "prism-rp" || json.format !== FORMAT) {
      return { ok: false, pack: null, issues: [issueOf("error", "unknown-format", "Это не пак мира PrismRP (нужны app: \"prism-rp\" и format: \"" + FORMAT + "\").")] };
    }
    if (json.schema !== SCHEMA) return { ok: false, pack: null, issues: [issueOf("error", "schema", `Версия пака ${json.schema} не поддерживается.`)] };
    const raw = json.pack;
    const V = PRP.worldValidate; // граница проверки — world/validate.js (загружается после модели)
    const issues = V.validatePack(raw);
    if (V.hasErrors(issues)) return { ok: false, pack: null, issues };
    const pack = normalize(raw);
    const now = Date.now();
    pack.id = uid("wp");
    pack.source = { kind: "imported", format: FORMAT, importedAt: now };
    pack.createdAt = now; pack.updatedAt = now;
    return { ok: true, pack, issues };
  }

  PRP.worldModel = { SCHEMA, FORMAT, uid, fact, provenance, blank, normalize, exportPack, importPackText, strList, isObj, str };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldModel;
})(typeof window !== "undefined" ? window : globalThis);
