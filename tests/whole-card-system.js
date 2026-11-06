"use strict";
const assert = require("node:assert/strict"), path = require("node:path");
for (const name of ["core/util", "core/settings", "cards/model", "prism/data", "prism/card-context", "prism/modes", "prism/assembler", "providers/perchance"])
  require(path.join(__dirname, "../js", name + ".js"));
const P = globalThis.PRP;
const TITLE = "### Указания автора карточки (цельный промпт персонажа — эксперимент)";
const card = () => ({ name: "Мира", description: "Исследовательница.\nОписание сохраняет свои абзацы.",
  personality: "Сдержанна, но инициативна.\nГоворит короткими точными фразами.",
  appearance: "Короткие каштановые волосы.", scenario: "Сегодня хочет вернуть {{user}} найденную книжку." });
function pure() {
  let passed = 0;
  assert.equal(P.settings.merge().wholeCardSystemPrompt, false);
  assert.equal(P.settings.merge({wholeCardSystemPrompt:true}).wholeCardSystemPrompt, true); passed++;
  for (const mode of ["rp", "messenger"]) for (const singleSystem of [false, true]) for (const transport of ["openai", "perchance"]) {
    const c = card(), before = JSON.stringify(c), names = {char:c.name,user:"Коллега"};
    const inputCost = transport === "perchance" ? messages => P.perchance.inputCost(names,messages,{outputFormat:mode === "messenger" ? "message-body" : null}) : undefined;
    const opts = {mode,singleSystem,card:c,userName:names.user,history:[{role:"user",text:"Что ты задумала?"}],contextTokens:32000,reserveTokens:700,inputCost};
    const baseline = P.assembler.build(opts);
    assert.deepEqual(P.assembler.build({...opts,wholeCardSystemPrompt:false}),baseline);
    assert.deepEqual(P.assembler.build({...opts,wholeCardSystemPrompt:"true"}),baseline);
    const r = P.assembler.build({...opts,wholeCardSystemPrompt:true}), text = r.messages[0].content;
    assert.equal(r.report.card.promptFormat,"whole-system"); assert.equal(r.report.overflow,false);
    assert.ok(text.includes(TITLE)); assert.ok(text.includes(P.prismModes.TEMPLATES[mode].frame.replace(/\{\{char\}\}/g,c.name)));
    for (const field of [c.description,c.personality,c.appearance,"Сегодня хочет вернуть Коллега найденную книжку."]) {
      assert.equal(text.split(field).length-1,1,"full field exactly once");
      assert.ok(!text.includes(JSON.stringify(field)),"character block must not be JSON-quoted");
    }
    assert.ok(!text.includes("### Характер Мира"));assert.ok(!text.includes("### Исходная ситуация"));
    assert.equal(r.messages.filter(x=>x.role==="user").at(-1).content,"Что ты задумала?");
    const pc = P.perchance.prepareChat(names,r.messages,{outputFormat:mode === "messenger" ? "message-body" : null});
    assert.ok(pc.instruction.includes(c.personality)); assert.ok(pc.instruction.includes(TITLE));
    const overflow = P.assembler.build({...opts,wholeCardSystemPrompt:true,contextTokens:r.report.used+699});
    assert.ok(overflow.report.overflow,"a one-token shortfall cannot cut any of the whole character prompt");
    assert.ok(overflow.messages[0].content.includes("Сегодня хочет вернуть Коллега найденную книжку."));
    assert.ok(!overflow.report.truncated.some(x=>x.layer==="card.scenario"));
    assert.equal(JSON.stringify(c),before); passed++;
  }
  const c = {...card(),source:{raw:{systemPrompt:"RAW_MUST_NOT_LEAK"}},directives:{system:{text:"DISABLED_MUST_NOT_LEAK",enabled:false}},
    contextFields:{description:false},prismCore:{identity:"UNCHECKED_MUST_NOT_LEAK",reviewed:false}};
  const base = {card:c,wholeCardSystemPrompt:true,contextTokens:32000};
  const text = P.assembler.build(base).messages[0].content;
  for(const value of [c.description,"RAW_MUST_NOT_LEAK","DISABLED_MUST_NOT_LEAK","UNCHECKED_MUST_NOT_LEAK"])assert.ok(!text.includes(value)); passed++;
  assert.ok(!P.assembler.build({...base,includeScenario:false}).messages[0].content.includes("Сегодня хочет вернуть")); passed++;
  const other = P.assembler.build({...base,userDesc:"PERSONA_DATA",reflection:{perspective:"EXPERIENCE_DATA"},
    card:{...c,lore:[{constant:true,enabled:true,content:"LORE_DATA"}],customFields:[{enabled:true,mode:"always",label:"Custom",text:"CUSTOM_DATA"}]}}).messages[0].content;
  for(const value of ["PERSONA_DATA","EXPERIENCE_DATA","LORE_DATA"])assert.ok(other.includes(JSON.stringify(value)));
  assert.ok(other.includes(JSON.stringify("Custom: CUSTOM_DATA"))); passed++;
  const explicit = P.assembler.build({...base,card:{...card(),contextFields:{prismCore:true},prismCore:{identity:"CORE_ID",voice:["CORE_VOICE"],reviewed:true}}}).messages[0].content;
  assert.ok(explicit.includes("Манера речи:\nCORE_VOICE"));assert.ok(explicit.includes("Кто это:\nCORE_ID")); passed++;
  console.log(`${passed} whole-system character prompt checks passed`);
}
if(require.main===module)pure();
module.exports=async({make,setModel,test})=>{
  pure();
  for(const mode of ["rp","messenger"])await test(`whole-card ${mode}: setting reaches generation, regen and continue; overflow is atomic; toggle restores data`,async()=>{
    const h=make(card(),{settings:{wholeCardSystemPrompt:true},contextTokens:32000});await h.chat.createChat(mode,"c1");
    const seen=[];
    setModel(async(_p,messages)=>{seen.push(messages);assert.ok(messages[0].content.includes(TITLE));return {text:"Я принесла книжку."};});
    const sent=await h.gen.send("Привет");await sent.reply.post;
    assert.equal(h.chat.path().at(-1).role,"assistant");
    const id=h.chat.path().at(-1).id;
    await h.gen.generate(id,"regen");await h.gen.generate(id,"continue");
    assert.equal(seen.length,3);assert.equal(h.S.lastPrism.report.card.promptFormat,"whole-system");
    const snapshot=JSON.stringify({messages:h.S.messages,chat:h.ctx.chat(),stored:[...h.store.messages],card:h.ctx.card()});
    h.ctx.contextTokens=()=>1;assert.equal((await h.gen.send("KEEP_DRAFT")).outcome,"overflow");assert.equal(seen.length,3);
    assert.equal(JSON.stringify({messages:h.S.messages,chat:h.ctx.chat(),stored:[...h.store.messages],card:h.ctx.card()}),snapshot);
    h.ctx.contextTokens=()=>32000;h.S.settings.wholeCardSystemPrompt=false;
    const restored=h.prism.build(h.chat.path());assert.equal(restored.report.card.promptFormat,"data");assert.ok(!restored.messages[0].content.includes(TITLE));
  });
};
