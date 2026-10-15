/* Prism RP — контроллер карточек: импорт, редактор персонажа (форма → черновик), сохранение, экспорт, удаление. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.cards = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $, $$ } = ui;

    function openCardEditor(cd) {
      S.modal = { kind: "card", section: "main", draft: svc.cards.draft(cd), lens: cd && cd.id ? svc.world.draftLens(cd.id) : null };
      ui.renderModal();
      setTimeout(() => { const n = $("#cf-name"); if (n && !S.modal.draft.name) n.focus(); }, 30);
    }
    // Поля открытого раздела редактора → черновик (S.modal.draft).
    function collectCard() {
      const d = S.modal.draft;
      const map = { "cf-name": "name", "cf-desc": "description", "cf-pers": "personality", "cf-scen": "scenario", "cf-first": "firstMes", "cf-ex": "mesExample", "cf-app": "appearance", "cf-bg": "background", "cf-creator": "creator", "cf-version": "version", "cf-notes": "creatorNotes" };
      $$("[data-cf]").forEach((el) => {
        const id = el.dataset.cf;
        if (map[id]) d[map[id]] = el.value;
        else if (id === "cf-tags") d.tags = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      });
      // Указания автора: текст и явный флаг «включено». Флаг меняет только сам пользователь.
      $$("[data-cf-dir]").forEach((el) => {
        const k = el.dataset.cfDir, x = d.directives[k];
        if (el.type === "checkbox") { x.enabled = el.checked; if (el.checked) x.reviewed = true; }
        else x.text = el.value;
      });
      if ($("[data-alt]") || S.modal.section === "greet") {
        d.altGreetings = (d.altGreetings || []).slice();
        $$("[data-alt]").forEach((el) => { d.altGreetings[+el.dataset.alt] = el.value; });
      }
      if ($("[data-ci]") || $("[data-card-lora-name]")) {
        d.image = Object.assign({}, d.image);
        $$("[data-ci]").forEach((el) => { d.image[el.dataset.ci] = el.value; });
        d.image.loras = $$("[data-card-lora-name]").map((el) => {
          const w = $(`[data-card-lora-w="${el.dataset.cardLoraName}"]`);
          return { name: el.value.trim(), weight: w && w.value !== "" ? Number(w.value) : 1 };
        });
      }
      $$("[data-lore]").forEach((el) => {
        const e = d.lore[+el.dataset.lore];
        if (!e) return;
        const k = el.dataset.k;
        if (k === "keys" || k === "secondary_keys") e[k] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
        else if (k === "content" || k === "comment" || k === "position") e[k] = el.value;
        else if (k === "insertion_order") e[k] = el.value === "" ? 0 : Number(el.value) || 0;
        else e[k] = el.checked;
      });
      PRP.lensForm.collect(S.modal, $$);
      return d;
    }
    const keepScroll = () => { S.modal.keepScroll = true; ui.renderModal(); };

    const actions = {
      import: () => $("#file-card").click(),
      // Проверка импорта: флажки указаний читаются из формы, сохраняются только распознанные файлы.
      "import-confirm": async () => {
        const m = S.modal;
        if (!m || m.kind !== "import") return;
        const choices = m.items.map(() => ({}));
        $$("[data-imp-dir]").forEach((el) => { choices[+el.dataset.impDir][el.dataset.k] = el.checked; });
        const saved = await svc.cards.commitImport(m.items, choices);
        S.modal = null;
        S.view = "home";
        ui.renderAll();
        if (saved.length) ui.toast(saved.length === 1 ? `Добавлен(а): ${saved[0].name}` : `Добавлено персонажей: ${saved.length}`);
      },
      "import-cancel": () => { S.modal = null; ui.renderModal(); },
      "new-card": () => openCardEditor(null),
      "open-card": (t) => nav.openCard(t.dataset.id),
      "edit-card": (t) => { ui.closePop(); const id = t.dataset.id; openCardEditor(id ? S.cards.find((x) => x.id === id) : ctx.card()); },
      "card-section": (t) => { collectCard(); S.modal.section = t.dataset.section; ui.renderModal(); },
      "card-save": async () => {
        const r = await svc.cards.save(collectCard());
        if (r.error) { ui.toast(r.error, true); S.modal.section = "main"; ui.renderModal(); return; }
        // Линза мира — отдельная запись, привязанная к персонажу; пак при этом не меняется.
        if (!r.isNew) {
          const lr = await svc.world.saveLensForCard(r.card.id, S.modal.lens);
          if (lr.error) { ui.toast("Мир персонажа не сохранён: " + lr.error, true); S.modal.section = "world"; ui.renderModal(); return; }
        }
        S.modal = null;
        ui.renderAll();
        ui.toast(r.isNew ? `${r.card.name} создан(а). Нажмите на портрет, чтобы начать.` : "Изменения сохранены.");
      },
      "avatar-pick": () => { collectCard(); $("#file-avatar").click(); },
      "lore-add": () => { const d = collectCard(); d.lore = (d.lore || []).concat([{ keys: [], secondary_keys: [], selective: false, content: "", comment: "", enabled: true, constant: false, case_sensitive: false, position: "after_char", insertion_order: (d.lore || []).length * 10 }]); keepScroll(); },
      "lore-del": (t) => { const d = collectCard(); d.lore.splice(+t.dataset.i, 1); keepScroll(); },
      "alt-add": () => { const d = collectCard(); d.altGreetings = (d.altGreetings || []).concat([""]); keepScroll(); setTimeout(() => { const el = $(`[data-alt="${d.altGreetings.length - 1}"]`); if (el) el.focus(); }, 30); },
      "alt-del": (t) => { const d = collectCard(); d.altGreetings.splice(+t.dataset.i, 1); keepScroll(); },
      "card-lora-add": () => { const d = collectCard(); d.image = d.image || {}; d.image.loras = (d.image.loras || []).concat([{ name: "", weight: 0.8 }]); keepScroll(); },
      "card-lora-del": (t) => { const d = collectCard(); d.image.loras.splice(+t.dataset.i, 1); keepScroll(); },
      "card-json": () => { const e = svc.cards.exportJson(collectCard()); ctx.files.download(e.name, e.text, "application/json"); },
      "card-png": async () => { const e = await svc.cards.exportPng(collectCard()); ctx.files.download(e.name, e.blob); },
      "card-del": async () => {
        const cd = S.modal.draft;
        if (!confirm(`Удалить «${cd.name}» вместе со всеми чатами и опытом? Это нельзя отменить.`)) return;
        await svc.cards.remove(cd);
        S.modal = null;
        ui.renderAll();
        ui.toast(`${cd.name} удалён(а).`);
      },
    };

    async function change(t) {
      if (t.id === "file-card") {
        const files = [...t.files];
        t.value = "";
        if (!files.length) return true;
        const items = await svc.cards.prepareImport(files);
        S.modal = { kind: "import", items, choices: items.map(() => ({ system: false, postHistory: false })) };
        ui.renderModal();
        return true;
      }
      if (t.id === "file-avatar" && t.files[0]) { S.modal.draft.avatar = await ctx.files.readFile(t.files[0], "dataurl"); t.value = ""; ui.renderModal(); return true; }
      if (t.dataset.lore !== undefined && t.dataset.k === "selective" && S.modal && S.modal.kind === "card") { collectCard(); keepScroll(); return true; }
      return false;
    }

    return { actions, change };
  };
})(typeof window !== "undefined" ? window : globalThis);
