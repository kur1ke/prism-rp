"""F20: first image write abort, UI retry without reload, durable result. Image backend mocked."""
from browser_support import launch_chromium, browser_context
import json, os, pathlib, shutil, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1]
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-f20-'))
out.mkdir(parents=True, exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
server = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
results = []
try:
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for mode in ['rp', 'messenger']:
            for width in [1440, 390]:
                for previous in ['new', 'done', 'error']:
                    context = browser_context(browser, viewport={'width': width, 'height': 900})
                    context.add_init_script('window.__PRP_TEST_MIRROR=true')
                    page = context.new_page(); errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                    page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
                    page.evaluate('''async ({mode,previous}) => {
                      const {ctx,S}=PRP.app, DB=PRP.store, chat=ctx.svc.chat;
                      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
                      canvas.getContext('2d').fillRect(0,0,512,512);window.__png=canvas.toDataURL('image/png');
                      const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'Внимательная.'});
                      await DB.put('cards',card); await ctx.nav.loadAll();
                      const id=await chat.createChat(mode,card.id);
                      if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
                      const draft=chat.newMsg('assistant',null,'PHOTO_REPLY');
                      draft.swipes[0].draws=[{prompt:'1girl, portrait, smiling',ratio:'1:1'}];
                      if(previous!=='new'){
                        draft.swipes[0].images=[{id:'old-image',draw:'1girl, portrait, smiling',ratio:'1:1',sourceDrawIndex:0,
                          status:previous,seed:17,prompt:'OLD_PROMPT',error:'OLD_ERROR',translationFailure:{reason:'OLD_REASON'}}];
                        await DB.put('images',{id:'old-image',chatId:id,msgId:draft.id,dataUrl:__png});
                      }
                      await chat.commitMessage(draft,draft.id); await ctx.nav.openChat(id);
                      window.__mid=draft.id;
                      Object.assign(S.settings.images,{enabled:true,backend:'a1111',url:'http://unused',translate:false,drawPromptMode:'tags'});
                      window.__calls=0;
                      PRP.imgBackends.generate=async()=>{__calls++;return {dataUrl:__png,seed:42,info:{width:512,height:512}};};
                      window.__snapshot=async()=>JSON.stringify({message:S.messages.find(m=>m.id===__mid),
                        db:await DB.get('messages',__mid),images:await DB.all('images'),urls:S.imgUrls});
                      window.__before=await __snapshot();
                      window.__put=IDBObjectStore.prototype.put;window.__failed=false;
                      IDBObjectStore.prototype.put=function(value,...rest){
                        if(this.name==='messages'){__failed=true;throw Error('F20 browser first write abort');}
                        return __put.call(this,value,...rest);
                      };
                    }''', {'mode': mode, 'previous': previous})
                    selector = '[data-act=draw]' if previous == 'new' else '[data-act=img-regen]'
                    page.locator(selector).first.click()
                    page.wait_for_function('__failed && PRP.app.S.drawing.size===0')
                    assert page.evaluate('__calls') == 0
                    assert page.evaluate('async()=>await __snapshot()===__before'), (mode,width,previous)
                    assert page.locator('.shot.wait').count() == 0
                    assert 'F20 browser first write abort' in page.inner_text('body')
                    assert page.locator(selector).count() > 0, 'retry control missing'
                    page.evaluate('()=>{IDBObjectStore.prototype.put=__put;}')
                    page.locator(selector).first.click()
                    page.wait_for_function('__calls===1 && PRP.app.S.drawing.size===0')
                    assert page.evaluate('PRP.app.S.messages.find(m=>m.id===__mid).swipes[0].images[0].status') == 'done'
                    assert page.locator('.shot.wait').count() == 0
                    page.screenshot(path=str(out/f'{mode}-{width}-{previous}.png'))
                    page.reload(); page.wait_for_selector('.chat-head')
                    saved = page.evaluate('''async()=>{
                      const m=PRP.app.ctx.svc.chat.path().at(-1),im=m.swipes[0].images[0];
                      return {status:im.status,count:m.swipes[0].images.length,seed:im.seed,
                        data:!!(await PRP.store.get('images',im.id)),drawing:PRP.app.S.drawing.size};
                    }''')
                    assert saved == {'status':'done','count':1,'seed':42,'data':True,'drawing':0}, saved
                    assert errors == [], errors
                    results.append({'mode':mode,'width':width,'previous':previous,'abortRetryReload':'PASS','runtimeErrors':errors})
                    context.close()
        browser.close()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False))
finally:
    server.terminate(); server.wait()
