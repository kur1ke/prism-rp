"""Continue button: real adapters, visible empty-result feedback, retry and native IDB."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
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
      await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Мира',description:'Взрослая библиотекарь.'}));
      await ctx.nav.loadAll();const id=await ctx.svc.chat.createChat(mode,'card');
      if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-08T12:00:00.000Z'});
      const u=await ctx.svc.chat.addUserMessage('Привет');
      const m=ctx.svc.chat.newMsg('assistant',u.id,'OLD_REPLY');await ctx.svc.chat.commitMessage(m,m.id);await ctx.nav.openChat(id);
      S.settings.providers=[{id:'fixture',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
      S.settings.activeProvider=provider==='openai'?'fixture':'perchance';S.settings.images.enabled=false;
      S.settings.autoContext=false;S.settings.contextTokens=32000;await ctx.saveSettings();
      ctx.svc.memory.observe=async()=>({status:'disabled'});PRP.llm.simple=async()=>JSON.stringify({events:[]});
      window.__calls=[];window.__empty=true;window.__target=m.id;
      window.ai=request=>{
       if(request.getMetaObject)return {idealMaxContextTokens:32000};
       __calls.push({instruction:request.instruction(),seed:request.startWith()});
       if(!__empty && innerWidth>400)request.onChunk({textChunk:'NEW_CONTINUATION'});
       return Promise.resolve({generatedText:request.startWith()+(__empty?'':'NEW_CONTINUATION')});
      };
      const original=window.fetch;window.fetch=async(url,opts)=>{
       if(String(url)==='https://fixture.invalid/v1/chat/completions'){
        const body=JSON.parse(opts.body);__calls.push(body);const nl=String.fromCharCode(10),content=__empty?'':'NEW_CONTINUATION';
        return new Response('data: '+JSON.stringify({choices:[{delta:{content}}]})+nl+nl+'data: [DONE]'+nl+nl,{headers:{'Content-Type':'text/event-stream'}});
       }return original(url,opts);
      };
     }''',{'mode':mode,'provider':provider})
     before=page.evaluate('async()=>({message:await PRP.store.get("messages",__target),chat:await PRP.store.get("chats",PRP.app.S.chatId)})')
     page.locator('[data-act=continue]').last.click()
     page.wait_for_function('__calls.length===1 && !PRP.app.S.gen')
     assert 'Модель не вернула текст продолжения' in page.inner_text('#toast')
     assert page.evaluate('async()=>({message:await PRP.store.get("messages",__target),chat:await PRP.store.get("chats",PRP.app.S.chatId)})')==before
     if provider=='perchance':
      call=page.evaluate('__calls[0]')
      assert (call['instruction']+call['seed']).count('OLD_REPLY')==1
      assert call['instruction'].splitlines()[-1].startswith('Продолжи уже начатое сообщение Мира')
     page.evaluate('window.__empty=false')
     page.locator('[data-act=continue]').last.click();page.wait_for_function('__calls.length===2 && !PRP.app.S.gen')
     saved=page.evaluate('PRP.store.get("messages",__target)')
     assert saved['swipes'][saved.get('swipeIdx',0)]['text']=='OLD_REPLY NEW_CONTINUATION'
     assert len(saved['swipes'])==1 and saved['parentId']==before['message']['parentId']
     page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.chatId')
     assert 'OLD_REPLY NEW_CONTINUATION' in page.inner_text('#feed')
     assert errors==[],errors
     results.append({'mode':mode,'provider':provider,'width':width,'status':'PASS'});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
