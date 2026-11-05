"""Unified RP state, Observer, State Tool, branch/swipe restore and read-only panel.
Uses temporary Chromium contexts, real IndexedDB and mocked model output.
Run: python3 tests/e2e-unified-state.py [artifact-directory]
"""
from browser_support import launch_chromium, browser_context
import json,os,pathlib,shutil,socket,subprocess,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-unified-state-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as pw:
  browser=launch_chromium(pw)
  for width in [1440,390]:
   context=browser_context(browser, viewport={'width':width,'height':900})
   context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html',wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   data=page.evaluate('''async()=>{
    const P=PRP,ctx=P.app.ctx,S=P.app.S;
    await P.store.put('cards',Object.assign(P.cardModel.blank(),{id:'card',name:'Аля',description:'Внимательная девушка.'}));
    await ctx.nav.loadAll();await ctx.svc.chat.createChat('rp','card');
    const c=ctx.svc.chat;const u=await c.addUserMessage('Я дома.');
    u.swipes[0].stateEvents=[{actor:'user',field:'location',action:'set',value:'дома',certainty:'established',evidence:'Я дома.'}];await c.putMsg(u);
    let m=c.newMsg('assistant',u.id,'Сейчас 18:00. Идёт дождь. Я в парке.');m=await c.commitMessage(m,m.id);
    window.__observerCalls=0;
    P.llm.simple=async()=>{
     window.__observerCalls++;
     const fragments=P.evidenceSpans.catalog({text:m.swipes[0].text});
     const id=(word)=>fragments.find(f=>f.text.includes(word)).id;
     return JSON.stringify({events:[
      {actor:'environment',field:'time',action:'set',value:'18:00',certainty:'established',sourceId:id('18:00')},
      {actor:'environment',field:'weather',action:'set',value:'дождь',certainty:'established',sourceId:id('дождь')},
      {actor:'char',field:'location',action:'set',value:'парке',certainty:'established',sourceId:id('парке')}]});
    };
    await ctx.svc.state.track(m,{id:'mock'});await ctx.nav.openChat(ctx.chat().id);
    S.drawerOpen=true;S.tab='scene';ctx.ui.renderAll();
    const state=ctx.svc.state.snapshot(),v=P.stateTracker.view(state);
    const prompt=ctx.svc.prism.build(c.path()).messages.map(x=>x.content).join('\\n');
    const composed=P.imgCompose.compose({card:ctx.card(),persona:ctx.persona(),scene:v,draw:'Аля, standing'});
    return {chatId:ctx.chat().id,firstId:m.id,userId:u.id,view:v,prompt,imageContext:composed.stateContext,calls:window.__observerCalls};
   }''')
   assert data['view']['loc']=='парке' and data['view']['weather']=='дождь' and data['view']['time']=='18:00',data
   assert all(x in data['prompt'] and x in data['imageContext'] for x in ['парке','дождь','18:00']),data
   assert data['calls']==1
   assert all(x in page.inner_text('#drawer-body') for x in ['парке','дождь','18:00'])
   assert page.locator('#drawer-body input,#drawer-body textarea').count()==0
   page.screenshot(path=str(out/f'scene-{width}.png'))
   branches=page.evaluate('''async(ids)=>{
    const P=PRP,ctx=P.app.ctx,c=ctx.svc.chat;
    let b=c.newMsg('assistant',ids.userId,'Идёт снег.');b.swipes[0].stateEvents=[{actor:'environment',field:'weather',action:'set',value:'снег',certainty:'established',evidence:'Идёт снег.'}];b=await c.commitMessage(b,b.id);
    const alternate=P.stateTracker.view(ctx.svc.state.snapshot());
    await c.selectBranch(ids.firstId,0);const restored=P.stateTracker.view(ctx.svc.state.snapshot());
    const m=P.app.S.messages.find(m=>m.id===ids.firstId);
    const calls=[{field:'weather',operation:'set',items:['ясно']}];
    m.swipes.push({text:'Ясно.',stateProtocol:1,stateCalls:calls,stateEvents:P.stateTracker.eventsFromStateCalls(calls,'rp')});await c.putMsg(m);
    await c.selectBranch(m.id,1);const tracking=await ctx.svc.state.track(m,{id:'mock'});
    const variant=P.stateTracker.view(ctx.svc.state.snapshot());ctx.ui.renderAll();
    return {alternate,restored,variant,tracking,calls:window.__observerCalls};
   }''',data)
   assert branches['alternate']['weather']=='снег' and branches['alternate']['time']=='',branches
   assert branches['restored']['weather']=='дождь' and branches['restored']['loc']=='парке',branches
   assert branches['variant']['weather']=='ясно' and branches['variant']['loc']=='',branches
   assert branches['tracking']['skipped']=='state-tool' and branches['calls']==1,branches
   page.reload(wait_until='domcontentloaded')
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   restored=page.evaluate('''async(ids)=>{
    const ctx=PRP.app.ctx;await ctx.nav.openChat(ids.chatId);
    const persisted=PRP.stateTracker.view(ctx.svc.state.snapshot());
    await ctx.svc.chat.selectBranch(ids.firstId,0);
    const original=PRP.stateTracker.view(ctx.svc.state.snapshot());
    return {persisted,original,oldApi:typeof PRP.scene};
   }''',data)
   assert restored['persisted']['weather']=='ясно' and restored['original']['loc']=='парке' and restored['oldApi']=='undefined',restored
   authored=page.evaluate('''async()=>{
    const P=PRP,ctx=P.app.ctx;
    const provider={id:'mock',kind:'openai',label:'Mock'};
    ctx.provider=()=>provider;ctx.processingProvider=()=>provider;
    P.llm.simple=async()=>JSON.stringify({events:[{actor:'char',field:'location',action:'set',value:'саду',certainty:'established',sourceId:'T0'}]});
    await P.store.put('cards',Object.assign(P.cardModel.blank(),{id:'authored',name:'Мира',firstMes:'Я в саду.'}));
    await ctx.nav.loadAll();const id=await ctx.nav.newChat('rp','authored');
    await ctx.svc.state.settle(id);
    const opening=ctx.svc.chat.path()[0];
    return {location:P.stateTracker.view(ctx.svc.state.snapshot()).loc,text:opening.swipes[0].text,opening:opening.opening};
   }''')
   assert authored=={'location':'саду','text':'Я в саду.','opening':'authored'},authored
   assert errors==[],errors
   results.append({'width':width,'result':'PASS','observerCalls':1,'branchAndSwipeRestore':True,'reload':True,'readOnlyPanel':True,'authoredOpening':True,'runtimeErrors':errors})
   context.close()
  browser.close()
 (out/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:
 server.terminate();server.wait()
