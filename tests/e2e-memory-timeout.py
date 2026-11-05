"""F13 real adapters/native IDB: bounded all phases, abort ignored by remote, safe late reply."""
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
  for mode in ['rp','messenger']:
   for provider in ['openai','perchance']:
    for stage in ['extract','reflect','batch','integrate']:
     for width in [1440,390]:
      context=browser_context(browser, viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e,bag=errors:bag.append(str(e)))
      page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
      result=page.evaluate('''async({mode,provider,stage})=>{
       const P=PRP,M=P.memoryCycle,DB=P.store,card=Object.assign(P.cardModel.blank(),{id:'owner',name:'Аля'}),chat={id:'timeout',cardId:'owner',mode},path=[];
       const message=(id,text)=>({id,chatId:chat.id,role:'assistant',parentId:path.at(-1)?.id||null,swipeIdx:0,swipes:[{text}]});
       const n=stage==='batch'?9:stage==='integrate'?99:0;
       for(let i=0;i<n;i++)path.push(message('seed'+i,'Персонаж получил письмо номер '+i+'.'));
       const snap=M.pathSnapshot(path),memories=snap.map((s,i)=>({id:'mem'+i,chatId:chat.id,owner:card.id,createdAt:i,event:'Персонаж получил письмо номер '+i,quote:s.text,kind:'reported',source:{messageId:s.id,swipeIdx:0,textHash:s.textHash,prefixHash:s.prefixHash}})),refs=[];
       if(stage==='integrate')for(let i=0;i<9;i++){
        const plan=M.checkpointPlan(memories,refs,snap,chat.id,card.id);refs.push({id:plan.id,kind:'batch',schema:1,chatId:chat.id,owner:card.id,anchor:plan.anchor,memoryIds:plan.memoryIds,change:'changed',perspective:'Предыдущий опыт пакета '+i,createdAt:i});
       }
       await DB.putAll([['cards',card],['chats',chat],...path.map(m=>['messages',m]),...memories.map(m=>['memories',m]),...refs.map(r=>['reflections',r])]);
       const model={id:'fixture',kind:provider,baseUrl:'https://fixture.invalid/v1',model:'fixture'},S={chatId:chat.id,memories:[],reflections:[]};
       const ctx={S,DB,memoryTimeoutMs:60,svc:{chat:{path:()=>path},prism:{refresh(){}}},chat:()=>chat,card:()=>card,persona:()=>({name:'Кира'}),contextTokens:()=>32000,provider:()=>model},svc=P.memoryService.create(ctx);await svc.load(chat.id);
       const phase=data=>data.sources?'extract':data.batches?'integrate':Object.hasOwn(data,'previousExperience')?'reflect':'batch';
       const answer=data=>data.sources?JSON.stringify({memories:[{messageId:data.sources.at(-1).messageId,quote:data.sources.at(-1).text,event:'Персонаж сообщил: '+data.sources.at(-1).text,kind:'reported'}]}):JSON.stringify({change:'changed',perspective:'Персонаж осмысливает: '+(data.memories?.[0]?.event||'общий опыт всех событий.')});
       let held=false,release,aborts=0,stops=0,calls=0;
       window.ai=request=>{
        calls++;const row=request.instruction().split(String.fromCharCode(10)).find(x=>x.startsWith('{"role":"user"')),data=JSON.parse(JSON.parse(row).content);
        if(phase(data)===stage&&!held){held=true;const wait=new Promise(resolve=>{release=()=>resolve({generatedText:answer(data)})});wait.stop=()=>{stops++};return wait;}
        return Promise.resolve({generatedText:answer(data)});
       };
       const originalFetch=window.fetch;window.fetch=async(url,opts)=>{
        if(String(url)!=='https://fixture.invalid/v1/chat/completions')return originalFetch(url,opts);
        calls++;const body=JSON.parse(opts.body),data=JSON.parse(body.messages[1].content),nl=String.fromCharCode(10);
        const result=()=>new Response('data: '+JSON.stringify({choices:[{delta:{content:answer(data)}}]})+nl+nl+'data: [DONE]'+nl+nl,{headers:{'Content-Type':'text/event-stream'}});
        if(phase(data)===stage&&!held){held=true;opts.signal.addEventListener('abort',()=>{aborts++},{once:true});return new Promise(resolve=>{release=()=>resolve(result())});}
        return result();
       };
       const a=message('a','Персонаж назначил встречу у маяка.');path.push(a);await DB.put('messages',a);
       const timeout=await svc.observe(a,model);if(timeout.status!==stage+'-timeout')throw Error('wrong timeout phase: '+timeout.status);
       if(provider==='openai'?aborts!==1:stops!==1)throw Error('abort not transported');
       const m=await DB.byIndex('memories','chatId',chat.id),r=await DB.byIndex('reflections','chatId',chat.id),journal=await DB.byIndex('memorySources','chatId',chat.id);
       if(m.length!==n+(stage==='extract'?0:1)||journal.length!==(stage==='extract'?0:1))throw Error('false extraction receipt / lost memory');
       if(stage==='reflect'&&r.length!==0||stage==='batch'&&r.some(x=>x.kind==='batch')||stage==='integrate'&&r.some(x=>x.kind==='integrated'))throw Error('false timed-out Reflection');
       const b=message('b','Персонаж вернулся домой после встречи.');path.push(b);await DB.put('messages',b);
       if((await svc.observe(b,model)).status!=='reflected')throw Error('FIFO not recovered');
       const saved=async()=>({memories:await DB.byIndex('memories','chatId',chat.id),reflections:await DB.byIndex('reflections','chatId',chat.id),journal:await DB.byIndex('memorySources','chatId',chat.id)});
       const before=JSON.stringify(await saved()),ui=JSON.stringify(S);release();await new Promise(resolve=>setTimeout(resolve,20));
       if(JSON.stringify(await saved())!==before||JSON.stringify(S)!==ui)throw Error('late model mutated data');
       window.__beforeReload=before;
       return {mode,provider,stage,width:innerWidth,status:timeout.status,fifo:'PASS',abort:'PASS',lateReply:'PASS',persistence:'PASS',calls};
      }''',{'mode':mode,'provider':provider,'stage':stage})
      before=page.evaluate('window.__beforeReload')
      page.reload();page.wait_for_function('window.PRP && PRP.app')
      restored=page.evaluate("async()=>JSON.stringify({memories:await PRP.store.byIndex('memories','chatId','timeout'),reflections:await PRP.store.byIndex('reflections','chatId','timeout'),journal:await PRP.store.byIndex('memorySources','chatId','timeout')})")
      assert restored==before;assert not errors,errors
      result.update({'reload':'PASS','runtimeErrors':errors});results.append(result);context.close()
  browser.close()
 (out/'browser.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:server.terminate();server.wait()
