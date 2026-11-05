"""A01: concurrent Observer/image writes retain both results and reject stale/deleted sources."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket
import subprocess
import sys
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind',
                           '127.0.0.1', '--directory', str(root)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
results = []

try:
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for mode in ['rp','messenger']:
            for width in [1440,390]:
                context=browser_context(browser,viewport={'width':width,'height':900})
                page=context.new_page()
                page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                page.wait_for_selector('.home-welcome')
                checks=page.evaluate("""async mode=>{
                  const {S,ctx}=PRP.app,DB=PRP.store,chat=ctx.svc.chat,assert=(ok,label)=>{if(!ok)throw Error(label);};
                  const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'Студентка.'});
                  await DB.put('cards',card);await ctx.nav.loadAll();
                  S.settings.providers=[{id:'fixture',kind:'openai',model:'fixture'}];S.settings.activeProvider='fixture';S.settings.autoContext=false;S.settings.contextTokens=32000;
                  Object.assign(S.settings.images,{enabled:true,backend:'a1111',url:'http://unused',translate:false,drawPromptMode:'tags'});
                  PRP.llm.simple=async()=>JSON.stringify({events:[{actor:'char',field:'location',action:'set',value:'парке',certainty:'reported',sourceId:'T0'}]});
                  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=3;const png=canvas.toDataURL();
                  const put=DB.put,rmw=DB.readModifyWrite,get=DB.get,checks=[],saved=[];
                  for(const scenario of ['observer-last','observer-last-text-image','image-pending-last','delete-observer','edit-observer','ancestor-edit-observer','reparent-observer','delete-image-start','edit-image-start']){
                    const id=await chat.createChat(mode,card.id);
                    if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-05T12:00:00.000Z'});
                    const parent=await chat.addUserMessage('Привет.');
                    const draft=chat.newMsg('assistant',parent.id,'Я в парке.');if(scenario!=='observer-last-text-image')draft.swipes[0].draws=[{prompt:'1girl, portrait',ratio:'1:1'}];
                    const msg=await chat.commitMessage(draft,draft.id),sw=msg.swipes[0];let backendCalls=0;
                    PRP.imgBackends.generate=async()=>{backendCalls++;return {dataUrl:png,seed:42,info:{}};};
                    let armed=true,reached,release;
                    const gate=new Promise(r=>reached=r),blocked=new Promise(r=>release=r);
                    const pause=async()=>{if(armed){armed=false;reached();await blocked;}};
                    DB.put=async(...args)=>{if(args[0]==='messages')await pause();return put(...args);};
                    DB.readModifyWrite=async(...args)=>{await pause();return rmw(...args);};
                    const image=()=>sw.draws?ctx.svc.images.draw(msg,sw,sw.draws[0]):ctx.svc.images.drawFromMessage(msg.id);
                    const observe=()=>ctx.svc.state.track(msg,ctx.provider());
                    const imageFirst=scenario==='image-pending-last'||scenario==='delete-image-start'||scenario==='edit-image-start';
                    const pending=imageFirst?image():observe();await gate;
                    if(scenario.startsWith('observer-last')){
                      await image();const m=await get('messages',msg.id);assert(m.swipes[0].images[0].status==='done','image did not finish');
                      m.concurrentField='KEEP';await put('messages',m);
                    }else if(scenario==='image-pending-last')await observe();
                    else if(scenario==='edit-observer'||scenario==='edit-image-start'){
                      const m=await get('messages',msg.id);m.swipes[0].text='EDITED ELSEWHERE';await put('messages',m);
                    }else if(scenario==='ancestor-edit-observer'){
                      const m=await get('messages',parent.id);m.swipes[0].text='CHANGED ANCESTOR';await put('messages',m);
                    }else if(scenario==='reparent-observer'){
                      const m=await get('messages',msg.id);m.parentId=null;await put('messages',m);
                    }else{
                      const c=await get('chats',id);c.leafId=parent.id;
                      await DB.mutateBatch({deletes:[['messages',msg.id]],puts:[['chats',c]]});
                    }
                    release();await pending;DB.put=put;DB.readModifyWrite=rmw;
                    const m=await get('messages',msg.id),blobs=await DB.byIndex('images','chatId',id);
                    assert(S.drawing.size===0,scenario+': drawing lock leaked');
                    if(scenario.startsWith('delete-')){
                      assert(!m,scenario+': deleted message resurrected');assert(backendCalls===0&&blobs.length===0,scenario+': unexpected image work');
                    }else if(scenario==='edit-observer'||scenario==='edit-image-start'){
                      assert(m.swipes[0].text==='EDITED ELSEWHERE','Observer overwrote changed source');assert(!m.swipes[0].stateStatus,'stale Observer result persisted');assert(backendCalls===0&&blobs.length===0,'stale image work');
                    }else if(scenario==='ancestor-edit-observer'||scenario==='reparent-observer'){
                      assert(!m.swipes[0].stateStatus,'changed ancestor accepted');
                    }else{
                      assert(m.swipes[0].images?.[0]?.status==='done'&&blobs.length===1,scenario+': image lost');
                      assert(m.swipes[0].stateStatus?.status==='ok'&&m.swipes[0].stateEvents.some(e=>e.field==='location'),scenario+': state lost');
                      assert(sw.images?.[0]?.status==='done'&&sw.stateStatus?.status==='ok',scenario+': live state differs');
                      if(scenario.startsWith('observer-last'))assert(m.concurrentField==='KEEP','Observer lost fresh field');
                    }
                    checks.push(scenario+': PASS');saved.push({id:msg.id,scenario});
                  }
                  return {checks,saved};
                }""",mode)
                page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.settings')
                durable=page.evaluate("""async saved=>{for(const row of saved){const m=await PRP.store.get('messages',row.id);
                  if(row.scenario.startsWith('delete-')){if(m)return false;}
                  else if(row.scenario==='edit-observer'||row.scenario==='edit-image-start'){if(m.swipes[0].text!=='EDITED ELSEWHERE')return false;}
                  else if(row.scenario==='ancestor-edit-observer'||row.scenario==='reparent-observer'){if(m.swipes[0].stateStatus)return false;}
                  else if(m.swipes[0].images?.[0]?.status!=='done'||m.swipes[0].stateStatus?.status!=='ok')return false;
                  }return true;}""",checks['saved'])
                assert durable
                results.append({'mode':mode,'width':width,'checks':checks['checks'],'reload':'PASS'})
                context.close()
        browser.close()
finally:
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
