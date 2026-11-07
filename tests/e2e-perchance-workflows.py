"""F29: compiled Perchance HTML, streaming/continuation, image plugin and initiative.
External plugins are fixtures; this is not a live Perchance/model verification.
"""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
html=(root/'dist/perchance/html.html').read_text()
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   context=browser_context(browser,viewport={'width':width,'height':900});page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   context.add_init_script('''window.__aiCalls=[];window.__imageCalls=[];
    window.ai=request=>{
     if(request.getMetaObject)return {idealMaxContextTokens:5300};
     __aiCalls.push({instruction:request.instruction(),startWith:request.startWith?request.startWith():null});
     window.__request=request;return new Promise(resolve=>window.__complete=resolve);
    };
    window.image=async request=>{
     __imageCalls.push(request);const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
     canvas.getContext('2d').fillRect(0,0,32,32);return {dataUrl:canvas.toDataURL('image/png')};
    };
   ''')
   page.route('**/fixture-perchance.html',lambda route:route.fulfill(content_type='text/html; charset=utf-8',body=html))
   page.goto(f'http://127.0.0.1:{port}/fixture-perchance.html');page.wait_for_selector('.home-welcome')
   assert page.evaluate('PRP.app.ctx.provider().kind')=='perchance'
   assert page.evaluate('PRP.app.ctx.contextTokens()')==5300
   page.evaluate('''async()=>{
    const {ctx,S}=PRP.app,DB=PRP.store;
    await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Мира',description:'Взрослая библиотекарь.',
      personality:'Говорит коротко.',firstMes:'Здравствуйте.',image:{trigger:'short hair',negative:'CARD_NEGATIVE',loras:[{name:'CARD_LORA',weight:0.7}]}}));
    await ctx.nav.loadAll();const id=await ctx.svc.chat.createChat('rp','card');await ctx.nav.openChat(id);
    S.settings.images.enabled=false;S.settings.images.translate=false;S.settings.images.seed='123456';
    PRP.llm.simple=async()=>JSON.stringify({events:[]});ctx.svc.memory.observe=async()=>({status:'disabled'});
   }''')
   assert 'Perchance' in page.inner_text('.composer')
   page.fill('#input','Проверка.');page.click('[data-act=send]');page.wait_for_function('__aiCalls.length===1')
   page.evaluate("__request.onChunk({textChunk:'PLUGIN_STREAM'})")
   page.wait_for_function("document.querySelector('#feed').innerText.includes('PLUGIN_STREAM')")
   assert page.evaluate('PRP.app.S.gen!==null')
   assert page.evaluate('async()=>(await PRP.store.all("messages")).every(m=>!JSON.stringify(m).includes("PLUGIN_STREAM"))')
   page.evaluate("()=>{__request.onChunk({textChunk:' complete'});__complete({generatedText:'PLUGIN_STREAM complete'});}")
   page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.turn')
   first=page.evaluate('__aiCalls[0]')
   assert 'Ты играешь за' in first['instruction'] and 'Пользователь: Проверка.' in first['instruction']
   assert first['startWith']=='Мира:'
   page.click('.turn.last [data-act=continue]');page.wait_for_function('__aiCalls.length===2')
   assert page.evaluate('__aiCalls[1].startWith').startswith('Мира: PLUGIN_STREAM complete')
   page.evaluate("()=>{__request.onChunk({textChunk:' CONTINUED'});__complete({generatedText:' CONTINUED'});}")
   page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.turn')
   assert 'CONTINUED' in page.inner_text('.turn.last .prose')
   page.evaluate('PRP.app.S.settings.images.enabled=true')
   page.click('.turn.last [data-act=draw]');page.wait_for_selector('.turn.last .shot img')
   page.wait_for_function('!PRP.app.S.drawing.size')
   assert page.evaluate('__imageCalls.length')==1
   image=page.evaluate('__imageCalls[0]')
   assert image['resolution']=='768x768' and '<lora:' not in image['prompt'] and 'CARD_LORA' not in image['prompt']
   assert image['seed']==123456
   page.screenshot(path=str(out/f'perchance-rp-{width}.png'))
   page.evaluate('''async()=>{
    const {ctx,S}=PRP.app;S.settings.images.enabled=false;await ctx.saveSettings();
    const id=await ctx.svc.chat.createChat('messenger','card');
    await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-07T12:00:00.000Z'});
    await ctx.nav.openChat(id);window.__beforeEnv=JSON.stringify(await PRP.store.get('messengerEnvironments',id));
   }''')
   page.click('[data-act=initiative]');page.wait_for_function('__aiCalls.length===3')
   initiative=page.evaluate('__aiCalls[2]')
   closing='Реши за Мира: написать Пользователь сейчас первым или нет. Если нет — ответь ровно [no-message]. Если да — только сообщение Мира, без пометок и без текста за Пользователь.'
   assert initiative['instruction'].rstrip().endswith(closing)
   assert 'Проверка инициативы' in initiative['instruction']
   assert '"role":"user"' not in initiative['instruction'] and '\nПользователь:' not in initiative['instruction']
   assert 'Напиши следующее сообщение' not in initiative['instruction']
   assert initiative['startWith']=='' # Messenger uses a body-only transport, not the retired name seed.
   page.evaluate("()=>{__request.onChunk({textChunk:'PLUGIN_INITIATIVE'});__complete({generatedText:'PLUGIN_INITIATIVE'});}")
   page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.turn')
   saved=page.evaluate('''async()=>{const {ctx}=PRP.app,path=ctx.svc.chat.path();return {
    path:path.map(m=>({role:m.role,text:PRP.tree.activeSwipe(m).text,initiative:PRP.tree.activeSwipe(m).initiative})),
    sameEnv:__beforeEnv===JSON.stringify(await PRP.store.get('messengerEnvironments',ctx.chat().id))};}''')
   assert len(saved['path'])==1 and saved['path'][0]['role']=='assistant'
   assert saved['path'][0]['text']=='PLUGIN_INITIATIVE' and saved['path'][0]['initiative']['trigger']=='user-check'
   assert saved['sameEnv']
   page.reload();page.wait_for_selector('.msg-row.last .ini-tag')
   assert 'PLUGIN_INITIATIVE' in page.inner_text('#feed') and page.evaluate('PRP.app.ctx.contextTokens()')==5300
   assert errors==[],errors
   results.append({'width':width,'status':'PASS','compiledHtml':True,'streaming':True,'continueSeed':True,'image':True,'initiative':True});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
