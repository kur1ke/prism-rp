"""F18: real Chromium/IndexedDB, delayed reads, composer ownership and navigation failure.
Providers are replaced; no live Perchance/LLM. Run after node build.js.
"""
import base64,json,os,pathlib,shutil,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-navigation-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('PRISM_CHROMIUM') or shutil.which('chromium'))
  for mode,width in [('rp',1440),('messenger',1440),('rp',390),('messenger',390)]:
   context=browser.new_context(viewport={'width':width,'height':900})
   context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   page.evaluate("""async mode=>{
    const ctx=PRP.app.ctx,DB=PRP.store,S=ctx.S;
    for(const id of ['a','b','c']){
     const card=Object.assign(PRP.cardModel.blank(),{id:'card-'+id,name:'Character '+id,firstMes:'GREETING_'+id});
     await DB.put('cards',card);
    }
    await ctx.nav.loadAll();
    window.__ids={};
    for(const id of ['a','b','c']){
     const chatId=await ctx.svc.chat.createChat(mode,'card-'+id);window.__ids[id]=chatId;
     if(mode==='messenger')await ctx.svc.messenger.createFor(chatId,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
    }
    await ctx.nav.openChat(__ids.a);
    S.sendDrafts={[__ids.b]:'DRAFT_B'};
    window.__calls=[];
    ctx.svc.gen.send=async text=>{__calls.push({chatId:S.chatId,text});return ctx.svc.chat.addUserMessage(text);};
    window.__byIndex=DB.byIndex.bind(DB);
    window.__delay=(store)=>{
     window.__waiting=false;
     const gate=new Promise(resolve=>window.__release=resolve);
     DB.byIndex=async(name,key,id)=>{
      if(name===store && id===__ids.b){__waiting=true;await gate;}
      return __byIndex(name,key,id);
     };
    };
   }""",mode)
   page.fill('#input','INTENDED_FOR_A')
   page.evaluate("""()=>{__delay('messages');window.__nav=PRP.app.ctx.nav.openChat(__ids.b);}""")
   page.wait_for_function('window.__waiting')
   during=page.evaluate('({active:PRP.app.S.chatId,visible:document.querySelector("#input").dataset.chat,expected:__ids.a})')
   assert during['active']==during['visible']==during['expected'],during
   page.press('#input','Enter')
   page.wait_for_function('__calls.length===1')
   assert page.evaluate('__calls[0].chatId===__ids.a && __calls[0].text==="INTENDED_FOR_A"')
   page.evaluate('async()=>{__release();await __nav;PRP.store.byIndex=__byIndex;}')
   assert page.evaluate('PRP.app.S.chatId===__ids.b && document.querySelector("#input").dataset.chat===__ids.b')
   assert page.input_value('#input')=='DRAFT_B'
   # A stale/foreign composer may not send or clear B's saved draft.
   page.evaluate('document.querySelector("#input").dataset.chat=__ids.a')
   page.fill('#input','FOREIGN_COMPOSER');page.press('#input','Enter')
   assert page.evaluate('__calls.length')==1
   assert page.evaluate('PRP.app.S.sendDrafts[__ids.b]')=='DRAFT_B'
   assert page.input_value('#input')=='FOREIGN_COMPOSER'
   page.evaluate('document.querySelector("#input").dataset.chat=__ids.b')
   page.fill('#input','KEEP_B')
   # A read failing late in activation must leave the entire B context intact.
   failed=page.evaluate("""async()=>{
    const ctx=PRP.app.ctx,S=ctx.S;
    const before=JSON.stringify([S.chatId,S.cardId,S.messages,S.memories,S.reflections,S.worldOverlay,S.messengerEnv,S.imgUrls]);
    PRP.store.byIndex=async(name,key,id)=>{if(name==='images'&&id===__ids.a)throw Error('fixture load failure');return __byIndex(name,key,id);};
    let rejected=false;try{await ctx.nav.openChat(__ids.a);}catch(e){rejected=true;}
    PRP.store.byIndex=__byIndex;
    return {rejected,unchanged:before===JSON.stringify([S.chatId,S.cardId,S.messages,S.memories,S.reflections,S.worldOverlay,S.messengerEnv,S.imgUrls])};
   }""")
   assert failed=={'rejected':True,'unchanged':True},failed
   assert page.input_value('#input')=='KEEP_B'
   # Superseded late reads cannot steal focus or apply their loaded context.
   page.evaluate("""async()=>{
    const ctx=PRP.app.ctx;await ctx.nav.openChat(__ids.a);
    __delay('memories');window.__nav=ctx.nav.openChat(__ids.b);
   }""")
   page.wait_for_function('window.__waiting')
   page.evaluate('()=>{window.__newer=PRP.app.ctx.nav.openChat(__ids.c);__release();}')
   page.evaluate('async()=>{await Promise.all([__nav,__newer]);PRP.store.byIndex=__byIndex;}')
   assert page.evaluate('PRP.app.S.chatId===__ids.c && document.querySelector("#input").dataset.chat===__ids.c')
   assert page.evaluate('PRP.app.S.messages.every(m=>m.chatId===__ids.c)')
   # Leaving the chat while a read is pending also supersedes the activation.
   page.evaluate('()=>{__delay("messages");window.__nav=PRP.app.ctx.nav.openChat(__ids.b);}')
   page.wait_for_function('window.__waiting')
   page.evaluate('async()=>{PRP.app.ctx.nav.goCharacters();__release();await __nav;PRP.store.byIndex=__byIndex;}')
   assert page.evaluate('PRP.app.S.view==="characters" && PRP.app.S.chatId===__ids.c')
   page.evaluate('async()=>{await PRP.app.ctx.nav.openChat(__ids.a);}')
   assert page.evaluate('async()=>{const rows=await PRP.store.all("messages");return rows.filter(m=>m.role==="user").every(m=>m.chatId===__ids.a);}')
   if mode=='messenger':
    page.evaluate("""()=>{
     PRP.app.ctx.provider=()=>({id:'fixture',kind:'perchance'});
     const original=createImageBitmap;
     const gate=new Promise(resolve=>window.__releasePhoto=resolve);
     window.createImageBitmap=async file=>{const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const bitmap=await original(canvas);window.__photoWaiting=true;await gate;return bitmap;};
    }""")
    with page.expect_file_chooser() as chooser:
     page.click('[data-act=attach-photo]')
    chooser.value.set_files({'name':'test.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')})
    page.wait_for_function('window.__photoWaiting')
    page.evaluate('async()=>{await PRP.app.ctx.nav.openChat(__ids.b);__releasePhoto();}')
    page.wait_for_timeout(100)
    assert page.evaluate('__calls.length')==1, 'Late photo must not send into another chat'
    page.evaluate('async()=>{await PRP.app.ctx.nav.openChat(__ids.a);}')
   expected_chat=page.evaluate('__ids.a')
   page.reload(wait_until='domcontentloaded');page.wait_for_selector('#input')
   assert page.evaluate('PRP.app.S.chatId')==expected_chat
   assert 'INTENDED_FOR_A' in page.inner_text('#feed')
   assert errors==[],errors
   page.screenshot(path=str(out/f'navigation-{mode}-{width}.png'))
   results.append({'mode':mode,'width':width,'status':'PASS'})
   context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
