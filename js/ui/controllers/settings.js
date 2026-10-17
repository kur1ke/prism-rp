/* Prism RP — контроллер настроек: модели и провайдеры, генерация, изображения, персона, вид, бэкап. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, OA = PRP.openai, V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.settings = function (ctx) {
    const { S, ui, svc, nav, DB } = ctx;
    const { $, $$ } = ui;
    const save = () => ctx.saveSettings();

    function editingProvider() { return S.settings.providers.find((p) => p.id === S.editProviderId); }
    function readProviderForm(p) {
      if (!$("#prov-name")) return;
      p.name = $("#prov-name").value.trim() || "API";
      p.baseUrl = $("#prov-url").value.trim();
      p.apiKey = $("#prov-key").value.trim();
      p.model = $("#prov-model").value.trim();
      p.extendedSamplers = $("#prov-ext").checked;
    }
    function collectImgForm() {
      const c = S.settings.images;
      $$("[data-imgcfg]").forEach((el) => {
        const k = el.dataset.imgcfg;
        c[k] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value.trim();
      });
      delete c.loras; // LoRA живут только в карточках персонажей
    }

    const actions = {
      settings: (t) => ui.openSettings(t.dataset.section),
      "cycle-theme": async () => {
        const ids = V.THEMES.map((t) => t.id);
        S.settings.theme = ids[(ids.indexOf(S.settings.theme) + 1) % ids.length];
        ui.applyLook(); await save();
        ui.toast("Тема: " + V.THEMES.find((t) => t.id === S.settings.theme).name);
      },
      theme: async (t) => { S.settings.theme = t.dataset.id; ui.applyLook(); await save(); S.modal.keepScroll = true; ui.renderModal(); },
      "pick-provider": async (t) => {
        if (t.closest("[data-act=prov-edit]")) return;
        S.settings.activeProvider = t.dataset.id; await save(); ui.closePop(); ui.refreshAfterSettings();
      },
      "pick-model": async (t) => {
        const p = S.settings.providers.find((x) => x.id === ctx.provider().id);
        p.model = t.dataset.model; await save(); ui.closePop(); ui.refreshAfterSettings();
      },
      "pick-preset": async (t) => {
        S.settings.samplerPreset = t.dataset.id;
        const pr = V.SAMPLER_PRESETS.find((x) => x.id === t.dataset.id);
        if (pr) Object.assign(S.settings.sampler, pr.v);
        await save(); ui.closePop(); ui.refreshAfterSettings();
      },
      // Провайдеры
      "prov-add": async (t) => {
        const pr = OA.PRESETS.find((x) => x.id === t.dataset.preset);
        const p = { id: U.uid("prov"), presetId: pr.id, name: pr.id === "custom" ? "Мой API" : pr.name, baseUrl: pr.baseUrl, apiKey: "", model: "", extendedSamplers: pr.extendedSamplers };
        S.settings.providers.push(p);
        S.settings.activeProvider = p.id;
        S.editProviderId = p.id;
        await save(); ui.refreshAfterSettings();
        setTimeout(() => { const el = $(pr.baseUrl ? (pr.local ? "#prov-model" : "#prov-key") : "#prov-url"); if (el) el.focus(); }, 30);
      },
      "prov-edit": (t, e) => { e.stopPropagation(); S.editProviderId = t.dataset.id; S.modal.keepScroll = true; ui.renderModal(); },
      "prov-close": () => { const p = editingProvider(); if (p) readProviderForm(p); save(); S.editProviderId = null; ui.refreshAfterSettings(); },
      "prov-save": async () => { readProviderForm(editingProvider()); await save(); ui.refreshAfterSettings(); ui.toast("Сохранено."); },
      "prov-del": async () => {
        const p = editingProvider();
        if (!confirm(`Удалить «${p.name}»?`)) return;
        S.settings.providers = S.settings.providers.filter((x) => x !== p);
        if (S.settings.activeProvider === p.id) S.settings.activeProvider = (ctx.providers()[0] || {}).id || "";
        S.editProviderId = null;
        await save(); ui.refreshAfterSettings();
      },
      "prov-models": async () => {
        const p = editingProvider(); readProviderForm(p);
        try { p.models = await OA.listModels(p); if (!p.model && p.models[0]) p.model = p.models[0]; await save(); ui.refreshAfterSettings(); ui.toast(`Найдено моделей: ${p.models.length}`); }
        catch (err) { ui.toast(err.message, true); }
      },
      "persona-save": async () => {
        S.settings.persona = { name: $("#p-name").value.trim() || "Пользователь", description: $("#p-desc").value,
          image: { view: $("#p-view").value, appearance: $("#p-appearance").value, povTags: $("#p-povtags").value.trim() } };
        await save(); ui.refreshAfterSettings(); ui.toast("Сохранено.");
      },
      // Изображения
      "img-backend": (t) => {
        // Сначала перерисовать (синхронно), потом сохранить: иначе ввод в новое поле во время сохранения теряется.
        collectImgForm(); S.settings.images.backend = t.dataset.id; S.modal.keepScroll = true; ui.renderModal(); save();
      },
      "img-lists": async () => {
        collectImgForm(); await save();
        try {
          const out = await svc.images.fetchLists();
          await save();
          ui.toast(`Сервер на связи: моделей ${out.models.length}, LoRA ${out.loras.length}.`);
        } catch (e) { ui.toast(e.message, true); }
        S.modal.keepScroll = true; ui.renderModal();
      },
      // Данные
      backup: async () => ctx.files.download(`prism-rp-бэкап-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await DB.exportAll()), "application/json"),
      restore: () => $("#file-backup").click(),
    };

    async function change(t) {
      if (t.id === "file-backup" && t.files[0]) {
        const data = JSON.parse(await ctx.files.readFile(t.files[0], "text"));
        const replace = confirm("Заменить текущие данные бэкапом?\n\nОК — заменить, Отмена — добавить к существующим.");
        // Проверка до записи (правила — в svc.worldChat.checkBackup): запись мира чата принимается, только если её чат
        // есть в бэкапе (замена) или в бэкапе либо уже здесь (добавление). Контроллер даёт только режим и id чатов.
        const local = replace ? [] : await DB.all("chats");
        const chk = svc.worldChat.checkBackup(data, { replace, existingChatIds: local.map((c) => c.id) });
        // Среда переписки — то же: только к переписке из бэкапа (замена) или из бэкапа и уже существующих (добавление).
        const chkEnv = svc.messenger.checkBackup(chk.data, { replace, existingChats: local.map((c) => ({ id: c.id, mode: c.mode })) });
        await DB.importAll(chkEnv.data, replace);
        t.value = "";
        S.modal = null; S.view = "home";
        await nav.loadAll(); ui.renderAll();
        const skipped = [chk.rejected ? `записей мира чата: ${chk.rejected}` : "", chkEnv.rejected ? `записей среды переписки: ${chkEnv.rejected}` : ""].filter(Boolean).join(", ");
        ui.toast(skipped ? `Бэкап загружен. Некоторые записи пропущены при восстановлении — ${skipped}.` : "Бэкап загружен.", !!skipped);
        return true;
      }
      if (t.dataset.imgcfg !== undefined) { collectImgForm(); await save(); return true; }
      if (t.dataset.imgCheck) { collectImgForm(); S.settings.images[t.dataset.imgCheck] = t.checked; ui.refreshAfterSettings(); await save(); return true; }
      if (t.dataset.imgSel) { collectImgForm(); S.settings.images[t.dataset.imgSel] = t.value; ui.refreshAfterSettings(); await save(); return true; }
      if (t.dataset.sampler) { S.settings.sampler[t.dataset.sampler] = t.value === "" ? null : +t.value; S.settings.samplerPreset = "custom"; await save(); ui.refreshAfterSettings(); return true; }
      if (t.dataset.setText) { S.settings[t.dataset.setText] = t.value; await save(); return true; }
      if (t.dataset.setNum) { S.settings[t.dataset.setNum] = +t.value; await save(); ui.refreshAfterSettings(); return true; }
      if (t.dataset.setRange) { S.settings[t.dataset.setRange] = +t.value; ui.applyLook(); await save(); return true; }
      if (t.dataset.set) { S.settings[t.dataset.set] = t.checked; await save(); ui.refreshAfterSettings(); if (S.drawerOpen) ui.renderDrawer(); return true; }
      return false;
    }
    function input(t) {
      if (t.dataset.setRange) { const o = $("#fs-out"); if (o) o.textContent = t.value; document.documentElement.style.setProperty("--prose-fs", t.value + "px"); }
    }

    return { actions, change, input };
  };
})(typeof window !== "undefined" ? window : globalThis);
