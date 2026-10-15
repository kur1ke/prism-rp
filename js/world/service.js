/* Prism RP — сервис мира (прикладной уровень): общие паки мира и линзы персонажей.
   Загрузка, сохранение с проверкой, правила удаления, импорт и экспорт паков, превью «Мир персонажа».
   Смысл — в чистых модулях world/model, world/lens, world/resolve; хранилище — через ctx.DB.
   Мир в контекст модели здесь НЕ подаётся (это FOUNDATION-W2). DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const WM = PRP.worldModel, WL = PRP.worldLens, WR = PRP.worldResolve;

  const PACKS = "worldPacks", LENSES = "worldLenses";
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function create(ctx) {
    const { S, DB } = ctx;
    const upsert = (list, x) => { const i = list.findIndex((y) => y.id === x.id); if (i >= 0) list[i] = x; else list.push(x); };

    async function loadAll() {
      S.worldPacks = (await DB.all(PACKS)).map(WM.normalize).sort((a, b) => a.name.localeCompare(b.name));
      S.worldLenses = (await DB.all(LENSES)).map(WL.normalize);
    }
    const packById = (id) => (S.worldPacks || []).find((p) => p.id === id) || null;
    const lensForCard = (cardId) => (S.worldLenses || []).find((l) => l.cardId === cardId) || null;
    const lensesForPack = (packId) => (S.worldLenses || []).filter((l) => l.packId === packId);

    /* Паки. → { pack } или { error, issues } */
    function newPack(name) { return WM.blank(name || "Новый мир"); }
    async function savePack(draft) {
      const issues = WM.validatePack(draft);
      if (WM.hasErrors(issues)) return { error: issues.filter((x) => x.level === "error").map((x) => x.message).join(" "), issues };
      const p = WM.normalize(draft);
      p.updatedAt = Date.now();
      await DB.put(PACKS, p);
      upsert((S.worldPacks = S.worldPacks || []), p);
      return { pack: p, issues };
    }
    /* Удаление пака запрещено, пока на него ссылаются линзы: иначе они осиротели бы молча.
       → { ok } или { blocked: [имена персонажей] } */
    async function deletePack(id) {
      const refs = (await DB.byIndex(LENSES, "packId", id)) || [];
      if (refs.length) {
        const names = refs.map((l) => (S.cards.find((c) => c.id === l.cardId) || { name: "(персонаж удалён)" }).name);
        return { blocked: names };
      }
      await DB.del(PACKS, id);
      S.worldPacks = (S.worldPacks || []).filter((p) => p.id !== id);
      return { ok: true };
    }
    function exportPack(id) {
      const p = packById(id);
      if (!p) return null;
      return { name: `${p.name || "мир"}.world.json`, text: JSON.stringify(WM.exportPack(p), null, 2) };
    }
    // Импорт: проверка до сохранения; битый или чужой файл — ошибка, ничего не сохраняется.
    async function importPack(text) {
      const r = WM.importPackText(text);
      if (!r.ok) return { error: r.issues.map((x) => x.message).join(" "), issues: r.issues };
      return savePack(r.pack);
    }

    /* Линзы. Одна линза на персонажа; линза хранит только отличия от пака. */
    async function saveLens(draft) {
      const l = WL.normalize(draft);
      if (!l.id) l.id = WL.blank(l.cardId, l.packId).id;
      const issues = WL.validateLens(l, packById(l.packId));
      if (issues.some((x) => x.level === "error")) return { error: issues.filter((x) => x.level === "error").map((x) => x.message).join(" "), issues };
      // Одна линза на персонажа: вторая отклоняется (то же ограничение держит уникальный индекс cardId в базе).
      const other = (await DB.byIndex(LENSES, "cardId", l.cardId)).find((x) => x.id !== l.id);
      if (other) return { error: "У этого персонажа уже есть линза мира: измените её, а не создавайте вторую.", issues: [{ level: "error", code: "lens-exists", message: "Линза для персонажа уже есть.", ref: other.id }] };
      l.updatedAt = Date.now();
      await DB.put(LENSES, l);
      upsert((S.worldLenses = S.worldLenses || []), l);
      return { lens: l, issues };
    }
    async function deleteLens(id) {
      await DB.del(LENSES, id);
      S.worldLenses = (S.worldLenses || []).filter((l) => l.id !== id);
    }
    // Сохранение раздела «Мир» редактора персонажа: черновик линзы или null — снять связь с миром.
    async function saveLensForCard(cardId, draft) {
      const cur = lensForCard(cardId);
      if (!draft || !draft.packId) { if (cur) await deleteLens(cur.id); return { lens: null }; }
      // Редактор правит единственную линзу персонажа: если в этой правке связь снимали и ставили заново,
      // черновик получил новый id — запись остаётся той же (id существующей линзы), второй не появляется.
      return saveLens(Object.assign({}, draft, { cardId }, cur ? { id: cur.id, createdAt: cur.createdAt } : {}));
    }
    // Персонаж удалён — его линза тоже (она только его). Пак остаётся.
    async function removeForCard(cardId) {
      const ls = (await DB.byIndex(LENSES, "cardId", cardId)) || [];
      await DB.delMany(LENSES, ls.map((l) => l.id));
      S.worldLenses = (S.worldLenses || []).filter((l) => l.cardId !== cardId);
    }

    /* Превью «Мир персонажа» для редактора: только просмотр. → { pack, lensIssues, ...resolve() } | null */
    function preview(lensDraft) {
      if (!lensDraft || !lensDraft.packId) return null;
      const pack = packById(lensDraft.packId);
      if (!pack) return { pack: null, missingPack: lensDraft.packId, facts: [], excluded: [], report: { warnings: [{ level: "warning", code: "pack-missing", message: "Пак мира не найден." }] } };
      const lens = WL.normalize(lensDraft);
      return Object.assign({ pack, lensIssues: WL.validateLens(Object.assign({}, lens, { id: lens.id || "draft", cardId: lens.cardId || "draft" }), pack) }, WR.resolve(pack, lens));
    }
    // Пустые заготовки для форм (идентификаторы выдаёт модель).
    const newFact = (prefix) => WM.fact({}, prefix || "wf");
    const newOverride = (targetFactId, text) => WL.override({ targetFactId, text });
    const newLens = (cardId, packId) => WL.blank(cardId, packId);
    function draftLens(cardId) {
      const cur = lensForCard(cardId);
      return cur ? clone(cur) : null;
    }

    return { loadAll, packById, lensForCard, lensesForPack, newPack, savePack, deletePack, exportPack, importPack,
      saveLens, deleteLens, saveLensForCard, removeForCard, preview, draftLens, newFact, newOverride, newLens };
  }

  PRP.worldService = { create };
})(typeof window !== "undefined" ? window : globalThis);
