"""User edits, retained branches, tree navigation and IndexedDB rollback.
Run after node build.js: python3 tests/e2e-user-edits.py [artifact-directory].
All providers are mocked; uses a temporary browser context and local HTTP server.
"""
from browser_support import launch_chromium, browser_context
import json, pathlib, subprocess, os, shutil, socket, sys, tempfile
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-user-edits-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for mode,width in [('rp',1440),('messenger',1440),('rp',390),('messenger',390)]:
   context=browser_context(browser, viewport={'width':width,'height':900 if width>500 else 844})
   context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   ids=page.evaluate('''async(mode)=>{
    const P=PRP,ctx=P.app.ctx,DB=P.store;
    const card=Object.assign(P.cardModel.blank(),{id:'card',name:'Аля',description:'Внимательная девушка.'});
    await DB.put('cards',card);await ctx.nav.loadAll();
    const id=await ctx.svc.chat.createChat(mode,card.id);
    if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-02T12:00:00.000Z'});
    const c=ctx.svc.chat;
    const user=await c.addUserMessage('ORIGINAL_USER');
    let msg=c.newMsg('assistant',user.id,'ORIGINAL_REPLY');await c.commitMessage(msg,msg.id);const replyId=msg.id;
    await c.addUserMessage('ORIGINAL_CONTINUATION');
    msg=c.newMsg('assistant',ctx.chat().leafId,'ORIGINAL_END');await c.commitMessage(msg,msg.id);
    for(const node of P.app.S.messages){delete node.parentSwipeIdx;await c.putMsg(node);}
    const source=P.memoryCycle.pathSnapshot(c.path()).at(-1);
    await DB.put('memories',{id:'old-memory',chatId:id,owner:card.id,event:'ORIGINAL_MEMORY',quote:'ORIGINAL_END',kind:'observed',source:{messageId:source.id,swipeIdx:source.swipeIdx,textHash:source.textHash,prefixHash:source.prefixHash}});
    await ctx.nav.openChat(id);
    P.app.S.settings.images.enabled=false;
    ctx.provider=()=>({id:'mock',kind:'openai',label:'Mock'});ctx.processingProvider=ctx.provider;
    P.llm.simple=async()=>JSON.stringify({events:[]});
    window.__rpCalls=[];
    P.llm.chat=async(_,messages)=>{
      if(messages[0].content.includes('Выполни независимый'))return {text:JSON.stringify({memories:[]})};
      window.__rpCalls.push(messages);return {text:'NEW_REPLY'};
    };
    window.__originalMessages=JSON.stringify((await DB.all('messages')).map(({parentSwipeIdx,updatedAt,...m})=>m).sort((a,b)=>a.id.localeCompare(b.id)));
    return {chatId:id,userId:user.id,replyId,oldLeaf:msg.id,oldMemory:ctx.svc.memory.visibleMemories().length};
   }''',mode)
   assert ids['oldMemory']==1,ids
   assert page.locator('.turn[data-mid="'+ids['replyId']+'"] [data-act=edit],.msg-row[data-mid="'+ids['replyId']+'"] [data-act=edit]').count()==0
   assert page.evaluate('(id)=>PRP.app.ctx.svc.chat.saveEdit(id,"HACKED")',ids['replyId']) is False
   page.click('[data-mid="'+ids['userId']+'"] [data-act=edit]')
   page.fill('#edit-'+ids['userId'],'EDITED_USER')
   page.click('[data-act=save-edit][data-id="'+ids['userId']+'"]')
   page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.turn && PRP.app.ctx.svc.chat.path().at(-1).swipes[0].text === "NEW_REPLY"')
   changed=page.evaluate('''async()=>{
    const ctx=PRP.app.ctx,path=ctx.svc.chat.path();
    const old=(await PRP.store.all('messages')).filter(m=>!m.editedFrom&&m.id!==path.at(-1).id).map(({parentSwipeIdx,updatedAt,...m})=>m).sort((a,b)=>a.id.localeCompare(b.id));
    return {leaf:path.at(-1).id,user:path[0].id,editedFrom:path[0].editedFrom,path:path.map(m=>PRP.tree.activeSwipe(m).text),
      originalUnchanged:JSON.stringify(old)===window.__originalMessages,memory:ctx.svc.memory.visibleMemories().length,
      calls:window.__rpCalls.length,request:window.__rpCalls[0].map(m=>m.content).join('\\n')};
   }''')
   assert changed['path']==['EDITED_USER','NEW_REPLY'] and changed['originalUnchanged'] and changed['memory']==0,changed
   assert changed['calls']==1 and 'EDITED_USER' in changed['request'] and 'ORIGINAL_CONTINUATION' not in changed['request'],changed
   page.click('[data-act=chat-menu]');page.click('.pop [data-act=tree-open]')
   page.wait_for_selector('.dialogue-map-modal')
   assert page.locator('.map-node').count()==6
   def open_map():
    if page.locator('.dialogue-map-modal').count()==0:
     page.click('[data-act=chat-menu]');page.click('.pop [data-act=tree-open]')
     page.wait_for_selector('.dialogue-map-modal')
   def select(node):
    open_map()
    page.click('.map-node[data-id="'+node+'"]')
    page.click('[data-act=tree-select]')
    page.wait_for_function('(id)=>PRP.app.ctx.chat().leafId===id && !PRP.app.S.turn',arg=node)
   assert page.locator('.map-inspector').count()==0
   select(ids['oldLeaf'])
   assert page.evaluate('PRP.app.ctx.svc.memory.visibleMemories().length')==1
   assert page.evaluate('PRP.app.ctx.svc.chat.path().map(m=>PRP.tree.activeSwipe(m).text)')==['ORIGINAL_USER','ORIGINAL_REPLY','ORIGINAL_CONTINUATION','ORIGINAL_END']
   select(changed['leaf'])
   open_map()
   assert page.locator('.map-node').count()==6
   assert page.locator('.map-inspector').count()==0
   page.screenshot(path=str(out/f'tree-{mode}-{width}.png'))
   page.click('.map-node[data-id="'+ids['userId']+'"]')
   assert 'ORIGINAL_USER' in page.inner_text('.map-message')
   assert page.evaluate('PRP.app.ctx.chat().leafId')==changed['leaf'], 'Preview must not switch branches'
   page.click('[data-act=map-zoom][data-dir="-1"]')
   assert '80%' in page.inner_text('.map-controls')
   page.click('[data-act=map-center]')
   assert page.evaluate('window.__rpCalls.length')==1
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal page overflow'
   page.click('[data-act=modal-close]')
   # Abort after the new user put was queued but before its chat commit.
   page.evaluate('''()=>{
    window.__savedPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...rest){
      if(this.name==='chats')throw new Error('Fixture chat put failure');
      return window.__savedPut.call(this,value,...rest);
    };
   }''')
   page.click('[data-mid="'+changed['user']+'"] [data-act=edit]')
   page.fill('#edit-'+changed['user'],'FAILED_EDIT')
   page.click('[data-act=save-edit][data-id="'+changed['user']+'"]')
   page.wait_for_function('!PRP.app.S.turn && document.querySelector(".editor") && !document.querySelector(".editor").disabled')
   aborted=page.evaluate('''async()=>{
    IDBObjectStore.prototype.put=window.__savedPut;
    return {size:(await PRP.store.all('messages')).length,leaf:PRP.app.ctx.chat().leafId,calls:window.__rpCalls.length};
   }''')
   assert aborted=={'size':6,'leaf':changed['leaf'],'calls':1},aborted
   assert page.input_value('#edit-'+changed['user'])=='FAILED_EDIT'
   page.click('[data-act=cancel-edit]')
   page.reload(wait_until='domcontentloaded');page.wait_for_selector('.chat-head')
   persisted=page.evaluate('({leaf:PRP.app.ctx.chat().leafId,path:PRP.app.ctx.svc.chat.path().map(m=>PRP.tree.activeSwipe(m).text)})')
   assert persisted=={'leaf':changed['leaf'],'path':['EDITED_USER','NEW_REPLY']},persisted
   page.evaluate('''async()=>{
    const ctx=PRP.app.ctx,leaf=ctx.svc.chat.path().at(-1);
    leaf.swipes.push({text:'SECOND_REPLY_VARIANT',sceneOps:[],createdAt:Date.now()});await ctx.svc.chat.putMsg(leaf);
    const newer=await PRP.store.get('messages',leaf.id);newer.swipes[0].images=[{id:'NEWER_IMAGE_RESULT',status:'done'}];await PRP.store.put('messages',newer);
   }''')
   page.click('[data-act=chat-menu]');page.click('.pop [data-act=tree-open]')
   page.click('.map-node[data-id="'+changed['leaf']+'"]')
   page.select_option('[data-map-variant]','1')
   assert 'SECOND_REPLY_VARIANT' in page.inner_text('.map-message')
   page.click('[data-act=tree-select]')
   page.wait_for_function('!PRP.app.S.turn && PRP.tree.activeSwipe(PRP.app.ctx.svc.chat.path().at(-1)).text==="SECOND_REPLY_VARIANT"')
   assert page.evaluate('''async()=>{const m=await PRP.store.get('messages',PRP.app.ctx.chat().leafId);return m.swipes[0].images[0].id;}''')=='NEWER_IMAGE_RESULT'
   assert errors==[],errors
   results.append({'mode':mode,'width':width,'result':'PASS','oldMessagesRetained':changed['originalUnchanged'],'newBranch':persisted['path'],'transactionAbort':aborted,'runtimeErrors':errors})
   context.close()
  browser.close()
 (out/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 print(json.dumps(results,ensure_ascii=False))
finally:
 server.terminate();server.wait()
