"""F08: complete constant custom fields, real transports, optional selection and overflow."""
import json, os, pathlib, shutil, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-f08-'))
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
                      const customFields=Array.from({length:7},(_,i)=>({id:'f'+i,label:'Свойство '+i,text:('Свойство '+i+'. ').repeat(80)+'END_'+i,enabled:true,mode:'always'}));
                      customFields.push({id:'disabled',label:'Выключенное',text:'DISABLED_NEVER_SEND',enabled:false,mode:'always'});
                      customFields.push({id:'optional',label:'Ремесло',text:'Изучает Алхимию и кристаллы. OPTIONAL_MARKER',enabled:true,mode:'relevant'});
                      const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Аля',description:'Описание',customFields});
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
                    assert page.locator('[data-custom]').count()>7
                    assert page.locator('[data-custom="0"][data-k=enabled]').is_checked()
                    page.check('[data-custom-more="f6"]')
                    assert page.locator('[data-custom="6"][data-k=mode]').input_value()=='always'
                    assert 'На каждом ходе целиком' in page.locator('[data-custom="6"][data-k=mode]').inner_text()
                    page.click('[data-act=card-save]');page.wait_for_function('!PRP.app.S.modal')
                    page.fill('#input','FIRST');page.click('[data-act=send]')
                    page.wait_for_function('__calls.length===1 && !PRP.app.S.gen && !PRP.app.S.turn')
                    request=page.evaluate('__calls[0]')
                    assert all('END_'+str(i) in request for i in range(7))
                    assert 'DISABLED_NEVER_SEND' not in request and 'OPTIONAL_MARKER' not in request
                    assert page.evaluate('PRP.app.S.lastPrism.report.card.selected.length')==7
                    page.evaluate('__edit()');page.check('[data-custom-more="f6"]')
                    page.select_option('[data-custom="6"][data-k=mode]','relevant')
                    page.click('[data-act=card-save]');page.wait_for_function('!PRP.app.S.modal')
                    page.fill('#input','SECOND');page.click('[data-act=send]')
                    page.wait_for_function('__calls.length===2 && !PRP.app.S.gen && !PRP.app.S.turn')
                    request=page.evaluate('__calls[1]')
                    assert all('END_'+str(i) in request for i in range(6)) and 'END_6' not in request
                    page.fill('#input','Алхимия и кристаллы');page.click('[data-act=send]')
                    page.wait_for_function('__calls.length===3 && !PRP.app.S.gen && !PRP.app.S.turn')
                    assert 'OPTIONAL_MARKER' in page.evaluate('__calls[2]')
                    page.evaluate('''async()=>{window.__before=JSON.stringify({messages:await PRP.store.all('messages'),chats:await PRP.store.all('chats')});
                      PRP.app.S.settings.contextTokens=1024;}''')
                    page.fill('#input','KEEP_DRAFT');page.click('[data-act=send]')
                    page.wait_for_function('document.querySelector("#input").value==="KEEP_DRAFT" && !PRP.app.S.gen && !PRP.app.S.turn')
                    assert page.evaluate('__calls.length')==3
                    assert page.evaluate('async()=>__before===JSON.stringify({messages:await PRP.store.all("messages"),chats:await PRP.store.all("chats")})')
                    page.evaluate('PRP.app.S.settings.contextTokens=32000;__edit()')
                    assert page.input_value('[data-custom="6"][data-k=text]').endswith('END_6')
                    assert page.locator('[data-custom="6"][data-k=mode]').input_value()=='relevant'
                    page.click('[data-act=card-section][data-section=meta]')
                    with page.expect_download() as info:page.click('[data-act=card-json]')
                    exported=out/f'card-{mode}-{kind}-{width}.json';info.value.save_as(exported)
                    data=json.loads(exported.read_text());fields=data['data']['extensions']['prism_rp']['customFields']
                    assert len(fields)==9 and fields[6]['mode']=='relevant' and fields[7]['enabled'] is False
                    imported=page.evaluate("spec=>PRP.cardImport.fromJsonText(JSON.stringify(spec),'card.json').draft.customFields",data)
                    assert len(imported)==9 and all(f['enabled'] is False for f in imported)
                    page.screenshot(path=str(out/f'{mode}-{kind}-{width}.png'))
                    page.reload();page.wait_for_selector('.chat-head')
                    stored=page.evaluate('PRP.app.ctx.card().customFields')
                    assert len(stored)==9 and stored[6]['mode']=='relevant' and stored[6]['text'].endswith('END_6')
                    assert errors==[],errors
                    results.append({'mode':mode,'provider':kind,'width':width,'fullConstantFieldsOptionalOverflowExportReload':'PASS','runtimeErrors':errors})
                    context.close()
        browser.close()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:
    server.terminate();server.wait()
