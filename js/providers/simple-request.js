/* Pure preparation/cost of a simple text request; shared with the transport. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util || (typeof require !== "undefined" ? require("../core/util.js") : null);
  function prepare(provider, instruction, options) {
    const text = String(instruction == null ? "" : instruction);
    const reserveTokens = Math.max(120, Math.min(1000, Number(options && options.maxTokens) || 400));
    return {
      instruction: text, messages: [{ role: "user", content: text }],
      sampler: { temperature: 0.3, max_tokens: reserveTokens },
      inputTokens: U.estimateTokens(text) + (provider && provider.kind === "perchance" ? 0 : 4),
      reserveTokens,
    };
  }
  function budget(provider, instruction, options, contextTokens) {
    const request = prepare(provider, instruction, options);
    const invalidContext = !Number.isFinite(contextTokens) || contextTokens <= 0;
    const fits = !invalidContext &&
      request.inputTokens + request.reserveTokens <= contextTokens;
    return { contextTokens, inputTokens: request.inputTokens,
      reserveTokens: request.reserveTokens, invalidContext, fits, overflow: !fits };
  }
  PRP.simpleRequest = { prepare, budget };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.simpleRequest;
})(typeof window !== "undefined" ? window : globalThis);
