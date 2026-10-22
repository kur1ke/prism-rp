/* Prism RP — PERF-01: журнал длительностей этапов хода (только в памяти, только числа).
   Метрики: userStateMs, roleplayMs, assistantStateMs, imagePrepareMs, readyAfterReplyMs,
   sendToRoleplayMs, stateWaitTimeout, postReplyError. Никаких текстов сообщений, ключей,
   данных карточки и памяти: запись — имя метрики, число, id сообщения/чата и короткий исход.
   Не сохраняется в IndexedDB и не попадает в бэкап. Показ — Debug → «Тайминги» (режим разработчика). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const MAX = 80;
  const clean = (v, n) => (v == null ? "" : String(v).replace(/[^\w:.\-а-яё ]/gi, "").slice(0, n));

  // list — массив, в который пишутся записи (S.perf); возвращается функция записи.
  function create(list, opts) {
    const activeChatId = opts && opts.activeChatId;
    return function record(metric, ms, meta) {
      const m = meta || {};
      // Delayed observer/image callbacks from another chat must not pollute
      // the active chat's diagnostic medians after a navigation reset.
      if (typeof activeChatId === "function" && (!m.chatId || m.chatId !== activeChatId())) return;
      list.push({ metric: clean(metric, 40), ms: Math.max(0, Math.round(Number(ms) || 0)), at: Date.now(),
        msgId: clean(m.msgId, 40), chatId: clean(m.chatId, 40), outcome: clean(m.outcome, 40) });
      while (list.length > MAX) list.shift();
    };
  }

  // Clear in place: all existing logger/view references retain the same list.\n  function reset(list) { list.length = 0; }\n\n  // Сводка: по каждой метрике — число замеров, последнее и медиана.
  function summary(list) {
    const by = {};
    for (const r of list || []) (by[r.metric] = by[r.metric] || []).push(r.ms);
    return Object.keys(by).map((metric) => {
      const a = by[metric], s = a.slice().sort((x, y) => x - y);
      return { metric, count: a.length, last: a[a.length - 1], median: s[Math.floor(s.length / 2)] };
    });
  }

  PRP.perfLog = { create, reset, summary, MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.perfLog;
})(typeof window !== "undefined" ? window : globalThis);
