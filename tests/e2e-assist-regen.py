"""A02: assistant regeneration preserves the saved reply until successful final commit."""
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
        for kind in ['openai','perchance']:
            for width in [1440,390]:
                context=browser_context(browser,viewport={'width':width,'height':900})
                page=context.new_page();errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                page.wait_for_selector('.home-welcome')
                page.evaluate("""kind=>{const {S}=PRP.app;
                  window.ai=()=>Promise.resolve({generatedText:'fixture'});
                  S.settings.providers=[{id:'api',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
                  S.settings.activeProvider=kind==='perchance'?'perchance':'api';S.settings.autoContext=false;S.settings.contextTokens=32000;
                  window.__oldGenerate=PRP.app.ctx.svc.assist.generate;
                  PRP.app.ctx.svc.assist.generate=(...args)=>{window.__finished=false;window.__outcome=null;window.__error=null;
                    return __oldGenerate(...args).then(r=>{__finished=true;__outcome=r;return r;},e=>{__finished=true;__error=e.message;throw e;});};
                }""",kind)
                checks=[]
                for scenario in ['error','partial-error','abort','partial-abort','abort-late-success','empty','commit-failure','success','metadata','deleted','changed']:
                    page.evaluate("""async scenario=>{
                      const {S,ctx}=PRP.app,a=PRP.assist.blank({});
                      a.title='Preserve reply';a.messages=[{id:'question',role:'user',text:'Question',at:1},{id:'original',role:'assistant',text:'KEEP_ORIGINAL',reasoning:'KEEP_REASON',at:2}];
                      S.assist=a;await ctx.svc.assist.save();await ctx.nav.openAssist(a.id);
                      window.__id=a.id;window.__before=JSON.stringify(await PRP.store.get('assist',a.id));window.__liveBefore=JSON.stringify(a);
                      window.__started=false;window.__calls=0;window.__scenario=scenario;
                      PRP.llm.chat=async(_provider,_messages,opts)=>{
                        __calls++;window.__started=true;
                        if(scenario.startsWith('partial-')||scenario==='success')opts.onDelta({text:'PARTIAL_STREAM',reasoning:'TEMP_REASON'});
                        return new Promise((resolve,reject)=>{
                          window.__finishModel=()=>{
                            if(scenario==='error'||scenario==='partial-error')reject(new Error('fixture provider failure'));
                            else resolve({text:scenario==='empty'?'': 'REPLACEMENT',reasoning:'NEW_REASON'});
                          };
                          opts.signal.addEventListener('abort',()=>{if(scenario!=='abort-late-success')reject(new DOMException('Stopped','AbortError'));},{once:true});
                        });
                      };
                      window.__put=IDBObjectStore.prototype.put;
                    }""",scenario)
                    page.click('[data-act=assist-regen]')
                    page.wait_for_function('__started')
                    assert page.evaluate('async()=>JSON.stringify(await PRP.store.get("assist",__id))===__before'),scenario+': original changed before model completed'
                    assert page.evaluate('JSON.stringify(PRP.app.S.assist)===__liveBefore'),scenario+': live original changed'
                    if scenario in ['partial-error','partial-abort','success']:
                        page.wait_for_function("document.querySelector('.aturn.assistant .md').innerText.includes('PARTIAL_STREAM')")
                    page.evaluate("""async()=>{
                      if(__scenario==='commit-failure')IDBObjectStore.prototype.put=function(){if(this.name==='assist')throw Error('fixture final commit failure');return __put.apply(this,arguments);};
                      if(__scenario==='deleted')await PRP.store.del('assist',__id);
                      if(__scenario==='metadata'){const a=await PRP.store.get('assist',__id);a.title='KEEP_NEW_TITLE';a.concurrentField='KEEP';await PRP.store.put('assist',a);}
                      if(__scenario==='changed'){const a=await PRP.store.get('assist',__id);a.messages.at(-1).text='CHANGED_ELSEWHERE';await PRP.store.put('assist',a);}
                    }""")
                    if scenario in ['abort','partial-abort','abort-late-success']:
                        page.click('[data-act=stop]')
                    if scenario not in ['abort','partial-abort']:
                        page.evaluate('__finishModel()')
                    page.wait_for_function('__finished && !PRP.app.S.gen')
                    page.evaluate('()=>{IDBObjectStore.prototype.put=window.__put;}')
                    state=page.evaluate("""async()=>({saved:await PRP.store.get('assist',__id),before:JSON.parse(__before),live:PRP.app.S.assist,outcome:__outcome,error:__error,calls:__calls})""")
                    assert state['calls']==1
                    if scenario in ['success','metadata']:
                        assert [m['text'] for m in state['saved']['messages']]==['Question','REPLACEMENT']
                        assert state['saved']==state['live']
                        if scenario=='metadata':assert state['saved']['title']=='KEEP_NEW_TITLE' and state['saved']['concurrentField']=='KEEP'
                    elif scenario=='deleted':assert state.get('saved') is None
                    elif scenario=='changed':assert state['saved']['messages'][-1]['text']=='CHANGED_ELSEWHERE'
                    else:
                        assert state['saved']==state['before'],(scenario,state)
                        assert state['live']==state['before'],(scenario,state)
                        assert page.inner_text('.aturn.assistant .md')=='KEEP_ORIGINAL'
                    # Reload verifies the durable result, including rejected writes.
                    page.evaluate('PRP.store.setSetting("ui",{view:"assist",assistId:__id})')
                    page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.settings')
                    row=page.evaluate('async id=>await PRP.store.get("assist",id)',state['before']['id'])
                    assert row==state.get('saved'),scenario+': reload differs'
                    # Reload restores real adapters; install the next fixture afresh.
                    page.evaluate("""kind=>{const {S,ctx}=PRP.app;window.ai=()=>Promise.resolve({generatedText:'fixture'});
                      S.settings.providers=[{id:'api',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];S.settings.activeProvider=kind==='perchance'?'perchance':'api';S.settings.autoContext=false;S.settings.contextTokens=32000;
                      window.__oldGenerate=ctx.svc.assist.generate;ctx.svc.assist.generate=(...args)=>{window.__finished=false;window.__outcome=null;window.__error=null;return __oldGenerate(...args).then(r=>{__finished=true;__outcome=r;return r;},e=>{__finished=true;__error=e.message;throw e;});};
                    }""",kind)
                    checks.append(scenario+': PASS')
                assert not errors,errors
                results.append({'provider':kind,'width':width,'checks':checks,'reload':'PASS'})
                context.close()
        browser.close()
finally:
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
