/* Prism RP — граница проверки мира (чистый модуль): паки мира и линзы персонажей.

   Уровни: error — сохранять нельзя; warning — можно, но человек должен это видеть.
   Ошибки (блокируют):
     • повтор id фактов пака; повтор id добавленных фактов линзы;
     • несколько переопределений одного targetFactId;
     • id добавленного факта линзы совпадает с id факта пака (иначе в мире было бы два факта с одним id);
     • линза ссылается на пак, которого нет (pack-missing; наличие пака проверяет сервис — здесь только вид ошибки);
     • битые обязательные объекты и id (нет id, не объект, не список);
     • вторая линза для того же персонажа (одна линза на карточку).
   Предупреждения:
     • переопределение ссылается на факт, которого в паке нет;
     • выключение ссылается на факт, которого в паке нет.
   Ссылки на несуществующие факты никогда не исправляются угадыванием (ни по тексту, ни по похожему id).
   Проверка не меняет входные данные. Без DOM, хранилища, сети и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (v == null ? "" : String(v));
  const issue = (level, code, message, ref) => Object.assign({ level, code, message }, ref != null ? { ref: String(ref) } : {});
  const hasErrors = (issues) => (issues || []).some((x) => x.level === "error");
  const META_LISTS = ["entities", "topics", "locations"];

  // Список фактов (пака или добавлений линзы): объекты, непустые и неповторяющиеся id.
  function checkFacts(list, label, dupCode, out) {
    const seen = new Set();
    list.forEach((f, i) => {
      const n = `${label} №${i + 1}`;
      if (!isObj(f)) { out.push(issue("error", "fact-malformed", `${n} не является объектом.`, i)); return; }
      const id = str(f.id).trim();
      if (!id) out.push(issue("error", "fact-no-id", `У факта (${n}) нет id.`, i));
      else if (seen.has(id)) out.push(issue("error", dupCode, `Повторяется id факта: ${id}.`, id));
      else seen.add(id);
      if (f.text != null && typeof f.text !== "string") out.push(issue("error", "fact-text", `Текст факта ${id || n} не строка.`, id || i));
      else if (!str(f.text).trim()) out.push(issue("warning", "fact-empty", `Факт ${id || n} без текста.`, id || i));
      for (const k of META_LISTS) if (f[k] != null && !Array.isArray(f[k])) out.push(issue("error", "fact-meta", `Поле ${k} факта ${id || n} должно быть списком.`, id || i));
      if (f.provenance != null && !isObj(f.provenance)) out.push(issue("error", "fact-provenance", `Источник факта ${id || n} должен быть объектом.`, id || i));
    });
    return seen;
  }

  function validatePack(p) {
    const out = [];
    if (!isObj(p)) return [issue("error", "not-object", "Пак мира должен быть объектом.")];
    if (!str(p.id).trim()) out.push(issue("error", "no-id", "У пака нет id."));
    if (!str(p.name).trim()) out.push(issue("error", "no-name", "У пака нет названия."));
    if (p.facts != null && !Array.isArray(p.facts)) { out.push(issue("error", "facts-not-array", "Поле facts должно быть списком.")); return out; }
    checkFacts(p.facts || [], "Факт", "fact-duplicate-id", out);
    return out;
  }

  /* Линза. pack — необязательно: с ним проверяются ссылки на факты (это предупреждения). */
  function validateLens(l, pack) {
    const out = [];
    if (!isObj(l)) return [issue("error", "not-object", "Линза должна быть объектом.")];
    if (!str(l.id).trim()) out.push(issue("error", "no-id", "У линзы нет id."));
    if (!str(l.cardId).trim()) out.push(issue("error", "no-card", "Линза не привязана к персонажу."));
    if (!str(l.packId).trim()) out.push(issue("error", "no-pack", "Линза не привязана к паку мира."));
    for (const k of ["disabledFactIds", "overrides", "additions", "focusEntities", "focusTopics", "relevanceHints"]) {
      if (l[k] != null && !Array.isArray(l[k])) out.push(issue("error", "not-array", `Поле ${k} должно быть списком.`, k));
    }
    const overrides = Array.isArray(l.overrides) ? l.overrides : [];
    const targets = new Set(), ovIds = new Set();
    overrides.forEach((o, i) => {
      if (!isObj(o)) { out.push(issue("error", "override-malformed", `Переопределение №${i + 1} не является объектом.`, i)); return; }
      const id = str(o.id).trim();
      if (!id) out.push(issue("error", "override-no-id", `У переопределения №${i + 1} нет id.`, i));
      else if (ovIds.has(id)) out.push(issue("error", "override-duplicate-id", `Повторяется id переопределения: ${id}.`, id));
      else ovIds.add(id);
      const t = str(o.targetFactId).trim();
      if (!t) out.push(issue("error", "override-no-target", `У переопределения №${i + 1} нет целевого факта.`, id || i));
      else if (targets.has(t)) out.push(issue("error", "override-duplicate-target", `Факт ${t} переопределён больше одного раза — неясно, какой вариант действует.`, t));
      else targets.add(t);
      for (const k of META_LISTS) if (o[k] != null && !Array.isArray(o[k])) out.push(issue("error", "override-meta", `Поле ${k} переопределения ${id || i + 1} должно быть списком.`, id || i));
    });
    const addIds = checkFacts(Array.isArray(l.additions) ? l.additions : [], "Добавленный факт", "addition-duplicate-id", out);
    if (isObj(pack)) {
      const ids = new Set((pack.facts || []).filter(isObj).map((f) => str(f.id)));
      if (str(l.packId) && str(pack.id) && str(l.packId) !== str(pack.id)) out.push(issue("error", "pack-mismatch", "Линза относится к другому паку."));
      for (const t of targets) if (!ids.has(t)) out.push(issue("warning", "override-target-missing", `Переопределяемого факта ${t} нет в паке; ссылка сохранена и не применяется.`, t));
      for (const d of Array.isArray(l.disabledFactIds) ? l.disabledFactIds : []) if (!ids.has(str(d))) out.push(issue("warning", "disabled-target-missing", `Выключаемого факта ${d} нет в паке; ссылка сохранена и не применяется.`, d));
      // id не переименовывается и не подбирается автоматически: пользователь должен сам пересоздать добавленный факт.
      for (const a of addIds) if (ids.has(a)) out.push(issue("error", "addition-id-collides", `id добавленного факта ${a} совпадает с фактом пака — у факта мира id должен быть единственным. Удалите этот факт персонажа и добавьте заново.`, a));
    }
    return out;
  }

  // Линза ссылается на несуществующий пак: блокирующая ошибка. Существование проверяет вызывающий (world/service),
  // этот модуль хранилище не читает.
  const packMissing = (packId) => issue("error", "pack-missing", `Пак мира ${packId || "(не указан)"} не найден: линзу можно привязать только к существующему паку.`, packId || "");

  /* Одна линза на персонажа: lens нельзя сохранить, если у того же cardId уже есть линза с другим id.
     existing — уже сохранённые линзы этого персонажа (или все). */
  function validateOneLensPerCard(lens, existing) {
    const other = (existing || []).find((x) => x && x.cardId === lens.cardId && x.id !== lens.id);
    return other ? [issue("error", "lens-exists", "У этого персонажа уже есть линза мира: измените её, а не создавайте вторую.", other.id)] : [];
  }

  PRP.worldValidate = { validatePack, validateLens, validateOneLensPerCard, packMissing, hasErrors };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldValidate;
})(typeof window !== "undefined" ? window : globalThis);
