"use strict";
const assert=require('node:assert/strict');
require('../js/chat/tree.js');const M=require('../js/prism/memory-cycle.js');
const texts=['Персонаж получил серебряный компас.','Персонаж поссорился с другом.','Персонаж договорился о встрече у маяка.'];
const msg=(id,text,parentId)=>({id,role:'assistant',parentId:parentId||null,swipeIdx:0,swipes:[{text}]});
const a=msg('a',texts.join(' ')),path=M.pathSnapshot([a]),input=M.extractionInput(path);
const items=texts.map(quote=>({messageId:'a',quote,event:quote,kind:'observed'}));
let passed=0;
for(const mode of ['rp','messenger']){
 const episodes=M.parseExtraction(JSON.stringify({memories:[...items,{...items[0],quote:'серебряный компас.',event:'ПЕРСОНАЖ ПОЛУЧИЛ СЕРЕБРЯНЫЙ КОМПАС!'}]}),input,path,mode);
 assert.equal(episodes.length,3);assert.deepEqual(episodes.map(x=>x.event),texts);
 for(const e of episodes){assert.equal(e.source.prefixHash,path[0].prefixHash);assert.equal(e.source.swipeIdx,0);assert.equal(e.kind,mode==='messenger'?'reported':'observed');}passed++;
}
const fourTexts=[...texts,'Персонаж вернулся домой.'],fourPath=M.pathSnapshot([msg('four',fourTexts.join(' '))]);
assert.equal(M.parseExtraction(JSON.stringify({memories:fourTexts.map(quote=>({messageId:'four',quote,event:quote,kind:'observed'}))}),M.extractionInput(fourPath),fourPath,'rp').length,4);passed++;
const sharedQuote=items.slice(0,2).map(x=>({...x,quote:a.swipes[0].text}));
assert.equal(M.parseExtraction(JSON.stringify({memories:sharedQuote}),input,path,'rp').length,2);passed++;
const bad=items.map(x=>({...x}));bad[2].quote='Невстречающаяся цитата';
assert.equal(M.parseExtraction(JSON.stringify({memories:bad}),input,path,'rp'),null);passed++;
assert.equal(M.parseExtraction(JSON.stringify({memories:[...items,...items]}),input,path,'rp'),null);passed++;
const source={messageId:'a',swipeIdx:0,textHash:path[0].textHash,prefixHash:path[0].prefixHash};
const memories=texts.map((event,i)=>({id:'m'+i,chatId:'ch',owner:'owner',createdAt:1,event,quote:texts[i],kind:'observed',source}));
const duplicate={...memories[0],id:'duplicate',createdAt:2,event:'ПЕРСОНАЖ ПОЛУЧИЛ СЕРЕБРЯНЫЙ КОМПАС!'};
const recent=M.recent([...memories,duplicate],path,Infinity);assert.equal(recent.length,3);assert.ok(recent.some(x=>x.id==='m0'));passed++;
assert.deepEqual(M.recent([duplicate,...memories.slice().reverse()],path,Infinity),recent);passed++;
assert.equal(M.weighted(recent,path).length,3);assert.equal(M.extractionContext(memories,path).length,3);passed++;
const alt=msg('a','Альтернативная история');alt.swipes.unshift(a.swipes[0]);alt.swipeIdx=1;
assert.equal(M.recent(memories,M.pathSnapshot([alt]),Infinity).length,0);passed++;
const child=msg('b','Новое событие после встречи','a');
const extended=M.pathSnapshot([a,child]);assert.equal(M.recent(memories,extended,Infinity).length,3);
assert.equal(M.recent(memories,M.pathSnapshot([alt,child]),Infinity).length,0);passed++;
// Three episodes per message: checkpoints count episodes, not source messages.
const posts=Array.from({length:34},(_,i)=>msg('p'+i,'Три события в посте '+i,i?'p'+(i-1):null)),p=M.pathSnapshot(posts);
const all=p.flatMap((s,i)=>Array.from({length:3},(_,j)=>({id:'ep-'+i+'-'+j,chatId:'ch',owner:'owner',createdAt:i,event:'Самостоятельный эпизод '+i+' / '+j,quote:s.text,source:{messageId:s.id,swipeIdx:0,textHash:s.textHash,prefixHash:s.prefixHash}})));
const refs=[],ids=new Set();let plan;
while((plan=M.checkpointPlan(all,refs,p,'ch','owner'))){
 assert.equal(plan.memoryIds.length,10);for(const id of plan.memoryIds){assert.ok(!ids.has(id));ids.add(id);}
 refs.push({...plan,kind:'batch',chatId:'ch',owner:'owner',change:'unchanged',perspective:''});
}
assert.equal(refs.length,10);assert.equal(ids.size,100);passed++;
const wave=M.integrationPlan(all,refs,p,'ch','owner');assert.equal(wave.batchIds.length,10);passed++;
const timeline=M.experienceTimeline(all,refs,p,'ch','owner');assert.equal(timeline.memoryCount,102);assert.equal(timeline.batchCount,10);assert.equal(timeline.memoryStep,2);passed++;
assert.equal(M.checkpointPlan(all.slice().reverse(),refs,p,'ch','owner'),null);passed++;
console.log(passed+' multiple-episode domain checks passed');
