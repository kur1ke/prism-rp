/* Prism RP — каноническая модель карточки персонажа (CardDraft / сохранённая карточка).
   Один формат для всех источников (CC V1/V2/V3, URV v2, созданные в редакторе).
   Смысл полей разведён:
     • личность (постоянная основа): description, appearance, personality;
     • начало мира: scenario; авторское начало: firstMes, altGreetings;
     • манера: mesExample; справочные сведения: lore (не указания);
     • указания автора: directives.system / directives.postHistory — отдельный уровень власти,
       у каждого явный флаг enabled; импортированные приходят выключенными;
     • метаданные: creator, creatorNotes, tags, version; картинки: image;
     • prismCore — необязательное ядро для Prism (prism/card-context): компактное представление, а не источник истины;
       включается отдельно; выбранные основные поля передаются целиком, без обязательного краткого ядра;
     • contextFields — выбор description/personality/appearance (по умолчанию включены) и prismCore (выключен);
     • source — исходник и сведения импорта, ТОЛЬКО хранение: во время работы не читается.
   Чистый модуль: без DOM, хранилища и сети. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const SCHEMA = 2;
  const CONTEXT_DEFAULTS = Object.freeze({ description: true, personality: true, appearance: true, prismCore: false });
  function normalizeContextFields(input) {
    const out = {};
    for (const key of Object.keys(CONTEXT_DEFAULTS)) out[key] = input && typeof input[key] === "boolean" ? input[key] : CONTEXT_DEFAULTS[key];
    return out;
  }

  // Указание автора. Созданное в редакторе включено (отправляется, если в нём есть текст);
  // импортированное — выключено и не проверено, пока пользователь не включит его сам.
  function directive(text, origin) {
    const o = origin === "imported" ? "imported" : "authored";
    return { text: String(text || ""), origin: o, enabled: o === "authored", reviewed: o === "authored" };
  }
  function importedDirective(text) {
    return String(text || "").trim() ? directive(text, "imported") : directive("", "authored");
  }

  // Custom fields are user-controlled *data*, never elevated author directives.
  // Imported fields are preserved but must be enabled explicitly in the editor.
  function normalizeCustomFields(input, imported) {
    return (Array.isArray(input) ? input : []).filter((f) => f && typeof f === "object" && !Array.isArray(f)).map((f, i) => ({
      id: String(f.id || "custom-" + (i + 1)),
      label: String(f.label || ""),
      text: String(f.text || ""),
      mode: f.mode === "always" ? "always" : "relevant",
      enabled: !imported && f.enabled === true,
      ...(f.origin && typeof f.origin === "object" && !Array.isArray(f.origin) ? {
        origin: {
          format: String(f.origin.format || ""),
          path: String(f.origin.path || ""),
          imported: f.origin.imported === true,
        }
      } : {}),
    }));
  }

  function blank() {
    const now = Date.now();
    return {
      id: null, schema: SCHEMA,
      name: "",
      description: "", appearance: "", personality: "",
      scenario: "",
      firstMes: "", altGreetings: [],
      mesExample: "",
      lore: [], customFields: [],
      directives: { system: directive("", "authored"), postHistory: directive("", "authored") },
      creator: "", creatorNotes: "", tags: [], version: "",
      image: undefined,
      prismCore: null,
      contextFields: normalizeContextFields(),
      avatar: null,
      source: null,
      createdAt: now, updatedAt: now,
    };
  }

  // Текст указания, который реально уходит в модель: только включённое и непустое.
  // Никаких запасных путей: source, extensions и прочее хранимое сюда не попадает.
  function activeText(card, which) {
    const d = card && card.directives && card.directives[which];
    return d && d.enabled && String(d.text || "").trim() ? String(d.text) : "";
  }
  // Есть ли у указания текст, который сейчас выключен (для отчёта и предупреждений).
  function hasDisabledText(card, which) {
    const d = card && card.directives && card.directives[which];
    return !!(d && !d.enabled && String(d.text || "").trim());
  }

  // Retire the old slot without losing text or enabling it as context.
  // Once converted, this is an ordinary editable, disabled lore entry.
  function retireBackground(card) {
    if (!card || !Object.prototype.hasOwnProperty.call(card, "background")) return card;
    const next = Object.assign({}, card);
    delete next.background;
    const text = String(card.background || "");
    if (text.trim()) next.lore = (Array.isArray(card.lore) ? card.lore : []).concat([{
      comment: "Из прежнего поля «Прошлое»", content: text,
      keys: [], secondary_keys: [], enabled: false, constant: false,
      selective: false, case_sensitive: false, position: "after_char", insertion_order: 0,
    }]);
    return next;
  }

  /* Приведение карточки, сохранённой в 0.5.0 и раньше (поля systemPrompt / postHistory / raw / spec).
     Старые указания были видны в редакторе и уходили в модель — поэтому они становятся
     авторскими включёнными, поведение не меняется. Исходник переезжает в source. */
  function upgradeStored(card) {
    if (!card || card.schema === SCHEMA) return retireBackground(card);
    const c = Object.assign(blank(), card);
    c.schema = SCHEMA;
    c.appearance = card.appearance || "";
    c.altGreetings = Array.isArray(card.altGreetings) ? card.altGreetings : [];
    c.lore = Array.isArray(card.lore) ? card.lore : [];
    c.tags = Array.isArray(card.tags) ? card.tags : [];
    c.customFields = normalizeCustomFields(card.customFields);
    c.directives = card.directives || {
      system: directive(card.systemPrompt || "", "authored"),
      postHistory: directive(card.postHistory || "", "authored"),
    };
    if (!card.source && card.raw) c.source = { format: card.spec === "chara_card_v3" ? "ccv3" : card.spec === "chara_card_v2" ? "ccv2" : "ccv1", version: "", sourceType: "json", raw: card.raw, importedAt: card.createdAt || null, unmapped: [], compiled: [], preserved: {} };
    delete c.systemPrompt; delete c.postHistory; delete c.raw; delete c.spec;
    return retireBackground(c);
  }

  // Поля, по которым видно, что в карточке есть содержание (не только имя).
  const CONTENT_FIELDS = ["description", "appearance", "personality", "scenario", "firstMes", "mesExample"];
  function hasContent(card) {
    return CONTENT_FIELDS.some((k) => String(card[k] || "").trim()) || (card.lore || []).some(e => e && String(e.content || "").trim()) || (card.altGreetings || []).some((g) => String(g || "").trim()) || (card.customFields || []).some((f) => f && String(f.text || "").trim());
  }

  PRP.cardModel = { SCHEMA, CONTEXT_DEFAULTS, normalizeContextFields, retireBackground, blank, directive, importedDirective, normalizeCustomFields, activeText, hasDisabledText, upgradeStored, hasContent, CONTENT_FIELDS };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.cardModel;
})(typeof window !== "undefined" ? window : globalThis);
