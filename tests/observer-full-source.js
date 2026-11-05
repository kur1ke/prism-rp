"use strict";
const assert=require('node:assert/strict');
require('../js/state/evidence-spans.js');
const {harness}=require('./observer-budget.js'),P=globalThis.PRP,ES=P.evidenceSpans;
const tail='Идёт дождь.';
const longText='Длинное вступление без событий. '.repeat(170)+tail;
async function run(){
 let checks=0;
 for(const mode of ['rp','messenger'])for(const role of ['user','assistant'])for(const kind of ['openai','perchance']){
  const text=mode==='messenger'?longText.replace(tail,'Я дома.'):longText,h=harness(32000,kind,role,mode);h.msg.swipes[0].text=text;
  let calls=0;
  P.llm.simple=async(_,instruction)=>{calls++;const last=mode==='messenger'?'Я дома.':tail;
   assert.ok(instruction.includes(last),'tail absent from instruction');
   const row=ES.catalog({text}).find(x=>x.text===last);assert.ok(row,'tail absent from citation catalog');
   return JSON.stringify({events:[mode==='rp'?{actor:'environment',field:'weather',action:'set',value:'дождь',certainty:'established',sourceId:row.id}:
     {actor:role==='user'?'user':'char',field:'location',action:'set',value:'дома',certainty:'reported',sourceId:row.id}]});
  };
  const r=await h.service.track(h.msg,h.provider);assert.equal(r.status,'ok');assert.equal(r.events.length,1);
  assert.ok(r.events[0].sourceSpan.start>4500);assert.equal(h.msg.swipes[0].stateStatus.analysedTextChars,h.msg.swipes[0].text.length);
  const snap=h.service.snapshot();assert.equal(mode==='rp'?snap.environment.fields.weather.value:snap.actors[role==='user'?'user':'char'].fields.location.value,mode==='rp'?'дождь':'дома');
  assert.equal((await h.service.track(h.msg,h.provider)).skipped,'already-processed');assert.equal(calls,1);checks++;
 }
 const dense='Слова. '.repeat(110)+'Я дома.',rows=ES.catalog({text:dense});assert.equal(rows.length,111);assert.equal(rows.at(-1).id,'T110');
 assert.equal(ES.resolve('T110',{text:dense}).evidence,'Я дома.');checks++;
 for(const length of [4499,4500,4501]){
  const h=harness(32000);h.msg.swipes[0].text='x'.repeat(length);
  h.msg.swipes[0].stateStatus={status:'no-changes',sourceText:h.msg.swipes[0].text,sourceDraw:''};
  let calls=0;P.llm.simple=async()=>{calls++;return JSON.stringify({events:[]});};
  const r=await h.service.track(h.msg,h.provider);assert.equal(calls,length<=4500?0:1);
  assert.equal(length<=4500?r.skipped:r.status,length<=4500?'already-processed':'no-changes');checks++;
 }
 {
  const h=harness(1024);h.msg.swipes[0].text=longText;const before=JSON.stringify(h.msg);
  assert.equal((await h.service.track(h.msg,h.provider)).status,'overflow');assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);assert.equal(JSON.stringify(h.msg),before);
  h.setLimit(32000);P.llm.simple=async()=>JSON.stringify({events:[]});assert.equal((await h.service.track(h.msg,h.provider)).status,'no-changes');checks++;
 }
 {
  const h=harness(32000,'openai','user');const text='Слова. '.repeat(110)+'Я дома.';h.msg.swipes[0].text=text;
  let calls=0;P.llm.simple=async()=>{calls++;return JSON.stringify({events:[{actor:'user',field:'location',action:'set',value:'дома',certainty:'reported',sourceId:'T110'}]});};
  h.S.messages=[];const prepared=h.service.prepareUser(text,h.provider);assert.ok(prepared);assert.equal(prepared.options.text,text);h.S.messages=[h.msg];
  assert.equal((await h.service.track(h.msg,h.provider,{prepared})).status,'ok');assert.equal(calls,1);checks++;
 }
 {
  const h=harness(32000);h.msg.swipes[0].text=dense;h.msg.swipes[0].stateStatus={status:'no-changes',sourceText:dense,sourceDraw:''};
  let calls=0;P.llm.simple=async()=>{calls++;return JSON.stringify({events:[]});};
  assert.equal((await h.service.track(h.msg,h.provider)).status,'ok');assert.equal(calls,1);checks++;
 }
 {
  const h=harness(32000,'openai','user');h.msg.swipes[0].text='Слова. '.repeat(800)+'Я дома.';
  let calls=0;P.llm.simple=async()=>{calls++;throw Error('model failed');};
  const failed=await h.service.track(h.msg,h.provider);assert.equal(failed.status,'partial');assert.equal(h.msg.swipes[0].stateStatus.analysedTextChars,null);
  P.llm.simple=async()=>{calls++;return JSON.stringify({events:[]});};
  const retried=await h.service.track(h.msg,h.provider);assert.equal(retried.status,'ok');assert.equal(calls,2);
  assert.equal(h.msg.swipes[0].stateStatus.analysedTextChars,h.msg.swipes[0].text.length);checks++;
 }
 {
  const h=harness(1024);h.msg.swipes[0].text=longText;h.msg.swipes[0].stateStatus={status:'no-changes',sourceText:longText,sourceDraw:'',analysedTextChars:4500};
  const before=JSON.stringify(h.msg);assert.equal((await h.service.track(h.msg,h.provider)).status,'overflow');assert.equal(JSON.stringify(h.msg),before);assert.equal(h.writes.length,0);
  h.setLimit(32000);P.llm.simple=async()=>JSON.stringify({events:[]});assert.equal((await h.service.track(h.msg,h.provider)).status,'no-changes');
  assert.equal(h.msg.swipes[0].stateStatus.analysedTextChars,longText.length);checks++;
 }
 {
  const h=harness(32000,'openai','user');h.S.messages=[];const prefix='Длинное вступление без событий. '.repeat(170),old=prefix+'Я дома.',fresh=prefix+'Я в парке.';
  let calls=0;P.llm.simple=async(_,instruction)=>{calls++;const isNew=instruction.includes('Я в парке.');return JSON.stringify({events:[{actor:'user',field:'location',action:'set',value:isNew?'парке':'дома',certainty:'reported',sourceId:ES.catalog({text:isNew?fresh:old}).at(-1).id}]});};
  const prepared=h.service.prepareUser(old,h.provider);h.msg.swipes[0].text=fresh;h.S.messages=[h.msg];
  const result=await h.service.track(h.msg,h.provider,{prepared});assert.equal(result.status,'ok');assert.equal(calls,2);assert.equal(result.events[0].value,'парке');checks++;
 }
 console.log(checks+' full-source Observer checks passed');
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
