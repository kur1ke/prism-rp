"use strict";
const assert=require("node:assert/strict");
const IC=require("../js/images/compose.js");
const TR=require("../js/state/tracker.js");
const init={schema:1,kind:"initial-outfit",event:{actor:"char",field:"wear",action:"set",
  value:["школьная блузка","синяя юбка"],certainty:"reported",evidence:""}};
const parse=IC.parseStateCalls('Готово! [state: wear.replace("розовая пижама")] [draw: moment=current-self; selfie]');
assert.equal(parse.calls.length,1);
assert.deepEqual(parse.calls[0],{field:"wear",operation:"replace",items:["розовая пижама"]});
assert.ok(!parse.text.includes("[state:"));
assert.equal(IC.parseStateCalls("Фото из галереи. [draw: moment=past-self; я в кофте]").calls.length,0);
assert.ok(IC.stateToolInstruction().includes("wear.replace"));
assert.equal(IC.parseStateCalls('[state: wear.add("юбка", "кофта")]').calls[0].items.length,2);
assert.equal(IC.parseStateCalls('[state: wear.add(__proto__)]').calls.length,0);

const calls=parse.calls, events=TR.eventsFromStateCalls(calls,"messenger");
assert.deepEqual(events.map(e=>e.action),["invalidate","add"]);
const mk=(id,callList,ev)=>({id,role:"assistant",swipeIdx:0,swipes:[{
 text:"Готово!",draws:[],stateProtocol:1,stateCalls:callList,stateEvents:ev}]});
const folding=(path)=>TR.fold({mode:"messenger",initialWear:init,path});
const after=folding([mk("current",calls,events)]);
assert.deepEqual(after.actors.char.wearState.worn.map(x=>x.item),["розовая пижама"]);
assert.equal(after.actors.char.wearState.worn.some(x=>x.item==="синяя юбка"),false);
const untouched=folding([mk("photo",[],[])]);
assert.ok(untouched.actors.char.wearState.worn.some(x=>x.item==="синяя юбка"));
const invalid=folding([mk("tampered",[],events)]);
assert.ok(invalid.diagnostics.some(d=>/state-tool/.test(d.issue)));
assert.ok(invalid.actors.char.wearState.worn.some(x=>x.item==="синяя юбка"));
const added=TR.eventsFromStateCalls([{field:"wear",operation:"remove",items:["синяя юбка"]}],"messenger");
const removed=folding([mk("remove",[{field:"wear",operation:"remove",items:["синяя юбка"]}],added)]);
assert.equal(removed.actors.char.wearState.worn.some(x=>x.item==="синяя юбка"),false);
const original=mk("a",calls,events);
const sibling=mk("b",[],[]);
assert.ok(folding([original]).actors.char.wearState.worn.some(x=>x.item==="розовая пижама"));
assert.ok(folding([sibling]).actors.char.wearState.worn.some(x=>x.item==="синяя юбка"));
console.log("PASS: RP-authored state tool and swipe-local replay");


const settings=require("../js/core/settings.js");
const assembler=require("../js/prism/assembler.js");
assert.equal(settings.merge({}).stateToolEnabled,false,"experimental mode is opt-in");
assert.equal(settings.merge({stateToolEnabled:true}).stateToolEnabled,true);
const buildOpts={card:{name:"Орихимэ",description:"Данные"},history:[{role:"user",text:"Привет"}],
 contextTokens:8192,reserveTokens:600};
const legacyPrompt=assembler.build({...buildOpts,stateToolEnabled:false});
const toolPrompt=assembler.build({...buildOpts,stateToolEnabled:true});
const rendered=(x)=>x.messages.map(m=>m.content).join("\n");
assert.ok(!rendered(legacyPrompt).includes("wear.replace"));
assert.ok(rendered(toolPrompt).includes("wear.replace"));
assert.equal(toolPrompt.report.overflow,false);
const accidental=IC.parseStateCalls("Привет!");
assert.deepEqual(accidental.calls,[],"ordinary conversations must not rewrite canonical state");


const generic=IC.parseStateCalls('Перешла в спальню. [state: location.set("спальня")] [state: pose.set("лежу")]');
assert.deepEqual(generic.calls.map(c=>c.field),["location","pose"]);
const genericEvents=TR.eventsFromStateCalls(generic.calls,"messenger");
assert.deepEqual(genericEvents.map(e=>e.action),["set","set"]);
const genericState=folding([mk("generic",generic.calls,genericEvents)]);
assert.equal(genericState.actors.char.fields.location.value,"спальня");
assert.equal(genericState.actors.char.fields.pose.value,"лежу");
assert.equal(IC.parseStateCalls('[state: location.add("фальшивое место")]').calls.length,0);
const clearing=IC.parseStateCalls('[state: location.clear()]');
assert.equal(TR.eventsFromStateCalls(clearing.calls,"messenger")[0].value,null);
const tamperedGeneric=TR.eventsFromStateCalls(generic.calls,"messenger");
tamperedGeneric[0].value="чужой дом";
assert.ok(folding([mk("generic-bad",generic.calls,tamperedGeneric)]).diagnostics
 .some(d=>/state-tool/.test(d.issue)));
