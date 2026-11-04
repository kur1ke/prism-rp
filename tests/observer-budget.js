"use strict";
const assert=require("node:assert/strict");
require("../js/core/util.js");require("../js/prism/data.js");require("../js/chat/tree.js");
require("../js/state/tracker.js");require("../js/state/interpreter.js");require("../js/state/wear-inquiry.js");
require("../js/state/service.js");
const P=globalThis.PRP;
function harness(limit=1024,kind="openai",role="assistant",mode="rp"){
 const provider={id:"processing",kind},rp={id:"rp",kind:kind==="openai"?"perchance":"openai"};
 const msg={id:"m",chatId:"c",role,swipeIdx:0,swipes:[{text:"Идёт дождь."}]},
  chat={id:"c",cardId:"card",mode},S={chatId:"c",cardId:"card",settings:{},messages:[msg]},
  writes=[],calls=[],windows=[],notices=[];
 const ctx={S,chat:()=>chat,card:()=>({id:"card",name:"Аля"}),persona:()=>({name:"Кира"}),
  provider:()=>rp,processingProvider:()=>provider,contextTokens:p=>{windows.push(p?.id);return p?.id===provider.id?limit:32000;},
  DB:{put:async(st,row)=>writes.push([st,JSON.parse(JSON.stringify(row))])},
  svc:{chat:{path:()=>S.messages}},ui:{toast:(...x)=>notices.push(x)}};
 P.llm={simple:async(p,instruction,options)=>{calls.push({p,instruction,options});return JSON.stringify({events:[{
  actor:"environment",field:"weather",action:"set",value:"дождь",certainty:"established",sourceId:"T0"}]});}};
 const service=P.stateService.create(ctx);ctx.svc.state=service;
 return {S,msg,chat,ctx,service,provider,rp,writes,calls,windows,notices,setLimit:v=>{limit=v;}};
}
async function run(){
 let checks=0;
 for(const kind of ["openai","perchance"]){
  const h=harness(1024,kind),before=JSON.stringify(h.msg);
  const r=await h.service.track(h.msg,h.provider);
  assert.equal(h.calls.length,0,"overflow must not call the Observer");
  assert.equal(r.status,"overflow");assert.equal(h.writes.length,0);
  assert.equal(JSON.stringify(h.msg),before,"overflow must not create fallback facts/status receipts");
  assert.equal(h.service.pending("c"),0);assert.equal(h.S.tracking,false);
  assert.ok(h.windows.includes("processing"),"use actual processing provider window");
  assert.ok(r.budget.inputTokens+650>1024);
  h.setLimit(32000);
  assert.equal((await h.service.track(h.msg,h.provider)).status,"ok");
  assert.equal(h.calls.length,1);assert.equal(h.writes.length,1);
  checks++;
 }
 const ref=harness(32000);
 const normal=await ref.service.track(ref.msg,ref.provider);
 assert.equal(normal.status,"ok");
 const instruction=ref.calls[0].instruction;
 for(const kind of ["openai","perchance"]){
  const cost=P.util.estimateTokens(instruction)+(kind==="openai"?4:0);
  for(const delta of [-1,0,1]){
   const h=harness(cost+650+delta,kind),r=await h.service.track(h.msg,h.provider);
   assert.equal(h.calls.length,delta<0?0:1);
   assert.equal(r.status,delta<0?"overflow":"ok");
   checks++;
  }
 }
 for(const limit of [0,-1,NaN,Infinity]){
  const h=harness(limit);const r=await h.service.track(h.msg,h.provider);
  assert.equal(h.calls.length,0);assert.equal(r.status,"overflow");assert.equal(h.writes.length,0);checks++;
 }
 const enlarged=harness(P.util.estimateTokens(instruction)+4+650);
 enlarged.S.messages=Array.from({length:5},(_,i)=>({id:"prior"+i,chatId:"c",role:"assistant",swipeIdx:0,
  swipes:[{text:'"\\\n'.repeat(200)}]})).concat(enlarged.msg);
 const full=await enlarged.service.track(enlarged.msg,enlarged.provider);
 assert.equal(full.status,"overflow");assert.equal(enlarged.calls.length,0);
 assert.ok(full.budget.inputTokens>P.util.estimateTokens(instruction)+4);
 assert.equal(enlarged.writes.length,0);checks++;
 for(const role of ["user","assistant"]){
  const h=harness(1024,"openai",role);
  h.msg.swipes[0].text="Я снимаю куртку.";
  const r=await h.service.track(h.msg,h.provider);
  assert.equal(r.status,"overflow");assert.equal(h.calls.length,0);
  assert.ok(!h.msg.swipes[0].stateEvents);checks++;
 }
 const early=harness(1024,"openai","user");early.msg.swipes[0].text="Я дома.";
 const prepared=early.service.prepareUser("Я дома.",early.provider);
 assert.ok(prepared);
 assert.equal((await prepared.promise).overflow,true);
 assert.equal((await early.service.track(early.msg,early.provider,{prepared})).status,"overflow");
 assert.equal(early.calls.length,0);assert.equal(early.writes.length,0);checks++;
 const retained=harness(32000);
 await retained.service.track(retained.msg,retained.provider);
 const saved=JSON.stringify(retained.msg),savedWrites=retained.writes.length;
 retained.setLimit(1024);
 assert.equal((await retained.service.track(retained.msg,retained.provider,{force:true})).status,"overflow");
 assert.equal(JSON.stringify(retained.msg),saved);assert.equal(retained.writes.length,savedWrites);checks++;
 for(const rpLimit of [1,32000]){
  const initial=harness(1024,"openai","assistant","messenger");
  initial.S.messages=[];
  initial.ctx.contextTokens=p=>p?.id===initial.rp.id?rpLimit:32000;
  let called=0;
  P.llm.simple=async p=>{assert.equal(p.id,initial.rp.id);called++;return JSON.stringify({wear:{worn:["футболка"]}});};
  const r=await initial.service.initializeOutfit(initial.rp,{timeZone:"UTC"});
  assert.equal(r.status,rpLimit===1?"overflow":"ok");
  assert.equal(called,rpLimit===1?0:1);
  assert.equal(initial.writes.length,rpLimit===1?0:1);checks++;
 }
 const fs=require("node:fs"),vm=require("node:vm"),SIMPLE=require("../js/providers/simple-request.js");
 let captured;
 const namespace={simpleRequest:SIMPLE,
  perchance:{simple:async instruction=>{captured={instruction};return "ok";}},
  openai:{chat:async(_p,messages,sampler)=>{captured={messages,sampler};return {text:"ok"};},splitThink:text=>({text})}};
 vm.runInNewContext(fs.readFileSync(require.resolve("../js/providers/router.js"),"utf8"),{window:{PRP:namespace}});
 for(const kind of ["openai","perchance"]){
  for(const maxTokens of [undefined,0,-1,1,450,650,2000,Infinity]){
   const p={kind},text='FULL "instruction"\n',opts={maxTokens},expected=SIMPLE.prepare(p,text,opts);
   await namespace.llm.simple(p,text,opts);
   if(kind==="openai"){
    assert.deepEqual(captured.messages,expected.messages);
    assert.equal(captured.sampler.max_tokens,expected.reserveTokens);
   }else assert.equal(captured.instruction,expected.instruction);
   const b=SIMPLE.budget(p,text,opts,expected.inputTokens+expected.reserveTokens);
   assert.equal(b.fits,true);checks++;
  }
 }
 console.log(checks+" Observer budget/service checks passed");
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run,harness};
