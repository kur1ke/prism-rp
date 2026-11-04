"""F15: real router/Perchance adapter and IndexedDB; only external AI/Observer are fixtures."""
import json,os,pathlib,shutil,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-pc-budget-'))
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
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   setup=page.evaluate("""async mode=>{
    const ctx=PRP.app.ctx,DB=PRP.store,tok=PRP.util.estimateTokens;
    const cd=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'d'});
    await DB.put('cards',cd);await ctx.nav.loadAll();
    const id=await ctx.svc.chat.createChat(mode,'card');
    if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
    await ctx.nav.openChat(id);
    ctx.S.settings.images.enabled=false;ctx.S.settings.sampler.max_tokens=300;
    ctx.provider=()=>({id:'fixture',label:'Fixture',kind:'perchance'});ctx.processingProvider=ctx.provider;
    window.__modelCalls=0;window.__observerCalls=0;window.__cost=0;window.__limit=32000;
    ctx.contextTokens=()=>__limit;
    window.ai=request=>{
     if(request.getMetaObject)return {idealMaxContextTokens:32000};
     const instruction=request.instruction();
     if(instruction.includes('Верни только JSON согласно'))return Promise.resolve({generatedText:JSON.stringify({memories:[]})});
     __modelCalls++;__cost=tok(instruction)+tok(request.startWith());
     if(__cost+300>__limit)throw Error('Fixture: actual plugin payload exceeded window');
     if(ctx.S.lastPrism.report.used!==__cost)throw Error('Fixture: preflight differs from actual plugin request');
     return Promise.resolve({generatedText:'SAFE_REPLY'});
    };
    PRP.llm.simple=async()=>{__observerCalls++;return JSON.stringify({events:[]});};
    window.__text=('"\\\\\\n').repeat(310)+'END';
    const draft=ctx.svc.chat.newMsg('user',null,__text);
    const report=ctx.svc.prism.build([draft]).report;
    // Choose a budget accepted by the old message-only test.
    __limit=report.messageUsed+300;
    window.__before=JSON.stringify({messages:await DB.all('messages'),chats:await DB.all('chats')});
    return {messageUsed:report.messageUsed,transportUsed:report.used,context:__limit,text:__text};
   }""",mode)
   # RP transcript labels can cost less than per-message accounting for this short
   # fixture. Use a long raw character name to make its repeated transport labels visible.
   if setup['transportUsed']<=setup['messageUsed']:
    setup=page.evaluate("""()=>{
     const ctx=PRP.app.ctx;ctx.card().name='Аля'.repeat(80);__limit=32000;
     const draft=ctx.svc.chat.newMsg('user',null,__text),r=ctx.svc.prism.build([draft]).report;
     __limit=r.messageUsed+300;return {messageUsed:r.messageUsed,transportUsed:r.used,context:__limit,text:__text};
    }""")
   assert setup['transportUsed']>setup['messageUsed'],setup
   page.fill('#input',setup['text']);page.click('[data-act=send]')
   page.wait_for_function('PRP.app.S.lastPrism && PRP.app.S.lastPrism.report.overflow')
   rejected=page.evaluate("""async()=>{
    const DB=PRP.store,r=PRP.app.S.lastPrism.report;
    return {used:r.used,messageUsed:r.messageUsed,budget:r.budget,calls:__modelCalls,observerCalls:__observerCalls,
     unchanged:__before===JSON.stringify({messages:await DB.all('messages'),chats:await DB.all('chats')})};
   }""")
   assert rejected['used']>rejected['budget']>=rejected['messageUsed'],rejected
   assert rejected['calls']==rejected['observerCalls']==0 and rejected['unchanged'],rejected
   assert page.input_value('#input')==setup['text']
   page.screenshot(path=str(out/f'overflow-{mode}-{width}.png'))
   page.evaluate('()=>{__limit=32000;}');page.click('[data-act=send]')
   page.wait_for_function('__modelCalls===1 && !PRP.app.S.gen && !PRP.app.S.turn && PRP.app.ctx.svc.chat.path().at(-1)?.role==="assistant"')
   assert page.evaluate('__cost+300<=__limit')
   assert page.evaluate('PRP.app.ctx.svc.chat.path().map(m=>PRP.tree.activeSwipe(m).text)')==[setup['text'],'SAFE_REPLY']
   assert errors==[],errors
   results.append({'mode':mode,'width':width,'status':'PASS','rejected':rejected,'actualPluginCost':page.evaluate('__cost')})
   context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
