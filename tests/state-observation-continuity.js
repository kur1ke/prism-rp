/* STATE-CONTINUITY-1: authored DRAW is a first-class observation.
   No rendered-image backend, second wardrobe, or fabricated removal. */
"use strict";
const assert = require("node:assert/strict");
require("../js/prism/scene.js");
require("../js/chat/tree.js");
require("../js/messenger/time.js");
require("../js/prism/data.js");
const T = require("../js/state/tracker.js");
const I = require("../js/state/interpreter.js");
const R = require("../js/state/resolver.js");
const M = require("../js/prism/modes.js");

const old = ["бежевая юбка", "белая блузка", "чулки", "балетки"];
const origin = {schema:1,kind:"initial-outfit",event:{
  actor:"char",field:"wear",action:"set",value:old,certainty:"reported",evidence:""
}};
function msg(id, text, events=[], draws=[]) {
  return {id,role:"assistant",chatId:"c1",swipeIdx:0,swipes:[{
    text,draws,sceneOps:[],stateCorrections:[],stateEvents:events,
    ...(draws.length && events.length ? {stateStatus:{
      status:"ok",sourceText:text,sourceDraw:draws.at(-1).prompt,
      sourceDrawIndex:draws.length-1
    }} : {})
  }]};
}
function fold(path) {return T.fold({mode:"messenger",initialWear:origin,path,charName:"Орихимэ",userName:"Друг"});}
function wear(path) {return fold(path).actors.char.wearState;}
const full = "На ней только белая блузка и белые трусики.";
const fullEvent = {actor:"char",field:"wear",action:"set",
  value:["белая блузка","белые трусики"],certainty:"reported",
  evidence:full,evidenceType:"draw",visualScope:"current-self"};
const shot = msg("photo","Смотри! ♡",[fullEvent],[{prompt:"Селфи Орихимэ в зеркале. "+full}]);
assert.deepEqual(wear([]).worn.map(x=>x.item),old,"origin remains valid before the shot");
const observed = I.parse(JSON.stringify({events:[fullEvent],frameObjects:[],unresolved:[]}),{
  mode:"messenger",role:"assistant",text:"Смотри! ♡",
  draw:shot.swipes[0].draws[0].prompt,draws:shot.swipes[0].draws
});
assert.equal(observed.valid,true);
assert.equal(observed.events.length,1,observed.issues.join("; "));
assert.deepEqual(wear([shot]).worn.map(x=>x.item),fullEvent.value,
  "complete authored shot replaces the previous outfit without explicit undress actions");
assert.equal(wear([shot]).complete,true);
assert.deepEqual(wear([shot]).removed,[],"replacement must not invent removal events");
assert.equal(T.latestPhotoWear([shot]).complete,true);
const snap=fold([shot]);
const world=R.world({visualWear:[],location:null},{state:snap,character:T.forCharacter(snap),
  latestPhotoWear:T.latestPhotoWear([shot]),latestAuthoredShot:T.latestAuthoredShot([shot])});
const place=M.messengerSections({world,conversation:{},temporal:{}}, {lists:false,plans:0}).place;
assert.match(place,/полный текущий комплект по авторскому DRAW/);
assert.ok(!place.includes("бежевая юбка"),"old origin cannot be presented as current");
let path=[shot];
for(let n=0;n<12;n++) path.push(msg("no-draw-"+n,"Обсуждаем другие вещи."));
assert.equal(T.latestAuthoredShot(path),null,"bounded source cue eventually disappears");
assert.deepEqual(wear(path).worn.map(x=>x.item),fullEvent.value,
  "canonical full draw event remains after ephemeral photo cue expires");

const partial = "На фото в полный рост на ней белая блузка.";
const bad = T.normalize({...fullEvent,evidence:partial,value:["белая блузка"]},{
  role:"assistant",mode:"messenger",text:"Фото",
  draws:[{prompt:partial}]
});
assert.match(bad.error,/не содержит однозначного полного перечня/,
  "full-body framing alone is not an exhaustive outfit claim");
assert.ok(T.normalize({...fullEvent,visualScope:"past-self"},{
  role:"assistant",mode:"messenger",text:"Фото",draws:shot.swipes[0].draws
}).error,"past-self is never authoritative");
assert.ok(T.normalize({...fullEvent,evidenceType:"draw",evidence:"На ней только платье"},
  {role:"assistant",mode:"messenger",text:"Фото",draws:shot.swipes[0].draws}).error,
  "citation must be in the original authored draw");

