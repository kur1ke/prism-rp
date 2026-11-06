"""A06: real ImageService/compiler/router and IDB; transport/backends are controlled fixtures."""
from browser_support import launch_chromium,browser_context
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
   for kind in ['openai','perchance']:
    for width in [1440,390]:
     context=browser_context(browser,viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
     page.evaluate('''async({mode,kind})=>{
      const {S,ctx}=PRP.app,DB=PRP.store,c=ctx.svc.chat;
      await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'Внимательная.'}));await ctx.nav.loadAll();const id=await c.createChat(mode,'card');
      if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-06T12:00:00.000Z'});
      const model={id:'processing',kind,baseUrl:'https://fixture.invalid/v1',model:'mock'},rp={id:'rp',kind:kind==='openai'?'perchance':'openai'};
      window.__limit=256;window.__timeout=false;window.__texts=0;window.__images=0;window.__stops=0;window.__windowProviders=[];
      ctx.provider=()=>rp;ctx.processingProvider=()=>model;ctx.contextTokens=p=>{if(p)__windowProviders.push(p.id);return p?.id==='processing'?__limit:32000;};ctx.imageTranslateTimeoutMs=20;
      Object.assign(S.settings.images,{enabled:true,backend:'a1111',url:'http://unused',translate:true,drawPromptMode:'tags'});
      const canvas=document.createElement('canvas');canvas.width=canvas.height=512;window.__png=canvas.toDataURL('image/png');
      PRP.imgBackends.generate=async()=>{__images++;return {dataUrl:__png,seed:42,info:{width:512,height:512}};};
      const response=()=>__format==='tags'?'1girl, looking at window':JSON.stringify({version:2,focus:'woman looking at window',composition:{medium:'illustration',framing:'portrait',viewpoint:'eye level',rationale:'focus on gaze'},subjects:[{name:'Аля',orientation:'side view',action:'looking at window',visibleResult:'',clothing:'casual shirt',expression:'calm'}],objects:[],environment:'room',lighting:'daylight'});
      const originalFetch=window.fetch;window.fetch=async(url,opts)=>{
       if(String(url)!=='https://fixture.invalid/v1/chat/completions')return originalFetch(url,opts);
       __texts++;window.__signal=opts.signal;window.__body=JSON.parse(opts.body);
       const done=()=>new Response(JSON.stringify({choices:[{message:{content:response()}}]}),{headers:{'Content-Type':'application/json'}});
       if(__timeout)return new Promise(resolve=>window.__late=()=>resolve(done()));return done();
      };
      window.ai=request=>{__texts++;window.__pcInstruction=request.instruction();window.__pcSeed=request.startWith;
       if(__timeout){const p=new Promise(resolve=>window.__late=()=>resolve({generatedText:response()}));p.stop=()=>__stops++;return p;}
       return Promise.resolve({generatedText:response()});};
      window.__seed=async(format,label)=>{__format=format;S.settings.images.drawPromptMode=format;
       const m=c.newMsg('assistant',ctx.chat().leafId,'PHOTO_REPLY '+format+' '+label);m.swipes[0].draws=[{prompt:'Аля смотрит в окно. Кадр '+format+' '+label,ratio:'1:1'}];await c.commitMessage(m,m.id);await ctx.nav.openChat(id);window.__mid=m.id;
       window.__source=JSON.stringify({text:m.swipes[0].text,draws:m.swipes[0].draws,state:m.swipes[0].stateEvents});};
      window.__entry=()=>S.messages.find(m=>m.id===__mid).swipes[0].images[0];
      window.__draw=()=>{const m=S.messages.find(m=>m.id===__mid);return ctx.svc.images.draw(m,m.swipes[0],m.swipes[0].draws[0]);};
      window.__stable=async()=>{const m=await DB.get('messages',__mid);return JSON.stringify({text:m.swipes[0].text,draws:m.swipes[0].draws,state:m.swipes[0].stateEvents})===__source;};
     }''',{'mode':mode,'kind':kind})
     checks=[]
     for fmt in ['tags','intent']:
      page.evaluate('async fmt=>{await __seed(fmt,"overflow");__limit=256;__timeout=false;window.__t=__texts;window.__b=__images;window.__job=__draw();}',fmt)
      page.wait_for_function('PRP.app.S.drawing.size===0 && __entry()?.status==="error"')
      assert page.evaluate('__texts===__t && __images===__b && __entry().error.includes("не помещается")')
      assert page.evaluate('__stable()') is True
      selector='[data-mid="'+page.evaluate('__mid')+'"] [data-act=img-regen]'
      page.evaluate('__limit=32000');page.locator(selector).first.click();page.wait_for_function('PRP.app.S.drawing.size===0 && __entry().status==="done"')
      assert page.evaluate('__texts===__t+1 && __images===__b+1')
      if kind=='openai':assert page.evaluate('__signal instanceof AbortSignal && __body.max_tokens===400 && __body.messages.length===1')
      else:assert page.evaluate('typeof __pcInstruction==="string" && __pcSeed===undefined')
      # Cache is usable without a new model request, even with a small window.
      page.evaluate('__limit=256');page.locator(selector).first.click();page.wait_for_function('PRP.app.S.drawing.size===0 && __images===__b+2')
      assert page.evaluate('__texts===__t+1 && __entry().status==="done"')
      page.evaluate('async fmt=>{await __seed(fmt,"timeout");__limit=32000;__timeout=true;window.__t=__texts;window.__b=__images;window.__job=__draw();}',fmt)
      page.wait_for_function('PRP.app.S.drawing.size===0 && __entry()?.status==="error"')
      assert page.evaluate('__texts===__t+1 && __images===__b && __entry().error.includes("время ожидания")')
      if kind=='openai':assert page.evaluate('__signal.aborted') is True
      else:assert page.evaluate('__stops>0') is True
      page.evaluate('__late()');page.wait_for_timeout(20)
      assert page.evaluate('__images===__b && __entry().status==="error"')
      assert page.evaluate('__stable()') is True
      selector='[data-mid="'+page.evaluate('__mid')+'"] [data-act=img-regen]'
      page.evaluate('__timeout=false');page.locator(selector).first.click();page.wait_for_function('PRP.app.S.drawing.size===0 && __entry().status==="done"')
      assert page.evaluate('__texts===__t+2 && __images===__b+1')
      checks.append(fmt+': overflow, retry, cache, timeout, late result PASS')
     assert page.evaluate('__windowProviders.includes("processing") && !__windowProviders.includes("rp")')
     page.wait_for_function('async()=>{const ui=await PRP.store.getSetting("ui",{});return ui.chatId===PRP.app.S.chatId;}')
     page.reload();page.wait_for_selector('.chat-head')
     assert page.evaluate('PRP.app.ctx.svc.chat.path().at(-1).swipes[0].images[0].status')=='done'
     assert not errors,errors
     results.append({'mode':mode,'provider':kind,'width':width,'checks':checks,'reload':'PASS','runtimeErrors':errors});context.close()
  browser.close()
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
finally:server.terminate();server.wait()
