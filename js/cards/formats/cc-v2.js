/* Prism RP — адаптер Character Card V2 (spec: chara_card_v2). Разбор поля data используется и для V3.
   system_prompt и post_history_instructions становятся импортированными указаниями — выключенными.
   Расширения (extensions) хранятся в исходнике; из них читается только наше prism_rp
   (настройки картинок и раздельные поля Prism), ничего из расширений не становится указанием. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const F = PRP.cardFormats, CM = PRP.cardModel;
  const { clone, str, strList, isObj, unmapped, loreEntry, note } = F.helpers;

  const KNOWN = ["name", "description", "personality", "scenario", "first_mes", "mes_example", "creator_notes", "system_prompt", "post_history_instructions",
    "alternate_greetings", "tags", "creator", "character_version", "character_book", "extensions"];

  // data (V2/V3) → черновик; notes дополняются. known — разобранные ключи (V3 добавляет свои).
  function mapData(data, detection, json, known) {
    const notes = [];
    const d = CM.blank();
    const ext = isObj(data.extensions) ? data.extensions : {};
    const prism = isObj(ext.prism_rp) ? ext.prism_rp : {};
    d.name = str(data.name).trim();
    // Раздельные поля Prism (наш экспорт складывает внешность и прошлое в description для других приложений).
    // Поля берутся раздельно, только если description не правили после экспорта (совпадает со сборкой из них).
    const pf = isObj(prism.fields) ? prism.fields : null;
    const composed = pf && [pf.description, pf.appearance ? "Внешность:\n" + pf.appearance : "", pf.background ? "Прошлое:\n" + pf.background : ""]
      .map((x) => str(x).trim()).filter(Boolean).join("\n\n");
    if (pf && composed === str(data.description).trim()) {
      d.description = str(pf.description);
      d.appearance = str(pf.appearance);
      d.background = str(pf.background);
    } else {
      d.description = str(data.description);
      if (pf) notes.push(note("info", "prism-fields-stale", "Описание менялось после экспорта из Prism: взято целиком из description."));
    }
    d.personality = str(data.personality);
    d.scenario = str(data.scenario);
    d.firstMes = str(data.first_mes);
    d.altGreetings = strList(data.alternate_greetings);
    d.mesExample = str(data.mes_example);
    d.creatorNotes = str(data.creator_notes);
    d.tags = strList(data.tags);
    d.creator = str(data.creator);
    d.version = str(data.character_version);
    const book = isObj(data.character_book) ? data.character_book : null;
    d.lore = book && Array.isArray(book.entries) ? book.entries.map((e, i) => loreEntry(e, i, { source: "character_book" })) : [];
    if (isObj(prism.image)) d.image = clone(prism.image);
    // Import cannot enable new model-facing custom data without local user approval.
    d.customFields = CM.normalizeCustomFields(prism.customFields, true);
    if (d.customFields.length) notes.push(note("info", "prism-custom-fields", "Пользовательские поля сохранены, но передача модели выключена до явного включения."));
    // Ядро Prism из нашего расширения — данные, а не указание; приходит непроверенным и не используется,
    // пока пользователь не сохранит его в редакторе (до этого Prism собирает запасное ядро из полей).
    if (isObj(prism.prismCore)) {
      const pc = prism.prismCore;
      const list = (v) => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : []);
      const core = { schema: 1, identity: str(pc.identity).trim(), traits: list(pc.traits), voice: list(pc.voice), durableContext: list(pc.durableContext), source: "imported", reviewed: false };
      if (core.identity || core.traits.length || core.voice.length || core.durableContext.length) {
        d.prismCore = core;
        notes.push(note("info", "prism-core", "Ядро Prism из карточки перенесено как данные, непроверенным: оно начнёт использоваться после сохранения в редакторе."));
      }
    }

    // Указания автора: только из стандартных полей, импортированные и выключенные.
    // Пустое стандартное поле = указания нет. Расширения (в т. ч. prism_rp.disabledDirectives) указаниями не становятся.
    d.directives.system = CM.importedDirective(str(data.system_prompt));
    d.directives.postHistory = CM.importedDirective(str(data.post_history_instructions));
    const dis = isObj(prism.disabledDirectives) ? clone(prism.disabledDirectives) : null;
    if (dis) notes.push(note("info", "prism-disabled-directives", "Выключенные указания из прошлого экспорта Prism (extensions.prism_rp.disabledDirectives) сохранены в исходнике и не восстанавливаются."));

    // Расширения других приложений: хранятся, не выполняются.
    const otherExt = Object.keys(ext).filter((k) => k !== "prism_rp");
    if (otherExt.includes("depth_prompt")) notes.push(note("warning", "ext-depth-prompt", "Заметка персонажа SillyTavern (extensions.depth_prompt) сохранена, но не используется: это указание, а не часть характера."));
    if (otherExt.length) notes.push(note("info", "ext-preserved", `Расширения других приложений сохранены без изменений: ${otherExt.join(", ")}.`));
    if (isObj(prism.image)) notes.push(note("info", "prism-image", "Настройки картинок Prism (триггер, LoRA, гардероб) перенесены из карточки."));

    const un = unmapped(data, known, "data");
    if (un.length) notes.push(note("info", "unmapped", `Поля сохранены, но не используются: ${un.join(", ")}.`));
    d.source = {
      format: detection.format, version: detection.version, sourceType: detection.sourceType, adapter: "cc-" + detection.format.slice(2),
      importedAt: Date.now(), raw: clone(json), unmapped: un, compiled: [], preserved: dis ? { disabledDirectives: dis } : {},
    };
    return { draft: d, notes };
  }

  F.register("ccv2", (json, detection) => mapData(json.data, detection, json, KNOWN));
  F.ccData = { mapData, KNOWN };
})(typeof window !== "undefined" ? window : globalThis);
