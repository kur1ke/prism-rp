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
const base=[ref(old,"wear:char:0"),ref(skirt,"wear:char:1")];
const draw="Селфи в зеркале. Орихимэ Иноуэ стоит, глядя в камеру. Она полностью сняла белую блузку и отбросила её в сторону, оставаясь в белом кружевном белье. На ней всё ещё надета светло-бежевая юбка-плиссе.";
const evidence="полностью сняла белую блузку";
const options={mode:"messenger",role:"assistant",speakerName:"Орихимэ Иноуэ",
  text:"Ну как тебе? ♡",draw,draws:[{prompt:draw}],references:base};
const event={actor:"char",field:"wear",action:"remove",value:[old],
  certainty:"reported",evidence};
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
const origin={schema:1,kind:"initial-outfit",
  event:{actor:"char",field:"wear",action:"set",value:[old,skirt],
    certainty:"reported",evidence:""}};
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
const historical=INT.parse(JSON.stringify({events:[event]}),{...options,
  draw:"Старое фото: "+draw,draws:[{prompt:"Старое фото: "+draw}]});
assert.equal(historical.events.length,0);
const noRefs=INT.parse(JSON.stringify({events:[{...event,value:["белую блузку"],
  itemMention:"белую блузку"}]}),{...options,references:[]});
assert.equal(noRefs.events.length,1,"old generic grounded behavior is preserved with no known reference");
console.log("PASS: WearObservationResolver source/identity split, unique reference, ambiguity and swipe isolation");
