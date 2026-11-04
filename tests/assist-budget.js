"use strict";
const assert=require("node:assert/strict");
require("../js/core/util.js");require("../js/core/settings.js");require("../js/chat/tree.js");require("../js/state/tracker.js");
const A=require("../js/assist/assist.js"),OA=require("../js/providers/openai.js"),PC=require("../js/providers/perchance.js");
require("../js/providers/router.js");require("../js/assist/service.js");
const P=globalThis.PRP,clone=v=>JSON.parse(JSON.stringify(v)),tok=P.util.estimateTokens;
const count=messages=>messages.reduce((n,m)=>n+tok(m.content)+4,0);
function harness(kind="openai",context=4096,card){
 const provider={id:"model",kind,label:"Fixture"},a=A.blank({cardId:card?.id||null});
 const S={assist:a,assistList:[],cards:card?[card]:[],chats:[],view:"assist",gen:null,settings:P.settings.merge({})};
 const rows=new Map(),calls=[],notices=[];let writes=0,clears=0;
 const ctx={S,DB:{put:async(_st,row)=>{writes++;rows.set(row.id,clone(row));},byIndex:async()=>[]},
  provider:()=>provider,contextTokens:p=>{assert.equal(p,provider);return context;},persona:()=>({name:"Кира"}),
  ui:{toast:t=>notices.push(t),openSettings(){},rememberUi(){},renderStage(){},scrollBottom(){},paintAssist(){},acceptAssistInput(){clears++;}}};
 OA.chat=async(_p,messages,sampler)=>{
  calls.push({used:count(messages),reserve:sampler.max_tokens,messages});
  assert.ok(count(messages)+sampler.max_tokens<=context);
  return {text:"ANSWER"};
 };
 globalThis.ai=request=>{
  const used=tok(request.instruction())+tok(request.startWith());
  calls.push({used,reserve:S.lastAssistBudget.reserveTokens});
  assert.equal(S.lastAssistBudget.used,used);
  assert.ok(used+S.lastAssistBudget.reserveTokens<=context);
  return Promise.resolve({generatedText:"ANSWER"});
 };
 return {S,ctx,rows,calls,notices,service:P.assistService.create(ctx),setContext:v=>context=v,
  snapshot:()=>JSON.stringify({a:S.assist,rows:[...rows]}),writes:()=>writes,clears:()=>clears};
}
async function run(){
 let checks=0;
 const previousAi=globalThis.ai,previousChat=OA.chat;
 try{
  for(const contextTokens of [1024,4096]){
   const b=A.build({card:{name:"N",description:"d".repeat(30000)},history:[{role:"user",text:"LAST_QUESTION"}],contextTokens,reserveTokens:1500});
   assert.ok(b.report.overflow);assert.ok(!b.report.fits);
   assert.ok(b.messages[0].content.includes("d".repeat(30000)));assert.equal(b.messages.at(-1).content,"LAST_QUESTION");checks++;
  }
  for(const mode of ["messages","perchance"]){
   const inputCost=mode==="perchance"?m=>PC.inputCost({char:"Ассистент",user:"Кира"},m):count;
   const base={system:"SYSTEM",userName:"Кира",history:[{role:"user",text:'"\\nQUESTION'}],reserveTokens:1500,inputCost};
   const full=A.build({...base,contextTokens:8192}),used=inputCost(full.messages);
   for(const delta of [-1,0,1]){
    const b=A.build({...base,contextTokens:used+1500+delta});
    assert.equal(b.report.overflow,delta<0);assert.equal(b.report.used,inputCost(b.messages));checks++;
   }
   const history=Array.from({length:40},(_,i)=>({role:i%2?"assistant":"user",text:"OLD ".repeat(30)})).concat({role:"user",text:"LAST_QUESTION"});
   const b=A.build({system:"SYS",history,chatLines:Array.from({length:20},()=>({name:"N",text:"CHAT ".repeat(100)})),contextTokens:1900,reserveTokens:1500,inputCost});
   assert.ok(!b.report.overflow);assert.ok(b.report.historyKept<history.length);
   assert.ok(b.report.used+1500<=1900);assert.equal(b.messages.at(-1).content,"LAST_QUESTION");checks++;
  }
  for(const contextTokens of [0,-1,NaN,Infinity]){
   assert.equal(A.build({contextTokens,reserveTokens:1500}).report.overflow,true);checks++;
  }
  for(const reserveTokens of [-1,NaN,Infinity,8192]){
   const b=A.build({contextTokens:8192,reserveTokens,history:[{role:"user",text:"Q"}]});
   assert.ok(b.report.overflow);assert.ok(b.report.invalidBudget);checks++;
  }
  for(const kind of ["openai","perchance"]){
   const h=harness(kind,4096,{id:"card",name:"N",description:"d".repeat(30000)});
   const before=h.snapshot();
   assert.equal((await h.service.send("QUESTION")).outcome,"overflow");
   assert.equal(h.snapshot(),before);assert.equal(h.calls.length,0);assert.equal(h.writes(),0);assert.equal(h.clears(),0);assert.equal(h.S.gen,null);checks++;
   h.setContext(32000);h.S.settings.sampler.max_tokens=5000;
   assert.equal((await h.service.send("QUESTION")).outcome,"sent");
   assert.equal(h.calls.length,1);assert.equal(h.calls[0].reserve,5000);
   assert.equal(h.S.lastAssistBudget.reserveTokens,5000);
   assert.deepEqual(h.S.assist.messages.map(m=>m.text),["QUESTION","ANSWER"]);assert.equal(h.S.gen,null);checks++;
   const accepted=h.snapshot();h.setContext(1000);
   const id=h.S.assist.messages.at(-1).id;
   assert.equal((await h.service.generate(id)).outcome,"overflow");
   assert.equal(h.snapshot(),accepted);assert.equal(h.calls.length,1);checks++;
   h.setContext(32000);
   assert.equal((await h.service.generate(id)).outcome,"sent");
   assert.equal(h.calls.length,2);assert.equal(h.S.assist.messages.length,2);
   assert.notEqual(h.S.assist.messages.at(-1).id,id);checks++;
  }
  const actual=harness();actual.S.settings.assistSystem="SYS";actual.S.settings.sampler.max_tokens=4000;
  const prior=actual.snapshot();
  assert.equal((await actual.service.send("q".repeat(1000))).outcome,"overflow");
  assert.equal(actual.snapshot(),prior);assert.equal(actual.calls.length,0);assert.equal(actual.S.lastAssistBudget.reserveTokens,4000);checks++;
  const missing=harness();missing.ctx.provider=()=>null;const unchanged=missing.snapshot();
  assert.equal((await missing.service.send("Q")).outcome,"no-provider");assert.equal(missing.snapshot(),unchanged);
  assert.equal(missing.calls.length,0);assert.equal(missing.writes(),0);checks++;
  const retained=harness("openai",4096);
  const old=Array.from({length:40},(_,i)=>({id:"old"+i,role:i%2?"assistant":"user",text:("OLD_"+i+" ").repeat(100)}));
  retained.S.assist.messages=old.slice();await retained.service.save();
  assert.equal((await retained.service.send("LAST_QUESTION")).outcome,"sent");
  assert.ok(retained.S.lastAssistBudget.historyKept<41);
  assert.deepEqual(retained.S.assist.messages.slice(0,40),old);
  assert.equal(retained.S.assist.messages.length,42);checks++;
  const failed=harness("openai",32000);
  failed.ctx.DB.put=async()=>{throw Error("fixture initial write failure");};
  const beforeFail=failed.snapshot();
  await assert.rejects(failed.service.send("Q"),/fixture initial write failure/);
  assert.equal(failed.snapshot(),beforeFail);assert.equal(failed.calls.length,0);assert.equal(failed.clears(),0);assert.equal(failed.S.gen,null);checks++;
  const parallel=harness("openai",32000);
  parallel.S.assist.ctx.chatId="c";parallel.S.chats=[{id:"c",mode:"messenger",leafId:null}];
  let release;const gate=new Promise(r=>release=r);parallel.ctx.DB.byIndex=async()=>{await gate;return [];};
  const pending=parallel.service.send("ONE");assert.equal((await parallel.service.send("TWO")).outcome,"busy");
  release();await pending;assert.equal(parallel.calls.length,1);
  assert.deepEqual(parallel.S.assist.messages.map(m=>m.text),["ONE","ANSWER"]);checks++;
  console.log(checks+" assistant budget/service checks passed");
 }finally{globalThis.ai=previousAi;OA.chat=previousChat;}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run,harness};
