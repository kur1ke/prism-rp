/* Messenger temporal freshness — last reported is not a promise of current state.
   Static/time-mocked checks; live Perchance remains a separate validation. */
"use strict";
const assert = require("node:assert/strict");
require("../js/chat/tree.js");
require("../js/prism/scene.js");
require("../js/messenger/time.js");
require("../js/prism/data.js");
const T = require("../js/state/tracker.js");
const R = require("../js/state/resolver.js");
const I = require("../js/state/interpreter.js");
require("../js/prism/modes.js");
const MP = globalThis.PRP.prismModes;
const earlier = Date.parse("2026-10-26T08:03:00Z");
const now = Date.parse("2026-10-26T18:49:00Z");
function msg(id, at, events, text) {
  return { id, role: "assistant", swipeIdx: 0, swipes: [{
    text: text || "Я почти дома после покупок.",
    messengerAt: at == null ? null : {at: new Date(at).toISOString(), timeZone: "UTC"},
    stateEvents: events || [], sceneOps: []
  }] };
}
const status = (field, value, evidence) => ({
  actor: "char", field, action: "set", value, certainty: "reported", evidence
});
const stateMsg = msg("a", earlier, [
  status("location", "почти дома", "почти дома"),
  status("activity", "поход за продуктами", "после покупок")
], "Я почти дома после покупок.");
// This fixture uses already canonical source facts; validation runs on every fold.
function projected(path) {
  const st = T.fold({mode: "messenger", path});
  return {raw: st, world: R.world({
    location:null,activity:null,availability:"unknown", visualWear:[],nearby:[],ongoing:[]
  }, {state:st,character:T.forCharacter(st)})};
}
const {raw,world} = projected([stateMsg]);
assert.equal(world.location, "почти дома");
assert.equal(world.activity, "поход за продуктами");
const old = R.messengerFreshness(world,[stateMsg],now);
assert.equal(old.location,null,"remote place cannot remain current after many hours");
assert.equal(old.activity,null,"shopping cannot remain current after many hours");
assert.equal(old.lastReported.location.value,"почти дома");
assert.equal(old.lastReported.activity.value,"поход за продуктами");
assert.equal(old.lastReported.location.at,new Date(earlier).toISOString());
assert.equal(R.world({}, {state:raw, character:T.forCharacter(raw)}).location,"почти дома",
  "pure projection must never erase canonical event history");
const sections = MP.messengerSections({world:old,conversation:{},temporal:{now,timeZone:"UTC"}});
assert.match(sections.place,/не считать текущим местом/);
assert.match(sections.place,/не считать текущим занятием/);
assert.match(sections.place,/последнее сообщение о занятии/);
assert.match(sections.place,/неизвестно/);
console.log("PASS: 10h-old self-reported status becomes bounded historical context");
const fresh = R.messengerFreshness(world,[stateMsg],earlier+20*60000);
assert.equal(fresh.location,"почти дома");
assert.equal(fresh.activity,"поход за продуктами");
assert.equal(fresh.lastReported,undefined);
const manual = {...world,fieldStatus:{
  location:{certainty:"established",source:{kind:"legacy-manual"}},
  activity:{certainty:"established",source:{kind:"legacy-manual"}}
}};
assert.equal(R.messengerFreshness(manual,[stateMsg],now).location,"почти дома");
const unclocked = JSON.parse(JSON.stringify(stateMsg));
unclocked.swipes[0].messengerAt=null;
assert.equal(R.messengerFreshness(world,[unclocked],now).activity,"поход за продуктами",
  "without time do not fabricate passage or damage legacy data");
const wrongSwipe = JSON.parse(JSON.stringify(stateMsg));
wrongSwipe.swipes.push({text:"Другой ответ",stateEvents:[],sceneOps:[]});
wrongSwipe.swipeIdx=1;
assert.equal(R.messengerFreshness(world,[wrongSwipe],now).location,"почти дома",
  "foreign swipe timestamps cannot declare the original source stale");
console.log("PASS: freshness respects manual facts, missing timestamps and swipe provenance");
const done = msg("b",earlier+25*60000,[{
  actor:"char",field:"activity",action:"clear",certainty:"reported",
  evidence:"Я закончила поход за продуктами"
}], "Я закончила поход за продуктами.");
const closed = projected([stateMsg,done]);
assert.equal(closed.world.activity,null);
assert.equal(closed.world.fieldStatus.activity.certainty,"reported");
assert.deepEqual(R.messengerFreshness(closed.world,[stateMsg,done],now).lastReported?.activity,undefined,
  "explicit completion is not an old active shopping status");
const newlyHome = msg("c",earlier+30*60000,[status("location","дома","я дома")],"Наконец-то я дома!");
const moved = projected([stateMsg,done,newlyHome]);
assert.equal(moved.world.location,"дома");
assert.equal(R.messengerFreshness(moved.world,[stateMsg,done,newlyHome],now).lastReported.location.value,"дома",
  "home location remains a prior report when no fresh confirmation exists");
const instruction = I.instruction({mode:"messenger",role:"assistant",
  text:"Я закончила поход за продуктами",previous:{activity:"поход за продуктами"}});
assert.match(instruction,/PREVIOUS_STATE/);
assert.match(instruction,/action=clear/);
assert.match(instruction,/Дедукция только из прошедших часов НЕ является событием/);
console.log("PASS: explicit completion clears activity and Observer receives bounded prior-state data");
