/* Prism RP — контроллер переписки: создание переписки (настройка времени) и явные правки во вкладке «Среда».
   Только чтение форм и вызовы сервиса переписки; правила — в messenger/*. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const MT = PRP.messengerTime;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.messenger = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $ } = ui;
    const csv = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
    const radio = (name) => { const r = document.querySelector(`input[name=${name}]:checked`); return r ? r.value : ""; };
    async function after(msg) {
      svc.prism.refresh();
      ui.renderDrawer(); ui.renderHead(); ui.renderFeed();
      if (msg) ui.toast(msg);
    }
    // Ответ сервиса: ошибка — показать и ничего не перерисовывать как успех.
    const failed = (r) => { if (r && r.error) { ui.toast(r.error, true); return true; } return false; };

    const actions = {
      "ms-create": async () => {
        const tz = $("#ms-tz").value.trim(), mode = radio("ms-mode") || "live";
        const manualNow = mode === "manual" ? MT.toIso(MT.fromLocal($("#ms-manual").value, tz)) : null;
        const setup = { timeZone: tz, timeMode: mode, manualNow };
        const err = svc.messenger.checkSetup(setup);
        if (err) { ui.toast(err, true); return; }
        const cardId = S.modal && S.modal.cardId;
        S.modal = null; ui.renderModal();
        await nav.newChat("messenger", cardId, setup);
      },
      "env-edit": () => { S.envEdit = { scope: svc.chat.path().length ? "branch" : "" }; ui.renderDrawer(); },
      "env-cancel": () => { S.envEdit = null; ui.renderDrawer(); },
      "env-save": async () => {
        const scope = radio("env-scope");
        if (!scope) { ui.toast("Выберите, где действует изменение: в этой ветке или во всей переписке.", true); return; }
        const patch = {};
        const clear = new Set([...document.querySelectorAll("[data-env-clear]:checked")].map((x) => x.dataset.envClear));
        for (const k of ["location", "activity", "visualPose", "visualHair"]) { const v = $("#env-" + k).value.trim(); if (clear.has(k)) patch[k] = null; else if (v) patch[k] = v; }
        for (const k of ["nearby", "ongoing", "visualWear"]) { const v = csv($("#env-" + k).value); if (clear.has(k)) patch[k] = null; else if (v.length) patch[k] = v; }
        const av = $("#env-availability").value; if (av) patch.availability = av;
        const r = await svc.messenger.commitEvent({ scope, patch });
        if (failed(r)) return;
        S.envEdit = null;
        await after("Положение сохранено.");
      },
      "env-time-save": async () => {
        const tz = $("#env-tz").value.trim(), mode = radio("env-mode") || "live";
        const t = { timeZone: tz, timeMode: mode };
        const mi = $("#env-manual");
        if (mode === "manual" && mi && mi.value) t.manualNow = MT.toIso(MT.fromLocal(mi.value, tz));
        if (failed(await svc.messenger.setTime(t))) return;
        await after("Время переписки сохранено.");
      },
      "env-advance": async (t) => { if (failed(await svc.messenger.advance(+t.dataset.min))) return; await after(); },
      "env-mk-add": async () => {
        const scope = radio("env-mk-scope");
        if (!scope) { ui.toast("Выберите, где действует договорённость.", true); return; }
        const r = await svc.messenger.addMarker({ kind: $("#env-mk-kind").value, text: $("#env-mk-text").value, scope });
        if (failed(r)) return;
        await after("Договорённость отмечена.");
      },
      "env-mk-status": async (t) => {
        const r = await svc.messenger.markerStatus(t.dataset.id, t.dataset.status, svc.chat.path().length ? "branch" : "chat");
        if (failed(r)) return;
        await after();
      },
    };

    // Ручное время в окне новой переписки: при выборе «задаю сам» подставить текущее местное время пояса.
    function change(t) {
      if (t.name === "ms-mode" && t.value === "manual" && !$("#ms-manual").value) {
        const tz = $("#ms-tz").value.trim();
        if (MT.validTimeZone(tz)) $("#ms-manual").value = MT.toLocalInput(ctx.clock(), tz);
        return true;
      }
      return false;
    }

    return { actions, change };
  };
})(typeof window !== "undefined" ? window : globalThis);
