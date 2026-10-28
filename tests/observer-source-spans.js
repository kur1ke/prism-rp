/* Observer source-span contract: model selects immutable source fragment IDs.
   The application derives exact evidence and verifies it at every replay. */
"use strict";
const assert=require("node:assert/strict");
const ES=require("../js/state/evidence-spans.js");
const INT=require("../js/state/interpreter.js");
const TR=require("../js/state/tracker.js");
const title="белая хлопковая блузка с коротким рукавом";
const skirt="бежевая юбка";
const draw="Селфи в зеркале. Орихимэ Иноуэ полностью сняла белую блузку и бросила её в сторону. На ней всё ещё бежевая юбка.";
const caption="Ну как тебе? ♡";
const init={schema:1,kind:"initial-outfit",event:{actor:"char",field:"wear",
  action:"set",value:[title,skirt],certainty:"reported",evidence:""}};
const state=TR.fold({mode:"messenger",initialWear:init,path:[]});
const opts={role:"assistant",mode:"messenger",speakerName:"Орихимэ Иноуэ",
  text:caption,draw,draws:[{prompt:draw}],
  references:TR.references(state,"char",["remove","adjust","add"])};
const spans=ES.catalog(opts);
assert.ok(spans.some(x=>x.id==="D1"&&x.text.includes("сняла белую блузку")));
const sourceId=spans.find(x=>x.text.includes("сняла белую блузку")).id;
const prompt=INT.instruction(opts);
assert.ok(prompt.includes("SOURCE_FRAGMENTS"));
assert.ok(prompt.includes(sourceId));
assert.ok(prompt.includes("не составляй evidence вручную"));
function parse(events,o=opts,frameObjects=[]){
  return INT.parse(JSON.stringify({events,frameObjects,unresolved:[]}),o);
}
const base={actor:"char",field:"wear",action:"remove",value:["белая блузка"],
  certainty:"reported",sourceId};
// The model supplies no quote, no itemMention, no byte offset.
const p=parse([base]);
assert.equal(p.events.length,1,JSON.stringify(p));
assert.equal(p.events[0].evidenceType,"draw");
assert.equal(p.events[0].visualScope,"current-self");
assert.equal(p.events[0].itemMention,"белую блузку");
assert.deepEqual(p.events[0].value,[title]);
assert.equal(p.events[0].sourceSpan.kind,"draw");
assert.equal(p.events[0].evidence,spans.find(x=>x.id===sourceId).text);
// Regression from the live Messenger DRAW: the same source fragment mentions
// a white blouse AND white lace underwear. Shared colour is not garment identity.
// The selected source is D2; the Observer returns the canonical blouse label.
const lingerie="белое кружевное бельё";
const realDraw="Селфи в зеркале. Орихимэ Иноуэ смотрит в камеру. Она полностью сняла белую блузку, оставаясь в белом кружевном белье, которое подчеркивает её грудь.";
const realInit={...init,event:{...init.event,value:[title,skirt,lingerie]}};
const realState=TR.fold({mode:"messenger",initialWear:realInit,path:[]});
const realOpts={...opts,draw:realDraw,draws:[{prompt:realDraw}],
  references:TR.references(realState,"char",["remove","adjust","add"])};
const realSourceId=ES.catalog(realOpts)
  .find(x=>x.text.startsWith("Она полностью сняла белую блузку")).id;
assert.equal(realSourceId,"D2");
const real=parse([{...base,value:[title],sourceId:realSourceId}],realOpts);
assert.equal(real.events.length,1,JSON.stringify(real));
assert.equal(real.events[0].itemMention,"белую блузку");
assert.equal(real.events[0].reference.item,title);
const realMsg={id:"real-source",role:"assistant",swipeIdx:0,
  swipes:[{text:caption,draws:[{prompt:realDraw}],stateEvents:real.events}]};
const realFold=TR.fold({mode:"messenger",initialWear:realInit,path:[realMsg]});
assert.deepEqual(realFold.actors.char.wearState.worn.map(x=>x.item),[skirt,lingerie]);
assert.deepEqual(realFold.actors.char.wearState.removed.map(x=>x.item),[title]);
const realSibling=structuredClone(realMsg);
realSibling.swipes.push({text:"Другое фото",draws:[],stateEvents:[]});
realSibling.swipeIdx=1;
assert.deepEqual(TR.fold({mode:"messenger",initialWear:realInit,path:[realSibling]})
  .actors.char.wearState.worn.map(x=>x.item),[title,skirt,lingerie]);
