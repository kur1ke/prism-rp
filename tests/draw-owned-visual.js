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

const visualFrame = VP.parseFrame(JSON.stringify({
  camera:"a portrait with a three-quarter view",
  subjects:[{name:"Orihime",pose:"torso angled sideways and one hand near her cheek",
    clothing:"an open pink pajama top with visible white lace undergarment"}],
  objects:["a crumpled blue skirt lies separately on the bed"],
  environment:"in her softly lit room",
  lighting:"subdued ambient light"
}));
assert.ok(visualFrame.frame && !visualFrame.error, visualFrame.error);
assert.equal(visualFrame.frame.version,1);
assert.ok(Object.isFrozen(visualFrame.frame) && Object.isFrozen(visualFrame.frame.subjects[0]));
assert.equal(visualFrame.frame.subjects[0].clothing.includes("blue skirt"),false,
  "off-body clothes cannot silently become a worn garment");
assert.equal(visualFrame.frame.objects[0].includes("crumpled blue skirt"),true);
const prose = VP.renderFrame(visualFrame.frame,"description");
const tags = VP.renderFrame(visualFrame.frame,"tags");
assert.ok(prose.includes("three-quarter view") && prose.includes("torso angled sideways"));
assert.ok(prose.includes("crumpled blue skirt lies separately on the bed"));
assert.ok(tags.includes("crumpled blue skirt lies separately on the bed"));
assert.ok(!tags.includes("wearing blue skirt"));
const onlyLocation = VP.parseFrame(JSON.stringify({
  camera:"a close-up portrait",subjects:[{name:"Orihime",pose:"",clothing:""}],
  objects:[],environment:"standing in a bedroom",lighting:""
}));
assert.ok(onlyLocation.frame);
assert.strictEqual(onlyLocation.frame.subjects[0].pose,"",
  "environment never becomes a camera-visible full-body pose");
assert.ok(VP.renderFrame(onlyLocation.frame,"description").includes("standing in a bedroom"));
for (const bad of [
  "not-json",
  "{}",
  JSON.stringify({camera:"",subjects:[{name:"",pose:"",clothing:""}],objects:[],environment:"",lighting:""}),
  JSON.stringify({camera:"photo",subjects:[],objects:["<script>"],environment:"",lighting:""}),
  JSON.stringify({camera:"photo",subjects:[],objects:[],environment:"",lighting:"line\nline"})
]) assert.ok(VP.parseFrame(bad).error, "invalid visual representation must fail closed");

const planned = VP.parsePlannedFrame(JSON.stringify({
  version:2, focus:"hand lifting clothing to reveal the abdomen",
  composition:{medium:"selfie portrait",framing:"upper body through hips",
    viewpoint:"three-quarter view",rationale:"show both the gesture and the revealed abdomen"},
  subjects:[{name:"Orihime",orientation:"slightly sideways",
    action:"lifting the lower edge of her pajama top",visibleResult:"abdomen visible",
    clothing:"pink pajama top, lace undergarment visible at its edge",expression:"playful smile"}],
  objects:["crumpled skirt lying separately on the bed"],
  environment:"in a bedroom",lighting:"soft ambient light"
}));
assert.ok(planned.plan && !planned.error,planned.error);
assert.equal(planned.plan.version,2);
assert.equal(planned.plan.composition.framing,"upper body through hips");
assert.ok(Object.isFrozen(planned.plan.composition));
const result=VP.renderPlannedFrame(planned.plan,"description");
assert.ok(result.indexOf("lifting the lower edge") < result.indexOf("in a bedroom"),
  "visual action must precede environment");
assert.ok(result.includes("crumpled skirt lying separately on the bed"));
assert.ok(!result.includes("show both the gesture"),"planning rationale must not leak into backend prompt");
assert.equal(planned.plan.subjects[0].clothing.includes("crumpled skirt"),false);
for(const invalid of [
  JSON.stringify({version:1,camera:"portrait",subjects:[],objects:[],environment:"",lighting:""}),
  JSON.stringify({version:2,focus:"",composition:{},subjects:[],objects:[],environment:"",lighting:""}),
  JSON.stringify({version:2,focus:"gesture",composition:{medium:"",framing:"",viewpoint:"",rationale:""},
    subjects:[],objects:[],environment:"",lighting:""})
]) assert.ok(VP.parsePlannedFrame(invalid).error);
