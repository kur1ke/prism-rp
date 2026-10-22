/* Prism RP — адаптер Character Card V1: поля в корне (TavernAI: name, description, personality,
   scenario, first_mes, mes_example; Pygmalion: char_name, char_persona, world_scenario,
   char_greeting, example_dialogue). Неразобранные ключи корня хранятся в исходнике. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const F = PRP.cardFormats, CM = PRP.cardModel;
  const { clone, str, strList, unmapped, customFromUnknown, note } = F.helpers;

  const KNOWN = ["name", "char_name", "description", "char_persona", "personality", "scenario", "world_scenario", "first_mes", "char_greeting",
    "mes_example", "example_dialogue", "creator_notes", "tags", "creator", "character_version", "metadata"];

  F.register("ccv1", (json, detection) => {
    const notes = [];
    const d = CM.blank();
    const pick = (a, b) => (str(json[a]).trim() ? str(json[a]) : str(json[b]));
    d.name = pick("name", "char_name").trim();
    d.description = pick("description", "char_persona");
    d.personality = str(json.personality);
    d.scenario = pick("scenario", "world_scenario");
    d.firstMes = pick("first_mes", "char_greeting");
    d.mesExample = pick("mes_example", "example_dialogue");
    d.creatorNotes = str(json.creator_notes);
    d.tags = strList(json.tags);
    d.creator = str(json.creator);
    d.version = str(json.character_version);
    if (json.char_name || json.char_persona || json.char_greeting) notes.push(note("info", "pygmalion", "Поля в стиле Pygmalion (char_name, char_persona, …) разобраны как V1."));
    d.customFields = customFromUnknown(json, KNOWN, "", "ccv1");
    if (d.customFields.length) notes.push(note("info", "custom-mapped", `${d.customFields.length} дополнительных полей перенесены в пользовательские (выключены).`));
    const un = unmapped(json, KNOWN, "");
    if (un.length) notes.push(note("info", "unmapped", `Поля сохранены, но не используются: ${un.join(", ")}.`));
    d.source = { format: "ccv1", version: detection.version, sourceType: detection.sourceType, adapter: "cc-v1", importedAt: Date.now(), raw: clone(json), unmapped: un, compiled: [], preserved: {} };
    return { draft: d, notes };
  });
})(typeof window !== "undefined" ? window : globalThis);
