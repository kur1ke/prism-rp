/* Prism RP — адаптер Character Card V3 (spec: chara_card_v3). Поля data как у V2,
   плюс поля V3, которых нет в модели Prism: они хранятся в исходнике и показываются на проверке. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const F = PRP.cardFormats;
  const { note } = F.helpers;

  const V3_ONLY = ["nickname", "group_only_greetings", "assets", "creator_notes_multilingual", "source", "creation_date", "modification_date"];

  F.register("ccv3", (json, detection) => {
    const res = F.ccData.mapData(json.data, detection, json, F.ccData.KNOWN.concat(V3_ONLY));
    // V3 nickname is additional character data; other V3-only keys are metadata/assets.
    res.draft.customFields = res.draft.customFields.concat(F.helpers.customFromUnknown(json.data, F.ccData.KNOWN, "data", "ccv3").filter((x) => x.origin.path === "data.nickname"));
    const present = V3_ONLY.filter((k) => json.data[k] != null && !(Array.isArray(json.data[k]) && !json.data[k].length));
    if (present.length) {
      res.notes.push(note("info", "v3-preserved", `Поля V3 сохранены, но пока не используются: ${present.join(", ")}.`));
      res.draft.source.unmapped = res.draft.source.unmapped.concat(present.map((k) => "data." + k));
    }
    return res;
  });
})(typeof window !== "undefined" ? window : globalThis);
