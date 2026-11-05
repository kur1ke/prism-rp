"use strict";
const assert=require('node:assert/strict'),path=require('node:path');
for(const n of ['core/util','cards/model','cards/ccard','prism/data','prism/card-context','prism/modes','prism/assembler','providers/openai','providers/perchance','ui/render','ui/views/kit','ui/views/card-editor'])require(path.join(__dirname,'../js',n+'.js'));
const P=globalThis.PRP,A=P.assembler;
const row=(content,position,order,extra)=>({content,position,insertion_order:order,enabled:true,constant:true,...extra});
const lore=[row('LAST_0','after_char',0),row('FIRST_20','before_char',20),row('FIRST_10','before_char',10,{keys:['missing'],secondary_keys:['also-missing'],selective:true}),row('DISABLED','before_char',-1,{enabled:false})];
const card={...P.cardModel.blank(),name:'N',description:'DESC_MARKER',lore};
let checks=0;
assert.deepEqual(A.matchLore(lore,'').map(e=>e.content),['FIRST_10','FIRST_20','LAST_0']);checks++;
const keyed=[row('KEYED','after_char',0,{constant:false,keys:['Луна'],secondary_keys:['вечер'],selective:true})];
assert.equal(A.matchLore(keyed,'Луна').length,0);assert.equal(A.matchLore(keyed,'луна вечером').length,1);
assert.equal(A.matchLore([{...keyed[0],case_sensitive:true}],'луна вечером').length,0);
assert.equal(A.matchLore([{...keyed[0],secondary_keys:[]}],'Луна').length,1);checks++;
for(const mode of ['rp','messenger'])for(const singleSystem of [false,true])for(const pc of [false,true]){
 const before=JSON.stringify(card),inputCost=pc?messages=>P.perchance.inputCost({char:'N',user:'U'},messages,{outputFormat:mode==='messenger'?'message-body':null}):undefined;
 const opts={card,mode,singleSystem,inputCost,userDesc:'PERSONA_MARKER',history:[{role:'user',text:'Привет'}],contextTokens:32000,reserveTokens:700};
 const full=A.build(opts),text=full.messages.map(m=>m.content).join('\n');
 assert.equal(full.report.loreMatched,3);assert.equal(full.report.loreKept,3);assert.ok(!text.includes('DISABLED'));
 assert.ok(text.indexOf('DESC_MARKER')<text.indexOf('FIRST_10'));assert.ok(text.indexOf('PERSONA_MARKER')<text.indexOf('FIRST_10'));
 assert.ok(text.indexOf('FIRST_10')<text.indexOf('FIRST_20')&&text.indexOf('FIRST_20')<text.indexOf('LAST_0'));
 const base=A.build({...opts,card:{...card,lore:[]}});
 const tight=A.build({...opts,contextTokens:base.report.used+700});
 assert.equal(tight.report.overflow,false);assert.equal(tight.report.loreMatched,3);assert.equal(tight.report.loreKept,0);assert.equal(tight.report.loreDropped,3);
 assert.ok(tight.messages.some(m=>m.content.includes('DESC_MARKER')));assert.equal(JSON.stringify(card),before);checks++;
}
for(const version of ['v2','v3']){
 const exported=P.ccard.toSpec(card,version),entries=exported.data.character_book?.entries||exported.data.lorebook?.entries;
 assert.ok(entries);assert.equal(entries[2].position,'before_char');assert.equal(entries[2].constant,true);assert.equal(entries[2].selective,true);checks++;
}
const html=P.views.cardModal({modal:{},cardInputBudget:32000},card,'lore');
assert.ok(html.includes('В начале лорбука')&&html.includes('В конце лорбука'),'labels must describe ordering within lore');
assert.ok(!html.includes('всегда в контексте')&&!html.includes('Перед описанием персонажа'));
assert.ok(html.includes('Активировать без ключевых слов')&&html.includes('При нехватке контекста'));
assert.ok(html.includes('Если список заполнен')&&html.includes('обходит обе проверки'));checks++;
console.log(checks+' lorebook contract checks passed');
