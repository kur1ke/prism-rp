"use strict";
const assert=require("node:assert/strict");
const A=require("../js/prism/assembler.js"),PC=require("../js/providers/perchance.js");
const P=globalThis.PRP,tok=P.util.estimateTokens;
async function transport(){
 let cases=0,calls=0;
 const previousAi=globalThis.ai,previousFetch=globalThis.fetch;
 try{
  for(const outputFormat of [null,"message-body","json"]){
   for(const continuation of [false,true]){
    for(const image of [false,true]){
     const names={char:'Аля "長い名前" \\'.repeat(5),user:'Кира (читатель)'},
      messages=[{role:"system",content:"RULES [a] {b}"},
       {role:"user",content:'"\\\n'.repeat(50)},{role:"assistant",content:"Previous text"},
       {role:"system",content:"POST_HISTORY"}],
      opts={outputFormat,continueFrom:continuation?'PREFIX "\\'+"x".repeat(100):null,closing:"CUSTOM CLOSING".repeat(10),
       imageDataUrl:image?"data:image/png;base64,AA==":null};
     const prepared=PC.prepareChat(names,messages,opts),cost=PC.inputCost(names,messages,opts);
     const before=calls;assert.equal(calls,before,"pure preparation does not call plugin");
     globalThis.ai=(request)=>{
      calls++;
      const instruction=request.instruction(),strings=Array.isArray(instruction)?instruction.filter(v=>typeof v==="string").join(""):instruction;
      assert.equal(strings,prepared.instruction);
      assert.equal(request.startWith(),prepared.startWith);
      assert.deepEqual(request.stopSequences(),prepared.stop);
      assert.equal(cost,tok(strings)+tok(request.startWith()));
      if(image)assert.ok(instruction.at(-1) instanceof Blob);
      return Promise.resolve({generatedText:"REPLY"});
     };
     globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(["fixture"],{type:"image/png"})});
     await PC.chat(names,messages,opts);
     cases++;
    }
   }
  }
  for(const mode of ["rp","messenger"]){
   for(const singleSystem of [false,true]){
    const names={char:"Аля",user:"Кира"},format=mode==="messenger"?"message-body":null;
    for(const n of [0,100,310,600]){
     const history=[{role:"user",text:'"\\\n'.repeat(n)||"Привет"}],
      opts={outputFormat:format,continueFrom:"PREFIX".repeat(20)},
      built=A.build({mode,singleSystem,card:{name:names.char,description:"d"},history,contextTokens:1400,reserveTokens:300,
       inputCost:msgs=>PC.inputCost(names,msgs,opts)});
     assert.equal(built.report.used,PC.inputCost(names,built.messages,opts));
     assert.equal(built.report.messageUsed,built.messages.reduce((sum,m)=>sum+tok(m.content)+4,0));
     if(!built.report.overflow)assert.ok(built.report.used+300<=1400);
     else assert.equal(built.report.fits,false);
     cases++;
    }
   }
  }
  console.log(cases+" final Perchance payload checks passed");
 }finally{globalThis.ai=previousAi;globalThis.fetch=previousFetch;}
}
if(require.main===module)transport().catch(e=>{console.error(e);process.exitCode=1;});
module.exports=async({make,setModel,test})=>{
 await transport();
 const previousAi=globalThis.ai;
 try{
  for(const mode of ["rp","messenger"]){
   for(const operation of ["send","regen","continue","edit","opening","initiative"]){
    if((mode==="messenger"&&operation==="opening")||(mode==="rp"&&operation==="initiative"))continue;
    await test("F15 "+mode+" "+operation+": exact Perchance payload fits before any tree mutation",async()=>{
     let contextTokens=8192,calls=0,acceptedCost=0;
     const h=make({name:"Аля",description:"d"},{provider:{id:"pc",kind:"perchance",label:"PC"}});
     h.ctx.contextTokens=()=>contextTokens;h.S.settings.images.enabled=false;h.S.settings.sampler.max_tokens=300;
     const id=await h.chat.createChat(mode,"c1");
     if(mode==="messenger")await h.ctx.svc.messenger.createFor(id,{timeZone:"UTC",timeMode:"manual",manualNow:"2026-11-04T12:00:00.000Z"});
     const user=await h.chat.addUserMessage('"\\\n'.repeat(100));
     if(!["send","opening","initiative"].includes(operation)){
      const msg=h.chat.newMsg("assistant",user.id,"PREFIX".repeat(100));await h.chat.commitMessage(msg,msg.id);
     }
     if(operation==="opening"||operation==="initiative")await h.chat.deleteFrom(user.id);
     setModel((_p,messages,opts)=>PC.chat(opts.names,messages,opts));
     globalThis.ai=request=>{
      calls++;acceptedCost=tok(request.instruction())+tok(request.startWith());
      assert.ok(acceptedCost+h.S.settings.sampler.max_tokens<=contextTokens,"actual plugin input exceeds window");
      assert.equal(h.S.lastPrism.report.used,acceptedCost);
      return Promise.resolve({generatedText:"SAFE_REPLY"});
     };
     const invoke=()=>operation==="initiative"?h.gen.initiative():operation==="send"?h.gen.send("New input"):
      operation==="edit"?h.gen.edit(user.id,"Edited input"):
      h.gen.generate(operation==="opening"?null:h.ctx.chat().leafId,operation);
     // Rejection of a small real input window must precede any write.
     const before=JSON.stringify({messages:[...h.store.messages],chats:[...h.store.chats]});
     contextTokens=400;
     await invoke();
     assert.equal(calls,0);
     assert.ok(h.S.lastPrism.report.overflow);
     assert.equal(JSON.stringify({messages:[...h.store.messages],chats:[...h.store.chats]}),before);
     contextTokens=32000;await invoke();
     assert.equal(calls,1);
     assert.ok(acceptedCost>0);assert.equal(h.S.lastPrism.report.inputFormat,"perchance");
    });
   }
  }
  await test("F15 regression: message-only Messenger fits but actual JSON payload overflows",async()=>{
   let context=32000,calls=0;
   const h=make({name:"Аля",description:"d"},{provider:{id:"pc",kind:"perchance",label:"PC"}});
   h.ctx.contextTokens=()=>context;h.S.settings.images.enabled=false;h.S.settings.sampler.max_tokens=300;
   await h.chat.createChat("messenger","c1");
   await h.chat.addUserMessage('"\\\n'.repeat(310));
   const messageOnly=h.prism.build(h.chat.path()).report.messageUsed;
   context=messageOnly+300;
   const before=JSON.stringify({messages:[...h.store.messages],chats:[...h.store.chats]});
   setModel((_p,messages,opts)=>PC.chat(opts.names,messages,opts));
   globalThis.ai=()=>{calls++;return Promise.resolve({generatedText:"unused"});};
   await h.gen.generate();
   const report=h.S.lastPrism.report;
   assert.equal(calls,0);assert.ok(report.overflow);
   assert.ok(report.messageUsed<=report.budget,"original message estimate fits");
   assert.ok(report.used>report.budget,"adapted payload does not fit");
   assert.equal(JSON.stringify({messages:[...h.store.messages],chats:[...h.store.chats]}),before);
  });
 }finally{globalThis.ai=previousAi;}
};
