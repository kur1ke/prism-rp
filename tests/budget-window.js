"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
for(const name of ["core/util","prism/data","prism/card-context","prism/modes","prism/assembler"])
 require(path.join(__dirname,"../js",name+".js"));
const P=globalThis.PRP,A=P.assembler;
function pure(){
 let cases=0;
 const check=(opts)=>{
  const b=A.build({card:{name:"N",description:"d"},...opts}),r=b.report;
  if(!r.overflow){
   assert.ok(r.used+opts.reserveTokens<=opts.contextTokens,"accepted request exceeds full window");
   assert.equal(r.fits,true);
  }else assert.equal(r.fits,false);
  cases++;return r;
 };
 for(const mode of ["rp","messenger"]){
  for(const singleSystem of [false,true]){
   for(const [contextTokens,reserveTokens] of [[1024,900],[1200,900],[512,700],[700,700],[700,701],[256,0]]){
    const r=check({mode,singleSystem,contextTokens,reserveTokens});
    assert.equal(r.budget,Math.max(0,contextTokens-reserveTokens));
   }
   const base=A.build({mode,singleSystem,card:{name:"N",description:"d"},contextTokens:8192,reserveTokens:700});
   const used=base.report.used;
   assert.equal(check({mode,singleSystem,contextTokens:used+700,reserveTokens:700}).overflow,false);
   assert.equal(check({mode,singleSystem,contextTokens:used+699,reserveTokens:700}).overflow,true);
   assert.equal(check({mode,singleSystem,contextTokens:used+701,reserveTokens:700}).overflow,false);
  }
 }
 for(const [contextTokens,reserveTokens] of [[NaN,700],[Infinity,700],[-1,700],[0,700],[8192,-1],[8192,Infinity],[8192,NaN],["8192",700],[8192,"700"],[null,700]]){
  const r=A.build({card:{name:"N"},contextTokens,reserveTokens}).report;
  assert.equal(r.overflow,true);assert.equal(r.fits,false);assert.equal(r.invalidBudget,true);cases++;
 }
 console.log(cases+" full-window budget checks passed");
}
if(require.main===module)pure();
module.exports=async({make,setModel,test})=>{
 pure();
 for(const mode of ["rp","messenger"]){
  for(const operation of ["send","regen","continue","edit","opening"]){
   if(mode==="messenger"&&operation==="opening")continue;
   await test("F14 "+mode+" "+operation+": insufficient input window has no provider call or tree mutation",async()=>{
    const h=make({name:"N",description:"d"},{contextTokens:1024});
    await h.chat.createChat(mode,"c1");
    const user=await h.chat.addUserMessage("Hi");
    if(operation!=="send"&&operation!=="opening"){
     const msg=h.chat.newMsg("assistant",user.id,"Hello");await h.chat.commitMessage(msg,msg.id);
    }
    if(operation==="opening"){
     await h.chat.deleteFrom(user.id);
    }
    h.S.settings.sampler.max_tokens=900;
    let called=0;setModel(async()=>{called++;return {text:"unused"};});
    const before=JSON.stringify({messages:[...h.store.messages],chats:[...h.store.chats]});
    if(operation==="send")await h.gen.send("New input");
    else if(operation==="edit")await h.gen.edit(user.id,"Edited input");
    else await h.gen.generate(operation==="opening"?null:h.ctx.chat().leafId,operation==="opening"?"opening":operation==="continue"?"continue":"regen");
    assert.ok(h.S.lastPrism.report.overflow);
    assert.equal(h.S.lastPrism.report.budget,124);
    assert.equal(called,0);
    assert.equal(JSON.stringify({messages:[...h.store.messages],chats:[...h.store.chats]}),before);
    assert.ok(!h.S.gen);assert.ok(!h.S.turn);
   });
  }
 }
};
