/* Prism RP — контроллер выдвижной панели: сцена (ручные правки), опыт (форма записи), мир чата (явные действия), Prism (предпросмотр). */
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

    // Форма «Мир чата» → черновик действия (S.worldEdit). Область — только явный выбор пользователя.
    const csv = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
    function collectWorld() {
      const d = S.worldEdit;
      if (!d) return d;
      const sc = document.querySelector("input[name=wc-scope]:checked");
      d.scope = sc ? sc.value : d.scope;
      if (d.op !== "retract" && $("#wc-text")) d.fact = Object.assign({}, d.fact, { text: $("#wc-text").value });
      if (d.op === "assert" && $("#wc-ent")) Object.assign(d.fact, { entities: csv($("#wc-ent").value), topics: csv($("#wc-top").value), locations: csv($("#wc-loc").value), timeline: $("#wc-tl").value, variant: $("#wc-vr").value });
      return d;
    }
    function worldDraft(op, id) {
      // По умолчанию — текущая ветка, если к ней есть привязка; иначе область не выбрана (пользователь выбирает «весь чат» сам).
      const scope = svc.chat.path().length ? "branch" : "";
      const f = id ? (svc.worldChat.view().facts.find((x) => x.id === id) || null) : null;
      S.worldEdit = { op, targetFactId: id || null, scope, fact: op === "override" ? { text: f ? f.text : "" } : op === "assert" ? { text: "" } : null };
      S.tab = "world"; S.drawerOpen = true;
      ui.renderDrawer();
      setTimeout(() => { const e = $("#wc-text"); if (e) e.focus(); }, 30);
    }

    const actions = {
      drawer: () => { S.drawerOpen = !S.drawerOpen; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      "drawer-close": () => { S.drawerOpen = false; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      tab: (t) => { collectExp(); collectWorld(); S.tab = t.dataset.tab; if (S.tab === "prism") svc.prism.refresh(); ui.renderDrawer(); },
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
      // Мир чата: только явные действия; ничего не извлекается из текста ответов.
      "wc-new": () => worldDraft("assert"),
      "wc-override": (t) => worldDraft("override", t.dataset.id),
      "wc-retract": (t) => worldDraft("retract", t.dataset.id),
      "wc-cancel": () => { S.worldEdit = null; ui.renderDrawer(); },
      "wc-save": async () => {
        const d = collectWorld();
        if (!d.scope) { ui.toast("Выберите, где действует факт: в этой ветке или во всём чате.", true); return; }
        const r = await svc.worldChat.commit(d);
        if (r.error) { ui.toast(r.error, true); return; }
        S.worldEdit = null;
        svc.prism.refresh();
        ui.renderDrawer();
        ui.toast(d.op === "retract" ? "Факт убран из мира чата." : "Факт закреплён в мире чата.");
      },
      "wc-sel-save": async () => {
        await svc.worldChat.setSelectors({ timeline: $("#wc-timeline").value, variant: $("#wc-variant").value });
        svc.prism.refresh();
        ui.renderDrawer();
        ui.toast("Таймлайн и вариант чата сохранены.");
      },
      "x-val": (t) => { collectExp().valence = +t.dataset.v; ui.renderDrawer(); },
      "x-weight": (t) => { collectExp().weight = +t.dataset.v; ui.renderDrawer(); },
      "x-domain-del": (t) => { const d = collectExp(); d.domains = d.domains.filter((x) => x !== t.dataset.v); ui.renderDrawer(); },
    };

    function change(t) {
      if (t.dataset.scTop) { applySceneOps([op(null, t.dataset.scTop, t.value.trim() || "-")]); return true; }
      if (t.dataset.scField) { applySceneOps([op(t.dataset.name, t.dataset.scField, t.value.trim() || "-")]); return true; }
      return false;
    }
    function input() { /* полей с живым обновлением на панели сцены нет */ }
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
