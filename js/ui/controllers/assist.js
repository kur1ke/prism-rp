/* Prism RP — контроллер ассистента: разговоры, контекст (персонаж и чат), копирование, другой ответ, правка. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.assist = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $ } = ui;
    const saveConv = async () => { await svc.assist.save(); ui.rememberUi(); };
    const copy = async (text) => { await ctx.files.copyText(text); ui.toast("Скопировано."); };

    const actions = {
      assist: () => nav.openAssist(S.assist && S.assist.messages.length ? S.assist.id : null),
      "assist-new": () => { ui.closePop(); if (S.assist && !S.assist.messages.length) { $("#input") && $("#input").focus(); return; } nav.openAssist(null, S.assist ? { cardId: S.assist.ctx.cardId, chatId: S.assist.ctx.chatId } : null); },
      "assist-open": (t) => { ui.closePop(); nav.openAssist(t.dataset.id); },
      "vision-test": () => {
        const plugin = typeof window.ai === "function" ? window.ai : (window.root && typeof window.root.ai === "function" ? window.root.ai : null);
        const status = $("#vision-test-status");
        if (!status) return;
        status.style.display = "block";
        if (!plugin) { status.textContent = "Vision недоступен: ai-text-plugin не подключён. Откройте сборку непосредственно на Perchance."; return; }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/webp";
        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { status.textContent = "Поддерживаются PNG, JPEG и WebP."; return; }
          if (file.size > 20 * 1024 * 1024) { status.textContent = "Для теста выберите изображение до 20 МиБ."; return; }
          status.textContent = "Vision: отправляю изображение в ai-text-plugin…";
          try {
            const response = await plugin({
              instruction: [
                "Это проверка Vision. Опиши изображение на русском языке: основные объекты и видимый текст. Не додумывай то, чего не видно.",
                "\n",
                file
              ]
            });
            status.textContent = "Vision: ответ модели\n\n" + String(response && response.generatedText != null ? response.generatedText : response);
          } catch (e) {
            status.textContent = "Vision: ошибка\n" + String(e && e.message || e);
            console.error("PRISM Vision test:", e);
          }
        };
        input.click();
      },
      "assist-list": (t) => ui.openPop(V.assistListPop(ui.vm()), t),
      "assist-ctx": (t) => ui.openPop(V.assistCtxPop(ui.vm()), t),
      "assist-pick-card": async (t) => {
        const a = S.assist; a.ctx.cardId = t.dataset.id || null; a.ctx.chatId = null;
        if (a.messages.length) await saveConv();
        ui.renderStage();
        const anchor = $("[data-act=assist-ctx]");
        if (a.ctx.cardId && anchor) ui.openPop(V.assistCtxPop(ui.vm()), anchor); else ui.closePop();
      },
      "assist-pick-chat": async (t) => {
        const a = S.assist; a.ctx.chatId = t.dataset.id || null;
        if (a.messages.length) await saveConv();
        ui.closePop(); ui.renderStage();
      },
      "assist-about-chat": () => { ui.closePop(); nav.openAssist(null, { cardId: S.cardId, chatId: S.chatId }); },
      "assist-starter": (t) => { if (S.gen) return; svc.assist.send(t.dataset.q); },
      "assist-copy": (t) => { const m = S.assist.messages.find((x) => x.id === t.dataset.id); if (m) copy(m.text); },
      "copy-code": (t) => { const c = t.parentElement.querySelector("code"); if (c) copy(c.textContent); },
      "assist-regen": async (t) => { if (S.gen) return; await svc.assist.cutFrom(t.dataset.id); await svc.assist.generate(); },
      "assist-edit": async (t) => {
        if (S.gen) return;
        const removed = await svc.assist.cutFrom(t.dataset.id);
        ui.renderStage();
        const i = $("#input"); if (i && removed) { i.value = removed[0].text; ui.autoGrow(i); i.focus(); }
      },
      "assist-msg-del": async (t) => { if (S.gen) return; await svc.assist.cutFrom(t.dataset.id); ui.renderStage(); },
      "assist-del": async () => {
        const a = S.assist;
        if (!a || S.gen || !confirm(`Удалить разговор «${a.title}»?`)) return;
        await svc.assist.remove(a);
        nav.openAssist(null);
        ui.toast("Разговор удалён.");
      },
    };

    return { actions };
  };
})(typeof window !== "undefined" ? window : globalThis);
