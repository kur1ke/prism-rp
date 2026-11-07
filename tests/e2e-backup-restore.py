"""F29: real IndexedDB replacement rollback and UI restore ownership/retry contracts."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
def overlay(chat, text):
    return {'schema':1,'chatId':chat,'timeline':'','variant':'','createdAt':1,'updatedAt':1,'entries':[
        {'id':'entry-'+text,'op':'assert','scope':'chat','fact':{'id':'fact-'+text,'text':text},'provenance':None,'createdAt':1}]}
def env(chat, location):
    return {'schema':1,'chatId':chat,'timeZone':'Asia/Tokyo','timeMode':'manual',
            'manualNow':'2026-11-07T12:00:00.000Z','createdAt':1,'updatedAt':1,'events':[
                {'id':'env-'+location,'scope':'chat','patch':{'location':location},'provenance':None,'effectiveAt':None,'createdAt':1}],
            'conversationEvents':[]}
def backup(prefix='old'):
    return {'app':'prism-rp','version':8,
        'cards':[{'id':prefix+'-card','name':'Мира '+prefix,'description':'Описание.','lore':[]}],
        'chats':[{'id':prefix+'-rp','cardId':prefix+'-card','mode':'rp','title':'Сцена','leafId':None},
                 {'id':prefix+'-ms','cardId':prefix+'-card','mode':'messenger','title':'Переписка','leafId':None}],
        'experience':[{'id':prefix+'-archive','owner':prefix+'-card','text':'ARCHIVE_SENTINEL'}],
        'images':[{'id':prefix+'-image','chatId':prefix+'-rp','dataUrl':'data:,'}],
        'assist':[{'id':prefix+'-assist','title':'Архив','ctx':{},'messages':[]}],
        'worldPacks':[{'id':prefix+'-pack','schema':1,'name':'Мир','facts':[{'id':'f','text':'WORLD_SENTINEL'}]}],
        'worldLenses':[{'id':prefix+'-lens','cardId':prefix+'-card','packId':prefix+'-pack','overrides':[],'additions':[],'disabledFactIds':[]}],
        'worldOverlays':[overlay(prefix+'-rp','OVERLAY_SENTINEL')],
        'messengerEnvironments':[env(prefix+'-ms','ENV_SENTINEL')],
        'settings':[{'key':'app','value':{'theme':'paper'}},{'key':'marker','value':'OLD_SETTING'}]}
def snapshot(page):
    data = page.evaluate('PRP.store.exportAll()'); data.pop('exportedAt', None); return data
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   for case in ['atomic','roundtrip-delete','owner-filter','additive','replace-empty']:
    context=browser_context(browser,viewport={'width':width,'height':900});page=context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    mode={'replace':True};page.on('dialog',lambda d:d.accept() if mode['replace'] else d.dismiss())
    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
    page.evaluate('''async data=>{await PRP.store.importAll(data,true);await PRP.app.ctx.nav.loadAll();PRP.app.ctx.ui.renderAll();}''',backup())
    def restore(data, replace=True, success=True):
        mode['replace']=replace
        # Clear prior toast so a repeated restore waits for its own completion.
        page.evaluate('document.querySelector("#toast").textContent=""')
        page.set_input_files('#file-backup',{'name':'restore.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
        expected='Бэкап загружен' if success else 'Бэкап не загружен'
        page.wait_for_function('(text)=>document.querySelector("#toast").innerText.includes(text)',arg=expected)
        assert page.input_value('#file-backup')==''
        return page.inner_text('#toast')
    if case=='atomic':
        atomic=page.evaluate('''async()=>{
         const DB=PRP.store,snap=async()=>{const d=await DB.exportAll();delete d.exportedAt;return JSON.stringify(d);};
         const before=await snap();const fresh={app:'prism-rp',version:8,
          cards:[{id:'new-card',name:'Новая'}],chats:[{id:'new-chat',cardId:'new-card',mode:'rp',leafId:null}],
          settings:[{key:'new-setting',value:2}]};
         let constraint=null,setup=null;
         try{await DB.importAll({...fresh,worldLenses:[{id:'a',cardId:'new-card',packId:'p'},{id:'b',cardId:'new-card',packId:'p'}]},true);}
         catch(e){constraint=e.name;}
         const sameConstraint=before===await snap();
         try{await DB.importAll({...fresh,settings:[{value:'missing-key'}]},true);}catch(e){setup=e.name;}
         const sameSetup=before===await snap();
         await DB.importAll(fresh,true);const final=await DB.exportAll();delete final.exportedAt;
         return {constraint,setup,sameConstraint,sameSetup,final};
        }''')
        assert atomic['constraint']=='ConstraintError' and atomic['setup']=='DataError',atomic
        assert atomic['sameConstraint'] and atomic['sameSetup'],atomic
        final=atomic['final']
        for name in page.evaluate('PRP.store.STORES'):
            assert [r.get('id',r.get('key')) for r in final[name]]==({'cards':['new-card'],'chats':['new-chat'],'settings':['new-setting']}.get(name,[])),name
        page.evaluate("PRP.app.ctx.ui.openSettings('data')")
        before=snapshot(page)
        page.evaluate('''()=>{window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,...args){
         if(v && v.id==='retry-card')throw new DOMException('FIXTURE_WRITE_FAILURE','UnknownError');return __put.call(this,v,...args);};}''')
        incoming={'app':'prism-rp','version':8,'cards':[{'id':'retry-card','name':'После повтора','description':'Описание.'}]}
        toast=restore(incoming,success=False)
        assert 'Данные не изменены' in toast and 'Бэкап загружен' not in toast
        assert page.locator('.modal').count()==1 and snapshot(page)==before
        page.evaluate('()=>{IDBObjectStore.prototype.put=window.__put;}')
        restore(incoming)
        assert [c['id'] for c in snapshot(page)['cards']]==['retry-card']
        assert not page.locator('.modal').count()
        # Retry uses the same filename and bytes, with the real cleared input.
    elif case=='roundtrip-delete':
        saved=snapshot(page)
        assert all(name in saved for name in page.evaluate('PRP.store.STORES'))
        page.evaluate('PRP.store.importAll({app:"prism-rp",version:8},true)')
        restore(saved)
        restored=snapshot(page)
        for name in page.evaluate('PRP.store.STORES'):assert restored[name]==saved[name],name
        removed=page.evaluate('''async()=>{const {ctx}=PRP.app;await ctx.nav.openChat('old-rp');
         await ctx.svc.chat.deleteChat(ctx.chat());return {overlay:await PRP.store.get('worldOverlays','old-rp'),
          chats:await PRP.store.all('chats'),packs:await PRP.store.all('worldPacks')};}''')
        assert removed['overlay'] is None and [c['id'] for c in removed['chats']]==['old-ms']
        assert [pack['id'] for pack in removed['packs']]==['old-pack']
    elif case=='owner-filter':
        incoming=backup('restored')
        incoming['worldOverlays'].append(overlay('ghost-chat','GHOST_WORLD'))
        incoming['messengerEnvironments'] += [env('restored-rp','RP_FORBIDDEN'),env('ghost-ms','GHOST_ENV')]
        toast=restore(incoming)
        data=snapshot(page)
        assert [r['chatId'] for r in data['worldOverlays']]==['restored-rp']
        assert [r['chatId'] for r in data['messengerEnvironments']]==['restored-ms']
        assert 'записей мира чата: 1' in toast and 'записей среды переписки: 2' in toast
    elif case=='additive':
        page.evaluate("PRP.store.del('worldOverlays','old-rp')")
        restore({'app':'prism-rp','version':8,'chats':[],
          'worldOverlays':[overlay('old-rp','ADDED_WORLD'),overlay('ghost-chat','GHOST_WORLD')]},replace=False)
        data=snapshot(page)
        assert [r['chatId'] for r in data['worldOverlays']]==['old-rp']
        assert data['worldOverlays'][0]['entries'][0]['fact']['text']=='ADDED_WORLD'
        before=snapshot(page)
        incoming={'app':'prism-rp','version':8,
          'chats':[{'id':'old-rp','cardId':'old-card','mode':'messenger','title':'FOREIGN','leafId':'foreign-message'}],
          'messages':[{'id':'foreign-message','chatId':'old-rp','parentId':None,'role':'user','swipeIdx':0,'swipes':[{'text':'FOREIGN'}]}],
          'messengerEnvironments':[env('old-rp','FOREIGN_ENV')]}
        toast=restore(incoming,replace=False)
        assert 'чатов с другим режимом: 1' in toast
        assert snapshot(page)==before
    elif case=='replace-empty':
        incoming={'app':'prism-rp','version':8,
          'cards':[{'id':'replacement','name':'Новая карточка','description':'Описание.'}],
          'chats':[{'id':'replacement-chat','cardId':'replacement','mode':'rp','leafId':None}],
          'messages':[{'id':'orphan','chatId':'absent','parentId':None,'role':'user','swipeIdx':0,'swipes':[{'text':'ORPHAN'}]}]}
        toast=restore(incoming);data=snapshot(page)
        assert 'без своего владельца' in toast
        assert [c['id'] for c in data['cards']]==['replacement']
        assert [c['id'] for c in data['chats']]==['replacement-chat']
        for name in page.evaluate('PRP.store.STORES'):
            if name not in ['cards','chats']:assert data[name]==[],name
        page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.cards.some(c=>c.id==="replacement")')
        assert page.evaluate('PRP.app.S.settings.theme===PRP.settings.merge().theme')
        page.click('.home-greeting-actions [data-act=characters]');page.wait_for_selector('.tile[data-id]')
        assert 'Новая карточка' in page.inner_text('.gallery') and 'Мира old' not in page.inner_text('.gallery')
    assert errors==[],errors
    page.screenshot(path=str(out/f'{case}-{width}.png'),full_page=True)
    results.append({'case':case,'width':width,'status':'PASS'});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
