"""A03: swipe selection, preview and memory commit together in native IndexedDB."""
from browser_support import launch_chromium, browser_context
import json, pathlib, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-a03-'))
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
                context=browser_context(browser,viewport={'width':width,'height':900})
                context.add_init_script('window.__PRP_TEST_MIRROR=true')
                page=context.new_page(); errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
                page.evaluate('''async mode=>{
                  const {ctx,S}=PRP.app,DB=PRP.store,c=ctx.svc.chat;
                  await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Fixture'}));
                  await ctx.nav.loadAll();const id=await c.createChat(mode,'card');
                  if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
                  const user=await c.addUserMessage('QUESTION'),reply=c.newMsg('assistant',user.id,'OLD_REPLY');
                  reply.swipes.push({text:'ALT_REPLY',createdAt:2});
                  await c.commitMessage(reply,reply.id);window.__reply=reply.id;
                  await c.addUserMessage('OLD_CONTINUATION');window.__child=c.path().at(-1).id;
                  await c.selectBranch(reply.id);await ctx.nav.openChat(id);
                  window.__snapshot=async()=>JSON.stringify({messages:S.messages,chat:ctx.chat(),dbMessages:await DB.all('messages'),dbChat:await DB.get('chats',id)});
                  window.__before=await __snapshot();window.__put=IDBObjectStore.prototype.put;
                  window.__calls=0;PRP.llm.chat=async()=>{__calls++;throw Error('unexpected model call');};
                }''',mode)
                checks=[]
                for store in ['messages','chats']:
                    result=page.evaluate('''async store=>{
                      let queued=false,rejected=false;
                      IDBObjectStore.prototype.put=function(...args){if(this.name===store)throw Error('A03 forced abort');if(this.name==='messages')queued=true;return __put.apply(this,args);};
                      try{await PRP.app.ctx.svc.chat.swipe(__reply,1);}catch(e){rejected=e.message==='A03 forced abort';}
                      finally{IDBObjectStore.prototype.put=__put;}
                      return {rejected,unchanged:await __snapshot()===__before,unlocked:!PRP.app.S.turn,queued};
                    }''',store)
                    assert result['rejected'] and result['unchanged'] and result['unlocked'],(store,result)
                    if store=='chats':assert result['queued'],result
                    checks.append(store+' abort: PASS')
                result=page.evaluate('''async()=>{
                  const {ctx,S}=PRP.app,c=ctx.svc.chat,DB=PRP.store,original=DB.putAll;
                  let release;const gate=new Promise(r=>release=r);
                  DB.putAll=async entries=>{await gate;return original(entries);};
                  const pending=c.swipe(__reply,1);
                  const during=await __snapshot()===__before;
                  const second=await c.swipe(__reply,1);
                  release();const success=await pending;DB.putAll=original;
                  return {during,second,success,unlocked:!S.turn,index:c.path().at(-1).swipeIdx,preview:ctx.chat().preview};
                }''')
                assert result=={'during':True,'second':False,'success':True,'unlocked':True,'index':1,'preview':'ALT_REPLY'},result
                checks.append('pending, double click and success: PASS')
                # Return to the continuation: its original variant must be restored.
                assert page.evaluate('''async()=>{const c=PRP.app.ctx.svc.chat;await c.selectBranch(__child);return c.path().map(m=>PRP.tree.activeSwipe(m).text);}''')==['QUESTION','OLD_REPLY','OLD_CONTINUATION']
                page.evaluate('async()=>{await PRP.app.ctx.svc.chat.selectBranch(__reply);await PRP.app.ctx.svc.chat.swipe(__reply,1);}')
                checks.append('continuation provenance: PASS')
                page.reload();page.wait_for_selector('.chat-head')
                assert page.evaluate('PRP.tree.activeSwipe(PRP.app.ctx.svc.chat.path().at(-1)).text')=='ALT_REPLY'
                assert page.evaluate('PRP.app.ctx.chat().preview')=='ALT_REPLY'
                checks.append('reload: PASS')
                assert errors==[],errors
                results.append({'mode':mode,'width':width,'checks':checks})
                context.close()
        browser.close()
finally:
    server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
