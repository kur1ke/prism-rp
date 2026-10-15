/* Prism RP — определение формата карточки по содержимому (не по имени файла).
   → { format: "ccv1" | "ccv2" | "ccv3" | "urv2" | "unknown", version, confidence: "high" | "medium" | "none",
       sourceType: "json" | "png", reason } */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const { isObj } = PRP.cardFormats.helpers;

  const V1_CONTENT = ["description", "personality", "scenario", "first_mes", "mes_example", "char_persona", "world_scenario", "char_greeting", "example_dialogue"];

  function detect(json, sourceType) {
    const base = { sourceType: sourceType || "json" };
    const out = (format, version, confidence, reason) => Object.assign({ format, version, confidence, reason }, base);
    if (!isObj(json)) return out("unknown", "", "none", Array.isArray(json) ? "в файле массив, а не карточка" : "в файле не объект JSON");

    // URV v2: type + version + data.
    if (json.type === "urv-char") {
      if (json.version === 2 && isObj(json.data)) return out("urv2", "2", "high", "type: urv-char, version: 2");
      return out("unknown", String(json.version || ""), "none", `URV-карточка версии ${json.version == null ? "?" : json.version} не поддерживается (нужна версия 2 с полем data)`);
    }

    // Character Card V2 / V3: spec + data.
    if (json.spec === "chara_card_v3" || json.spec === "chara_card_v2") {
      const v3 = json.spec === "chara_card_v3";
      if (!isObj(json.data)) return out("unknown", "", "none", `указан spec ${json.spec}, но нет объекта data`);
      return out(v3 ? "ccv3" : "ccv2", String(json.spec_version || (v3 ? "3.0" : "2.0")), "high", `spec: ${json.spec}`);
    }
    if (json.spec) return out("unknown", "", "none", `неизвестный spec: ${String(json.spec).slice(0, 40)}`);

    // Character Card V1 (TavernAI / Pygmalion): поля в корне — имя и хотя бы одно поле содержания.
    const hasName = typeof json.name === "string" || typeof json.char_name === "string";
    if (hasName && V1_CONTENT.some((k) => typeof json[k] === "string")) return out("ccv1", "1", "medium", "поля V1 в корне (имя и описание/приветствие)");

    const keys = Object.keys(json).slice(0, 8).join(", ");
    return out("unknown", "", "none", keys ? `не похоже ни на один известный формат (ключи: ${keys})` : "пустой объект");
  }

  // Адаптация по результату определения. Неизвестный формат не адаптируется никогда.
  function adapt(json, detection) {
    const fn = PRP.cardFormats.adapters[detection.format];
    if (!fn) return null;
    return fn(json, detection);
  }

  PRP.cardFormats.detect = detect;
  PRP.cardFormats.adapt = adapt;
})(typeof window !== "undefined" ? window : globalThis);
