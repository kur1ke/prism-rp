/* Prism RP — контроллер мира: библиотека паков мира и раздел «Мир» (линза) в редакторе персонажа.
   Обработчики тонкие: форма → черновик → сервис world → перерисовка. Правила — в world/*. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const split = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* Поля раздела «Мир» редактора персонажа → черновик линзы (modal.lens). Только перенос значений формы. */
  function collectLens(modal, $$) {
    const l = modal && modal.lens;
    if (!l || !$$("[data-lens],[data-lens-disable],[data-lens-ovr],[data-lens-add]").length) return l;
    $$("[data-lens]").forEach((el) => {
      const k = el.dataset.lens;
      l[k] = k === "timelineVariant" ? el.value.trim() : split(el.value);
    });
    const boxes = $$("[data-lens-disable]");
    if (boxes.length) {
      const shown = new Set(boxes.map((el) => el.dataset.lensDisable));
      // Ссылки на факты, которых в паке нет, сохраняются как есть (их показывают отдельно).
      l.disabledFactIds = (l.disabledFactIds || []).filter((id) => !shown.has(id)).concat(boxes.filter((el) => el.checked).map((el) => el.dataset.lensDisable));
    }
    $$("[data-lens-ovr]").forEach((el) => { const o = l.overrides[+el.dataset.lensOvr]; if (o) o.text = el.value; });
    $$("[data-lens-add]").forEach((el) => {
      const f = l.additions[+el.dataset.lensAdd];
      if (!f) return;
      f[el.dataset.k] = el.dataset.k === "text" ? el.value : split(el.value);
    });
    return l;
  }
  PRP.lensForm = { collect: collectLens };

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.world = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $, $$ } = ui;
    const W = () => svc.world;

    // Поля библиотеки → черновик пака (S.worldDraft).
    function collectPack() {
      const d = S.worldDraft;
      if (!d) return d;
      $$("[data-wp]").forEach((el) => { d[el.dataset.wp] = el.value; });
      $$("[data-wf]").forEach((el) => {
        const f = d.facts[+el.dataset.wf];
        if (!f) return;
        const k = el.dataset.k;
        if (k === "enabled") f.enabled = el.checked;
        else if (k === "text" || k === "timeline" || k === "variant") f[k] = el.value;
        else f[k] = split(el.value);
      });
      return d;
    }
    const lensModal = () => S.modal && S.modal.kind === "card" ? S.modal : null;
    const rerenderModal = () => { S.modal.keepScroll = true; ui.renderModal(); };

    const actions = {
      world: () => nav.openWorld(),
      "world-new": () => { S.worldDraft = W().newPack(); ui.renderStage(); setTimeout(() => { const n = $("#wp-name"); if (n) n.select(); }, 30); },
      "world-open": (t) => { const p = W().packById(t.dataset.id); S.worldDraft = p ? clone(p) : null; ui.renderStage(); },
      "world-fact-add": () => { const d = collectPack(); d.facts.push(W().newFact()); ui.renderStage(); },
      "world-fact-del": (t) => { const d = collectPack(); d.facts.splice(+t.dataset.i, 1); ui.renderStage(); },
      "world-save": async () => {
        const r = await W().savePack(collectPack());
        if (r.error) return ui.toast(r.error, true);
        S.worldDraft = clone(r.pack);
        ui.renderStage();
        ui.toast("Мир сохранён.");
      },
      "world-export": () => {
        const d = S.worldDraft;
        const e = d && W().exportPack(d.id);
        if (!e) return ui.toast("Сначала сохраните мир.", true);
        ctx.files.download(e.name, e.text, "application/json");
      },
      "world-delete": async () => {
        const d = S.worldDraft;
        if (!d) return;
        if (!W().packById(d.id)) { S.worldDraft = null; return ui.renderStage(); }
        if (!confirm(`Удалить мир «${d.name}»? Это нельзя отменить.`)) return;
        const r = await W().deletePack(d.id);
        if (r.blocked) return ui.toast(`Мир используют персонажи: ${r.blocked.join(", ")}. Сначала снимите связь с миром в их карточках (раздел «Мир»).`, true);
        S.worldDraft = null;
        ui.renderStage();
        ui.toast("Мир удалён.");
      },
      "world-import": () => $("#file-world").click(),

      // Линза в редакторе персонажа.
      "lens-override-add": (t) => {
        const m = lensModal(); if (!m) return;
        collectLens(m, $$);
        const f = (W().packById(m.lens.packId) || { facts: [] }).facts.find((x) => x.id === t.dataset.fid);
        m.lens.overrides.push(W().newOverride(t.dataset.fid, f ? f.text : ""));
        rerenderModal();
      },
      "lens-override-del": (t) => { const m = lensModal(); if (!m) return; collectLens(m, $$); m.lens.overrides.splice(+t.dataset.i, 1); rerenderModal(); },
      "lens-disabled-del": (t) => { const m = lensModal(); if (!m) return; collectLens(m, $$); m.lens.disabledFactIds = m.lens.disabledFactIds.filter((id) => id !== t.dataset.fid); rerenderModal(); },
      "lens-add": () => { const m = lensModal(); if (!m) return; collectLens(m, $$); m.lens.additions.push(W().newFact("wa")); rerenderModal(); },
      "lens-add-del": (t) => { const m = lensModal(); if (!m) return; collectLens(m, $$); m.lens.additions.splice(+t.dataset.i, 1); rerenderModal(); },
      "lens-clear": () => {
        const m = lensModal(); if (!m) return;
        if (m.lens && (m.lens.overrides.length || m.lens.additions.length || m.lens.disabledFactIds.length) && !confirm("Снять связь с миром? Замены, выключения и факты этого персонажа будут удалены при сохранении карточки.")) return;
        m.lens = null;
        rerenderModal();
      },
    };

    async function change(t) {
      if (t.id === "file-world" && t.files[0]) {
        const file = t.files[0];
        t.value = "";
        const r = await W().importPack(await ctx.files.readFile(file, "text"));
        if (r.error) { ui.toast(`${file.name}: ${r.error}`, true); return true; }
        S.worldDraft = clone(r.pack);
        nav.openWorld(true);
        ui.toast(`Мир «${r.pack.name}» импортирован.`);
        return true;
      }
      const m = lensModal();
      if (m && t.matches && t.matches("[data-lens-pack]")) {
        collectLens(m, $$);
        const packId = t.value;
        if (!packId) m.lens = null;
        else if (!m.lens) m.lens = W().newLens(m.draft.id, packId);
        else if (m.lens.packId !== packId) {
          const tied = m.lens.overrides.length || m.lens.disabledFactIds.length;
          if (tied && !confirm("Замены и выключения относятся к фактам прежнего мира и будут сброшены. Факты самого персонажа останутся. Продолжить?")) { t.value = m.lens.packId; return true; }
          m.lens = Object.assign(W().newLens(m.draft.id, packId), { id: m.lens.id, additions: m.lens.additions, focusEntities: m.lens.focusEntities, focusTopics: m.lens.focusTopics, relevanceHints: m.lens.relevanceHints, timelineVariant: m.lens.timelineVariant, createdAt: m.lens.createdAt });
        }
        rerenderModal();
        return true;
      }
      if (m && t.matches && t.matches("[data-lens-disable]")) { collectLens(m, $$); rerenderModal(); return true; }
      return false;
    }

    return { actions, change };
  };
})(typeof window !== "undefined" ? window : globalThis);
