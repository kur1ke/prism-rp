"""F14: rejected send retains draft and IndexedDB tree; providers are mocked."""
from browser_support import launch_chromium, browser_context
import json,os,pathlib,shutil,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-budget-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as pw:
  browser=launch_chromium(pw)
  for mode,width in [('rp',1440),('messenger',1440),('rp',390),('messenger',390)]:
   context=browser_context(browser, viewport={'width':width,'height':900})
   context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   page.evaluate("""async mode=>{
    const ctx=PRP.app.ctx,DB=PRP.store;
    const cd=Object.assign(PRP.cardModel.blank(),{id:'card',name:'N',description:'d'});
    await DB.put('cards',cd);await ctx.nav.loadAll();
    const id=await ctx.svc.chat.createChat(mode,'card');
    if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
    await ctx.nav.openChat(id);
    ctx.S.settings.images.enabled=false;ctx.S.settings.sampler.max_tokens=900;
    ctx.contextTokens=()=>1024;
    ctx.provider=()=>({id:'fixture',label:'Fixture',kind:'openai'});ctx.processingProvider=ctx.provider;
    window.__modelCalls=0;window.__observerCalls=0;
    PRP.llm.chat=async(_p,_messages,opts)=>{if(opts?.outputFormat==='json')return {text:JSON.stringify({memories:[]})};__modelCalls++;return {text:'SAFE_REPLY'};};
    PRP.llm.simple=async()=>{__observerCalls++;return JSON.stringify({events:[]});};
    window.__before=JSON.stringify({messages:await DB.all('messages'),chats:await DB.all('chats')});
   }""",mode)
   page.fill('#input','RETAIN_MY_DRAFT');page.click('[data-act=send]')
   page.wait_for_function('PRP.app.S.lastPrism && PRP.app.S.lastPrism.report.overflow')
   rejected=page.evaluate("""async()=>{
    const DB=PRP.store,r=PRP.app.S.lastPrism.report;
    return {budget:r.budget,overflow:r.overflow,calls:__modelCalls,observerCalls:__observerCalls,
     unchanged:__before===JSON.stringify({messages:await DB.all('messages'),chats:await DB.all('chats')})};
   }""")
   assert rejected=={'budget':124,'overflow':True,'calls':0,'observerCalls':0,'unchanged':True},rejected
   assert page.input_value('#input')=='RETAIN_MY_DRAFT'
   page.screenshot(path=str(out/f'overflow-{mode}-{width}.png'))
   page.evaluate('()=>{PRP.app.ctx.contextTokens=()=>8192;PRP.app.S.settings.sampler.max_tokens=700;}')
   page.click('[data-act=send]')
   page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.turn && PRP.app.ctx.svc.chat.path().at(-1)?.role==="assistant"')
   assert page.evaluate('__modelCalls')==1
   assert page.evaluate('PRP.app.ctx.svc.chat.path().map(m=>PRP.tree.activeSwipe(m).text)')==['RETAIN_MY_DRAFT','SAFE_REPLY']
   assert errors==[],errors
   results.append({'mode':mode,'width':width,'status':'PASS','overflow':rejected})
   context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
