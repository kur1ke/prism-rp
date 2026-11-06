"use strict";
const assert=require('node:assert/strict');
module.exports=async({make,test})=>{
 const P=globalThis.PRP,t0=Date.parse('2026-11-06T10:00:00Z');
 const report=(value)=>({actor:'char',field:'location',action:'set',value,certainty:'reported',evidence:'Я в '+value+'.'});
 const add=async(h,id,value,at,parent=null)=>{
  const m={id,chatId:h.S.chatId,parentId:parent,parentSwipeIdx:0,role:'assistant',createdAt:at,swipeIdx:0,
   swipes:[{text:'Я в '+value+'.',createdAt:at,messengerAt:{at:new Date(at).toISOString()},stateEvents:[report(value)]}]};
  await h.chat.commitMessage(m,id);return m;
 };
 await test('A08 ties: saved creation order wins over random ids in chat and branch events',async()=>{
  const E=P.messengerEnv,path=[{id:'root',swipeIdx:0},{id:'left',swipeIdx:0}],anchor=P.branch.anchorOf(path);
  for(const scope of ['chat','branch'])for(const ids of [['z-first','a-second'],['a-first','z-second']]){
   const events=[
    E.makeEvent({id:ids[0],scope,anchor,patch:{visualWear:['пальто'],location:'дом'},effectiveAt:new Date(t0).toISOString(),createdAt:t0+1}),
    E.makeEvent({id:ids[1],scope,anchor,patch:{visualWear:null,location:null},effectiveAt:new Date(t0).toISOString(),createdAt:t0+1})
   ];
   const record={events},before=JSON.stringify(record);
   for(const source of [record,E.normalize(record,'c1'),JSON.parse(JSON.stringify(record))]){
    const resolved=E.resolveWorld(source,{path,now:t0});
    assert.deepEqual(resolved.manualEvents.map(e=>e.id),ids);
    assert.deepEqual(resolved.world.visualWear,[]);assert.equal(resolved.world.location,null);
    const state=P.stateTracker.fold({mode:'messenger',charName:'Аля',path:[],manualEvents:resolved.manualEvents});
    assert.deepEqual(state.actors.char.wearState.worn,[]);assert.equal(state.actors.char.wearState.known,false);
   }
   assert.equal(JSON.stringify(record),before);
  }
 });
 await test('A08 ties: effective time, creation time and branch visibility still take priority',async()=>{
  const E=P.messengerEnv,path=[{id:'root',swipeIdx:0},{id:'left',swipeIdx:0}],anchor=P.branch.anchorOf(path);
  const event=(id,value,at,createdAt,scope='chat')=>E.makeEvent({id,scope,anchor,patch:{location:value},effectiveAt:new Date(at).toISOString(),createdAt});
  const events=[event('earlier-array','LATER_TIME',t0+2,t0),event('later-array','EARLIER_TIME',t0,t0+9)];
  assert.equal(E.resolveWorld({events},{path,now:t0+10}).world.location,'LATER_TIME');
  assert.equal(E.resolveWorld({events},{path,now:t0}).world.location,'EARLIER_TIME');
  assert.equal(E.resolveWorld({events:[event('x','NEWER_CREATION',t0,t0+2),event('y','OLDER_CREATION',t0,t0+1)]},{path,now:t0}).world.location,'NEWER_CREATION');
  const branch=[event('z','FIRST_BRANCH',t0,t0,'branch'),event('a','LAST_BRANCH',t0,t0,'branch')];
  assert.equal(E.resolveWorld({events:branch},{path,now:t0}).world.location,'LAST_BRANCH');
  assert.equal(E.resolveWorld({events:branch},{path:[path[0],{id:'right',swipeIdx:0}],now:t0}).world.location,null);
 });
 await test('A08 ties: service clear survives reload when both timestamps coincide',async()=>{
  const h=make({name:'Аля'});await h.chat.createChat('messenger','c1');h.ctx.svc.state=P.stateService.create(h.ctx);
  await h.ctx.svc.messenger.setTime({timeMode:'manual',manualNow:new Date(t0).toISOString()});
  for(const draft of [{id:'z-set',patch:{visualWear:['пальто']}},{id:'a-clear',patch:{visualWear:null}}]){
   const r=await h.ctx.svc.messenger.commitEvent({...draft,scope:'chat',createdAt:t0+1});assert.ok(r.event);
  }
  assert.deepEqual(h.ctx.svc.messenger.context().world.visualWear,[]);
  const stored=JSON.stringify(h.store.messengerEnvironments.get(h.S.chatId));
  await h.ctx.svc.messenger.load(h.S.chatId);
  assert.deepEqual(h.ctx.svc.messenger.context().world.visualWear,[]);
  assert.equal(JSON.stringify(h.store.messengerEnvironments.get(h.S.chatId)),stored);
 });
 await test('A08: global manual correction supersedes old report, later report supersedes correction',async()=>{
  const h=make({name:'Аля'});await h.chat.createChat('messenger','c1');h.ctx.svc.state=P.stateService.create(h.ctx);
  await h.ctx.svc.messenger.setTime({timeMode:'manual',manualNow:new Date(t0+1000).toISOString()});
  await add(h,'old','старом месте',t0);
  assert.equal(h.ctx.svc.messenger.context().world.location,'старом месте');
  await h.ctx.svc.messenger.commitEvent({scope:'chat',patch:{location:'НОВОЕ МЕСТО'}});
  assert.equal(h.ctx.svc.messenger.context().world.location,'НОВОЕ МЕСТО');
  assert.equal(h.ctx.svc.messenger.view().world.location,'НОВОЕ МЕСТО');
  assert.equal(h.ctx.svc.state.context().character.location,'НОВОЕ МЕСТО');
  assert.ok(h.prism.build(h.chat.path()).messages.some(m=>m.content.includes('НОВОЕ МЕСТО')));
  const frozen=h.ctx.svc.messenger.snapshot(h.chat.path());
  await add(h,'later','парке',t0+2000,'old');
  assert.equal(h.ctx.svc.messenger.context().world.location,'парке');
  await h.ctx.svc.messenger.load(h.S.chatId);
  assert.equal(h.ctx.svc.messenger.context().world.location,'парке');
  await h.ctx.svc.messenger.commitEvent({scope:'chat',patch:{location:'СЕГОДНЯ'},effectiveAt:new Date(t0+3000).toISOString()});
  const oldPath=h.chat.path().slice(0,1);
  assert.equal(h.ctx.svc.state.context(oldPath,{legacyWorld:frozen.world,manualEvents:frozen.manualEvents}).character.location,'НОВОЕ МЕСТО','image snapshot excludes later manual edits');
 });
 await test('A08: clear, future event and branch visibility retain explicit semantics',async()=>{
  const h=make({name:'Аля'});await h.chat.createChat('messenger','c1');h.ctx.svc.state=P.stateService.create(h.ctx);
  await h.ctx.svc.messenger.setTime({timeMode:'manual',manualNow:new Date(t0+1000).toISOString()});
  await add(h,'root','дома',t0);await add(h,'left','кафе',t0+100,'root');
  await h.ctx.svc.messenger.commitEvent({scope:'branch',patch:{location:'ВЕТКА'}});
  assert.equal(h.ctx.svc.state.context().character.location,'ВЕТКА');
  await add(h,'right','школе',t0+100,'root');
  assert.equal(h.ctx.svc.state.context().character.location,'школе');
  await h.ctx.svc.messenger.commitEvent({scope:'chat',patch:{location:null}});
  assert.equal(h.ctx.svc.messenger.context().world.location,'');
  await h.ctx.svc.messenger.commitEvent({scope:'chat',patch:{visualWear:['пальто'],activity:'читает',visualHair:'хвост',nearby:['кот'],ongoing:['дождь'],availability:'busy'}});
  const world=h.ctx.svc.messenger.context().world;
  assert.deepEqual(world.visualWear,['пальто']);assert.equal(world.activity,'читает');assert.equal(world.visualHair,'хвост');
  assert.deepEqual(world.nearby,['кот']);assert.deepEqual(world.ongoing,['дождь']);assert.equal(world.availability,'busy');
  await h.ctx.svc.messenger.commitEvent({scope:'chat',patch:{visualWear:null}});
  assert.deepEqual(h.ctx.svc.messenger.context().world.visualWear,[]);
  assert.equal(h.ctx.svc.messenger.context().world.wearComplete,false,'cleared clothing is unknown, not naked');
  await h.ctx.svc.messenger.commitEvent({scope:'chat',patch:{location:'БУДУЩЕЕ'},effectiveAt:new Date(t0+5000).toISOString()});
  assert.equal(h.ctx.svc.messenger.context().world.location,'');
  await h.ctx.svc.messenger.setTime({timeMode:'manual',manualNow:new Date(t0+6000).toISOString()});
  assert.equal(h.ctx.svc.messenger.context().world.location,'БУДУЩЕЕ');
 });
 await test('A08: same simulated time uses creation order; branch correction can supersede global edit',async()=>{
  const h=make({name:'Аля'});await h.chat.createChat('messenger','c1');h.ctx.svc.state=P.stateService.create(h.ctx);
  await h.ctx.svc.messenger.setTime({timeMode:'manual',manualNow:new Date(t0).toISOString()});
  await add(h,'root','дома',t0);const first=h.S.messages.find(m=>m.id==='root');
  await h.ctx.svc.messenger.commitEvent({scope:'chat',patch:{location:'ГЛОБАЛЬНО'}});
  assert.equal(h.ctx.svc.state.context().character.location,'ГЛОБАЛЬНО');
  await h.ctx.svc.state.correct({location:'ПОПРАВЛЕНО'});
  assert.equal(h.ctx.svc.state.context().character.location,'ПОПРАВЛЕНО');
  const env=h.S.messengerEnv;env.events[0].createdAt=Date.now()+1000;
  assert.equal(h.ctx.svc.state.context().character.location,'ГЛОБАЛЬНО');
  // A later variant at the same narrative time must follow the old manual edit.
  first.swipes.push({...first.swipes[0],createdAt:Date.now()+2000,text:'Я в парке.',stateCorrections:[],stateEvents:[report('парке')]});first.swipeIdx=1;
  assert.equal(h.ctx.svc.state.context().character.location,'парке');
 });
};
