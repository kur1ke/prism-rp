"""F16: actual provider selection, router/transports and IndexedDB; only remote AI is mocked."""
from browser_support import launch_chromium, browser_context
import json,os,pathlib,shutil,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-observer-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as pw:
  browser=launch_chromium(pw)
  for processing,width in [('openai',1440),('perchance',1440),('openai',390),('perchance',390)]:
   context=browser_context(browser, viewport={'width':width,'height':900})
   context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   before=page.evaluate(r"""async processing=>{
    const ctx=PRP.app.ctx,DB=PRP.store,tok=PRP.util.estimateTokens;
    const cd=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'d'});
    await DB.put('cards',cd);await ctx.nav.loadAll();
    const id=await ctx.svc.chat.createChat('rp','card');
    const m=ctx.svc.chat.newMsg('assistant',null,'Идёт дождь.');await ctx.svc.chat.commitMessage(m,m.id);
    await ctx.nav.openChat(id);
    window.__calls=[];window.__metaWindow=32000;window.__processing=processing;
    const answer=JSON.stringify({events:[{actor:'environment',field:'weather',action:'set',value:'дождь',certainty:'established',sourceId:'T0'}]});
    window.ai=request=>{
     if(request.getMetaObject)return {idealMaxContextTokens:__metaWindow};
     const instruction=request.instruction();
     const context=ctx.contextTokens(ctx.processingProvider());
     if(tok(instruction)+650>context)throw Error('Fixture: Perchance input exceeded processing window');
     __calls.push({kind:'perchance',inputTokens:tok(instruction),reserve:650,context});
     return Promise.resolve({generatedText:answer});
    };
    const fetchOriginal=window.fetch;
    window.fetch=async(url,opts)=>{
     if(String(url)==='https://fixture.invalid/v1/chat/completions'){
      const request=JSON.parse(opts.body),used=request.messages.reduce((n,m)=>n+tok(m.content)+4,0),context=ctx.contextTokens(ctx.processingProvider());
      if(used+request.max_tokens>context)throw Error('Fixture: API input exceeded processing window');
      __calls.push({kind:'openai',inputTokens:used,reserve:request.max_tokens,context});
      return new Response('data: '+JSON.stringify({choices:[{delta:{content:answer}}]})+'\n\n'+'data: [DONE]\n\n',
       {status:200,headers:{'Content-Type':'text/event-stream'}});
     }
     return fetchOriginal(url,opts);
    };
    ctx.S.settings.providers=[{id:'api',kind:'openai',name:'API',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
    ctx.S.settings.activeProvider=processing==='openai'?'perchance':'api';
    ctx.S.settings.processingProvider=processing==='openai'?'api':'perchance';
    ctx.S.settings.contextTokens=1024;ctx.S.settings.autoContext=true;
    window.__before=JSON.stringify(await DB.all('messages'));
    return {roleWindow:ctx.contextTokens(),processingWindow:ctx.contextTokens(ctx.processingProvider())};
   }""",processing)
   assert before==({'roleWindow':32000,'processingWindow':1024} if processing=='openai' else {'roleWindow':1024,'processingWindow':32000}),before
   first=page.evaluate("""async()=>{
    const ctx=PRP.app.ctx;
    const r=await ctx.svc.state.track(ctx.S.messages[0],ctx.processingProvider());
    return {status:r.status,calls:__calls.length,unchanged:__before===JSON.stringify(await PRP.store.all('messages')),
      weather:PRP.stateTracker.view(ctx.svc.state.snapshot()).weather};
   }""")
   if processing=='openai':
    assert first=={'status':'overflow','calls':0,'unchanged':True,'weather':''},first
    page.evaluate('PRP.app.S.settings.contextTokens=32000')
    retried=page.evaluate('async()=>{const c=PRP.app.ctx;return (await c.svc.state.track(c.S.messages[0],c.processingProvider())).status;}')
    assert retried=='ok',retried
   else:
    assert first['status']=='ok' and first['calls']==1 and first['weather']=='дождь',first
    # A forced retry with a smaller window must not erase previously accepted facts.
    retry=page.evaluate("""async()=>{
     const c=PRP.app.ctx,before=JSON.stringify(await PRP.store.all('messages'));__metaWindow=1024;
     const r=await c.svc.state.track(c.S.messages[0],c.processingProvider(),{force:true});
     return {status:r.status,calls:__calls.length,unchanged:before===JSON.stringify(await PRP.store.all('messages'))};
    }""")
    assert retry=={'status':'overflow','calls':1,'unchanged':True},retry
   assert page.evaluate('__calls.length')==1
   assert page.evaluate('__calls[0].kind')==processing
   assert page.evaluate('__calls[0].reserve')==650
   assert page.evaluate('PRP.app.ctx.svc.state.pending(PRP.app.S.chatId)')==0
   assert errors==[],errors
   page.screenshot(path=str(out/f'observer-{processing}-{width}.png'))
   results.append({'processing':processing,'width':width,'status':'PASS','windows':before,'first':first,'request':page.evaluate('__calls[0]')})
   context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
