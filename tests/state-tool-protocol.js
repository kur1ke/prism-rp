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
