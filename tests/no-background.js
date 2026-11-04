"use strict";
const assert = require("node:assert/strict"), path = require("node:path");
for (const name of ["core/util","cards/model","cards/ccard","cards/formats/common","cards/formats/detect","cards/formats/cc-v1","cards/formats/cc-v2","cards/formats/cc-v3","cards/formats/urv-v2","cards/validate","cards/import","prism/data","prism/card-context","prism/modes","prism/assembler","assist/assist"])
  require(path.join(__dirname,"../js",name+".js"));
const P=globalThis.PRP,CM=P.cardModel,MARK="PAST_TEXT_MUST_STAY_IN_LORE";
const legacy=()=>({...CM.blank(),id:"old",schema:2,name:"Аля",description:"Описание",background:MARK,lore:[{content:"KEEP_LORE",enabled:false,keys:[]}]});
function pure(){
  let passed=0;
  assert.equal(Object.hasOwn(CM.blank(),"background"),false);assert.ok(!CM.CONTENT_FIELDS.includes("background"));passed++;
  const raw=legacy(),before=JSON.stringify(raw),card=CM.upgradeStored(raw);
  assert.equal(Object.hasOwn(card,"background"),false);assert.equal(card.lore.length,2);
  assert.equal(card.lore[1].content,MARK);assert.equal(card.lore[1].enabled,false);assert.equal(card.lore[1].constant,false);
  assert.deepEqual(card.lore[1].keys,[]);assert.equal(card.lore[0].content,"KEEP_LORE");assert.equal(JSON.stringify(raw),before);passed++;
  assert.strictEqual(CM.upgradeStored(card),card);assert.equal(CM.retireBackground(card).lore.length,2);passed++;
  for(const mode of ["rp","messenger"]){
    const result=P.assembler.build({card:raw,mode,history:[{role:"user",text:"Расскажи про прошлое"}]});
    assert.ok(!result.messages.some(m=>m.content.includes(MARK)));assert.deepEqual(result.report.card.candidates,[]);
  }
  assert.ok(!P.assist.cardText(raw).includes(MARK));passed++;
  const spec=P.ccard.toSpec(raw,"v3");
  assert.ok(!Object.hasOwn(spec.data.extensions.prism_rp.fields,"background"));assert.ok(!spec.data.description.includes(MARK));
  assert.ok(spec.data.character_book.entries.some(e=>e.content===MARK&&e.enabled===false));
  const imported=P.cardImport.fromObject(spec,"json","roundtrip.json");assert.equal(imported.ok,true);
  assert.ok(!Object.hasOwn(imported.draft,"background"));assert.ok(imported.draft.lore.some(e=>e.content===MARK&&!e.enabled));passed++;
  const urv=P.cardImport.fromObject({type:"urv-char",version:2,data:{name:"Аля",description:"Описание",profile:{background:MARK}}},"json","urv.json");
  assert.equal(urv.ok,true);assert.ok(!Object.hasOwn(urv.draft,"background"));assert.ok(urv.draft.lore.some(e=>e.content===MARK&&!e.enabled));passed++;
  const enabled=CM.upgradeStored(legacy());
  assert.ok(!P.assembler.build({card:enabled}).messages[0].content.includes(MARK));
  enabled.lore[1].enabled=true;enabled.lore[1].constant=true;
  assert.ok(P.assembler.build({card:enabled}).messages[0].content.includes(MARK));passed++;
  console.log(passed+" removed-background checks passed");
}
if(require.main===module)pure();
module.exports=async({make,test})=>{
  pure();
  await test("BACKGROUND removed: card load persists the ordinary disabled lore once",async()=>{
    const h=make({name:"Аля"}),raw=legacy();await h.ctx.DB.put("cards",raw);
    const loaded=await h.ctx.svc.cards.loadAll();
    assert.ok(!Object.hasOwn(loaded[0],"background"));assert.equal(loaded[0].lore.length,2);
    assert.deepEqual(await h.ctx.DB.get("cards",raw.id),loaded[0]);
    assert.equal((await h.ctx.svc.cards.loadAll())[0].lore.length,2);
  });
  await test("BACKGROUND removed: failed retirement write preserves original card and text for retry",async()=>{
    const h=make({name:"Аля"}),raw=legacy();await h.ctx.DB.put("cards",raw);
    const before=JSON.stringify([...h.store.cards]),put=h.ctx.DB.putAll;
    h.ctx.DB.putAll=async()=>{throw Error("retirement abort");};
    await assert.rejects(h.ctx.svc.cards.loadAll(),/retirement abort/);
    assert.equal(JSON.stringify([...h.store.cards]),before);
    h.ctx.DB.putAll=put;assert.equal((await h.ctx.svc.cards.loadAll())[0].lore[1].content,MARK);
  });
  for(const change of ["edit","delete"])await test(`BACKGROUND removed: retirement preserves concurrent ${change}`,async()=>{
    const h=make({name:"Аля"}),raw=legacy();await h.ctx.DB.put("cards",raw);
    const DB=h.ctx.DB,rmw=DB.readModifyWrite;
    DB.readModifyWrite=async(...args)=>{
      if(change==="delete")await DB.del("cards",raw.id);
      else{const fresh=await DB.get("cards",raw.id);fresh.name="NEW_NAME";fresh.background="UPDATED_TEXT";await DB.put("cards",fresh);}
      return rmw(...args);
    };
    const loaded=await h.ctx.svc.cards.loadAll();
    if(change==="delete"){assert.deepEqual(loaded,[]);assert.equal(await DB.get("cards",raw.id),undefined);}
    else{assert.equal(loaded[0].name,"NEW_NAME");assert.equal(loaded[0].lore[1].content,"UPDATED_TEXT");}
  });
};
