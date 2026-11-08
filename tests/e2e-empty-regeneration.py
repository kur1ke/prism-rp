"""A10: empty/failed/cancelled regeneration retains the saved selected swipe."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
def snapshot(page):
 return page.evaluate('''async()=>{const DB=PRP.store;return {message:await DB.get('messages',PRP.app.ctx.chat().leafId),
  chat:await DB.get('chats',PRP.app.S.chatId),memories:await DB.all('memories'),reflections:await DB.all('reflections'),
  receipts:await DB.all('memorySources'),images:await DB.all('images')};}''')
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for mode in ['rp','messenger']:
   for provider in ['perchance','openai']:
    for width in [1440,390]:
     context=browser_context(browser,viewport={'width':width,'height':900});page=context.new_page();errors=[]
     page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
     page.evaluate('''async({mode,provider})=>{
      const {ctx,S}=PRP.app,DB=PRP.store;
      await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Мира',description:'Библиотекарь.'}));
      await ctx.nav.loadAll();const id=await ctx.svc.chat.createChat(mode,'card');
      if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-08T12:00:00.000Z'});
      const u=await ctx.svc.chat.addUserMessage('Привет');
      const m=ctx.svc.chat.newMsg('assistant',u.id,'OLD_REPLY');m.swipes[0].reasoning='KEEP_REASONING';
      m.swipes.push({text:'OTHER_REPLY',createdAt:1});await ctx.svc.chat.commitMessage(m,m.id);await ctx.nav.openChat(id);
      S.settings.providers=[{id:'fixture',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
      S.settings.activeProvider=provider==='openai'?'fixture':'perchance';S.settings.images.enabled=false;
      S.settings.autoContext=false;S.settings.contextTokens=32000;await ctx.saveSettings();
      ctx.svc.memory.observe=async()=>({status:'disabled'});PRP.llm.simple=async()=>JSON.stringify({events:[]});
      window.__target=m.id;window.__calls=0;window.__response='';window.__outcome='empty';window.__waiting=false;
      const output=()=>__outcome==='spaces'?'  \\n  ':__outcome==='thinking'?'<think>internal reasoning only</think>':__outcome==='success'?__response:'';
      window.ai=request=>{
       if(request.getMetaObject)return {idealMaxContextTokens:32000};__calls++;
       if(__outcome==='error')return Promise.reject(Error('FIXTURE_PROVIDER_ERROR'));
       if(__outcome==='cancelled'){
        __waiting=true;const promise=new Promise(resolve=>window.__late=()=>resolve({generatedText:'LATE_LEAK'}));
        promise.stop=()=>{};return promise;
       }return Promise.resolve({generatedText:output()});
      };
      const original=window.fetch;window.fetch=async(url,opts)=>{
       if(String(url)==='https://fixture.invalid/v1/chat/completions'){
        __calls++;
        if(__outcome==='error')return new Response(JSON.stringify({error:{message:'FIXTURE_PROVIDER_ERROR'}}),{status:400,headers:{'Content-Type':'application/json'}});
        if(__outcome==='cancelled'){
         __waiting=true;return new Promise((resolve,reject)=>{
          opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
          window.__late=()=>resolve(new Response('data: [DONE]\\n\\n',{headers:{'Content-Type':'text/event-stream'}}));
         });
        }
        const nl=String.fromCharCode(10);return new Response('data: '+JSON.stringify({choices:[{delta:{content:output()}}]})+nl+nl+'data: [DONE]'+nl+nl,{headers:{'Content-Type':'text/event-stream'}});
       }return original(url,opts);
      };
     }''',{'mode':mode,'provider':provider})
     checks=[]
     for index,outcome in enumerate(['empty','spaces','thinking','error','cancelled']):
      before=snapshot(page)
      page.evaluate('o=>{window.__outcome=o;window.__waiting=false;}',outcome)
      count=page.evaluate('__calls');page.locator('[data-act=regen]').last.click()
      if outcome=='cancelled':
       page.wait_for_function('__waiting');page.click('[data-act=stop]')
      page.wait_for_function('(n)=>__calls===n+1 && !PRP.app.S.gen',arg=count)
      assert snapshot(page)==before,(mode,provider,width,outcome)
      assert 'Исходный ответ сохранён' in page.inner_text('#toast')
      if outcome=='cancelled':
       page.evaluate('__late()');page.wait_for_timeout(30);assert snapshot(page)==before
      page.evaluate('(text)=>{window.__outcome="success";window.__response=text;}',f'RETRY_{index}')
      page.locator('[data-act=regen]').last.click()
      page.wait_for_function('(n)=>__calls===n+2 && !PRP.app.S.gen && !PRP.app.S.tracking',arg=count)
      after=snapshot(page);old=before['message'];new=after['message']
      assert len(new['swipes'])==len(old['swipes'])+1
      assert new['swipes'][:len(old['swipes'])]==old['swipes']
      assert new['swipeIdx']==len(old['swipes']) and new['swipes'][-1]['text']==f'RETRY_{index}'
      assert new['parentId']==old['parentId'] and after['chat']['leafId']==new['id']
      checks.append(outcome)
     saved=snapshot(page)
     page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.chatId')
     assert snapshot(page)==saved and 'RETRY_4' in page.inner_text('#feed')
     assert errors==[],errors
     results.append({'mode':mode,'provider':provider,'width':width,'checks':checks});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
