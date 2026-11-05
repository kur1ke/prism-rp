"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
for(const n of ["core/util","cards/model","prism/data","prism/card-context","prism/modes","prism/assembler","providers/perchance","state/interpreter"]) require(path.join(__dirname,"../js",n+".js"));
const P=globalThis.PRP,CC=P.cardContext;
const card=()=>{const c={name:"N",description:"DESC_UNIQUE",personality:"FIRST_TRAIT\n\nSECOND_TRAIT",appearance:"LOOK_UNIQUE",contextFields:{prismCore:true}};c.prismCore=CC.deriveCore(c);return c;};
let passed=0;
for(const mode of ["rp","messenger"])for(const pc of [false,true]){
 const c=card(),before=JSON.stringify(c),opts={card:c,mode,contextTokens:32000,reserveTokens:700,inputCost:pc?messages=>P.perchance.inputCost({char:"N",user:"U"},messages):undefined};
 const built=P.assembler.build(opts),text=built.messages.map(m=>m.content).join("\n");
 for(const marker of ["DESC_UNIQUE","FIRST_TRAIT","SECOND_TRAIT","LOOK_UNIQUE"])assert.equal(text.split(marker).length-1,1,marker+" duplicated");
 assert.equal(built.report.card.core.duplicates.length,3);
 assert.equal(JSON.stringify(c),before);
 assert.equal(P.assembler.build({...opts,contextTokens:built.report.used+699}).report.overflow,true);passed++;
}
const c=card();
assert.equal(CC.tokenUsage(c,32000).fields.prismCore,0);passed++;
c.contextFields={prismCore:true,description:false,personality:false};
assert.equal(CC.core(c).identity,"DESC_UNIQUE");assert.deepEqual(CC.core(c).traits,["FIRST_TRAIT","SECOND_TRAIT"]);passed++;
c.contextFields={prismCore:true};c.prismCore={identity:"desc_unique",traits:["FIRST_TRAIT extra","not FIRST_TRAIT","FIRST_TRAIT!"],voice:["new voice"],reviewed:true};
assert.equal(CC.core(c).identity,"desc_unique");assert.equal(CC.core(c).traits.length,3);assert.deepEqual(CC.core(c).voice,["new voice"]);passed++;
c.prismCore.reviewed=false;assert.equal(CC.core(c).source,"fallback");assert.deepEqual(CC.core(c).duplicates,[]);passed++;
c.prismCore={identity:"{{char}}",traits:[],reviewed:true};c.description="N";
assert.equal(CC.core(c,x=>x.replace(/\{\{char\}\}/g,"N")).identity,"");passed++;
c.prismCore={identity:"N extra",traits:["FIRST_TRAIT"],reviewed:true};c.customFields=[{label:"Distinct meaning",text:"FIRST_TRAIT",enabled:true,mode:"always"}];
assert.equal(CC.core(c).identity,"N extra");assert.equal(CC.chunks(c,CC.core(c)).length,1);passed++;
console.log(passed+" core-duplicate checks passed");
module.exports=async({make,setModel,test})=>{
 for(const mode of ["rp","messenger"])await test(`F09 ${mode}: Core duplicates removed in service; overflow leaves saved source unchanged`,async()=>{
  const c=card(),h=make(c,{contextTokens:32000});await h.chat.createChat(mode,"c1");
  let calls=0;setModel(async(_p,messages)=>{calls++;const text=messages.map(m=>m.content).join("\n");for(const marker of ["DESC_UNIQUE","FIRST_TRAIT","SECOND_TRAIT"])assert.equal(text.split(marker).length-1,1);return {text:"Ответ"};});
  const sent=await h.gen.send("Привет");await sent.reply.post;assert.equal(calls,1);
  const snapshot=JSON.stringify({messages:h.S.messages,chat:h.ctx.chat(),stored:[...h.store.messages],card:h.ctx.card()});
  h.ctx.contextTokens=()=>1;assert.equal((await h.gen.send("KEEP_DRAFT")).outcome,"overflow");assert.equal(calls,1);
  assert.equal(JSON.stringify({messages:h.S.messages,chat:h.ctx.chat(),stored:[...h.store.messages],card:h.ctx.card()}),snapshot);
 });
};
