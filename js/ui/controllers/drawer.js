/* Prism RP — контроллер выдвижной панели: сцена (ручные правки), опыт (форма записи), Prism (предпросмотр). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const SC = PRP.scene, U = PRP.util;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.drawer = function (ctx) {
    const { S, ui, svc } = ctx;
    const { $ } = ui;
    const op = (...a) => svc.chat.op(...a);

    // Ручные изменения сцены → в ветку; затем Prism, панель и шапка.
    async function applySceneOps(ops) {
      if (!(await svc.chat.applySceneOps(ops))) return;
      svc.prism.refresh();
      ui.renderDrawer();
      ui.renderHead();
    }

    // Форма записи опыта → черновик (S.expDraft).
    function collectExp() {
      const d = S.expDraft;
      if (!d || !$("#x-event")) return d;
      d.event = $("#x-event").value;
      d.interpretation = $("#x-interp").value;
      d.consequences = $("#x-cons").value;
      d.status = $("#x-status").value;
      const aboutUser = $("#x-about-user").checked;
      d.about = (d.about || []).filter((a) => a !== "user");
      if (aboutUser) d.about.unshift("user");
      return d;
    }

    const actions = {
      drawer: () => { S.drawerOpen = !S.drawerOpen; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      "drawer-close": () => { S.drawerOpen = false; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      tab: (t) => { collectExp(); S.tab = t.dataset.tab; if (S.tab === "prism") svc.prism.refresh(); ui.renderDrawer(); },
      "open-prism": () => { S.tab = "prism"; S.drawerOpen = true; svc.prism.refresh(); ui.renderDrawer(); ui.renderFeed(); },
      "prism-preview": () => { svc.prism.refresh(); ui.renderDrawer(); ui.renderFeed(); },
      // Сцена
      "sc-time-set": () => {
        const d = $("#sc-date").value.trim(), tm = $("#sc-time").value.trim();
        if (d && !/^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(d)) { ui.toast("Дата в виде 14.05 или 14.05.2026", true); return; }
        const v = [d, tm].filter(Boolean).join(" ");
        if (v) applySceneOps([op(null, "time", v)]);
      },
      "sc-shift": (t) => applySceneOps([op(null, "time", t.dataset.v)]),
      "sc-leave": (t) => applySceneOps([op(null, "leave", t.dataset.name)]),
      "sc-enter": (t) => applySceneOps([op(null, "enter", t.dataset.name)]),
      "sc-remove": (t) => applySceneOps([op(t.dataset.name, "remove", t.dataset.item)]),
      "scene-init-save": async () => { const c = ctx.chat(); c.sceneInit = $("#scene-init").value.trim(); await svc.chat.putChat(c); svc.prism.refresh(); ui.renderDrawer(); ui.renderFeed(); ui.toast("Начальная сцена сохранена."); },
      // Опыт
      "to-exp": (t) => {
        S.expDraft = svc.exp.draftFromMessage(t.dataset.id);
        S.tab = "memory";
        S.drawerOpen = true;
        ui.renderDrawer();
        ui.renderFeed();
        setTimeout(() => { const e = $("#x-event"); if (e) e.focus(); }, 280);
      },
      "exp-new": () => { S.expDraft = svc.exp.blankDraft(); ui.renderDrawer(); },
      "exp-edit": (t) => { S.expDraft = U.clone(svc.exp.find(t.dataset.id)); ui.renderDrawer(); },
      "exp-cancel": () => { S.expDraft = null; ui.renderDrawer(); },
      "exp-save": async () => {
        const err = await svc.exp.save(collectExp());
        if (err) { ui.toast(err, true); return; }
        S.expDraft = null;
        svc.prism.refresh();
        ui.renderDrawer();
        ui.toast("Событие сохранено в опыт.");
      },
      "exp-del": async () => {
        if (!confirm("Удалить это событие из опыта?")) return;
        await svc.exp.remove(S.expDraft.id);
        S.expDraft = null; svc.prism.refresh(); ui.renderDrawer();
      },
      "exp-assign": async (t) => {
        if (!svc.exp.find(t.dataset.id) || !confirm("Привязать эту запись к текущему чату? Она станет частью этого мира и будет видна во всех его ветках.")) return;
        await svc.exp.assign(t.dataset.id);
        svc.prism.refresh(); ui.renderDrawer();
        ui.toast("Запись привязана к этому чату.");
      },
      "x-val": (t) => { collectExp().valence = +t.dataset.v; ui.renderDrawer(); },
      "x-weight": (t) => { collectExp().weight = +t.dataset.v; ui.renderDrawer(); },
      "x-domain-del": (t) => { const d = collectExp(); d.domains = d.domains.filter((x) => x !== t.dataset.v); ui.renderDrawer(); },
    };

    function change(t) {
      if (t.dataset.scTop) { applySceneOps([op(null, t.dataset.scTop, t.value.trim() || "-")]); return true; }
      if (t.dataset.scField) { applySceneOps([op(t.dataset.name, t.dataset.scField, t.value.trim() || "-")]); return true; }
      if (t.dataset.scRel) { applySceneOps([op(t.dataset.scRel, "relset", t.value + " поправлено вручную")]); return true; }
      return false;
    }
    function input(t) {
      if (t.dataset.scRel) { const o = $("#rel-out"); if (o) o.textContent = `${SC.relWord(+t.value)} (${+t.value > 0 ? "+" : ""}${t.value})`; }
    }
    function key(e, t) {
      if (e.key === "Enter" && t.classList && t.classList.contains("chip-add")) {
        e.preventDefault();
        const v = t.value.trim();
        if (!v) return true;
        if (t.dataset.scAdd) applySceneOps([op(t.dataset.scAdd, "add", v)]);
        else if (t.id === "sc-enter-new") applySceneOps([op(null, "enter", v)]);
        else if (t.id === "x-domain-add") { const d = collectExp(); v.split(",").map((s) => s.trim()).filter(Boolean).forEach((x) => { if (!d.domains.includes(x)) d.domains.push(x); }); ui.renderDrawer(); setTimeout(() => { const n = $("#x-domain-add"); if (n) n.focus(); }, 0); }
        return true;
      }
      if (e.key === "Enter" && t.tagName === "INPUT" && (t.dataset.scTop || t.dataset.scField)) { t.blur(); return true; }
      return false;
    }

    return { actions, change, input, key };
  };
})(typeof window !== "undefined" ? window : globalThis);
