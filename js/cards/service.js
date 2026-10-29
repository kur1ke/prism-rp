/* Prism RP — карточки персонажей (прикладной уровень).
   Импорт в два шага: prepareImport читает файлы и прогоняет их через конвейер cards/import.js
   (формат → адаптер → канонический черновик → проверка) и НИЧЕГО не сохраняет; commitImport
   сохраняет только подтверждённые на экране проверки черновики. Импортированные указания автора
   включаются лишь по явному выбору пользователя.
   Также: сохранение черновика редактора, удаление с каскадом, экспорт JSON/PNG.
   Смысл форматов — в cards/formats/*, модель — в cards/model.js. Файловый ввод-вывод — PRP.files. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, CC = PRP.ccard, CM = PRP.cardModel, IMP = PRP.cardImport;

  function create(ctx) {
    const { S, DB } = ctx;
    const F = () => ctx.files;

    // Черновик для редактора: копия карточки или новая пустая.
    function draft(cd) { return U.clone(cd ? CM.upgradeStored(cd) : CM.blank()); }

    /* Шаг 1 импорта: файлы → результаты проверки, без сохранения.
       → [{ ok, fileName, detection, draft | null, issues, avatar }] */
    async function prepareImport(files) {
      const out = [];
      for (const file of files) {
        let r;
        try {
          const isJson = /\.json$/i.test(file.name) || file.type === "application/json";
          if (isJson) r = IMP.fromJsonText(await F().readFile(file, "text"), file.name);
          else {
            r = IMP.fromPngBytes(new Uint8Array(await F().readFile(file)), file.name);
            if (r.ok) r.avatar = await F().readFile(file, "dataurl");
          }
        } catch (e) {
          r = { ok: false, fileName: file.name, detection: { format: "unknown", version: "", sourceType: "", reason: "" }, draft: null, issues: [{ level: "error", code: "read", message: "Файл не удалось прочитать: " + (e.message || e) }] };
        }
        out.push(r);
      }
      return out;
    }

    /* Шаг 2 импорта: сохранить подтверждённые черновики.
       choices[i] = { system: bool, postHistory: bool } — явное включение импортированных указаний
       (по умолчанию выключены). Файлы с ошибками не сохраняются никогда. → [сохранённые карточки] */
    async function commitImport(items, choices) {
      const saved = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || !it.ok || !it.draft) continue;
        const cd = U.clone(it.draft);
        const ch = (choices && choices[i]) || {};
        for (const k of ["system", "postHistory"]) {
          const dv = cd.directives[k];
          if (dv.origin === "imported" && ch[k] === true && dv.text.trim()) { dv.enabled = true; dv.reviewed = true; }
        }
        cd.id = U.uid("card");
        cd.avatar = it.avatar || null;
        cd.createdAt = cd.updatedAt = Date.now();
        await DB.put("cards", cd);
        S.cards.unshift(cd);
        saved.push(cd);
      }
      return saved;
    }

    // Сохранить черновик редактора. → { error } или { card, isNew }.
    async function save(d) {
      d.name = (d.name || "").trim();
      if (!d.name) return { error: "Дайте персонажу имя." };
      if (d.image && d.image.loras) d.image.loras = d.image.loras.filter((l) => l.name);
      d.customFields = CM.normalizeCustomFields(d.customFields);
      d.altGreetings = (d.altGreetings || []).map((g) => String(g || "").trim()).filter(Boolean);
      d.updatedAt = Date.now();
      const isNew = !d.id;
      if (isNew) { d.id = U.uid("card"); d.createdAt = Date.now(); }
      await DB.put("cards", d);
      const i = S.cards.findIndex((x) => x.id === d.id);
      if (i >= 0) S.cards[i] = d; else S.cards.unshift(d);
      return { card: d, isNew };
    }

    // Удалить персонажа вместе со всеми его чатами (с их сообщениями, картинками и наложением мира) и опытом.
    async function remove(cd) {
      if (S.gen || S.turn) throw new Error("Нельзя удалять персонажа во время незавершённого хода.");
      const ownedChats = S.chats.filter((x) => x.cardId === cd.id);
      if (ctx.svc.memory) ownedChats.forEach(c => ctx.svc.memory.retireChat(c.id));
      const deletes = [["cards", cd.id]];
      for (const c of ownedChats) {
        for (const [store, index, value] of [
          ["messages", "chatId", c.id], ["images", "chatId", c.id],
          ["memories", "chatId", c.id], ["reflections", "chatId", c.id],
          ["memorySources", "chatId", c.id]
        ]) {
          const rows = await DB.byIndex(store, index, value);
          rows.forEach(row => deletes.push([store, row.id]));
        }
        deletes.push(["chats", c.id], ["worldOverlays", c.id],
          ["messengerEnvironments", c.id]);
      }
      const experiences = await DB.byIndex("experience", "owner", cd.id);
      experiences.forEach(x => deletes.push(["experience", x.id]));
      const lenses = await DB.byIndex("worldLenses", "cardId", cd.id);
      lenses.forEach(x => deletes.push(["worldLenses", x.id]));
      // A failed request aborts the complete cascade, including the Card row.
      await DB.mutateBatch({ deletes });
      S.worldLenses = (S.worldLenses || []).filter(l => l.cardId !== cd.id);
      S.cards = S.cards.filter(c => c.id !== cd.id);
      S.chats = S.chats.filter(c => c.cardId !== cd.id);
      if (S.cardId === cd.id) {
        S.cardId = null; S.chatId = null; S.messages = [];
        S.worldOverlay = null; S.messengerEnv = null; S.view = "home";
      }
    }

    function exportJson(d) {
      return { name: `${d.name || "персонаж"}.json`, text: JSON.stringify(CC.toSpec(d, "v3"), null, 2) };
    }
    async function exportPng(d) {
      return { name: `${d.name || "персонаж"}.png`, blob: new Blob([CC.embedInPng(await F().avatarPngBytes(d), d)], { type: "image/png" }) };
    }

    return { draft, prepareImport, commitImport, save, remove, exportJson, exportPng };
  }

  PRP.cardService = { create };
})(typeof window !== "undefined" ? window : globalThis);
