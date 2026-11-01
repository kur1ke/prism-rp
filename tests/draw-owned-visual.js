"use strict";
// Authored DRAW image generation must not re-resolve state or veto off-body objects.
// Tests the source-to-image authority boundary; live model fidelity is separate.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const service = fs.readFileSync(require.resolve("../js/images/service.js"), "utf8");
const VP = require("../js/images/visual-plan.js");
const source = { chatId: "chat-a", messageId: "message-a", swipeIdx: 2 };
const shot = "A blue skirt lies crumpled on the bed. A portrait from the side.";
const plan = VP.create({ shotAuthored: true, owner: true, draw: shot,
  source, wearFacts: [] });
assert.equal(plan.wear, null);
assert.deepEqual(plan.absentFromBody, []);
assert.deepEqual(plan.offBodyVisible, []);
assert.equal(plan.allowGlobalGarmentNegative, false);
const promptPlan = VP.prompt({ visualPlan: plan, actors: { owner: true }, shot,
  shotAuthored: true, format: "hybrid" });
assert.equal(promptPlan.sections.CLOTHING.known, false);
assert.equal(promptPlan.sections.POSE.authority, "source-shot");
assert.equal(promptPlan.sections.COMPOSITION.authority, "source-shot");
assert.ok(service.includes("const snap = !drawAuthored && ctx.svc.state"));
assert.ok(service.includes("const projected = drawAuthored"));
assert.ok(service.includes("wearFacts: drawAuthored ? [] : projected.wearFacts"));
assert.ok(service.includes("const canonicalWear = drawAuthored ? null"));
assert.ok(service.includes("shotOnlyGate = drawAuthored;"));
assert.ok(!service.includes("const verifiedFrameObjects ="), "author-shot must not consume Observer frame roles");