const changed="Я уже переоделась, но новый наряд пока не показываю.";
const invalidated = {actor:"char",field:"wear",action:"invalidate",
  certainty:"reported",evidence:"Я уже переоделась"};
const transition=msg("changed",changed,[invalidated]);
const unknown=wear([transition]);
assert.equal(unknown.known,false);
assert.equal(unknown.complete,false);
assert.equal(unknown.invalidated,true);
assert.deepEqual(unknown.worn,[],"old outfit must not remain on-body");
assert.deepEqual(unknown.removed,[],"unknown is not evidence of undressing");
assert.equal(T.fieldOf(fold([transition]),"char","wear"),null);
assert.equal(T.latestAuthoredShot([shot,transition]),null,
  "old authored photo must stop influencing Prism after a later outfit change");
const afterUnknown=fold([transition]);
const unknownWorld=R.world({visualWear:old},{
  state:afterUnknown,character:T.forCharacter(afterUnknown),
  latestAuthoredShot:T.latestAuthoredShot([shot,transition]),latestPhotoWear:null
});
assert.deepEqual(unknownWorld.visualWear,[],
  "invalidated current outfit must not inherit legacy baseline clothing");
assert.equal(unknownWorld.wearInvalidated,true);
const unknownPrism=M.messengerSections({world:unknownWorld,conversation:{},temporal:{}}).place;
assert.match(unknownPrism,/прежний комплект перестал быть актуальным/);
assert.ok(!unknownPrism.includes("ПОЛНЫЙ перечень надетой сейчас одежды"),
  "an old complete outfit cannot reappear as current");
const newPartial="Орихимэ в белой футболке, снята по пояс.";
const partialEv={actor:"char",field:"wear",action:"add",value:["белой футболке"],
  certainty:"reported",evidence:"белой футболке",evidenceType:"draw",visualScope:"current-self"};
const partMsg=msg("partial","А вот это покажу!",[partialEv],[{prompt:newPartial}]);
assert.deepEqual(wear([transition,partMsg]).worn.map(x=>x.item),["белой футболке"]);
assert.equal(wear([transition,partMsg]).complete,false,
  "new partial evidence cannot claim a complete outfit");
assert.ok(!wear([transition,partMsg]).worn.some(x=>x.item==="бежевая юбка"));
assert.ok(T.normalize({...invalidated,certainty:"intent"},
  {role:"assistant",mode:"messenger",text:changed}).error,
  "intent cannot erase the known current outfit");

const alternate=structuredClone(transition);
alternate.swipes.push({text:"Я всё ещё в юбке.",draws:[],stateEvents:[],sceneOps:[],stateCorrections:[]});
alternatePlacementSwipe.swipeIdx=1;
assert.deepEqual(wear([alternate]).worn.map(x=>x.item),old,
  "alternate swipe must not inherit invalidation");
assert.deepEqual(wear([transition]).worn,[],"returning to selected swipe replays its state");
assert.ok(T.normalize(fullEvent,{role:"user",mode:"messenger",
  text:"Смотри",draws:shot.swipes[0].draws}).error,
  "a user cannot author clothing changes for the character");

const overconfident=I.parse(JSON.stringify({events:[{...fullEvent,certainty:"established"}]}),{
  mode:"messenger",role:"assistant",text:"Смотри! ♡",
  draw:shot.swipes[0].draws[0].prompt,draws:shot.swipes[0].draws
});
assert.equal(overconfident.events[0].certainty,"reported",
  "remote observation must downcast model certainty, not reject the observation");

// Inquiry facts remain attached to their own shot when the same swipe is
// continued; retrospective snapshots must never inherit a later outfit.
const inquirySource="Орихимэ в красном платье и туфлях";
const inquiryNote={schema:1,drawIndex:0,sourceDraw:inquirySource,
  sourceText:"Смотри!",changed:"yes",
  previous:old.map(item=>({item,status:"not_worn"})),
  hidden:[{slot:"underwear_bottom",status:"worn",items:["белое бельё"]}]};
