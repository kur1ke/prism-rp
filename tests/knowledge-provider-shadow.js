/* K1.5: selected existing provider; explicit and bounded requests only. */
"use strict";
const assert=require("assert");
const A=require("../js/knowledge/provider-shadow.js");
(async()=>{
 let called=0;
 const provider={kind:"custom",model:"test"};
 const llm={simple:async(p,instruction,opts)=>{
   called++;assert.equal(p,provider);
   assert.ok(instruction.includes("CONTEXT_DATA_JSON"));
   assert.equal(opts.maxTokens,800);
   return JSON.stringify({assertions:[],links:[],unresolved:[]});
 }};
 const msg={id:"m1",chatId:"c1",role:"assistant",swipeIdx:0,
   swipes:[{text:"Привет",draws:[]}]};
 const result=await A.run({chatId:"c1",path:[msg]},{provider,llm});
 assert.equal(result.counts["no-changes"],1);
 assert.equal(result.replayConsistent,true);
 assert.equal(called,1);
 const tooMany=await A.run({chatId:"c1",path:Array(13).fill(msg)},{provider,llm});
 assert.equal(tooMany.error,"shadow-message-budget-exceeded");
 assert.equal(called,1);
 assert.equal(A.create({llm}).error,"provider-unavailable");
 console.log("✓ KNOWLEDGE K1.5 bounded provider adapter");
})().catch(e=>{console.error(e);process.exitCode=1;});
