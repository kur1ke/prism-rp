/* Wear Observation Resolver: evidentiary phrase and object identity are
   separate contracts; no garment identities invented by a word match. */
"use strict";
const assert=require("node:assert/strict");
const WO=require("../js/state/wear-observation.js");
const TR=require("../js/state/tracker.js");
const INT=require("../js/state/interpreter.js");
const old="белая хлопковая блузка с коротким рукавом";
const skirt="светло-бежевая юбка-плиссе";
const shirt="белая шелковая блузка с длинным рукавом";
const ref=(item,id,action="remove")=>({id,actor:"char",field:"wear",action,item,
  source:{role:"initial",kind:"initial-outfit"}});
const origin={schema:1,kind:"initial-outfit",
  event:{actor:"char",field:"wear",action:"set",value:[old,skirt],
    certainty:"reported",evidence:""}};
const base=TR.references(TR.fold({mode:"messenger",initialWear:origin,path:[]}),
  "char",["remove","adjust","add"]).filter(x=>x.action==="remove");
const draw="Селфи в зеркале. Орихимэ Иноуэ стоит, глядя в камеру. Она полностью сняла белую блузку и отбросила её в сторону, оставаясь в белом кружевном белье. На ней всё ещё надета светло-бежевая юбка-плиссе.";
const evidence="полностью сняла белую блузку";
const options={mode:"messenger",role:"assistant",speakerName:"Орихимэ Иноуэ",
  text:"Ну как тебе? ♡",draw,draws:[{prompt:draw}],references:base};
const event={actor:"char",field:"wear",action:"remove",value:[old],
  certainty:"reported",evidence,visualScope:"current-self"};
const observed=INT.parse(JSON.stringify({events:[event],frameObjects:[]}),options);
assert.equal(observed.events.length,1,JSON.stringify(observed));
assert.equal(observed.events[0].evidenceType,"draw");
assert.equal(observed.events[0].itemMention,"белую блузку");
assert.equal(observed.events[0].reference.item,old);
assert.equal(observed.events[0].value[0],old);
assert.equal(WO.proof(observed.events[0].itemMention,evidence,observed.events[0].reference),true);
assert.ok(TR.normalize({...observed.events[0],itemMention:"красную юбку"},
  {...options,references:base}).error);
const sourceWithRefs={...options,references:base};
assert.equal(TR.normalize(observed.events[0],sourceWithRefs).error,undefined);
const m={id:"m1",role:"assistant",swipeIdx:0,swipes:[{
  text:options.text,draws:[{prompt:draw}],stateEvents:observed.events}]};
const worn=TR.fold({mode:"messenger",initialWear:origin,path:[m]}).actors.char.wearState;
assert.deepEqual(worn.worn.map(x=>x.item),[skirt]);
assert.deepEqual(worn.removed.map(x=>x.item),[old]);
const other=structuredClone(m);other.swipes.push({text:"Другой ответ",draws:[],stateEvents:[]});
other.swipeIdx=1;
assert.deepEqual(TR.fold({mode:"messenger",initialWear:origin,path:[other]})
  .actors.char.wearState.worn.map(x=>x.item),[old,skirt]);
const matching=WO.match("белую блузку",[ref(old,"a"),ref(shirt,"b")]);
assert.equal(matching.reason,"ambiguous-garment");
assert.equal(WO.match("белую хлопковую блузку",[ref(old,"a"),ref(shirt,"b")])
  .reference.item,old);
assert.equal(WO.match("красную блузку",[ref(old,"a")]).reason,"unknown-garment");
assert.equal(WO.match("белую",[ref(old,"a")]).reason,"missing-garment-noun");
const unresolved=INT.parse(JSON.stringify({events:[{...event,value:["белую блузку"],
  itemMention:"белую блузку"}]}),{...options,references:[
  ref(old,"wear:char:0"),ref(shirt,"wear:char:1")]});
assert.equal(unresolved.events.length,0);
assert.match(unresolved.issues.join(";"),/ambiguous-garment/);
const falseCitation=INT.parse(JSON.stringify({events:[{...event,
  itemMention:"белую блузку",evidence:"полностью сняла" }]}),options);
