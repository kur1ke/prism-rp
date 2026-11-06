'use strict';
const assert=require('node:assert/strict');
require('../js/core/util.js');const P=require('../js/providers/perchance.js');
const names={char:'Аля',user:'Кира'},messages=[{role:'system',content:'FRAME'},{role:'user',content:'Hello'}];
const turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('adapter did not settle')),1000);})]);}finally{clearTimeout(timer);}};
function tracked(){const c=new AbortController(),s=c.signal,add=s.addEventListener.bind(s),remove=s.removeEventListener.bind(s);let listeners=0;
 s.addEventListener=(type,...args)=>{if(type==='abort')listeners++;return add(type,...args);};s.removeEventListener=(type,...args)=>{if(type==='abort')listeners--;return remove(type,...args);};return {c,s,count:()=>listeners};}
async function run(){
 const savedAi=globalThis.ai,savedFetch=globalThis.fetch;let checks=0;
 try{
  {let calls=0;globalThis.ai=()=>{calls++;return Promise.resolve({generatedText:'unexpected'});};const c=new AbortController();c.abort();
   let error;await assert.rejects(bounded(P.chat(names,messages,{signal:c.signal})),e=>{error=e;return e.name==='AbortError';});assert.equal(calls,0,'pre-aborted request launched plugin');assert.equal(error.partial,'');checks++;}
  {let calls=0;globalThis.ai=()=>{calls++;return Promise.resolve({generatedText:'unexpected'});};const t=tracked();
   const pending=P.chat(names,messages,{signal:t.s});t.c.abort();await assert.rejects(bounded(pending),{name:'AbortError'});assert.equal(calls,0);assert.equal(t.count(),0);checks++;}
  for(const stage of ['headers','body']){
   const d=deferred();let calls=0,passedSignal,read=0;
   globalThis.ai=()=>{calls++;return Promise.resolve({generatedText:'unexpected'});};
   globalThis.fetch=(_url,options)=>{passedSignal=options?.signal;return stage==='headers'?d.promise:Promise.resolve({ok:true,blob:()=>{read++;return d.promise;}});};
   const t=tracked(),pending=P.chat(names,messages,{signal:t.s,imageDataUrl:'data:image/png;base64,AA=='});
   await turn();t.c.abort();await assert.rejects(bounded(pending),{name:'AbortError'});assert.equal(passedSignal,t.s);
   if(stage==='headers')d.resolve({ok:true,blob:()=>{read++;return Promise.resolve(new Blob());}});else d.resolve(new Blob());
   await turn();assert.equal(calls,0);assert.equal(t.count(),0);checks++;
  }
  for(const stage of ['headers','body']){
   const t=tracked();let starts=0;globalThis.ai=()=>{starts++;return Promise.resolve({generatedText:'unexpected'});};
   globalThis.fetch=()=>stage==='headers'?Promise.reject(Error('fixture attachment error')):Promise.resolve({ok:true,blob:()=>Promise.reject(Error('fixture attachment error'))});
   await assert.rejects(P.chat(names,messages,{signal:t.s,imageDataUrl:'data:image/png;base64,AA=='}),/fixture attachment error/);
   assert.equal(starts,0);assert.equal(t.count(),0);checks++;
  }
  {const t=tracked(),blob=new Blob(['image']);let attachment;
   globalThis.fetch=()=>Promise.resolve({ok:true,blob:()=>Promise.resolve(blob)});
   globalThis.ai=r=>{attachment=r.instruction();return Promise.resolve({generatedText:'With image'});};
   assert.equal((await P.chat(names,messages,{signal:t.s,imageDataUrl:'data:image/png;base64,AA=='})).text,'With image');
   assert.equal(attachment[1],blob);assert.equal(t.count(),0);checks++;
  }
  {const t=tracked(),d=deferred();let stop=0;
   globalThis.ai=()=>{t.c.abort();d.promise.stop=()=>{stop++;};return d.promise;};
   await assert.rejects(bounded(P.chat(names,messages,{signal:t.s})),{name:'AbortError'});assert.equal(stop,1);assert.equal(t.count(),0);d.resolve({generatedText:'late'});await turn();checks++;}
  for(const late of ['resolve','reject']){
   const t=tracked(),d=deferred(),chunks=[];let request,stop=0;
   globalThis.ai=r=>{request=r;d.promise.stop=()=>{stop++;r.onChunk({textChunk:'STOP_LEAK'});};r.onChunk({textChunk:'  Partial'});return d.promise;};
   const pending=P.chat(names,messages,{signal:t.s,onDelta:d=>chunks.push(d.text)});await turn();t.c.abort();
   await assert.rejects(bounded(pending),e=>e.name==='AbortError'&&e.partial==='Partial');
   request.onChunk({textChunk:'LATE_LEAK'});if(late==='resolve')d.resolve({generatedText:'late success'});else d.reject(Error('late failure'));
   await turn();assert.deepEqual(chunks,['Partial']);assert.equal(stop,1);assert.equal(t.count(),0);checks++;
  }
  {const t=tracked(),d=deferred();globalThis.ai=()=>d.promise;const pending=P.chat(names,messages,{signal:t.s});await turn();t.c.abort();await assert.rejects(bounded(pending),{name:'AbortError'});assert.equal(t.count(),0);checks++;}
  for(const kind of ['success','throw','reject']){
   const t=tracked();let stopped=0;
   globalThis.ai=r=>{if(kind==='throw')throw Error('fixture launch error');if(kind==='reject')return Promise.reject(Error('fixture plugin error'));
    r.onChunk({isFromStartWith:true,textChunk:'Аля:'});r.onChunk({textChunk:'  Body'});const p=Promise.resolve({generatedText:'Аля: Body'});p.stop=()=>stopped++;return p;};
   const pending=P.chat(names,messages,{signal:t.s,outputFormat:'message-body'});
   if(kind==='success')assert.equal((await pending).text,'Body');else await assert.rejects(pending,/fixture/);
   assert.equal(t.count(),0);t.c.abort();assert.equal(stopped,0);checks++;
  }
  {const t=tracked(),d=deferred();globalThis.ai=()=>{d.promise.stop=()=>{throw Error('stop failed');};return d.promise;};const pending=P.chat(names,messages,{signal:t.s});await turn();t.c.abort();await assert.rejects(bounded(pending),{name:'AbortError'});checks++;}
  {const first=tracked(),second=tracked(),a=deferred(),b=deferred();let count=0,stops=0;globalThis.ai=()=>{const d=++count===1?a:b;d.promise.stop=()=>stops++;return d.promise;};
   const one=P.chat(names,messages,{signal:first.s}),two=P.chat(names,messages,{signal:second.s});await turn();first.c.abort();await assert.rejects(bounded(one),{name:'AbortError'});b.resolve({generatedText:'Second'});assert.equal((await two).text,'Second');assert.equal(stops,1);checks++;}
  {const t=tracked(),d=deferred();globalThis.ai=r=>{r.onChunk({textChunk:'Reply\nКира: not character'});return d.promise;};const pending=P.chat(names,messages,{signal:t.s});await turn();t.c.abort();await assert.rejects(bounded(pending),e=>e.name==='AbortError'&&e.partial==='Reply');checks++;}
  globalThis.ai=()=>Promise.resolve({generatedText:'Retry'});assert.equal((await P.chat(names,messages)).text,'Retry');checks++;
  console.log(checks+' Perchance abort lifecycle checks PASS');
 }finally{globalThis.ai=savedAi;globalThis.fetch=savedFetch;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
