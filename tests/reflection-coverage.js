'use strict';
const assert=require('node:assert/strict');
const H=require('./memory-autonomy.js'),M=globalThis.PRP.memoryCycle;
(async()=>{
 const h=H.harness(),payloads=[];let fail=false,unchanged=false;
 H.setModel(async(_,messages)=>{
  const p=JSON.parse(messages[1].content);
  if(p.sources){const s=p.sources.at(-1);return {text:H.extraction(s.messageId,s.text)};}
  payloads.push(p);if(fail)throw Error('fixture reflection failure');
  return {text:unchanged?H.unchanged:JSON.stringify({change:'changed',perspective:'Собственное восприятие после эпизода '+payloads.length+'.'})};
 });
 const add=async(id)=>{const m=H.message(id,'Встреча и новая деталь номер '+id+'.',h.path.at(-1)?.id);h.path.push(m);return h.memory.observe(m,h.model);};
 assert.equal((await add('a')).status,'reflected');
 unchanged=true;assert.equal((await add('b')).status,'remembered-unchanged');
 assert.deepEqual(payloads[1].memories.map(m=>m.source),['b']);
 assert.deepEqual(payloads[1].previouslyReflectedMemories.map(m=>m.source),['a']);
 assert.equal(payloads[1].previouslyReflectedMemories[0].recency,0.9);
 const prior=h.memory.experience().perspective;
 assert.equal(h.storage.reflections.size,2);assert.equal(h.memory.experience().perspective,prior);
 // Durable assessment survives recreated session state, without becoming Experience.
 h.S.reflections=[];h.S.memories=[];await h.memory.load('ch');
 fail=true;assert.equal((await add('c')).status,'reflect-error');
 assert.equal(h.storage.reflections.size,2);
 fail=false;unchanged=false;assert.equal((await add('d')).status,'reflected');
 assert.deepEqual(payloads.at(-1).memories.map(m=>m.source),['d','c']);
 assert.deepEqual(payloads.at(-1).previouslyReflectedMemories.map(m=>m.source),['b','a']);
 const snapshots=M.pathSnapshot(h.path),mem=[...h.storage.memories.values()],refs=[...h.storage.reflections.values()];
 assert.equal(M.reflectionEvidence(mem,refs,snapshots,'ch','owner').fresh.length,0);
 assert.equal(M.reflectionEvidence(mem,refs.map(r=>({...r,owner:'other'})),snapshots,'ch','owner').fresh.length,4);
 // A failed final put cannot claim coverage or replace current Experience.
 const put=h.DB.put;h.DB.put=async()=>{throw Error('fixture storage failure');};
 assert.equal((await add('e')).status,'error');h.DB.put=put;
 assert.equal(M.reflectionEvidence([...h.storage.memories.values()],[...h.storage.reflections.values()],M.pathSnapshot(h.path),'ch','owner').fresh.length,1);
 const branch=h.path.at(-1);branch.swipes.push({text:'Новый вариант разговора.'});branch.swipeIdx=1;
 assert.ok(!h.memory.visibleMemories().some(m=>m.source.messageId==='e'));
 branch.swipeIdx=0;
 assert.equal((await add('f')).status,'reflected');
 assert.deepEqual(payloads.at(-1).memories.map(m=>m.source),['f','e']);

 // Coverage follows the assessment anchor, not merely the older Memory source.
 const old=mem.find(m=>m.source.messageId==='a'),late={id:'late',chatId:'ch',owner:'owner',kind:'assessment',anchor:mem.find(m=>m.source.messageId==='d').source,memoryIds:[old.id]};
 assert.equal(M.reflectionEvidence([old],[late],snapshots.slice(0,1),'ch','owner').fresh.length,1);
 assert.equal(M.reflectionEvidence([old],[late],snapshots,'ch','owner').context.length,1);
 // Included IDs only: omitted budget evidence remains pending.
 const partial={...late,anchor:old.source,memoryIds:[old.id]};
 assert.equal(M.reflectionEvidence(mem,[partial],snapshots,'ch','owner').fresh.length,3);
 // Tight reflection window drops old context before the fresh episode.
 const quote='Встреча и новая деталь номер g.';
 const minimal={mode:'rp',coreGuide:payloads.at(-1).coreGuide,previousExperience:h.memory.experience().perspective,
  memories:[{recency:1,event:'Собеседники обсудили: '+quote,quote,kind:'reported',speaker:'character',source:'g'}],previouslyReflectedMemories:[]};
 const footprint=globalThis.PRP.util.estimateTokens;
 const window=500+220+footprint(M.REFLECT_SYSTEM)+footprint(JSON.stringify(minimal))+3;
 let bounded;
 H.setModel(async(_,messages,options)=>{
  const p=JSON.parse(messages[1].content);
  if(p.sources){h.ctx.contextTokens=()=>window;const src=p.sources.at(-1);return {text:H.extraction(src.messageId,src.text)};}
  bounded=p;assert.ok(footprint(messages[0].content)+footprint(messages[1].content)+options.sampler.max_tokens+220<=window);
  return {text:H.unchanged};
 });
 assert.equal((await add('g')).status,'remembered-unchanged');
 assert.deepEqual(bounded.memories.map(m=>m.source),['g']);
 assert.deepEqual(bounded.previouslyReflectedMemories,[]);

 console.log('PASS: reflection coverage separates fresh/context, unchanged/reload, failed model/write, owner, branch and partial coverage');
})().catch(e=>{console.error(e);process.exitCode=1;});
