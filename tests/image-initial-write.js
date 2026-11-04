"use strict";
const assert = require("node:assert/strict");

module.exports = async function ({ make, test }) {
  const P = globalThis.PRP, backend = P.imgBackends;
  for (const mode of ["rp", "messenger"]) for (const previous of [null, "done", "error"]) {
    await test(`F20 ${mode}/${previous || "new"}: first write failure releases lock, restores image and permits retry`, async () => {
      const h = make({ name: "Аля", image: { trigger: "alya" } });
      await h.chat.createChat(mode, "c1");
      const draft = h.chat.newMsg("assistant", null, "Фото.");
      draft.swipes[0].draws = [{ prompt: "1girl, portrait, smiling", ratio: "1:1" }];
      const msg = await h.chat.commitMessage(draft, draft.id), sw = msg.swipes[0];
      const reuse = previous && { id: "image-old", draw: sw.draws[0].prompt, ratio: "1:1", sourceDrawIndex: 0,
        status: previous, seed: 17, prompt: "OLD_PROMPT", error: "OLD_ERROR", translationFailure: { reason: "OLD_REASON" } };
      if (reuse) { sw.images = [reuse]; await h.chat.putMsg(msg); }
      h.S.drawing = new Set(); h.S.imgUrls = reuse ? { [reuse.id]: "OLD_IMAGE_URL" } : {};
      h.S.settings.images = Object.assign({}, h.S.settings.images, { enabled: true, backend: "a1111", url: "http://unused", translate: false, drawPromptMode: "tags" });
      const svc = P.imageService.create(h.ctx);
      const before = JSON.stringify(msg), dbBefore = await h.ctx.DB.get("messages", msg.id), urlsBefore = JSON.stringify(h.S.imgUrls);
      const put = h.ctx.DB.put, originalBackend = backend.generate;
      let calls = 0, release, repaints = 0;
      h.ctx.ui.renderFeed = () => { repaints++; };
      h.ctx.DB.put = async () => { await new Promise(r => { release = r; }); throw Error("F20 initial put abort"); };
      backend.generate = async () => { calls++; return { dataUrl: "data:image/png;base64,AA==", seed: 42, info: { width: 512, height: 512 } }; };
      try {
        const pending = svc.draw(msg, sw, sw.draws[0], reuse || undefined);
        // Handle rejection to make the baseline failure an assertion, not an unhandled promise.
        const settled = pending.catch(e => e);
        assert.equal(h.S.drawing.size, 1); assert.equal(calls, 0);
        assert.equal(JSON.stringify(msg), before, "pending must not be published before persistence");
        const entry = reuse || { id: [...h.S.drawing][0], draw: sw.draws[0].prompt, ratio: "1:1", sourceDrawIndex: 0 };
        await svc.draw(msg, sw, null, entry);
        assert.equal(calls, 0, "duplicate redraw cannot bypass initial write lock");
        release(); assert.ok(!((await settled) instanceof Error), "storage failure is reported through the UI, including redraw handlers");
        assert.equal(h.S.drawing.size, 0);
        assert.equal(JSON.stringify(msg), before);
        assert.deepEqual(await h.ctx.DB.get("messages", msg.id), dbBefore);
        assert.equal(JSON.stringify(h.S.imgUrls), urlsBefore);
        assert.equal(calls, 0); assert.ok(repaints > 0);
        assert.ok(h.toasts.some(x => /F20 initial put abort/.test(x.t)));
        h.ctx.DB.put = put;
        await svc.draw(msg, sw, sw.draws[0], reuse || undefined);
        assert.equal(calls, 1); assert.equal(h.S.drawing.size, 0);
        assert.equal(sw.images.length, 1); assert.equal(sw.images[0].status, "done");
        assert.equal(h.S.imgUrls[sw.images[0].id], "data:image/png;base64,AA==");
        assert.equal((await h.ctx.DB.get("messages", msg.id)).swipes[0].images[0].status, "done");
      } finally { backend.generate = originalBackend; h.ctx.DB.put = put; }
    });
  }
};
