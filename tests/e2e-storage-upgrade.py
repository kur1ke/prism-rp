"""F29: real IndexedDB v3/v4/v5 upgrades, blocked/timeout UI and versionchange."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]; out=Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True)
SEED='''({version,yielding})=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('prism-rp-testing',version);
 req.onupgradeneeded=()=>{
  const db=req.result;
  for(const [name,key,index] of [['cards','id'],['chats','id','cardId'],['messages','id','chatId'],
    ['experience','id','owner'],['settings','key'],['images','id','chatId'],['assist','id']]){
    const s=db.createObjectStore(name,{keyPath:key});if(index)s.createIndex(index,index);
  }
  if(version>=4){db.createObjectStore('worldPacks',{keyPath:'id'});
   const s=db.createObjectStore('worldLenses',{keyPath:'id'});s.createIndex('cardId','cardId',{unique:true});s.createIndex('packId','packId');}
  if(version>=5)db.createObjectStore('worldOverlays',{keyPath:'chatId'});
 };
 req.onsuccess=()=>{
  const db=req.result;window.__held=db;
  const tx=db.transaction([...db.objectStoreNames],'readwrite');
  tx.objectStore('cards').put({id:'keep',name:'Мира',description:'PRESERVE_CARD',lore:[]});
  tx.objectStore('chats').put({id:'chat',cardId:'keep',mode:'messenger',leafId:null});
  tx.objectStore('experience').put({id:'archive',owner:'keep',text:'PRESERVE_ARCHIVE'});
  tx.objectStore('settings').put({key:'fixture-marker',value:'PRESERVE_SETTING'});
  if(version>=4){tx.objectStore('worldPacks').put({id:'pack',name:'Пак',facts:[{id:'fact',text:'PRESERVE_WORLD'}]});
   tx.objectStore('worldLenses').put({id:'lens',cardId:'keep',packId:'pack',overrides:[],additions:[],disabledFactIds:[]});}
  if(version>=5)tx.objectStore('worldOverlays').put({chatId:'chat',schema:1,entries:[]});
  tx.oncomplete=()=>{if(yielding)db.onversionchange=()=>{window.__yielded=true;db.close();};resolve();};
  tx.onerror=()=>reject(tx.error);
 };req.onerror=()=>reject(req.error);
})'''
SNAPSHOT='''()=>new Promise((resolve,reject)=>{
 const r=indexedDB.open('prism-rp-testing');r.onerror=()=>reject(r.error);
 r.onsuccess=async()=>{const db=r.result,names=[...db.objectStoreNames],rows={};
  const tx=db.transaction(names);for(const name of names){const q=tx.objectStore(name).getAll();q.onsuccess=()=>rows[name]=q.result;}
  tx.oncomplete=()=>{resolve({version:db.version,names,rows});db.close();};tx.onerror=()=>reject(tx.error);
 };
})'''
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   for version in [3,4,5]:
    context=browser_context(browser,viewport={'width':width,'height':900})
    holder=context.new_page();holder.goto(f'http://127.0.0.1:{port}/dist/web/version.json')
    holder.evaluate(SEED,{'version':version,'yielding':version==5})
    before=holder.evaluate(SNAPSHOT)
    app=context.new_page();errors=[];app.on('pageerror',lambda e:errors.append(str(e)))
    app.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
    if version<5:
     app.wait_for_selector('.storage-error[data-code=DB_BLOCKED]')
     assert 'Закройте другие вкладки Prism RP' in app.inner_text('.storage-error')
     assert app.locator('.rail .brand').count()==1
     holder.evaluate('window.__held.close()')
     app.click('[data-act=reload-page]')
    else:holder.wait_for_function('!!window.__yielded')
    app.wait_for_function('window.PRP && PRP.app && PRP.app.S.cards.some(c=>c.id==="keep")')
    after=app.evaluate(SNAPSHOT);assert after['version']==8
    for name,rows in before['rows'].items():assert after['rows'][name]==rows,(version,name)
    assert set(after['names'])==set(app.evaluate('PRP.store.STORES'))
    assert all(not after['rows'][name] for name in set(after['names'])-set(before['names']))
    assert app.evaluate('''async()=>{
     await PRP.store.put('worldLenses',{id:'first',cardId:'unique-fixture',packId:'pack'});
     try{await PRP.store.put('worldLenses',{id:'second',cardId:'unique-fixture',packId:'pack'});return false;}
     catch(e){return (await PRP.store.all('worldLenses')).filter(x=>x.cardId==='unique-fixture').length===1;}
    }''')
    await_env=app.evaluate('''async()=>{await PRP.app.ctx.nav.openChat('chat');return {
     persisted:PRP.app.S.messengerEnv.persisted,events:PRP.app.S.messengerEnv.events,
     rows:await PRP.store.all('messengerEnvironments')};}''')
    assert await_env=={'persisted':False,'events':[],'rows':[]}
    app.screenshot(path=str(out/f'upgrade-{version}-{width}.png'))
    assert errors==[],errors
    results.append({'case':f'v{version}-to-v8','width':width,'status':'PASS'});context.close()
   context=browser_context(browser,viewport={'width':width,'height':900})
   holder=context.new_page();holder.goto(f'http://127.0.0.1:{port}/dist/web/version.json')
   holder.evaluate(SEED,{'version':3,'yielding':False});holder.evaluate('__held.close()');before=holder.evaluate(SNAPSHOT)
   app=context.new_page();app.add_init_script("window.__PRP_DB_OPEN_TIMEOUT_MS=200;const original=indexedDB.open.bind(indexedDB);indexedDB.open=(name,v)=>name==='prism-rp-testing'&&v?{}:original(name,v)")
   app.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');app.wait_for_selector('.storage-error[data-code=DB_OPEN_TIMEOUT]')
   assert app.inner_text('.storage-error').strip();assert holder.evaluate(SNAPSHOT)==before
   results.append({'case':'timeout-preserves-v3','width':width,'status':'PASS'});context.close()
   context=browser_context(browser,viewport={'width':width,'height':900})
   app=context.new_page();app.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');app.wait_for_selector('.home-welcome')
   app.evaluate("PRP.store.put('cards',{id:'keep',name:'Мира',description:'PRESERVE_CARD'})")
   other=context.new_page();other.goto(f'http://127.0.0.1:{port}/dist/web/version.json')
   upgraded=other.evaluate('''()=>new Promise((resolve,reject)=>{const r=indexedDB.open('prism-rp-testing',9);
    r.onblocked=()=>reject(Error('application did not yield'));r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{r.result.close();resolve(true);};})''')
   assert upgraded;app.wait_for_function('document.querySelector("#toast").innerText.includes("Обновите эту страницу")')
   assert other.evaluate(SNAPSHOT)['rows']['cards'][0]['description']=='PRESERVE_CARD'
   results.append({'case':'versionchange-yields','width':width,'status':'PASS'});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
