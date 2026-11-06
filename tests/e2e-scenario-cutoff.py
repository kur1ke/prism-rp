"""Scenario reply limit: real bundle/IDB, selected branch, regen/continue and saved setting. LLM mocked."""
from browser_support import launch_chromium, browser_context
import json,pathlib,socket,subprocess,sys
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for mode in ['rp','messenger']:
   for width in [1440,390]:
    context=browser_context(browser,viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app')
    result=page.evaluate('''async mode=>{
     const {S,ctx}=PRP.app,DB=PRP.store,c=ctx.svc.chat;
     await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Fixture',scenario:'SCENARIO_MARKER',firstMes:'AUTHOR_GREETING'}));
     await ctx.nav.loadAll();const chatId=await c.createChat(mode,'card');
     if(mode==='messenger')await ctx.svc.messenger.createFor(chatId,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-06T10:00:00.000Z'});
     for(let i=1;i<=31;i++){const u=await c.addUserMessage('Question '+i),m=c.newMsg('assistant',u.id,'Answer '+i);await c.commitMessage(m,m.id);}
     const full=c.path(),root=full[0],offset=full[0].opening==='authored'?1:0,checks=[];let modelCalls=0;
     ctx.provider=()=>({id:'mock',kind:'openai'});ctx.processingProvider=ctx.provider;S.settings.images.enabled=false;S.settings.contextTokens=32000;S.settings.autoContext=false;
     PRP.llm.chat=async()=>{modelCalls++;return {text:'Generated answer'};};PRP.llm.simple=async()=>JSON.stringify({events:[]});
     const build=(path,decision)=>ctx.svc.prism.build(path,'',decision),has=b=>b.messages.some(m=>m.content.includes('SCENARIO_MARKER'));
     for(const limit of PRP.scenario.LIMITS){
      S.settings.scenarioReplies=limit;
      if(limit){const before=full.slice(0,offset+2*(limit-1)),at=full.slice(0,offset+2*limit);
       if(!has(build(before))||has(build(at)))throw Error('boundary '+limit);
       const target=full[offset+2*limit-1],decision=PRP.scenario.forGeneration(full,{mode:'regen',targetId:target.id,limit});
       if(!has(build(full,decision)))throw Error('regen boundary '+limit+' '+JSON.stringify({decision,report:build(full,decision).report}));
       const next=full[offset+2*(limit+1)-1],cont=PRP.scenario.forGeneration(full,{mode:'continue',targetId:next.id,limit});
       if(has(build(full,cont)))throw Error('continue boundary '+limit);
      }else if(!has(build(full)))throw Error('never');
      checks.push(limit===0?'never':String(limit));
     }
     S.settings.scenarioReplies=5;
     await c.selectBranch(root.id);if(!has(build(c.path())))throw Error('short branch');
     await c.selectBranch(full.at(-1).id);if(has(build(c.path())))throw Error('long branch');
     S.settings.scenarioReplies=10;const ninth=full[offset+17];await c.selectBranch(ninth.id);
     let observed=false,rpCalls=0;PRP.llm.chat=async(_p,messages)=>{if(!messages[0].content.startsWith('Ты играешь за'))return {text:JSON.stringify({memories:[]})};modelCalls++;rpCalls++;observed=messages.some(m=>m.content.includes('SCENARIO_MARKER'));return {text:'Generated alternative'};};
     const regenerated=await ctx.svc.gen.generate(ninth.id,'regen');if(regenerated)await regenerated.post;if(!observed)throw Error('actual custom-limit regen');
     const continued=await ctx.svc.gen.generate(ninth.id,'continue');if(continued)await continued.post;if(!observed||rpCalls!==2)throw Error('actual custom-limit continue');
     S.settings.scenarioReplies=0;await DB.setSetting('app',S.settings);await ctx.nav.openChat(chatId);
     if(S.view!=='chat')throw Error('fixture chat activation incomplete');
     return {mode,width:innerWidth,checks,branch:'PASS',actualCustomLimit:'PASS',modelCalls};
    }''',mode)
    page.wait_for_function('async()=>{const ui=await PRP.store.getSetting("ui",{});return ui.view==="chat" && ui.chatId===PRP.app.S.chatId;}')
    page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.settings')
    page.wait_for_selector('.chat-head')
    assert page.evaluate('PRP.app.S.settings.scenarioReplies')==0
    assert page.evaluate('PRP.app.ctx.svc.prism.build(PRP.app.ctx.svc.chat.path()).report.scenarioIncluded') is True
    assert not errors,errors
    result['reload']='PASS';results.append(result);context.close()
  browser.close()
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
finally:server.terminate();server.wait()