// Without the garment noun, shared colour in another garment is insufficient.
const noBlouseDraw=realDraw.replace("Она полностью сняла белую блузку, ", "");
const noBlouseOpts={...realOpts,draw:noBlouseDraw,draws:[{prompt:noBlouseDraw}]};
const noBlouseId=ES.catalog(noBlouseOpts).find(x=>x.text.includes("белом кружевном белье")).id;
assert.equal(parse([{...base,value:[title],sourceId:noBlouseId}],noBlouseOpts).events.length,0);
// Conflicting colour cannot resolve to the existing white blouse.
const redDraw=realDraw.replace("сняла белую блузку","сняла красную блузку");
const redOpts={...realOpts,draw:redDraw,draws:[{prompt:redDraw}]};
const redId=ES.catalog(redOpts).find(x=>x.text.includes("сняла красную блузку")).id;
assert.equal(parse([{...base,value:[title],sourceId:redId}],redOpts).events.length,0);
// Two known white blouses with different materials remain ambiguous even
// when the model chooses a full canonical name absent from the DRAW.
const otherBlouse="белая льняная блузка с длинным рукавом";
const doubleInit={...realInit,event:{...realInit.event,
  value:[title,skirt,lingerie,otherBlouse]}};
const doubleState=TR.fold({mode:"messenger",initialWear:doubleInit,path:[]});
const doubleOpts={...realOpts,references:TR.references(doubleState,"char",["remove","adjust","add"])};
const ambiguous=parse([{...base,value:[title],sourceId:realSourceId}],doubleOpts);
assert.equal(ambiguous.events.length,0,JSON.stringify(ambiguous));
assert.equal(ambiguous.rejectedObservations[0].reason,"ambiguous-garment");

const msg={id:"m-source",role:"assistant",swipeIdx:0,
  swipes:[{text:caption,draws:[{prompt:draw}],stateEvents:p.events}]};
const folded=TR.fold({mode:"messenger",initialWear:init,path:[msg]});
assert.deepEqual(folded.actors.char.wearState.worn.map(x=>x.item),[skirt]);
assert.deepEqual(folded.actors.char.wearState.removed.map(x=>x.item),[title]);
assert.ok(TR.normalize({...p.events[0],sourceSpan:{
  ...p.events[0].sourceSpan,start:p.events[0].sourceSpan.start+1
}}, {role:"assistant",mode:"messenger",text:caption,draws:[{prompt:draw}],
  references:opts.references}).error);
assert.ok(TR.normalize({...p.events[0],evidence:"пересказала снятие"},
  {role:"assistant",mode:"messenger",text:caption,draws:[{prompt:draw}],
  references:opts.references}).error);
assert.equal(parse([{...base,sourceId:"D99"}]).events.length,0);
assert.equal(parse([{...base,sourceId:"T0"}]).events.length,0);
assert.equal(parse([{...base,sourceSpan:{kind:"draw",start:0,end:10}}]).events.length,0,
  "observer cannot supply its own numeric offsets");
assert.equal(parse([{...base,sourceId,evidenceType:"text"}]).events.length,0,
  "explicitly contradictory provenance fails closed");
assert.equal(parse([{...base,sourceId,visualScope:"past-self"}]).events.length,0,
  "model cannot reclassify a past photo as a current shot");
const old="Старое фото. "+draw;
const oldOptions={...opts,draw:old,draws:[{prompt:old}]};
const oldId=ES.catalog(oldOptions).find(x=>x.text.includes("сняла белую блузку")).id;
assert.equal(parse([{...base,sourceId:oldId}],oldOptions).events.length,0,
  "historical old-photo must not be promoted to the present");
const modified=structuredClone(msg);
modified.swipes[0].draws=[{prompt:draw.replace("белую","красную")}];
assert.deepEqual(TR.fold({mode:"messenger",initialWear:init,path:[modified]})
  .actors.char.wearState.worn.map(x=>x.item),[title,skirt]);
const sibling=structuredClone(msg);
sibling.swipes.push({text:caption,draws:[],stateEvents:[]});
sibling.swipeIdx=1;
assert.deepEqual(TR.fold({mode:"messenger",initialWear:init,path:[sibling]})
  .actors.char.wearState.worn.map(x=>x.item),[title,skirt]);
// First-party numeric ranges are also necessary for text, not only DRAW.
const text="Я дома. Сейчас готовлю ужин.";
const textOpts={role:"user",mode:"messenger",text,draw:"",references:[]};
const tId=ES.catalog(textOpts).find(x=>x.text.includes("дома")).id;
const t=parse([{actor:"user",field:"location",action:"set",value:"дома",
  certainty:"reported",sourceId:tId}],textOpts);
