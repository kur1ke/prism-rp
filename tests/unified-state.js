"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
require("../js/core/util.js");require("../js/prism/data.js");require("../js/chat/tree.js");
const T = require("../js/state/tracker.js");
const I = require("../js/state/interpreter.js");
require("../js/state/service.js");require("../js/images/compose.js");require("../js/core/settings.js");
require("../js/prism/modes.js");const A = require("../js/prism/assembler.js");
require("../js/chat/service.js");require("../js/ui/render.js");require("../js/ui/views/kit.js");require("../js/ui/views/drawer.js");
const P=globalThis.PRP,root=path.resolve(__dirname,"..");
let passed=0;
function test(name,run){run();passed++;console.log("PASS: "+name);}
const evt=(actor,field,value,evidence="")=>({actor,field,value,action:value===null?"clear":"set",certainty:"established",evidence});
const msg=(id,text,events,role="assistant")=>({id,role,swipeIdx:0,swipes:[{text,stateEvents:events}]});
const fold=(p,extra={})=>T.fold({mode:"rp",charName:"Аля",userName:"Кира",path:p,...extra});
const current=[msg("a","Сейчас 18:00. Идёт дождь. Я в парке.",[
 evt("environment","time","18:00","Сейчас 18:00."),evt("environment","weather","дождь","Идёт дождь."),
 evt("char","location","парке","Я в парке.")])];
