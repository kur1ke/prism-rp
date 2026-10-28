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
const prior=TR.fold({mode:"messenger",initialWear:init,path:[msg]});
const newOpts={...opts,draw:nextDraw,draws:[{prompt:nextDraw}],
  references:TR.references(prior,"char",["remove","adjust","add"])};
const newId=ES.catalog(newOpts).find(x=>x.text.includes("снова надела")).id;
const again=parse([{actor:"char",field:"wear",action:"add",value:["белая блузка"],
  certainty:"reported",sourceId:newId}],newOpts);
assert.equal(again.events.length,1,JSON.stringify(again));
continued.swipes[0].stateEvents.push({...again.events[0],drawIndex:1});
assert.deepEqual(TR.fold({mode:"messenger",initialWear:init,path:[continued]})
  .actors.char.wearState.worn.map(x=>x.item),[skirt,title]);
console.log("PASS: indexed evidence sourced from original text/DRAW, no copied citation, replay tamper checks and continue");
