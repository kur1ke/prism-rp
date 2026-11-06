"""A08: real manual state UI, Tracker, prompt, IndexedDB and reload."""
from browser_support import launch_chromium, browser_context
import json,pathlib,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-a08-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   context=browser_context(browser,viewport={'width':width,'height':900})
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   page.evaluate('''async()=>{
    const ctx=PRP.app.ctx,DB=PRP.store,t=Date.parse('2026-11-06T10:00:00Z');
    const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля'});
    const chat={id:'chat',cardId:'card',mode:'messenger',leafId:'old',createdAt:t};
    const m={id:'old',chatId:'chat',parentId:null,role:'assistant',swipeIdx:0,createdAt:t,swipes:[{
     text:'Я в старом месте.',createdAt:t,messengerAt:{at:new Date(t).toISOString()},stateEvents:[{
      actor:'char',field:'location',action:'set',value:'старом месте',certainty:'reported',evidence:'Я в старом месте.'}]}]};
    const env=PRP.messengerEnv.blank('chat',{timeZone:'UTC',timeMode:'manual',manualNow:new Date(t+1000).toISOString()});
    await DB.importAll({app:'prism-rp',version:8,cards:[card],chats:[chat],messages:[m],messengerEnvironments:[env]},true);
    await ctx.nav.loadAll();await ctx.nav.openChat('chat');
    PRP.app.S.drawerOpen=true;PRP.app.S.tab='scene';ctx.ui.renderAll();
   }''')
   page.locator('[data-act=env-edit]').click()
   page.locator('#env-location').fill('НОВОЕ МЕСТО')
   page.locator('[name=env-scope][value=chat]').check()
   page.locator('[data-act=env-save]').click()
   page.wait_for_function('!PRP.app.S.envEdit && PRP.app.ctx.svc.messenger.context().world.location==="НОВОЕ МЕСТО"')
   assert page.evaluate('PRP.app.ctx.svc.state.context().character.location')=='НОВОЕ МЕСТО'
   assert page.evaluate('PRP.app.ctx.svc.prism.build(PRP.app.ctx.svc.chat.path()).messages.some(m=>m.content.includes("НОВОЕ МЕСТО"))')
   assert page.evaluate('(async()=> (await PRP.store.get("messengerEnvironments","chat")).events.at(-1).patch.location)()')=='НОВОЕ МЕСТО'
   page.reload();page.wait_for_selector('.chat-head')
   assert page.evaluate('PRP.app.ctx.svc.messenger.context().world.location')=='НОВОЕ МЕСТО'
   page.evaluate('''async()=>{
    const ctx=PRP.app.ctx,t=Date.parse('2026-11-06T10:00:02Z');
    const m=ctx.svc.chat.newMsg('assistant','old','Я в парке.');
    m.createdAt=t;m.swipes[0].createdAt=t;m.swipes[0].messengerAt={at:new Date(t).toISOString()};
    m.swipes[0].stateEvents=[{actor:'char',field:'location',action:'set',value:'парке',certainty:'reported',evidence:'Я в парке.'}];
    await ctx.svc.chat.commitMessage(m,m.id);
   }''')
   assert page.evaluate('PRP.app.ctx.svc.messenger.context().world.location')=='парке'
   page.reload();page.wait_for_selector('.chat-head')
   assert page.evaluate('PRP.app.ctx.svc.messenger.context().world.location')=='парке'
   assert errors==[],errors
   results.append({'width':width,'manualUI':'PASS','prompt':'PASS','laterReport':'PASS','reload':'PASS','runtimeErrors':errors})
   context.close()
  browser.close()
 (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:server.terminate();server.wait()