const inquiryEvents=[
  {actor:"char",field:"wear",action:"invalidate",certainty:"reported",
    evidence:"changed",evidenceType:"wear-inquiry",drawIndex:0},
  {actor:"char",field:"wear",action:"add",certainty:"reported",
    value:["белое бельё"],evidence:"underwear_bottom",
    evidenceType:"wear-inquiry",drawIndex:0,wearSlot:"underwear_bottom"}
];
const continued=msg("series","Смотри!",[
  ...inquiryEvents,
  {actor:"char",field:"wear",action:"add",certainty:"reported",
    value:["красном платье"],evidence:"красном платье",
    evidenceType:"draw",visualScope:"current-self",drawIndex:0},
  {actor:"char",field:"wear",action:"add",certainty:"reported",
    value:["чёрной куртке"],evidence:"чёрной куртке",
    evidenceType:"draw",visualScope:"current-self",drawIndex:1}
],[{prompt:inquirySource},{prompt:"Орихимэ в чёрной куртке"}]);
continued.swipes[0].wearInquiries=[inquiryNote];
continued.swipes[0].stateStatus={
  status:"ok",sourceText:"Смотри!",sourceDraw:"Орихимэ в чёрной куртке",
  sourceDrawIndex:1
};
const priorShot=T.historicalDrawPath([continued],0);
assert.equal(priorShot.ok,true,priorShot.reason);
const beforeSecond=fold(priorShot.path).actors.char.wearState;
assert.deepEqual(beforeSecond.worn.map(x=>x.item).sort(),
  ["красном платье","белое бельё"].sort(),
  "retrospective shot must not include newer garments");
assert.equal(priorShot.path[0].swipes[0].wearInquiries[0].drawIndex,0);
assert.ok(!fold([continued]).diagnostics.length,"both authored shots replay with exact provenance");
const forgery=structuredClone(continued);
forgery.swipes[0].wearInquiries[0].sourceDraw="изменённый DRAW";
assert.ok(fold([forgery]).diagnostics.some(d=>/уточнение/.test(d.issue)),
  "altered inquiry provenance must not be replayed");

console.log("PASS: STATE-CONTINUITY-1 full/partial DRAW, unknown, provenance, swipes, stale hints");


// Live regression: a generic outfit preamble must not become part of a garment.
const outfitText = "Сейчас я в своей любимой домашней одежде — в светлой уютной кофте и в длинной юбке.";
const extracted = I.grounded(outfitText, { mode: "messenger", role: "assistant" });
const extractedWear = extracted.find(e => e.field === "wear");
assert.ok(extractedWear, JSON.stringify(extracted));
assert.deepEqual(extractedWear.value, ["светлой уютной кофте", "длинной юбке"],
  "only the garment noun phrases belong to the physical wear state");


// Regression: a confirmed clothing adjustment survives the next RP prompt.
// Clothing identity alone ("кофта") must not erase its lifted position.
const liftedText = "Я слегка приподняла край белой блузки.";
const liftedEvent = {actor:"char",field:"wear",action:"adjust",
  value:["белая блузка"],certainty:"reported",
  evidence:"приподняла край белой блузки",
  placement:"приподняла край белой блузки"};
const liftedPath = [msg("lifted","Я слегка приподняла край белой блузки.",[liftedEvent])];
const liftedSnapshot = fold(liftedPath);
const liftedTracked = {state:liftedSnapshot,character:T.forCharacter(liftedSnapshot)};
assert.equal(liftedTracked.character.visualWearPartial.length,1);
const liftedWorld = R.world({visualWear:[]},liftedTracked);
const liftedPlace = M.messengerSections({world:liftedWorld,conversation:{},temporal:{}},
  {lists:false,plans:0}).place;
assert.ok(liftedPlace.includes("текущее положение одежды"),liftedPlace);
assert.ok(liftedPlace.includes("приподняла край белой блузки"),liftedPlace);
const alternatePlacementSwipe = structuredClone(liftedPath[0]);
alternatePlacementSwipe.swipes.push({text:"Без движения.",stateEvents:[],sceneOps:[]});
alternatePlacementSwipe.swipeIdx=1;
const alternateSnapshot = fold([alternatePlacementSwipe]);
const alternatePlace = M.messengerSections({
  world:R.world({visualWear:[]},{state:alternateSnapshot,character:T.forCharacter(alternateSnapshot)}),
  conversation:{},temporal:{}
}, {lists:false,plans:0}).place;
assert.ok(!alternatePlace.includes("приподняла край белой блузки"),
  "placement from a sibling swipe must not leak into current RP prompt");
