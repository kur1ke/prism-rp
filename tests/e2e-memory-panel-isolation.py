"""F29: app Memory panel, chat isolation and inert legacy Experience archive."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
def memory_panel(page):
    if not page.locator('.drawer.open').count():page.click('[data-act=drawer]')
    page.click('[data-act=tab][data-tab=memory]');page.wait_for_function('document.querySelector("#drawer-body").innerText.includes("Experience")')
    assert page.locator('#x-event,[data-act=to-exp],[data-act=exp-save]').count()==0
    assert page.locator('#drawer-body textarea,#drawer-body input').count()==0
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   context=browser_context(browser,viewport={'width':width,'height':900});page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
   result=page.evaluate('''async()=>{
    const {ctx,S}=PRP.app,DB=PRP.store;
    await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'owner',name:'Мира',description:'Взрослая библиотекарь.'}));
    await ctx.nav.loadAll();const first=await ctx.svc.chat.createChat('rp','owner'),other=await ctx.svc.chat.createChat('rp','owner');
    const msg={id:'source',chatId:first,parentId:null,role:'assistant',swipeIdx:0,swipes:[{text:'Персонаж получил серебряный компас.'}],createdAt:1};
    const chat=await DB.get('chats',first);chat.leafId=msg.id;await DB.putAll([['messages',msg],['chats',chat]]);
    window.__archive=[{id:'unscoped',owner:'owner',event:'LEGACY_UNSCOPED_SENTINEL',createdAt:1},
     {id:'scoped',owner:'owner',chatId:first,event:'LEGACY_SCOPED_SENTINEL',createdAt:2}];
    await DB.putAll(__archive.map(x=>['experience',x]));await ctx.nav.loadAll();await ctx.nav.openChat(first);
    S.settings.providers=[{id:'fixture',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
    S.settings.activeProvider='fixture';S.settings.autoContext=false;S.settings.contextTokens=32000;S.settings.images.enabled=false;await ctx.saveSettings();
    window.__modelCalls=0;PRP.llm.chat=async(_provider,messages)=>{
     __modelCalls++;const data=JSON.parse(messages.find(m=>m.role==='user').content);
     return {text:JSON.stringify(data.sources?{memories:[{messageId:msg.id,quote:msg.swipes[0].text,event:msg.swipes[0].text,kind:'observed'}]}:
      {change:'changed',perspective:'EXPERIENCE_CHAT_ONE_SENTINEL'})};
    };
    const outcome=await ctx.svc.memory.observe(msg);ctx.ui.renderAll();
    window.__chats={first,other};return {status:outcome.status,calls:__modelCalls,archive:await DB.all('experience')};
   }''')
   assert result['status']=='reflected' and result['calls']==2,result
   memory_panel(page)
   assert 'EXPERIENCE_CHAT_ONE_SENTINEL' in page.inner_text('#drawer-body')
   assert 'LEGACY_' not in page.inner_text('#drawer-body')
   first_payload=page.evaluate('JSON.stringify(PRP.app.ctx.svc.prism.build(PRP.app.ctx.svc.chat.path()).messages)')
   assert 'EXPERIENCE_CHAT_ONE_SENTINEL' in first_payload and 'LEGACY_' not in first_payload
   ids=page.evaluate('__chats')
   page.evaluate('async id=>{await PRP.app.ctx.nav.openChat(id);}',ids['other'])
   memory_panel(page)
   assert 'EXPERIENCE_CHAT_ONE_SENTINEL' not in page.inner_text('#drawer-body') and 'LEGACY_' not in page.inner_text('#drawer-body')
   other_payload=page.evaluate('JSON.stringify(PRP.app.ctx.svc.prism.build(PRP.app.ctx.svc.chat.path()).messages)')
   assert 'EXPERIENCE_CHAT_ONE_SENTINEL' not in other_payload and 'LEGACY_' not in other_payload
   page.evaluate('async id=>{await PRP.app.ctx.nav.openChat(id);}',ids['first'])
   memory_panel(page)
   assert 'EXPERIENCE_CHAT_ONE_SENTINEL' in page.inner_text('#drawer-body')
   assert page.evaluate('__modelCalls')==2
   page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.chatId')
   assert page.evaluate('PRP.app.S.chatId')==ids['first']
   memory_panel(page)
   assert 'EXPERIENCE_CHAT_ONE_SENTINEL' in page.inner_text('#drawer-body') and 'LEGACY_' not in page.inner_text('#drawer-body')
   archived=page.evaluate('PRP.store.all("experience")')
   assert archived==result['archive'],archived
   assert 'chatId' not in next(r for r in archived if r['id']=='unscoped')
   assert 'LEGACY_' not in page.evaluate('JSON.stringify(PRP.app.ctx.svc.prism.build(PRP.app.ctx.svc.chat.path()).messages)')
   assert errors==[],errors
   page.screenshot(path=str(out/f'memory-{width}.png'),full_page=True)
   results.append({'width':width,'status':'PASS','chatIsolation':True,'archiveUnchanged':True,'reload':True});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
