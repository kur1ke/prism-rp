/* Prism RP — конвейер импорта карточки (чистый):
     байты/текст → JSON (или PNG-чанк chara/ccv3) → определение формата → адаптер
     → канонический черновик → проверка.
   Ничего не сохраняет: результат показывается на экране проверки, сохранение — только после подтверждения.
   Неизвестный или битый файл даёт ошибку, а не пустую карточку. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const CC = PRP.ccard, F = PRP.cardFormats, VAL = PRP.cardValidate;

  const err = (code, message) => ({ level: "error", code, message });

  /* → { ok, fileName, detection, draft | null, issues: [{level, code, message}] } */
  function fromObject(json, sourceType, fileName) {
    const detection = F.detect(json, sourceType);
    if (detection.format === "unknown") {
      return { ok: false, fileName, detection, draft: null, issues: [err("unknown-format", "Формат не распознан: " + detection.reason + ".")] };
    }
    let res;
    try { res = F.adapt(json, detection); }
    catch (e) { return { ok: false, fileName, detection, draft: null, issues: [err("malformed", "Карточку не удалось разобрать: " + (e.message || e) + ".")] }; }
    const issues = res.notes.concat(VAL.validate(res.draft));
    // Ошибки — первыми, затем предупреждения, затем сведения.
    const rank = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => rank[a.level] - rank[b.level]);
    return { ok: !VAL.hasErrors(issues), fileName, detection, draft: res.draft, issues };
  }

  function fromJsonText(text, fileName) {
    let json;
    try { json = JSON.parse(text); }
    catch (e) { return { ok: false, fileName, detection: { format: "unknown", version: "", confidence: "none", sourceType: "json", reason: "не JSON" }, draft: null, issues: [err("invalid-json", "Файл не является корректным JSON: " + e.message)] }; }
    return fromObject(json, "json", fileName);
  }

  function fromPngBytes(u8, fileName) {
    const det0 = { format: "unknown", version: "", confidence: "none", sourceType: "png", reason: "" };
    let json;
    try { json = CC.cardJsonFromPng(u8); }
    catch (e) { return { ok: false, fileName, detection: Object.assign(det0, { reason: e.message }), draft: null, issues: [err("png", e.message)] }; }
    return fromObject(json, "png", fileName);
  }

  PRP.cardImport = { fromObject, fromJsonText, fromPngBytes };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.cardImport;
})(typeof window !== "undefined" ? window : globalThis);
