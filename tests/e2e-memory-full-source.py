"""F10 native IndexedDB coverage receipt, competing upgrade, backup and reload."""
from browser_support import launch_chromium, browser_context
import json,pathlib,shutil,socket,subprocess,sys
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with sync_playwright() as p:
  browser=launch_chromium(p);context=browser_context(browser, );context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
  result=page.evaluate('''async()=>{
   const P=PRP,DB=P.store,card=Object.assign(P.cardModel.blank(),{id:'owner',name:'N'}),chat={id:'coverage',cardId:'owner',mode:'rp'},tail='В конце она подарила серебряный компас.';
   const a={id:'long',chatId:chat.id,role:'assistant',swipeIdx:0,swipes:[{text:'Вступление. '.repeat(160)+tail}]},path=[a];
   await DB.putAll([['cards',card],['chats',chat],['messages',a]]);
   const snap=P.memoryCycle.pathSnapshot(path)[0],source={messageId:a.id,swipeIdx:0,textHash:snap.textHash,prefixHash:snap.prefixHash};
   await DB.put('memorySources',{id:'old',schema:1,chatId:chat.id,owner:card.id,source,sourceKey:P.memoryCycle.sourceKey(chat.id,card.id,source),result:'empty'});
   const S={chatId:chat.id,memories:[],reflections:[]},ctx={S,DB,svc:{chat:{path:()=>path},prism:{refresh(){}}},chat:()=>chat,card:()=>card,persona:()=>({name:'U'}),contextTokens:()=>32000,provider:()=>({id:'mock'})};
   let release,seen=0;const gate=new Promise(r=>release=r);
   P.llm.chat=async(_,messages)=>{const data=JSON.parse(messages[1].content);if(!data.sources)return {text:JSON.stringify({change:'unchanged',perspective:''})};
     if(data.sources[0].text!==a.swipes[0].text)throw Error('source truncated');if(++seen===2)release();await gate;
     return {text:JSON.stringify({memories:[{messageId:a.id,quote:tail,event:'Она подарила серебряный компас.',kind:'observed'}]})};};
   const one=P.memoryService.create(ctx),two=P.memoryService.create(ctx),statuses=await Promise.all([one.observe(a),two.observe(a)]);
   if(!statuses.some(x=>x.status==='source-commit-error'))throw Error('concurrent upgrade not rejected');
   const memories=await DB.byIndex('memories','chatId',chat.id),receipts=await DB.byIndex('memorySources','chatId',chat.id);
   if(memories.length!==1||memories[0].quote!==tail||receipts.length!==1||receipts[0].coverage!=='full')throw Error('incorrect atomic upgrade');
   await one.load(chat.id);if((await one.observe(a)).status!=='no-unprocessed-source')throw Error('replayed full source');
   const backup=P.backup.check({cards:[card],chats:[chat],messages:[a],memories,memorySources:receipts},{replace:true});
   if(backup.data.memorySources[0].coverage!=='full')throw Error('backup dropped coverage');
   return {statuses:statuses.map(x=>x.status),tail:memories[0].quote,receiptId:receipts[0].id,coverage:receipts[0].coverage};
  }''')
  page.reload();page.wait_for_function('window.PRP && PRP.app');saved=page.evaluate("async()=>({receipts:await PRP.store.byIndex('memorySources','chatId','coverage'),memories:await PRP.store.byIndex('memories','chatId','coverage')})")
  assert len(saved['memories'])==1 and saved['receipts'][0]['coverage']=='full';assert not errors,errors
  result.update({'nativeReload':'PASS','backup':'PASS','runtimeErrors':errors});(out/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));browser.close()
finally:server.terminate();server.wait()
