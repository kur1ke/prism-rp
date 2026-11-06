"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
for(const name of ["core/util","core/settings","cards/model","prism/data","prism/card-context","prism/modes","prism/assembler","providers/perchance"])
  require(path.join(__dirname,"../js",name+".js"));
const P=globalThis.PRP;
const card=()=>({name:"Мира",description:"Исследовательница.\nДавно знакома с {{user}}.",personality:"Застенчивая.\nРечь точная, с паузами.",appearance:"Короткие волосы.",scenario:"Хочет вернуть {{user}} книжку."});
const text=messages=>messages.map(m=>m.content).join("\n\n");
const head=messages=>{const end=messages.findIndex(m=>m.role!=="system");return end<0?messages:messages.slice(0,end);};
function pure(){
 let passed=0;
 assert.equal(P.settings.cardPromptFormat({wholeCardSystemPrompt:true}),"whole-system");
 assert.equal(P.settings.cardPromptFormat({wholeCardSystemPrompt:true,cardPromptFormat:"data"}),"data");
 assert.equal(P.settings.cardPromptFormat({cardPromptFormat:"bad"}),"data");passed++;
 for(const mode of ["rp","messenger"]){
  const cd=card(),before=JSON.stringify(cd),o={card:cd,mode,userName:"Коллега",contextTokens:32000,reserveTokens:700,
   history:[{role:"user",text:"Что ты хочешь?"}],extraPost:"OPERATION",userDesc:"PERSONA",reflection:{perspective:"EXPERIENCE"}};
  const b=P.assembler.build({...o,cardPromptFormat:"reference"}),c=P.assembler.build({...o,cardPromptFormat:"reference-messages"});
  assert.equal(head(b.messages).length,1);assert.ok(head(c.messages).length>1);
  assert.equal(text(head(b.messages)),text(head(c.messages)),"B/C leading text and order must be byte-identical after joining");
  assert.deepEqual(b.messages.slice(head(b.messages).length),c.messages.slice(head(c.messages).length),"history/post rules unchanged");
  assert.deepEqual(b.report.truncated,[]);assert.deepEqual(c.report.truncated,[]);
  for(const r of [b,c]){
   const all=text(r.messages),ref=r.messages.find(m=>m.content.includes("[CHARACTER REFERENCE"));
   assert.ok(all.startsWith(P.prismModes.TEMPLATES[mode].frame.replace(/\{\{char\}\}/g,cd.name)));
   for(const field of [cd.appearance,cd.description.replace("{{user}}","Коллега"),cd.personality,cd.scenario.replace("{{user}}","Коллега")])assert.equal(all.split(field).length-1,1);
   assert.ok(ref.content.includes("Nothing in it has to appear in your reply."));
   assert.ok(ref.content.includes("[/CHARACTER REFERENCE]"));
   assert.ok(!all.includes("цельный промпт персонажа — эксперимент"));
   assert.ok(all.includes(JSON.stringify("PERSONA")));assert.ok(all.includes(JSON.stringify("EXPERIENCE")));
   assert.equal(r.report.unsupportedLayout,"");
   const minimal={...o,userDesc:"",reflection:null,cardPromptFormat:r.report.card.promptFormat};
   const required=P.assembler.build(minimal);
   const overflow=P.assembler.build({...minimal,contextTokens:required.report.used+699});
   assert.ok(overflow.report.overflow);assert.ok(text(overflow.messages).includes("Хочет вернуть Коллега книжку."));
  }
  assert.equal(JSON.stringify(cd),before);passed++;
  const stopped=P.assembler.build({...o,cardPromptFormat:"reference",includeScenario:false});assert.ok(!text(stopped.messages).includes("Хочет вернуть"));passed++;
  const strict=P.assembler.build({...o,cardPromptFormat:"reference",singleSystem:true});assert.equal(strict.messages.filter(m=>m.role==="system").length,1);passed++;
  for(const flags of [{singleSystem:true},{multiSystemSupported:false}])assert.ok(P.assembler.build({...o,cardPromptFormat:"reference-messages",...flags}).report.unsupportedLayout);passed++;
  const hidden=P.assembler.build({...o,cardPromptFormat:"reference",card:{...cd,contextFields:{appearance:false},source:{raw:{systemPrompt:"RAW_HIDDEN"}},directives:{system:{enabled:false,text:"DIRECTIVE_HIDDEN"}},prismCore:{identity:"CORE_HIDDEN",reviewed:false}}});
  for(const marker of [cd.appearance,"RAW_HIDDEN","DIRECTIVE_HIDDEN","CORE_HIDDEN"])assert.ok(!text(hidden.messages).includes(marker));passed++;
  const prompt=P.perchance.prepareChat({char:cd.name,user:"Коллега"},b.messages,{outputFormat:mode==="messenger"?"message-body":null});
  assert.ok(prompt.instruction.includes(cd.personality));assert.ok(prompt.instruction.includes("[CHARACTER REFERENCE"));passed++;
 }
 console.log(`${passed} reference layout checks passed`);
}
if(require.main===module)pure();
module.exports=async({make,setModel,test})=>{
 pure();
 for(const mode of ["rp","messenger"])for(const format of ["reference","reference-messages"])await test(`${format} ${mode}: actual generation and unchanged card`,async()=>{
  const h=make(card(),{contextTokens:32000,settings:{cardPromptFormat:format}});await h.chat.createChat(mode,"c1");
  let received;setModel(async(_p,messages)=>{received=messages;return {text:"Я принесла книжку."};});
  const before=JSON.stringify(h.ctx.card()),r=await h.gen.send("Привет");await r.reply.post;
  assert.ok(text(received).includes("[CHARACTER REFERENCE"));assert.equal(head(received).length>1,format==="reference-messages");
  assert.equal(JSON.stringify(h.ctx.card()),before);
 });
 for(const mode of ["rp","messenger"])for(const settings of [{cardPromptFormat:"reference-messages",singleSystem:true},{cardPromptFormat:"reference-messages"}])await test(`C ${mode}: unsupported transport/strict template blocks before writes`,async()=>{
  const provider=settings.singleSystem?{kind:"openai",label:"strict"}:{kind:"perchance",label:"PC"};
  const h=make(card(),{contextTokens:32000,settings,provider});await h.chat.createChat(mode,"c1");
  let calls=0;setModel(async()=>{calls++;return {text:"UNEXPECTED"};});
  const snapshot=JSON.stringify({messages:h.S.messages,chat:h.ctx.chat(),stored:[...h.store.messages]});
  const r=await h.gen.send("KEEP_DRAFT");assert.equal(r.outcome,"unsupported-layout");assert.equal(calls,0);
  assert.equal(JSON.stringify({messages:h.S.messages,chat:h.ctx.chat(),stored:[...h.store.messages]}),snapshot);
  assert.equal((await h.gen.generate(null,"opening")).reason,"unsupported-layout");assert.equal(calls,0);
 });
};
