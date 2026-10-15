/* Prism RP — жизненный цикл сценария карточки (чистый модуль).

   Сценарий (card.scenario) — исходные обстоятельства мира: где и с чего начинается история.
   Это не постоянная часть карточки и не сцена: в сцену он не переносится и не разбирается.

   Правило — граница первого ответа на реплику пользователя:
     сценарий подаётся в генерацию, пока она отвечает не дальше первой реплики пользователя
     в своей ветке. Формально: берётся ветка ДО генерируемого ответа («предшествующий путь»);
     если она кончается репликой пользователя, эта реплика — та, на которую отвечают, и она
     не считается; сценарий подаётся, если в остальной части нет ни одной реплики пользователя.

   Предшествующий путь по режимам генерации:
     opening  (модель начинает сцену)     → []
     new      (новый ответ; и предпросмотр) → вся активная ветка
     regen    (другой вариант ответа)      → ветка до перегенерируемого сообщения (без него)
     continue (дописать ответ)             → ветка до дописываемого сообщения (без него)

   Всё выводится из ветки при каждом вызове: никакого флага «сценарий израсходован» нет,
   поэтому переключение веток и вариантов само восстанавливает или убирает сценарий. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  // Ветка до генерируемого ответа. path — [{id, role, …}] от корня; targetId — для regen/continue.
  function precedingPath(path, mode, targetId) {
    const p = path || [];
    if (mode === "opening") return [];
    if (mode === "regen" || mode === "continue") {
      const i = p.findIndex((m) => m.id === targetId);
      return i >= 0 ? p.slice(0, i) : p.slice();
    }
    return p.slice(); // new и предпросмотр следующего хода
  }

  // Отвечает ли генерация после этой ветки не дальше первой реплики пользователя.
  function includedAfter(preceding) {
    const p = preceding || [];
    const answered = p.length && p[p.length - 1].role === "user" ? p.slice(0, -1) : p;
    return !answered.some((m) => m.role === "user");
  }

  /* Решение для одной генерации. → { included, preceding, reason }
     reason: "origin" — ещё до первой реплики пользователя или ответ на неё; "past-first-turn" — позже. */
  function forGeneration(path, opts) {
    const o = opts || {};
    const preceding = precedingPath(path, o.mode || "new", o.targetId);
    const included = includedAfter(preceding);
    return { included, preceding, reason: included ? "origin" : "past-first-turn" };
  }

  PRP.scenario = { precedingPath, includedAfter, forGeneration };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.scenario;
})(typeof window !== "undefined" ? window : globalThis);
