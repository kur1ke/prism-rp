/* Prism RP — выбор транспорта текстовой модели.
   Единая точка вызова для генерации, картинок и ассистента: по виду провайдера
   отправляет готовые сообщения в Perchance (ai-text-plugin) или в OpenAI-совместимый API.
   Ничего не знает о сцене, опыте, карточках и дереве чата — только о транспорте. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const PC = PRP.perchance, OA = PRP.openai;

  /* prov — элемент settings.providerList; messages — [{role, content}].
     opts: { names: {char, user} (для Perchance), sampler (для API), signal, onDelta, continueFrom }
     → { text, reasoning } (контракт PRP.openai.chat / PRP.perchance.chat) */
  function chat(prov, messages, opts) {
    const o = opts || {};
    return prov.kind === "perchance"
      ? PC.chat(o.names || {}, messages, { signal: o.signal, onDelta: o.onDelta, continueFrom: o.continueFrom || null })
      : OA.chat(prov, messages, o.sampler, { signal: o.signal, onDelta: o.onDelta });
  }

  // Короткий служебный вызов без стриминга (перевод сцены в промпт картинки).
  async function simple(prov, instruction) {
    if (!prov) throw new Error("нет текстовой модели");
    if (prov.kind === "perchance") return PC.simple(instruction);
    const r = await OA.chat(prov, [{ role: "user", content: instruction }], { temperature: 0.3, max_tokens: 400 }, {});
    return OA.splitThink(r.text).text;
  }

  PRP.llm = { chat, simple };
})(typeof window !== "undefined" ? window : globalThis);
