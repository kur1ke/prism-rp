/* Prism RP — настройки: значения по умолчанию и чистые вычисления над ними.
   Не читает DOM, хранилище и сеть: на вход — объект настроек, на выход — значения.
   Сохранение настроек делает приложение (app.js) через хранилище. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const DEFAULTS = {
    activeProvider: "perchance",
    providers: [],
    samplerPreset: "balanced",
    sampler: { temperature: 0.9, top_p: 0.95, min_p: 0.05, top_k: 0, repetition_penalty: 1.05, max_tokens: 700 },
    contextTokens: 8192,
    autoContext: true,
    singleSystem: false,
    sceneProtocol: true,
    developerMode: false,
    noPostHistory: false,
    expLimit: 8,
    worldLimit: 8, // фактов мира за ход (наибольшее число; входят только релевантные)
    theme: "dusk",
    proseSize: 17,
    persona: { name: "Пользователь", description: "" },
    images: {
      enabled: true, backend: "perchance", url: "", key: "", model: "", vae: "", sampler: "", scheduler: "",
      steps: 28, cfg: 5.5, seed: "", sizeMode: "auto", fixedSize: "1024x1024", maxSide: 1216,
      hires: false, hiresScale: 1.5, hiresUpscaler: "R-ESRGAN 4x+ Anime6B", hiresDenoise: 0.4, hiresSteps: 0,
      fixedPrompt: "", promptMode: "append", negative: "", format: "tags", translate: true,
      drawPromptMode: "tags", modelDraws: true, modelDrawPolicy: "contextual", autoDraw: true, extra: "",
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // Сохранённые настройки поверх значений по умолчанию (вложенные группы — тоже поверх).
  // perchanceImages: доступна ли генерация картинок Perchance (для первого запуска вне Perchance).
  function merge(saved, opts) {
    const s = Object.assign(clone(DEFAULTS), saved || {});
    s.sampler = Object.assign({}, DEFAULTS.sampler, s.sampler || {});
    s.persona = Object.assign({}, DEFAULTS.persona, s.persona || {});
    s.images = Object.assign({}, DEFAULTS.images, s.images || {});
    // Старые настройки сохраняют выбранное пользователем поведение.
    // По умолчанию модель получает инструмент [draw:] и сама выбирает уместный момент.
    if (saved && saved.images && !Object.prototype.hasOwnProperty.call(saved.images, "modelDrawPolicy")) {
      s.images.modelDrawPolicy = saved.images.modelDraws === false ? "off" : "contextual";
    }
    if (!saved && opts && opts.perchanceImages === false) s.images.backend = "a1111";
    return s;
  }

  function persona(s) { return (s && s.persona) || DEFAULTS.persona; }

  // Список текстовых моделей: бесплатная Perchance (если доступна) + свои API.
  function providerList(s, perchanceAvailable) {
    const list = [];
    if (perchanceAvailable) list.push({ id: "perchance", name: "Perchance", kind: "perchance", label: "Perchance" });
    for (const p of s.providers) list.push(Object.assign({ kind: "openai", label: p.model ? `${p.name} · ${p.model}` : p.name }, p));
    return list;
  }
  function activeProvider(s, list) {
    return list.find((p) => p.id === s.activeProvider) || list[0] || null;
  }
  // Объём контекста: для Perchance — из метаданных плагина, если включено; иначе из настроек.
  // perchanceMeta — объект или функция (вызывается, только если метаданные нужны).
  function contextTokens(s, provider, perchanceMeta) {
    if (s.autoContext && provider && provider.kind === "perchance") {
      const m = typeof perchanceMeta === "function" ? perchanceMeta() : perchanceMeta;
      if (m && m.idealMaxContextTokens) return m.idealMaxContextTokens;
    }
    return s.contextTokens || 8192;
  }
  function imagesOn(s, perchanceImagesAvailable) {
    const ic = s.images;
    return ic.enabled && (ic.backend !== "perchance" || perchanceImagesAvailable);
  }
  const DRAW_POLICIES = ["off", "on-request", "contextual"];
  function modelDrawPolicy(s) {
    const c = s && s.images || DEFAULTS.images;
    if (DRAW_POLICIES.includes(c.modelDrawPolicy)) return c.modelDrawPolicy;
    return c.modelDraws === false ? "off" : "contextual"; // legacy settings
  }
  // Явная просьба прислать/создать изображение, а не простое упоминание фото.
  // Это безопасный минимальный шлюз; сложные контекстные просьбы можно
  // удовлетворить ручной кнопкой «Нарисовать» или режимом «По ситуации».
  function pictureRequested(text) {
    const s = String(text || "").toLowerCase().replace(/ё/g, "е");
    if (/(?:^|[^\p{L}\p{N}])(?:не\s+(?:покажи|пришли|скинь|кинь|отправь|рисуй|нарисуй|делай|генерируй|сгенерируй|присылай|показывай|send|show|draw|generate)|не\s+хочу[^.!?]{0,70}(?:фото|селфи|картинк|photo|picture))/iu.test(s)) return false;
    const noun = /(?:фото(?:графи[юяией])?|селфи|картинк[ауеиой]?|изображени[ея]|портрет|рисунок|фотку|photo|picture|image|selfie|portrait|pic)/i;
    const verb = /(?:пришли|скинь|кинь|отправь|покажи|нарисуй|нарисовать|сгенерируй|сделай|сфотографируй|сфоткай|создай|прислать|скинуть|отправить|показать|сгенерировать|send|show|draw|generate|make|create)/i;
    if (/(?:покажи|show)\s+(?:мне\s+)?(?:как\s+ты\s+выглядишь|себя)/i.test(s)) return true;
    // «А можешь прислать мне фотографию?» — да; «фото было красивым» — нет.
    return verb.test(s) && noun.test(s) && (s.search(noun) >= s.search(verb)) && s.search(noun) - s.search(verb) < 85;
  }
  function modelDrawAllowed(s, path) {
    const mode = modelDrawPolicy(s);
    if (mode === "off") return false;
    if (mode === "contextual") return true;
    const last = Array.isArray(path) && path[path.length - 1];
    return !!last && last.role === "user" && pictureRequested(last.text);
  }
  function qualityPinned(s) {
    const ic = s.images;
    return ic.promptMode !== "off" && !!String(ic.fixedPrompt || "").trim();
  }

  PRP.settings = { DEFAULTS, merge, persona, providerList, activeProvider, contextTokens, imagesOn, qualityPinned, modelDrawPolicy, modelDrawAllowed, pictureRequested };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.settings;
})(typeof window !== "undefined" ? window : globalThis);
