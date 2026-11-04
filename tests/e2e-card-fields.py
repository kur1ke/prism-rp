"""F07: editor selection/token UI, actual transports, overflow, export and reload."""
import json, os, pathlib, shutil, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-f07-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('PRISM_CHROMIUM') or shutil.which('chromium'))
        for mode in ['rp','messenger']:
            for kind in ['openai','perchance']:
                for width in [1440,390]:
                    context=browser.new_context(viewport={'width':width,'height':900},accept_downloads=True)
                    context.add_init_script('window.__PRP_TEST_MIRROR=true')
                    page=context.new_page();errors=[]
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                    page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
                    page.evaluate('''async({mode,kind})=>{
                      const {ctx,S}=PRP.app,DB=PRP.store;
                      const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'Описание. '.repeat(150)+'DESC_END',
                        personality:'Черта. '.repeat(170)+'PERS_END',appearance:'Внешность. '.repeat(100)+'LOOK_END'});
                      await DB.put('cards',card);await ctx.nav.loadAll();
                      const id=await ctx.svc.chat.createChat(mode,card.id);
                      if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-04T12:00:00.000Z'});
                      await ctx.nav.openChat(id);
                      S.settings.images.enabled=false;S.settings.autoContext=false;S.settings.contextTokens=32000;S.settings.sampler.max_tokens=700;
                      S.settings.providers=[{id:'api',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
                      S.settings.activeProvider=kind==='openai'?'api':'perchance';
                      PRP.llm.simple=async()=>JSON.stringify({events:[]});ctx.svc.memory.observe=async()=>({status:'disabled'});
                      window.__calls=[];
                      const verify=(text,used)=>{if(used+700>ctx.contextTokens())throw Error('Fixture budget exceeded');__calls.push(text);};
                      window.ai=request=>{
                        if(request.getMetaObject)return {idealMaxContextTokens:32000};
                        const text=request.instruction();verify(text,PRP.util.estimateTokens(text)+PRP.util.estimateTokens(request.startWith()));
                        return Promise.resolve({generatedText:'ANSWER'});
                      };
                      const original=window.fetch;
                      window.fetch=async(url,opts)=>{
                        if(String(url)==='https://fixture.invalid/v1/chat/completions'){
                          const body=JSON.parse(opts.body);verify(JSON.stringify(body.messages),body.messages.reduce((n,m)=>n+PRP.util.estimateTokens(m.content)+4,0));
                          const nl=String.fromCharCode(10);
                          return new Response('data: '+JSON.stringify({choices:[{delta:{content:'ANSWER'}}]})+nl+nl+'data: [DONE]'+nl+nl,
                            {status:200,headers:{'Content-Type':'text/event-stream'}});
                        }return original(url,opts);
                      };
                      window.__edit=()=>PRP.controllers.cards(ctx).actions['edit-card']({dataset:{id:'card'}});
                      __edit();
                    }''',{'mode':mode,'kind':kind})
                    for key in ['description','personality','appearance']:
                        assert page.locator('[data-cf-send="'+key+'"]').is_checked()
                    assert not page.locator('[data-cf-send=prismCore]').is_checked()
                    assert '≈' in page.inner_text('#card-token-summary')
                    # Input updates counters/colour without replacing the textarea or focus.
                    for factor,level in [(5,'normal'),(3,'warn'),(1,'danger')]:
                        page.evaluate('''factor=>{const {ctx,S}=PRP.app,n=PRP.cardContext.tokenUsage(S.modal.draft,100000).total;
                          S.settings.contextTokens=n*factor+700;
                          const t=document.querySelector('#cf-desc');t.focus();t.setSelectionRange(8,8);t.dispatchEvent(new Event('input',{bubbles:true}));}''',factor)
                        assert level in page.get_attribute('#card-token-summary','class')
                        assert page.evaluate('document.activeElement.id==="cf-desc" && document.activeElement.selectionStart===8')
                    page.evaluate('PRP.app.S.settings.contextTokens=32000')
                    page.click('[data-act=card-save]');page.wait_for_function('!PRP.app.S.modal')
                    page.fill('#input','FIRST');page.click('[data-act=send]')
                    page.wait_for_function('__calls.length===1 && !PRP.app.S.gen && !PRP.app.S.turn')
                    assert all(marker in page.evaluate('__calls[0]') for marker in ['DESC_END','PERS_END','LOOK_END'])
                    page.evaluate('__edit()')
                    page.uncheck('[data-cf-send=appearance]')
                    page.locator('summary').filter(has_text='Ядро для Prism').click()
                    page.check('[data-cf-send=prismCore]');page.fill('#core-identity','CORE_INCLUDED')
                    page.fill('#core-traits','Long trait. '*100+'CORE_END')
                    assert page.inner_text('#core-state')=='Включено'
                    page.click('[data-act=card-save]');page.wait_for_function('!PRP.app.S.modal')
                    page.fill('#input','SECOND');page.click('[data-act=send]')
                    page.wait_for_function('__calls.length===2 && !PRP.app.S.gen && !PRP.app.S.turn')
                    request=page.evaluate('__calls[1]')
                    assert 'LOOK_END' not in request and all(x in request for x in ['DESC_END','PERS_END','CORE_INCLUDED','CORE_END'])
                    page.evaluate('''async()=>{window.__before=JSON.stringify({messages:await PRP.store.all('messages'),chats:await PRP.store.all('chats')});
                      PRP.app.S.settings.contextTokens=1024;}''')
                    page.fill('#input','KEEP_DRAFT');page.click('[data-act=send]')
                    page.wait_for_function('document.querySelector("#input").value==="KEEP_DRAFT" && !PRP.app.S.gen && !PRP.app.S.turn')
                    assert page.evaluate('__calls.length')==2
                    assert page.evaluate('async()=>__before===JSON.stringify({messages:await PRP.store.all("messages"),chats:await PRP.store.all("chats")})')
                    page.evaluate('PRP.app.S.settings.contextTokens=32000;__edit()')
                    assert not page.locator('[data-cf-send=appearance]').is_checked()
                    assert page.input_value('#cf-app').endswith('LOOK_END'), 'disabled field lost stored text'
                    # Actual JSON export retains checkbox choices; imported Core still needs review.
                    page.click('[data-act=card-section][data-section=meta]')
                    with page.expect_download() as info:page.click('[data-act=card-json]')
                    exported=out/f'card-{mode}-{kind}-{width}.json';info.value.save_as(exported)
                    data=json.loads(exported.read_text());flags=data['data']['extensions']['prism_rp']['contextFields']
                    assert flags=={'description':True,'personality':True,'appearance':False,'prismCore':True},flags
                    imported=page.evaluate('''spec=>{const result=PRP.cardImport.fromJsonText(JSON.stringify(spec),'card.json');
                      const c=result.draft;return {flags:c.contextFields,reviewed:c.prismCore.reviewed,
                        text:PRP.assembler.build({card:c,contextTokens:32000}).messages[0].content};}''',data)
                    assert imported['flags']==flags and imported['reviewed'] is False
                    assert 'CORE_INCLUDED' not in imported['text'] and 'LOOK_END' not in imported['text']
                    page.screenshot(path=str(out/f'{mode}-{kind}-{width}.png'))
                    page.reload();page.wait_for_selector('.chat-head')
                    stored=page.evaluate('({flags:PRP.app.ctx.card().contextFields,appearance:PRP.app.ctx.card().appearance})')
                    assert stored['flags']==flags and stored['appearance'].endswith('LOOK_END')
                    assert errors==[],errors
                    results.append({'mode':mode,'provider':kind,'width':width,'fullTextSelectionTokensOverflowExportReload':'PASS','runtimeErrors':errors})
                    context.close()
        browser.close()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:
    server.terminate();server.wait()
