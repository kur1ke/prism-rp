"""F12 complete text/citations through real adapters and native IndexedDB."""
import json,pathlib,shutil,socket,subprocess,sys
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'))
  for mode in ['rp','messenger']:
   for role in ['user','assistant']:
    for provider in ['openai','perchance']:
     for width in [1440,390]:
      context=browser.new_context(viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
      page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
      result=page.evaluate('''async({mode,role,provider})=>{
       const P=PRP,DB=P.store,card=Object.assign(P.cardModel.blank(),{id:'owner',name:'Аля'}),chat={id:'full-text',cardId:'owner',mode};
       const text='Длинное вступление без изменений. '.repeat(170)+'Я дома.',a={id:'long',chatId:chat.id,role,swipeIdx:0,swipes:[{text}]},path=[a];
       await DB.putAll([['cards',card],['chats',chat],['messages',a]]);
       const model={id:'fixture',kind:provider,baseUrl:'https://fixture.invalid/v1',model:'fixture'},S={chatId:chat.id,messages:path,settings:{}};
       let windowTokens=1024,calls=0;
       const ctx={S,DB,svc:{chat:{path:()=>path}},chat:()=>chat,card:()=>card,persona:()=>({name:'Кира'}),contextTokens:()=>windowTokens,provider:()=>model};
       const svc=P.stateService.create(ctx);ctx.svc.state=svc;
       const answer=instruction=>{
        calls++;const line=instruction.split(String.fromCharCode(10)).find(x=>x.startsWith('SOURCE_FRAGMENTS'));
        const rows=JSON.parse(line.slice(line.indexOf('['))),last=rows.at(-1);
        if(rows.length!==171||last.id!=='T170'||last.text!=='Я дома.')throw Error('source truncated');
        return JSON.stringify({events:[{actor:role==='user'?'user':'char',field:'location',action:'set',value:'дома',certainty:'reported',sourceId:last.id}]});
       };
       window.ai=async request=>({generatedText:answer(request.instruction())});
       const originalFetch=window.fetch;window.fetch=async(url,opts)=>{
        if(String(url)!=='https://fixture.invalid/v1/chat/completions')return originalFetch(url,opts);
        const instruction=JSON.parse(opts.body).messages[0].content,nl=String.fromCharCode(10);
        return new Response('data: '+JSON.stringify({choices:[{delta:{content:answer(instruction)}}]})+nl+nl+'data: [DONE]'+nl+nl,{headers:{'Content-Type':'text/event-stream'}});
       };
       const before=JSON.stringify(await DB.get('messages',a.id));
       if((await svc.track(a,model)).status!=='overflow'||calls!==0||JSON.stringify(await DB.get('messages',a.id))!==before)throw Error('overflow mutated source');
       windowTokens=32000;
       const put=DB.put,putAll=DB.putAll;DB.put=async(store,row)=>putAll([[store,row],['messages',{}]]);
       const rejected=await svc.track(a,model);DB.put=put;
       if(!rejected.error||JSON.stringify(await DB.get('messages',a.id))!==before||a.swipes[0].stateStatus)throw Error('partial failed commit');
       const result=await svc.track(a,model);if(result.status!=='ok'||result.events[0].sourceSpan.start<=4500||calls!==2)throw Error('tail not committed');
       const saved=await DB.get('messages',a.id);if(saved.swipes[0].stateStatus.analysedTextChars!==text.length)throw Error('false coverage');
       const snap=svc.snapshot(),own=role==='user'?'user':'char',other=role==='user'?'char':'user';
       if(P.stateTracker.fieldOf(snap,own,'location').value!=='дома'||P.stateTracker.fieldOf(snap,other,'location'))throw Error('ownership conflict');
       if((await svc.track(a,model)).skipped!=='already-processed'||calls!==2)throw Error('replayed full source');
       const checked=P.backup.check({cards:[card],chats:[chat],messages:[saved]},{replace:true});
       if(checked.data.messages[0].swipes[0].stateStatus.analysedTextChars!==text.length)throw Error('backup lost coverage');
       a.swipes.push({text:'Альтернативная ветка.'});a.swipeIdx=1;
       if(P.stateTracker.fieldOf(svc.snapshot(),own,'location'))throw Error('sibling leak');a.swipeIdx=0;
       return {mode,role,provider,width:innerWidth,chars:text.length,sourceId:'T170',overflow:'PASS',atomicRetry:'PASS',ownership:'PASS',backup:'PASS',swipeIsolation:'PASS'};
      }''',{'mode':mode,'role':role,'provider':provider})
      page.reload();page.wait_for_function('window.PRP && PRP.app')
      restored=page.evaluate('''async()=>{
       const P=PRP,DB=P.store,a=await DB.get('messages','long'),chat=await DB.get('chats','full-text'),card=await DB.get('cards','owner'),S={chatId:chat.id};
       const ctx={S,DB,svc:{chat:{path:()=>[a]}},chat:()=>chat,card:()=>card,persona:()=>({name:'Кира'})},svc=P.stateService.create(ctx);
       P.llm.simple=()=>{throw Error('replayed after reload')};const r=await svc.track(a,{id:'fixture',kind:'openai'});
       return {chars:a.swipes[0].stateStatus.analysedTextChars,sourceLength:a.swipes[0].text.length,skipped:r.skipped,location:P.stateTracker.fieldOf(svc.snapshot(),a.role==='user'?'user':'char','location').value};
      }''')
      assert restored['chars']==restored['sourceLength']==result['chars'] and restored['skipped']=='already-processed' and restored['location']=='дома';assert not errors,errors
      result.update({'nativeReload':'PASS','runtimeErrors':errors});results.append(result);context.close()
  browser.close()
 (out/'browser.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:server.terminate();server.wait()
