"""F11 actual transports + native IDB: multiple events, atomic failure/retry, drawer and reload."""
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
   for provider in ['openai','perchance']:
    for width in [1440,390]:
     context=browser.new_context(viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
     result=page.evaluate('''async({mode,provider})=>{
      const P=PRP,DB=P.store,card=Object.assign(P.cardModel.blank(),{id:'owner',name:'N'}),chat={id:'episodes',cardId:'owner',mode};
      const quotes=['Персонаж получил серебряный компас.','Персонаж поссорился с другом.','Персонаж договорился о встрече у маяка.'];
      const a={id:'multi',chatId:chat.id,role:'assistant',swipeIdx:0,swipes:[{text:quotes.join(' ')}]},path=[a];
      await DB.putAll([['cards',card],['chats',chat],['messages',a]]);
      const model={id:'fixture',kind:provider,baseUrl:'https://fixture.invalid/v1',model:'fixture'};
      const S={chatId:chat.id,memories:[],reflections:[]},ctx={S,DB,svc:{chat:{path:()=>path},prism:{refresh(){}}},chat:()=>chat,card:()=>card,persona:()=>({name:'U'}),contextTokens:()=>32000,provider:()=>model};
      let extracts=0,reflections=0;
      const answer=data=>{
       if(data.sources){extracts++;const memories=quotes.map(quote=>({messageId:a.id,quote,event:quote,kind:'observed'}));return JSON.stringify({memories:[...memories,{...memories[0]}]});}
       reflections++;if(data.memories.length!==3||!quotes.every(q=>data.memories.some(m=>m.event===q)))throw Error('episodes missing from reflection');
       return JSON.stringify({change:'changed',perspective:'Персонаж по-разному осмысливает подарок, ссору и предстоящую встречу.'});
      };
      window.ai=async request=>{const instruction=request.instruction();const row=instruction.split(String.fromCharCode(10)).find(x=>x.startsWith('{"role":"user"'));
        if(!row||request.startWith()!=='')throw Error('incorrect JSON transport');return {generatedText:answer(JSON.parse(JSON.parse(row).content))};};
      const originalFetch=window.fetch;window.fetch=async(url,opts)=>{
       if(String(url)!=='https://fixture.invalid/v1/chat/completions')return originalFetch(url,opts);
       const data=JSON.parse(JSON.parse(opts.body).messages.find(m=>m.role==='user').content),nl=String.fromCharCode(10);
       return new Response('data: '+JSON.stringify({choices:[{delta:{content:answer(data)}}]})+nl+nl+'data: [DONE]'+nl+nl,{headers:{'Content-Type':'text/event-stream'}});
      };
      const svc=P.memoryService.create(ctx),putAll=DB.putAll;
      DB.putAll=async rows=>{const receipt=rows.find(([store])=>store==='memorySources')[1];return putAll([...rows,['memorySources',{...receipt,id:'conflicting-key'}]]);};
      if((await svc.observe(a)).status!=='source-commit-error')throw Error('expected atomic failure');DB.putAll=putAll;
      if((await DB.byIndex('memories','chatId',chat.id)).length||(await DB.byIndex('memorySources','chatId',chat.id)).length)throw Error('partial commit');
      if((await svc.observe(a)).status!=='reflected')throw Error('retry failed');
      const memories=await DB.byIndex('memories','chatId',chat.id),receipts=await DB.byIndex('memorySources','chatId',chat.id);
      if(memories.length!==3||receipts.length!==1||receipts[0].coverage!=='full')throw Error('incorrect episodes/receipt');
      if((await svc.observe(a)).status!=='no-unprocessed-source'||extracts!==2||reflections!==1)throw Error('source replay');
      const backup=P.backup.check({cards:[card],chats:[chat],messages:[a],memories,memorySources:receipts},{replace:true});
      if(backup.data.memories.length!==3||backup.data.memorySources.length!==1)throw Error('backup dropped episodes');
      const node=document.createElement('div');node.id='memory-fixture';node.innerHTML=P.views.drawer({chat,tab:'memory',observedMemories:svc.visibleMemories(),currentExperience:svc.experience(),memoryTimeline:svc.timeline(),memoryStatus:S.memoryStatus});document.body.append(node);
      for(const q of quotes)if(!node.textContent.includes(q))throw Error('drawer omitted episode');
      a.swipes.push({text:'Другая ветка без прежних событий.'});a.swipeIdx=1;
      if(svc.visibleMemories().length!==0||svc.experience()!==null)throw Error('sibling leak');
      a.swipeIdx=0;if(svc.visibleMemories().length!==3)throw Error('return lost episodes');
      return {mode,provider,width:innerWidth,episodes:3,receipts:1,atomicRetry:'PASS',drawer:'PASS',swipeIsolation:'PASS',backup:'PASS'};
     }''',{'mode':mode,'provider':provider})
     assert page.locator('#memory-fixture .ev').count()==3
     page.reload();page.wait_for_function('window.PRP && PRP.app')
     restored=page.evaluate('''async()=>{
       const P=PRP,DB=P.store,chat=await DB.get('chats','episodes'),card=await DB.get('cards','owner'),a=await DB.get('messages','multi'),path=[a],S={chatId:chat.id,memories:[],reflections:[]};
       const ctx={S,DB,svc:{chat:{path:()=>path}},chat:()=>chat,card:()=>card},svc=P.memoryService.create(ctx);P.llm.chat=()=>{throw Error('replayed after reload')};await svc.load(chat.id);
       return {visible:svc.visibleMemories().length,timeline:svc.timeline().memoryCount,status:(await svc.observe(a)).status};
     }''')
     assert restored=={'visible':3,'timeline':3,'status':'no-unprocessed-source'};assert not errors,errors
     result.update({'nativeReload':'PASS','runtimeErrors':errors});results.append(result);context.close()
  browser.close()
 (out/'browser.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:server.terminate();server.wait()
