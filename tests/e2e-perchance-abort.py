"""A04: actual Perchance adapter + assistant UI/native IDB; external plugin/fetch mocked."""
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
  for width in [1440,390]:
   context=browser_context(browser,viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
   direct=page.evaluate('''async()=>{
    const P=PRP.perchance,names={char:'N',user:'U'},messages=[{role:'user',content:'Hello'}],checks=[];
    const originalFetch=window.fetch;let starts=0;window.ai=()=>{starts++;return Promise.resolve({generatedText:'OK'});};
    const bounded=p=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('adapter stuck')),2000);p.then(v=>{clearTimeout(t);resolve(v);},e=>{clearTimeout(t);reject(e);});});
    const aborted=async p=>{try{await bounded(p);throw Error('expected abort');}catch(e){if(e.name!=='AbortError')throw e;}};
    let c=new AbortController();c.abort();await aborted(P.chat(names,messages,{signal:c.signal}));if(starts)throw Error('pre-abort launch');checks.push('pre-aborted');
    c=new AbortController();const early=P.chat(names,messages,{signal:c.signal});c.abort();await aborted(early);if(starts)throw Error('microtask launch');checks.push('before launch');
    for(const stage of ['headers','body']){
     c=new AbortController();let release,signal,started=false;const gate=new Promise(r=>release=r);
     window.fetch=(_url,opts)=>{signal=opts.signal;return stage==='headers'?gate:Promise.resolve({ok:true,blob:()=>{started=true;return gate;}});};
     const pending=P.chat(names,messages,{signal:c.signal,imageDataUrl:'data:image/png;base64,AA=='});
     await new Promise(r=>setTimeout(r,0));c.abort();await aborted(pending);
     if(signal!==c.signal||!signal.aborted)throw Error('attachment signal missing');
     release(stage==='headers'?{ok:true,blob:()=>Promise.resolve(new Blob())}:new Blob());await new Promise(r=>setTimeout(r,0));
     if(starts)throw Error('late attachment launched plugin');checks.push(stage);
    }
    window.fetch=originalFetch;return checks;
   }''')
   for scenario in ['before-first-chunk','partial','late-rejection']:
    page.evaluate('''async scenario=>{
     const {S,ctx}=PRP.app,a=PRP.assist.blank({});a.title='Abort test';a.messages=[{id:'u',role:'user',text:'Question',at:1},{id:'old',role:'assistant',text:'KEEP_ORIGINAL',at:2}];
     S.settings.activeProvider='perchance';S.settings.autoContext=false;S.settings.contextTokens=32000;
     S.assist=a;await ctx.svc.assist.save();await ctx.nav.openAssist(a.id);
     window.__id=a.id;window.__before=JSON.stringify(await PRP.store.get('assist',a.id));window.__started=false;window.__stops=0;
     window.ai=request=>{window.__request=request;window.__started=true;if(scenario!=='before-first-chunk')request.onChunk({textChunk:'PARTIAL_STREAM'});
      const promise=new Promise((resolve,reject)=>{window.__late=()=>scenario==='late-rejection'?reject(Error('late plugin failure')):resolve({generatedText:'LATE_RESULT'});});
      promise.stop=()=>{__stops++;request.onChunk({textChunk:'STOP_LEAK'});};return promise;};
    }''',scenario)
    page.click('[data-act=assist-regen]');page.wait_for_function('__started')
    if scenario!='before-first-chunk':page.wait_for_function("document.querySelector('.aturn.assistant .md').innerText.includes('PARTIAL_STREAM')")
    page.click('[data-act=stop]');page.wait_for_function('!PRP.app.S.gen')
    assert page.evaluate('async()=>JSON.stringify(await PRP.store.get("assist",__id))===__before')
    assert page.evaluate('__stops')==1
    page.evaluate("()=>{__request.onChunk({textChunk:'LATE_LEAK'});__late();}")
    page.wait_for_timeout(20)
    assert page.evaluate('async()=>JSON.stringify(await PRP.store.get("assist",__id))===__before')
    assert 'KEEP_ORIGINAL' in page.locator('.aturn.assistant .md').inner_text()
    page.evaluate("window.ai=()=>Promise.resolve({generatedText:'RETRY_OK'})")
    page.click('[data-act=assist-regen]');page.wait_for_function("!PRP.app.S.gen && PRP.app.S.assist.messages.at(-1).text==='RETRY_OK'")
   page.reload();page.wait_for_selector('.aturn.assistant .md');assert 'RETRY_OK' in page.locator('.aturn.assistant .md').inner_text()
   assert not errors,errors
   results.append({'width':width,'direct':direct,'uiScenarios':3,'stopAndLateResult':'PASS','savedReply':'PASS','retryReload':'PASS','runtimeErrors':errors});context.close()
  browser.close()
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
finally:server.terminate();server.wait()
