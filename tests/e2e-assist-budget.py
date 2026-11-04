"""F17: assistant UI, real router/transports and IndexedDB; external models are fixtures."""
import json,os,pathlib,shutil,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-assist-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('PRISM_CHROMIUM') or shutil.which('chromium'))
  for kind,width in [('openai',1440),('perchance',1440),('openai',390),('perchance',390)]:
   context=browser.new_context(viewport={'width':width,'height':900})
   context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   page.evaluate(r"""async kind=>{
    const ctx=PRP.app.ctx,DB=PRP.store,tok=PRP.util.estimateTokens;
    const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'N',description:'d'.repeat(30000)});
    await DB.put('cards',card);await ctx.nav.loadAll();
    window.__calls=[];
    const verify=(used,reserve)=>{
     if(reserve!==ctx.S.lastAssistBudget.reserveTokens||used!==ctx.S.lastAssistBudget.used)throw Error('Fixture: budget differs from actual payload');
     if(used+reserve>ctx.contextTokens())throw Error('Fixture: request exceeds window');
     __calls.push({used,reserve});
    };
    window.ai=request=>{
     if(request.getMetaObject)return {idealMaxContextTokens:32000};
     verify(tok(request.instruction())+tok(request.startWith()),ctx.S.lastAssistBudget.reserveTokens);
     return Promise.resolve({generatedText:'ANSWER'});
    };
    const original=window.fetch;
    window.fetch=async(url,opts)=>{
     if(String(url)==='https://fixture.invalid/v1/chat/completions'){
      const req=JSON.parse(opts.body);
      verify(req.messages.reduce((n,m)=>n+tok(m.content)+4,0),req.max_tokens);
      const nl=String.fromCharCode(10);
      return new Response('data: '+JSON.stringify({choices:[{delta:{content:'ANSWER'}}]})+nl+nl+'data: [DONE]'+nl+nl,
       {status:200,headers:{'Content-Type':'text/event-stream'}});
     }
     return original(url,opts);
    };
    ctx.S.settings.providers=[{id:'api',kind:'openai',name:'API',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
    ctx.S.settings.activeProvider=kind==='openai'?'api':'perchance';
    ctx.S.settings.autoContext=false;ctx.S.settings.contextTokens=4096;ctx.S.settings.sampler.max_tokens=4000;
    ctx.nav.openAssist(null,{cardId:'card',chatId:null});
    window.__initial=JSON.stringify(ctx.S.assist);
   }""",kind)
   page.fill('#input','KEEP_DRAFT');page.click('[data-act=send]')
   page.wait_for_function('PRP.app.S.lastAssistBudget?.overflow && !PRP.app.S.gen')
   rejected=page.evaluate('async()=>({calls:__calls.length,rows:(await PRP.store.all("assist")).length,unchanged:__initial===JSON.stringify(PRP.app.S.assist),reserve:PRP.app.S.lastAssistBudget.reserveTokens})')
   assert rejected=={'calls':0,'rows':0,'unchanged':True,'reserve':4000},rejected
   assert page.input_value('#input')=='KEEP_DRAFT'
   assert page.locator('.aturn').count()==0
   page.screenshot(path=str(out/f'overflow-{kind}-{width}.png'))
   page.evaluate('()=>{const s=PRP.app.S.settings;s.contextTokens=32000;s.sampler.max_tokens=5000;}')
   page.click('[data-act=send]')
   page.wait_for_function('__calls.length===1 && !PRP.app.S.gen && PRP.app.S.assist.messages.at(-1)?.text==="ANSWER"')
   assert page.input_value('#input')==''
   assert page.evaluate('PRP.app.S.assist.messages.map(m=>m.text)')==['KEEP_DRAFT','ANSWER']
   saved=page.evaluate('async()=>JSON.stringify(await PRP.store.all("assist"))')
   old_id=page.evaluate('PRP.app.S.assist.messages.at(-1).id')
   page.evaluate('PRP.app.S.settings.contextTokens=4096')
   page.click('[data-act=assist-regen]')
   page.wait_for_function('PRP.app.S.lastAssistBudget?.overflow && !PRP.app.S.gen')
   assert page.evaluate('__calls.length')==1
   assert page.evaluate('async()=>JSON.stringify(await PRP.store.all("assist"))')==saved
   assert page.evaluate('PRP.app.S.assist.messages.at(-1).id')==old_id
   page.evaluate('PRP.app.S.settings.contextTokens=32000')
   page.click('[data-act=assist-regen]')
   page.wait_for_function('__calls.length===2 && !PRP.app.S.gen')
   assert page.evaluate('PRP.app.S.assist.messages.at(-1).id')!=old_id
   assert page.evaluate('PRP.app.S.assist.messages.map(m=>m.text)')==['KEEP_DRAFT','ANSWER']
   assert page.evaluate('__calls.every(c=>c.reserve===5000 && c.used+c.reserve<=32000)')
   page.evaluate('async()=>{const s=PRP.app.S;await PRP.store.setSetting("ui",{view:"assist",assistId:s.assist.id});}')
   page.reload(wait_until='domcontentloaded');page.wait_for_selector('.aturn')
   assert page.evaluate('PRP.app.S.assist.messages.map(m=>m.text)')==['KEEP_DRAFT','ANSWER']
   assert errors==[],errors
   results.append({'provider':kind,'width':width,'status':'PASS','rejected':rejected,'reload':True})
   context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
