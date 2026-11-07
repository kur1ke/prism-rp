"""F29: world-chat forms, branch provenance, relevance and reload in real storage."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   context=browser_context(browser,viewport={'width':width,'height':900});page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
   page.evaluate('''async()=>{
    const {ctx,S}=PRP.app,DB=PRP.store;
    await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Мира',firstMes:'Вера оставила письмо.'}));
    await DB.put('worldPacks',{id:'pack',schema:1,name:'Мир',facts:[
     {id:'home',text:'WF-HOME: Вера живёт в городе.',entities:['Вера'],timeline:'canon'},
     {id:'disabled',text:'WF-DISABLED: Вера знает секрет.',entities:['Вера']},
     {id:'unrelated',text:'WF-UNRELATED: Маяк закрыт.',entities:['Маяк']}]});
    await DB.put('worldLenses',{id:'lens',cardId:'card',packId:'pack',
     overrides:[{id:'override',targetFactId:'home',text:'WF-OVERRIDE: Вера живёт у реки.'}],additions:[],disabledFactIds:['disabled']});
    await ctx.nav.loadAll();const id=await ctx.svc.chat.createChat('rp','card');await ctx.nav.openChat(id);
    S.settings.images.enabled=false;S.settings.autoContext=false;S.settings.contextTokens=32000;
    S.drawerOpen=true;S.tab='world';ctx.ui.renderAll();
   }''')
   page.wait_for_selector('#wc-timeline')
   body=page.inner_text('#drawer-body')
   assert all(s in body for s in ['Мир чата','WF-OVERRIDE','таймлайн не выбран','выключено линзой']), body
   assert page.evaluate('PRP.app.ctx.svc.worldChat.context().facts.length')==0
   page.fill('#wc-timeline','canon');page.click('[data-act=wc-sel-save]')
   page.wait_for_function('document.querySelector("#toast").innerText.includes("Таймлайн и вариант чата сохранены")')
   page.click('[data-act=wc-new]');page.wait_for_selector('#wc-text')
   assert page.is_checked('input[name=wc-scope][value=branch]')
   page.fill('#wc-text','WF-BRANCH: Вера вступила в клуб.');page.fill('#wc-ent',' Вера, , Борис ');page.fill('#wc-top',' клуб, книги ');page.fill('#wc-loc',' библиотека, ');page.click('[data-act=wc-save]')
   page.wait_for_function('PRP.app.S.worldOverlay.entries.length===1')
   overlay=page.evaluate('PRP.app.S.worldOverlay');entry=overlay['entries'][0]
   assert overlay['timeline']=='canon' and entry['scope']=='branch' and entry['op']=='assert'
   assert entry['provenance']['messageIds'] and entry['provenance']['anchorId']
   assert entry['fact']['entities']==['Вера','Борис'],entry
   assert entry['fact']['topics']==['клуб','книги'] and entry['fact']['locations']==['библиотека']
   selected=page.evaluate('PRP.app.ctx.svc.worldChat.context().facts')
   texts=json.dumps(selected,ensure_ascii=False)
   assert 'WF-BRANCH' in texts and 'WF-OVERRIDE' in texts
   assert all(s not in texts for s in ['WF-HOME','WF-DISABLED','WF-UNRELATED'])
   branch=page.evaluate('''()=>{
    const {ctx,S}=PRP.app,c=ctx.chat(),keep=c.leafId;
    const anchor=S.messages.find(m=>m.id===S.worldOverlay.entries[0].provenance.anchorId);
    c.leafId=anchor.parentId;const off=ctx.svc.worldChat.canon().facts.some(f=>f.text.includes('WF-BRANCH'));
    c.leafId=keep;const on=ctx.svc.worldChat.canon().facts.some(f=>f.text.includes('WF-BRANCH'));return {off,on};
   }''')
   assert branch=={'off':False,'on':True}
   page.evaluate('''()=>{
    const {ctx,S}=PRP.app;S.drawerOpen=false;ctx.ui.renderAll();
    S.settings.providers=[{id:'fixture',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
    S.settings.activeProvider='fixture';ctx.svc.memory.observe=async()=>({status:'disabled'});
    PRP.llm.simple=async()=>JSON.stringify({events:[]});window.__calls=[];
    const original=window.fetch;window.fetch=async(url,opts)=>{
     if(String(url)==='https://fixture.invalid/v1/chat/completions'){
      __calls.push(JSON.parse(opts.body));const nl=String.fromCharCode(10);
      return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Вера открыла новую лавку. MODEL_WORLD_SENTINEL'}}]})+nl+nl+'data: [DONE]'+nl+nl,
       {status:200,headers:{'Content-Type':'text/event-stream'}});
     }return original(url,opts);
    };
   }''')
   page.fill('#input','Как дела у Веры?');page.click('[data-act=send]')
   page.wait_for_function('__calls.length===1 && !PRP.app.S.gen && !PRP.app.S.turn')
   messages=page.evaluate('__calls[0].messages')
   system='\n'.join(m['content'] for m in messages if m['role']=='system')
   assert 'WF-BRANCH' in system and 'WF-OVERRIDE' in system
   assert all(s not in system for s in ['WF-HOME','WF-DISABLED','WF-UNRELATED'])
   assert page.evaluate('PRP.app.S.worldOverlay')==overlay
   page.evaluate("PRP.app.S.drawerOpen=true;PRP.app.S.tab='world';PRP.app.ctx.ui.renderAll()")
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.wait_for_function('''()=>{const d=document.querySelector('.drawer.open'),b=d.getBoundingClientRect();
    const body=document.querySelector('#drawer-body');return b.left>=-1 && b.right<=innerWidth+1 && body.scrollWidth<=body.clientWidth+1;}''')
   page.screenshot(path=str(out/f'world-chat-{width}.png'))
   page.evaluate("PRP.app.S.settings.developerMode=true;PRP.app.S.drawerOpen=false;PRP.app.ctx.ui.renderAll()")
   page.click('[data-act=debug-open]');page.wait_for_selector('.debug-modal')
   assert 'Отбор мира' in page.inner_text('.debug-modal') and 'релевантных' in page.inner_text('.debug-modal')
   page.screenshot(path=str(out/f'world-report-{width}.png'))
   page.click('[data-act=modal-close]')
   page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.worldOverlay && PRP.app.S.worldOverlay.entries.length===1')
   assert page.evaluate('PRP.app.S.worldOverlay')==overlay
   assert page.evaluate('PRP.app.ctx.svc.worldChat.canon().facts.some(f=>f.text.includes("WF-BRANCH"))')
   assert errors==[],errors
   results.append({'width':width,'status':'PASS'});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
