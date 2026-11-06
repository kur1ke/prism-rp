'use strict';
const assert=require('node:assert/strict'),O=require('../js/providers/openai.js');
const provider={baseUrl:'https://fixture.invalid/v1',model:'fixture'},messages=[{role:'user',content:'Hello'}],enc=new TextEncoder();
const line=(text,reasoning='',finish=null)=>'data: '+JSON.stringify({choices:[{delta:{content:text,reasoning_content:reasoning},finish_reason:finish}]})+'\n\n';
const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SSE waits after DONE')),1000);})]);}finally{clearTimeout(timer);}};
function fixture(chunks,{closed=false,cancelResult}={}){
 let cancels=0,reads=0,releases=0,controller;
 const stream=new ReadableStream({start(c){controller=c;for(const x of chunks)c.enqueue(typeof x==='string'?enc.encode(x):x);if(closed)c.close();},cancel(){cancels++;return cancelResult;}});
 const get=stream.getReader.bind(stream);stream.getReader=()=>{const r=get(),read=r.read.bind(r),release=r.releaseLock.bind(r);r.read=()=>{reads++;return read();};r.releaseLock=()=>{releases++;return release();};return r;};
 globalThis.fetch=async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
 return {stream,controller,state:()=>({cancels,reads,releases,locked:stream.locked})};
}
async function run(){const original=globalThis.fetch;let checks=0;try{
 {const f=fixture([line('Answer','Thinking','length')+'data: [DONE]\n\n'+line('LATE','LATE')]),deltas=[];
  const out=await bounded(O.chat(provider,messages,{}, {maxAttempts:1,onDelta:d=>deltas.push(d)}));
  assert.deepEqual(out,{text:'Answer',reasoning:'Thinking',finish:'length'});assert.deepEqual(deltas,[{text:'Answer',reasoning:'Thinking'}]);
  assert.deepEqual(f.state(),{cancels:1,reads:1,releases:1,locked:false});checks++;}
 for(let split=1;split<'data: [DONE]\r\n\r\n'.length;split++){
  const marker='data: [DONE]\r\n\r\n',f=fixture([line('A'),marker.slice(0,split),marker.slice(split),line('LATE')]);
  assert.equal((await bounded(O.chat(provider,messages,{}, {maxAttempts:1}))).text,'A');assert.equal(f.state().reads,split>=marker.indexOf("\n")+1?2:3);assert.equal(f.state().locked,false);checks++;
 }
 {const f=fixture(['data: [DONE]\n\n']);assert.deepEqual(await bounded(O.chat(provider,messages,{}, {maxAttempts:1})),{text:'',reasoning:'',finish:null});assert.equal(f.state().cancels,1);checks++;}
 {const bytes=enc.encode(line('Привет 🌍','Мысль')+'data: [DONE]\n\n'),f=fixture([...bytes].map(x=>new Uint8Array([x])));
  assert.deepEqual(await bounded(O.chat(provider,messages,{}, {maxAttempts:1})),{text:'Привет 🌍',reasoning:'Мысль',finish:null});assert.equal(f.state().locked,false);checks++;}
 {const f=fixture([line('EOF')],{closed:true});assert.equal((await O.chat(provider,messages,{}, {maxAttempts:1})).text,'EOF');assert.equal(f.state().releases,1);assert.equal(f.state().cancels,0);checks++;}
 {const f=fixture([line('Final')+'data: [DONE]'],{closed:true});assert.equal((await O.chat(provider,messages,{}, {maxAttempts:1})).text,'Final');assert.equal(f.state().locked,false);checks++;}
 for(const kind of ['reject','pending']){
  const f=fixture([line('Kept')+'data: [DONE]\n\n'],{cancelResult:kind==='reject'?Promise.reject(Error('cancel cleanup error')):new Promise(()=>{})});
  assert.equal((await bounded(O.chat(provider,messages,{}, {maxAttempts:1}))).text,'Kept');assert.equal(f.state().releases,1);checks++;
 }
 {let events=0,ends=0;const p=O.createSSEParser((j,done)=>done?ends++:events++);
  p.push(line('First')+'data: [DONE]\n\n'+line('Late'));p.push(line('Later')+'data: [DONE]\n\n');p.flush();assert.equal(events,1);assert.equal(ends,1);checks++;}
 {const f=fixture([line('Prefix')]);let observed;const pending=O.chat(provider,messages,{}, {maxAttempts:1,onDelta:d=>observed=d.text});
  await new Promise(r=>setImmediate(r));assert.equal(observed,'Prefix');f.controller.error(Error('stream failure'));await assert.rejects(pending,/stream failure/);assert.equal(f.state().locked,false);checks++;}
 {const f=fixture([line('Partial')]),originalFetch=globalThis.fetch,c=new AbortController();
  globalThis.fetch=(url,opts)=>{opts.signal.addEventListener('abort',()=>f.controller.error(new DOMException('Aborted','AbortError')),{once:true});return originalFetch(url,opts);};
  const pending=O.chat(provider,messages,{}, {signal:c.signal,maxAttempts:1});await new Promise(r=>setImmediate(r));c.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.state().locked,false);checks++;}
 {const f=fixture([line('Partial')+'data: [DONE]\n\n']),fetchResponse=globalThis.fetch,c=new AbortController();
  globalThis.fetch=(url,opts)=>{opts.signal.addEventListener('abort',()=>f.controller.error(new DOMException('Aborted','AbortError')),{once:true});return fetchResponse(url,opts);};
  await assert.rejects(O.chat(provider,messages,{}, {signal:c.signal,maxAttempts:1,onDelta:()=>c.abort()}),{name:'AbortError'});assert.equal(f.state().locked,false);checks++;}
 {let requests=0;globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:'JSON',reasoning_content:'Reason'},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}});};
  assert.deepEqual(await O.chat(provider,messages,{},{}),{text:'JSON',reasoning:'Reason',finish:'stop'});assert.equal(requests,1);checks++;}
 {const f=fixture([line('First','','stop'),line('Second')+'data: [DONE]\n\n']);assert.equal((await bounded(O.chat(provider,messages,{},{}))).text,'FirstSecond');assert.equal(f.state().reads,2);checks++;}
 console.log(checks+' OpenAI SSE completion checks PASS');
 }finally{globalThis.fetch=original;}}
run().catch(e=>{console.error(e);process.exitCode=1;});
