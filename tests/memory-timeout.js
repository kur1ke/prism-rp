"use strict";
const assert=require('node:assert/strict');
const {harness,message,extraction,changed,unchanged,setModel}=require('./memory-autonomy.js');
const P=globalThis.PRP,M=P.memoryCycle;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Memory FIFO still blocked')),1000)})]);}finally{clearTimeout(timer);}}
const data=messages=>JSON.parse(messages[1].content);
const response=payload=>payload.sources?{text:extraction(payload.sources.at(-1).messageId,payload.sources.at(-1).text)}:{text:JSON.stringify({change:'changed',perspective:'Персонаж осмысливает: '+(payload.memories?.[0]?.event||'общий опыт всех событий.')})};
async function extractionQueue(lateReject=false){
 const h=harness();h.ctx.memoryTimeoutMs=20;const a=message('a','Персонаж пришёл в парк.'),b=message('b','Персонаж получил подарок.','a');h.path.push(a);
 const old=deferred(),next=deferred();let calls=0,signal;
 setModel(async(_,messages,opts)=>{const payload=data(messages);if(!payload.sources)return {text:unchanged};
  if(++calls===1){signal=opts.signal;return old.promise;}return next.promise;});
 const first=h.memory.observe(a,h.model);h.path.push(b);const second=h.memory.observe(b,h.model);
 assert.equal((await bounded(first)).status,'extract-timeout');assert.equal(signal.aborted,true);
 assert.equal(h.storage.memories.size,0);assert.equal(h.storage.memorySources.size,0);
 if(lateReject)old.reject(Error('late provider rejection'));else old.resolve({text:extraction('a','Персонаж пришёл в парк.')});
 await flush();assert.equal(h.storage.memories.size,0);assert.equal(h.storage.memorySources.size,0);
 next.resolve({text:extraction('b',b.swipes[0].text)});assert.equal((await bounded(second)).status,'remembered-unchanged');
 assert.equal(h.storage.memories.size,1);assert.equal(h.storage.memorySources.size,2);assert.equal(calls,2);
 assert.equal((await bounded(h.memory.observe(b,h.model))).status,'no-unprocessed-source');
}
async function seed(h,count,batches=0){
 for(let i=0;i<count;i++)h.path.push(message('seed'+i,'Персонаж получил письмо номер '+i+'.',i?'seed'+(i-1):null));
 const path=M.pathSnapshot(h.path);
 for(const [i,src]of path.entries())h.storage.memories.set('mem'+i,{id:'mem'+i,chatId:'ch',owner:'owner',createdAt:i,event:'Персонаж получил письмо номер '+i,quote:src.text,kind:'observed',source:{messageId:src.id,swipeIdx:0,textHash:src.textHash,prefixHash:src.prefixHash}});
 for(let i=0;i<batches;i++){const plan=M.checkpointPlan([...h.storage.memories.values()],[...h.storage.reflections.values()],path,'ch','owner');
  h.storage.reflections.set(plan.id,{id:plan.id,kind:'batch',schema:1,chatId:'ch',owner:'owner',anchor:plan.anchor,memoryIds:plan.memoryIds,change:'changed',perspective:'Ранее сформированный опыт пакета '+i,createdAt:i});}
 await h.memory.load('ch');
}
async function laterPhase(stage){
 const h=harness();h.ctx.memoryTimeoutMs=20;
 if(stage==='batch')await seed(h,9);if(stage==='integrate')await seed(h,99,9);
 const a=message('new','Персонаж назначил встречу у маяка.',h.path.at(-1)?.id);h.path.push(a);
 const old=deferred();let delayed=false,signal;
 const target=stage==='reflect'?M.REFLECT_SYSTEM:stage==='batch'?M.BATCH_SYSTEM:M.INTEGRATE_SYSTEM;
 setModel(async(_,messages,opts)=>{const payload=data(messages);
  if(messages[0].content===target&&!delayed){delayed=true;signal=opts.signal;return old.promise;}return response(payload);});
 assert.equal((await bounded(h.memory.observe(a,h.model))).status,stage+'-timeout');assert.equal(signal.aborted,true);
 assert.equal(h.storage.memorySources.size,1);assert.equal(h.storage.memories.size,stage==='reflect'?1:stage==='batch'?10:100);
 assert.equal([...h.storage.reflections.values()].filter(x=>x.kind===(stage==='integrate'?'integrated':'batch')).length,0);
 if(stage==='integrate')assert.equal([...h.storage.reflections.values()].filter(x=>x.kind==='batch').length,10);
 if(stage==='reflect')assert.equal(h.storage.reflections.size,0);
 else assert.ok([...h.storage.reflections.values()].some(x=>!x.kind),'successful current Reflection must survive');
 const b=message('next','Персонаж вернулся домой после встречи.','new');h.path.push(b);
 assert.equal((await bounded(h.memory.observe(b,h.model))).status,'reflected');
 const after=JSON.stringify({stores:Object.fromEntries(Object.entries(h.storage).map(([k,v])=>[k,[...v]])),S:h.S});
 old.resolve({text:JSON.stringify({change:'changed',perspective:'ЗАПОЗДАЛЫЙ результат не должен попасть в сохранения.'})});await flush();
 assert.equal(JSON.stringify({stores:Object.fromEntries(Object.entries(h.storage).map(([k,v])=>[k,[...v]])),S:h.S}),after);
 if(stage==='batch')assert.equal([...h.storage.reflections.values()].filter(x=>x.kind==='batch').length,1);
 if(stage==='integrate')assert.equal([...h.storage.reflections.values()].filter(x=>x.kind==='integrated').length,1);
}
async function abortAwareAndCleanup(){
 const h=harness();h.ctx.memoryTimeoutMs=20;const a=message('a','Персонаж пришёл домой.');h.path.push(a);
 setModel((_,messages,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})));
 assert.equal((await bounded(h.memory.observe(a,h.model))).status,'extract-timeout');assert.equal(h.storage.memorySources.size,0);
 const signals=[];setModel(async(_,messages,opts)=>{signals.push(opts.signal);return response(data(messages));});
 assert.equal((await bounded(h.memory.observe(a,h.model))).status,'reflected');
 await new Promise(r=>setTimeout(r,30));assert.ok(signals.every(signal=>!signal.aborted),'completed request timers must be cleared');
 assert.equal(P.memoryService.REQUEST_TIMEOUT_MS,40000);
}
async function run(){
 const unhandled=[];const handler=e=>unhandled.push(e);process.on('unhandledRejection',handler);
 try{
  await extractionQueue();await extractionQueue(true);await abortAwareAndCleanup();
  for(const phase of ['reflect','batch','integrate'])await laterPhase(phase);
  assert.deepEqual(unhandled,[]);
  console.log('6 Memory timeout/FIFO groups passed');
 }finally{process.removeListener('unhandledRejection',handler);}
}
run().catch(e=>{console.error(e);process.exitCode=1});
