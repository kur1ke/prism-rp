"""Real IDB: reflection evidence coverage survives unchanged/reload, abort and branches. LLM mocked."""
from browser_support import launch_chromium, browser_context
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
   for width in [1440,390]:
    context=browser_context(browser,viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app')
    page.evaluate('''async mode=>{
     const P=PRP,DB=P.store,card=Object.assign(P.cardModel.blank(),{id:'owner',name:'N'}),chat={id:'coverage',cardId:'owner',mode};
     await DB.putAll([['cards',card],['chats',chat]]);
     window.__boot=async()=>{
      const path=(await DB.byIndex('messages','chatId',chat.id)).sort((a,b)=>a.createdAt-b.createdAt),S={chatId:chat.id,memories:[],reflections:[]};
      const ctx={S,DB,svc:{chat:{path:()=>path},prism:{refresh(){}}},chat:()=>chat,card:()=>card,persona:()=>({name:'U'}),contextTokens:()=>32000,provider:()=>({id:'mock'})};
      const svc=P.memoryService.create(ctx);await svc.load(chat.id);window.__h={path,S,svc,chat};
     };
     window.__calls=[];window.__outcome='changed';
     P.llm.chat=async(_provider,messages)=>{const data=JSON.parse(messages[1].content);
      if(data.sources){const s=data.sources.at(-1);return {text:JSON.stringify({memories:[{messageId:s.messageId,quote:s.text,event:'Эпизод: '+s.text,kind:'reported'}]})};}
      __calls.push(data);return {text:JSON.stringify(__outcome==='unchanged'?{change:'unchanged',perspective:''}:{change:'changed',perspective:'Субъективное восприятие после эпизода номер '+__calls.length+'.'})};
     };
     window.__add=async id=>{const h=__h,m={id,chatId:chat.id,parentId:h.path.at(-1)?.id||null,role:'assistant',swipeIdx:0,createdAt:h.path.length,swipes:[{text:'Новая деталь беседы номер '+id+'.'}]};await DB.put('messages',m);h.path.push(m);return h.svc.observe(m);};
     await __boot();
    }''',mode)
    assert page.evaluate('async()=>{await __add("a");__outcome="unchanged";return (await __add("b")).status;}')=='remembered-unchanged'
    assert page.evaluate('__calls[1].memories.map(m=>m.source)')==['b']
    assert page.evaluate('__calls[1].previouslyReflectedMemories.map(m=>m.source)')==['a']
    page.evaluate('async()=>{await __boot();__outcome="changed";}')
    # Native put abort must retain pending evidence and old Experience.
    assert page.evaluate('''async()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='reflections')throw Error('fixture abort');return put.apply(this,args);};let status;try{status=(await __add('c')).status;}finally{IDBObjectStore.prototype.put=put;}return status;}''')=='error'
    assert page.evaluate('async()=>{await __boot();return (await __add("d")).status;}')=='reflected'
    assert page.evaluate('__calls.at(-1).memories.map(m=>m.source)')==['d','c']
    assert page.evaluate('__calls.at(-1).previouslyReflectedMemories.map(m=>m.source)')==['b','a']
    expected=page.evaluate('__h.svc.experience().perspective')
    page.reload();page.wait_for_function('window.PRP && PRP.app')
    result=page.evaluate('''async()=>{
     const P=PRP,DB=P.store,mem=await DB.byIndex('memories','chatId','coverage'),refs=await DB.byIndex('reflections','chatId','coverage'),path=(await DB.byIndex('messages','chatId','coverage')).sort((a,b)=>a.createdAt-b.createdAt),snap=P.memoryCycle.pathSnapshot(path);
     const full=P.memoryCycle.reflectionEvidence(mem,refs,snap,'coverage','owner');
     const short=P.memoryCycle.reflectionEvidence(mem,refs,snap.slice(0,3),'coverage','owner');
     const backup=P.backup.check({cards:[await DB.get('cards','owner')],chats:[await DB.get('chats','coverage')],messages:path,memories:mem,reflections:refs},{replace:true});
     return {fresh:full.fresh.length,context:full.context.length,pendingBeforeLaterAssessment:short.fresh.map(m=>m.source.messageId),experience:P.memoryCycle.currentReflection(refs,snap).perspective,assessments:refs.filter(r=>r.kind==='assessment').length,backup:backup.data.reflections.length===refs.length};
    }''')
    assert result=={'fresh':0,'context':4,'pendingBeforeLaterAssessment':['c'],'experience':expected,'assessments':1,'backup':True},result
    assert not errors,errors
    results.append({'mode':mode,'width':width,'unchangedReload':'PASS','nativeAbortRecovery':'PASS','branchCoverage':'PASS','backup':'PASS'});context.close()
  browser.close()
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
finally:server.terminate();server.wait()
