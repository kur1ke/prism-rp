'use strict';
const assert=require('node:assert/strict');
require('../js/core/util.js');require('../js/core/settings.js');require('../js/providers/simple-request.js');
require('../js/images/visual-plan.js');require('../js/images/compose.js');require('../js/images/compile.js');
const P=globalThis.PRP;let answer;P.llm={simple:(...args)=>answer(...args)};require('../js/images/service.js');
const turn=()=>new Promise(r=>setImmediate(r));
(async()=>{let checks=0;
 for(const kind of ['openai','perchance']){
  const model={id:'processing',kind},rp={id:'rp',kind:kind==='openai'?'perchance':'openai'},windows=[],calls=[],S={settings:P.settings.merge(null)};
  let limit=256;const ctx={S,DB:{},ui:{},provider:()=>rp,processingProvider:()=>model,contextTokens:p=>{windows.push(p.id);return p.id===model.id?limit:32000;},imageTranslateTimeoutMs:15};
  const svc=P.imageService.create(ctx);answer=async(...args)=>{calls.push(args);return 'OK';};
  const big='Full scene: '.repeat(1500);
  await assert.rejects(svc.textGen(big),e=>e.code==='CONTEXT_OVERFLOW'&&e.budget.overflow);
  assert.equal(calls.length,0,'overflow reached text provider');assert.deepEqual(windows,['processing']);checks++;
  const text='FULL "scene"\nwithout truncation',expected=P.simpleRequest.prepare(model,text,{maxTokens:400});
  limit=expected.inputTokens+expected.reserveTokens;
  assert.equal(await svc.textGen(text),'OK');assert.equal(calls[0][1],text);assert.equal(calls[0][0],model);assert.equal(calls[0][2].maxTokens,400);assert.equal(calls[0][2].signal.aborted,false);checks++;
  calls.length=0;limit--;await assert.rejects(svc.textGen(text),{code:'CONTEXT_OVERFLOW'});assert.equal(calls.length,0);checks++;
  for(const invalid of [0,-1,NaN,Infinity,undefined]){limit=invalid;await assert.rejects(svc.textGen(text),e=>e.code==='CONTEXT_OVERFLOW'&&e.budget.invalidContext);assert.equal(calls.length,0);checks++;}
  limit=32000;let release,signal;answer=(_p,_i,o)=>{signal=o.signal;return new Promise(r=>release=r);};
  await assert.rejects(svc.textGen(text),{code:'IMAGE_TRANSLATION_TIMEOUT'});assert.equal(signal.aborted,true);release('LATE');await turn();checks++;
  answer=async()=> 'RETRY';assert.equal(await svc.textGen(text),'RETRY');checks++;
  ctx.processingProvider=()=>rp;answer=async(p)=>{assert.equal(p,model);return 'SNAPSHOT';};assert.equal(await svc.textGen(text,model),'SNAPSHOT');checks++;
  delete ctx.contextTokens;S.settings.contextTokens=0;await assert.rejects(svc.textGen(text),{code:'CONTEXT_OVERFLOW'});checks++;

 }
 for(const code of ['CONTEXT_OVERFLOW','IMAGE_TRANSLATION_TIMEOUT']){
  P.imgCompile.clear();await assert.rejects(P.imgCompile.compile('Персонаж смотрит в окно.',{},async()=>{throw Object.assign(Error('bounded request failed'),{code});}),{code});checks++;
 }
 require('../js/providers/openai.js');require('../js/providers/perchance.js');require('../js/providers/router.js');
 const originalFetch=globalThis.fetch,originalAi=globalThis.ai;
 try{
  for(const kind of ['openai','perchance']){
   const p={id:kind,kind,baseUrl:'https://fixture.invalid/v1'},c=new AbortController(),text='  RAW [literal] {data}\n';let seen;
   globalThis.fetch=async(_url,o)=>{seen={signal:o.signal,body:JSON.parse(o.body)};return new Response(JSON.stringify({choices:[{message:{content:'  RAW RESULT\n'}}]}),{headers:{'Content-Type':'application/json'}});};
   globalThis.ai=request=>{seen={instruction:request.instruction(),request};return Promise.resolve({generatedText:'  RAW RESULT\n'});};
   assert.equal(await P.llm.simple(p,text,{maxTokens:400,signal:c.signal}),'  RAW RESULT\n');
   if(kind==='openai'){assert.equal(seen.signal,c.signal);assert.deepEqual(seen.body.messages,P.simpleRequest.prepare(p,text,{maxTokens:400}).messages);assert.equal(seen.body.max_tokens,400);}
   else{assert.equal(seen.instruction,text);assert.equal(seen.request.startWith,undefined);assert.equal(seen.request.stopSequences,undefined);}
   checks++;
   let stopped=0,release;
   globalThis.fetch=(_url,o)=>new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
   globalThis.ai=()=>{const promise=new Promise(r=>release=r);promise.stop=()=>stopped++;return promise;};
   const pending=P.llm.simple(p,text,{signal:c.signal});await turn();c.abort();await assert.rejects(pending,{name:'AbortError'});
   if(kind==='perchance'){assert.equal(stopped,1);release({generatedText:'late'});await turn();}checks++;
  }
  const canceled=new AbortController();canceled.abort();let starts=0;globalThis.ai=()=>{starts++;return Promise.resolve({generatedText:'wrong'});};
  await assert.rejects(P.llm.simple({kind:'perchance'},'text',{signal:canceled.signal}),{name:'AbortError'});assert.equal(starts,0);checks++;
 }finally{globalThis.fetch=originalFetch;globalThis.ai=originalAi;}
 console.log(checks+' image translation preflight/timeout checks PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
