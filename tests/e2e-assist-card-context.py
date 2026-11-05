"""F27 actual assistant UI/transports: canonical consultation data, settings and strict budget."""
from browser_support import launch_chromium, browser_context
import json,pathlib,shutil,socket,subprocess,sys
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for kind in ['openai','perchance']:
   for width in [1440,390]:
    context=browser_context(browser, viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e,bag=errors:bag.append(str(e)))
    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
    page.evaluate('''async kind=>{
     const P=PRP,ctx=P.app.ctx,DB=P.store;
     const card=Object.assign(P.cardModel.blank(),{id:'card',name:'Аля',description:'OFF_DESCRIPTION',contextFields:{description:false,personality:true,appearance:true,prismCore:true},prismCore:{identity:'CORE_IMPORT',traits:['TRAIT'],voice:[],durableContext:[],reviewed:false,source:'imported'},
      customFields:[{id:'off',label:'Выключенное',text:'CUSTOM_OFF',enabled:false,mode:'always'},{id:'always',label:'Полный текст',text:'DETAIL '.repeat(1200)+'CUSTOM_END',enabled:true,mode:'always'},{id:'candidate',label:'По теме',text:'CUSTOM_CANDIDATE',enabled:true,mode:'relevant'}],
      source:{raw:'RAW_SECRET_NEVER_SEND'},directives:{system:{text:'DISABLED_DIRECTIVE_NEVER_SEND',enabled:false}},lore:Array.from({length:22},(_,i)=>({content:'LORE_'+i,enabled:false,keys:[],constant:false}))});
     await DB.put('cards',card);await ctx.nav.loadAll();window.__originalCard=JSON.stringify(await DB.get('cards','card'));window.__calls=[];
     const verify=messages=>{
      const text=messages.map(m=>m.content).join(String.fromCharCode(10));const line=text.split(String.fromCharCode(10)).find(x=>x.startsWith('{"card":')),d=JSON.parse(line);
      if(d.card.prismCore.identity!=='CORE_IMPORT'||d.card.prismCore.reviewed!==false||d.rpSelection.core.status!=='unreviewed'||d.rpSelection.fields.description!==false||d.actualRpRequest!==null)throw Error('wrong card scope');
      if(d.card.description!=='OFF_DESCRIPTION'||d.card.customFields[0].text!=='CUSTOM_OFF'||!d.card.customFields[1].text.endsWith('CUSTOM_END')||d.card.lore.length!==22)throw Error('card truncated');
      if(d.rpSelection.customFields.map(x=>x.status).join(',')!=='disabled,required,candidate')throw Error('wrong custom selection');
      if(text.includes('RAW_SECRET_NEVER_SEND')||text.includes('DISABLED_DIRECTIVE_NEVER_SEND'))throw Error('raw/disabled authority leaked');__calls.push(d);
     };
     window.ai=request=>{if(request.getMetaObject)return {idealMaxContextTokens:32000};verify([{content:request.instruction()}]);return Promise.resolve({generatedText:'ANSWER'});};
     const originalFetch=window.fetch;window.fetch=async(url,opts)=>{
      if(String(url)!=='https://fixture.invalid/v1/chat/completions')return originalFetch(url,opts);
      const body=JSON.parse(opts.body);verify(body.messages);const nl=String.fromCharCode(10);
      return new Response('data: '+JSON.stringify({choices:[{delta:{content:'ANSWER'}}]})+nl+nl+'data: [DONE]'+nl+nl,{headers:{'Content-Type':'text/event-stream'}});
     };
     ctx.S.settings.providers=[{id:'api',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];ctx.S.settings.activeProvider=kind==='openai'?'api':'perchance';
     ctx.S.settings.autoContext=false;ctx.S.settings.contextTokens=1024;ctx.S.settings.sampler.max_tokens=1500;
     ctx.nav.openAssist(null,{cardId:'card',chatId:null});window.__initial=JSON.stringify(ctx.S.assist);
    }''',kind)
    assert 'включая выключенные в отыгрыше' in page.locator('.assist-empty').inner_text()
    assert 'Копия отправленного RP-запроса не приложена' in page.locator('.assist-empty').inner_text()
    page.fill('#input','KEEP_DRAFT');page.click('[data-act="send"]');page.wait_for_function('PRP.app.S.lastAssistBudget?.overflow && !PRP.app.S.gen')
    rejected=page.evaluate('async()=>({calls:__calls.length,unchanged:__initial===JSON.stringify(PRP.app.S.assist),rows:(await PRP.store.all("assist")).length})')
    assert rejected=={'calls':0,'unchanged':True,'rows':0} and page.input_value('#input')=='KEEP_DRAFT'
    page.evaluate('PRP.app.S.settings.contextTokens=32000');page.click('[data-act="send"]');page.wait_for_function('__calls.length===1 && !PRP.app.S.gen && PRP.app.S.assist.messages.at(-1)?.text==="ANSWER"')
    result=page.evaluate('''async()=>({cardUnchanged:__originalCard===JSON.stringify(await PRP.store.get('cards','card')),rpMessages:(await PRP.store.all('messages')).length,assistMessages:(await PRP.store.all('assist'))[0].messages.map(m=>m.text),scope:__calls[0].rpSelection.core.status})''')
    assert result=={'cardUnchanged':True,'rpMessages':0,'assistMessages':['KEEP_DRAFT','ANSWER'],'scope':'unreviewed'}
    page.screenshot(path=str(out/f'assistant-{kind}-{width}.png'));saved=page.evaluate('async()=>JSON.stringify(await PRP.store.all("assist"))')
    page.reload();page.wait_for_function('window.PRP && PRP.app');assert page.evaluate('async()=>JSON.stringify(await PRP.store.all("assist"))')==saved;assert not errors,errors
    results.append({'kind':kind,'width':width,'consultationScope':'PASS','overflowDraftRetry':'PASS','cardAndRpReadOnly':'PASS','nativeReload':'PASS','runtimeErrors':errors});context.close()
  browser.close()
 (out/'browser.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:server.terminate();server.wait()
