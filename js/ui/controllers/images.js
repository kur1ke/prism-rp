/* Prism RP — контроллер картинок в чате: нарисовать, перерисовать, закрепить seed, скачать, удалить, просмотр. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.images = function (ctx) {
    const { S, ui, svc } = ctx;
    const findImg = (t) => svc.images.find(t.dataset.mid, t.dataset.sw, t.dataset.img);
    const newSeed = () => Math.floor(Math.random() * 1e9);
    function copyLegacy(value) {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(field);
      try {
        field.select();
        if (!document.execCommand || !document.execCommand("copy")) throw new Error("Буфер обмена недоступен в этом браузере");
      } finally { field.remove(); }
    }

    const actions = {
      draw: (t) => svc.images.drawFromMessage(t.dataset.id),
      "img-regen": (t) => { const { msg, sw, im } = findImg(t); if (im) svc.images.draw(msg, sw, null, im, { seed: newSeed() }); },
      "img-pin": async (t) => {
        const { im } = findImg(t);
        if (!im || im.seed == null) { ui.toast("У этой картинки нет seed.", true); return; }
        const cd = await svc.images.pinSeed(im.seed);
        ui.toast(`Seed ${im.seed} закреплён за ${cd.name}.`);
      },
      "img-info": (t) => {
        const { im } = findImg(t);
        if (im) ui.openPop(V.imageInfo(im, !!S.settings.developerMode, { mid: t.dataset.mid, sw: t.dataset.sw, img: t.dataset.img }), t);
      },
      "img-copy-prompt": async (t) => {
        const { im } = findImg(t);
        if (!im) return;
        const value = V.imageCopyText(im, !!S.settings.developerMode);
        const clipboard = typeof navigator !== "undefined" && navigator.clipboard;
        if (clipboard && clipboard.writeText) {
          try { await clipboard.writeText(value); }
          catch (_) { copyLegacy(value); }
        } else copyLegacy(value);
        ui.toast("Промпт скопирован");
      },
      "img-dl": (t) => {
        const { im } = findImg(t);
        const url = im && S.imgUrls[im.id];
        if (url) fetch(url).then((r) => r.blob()).then((b) => ctx.files.download(`${ctx.card().name} ${im.seed != null ? im.seed : im.id}.png`, b));
      },
      "img-del": async (t) => {
        const { msg, sw, im } = findImg(t);
        if (!im) return;
        await svc.images.remove(msg, sw, im);
        ui.renderFeed();
      },
      "img-view": (t) => { const { im } = findImg(t); if (im) { S.modal = { kind: "image", im, mid: t.dataset.mid, sw: t.dataset.sw }; ui.renderModal(); } },
      "img-modal-regen": () => {
        const { mid, sw, im } = S.modal;
        const msg = S.messages.find((x) => x.id === mid);
        S.modal = null; ui.renderModal();
        svc.images.draw(msg, msg.swipes[+sw], null, im, { seed: newSeed() });
      },
    };

    return { actions };
  };
})(typeof window !== "undefined" ? window : globalThis);
