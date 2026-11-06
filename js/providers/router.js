/* Prism RP — выбор транспорта текстовой модели.
   Единая точка вызова для генерации, картинок и ассистента: по виду провайдера
   отправляет готовые сообщения в Perchance (ai-text-plugin) или в OpenAI-совместимый API.
   Ничего не знает о сцене, опыте, карточках и дереве чата — только о транспорте. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const PC = PRP.perchance, OA = PRP.openai;
  const SIMPLE = PRP.simpleRequest || (typeof require !== "undefined" ? require("./simple-request.js") : null);

  /* prov — элемент settings.providerList; messages — [{role, content}].
     opts: { names: {char, user} (для Perchance), sampler (для API), signal, onDelta, continueFrom,
             closing (Perchance: последняя строка инструкции, текст готовит вызывающий),
             outputFormat: "message-body" (Messenger) | "json" (структурированная задача; без рамки диалога) }
     → { text, reasoning } (контракт PRP.openai.chat / PRP.perchance.chat) */
  function chat(prov, messages, opts) {
    const o = opts || {};
    return prov.kind === "perchance"
      ? PC.chat(o.names || {}, messages, { signal: o.signal, onDelta: o.onDelta, continueFrom: o.continueFrom || null, closing: o.closing || null, outputFormat: o.outputFormat || null, imageDataUrl: o.imageDataUrl || null })
      : OA.chat(prov, messages, o.sampler, { signal: o.signal, onDelta: o.onDelta });
  }

  // Короткий служебный вызов без стриминга (перевод сцены в промпт картинки).
  async function simple(prov, instruction, options) {
    if (!prov) throw new Error("нет текстовой модели");
    const request = SIMPLE.prepare(prov, instruction, options);
    const signal = options && options.signal;
    if (prov.kind === "perchance") return PC.simple(request.instruction, { signal });
    const r = await OA.chat(prov, request.messages, request.sampler, { signal });
    return OA.splitThink(r.text).text;
  }

  PRP.llm = { chat, simple };
})(typeof window !== "undefined" ? window : globalThis);
