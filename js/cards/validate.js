/* Prism RP — проверка черновика карточки перед сохранением.
   Уровни: error — сохранить нельзя; warning — можно после проверки; info — сведения о переносе.
   Чистый модуль. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const CM = PRP.cardModel;

  const note = (level, code, message) => ({ level, code, message });

  function validate(d) {
    const out = [];
    if (!d) return [note("error", "no-draft", "Карточку не удалось разобрать.")];
    if (!String(d.name || "").trim()) out.push(note("error", "no-name", "У персонажа нет имени: поле имени в файле пустое или отсутствует."));
    if (!CM.hasContent(d)) out.push(note("error", "empty-card", "В карточке нет ни описания, ни личности, ни сценария, ни приветствия — сохранять нечего."));
    const dir = (which, label) => {
      const x = d.directives && d.directives[which];
      if (x && x.origin === "imported" && String(x.text || "").trim()) {
        out.push(note("warning", "directive-" + which, `${label} из файла сохранено, но выключено. Включите его, только если доверяете тексту.`));
      }
    };
    dir("system", "Указание автора (системное)");
    dir("postHistory", "Указание автора после истории");
    const lore = d.lore || [];
    if (lore.length) out.push(note("info", "lore", `Записей лорбука: ${lore.length}. Это справочные сведения персонажа, не указания.`));
    return out;
  }

  const hasErrors = (issues) => issues.some((x) => x.level === "error");

  PRP.cardValidate = { validate, hasErrors };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.cardValidate;
})(typeof window !== "undefined" ? window : globalThis);
