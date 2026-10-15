/* Prism RP — карточки персонажей (прикладной уровень).
   Импорт файлов (JSON/PNG) → разбор формата (cards/ccard.js) → сохранение; сохранение
   черновика редактора; удаление с каскадом; экспорт JSON/PNG.
   Смысл форматов (V1/V2/V3, PNG-чанки) — только в ccard.js. Файловый ввод-вывод — PRP.files. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, CC = PRP.ccard;

  function create(ctx) {
    const { S, DB } = ctx;
    const F = () => ctx.files;

    // Черновик для редактора: копия карточки или новая пустая.
    function draft(cd) { return U.clone(cd || Object.assign(CC.normalize({ name: "" }), { id: null })); }

    /* Импорт файлов по одному; ошибка одного файла не мешает остальным.
       → { last: последняя добавленная карточка | null, errors: [{file, message}] } */
    async function importFiles(files) {
      let last = null;
      const errors = [];
      for (const file of files) {
        try {
          let json, avatar = null;
          if (/\.json$/i.test(file.name) || file.type === "application/json") json = JSON.parse(await F().readFile(file, "text"));
          else { json = CC.cardJsonFromPng(new Uint8Array(await F().readFile(file))); avatar = await F().readFile(file, "dataurl"); }
          const cd = CC.normalize(json);
          cd.id = U.uid("card");
          cd.avatar = avatar;
          await DB.put("cards", cd);
          S.cards.unshift(cd);
          last = cd;
        } catch (e) {
          errors.push({ file: file.name, message: e.message });
          if (ctx.ui) ctx.ui.toast(`${file.name}: ${e.message}`, true);
        }
      }
      return { last, errors };
    }

    // Сохранить черновик редактора. → { error } или { card, isNew }.
    async function save(d) {
      d.name = (d.name || "").trim();
      if (!d.name) return { error: "Дайте персонажу имя." };
      if (d.image && d.image.loras) d.image.loras = d.image.loras.filter((l) => l.name);
      d.altGreetings = (d.altGreetings || []).map((g) => String(g || "").trim()).filter(Boolean);
      d.updatedAt = Date.now();
      const isNew = !d.id;
      if (isNew) { d.id = U.uid("card"); d.createdAt = Date.now(); }
      await DB.put("cards", d);
      const i = S.cards.findIndex((x) => x.id === d.id);
      if (i >= 0) S.cards[i] = d; else S.cards.unshift(d);
      return { card: d, isNew };
    }

    // Удалить персонажа вместе со всеми его чатами, сообщениями, картинками и опытом.
    async function remove(cd) {
      for (const c of S.chats.filter((x) => x.cardId === cd.id)) {
        const ms = await DB.byIndex("messages", "chatId", c.id);
        await DB.delMany("messages", ms.map((m) => m.id));
        await DB.delMany("images", (await DB.byIndex("images", "chatId", c.id)).map((x) => x.id));
        await DB.del("chats", c.id);
      }
      const xs = await DB.byIndex("experience", "owner", cd.id);
      await DB.delMany("experience", xs.map((x) => x.id));
      await DB.del("cards", cd.id);
      S.cards = S.cards.filter((c) => c.id !== cd.id);
      S.chats = S.chats.filter((c) => c.cardId !== cd.id);
      if (S.cardId === cd.id) { S.cardId = null; S.chatId = null; S.messages = []; S.view = "home"; }
    }

    function exportJson(d) {
      return { name: `${d.name || "персонаж"}.json`, text: JSON.stringify(CC.toSpec(d, "v3"), null, 2) };
    }
    async function exportPng(d) {
      return { name: `${d.name || "персонаж"}.png`, blob: new Blob([CC.embedInPng(await F().avatarPngBytes(d), d)], { type: "image/png" }) };
    }

    return { draft, importFiles, save, remove, exportJson, exportPng };
  }

  PRP.cardService = { create };
})(typeof window !== "undefined" ? window : globalThis);
