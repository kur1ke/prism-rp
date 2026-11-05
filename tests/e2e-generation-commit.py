"""F19: real IndexedDB abort, transient stream, retry and reload. Remote AI mocked."""
from browser_support import launch_chromium, browser_context
import json, os, pathlib, shutil, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1]
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-f19-'))
out.mkdir(parents=True, exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
server = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
results = []
try:
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for mode in ['rp', 'messenger']:
            for width in [1440, 390]:
                context = browser_context(browser, viewport={'width': width, 'height': 900})
                context.add_init_script('window.__PRP_TEST_MIRROR=true')
                page = context.new_page(); errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
                page.evaluate('''async mode => {
                  const {ctx,S}=PRP.app, DB=PRP.store, chat=ctx.svc.chat;
                  const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'Внимательная.'});
                  await DB.put('cards',card); await ctx.nav.loadAll();
                  const id=await chat.createChat(mode,card.id);
                  if(mode==='messenger') await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
                  const user=await chat.addUserMessage('QUESTION');
                  const reply=chat.newMsg('assistant',user.id,'OLD_REPLY');
                  await chat.commitMessage(reply,reply.id);
                  // A continuation bound to the old variant must survive regen.
                  await chat.addUserMessage('OLD_CONTINUATION');
                  window.__child=chat.path().at(-1).id;
                  await chat.selectBranch(reply.id);
                  await ctx.nav.openChat(id);
                  window.__reply=reply.id;
                  S.settings.images.enabled=false; S.settings.autoMemory=false;
                  ctx.provider=()=>({id:'mock',kind:'openai',label:'Mock'}); ctx.processingProvider=ctx.provider;
                  PRP.llm.simple=async()=>JSON.stringify({events:[]});
                  window.__calls=0;
                  PRP.llm.chat=async(_p,_m,opts)=>{
                    __calls++; opts.onDelta({text:'NEW_REPLY'});
                    await new Promise(r=>window.__finishModel=r);
                    return {text:'NEW_REPLY'};
                  };
                  window.__snapshot=async()=>JSON.stringify({
                    messages:S.messages,chat:ctx.chat(),
                    dbMessages:(await DB.all('messages')).sort((a,b)=>a.id.localeCompare(b.id)),dbChat:await DB.get('chats',id)});
                  window.__before=await __snapshot();
                  window.__put=IDBObjectStore.prototype.put;
                  window.__abortStore='chats'; window.__queuedMessage=false;
                  IDBObjectStore.prototype.put=function(value,...rest){
                    if(this.name==='messages') __queuedMessage=true;
                    if(this.name===__abortStore) throw Error('F19 forced transaction abort');
                    return __put.call(this,value,...rest);
                  };
                  window.__start=operation=>{
                    window.__finishModel=null; window.__failure=null; window.__done=false;
                    window.__operation=ctx.svc.gen.generate(__reply,operation).then(async r=>{
                      if(r)await r.post;
                    }).catch(e=>{__failure=e.message;}).finally(()=>{__done=true;});
                  };
                }''', mode)
                for operation in ['regen', 'continue']:
                    # Abort at either put: the latter occurs after the message request is queued.
                    for store in ['messages', 'chats']:
                        page.evaluate('(store)=>{__abortStore=store;__queuedMessage=false;}', store)
                        page.evaluate('__start', operation)
                        page.wait_for_function('typeof __finishModel === "function"')
                        assert page.evaluate('async()=>await __snapshot()===__before'), 'stream mutated canonical reply'
                        assert page.locator('[id="text-'+page.evaluate('__reply')+'"]').count() > 0
                        page.evaluate('__finishModel()')
                        page.wait_for_function('__done')
                        assert page.evaluate('__failure') == 'F19 forced transaction abort'
                        assert page.evaluate('!PRP.app.S.gen')
                        assert page.evaluate('async()=>await __snapshot()===__before'), 'transaction abort changed saved or in-memory state'
                        assert 'OLD_REPLY' in page.locator('[data-mid="'+page.evaluate('__reply')+'"]').inner_text()
                        assert 'NEW_REPLY' not in page.locator('[data-mid="'+page.evaluate('__reply')+'"]').inner_text()
                        if store == 'chats': assert page.evaluate('__queuedMessage')
                page.evaluate('()=>{IDBObjectStore.prototype.put=__put;}')
                page.evaluate('__start("regen")')
                page.wait_for_function('typeof __finishModel === "function"')
                page.evaluate('__finishModel()'); page.wait_for_function('__done')
                assert page.evaluate('__failure') is None
                saved = page.evaluate('''async()=>{
                  const {ctx,S}=PRP.app,m=ctx.svc.chat.path().at(-1), db=await PRP.store.get('messages',m.id);
                  return {text:PRP.tree.activeSwipe(m).text,index:m.swipeIdx,swipes:m.swipes.length,
                    preview:ctx.chat().preview,old:m.swipes[0].text,child:S.messages.find(m=>m.id===__child).parentSwipeIdx,
                    same:JSON.stringify(m.swipes)===JSON.stringify(db.swipes)&&m.swipeIdx===db.swipeIdx};
                }''')
                assert saved == {'text':'NEW_REPLY','index':1,'swipes':2,'preview':'NEW_REPLY','old':'OLD_REPLY','child':0,'same':True}, saved
                page.screenshot(path=str(out/f'{mode}-{width}.png'))
                page.reload(); page.wait_for_selector('.chat-head')
                assert page.evaluate('PRP.tree.activeSwipe(PRP.app.ctx.svc.chat.path().at(-1)).text') == 'NEW_REPLY'
                assert page.evaluate('PRP.app.ctx.chat().preview') == 'NEW_REPLY'
                # Selecting the saved continuation restores its original parent variant.
                assert page.evaluate('''async()=>{
                  const c=PRP.app.ctx.svc.chat,child=PRP.app.S.messages.find(m=>PRP.tree.activeSwipe(m).text==='OLD_CONTINUATION');
                  await c.selectBranch(child.id);
                  return c.path().map(m=>PRP.tree.activeSwipe(m).text);
                }''') == ['QUESTION','OLD_REPLY','OLD_CONTINUATION']
                assert errors == [], errors
                results.append({'mode':mode,'width':width,'abortCases':4,'retryReloadProvenance':'PASS','runtimeErrors':errors})
                context.close()
        browser.close()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False))
finally:
    server.terminate(); server.wait()
