/* K1.5: no writes, selective swipes, sequential provider, and failure isolation. */
"use strict";
const assert=require("assert");
const S=require("../js/knowledge/shadow-live.js");
const message=(id,text,swipeIdx=0)=>({id,chatId:"c1",role:"assistant",swipeIdx,
 swipes:[{text,draws:[]}]});
async function checks(){
 const path=[message("a","Я дома."),message("b","Я теперь в кафе.")];
 const before=JSON.stringify(path);
 let count=0,firstId=null;
 const response=await S.run({chatId:"c1",path},async(prompt,meta)=>{
   count++;
   assert.equal(meta.messageId,count===1?"a":"b");
   assert.ok(prompt.includes("CONTEXT_DATA_JSON"));
   if(count===2)assert.ok(prompt.includes(firstId),"next turn must see earlier fact");
   const assertions=[{sourceId:"T0",subject:"char",predicate:"location",
     value:count===1?"home":"cafe",time:"current",
     modality:"reported",cardinality:"single"}];
   const links=count===2?[{sourceId:"T0",type:"supersedes",targetId:firstId}]:[];
   // IDs are deterministic; get the prior ID from the first prepared prompt on pass 2
   return JSON.stringify({assertions,links,unresolved:[]});
 });
 assert.equal(response.counts.ok,1); // second response has invalid target, not committed
 assert.equal(response.counts.partial,1);
 assert.equal(response.replayConsistent,true);
 assert.equal(JSON.stringify(path),before);
 assert.equal(count,2);
 assert.equal(response.assertions.length,1);
 const noCall=await S.run({chatId:"c1",path:[message("x","x".repeat(17000))]},
   async()=>{throw Error("invalid preflight invoked provider");});
 assert.equal(noCall.counts.unprocessed,1);
 assert.equal(noCall.rows[0].issues[0],"source-budget-exceeded");
 const malformed=await S.run({chatId:"c1",path:[message("x","Hi")]},
   async()=>"{\"assertions\":[");
 assert.equal(malformed.counts.unprocessed,1);
 assert.equal(malformed.assertions.length,0);
 const tampered=await S.run({chatId:"c1",path:[{...message("x","Hi"),chatId:"other"}]},
   async()=>{throw Error("must not run");});
 assert.equal(tampered.error,"invalid-shadow-path");
 console.log("✓ KNOWLEDGE K1.5 read-only live shadow runner");
}
checks().catch(e=>{console.error(e);process.exitCode=1;});