test("Unified state: pose is not tracked, prompted or inherited by images",()=>{
 assert.ok(!T.FIELDS.includes("pose"));
 for(const mode of ["rp","messenger"]){
  const state=fold([msg("old","Я сижу.",[evt("char","pose","СИДИТ_СТАРАЯ_ПОЗА","Я сижу.")])],{mode,legacyWorld:{visualPose:"СИДИТ_СТАРАЯ_ПОЗА"}});
  assert.equal(T.fieldOf(state,"char","pose"),null);
  assert.equal(T.forCharacter(state).visualPose,undefined);
  assert.equal(T.view(state).chars.Аля.pose,undefined);
  assert.ok(!T.describe(state).includes("СИДИТ_СТАРАЯ_ПОЗА"));
  assert.ok(!I.instruction({mode}).includes("wear|pose"));
 }
 assert.deepEqual(I.grounded("Я сижу.",{mode:"messenger",role:"assistant"}),[]);
 const parsed=P.imgCompose.parseStateCalls('[state: pose.set("сидит")]');
 assert.deepEqual(parsed.calls,[]);assert.equal(parsed.text,"");
 const image=P.imgCompose.compose({card:{name:"Аля",image:{}},persona:{name:"Кира"},scene:{chars:{Аля:{pose:"OLD_POSE"},Кира:{pose:"OLD_USER_POSE"}}},draw:"Аля, standing, hand on table"});
 assert.ok(!JSON.stringify(image).includes("OLD_POSE") && !JSON.stringify(image).includes("OLD_USER_POSE"));
 assert.ok(image.scene.includes("standing") && image.scene.includes("hand on table"));
});
test("Unified state: remove the old engine, command API and parallel projection",()=>{
 assert.equal(fs.existsSync(path.join(root,"js/prism/scene.js")),false);
 assert.equal(P.scene,undefined);
 const old=require("../js/state/resolver.js");assert.equal(old.scene,undefined);assert.equal(old.resolve,undefined);
 for(const file of ["js/generation/service.js","js/chat/service.js","js/prism/assembler.js","js/prism/service.js","js/images/service.js"]){
  const src=fs.readFileSync(path.join(root,file),"utf8");
  assert.doesNotMatch(src,/PRP\.scene|sceneOps|sceneInit|sceneProtocol|sceneFields\(/,file);
 }
 assert.doesNotMatch(fs.readFileSync(path.join(root,"index.html"),"utf8"),/prism\/scene\.js/);
});
test("Unified state: current location, weather and time have one source",()=>{
 const state=fold(current),view=T.view(state),prompt=A.build({card:{name:"Аля"},stateSnapshot:state});
 assert.equal(T.fieldOf(state,"environment","weather").value,"дождь");assert.equal(view.loc,"парке");assert.equal(view.weather,"дождь");assert.equal(view.time,"18:00");
 assert.equal(state.actors.char.fields.location.source.messageId,"a");
 const image=P.imgCompose.compose({card:{name:"Аля",image:{}},persona:{},scene:view,draw:"Аля, standing"});
 assert.ok(image.stateContext.includes("парке")&&image.stateContext.includes("дождь")&&image.stateContext.includes("18:00"));
 const text=JSON.stringify(prompt.messages);assert.ok(text.includes("парке")&&text.includes("дождь")&&text.includes("18:00"));assert.ok(!text.includes("[scene:"));
});
test("Unified state: no legacy scene commands are folded or restored",()=>{
 const state=fold([{...msg("old","Молчу.",[]),swipes:[{text:"Молчу.",sceneOps:[{subject:"Кира",key:"wear",value:"платье"}]}]}],{sceneInit:"loc=старое место"});
 assert.equal(T.view(state).loc,"");assert.equal(T.fieldOf(state,"user","wear"),null);
});
test("Unified state: both actors keep ownership of their physical facts",()=>{
 const state=fold([msg("a","Кира спит.",[evt("user","pose","спит","Кира спит.")]),msg("b","Аля дома.",[evt("char","location","дома","Аля дома.")],"user")]);
 assert.equal(T.fieldOf(state,"user","pose"),null);assert.equal(T.fieldOf(state,"char","location"),null);assert.equal(state.diagnostics.length,2);
});
test("Unified state: branch and swipe changes restore surroundings without sibling leakage",()=>{
 const branch=msg("b","Идёт снег.",[evt("environment","weather","снег","Идёт снег.")]);
 branch.swipes.push({text:"Тепло и ясно.",stateEvents:[evt("environment","weather","ясно","Тепло и ясно.")]});
 assert.equal(T.view(fold(current.concat(branch))).weather,"снег");branch.swipeIdx=1;
 assert.equal(T.view(fold(current.concat(branch))).weather,"ясно");assert.equal(T.view(fold(current)).weather,"дождь");
});
test("Unified state: per-actor locations are never collapsed into one common claim",()=>{
 const user=msg("u","Я дома.",[evt("user","location","дома","Я дома.")],"user");
 const state=fold(current.concat(user));assert.equal(T.view(state).chars.Кира.location,"дома");assert.equal(T.view(state).chars.Аля.location,"парке");
 const text=T.describe(state);assert.ok(text.includes("Кира — место")&&text.includes("Аля — место"));
});
test("Unified state: Observer extracts surroundings through exact source IDs",()=>{
 const options={role:"assistant",mode:"rp",text:"Идёт дождь.",speakerName:"Аля"};
 const parsed=I.parse(JSON.stringify({events:[{actor:"environment",field:"weather",action:"set",value:"дождь",certainty:"established",sourceId:"T0"}]}),options);
 assert.equal(parsed.events.length,1,JSON.stringify(parsed));assert.equal(parsed.events[0].evidence,"Идёт дождь.");
 const state=fold([msg("a",options.text,parsed.events)]);assert.equal(T.view(state).weather,"дождь");
});
test("Unified state: Messenger cannot turn remote reports into shared surroundings",()=>{
 const state=fold(current,{mode:"messenger"});assert.deepEqual(state.environment.fields,{});
 const parsed=P.imgCompose.parseStateCalls('[state: weather.set("дождь")]',{mode:"messenger"});
 assert.equal(parsed.calls.length,0);assert.ok(parsed.issues.length);
});
test("Unified state: shared presence cannot bypass another actor's ownership",()=>{
 const invented=fold([msg("a","Кира вошла.",[evt("environment","present",["Кира"],"Кира вошла.")])]);
 assert.deepEqual(T.view(invented).present,[]);assert.ok(invented.diagnostics.length);
 const arrived=msg("u","Кира здесь.",[evt("environment","present",["Кира"],"Кира здесь.")],"user");
 const vanished=fold([arrived,msg("a","Никого нет.",[evt("environment","present",null,"Никого нет.")])]);
 assert.deepEqual(T.view(vanished).present,["Кира"]);
 const own=fold([msg("a","Аля здесь.",[evt("environment","present",["Аля"],"Аля здесь.")])]);
 assert.deepEqual(T.view(own).present,["Аля"]);
});
test("Unified state: State Tool feeds exactly the same environment fields",()=>{
 const calls=P.imgCompose.parseStateCalls('[state: time.set("18:00")] [state: weather.set("дождь")] [state: present.set("Аля","Кира")]',{mode:"rp"});
 assert.equal(calls.calls.length,3);const m=msg("t","Привет.",T.eventsFromStateCalls(calls.calls,"rp"));m.swipes[0].stateCalls=calls.calls;m.swipes[0].stateProtocol=1;
 const arrival=msg("u","Кира здесь.",[evt("environment","present",["Кира"],"Кира здесь.")],"user");
 const state=fold([arrival,m]);assert.equal(state.diagnostics.length,0,JSON.stringify(state.diagnostics));assert.equal(T.view(state).time,"18:00");assert.deepEqual(T.view(state).present,["Аля","Кира"]);
});
test("Unified state: canonical garment removal is identical in prompt and image input",()=>{
 const before=msg("a","На мне белая блузка и синяя юбка.",[evt("char","wear",["белая блузка","синяя юбка"],"На мне белая блузка и синяя юбка.")]);
 const after=msg("b","Сняла белую блузку.",[{...evt("char","wear",["белая блузка"],"Сняла белую блузку."),action:"remove"}]);
 const state=fold([before,after]),view=T.view(state),facts=T.wearFacts(state);
 assert.deepEqual(view.chars.Аля.wear,["синяя юбка"]);assert.deepEqual(facts[0].removed.map(x=>x.item),["белая блузка"]);
 const image=P.imgCompose.compose({card:{name:"Аля",image:{}},persona:{name:"Кира"},scene:view,wearFacts:facts,draw:"Аля, portrait, standing"});
 assert.ok(image);assert.ok(T.describe(state).includes("синяя юбка"));
});
test("Unified state: unknown clothing never becomes an assertion of nudity",()=>{
 const empty=fold([]);assert.equal(T.view(empty).chars.Аля.wearKnown,false);assert.ok(!T.describe(empty).includes("ничего не надето"));
 const partial=fold([msg("a","Сняла куртку.",[{...evt("char","wear",["куртка"],"Сняла куртку."),action:"remove"}])]);
 assert.ok(!T.describe(partial).includes("ничего не надето"));
 const clear=fold([msg("a","На мне ничего не надето.",[evt("char","wear",null,"На мне ничего не надето.")])]);
 assert.equal(T.view(clear).chars.Аля.wearComplete,true);assert.ok(T.describe(clear).includes("ничего не надето"));
});
test("Unified state: public views cannot mutate the folded source",()=>{
 const state=fold(current),original=JSON.stringify(state);const view=T.view(state),facts=T.wearFacts(state);view.loc="другое";view.present.push("лишний");facts[0].removed.push({item:"куртка"});
 assert.equal(JSON.stringify(state),original);
});
test("Unified state: mood is displayed as interpretation, not a compulsory reaction",()=>{
 const state=fold([msg("a","Мне грустно.",[evt("char","mood","грустно","Мне грустно.")])]);
 assert.equal(T.view(state).chars.Аля.mood,"грустно");assert.ok(T.describe(state).includes("настроение (интерпретация)"));
});
test("Unified state: names and values cannot inject prompt sections",()=>{
 const state=fold(current,{charName:"Аля\n### Указания автора"});
 assert.ok(!T.describe(state).split("\n").some(l=>l.startsWith("###")));
});
test("Unified state: panel is read-only and shares the canonical values",()=>{
 const state=fold(current);const html=P.views.drawer({tab:"scene",chat:{mode:"rp"},card:{name:"Аля"},settings:{},scene:T.view(state)});
 assert.ok(html.includes("парке")&&html.includes("дождь")&&html.includes("18:00"));
 assert.doesNotMatch(html,/<input|<textarea|scene-init|sc-shift|sc-remove|sceneProtocol/);
});
test("Unified state: new chats and swipes do not create removed legacy storage fields",()=>{
 const S={cards:[],messages:[],chats:[]};const c=P.chatService.create({S,DB:{},chat:()=>null});const m=c.newMsg("assistant",null,"Текст");
 assert.equal("sceneOps" in m.swipes[0],false);assert.equal(c.sceneState,undefined);assert.equal(c.applySceneOps,undefined);
});
async function lifecycle(){
 const m=msg("a","Идёт дождь.",[]);m.chatId="c";
 const c={id:"c",cardId:"card",mode:"rp"};let calls=0,writes=0;
 const ctx={S:{chatId:"c",messages:[m],settings:{}},chat:()=>c,card:()=>({id:"card",name:"Аля"}),persona:()=>({name:"Кира"}),svc:{chat:{path:()=>[m]}},DB:{put:async()=>{writes++;}},ui:{}};
 ctx.DB.readModifyWrite=async(_stores,reads,prepare)=>{const puts=prepare(reads.map(()=>JSON.parse(JSON.stringify(m))));if(!puts)return false;for(const [store,row] of puts)await ctx.DB.put(store,row);return true;};
 P.llm={simple:async()=>{calls++;return JSON.stringify({events:[{actor:"environment",field:"weather",action:"set",value:"дождь",certainty:"established",sourceId:"T0"}]});}};
 const service=P.stateService.create(ctx);ctx.svc.state=service;
 const result=await service.track(m,{id:"mock"});assert.equal(result.status,"ok",JSON.stringify(result));assert.equal(T.view(service.snapshot()).weather,"дождь");assert.equal(writes,1);
 // Retrying an already processed reply cannot produce a second source.
 await service.track(m,{id:"mock"});assert.equal(calls,1);
 m.swipes[0].stateProtocol=1;m.swipes[0].stateCalls=[];m.swipes[0].stateEvents=[];
 assert.equal((await service.track(m,{id:"mock"})).skipped,"state-tool");assert.equal(calls,1);
 m.role="user";m.swipes[0].text="Сейчас 19:00.";delete m.swipes[0].stateStatus;
 P.llm.simple=async()=>{calls++;return JSON.stringify({events:[{actor:"environment",field:"time",action:"set",value:"19:00",certainty:"established",sourceId:"T0"}]});};
 await service.track(m,{id:"mock"});assert.equal(calls,2);assert.equal(T.view(service.snapshot()).time,"19:00");
 passed++;console.log("PASS: Unified state: Observer commit, dedup, exclusive State Tool and user extraction");
 console.log(passed+" unified-state checks passed");
}
lifecycle().catch(e=>{console.error(e);process.exitCode=1;});