assert.equal(t.events.length,1,JSON.stringify(t));
assert.equal(t.events[0].sourceSpan.kind,"text");
assert.ok(!t.events[0].evidenceType);
const lift="Селфи в зеркале. Орихимэ Иноуэ полностью подняла белую блузку вверх, показывая кружевное бельё.";
const liftOpts={...opts,draw:lift,draws:[{prompt:lift}]};
const liftId=ES.catalog(liftOpts).find(x=>x.text.includes("подняла белую блузку")).id;
const lifted=parse([{...base,action:"adjust",sourceId:liftId,
  placement:"неправильная ручная цитата"}],liftOpts);
assert.equal(lifted.events.length,1,JSON.stringify(lifted));
assert.ok(lifted.events[0].placement.includes("подняла белую блузку"));
assert.deepEqual(TR.fold({mode:"messenger",initialWear:init,path:[{
  id:"lift",role:"assistant",swipeIdx:0,
  swipes:[{text:caption,draws:[{prompt:lift}],stateEvents:lifted.events}]}]})
  .actors.char.wearState.partiallyWorn.map(x=>x.item),[title]);
// Continued DRAW retains the original fragment's first-frame offsets.
const continued=structuredClone(msg);
const nextDraw="Селфи в зеркале. Орихимэ Иноуэ снова надела белую блузку.";
continued.swipes[0].draws.push({prompt:nextDraw});
continued.swipes[0].stateEvents[0].drawIndex=0;
// Continue archives the earlier DRAW with explicit drawIndex before
// obtaining the previous snapshot; references must use that exact moment.
const archived=structuredClone(msg);
archived.swipes[0].stateEvents[0].drawIndex=0;
const prior=TR.fold({mode:"messenger",initialWear:init,path:[archived]});
const newOpts={...opts,draw:nextDraw,draws:[{prompt:nextDraw}],
  references:TR.references(prior,"char",["remove","adjust","add"])};
const newId=ES.catalog(newOpts).find(x=>x.text.includes("снова надела")).id;
const again=parse([{actor:"char",field:"wear",action:"add",value:["белая блузка"],
  certainty:"reported",sourceId:newId}],newOpts);
assert.equal(again.events.length,1,JSON.stringify(again));
continued.swipes[0].stateEvents.push({...again.events[0],drawIndex:1});
const finalState=TR.fold({mode:"messenger",initialWear:init,path:[continued]});
assert.deepEqual(finalState.actors.char.wearState.worn.map(x=>x.item),[skirt,title],
  JSON.stringify({diagnostics:finalState.diagnostics,events:continued.swipes[0].stateEvents}));
// PR #109 regression: a newly observed garment has no prior reference.
// The Unicode lexer must read Russian words instead of returning [].
const newGarmentDraw="Селфи в зеркале. Орихимэ Иноуэ теперь в красном кардигане.";
const newGarmentOpts={...opts,draw:newGarmentDraw,draws:[{prompt:newGarmentDraw}],
  references:opts.references.filter(r=>r.item!==title)};
const freshId=ES.catalog(newGarmentOpts).find(x=>x.text.includes("красном кардигане")).id;
const novel=parse([{actor:"char",field:"wear",action:"add",
  certainty:"reported",value:["красный кардиган"],sourceId:freshId}],newGarmentOpts);
assert.equal(novel.events.length,1,JSON.stringify(novel));
assert.deepEqual(novel.events[0].value,["красном кардигане"]);
assert.equal(novel.events[0].reference,undefined);
// A reported object that IS NOT in the selected sentence is never invented.
const mismatch=parse([{...base,value:["зелёный свитер"]}],opts);
assert.equal(mismatch.events.length,0);
assert.equal(mismatch.rejectedObservations.length,1);
assert.equal(mismatch.rejectedObservations[0].sourceId,sourceId);
assert.equal(mismatch.rejectedObservations[0].reason,"source-has-no-matching-garment");
assert.ok(mismatch.rejectedObservations[0].fragment.includes("сняла белую блузку"));
// The Debug panel explains which source was chosen without copying raw model
// instructions or silently treating a rejected observation as an event.
const debug=globalThis.PRP.views.debugModal({
  card:{name:"Орихимэ Иноуэ"},
  chat:{initialWear:init},
  path:[],
  messengerView:{stateStatus:{status:"partial",eventCount:0,
    issues:mismatch.issues,rejectedObservations:mismatch.rejectedObservations}}
},{section:"errors"});
assert.ok(debug.includes("Отклонённые наблюдения"));
assert.ok(debug.includes("зелёный свитер"));
assert.ok(debug.includes("сняла белую блузку"));
console.log("PASS: indexed evidence sourced from original text/DRAW, no copied citation, replay tamper checks and continue");