assert.equal(falseCitation.events.length,0);
const historical=INT.parse(JSON.stringify({events:[{...event,visualScope:"past-self"}]}),{...options,
  draw:"Старое фото: "+draw,draws:[{prompt:"Старое фото: "+draw}]});
assert.equal(historical.events.length,0);
const noRefs=INT.parse(JSON.stringify({events:[{...event,value:["белую блузку"],
  itemMention:"белую блузку"}]}),{...options,references:[]});
assert.equal(noRefs.events.length,1,"old generic grounded behavior is preserved with no known reference");
// New garments must never be rejected simply because the old outfit
// lacks their identity. An explicit mention remains grounded in this DRAW.
const dress="красное вечернее платье";
const newDraw="Селфи. Орихимэ Иноуэ теперь в красном вечернем платье.";
const newEvent={actor:"char",field:"wear",action:"add",value:["красном вечернем платье"],
  itemMention:"красном вечернем платье",certainty:"reported",
  evidence:"в красном вечернем платье",evidenceType:"draw",visualScope:"current-self"};
const novel=INT.parse(JSON.stringify({events:[newEvent]}),{
  ...options,draw:newDraw,draws:[{prompt:newDraw}],
  references:[ref("бежевая юбка-плиссе","wear:char:0","add")]});
assert.equal(novel.events.length,1,JSON.stringify(novel));
assert.equal(novel.events[0].reference,undefined);
assert.deepEqual(novel.events[0].value,["красном вечернем платье"]);

// A continued swipe binds later DRAWs to the outcome of earlier DRAWs,
// but historical snapshots must not incorporate the later removal.
const dressPhoto="Селфи Орихимэ Иноуэ. На ней красное платье.";
const removePhoto="Селфи Орихимэ Иноуэ. Она полностью сняла красное платье.";
const addDress={actor:"char",field:"wear",action:"add",
  value:["красное платье"],certainty:"reported",evidence:"красное платье",
  evidenceType:"draw",visualScope:"current-self",drawIndex:0};
const oldMomentMsg={id:"continue",role:"assistant",swipeIdx:0,
  swipes:[{text:"Фото!",draws:[{prompt:dressPhoto}],stateEvents:[addDress]}]};
const previousPath=[oldMomentMsg];
const priorState=TR.fold({mode:"messenger",path:previousPath});
const priorRefs=TR.references(priorState,"char",["remove","adjust","add"]);
const removal=INT.parse(JSON.stringify({events:[{
  actor:"char",field:"wear",action:"remove",value:["красное платье"],
  itemMention:"красное платье",certainty:"reported",
  evidence:"сняла красное платье",evidenceType:"draw",visualScope:"current-self"
}]}),{mode:"messenger",role:"assistant",speakerName:"Орихимэ Иноуэ",
  text:"Фото! Продолжение.",draw:removePhoto,draws:[{prompt:removePhoto}],
  references:priorRefs});
assert.equal(removal.events.length,1,JSON.stringify(removal));
const continued=structuredClone(oldMomentMsg);
continued.swipes[0].draws.push({prompt:removePhoto});
continued.swipes[0].text="Фото! Продолжение.";
continued.swipes[0].stateEvents.push({...removal.events[0],drawIndex:1});
continued.swipes[0].stateStatus={status:"ok",sourceText:continued.swipes[0].text,
  sourceDraw:removePhoto,sourceDrawIndex:1};
assert.deepEqual(TR.fold({mode:"messenger",path:[continued]})
  .actors.char.wearState.removed.map(x=>x.item),["красное платье"]);
const originalPhoto=TR.historicalDrawPath([continued],0);
assert.equal(originalPhoto.ok,true,JSON.stringify(originalPhoto));
assert.deepEqual(TR.fold({mode:"messenger",path:originalPhoto.path})
  .actors.char.wearState.worn.map(x=>x.item),["красное платье"]);
console.log("PASS: WearObservationResolver source/identity split, unique reference, ambiguity and swipe isolation");
