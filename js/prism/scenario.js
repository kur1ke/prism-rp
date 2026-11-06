/* Prism RP — срок передачи сценария карточки, без изменения истории и состояния.
   Считаются ответы персонажа на выбранном пути; авторское приветствие не считается.
   Regen/continue используют путь ДО целевого ответа, поэтому не расходуют новый шаг.
   0 означает «Никогда»: сценарий не отключается по числу ответов, но общий бюджет действует. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const LIMITS = Object.freeze([5, 10, 15, 20, 25, 30, 0]);
  function replyLimit(value) { return LIMITS.includes(value) ? value : 5; }
  function precedingPath(path, mode, targetId) {
    const p = path || [];
    if (mode === "opening") return [];
    if (mode === "regen" || mode === "continue") {
      const i = p.findIndex((m) => m.id === targetId);
      return i >= 0 ? p.slice(0, i) : p.slice();
    }
    return p.slice();
  }
  function completedReplies(path) {
    return (path || []).filter((m) => m.role === "assistant" && m.opening !== "authored").length;
  }
  function includedAfter(preceding, limit) {
    const cutoff = replyLimit(limit);
    return cutoff === 0 || completedReplies(preceding) < cutoff;
  }
  function forGeneration(path, opts) {
    const o = opts || {}, preceding = precedingPath(path, o.mode || "new", o.targetId);
    const limit = replyLimit(o.limit), completed = completedReplies(preceding);
    const included = includedAfter(preceding, limit);
    return { included, preceding, limit, completed, reason: included ? "within-limit" : "limit-reached" };
  }
  PRP.scenario = { LIMITS, replyLimit, completedReplies, precedingPath, includedAfter, forGeneration };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.scenario;
})(typeof window !== "undefined" ? window : globalThis);
