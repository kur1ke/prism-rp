"""F23: import an adversarial backup through the real UI; no network or live model."""
from browser_support import launch_chromium, browser_context
import json,os,pathlib,shutil,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-import-html-'))
out.mkdir(parents=True,exist_ok=True)
bundle_path=os.environ.get('PRISM_TEST_BUNDLE')
payload='id"><img src=x onerror="window.__f23=1">'
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as pw:
  browser=launch_chromium(pw)
  for case in ['assist-id','assist-role','rp-id','messenger-live-id','image-ratio','image-size','image-seed','sampler','context','world-limit','prose-size']:
   context=browser_context(browser, viewport={'width':1100,'height':800})
   context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('dialog',lambda d:d.accept())
   if bundle_path:
    page.route('**/dist/standalone/index.html',lambda r:r.fulfill(content_type='text/html; charset=utf-8',body='<html><head><meta charset="utf-8"></head><body><script src="/f23-bundle.js"></script></body></html>'))
    page.route('**/f23-bundle.js',lambda r:r.fulfill(content_type='text/javascript; charset=utf-8',body=pathlib.Path(bundle_path).read_bytes()))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   backup=page.evaluate("""async({case:which,payload})=>{
    const ctx=PRP.app.ctx,DB=PRP.store;
    const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Character',firstMes:'SAFE_OPENING'});
    await DB.put('cards',card);await ctx.nav.loadAll();
    const chatId=await ctx.svc.chat.createChat('rp','card');
    const data=await DB.exportAll(),msg=data.messages[0];
    data.assist=[{id:'assistant',title:'Imported assistant',ctx:{},messages:[{id:'answer',role:'assistant',text:'SAFE_ANSWER'}]}];
    data.settings=data.settings.filter(r=>r.key!=='ui');
    if(which==='assist-id')data.assist[0].messages[0].id=payload;
    if(which==='assist-role')data.assist[0].messages[0].role=payload;
    if(which==='rp-id'||which==='messenger-live-id'){msg.id=payload;data.chats[0].leafId=payload;}
    if(which==='messenger-live-id')data.chats[0].mode='messenger';
    if(which.startsWith('image-')){
     const im={id:'image',status:'done',draw:'SAFE_IMAGE',ratio:'1:1',seed:123};
     if(which==='image-ratio')im.ratio=payload;
     if(which==='image-size'){im.w=payload;im.h=1;}
     if(which==='image-seed')im.seed=payload;
     msg.swipes[0].images=[im];
    }
    let app=data.settings.find(r=>r.key==='app');
    if(!app){app={key:'app',value:structuredClone(ctx.S.settings)};data.settings.push(app);}
    if(which==='sampler')app.value.sampler.temperature=payload;
    if(which==='context')app.value.contextTokens=payload;
    if(which==='world-limit')app.value.worldLimit=payload;
    if(which==='prose-size')app.value.proseSize=payload;
    return {data,chatId};
   }""",{'case':case,'payload':payload})
   page.locator('#file-backup').set_input_files({'name':'fixture.json','mimeType':'application/json','buffer':json.dumps(backup['data']).encode()})
   page.wait_for_function('PRP.app.S.assistList.some(a=>a.id==="assistant")')
   page.evaluate("""async({which,chatId,payload})=>{
    const ctx=PRP.app.ctx;
    if(which.startsWith('assist'))ctx.nav.openAssist('assistant');
    else if(which.startsWith('image')||which==='rp-id'||which==='messenger-live-id'){
     await ctx.nav.openChat(chatId);
     if(which==='messenger-live-id'){ctx.S.gen={msgId:payload,raw:'SAFE_LIVE'};ctx.ui.renderFeed();}
    }
    else ctx.ui.openSettings(which==='prose-size'?'look':'gen');
   }""",{'which':case,'chatId':backup['chatId'],'payload':payload})
   page.wait_for_timeout(100)
   state=page.evaluate("""()=>({executed:!!window.__f23,injected:document.querySelectorAll('img[onerror]').length})""")
   (out/(case+'.json')).write_text(json.dumps(state))
   assert state=={'executed':False,'injected':0},(case,state)
   if case=='assist-id':
    assert page.evaluate('(id)=>!!document.getElementById("text-"+id)',payload)
    assert 'SAFE_ANSWER' in page.inner_text('#feed')
   if case in ['rp-id','messenger-live-id']:assert page.evaluate('(id)=>!!document.getElementById("text-"+id)',payload)
   assert errors==[],errors
   results.append({'case':case,'status':'PASS'})
   context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
