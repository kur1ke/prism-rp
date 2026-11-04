"use strict";
const assert = require("node:assert/strict");

module.exports = async function ({ make, test }) {
  const P = globalThis.PRP;
  for (const mode of ["rp", "messenger"]) for (const change of ["delete-message", "delete-image", "edit-source", "fresh-fields", "ancestor", "superseded"]) {
    await test(`F21 ${mode}/${change}: final commit validates current records and preserves concurrent changes`, async () => {
      const h = make({ name: "Аля" }); await h.chat.createChat(mode, "c1");
      const parent = await h.chat.addUserMessage("USER");
      const draft = h.chat.newMsg("assistant", parent.id, "PHOTO");
      draft.swipes[0].draws = [{ prompt: "1girl, portrait", ratio: "1:1" }];
      const msg = await h.chat.commitMessage(draft, draft.id), sw = msg.swipes[0];
      Object.assign(h.S.settings.images, { enabled: true, backend: "a1111", url: "http://unused", translate: false, drawPromptMode: "tags" });
      h.S.drawing = new Set(); h.S.imgUrls = {};
      const svc = P.imageService.create(h.ctx), DB = h.ctx.DB;
      const backend = P.imgBackends.generate, putAll = DB.putAll, rmw = DB.readModifyWrite;
      let injected = false;
      const changeSource = async () => {
        if (injected) return; injected = true;
        const latest = await DB.get("messages", msg.id);
        if (change === "delete-message") await DB.del("messages", msg.id);
        else if (change === "ancestor") {
          const p = await DB.get("messages", parent.id); p.swipes[0].text = "CHANGED_PARENT"; await DB.put("messages", p);
        } else {
          if (change === "delete-image") latest.swipes[0].images = [];
          if (change === "edit-source") latest.swipes[0].text = "CHANGED_SOURCE";
          if (change === "fresh-fields") { latest.extra = "KEEP_ME"; latest.swipes[0].stateCorrections = [{ actor: "char", field: "location", value: "NEW" }]; }
          if (change === "superseded") { latest.swipes[0].images[0].operationId = "new-operation"; latest.swipes[0].images[0].prompt = "NEW_OPERATION_PROMPT"; }
          await DB.put("messages", latest);
        }
      };
      // Same causal point on the old implementation and on the fixed service:
      // another writer completes immediately before the final transaction starts.
      DB.putAll = async entries => { if (entries.some(([s]) => s === "images")) await changeSource(); return putAll(entries); };
      DB.readModifyWrite = async (...args) => { await changeSource(); return rmw(...args); };
      P.imgBackends.generate = async () => ({ dataUrl: "data:image/png;base64,AA==", seed: 42 });
      try {
        await svc.draw(msg, sw, sw.draws[0]);
        assert.equal(injected, true); assert.equal(h.S.drawing.size, 0);
        const saved = await DB.get("messages", msg.id), images = await DB.all("images");
        if (change === "delete-message") assert.equal(saved, undefined);
        if (change === "delete-image") assert.deepEqual(saved.swipes[0].images, []);
        if (change === "edit-source") assert.equal(saved.swipes[0].text, "CHANGED_SOURCE");
        if (change === "fresh-fields") {
          assert.equal(saved.extra, "KEEP_ME"); assert.equal(saved.swipes[0].stateCorrections[0].value, "NEW");
          assert.equal(saved.swipes[0].images[0].status, "done"); assert.equal(images.length, 1);
        } else {
          assert.equal(images.length, 0); assert.equal(Object.keys(h.S.imgUrls).length, 0);
        }
        if (change === "ancestor") assert.equal(saved.swipes[0].images[0].status, "error");
        if (change === "superseded") assert.equal(saved.swipes[0].images[0].prompt, "NEW_OPERATION_PROMPT");
      } finally { P.imgBackends.generate = backend; DB.putAll = putAll; DB.readModifyWrite = rmw; }
    });
  }
  await test("F21: failed final transaction releases reservation without publishing image data", async () => {
    const h = make({ name: "Аля" }); await h.chat.createChat("rp", "c1");
    const draft = h.chat.newMsg("assistant", null, "PHOTO");
    draft.swipes[0].draws = [{ prompt: "1girl, portrait", ratio: "1:1" }];
    const msg = await h.chat.commitMessage(draft, draft.id);
    Object.assign(h.S.settings.images, { enabled: true, backend: "a1111", url: "http://unused", translate: false });
    h.S.drawing = new Set(); h.S.imgUrls = {};
    const backend = P.imgBackends.generate;
    h.ctx.DB.readModifyWrite = async () => { throw Error("final transaction abort"); };
    P.imgBackends.generate = async () => ({ dataUrl: "data:image/png;base64,AA==", seed: 42 });
    try {
      await assert.rejects(P.imageService.create(h.ctx).draw(msg, msg.swipes[0], msg.swipes[0].draws[0]), /final transaction abort/);
      assert.equal(h.S.drawing.size, 0); assert.deepEqual(h.S.imgUrls, {});
      assert.equal((await h.ctx.DB.all("images")).length, 0);
      assert.equal(msg.swipes[0].images[0].status, "pending", "unsaved success cannot be published");
    } finally { P.imgBackends.generate = backend; }
  });
};
