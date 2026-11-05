"""F21: real IndexedDB conditional image commit, concurrent writers and rollback."""
from browser_support import launch_chromium, browser_context
import json, os, pathlib, shutil, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1]
out = pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-f21-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
    with sync_playwright() as p:
        browser=launch_chromium(p)
        for mode in ['rp','messenger']:
            for width in [1440,390]:
                context=browser_context(browser, viewport={'width':width,'height':900})
                context.add_init_script('window.__PRP_TEST_MIRROR=true')
                page=context.new_page(); errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
                checks=page.evaluate('''async mode=>{
                  const {ctx,S}=PRP.app,DB=PRP.store,chat=ctx.svc.chat,assert=(v,m)=>{if(!v)throw Error(m);};
                  const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'Внимательная.'});
                  await DB.put('cards',card);await ctx.nav.loadAll();
                  Object.assign(S.settings.images,{enabled:true,backend:'a1111',url:'http://unused',translate:false,drawPromptMode:'tags'});
                  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
                  canvas.getContext('2d').fillRect(0,0,512,512);const png=canvas.toDataURL('image/png');
                  const originalBackend=PRP.imgBackends.generate,originalRmw=DB.readModifyWrite,originalGet=DB.get;
                  const checks=[],deleted=[];let source;
                  for(const change of ['delete-message','delete-image','edit-source','fresh-fields','ancestor','superseded']){
                    const id=await chat.createChat(mode,card.id);
                    if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
                    const parent=await chat.addUserMessage('USER');
                    const draft=chat.newMsg('assistant',parent.id,'PHOTO');draft.swipes[0].draws=[{prompt:'1girl, portrait',ratio:'1:1'}];
                    const msg=await chat.commitMessage(draft,draft.id),sw=msg.swipes[0];
                    await ctx.nav.openChat(id);
                    source=S.messages.find(m=>m.id===msg.id);
                    let backendDone=false,independentReads=0,txCalls=0;
                    DB.get=(...args)=>{if(backendDone)independentReads++;return originalGet(...args);};
                    PRP.imgBackends.generate=async()=>{backendDone=true;return {dataUrl:png,seed:42,info:{width:512,height:512}};};
                    DB.readModifyWrite=async(...args)=>{
                      txCalls++;
                      const latest=await originalGet('messages',msg.id),im=latest.swipes[0].images[0];
                      if(change==='delete-message'){await DB.mutateBatch({deletes:[['messages',msg.id],['images',im.id]]});deleted.push(msg.id);}
                      else if(change==='ancestor'){const p=await originalGet('messages',parent.id);p.swipes[0].text='CHANGED_PARENT';await DB.put('messages',p);}
                      else{
                        if(change==='delete-image')latest.swipes[0].images=[];
                        if(change==='edit-source')latest.swipes[0].text='CHANGED_SOURCE';
                        if(change==='fresh-fields'){latest.concurrent='KEEP';latest.swipes[0].stateCorrections=[{actor:'char',field:'location',value:'NEW'}];}
                        if(change==='superseded'){im.operationId='NEWER_OPERATION';im.prompt='KEEP_NEW_PROMPT';}
                        await DB.put('messages',latest);
                      }
                      return originalRmw(...args);
                    };
                    await ctx.svc.images.draw(source,source.swipes[0],source.swipes[0].draws[0]);
                    DB.get=originalGet;DB.readModifyWrite=originalRmw;
                    const saved=await DB.get('messages',msg.id),images=await DB.byIndex('images','chatId',id);
                    assert(txCalls===1&&independentReads===0,change+': final validation must use one transaction');
                    assert(S.drawing.size===0,change+': lock');
                    if(change==='delete-message')assert(!saved,'message resurrected');
                    if(change==='delete-image')assert(saved.swipes[0].images.length===0,'image resurrected');
                    if(change==='edit-source')assert(saved.swipes[0].text==='CHANGED_SOURCE','edit lost');
                    if(change==='fresh-fields'){
                      assert(saved.concurrent==='KEEP'&&saved.swipes[0].stateCorrections[0].value==='NEW','fresh fields lost');
                      assert(saved.swipes[0].images[0].status==='done'&&images.length===1,'valid image missing');
                    }else assert(images.length===0,'stale image blob persisted');
                    if(change==='ancestor')assert(saved.swipes[0].images[0].status==='error','ancestor not checked');
                    if(change==='superseded')assert(saved.swipes[0].images[0].prompt==='KEEP_NEW_PROMPT','new operation overwritten');
                    checks.push(change+': PASS');
                  }
                  PRP.imgBackends.generate=originalBackend;
                  // Exercise the actual adapter's all-or-nothing boundary.
                  const key=source.id,before=await DB.get('messages',key),put=IDBObjectStore.prototype.put;
                  IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='images')throw Error('F21 second put abort');return put.call(this,value,...rest);};
                  let failed=false;
                  try{await DB.readModifyWrite(['messages','images'],[['messages',key]],([m])=>{
                    m.mustNotPersist=true;return [['messages',m],['images',{id:'abort-image',chatId:m.chatId,dataUrl:png}]];
                  });}catch(e){failed=e.message==='F21 second put abort';}
                  IDBObjectStore.prototype.put=put;
                  assert(failed&&JSON.stringify(await DB.get('messages',key))===JSON.stringify(before),'partial transaction persisted');
                  assert(!await DB.get('images','abort-image'),'orphan image on abort');checks.push('second-put rollback: PASS');
                  assert(await DB.readModifyWrite(['messages'],[['messages',key]],()=>null)===false,'conditional no-op');
                  assert(JSON.stringify(await DB.get('messages',key))===JSON.stringify(before),'no-op changed record');checks.push('no-op: PASS');
                  let syncRejected=false;
                  try{await DB.readModifyWrite(['messages'],[['messages',key]],()=>Promise.resolve([]));}catch(e){syncRejected=e instanceof TypeError;}
                  assert(syncRejected,'async callback accepted');checks.push('synchronous callback contract: PASS');
                  // A second connection queues deletion during the read callback.
                  // It must run after the first transaction, never between read and put.
                  const second=await new Promise((ok,fail)=>{const r=indexedDB.open('prism-rp-testing',8);r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});
                  let deletion;
                  await DB.readModifyWrite(['messages','images'],[['messages',key]],([m])=>{
                    deletion=new Promise((ok,fail)=>{const t=second.transaction(['messages','images'],'readwrite');
                      t.objectStore('messages').delete(key);t.objectStore('images').delete('queued-image');
                      t.oncomplete=()=>ok();t.onabort=()=>fail(t.error);});
                    return [['messages',m],['images',{id:'queued-image',chatId:m.chatId,dataUrl:png}]];
                  });
                  await deletion;second.close();deleted.push(key);
                  assert(!await DB.get('messages',key)&&!await DB.get('images','queued-image'),'writer interleaved inside transaction');
                  checks.push('second connection serialized: PASS');
                  window.__deleted=deleted;
                  return checks;
                }''',mode)
                deleted=page.evaluate('__deleted')
                page.reload();page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
                assert page.evaluate('async ids=>(await Promise.all(ids.map(id=>PRP.store.get("messages",id)))).every(m=>!m)',deleted)
                assert errors==[],errors
                results.append({'mode':mode,'width':width,'checks':checks,'reloadDeleted':'PASS','runtimeErrors':errors})
                context.close()
        browser.close()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False))
finally:
    server.terminate();server.wait()
