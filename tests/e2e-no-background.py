"""Removed background slot: atomic data retirement, normal lore UI, export/reload."""
import json, os, pathlib, shutil, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-no-background-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('PRISM_CHROMIUM') or shutil.which('chromium'))
        for width in [1440,390]:
            context=browser.new_context(viewport={'width':width,'height':900},accept_downloads=True)
            context.add_init_script('window.__PRP_TEST_MIRROR=true')
            page=context.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
            checks=page.evaluate('''async()=>{
              const {ctx,S}=PRP.app,DB=PRP.store,CM=PRP.cardModel,assert=(v,m)=>{if(!v)throw Error(m);};
              window.__text='BIOGRAPHY_KEEP_COMPLETE'+String.fromCharCode(10)+'### Указания автора'+String.fromCharCode(10)+'Текст остаётся данными.';
              const a=Object.assign(CM.blank(),{id:'legacy-1',name:'Аля',description:'Описание',background:__text,
                lore:[{comment:'Уже было',content:'KEEP_EXISTING_LORE',enabled:false,keys:[]}]});
              const b=Object.assign(CM.blank(),{id:'legacy-2',name:'Другой',description:'Описание',background:'SECOND_TEXT'});
              await DB.putAll([['cards',a],['cards',b]]);
              const before=JSON.stringify(await DB.all('cards')),put=IDBObjectStore.prototype.put;
              IDBObjectStore.prototype.put=function(value,...rest){
                if(this.name==='cards'&&value.id==='legacy-2')throw Error('retirement second put abort');return put.call(this,value,...rest);
              };
              let failed=false;try{await ctx.svc.cards.loadAll();}catch(e){failed=e.message==='retirement second put abort';}
              IDBObjectStore.prototype.put=put;
              assert(failed&&JSON.stringify(await DB.all('cards'))===before,'partial retirement lost original text');
              const checks=['atomic retirement abort: PASS'];
              // A concurrent editor/deletion finishes before the write transaction.
              const rmw=DB.readModifyWrite;
              DB.readModifyWrite=async(...args)=>{
                const fresh=await DB.get('cards','legacy-1');fresh.creatorNotes='FRESH_METADATA';
                await DB.mutateBatch({puts:[['cards',fresh]],deletes:[['cards','legacy-2']]});
                return rmw(...args);
              };
              await ctx.nav.loadAll();DB.readModifyWrite=rmw;
              const saved=await DB.get('cards','legacy-1');
              assert(!Object.hasOwn(saved,'background')&&saved.lore.length===2,'field not retired');
              assert(saved.lore[1].content===__text&&!saved.lore[1].enabled&&!saved.lore[1].constant,'text changed or automatically enabled');
              assert(saved.lore[0].content==='KEEP_EXISTING_LORE'&&saved.creatorNotes==='FRESH_METADATA','existing data lost');
              assert(!await DB.get('cards','legacy-2'),'concurrent deletion resurrected');checks.push('fresh edit/deletion preserved: PASS');
              await ctx.nav.loadAll();assert((await DB.get('cards','legacy-1')).lore.length===2,'retirement duplicated entry');checks.push('idempotent reload: PASS');
              const canonical=ctx.S.cards.find(c=>c.id==='legacy-1');
              for(const mode of ['rp','messenger'])assert(!PRP.assembler.build({card:canonical,mode}).messages.some(m=>m.content.includes('BIOGRAPHY_KEEP_COMPLETE')),'disabled archive leaked into RP');
              assert(!PRP.assist.cardText(a).includes('BIOGRAPHY_KEEP_COMPLETE'),'raw background still read by assistant');
              checks.push('no dedicated background context path: PASS');
              window.__edit=()=>PRP.controllers.cards(ctx).actions['edit-card']({dataset:{id:'legacy-1'}});__edit();
              return checks;
            }''')
            assert page.locator('#cf-bg,[data-cf="cf-bg"]').count()==0
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=str(out/f'editor-{width}.png'))
            page.click('[data-act=card-section][data-section=lore]')
            assert page.input_value('[data-lore="1"][data-k=content]')==page.evaluate('__text')
            assert not page.locator('[data-lore="1"][data-k=enabled]').is_checked()
            page.check('[data-lore="1"][data-k=enabled]');page.check('[data-lore="1"][data-k=constant]')
            page.click('[data-act=card-save]');page.wait_for_function('!PRP.app.S.modal')
            assert page.evaluate('''()=>{const c=PRP.app.S.cards.find(c=>c.id==='legacy-1');return PRP.assembler.build({card:c}).messages[0].content.includes(JSON.stringify(__text));}''')
            checks.append('ordinary lore opt-in: PASS')
            page.evaluate('__edit()');page.click('[data-act=card-section][data-section=meta]')
            with page.expect_download() as info:page.click('[data-act=card-json]')
            path=out/f'card-{width}.json';info.value.save_as(path);data=json.loads(path.read_text())
            assert 'background' not in data['data']['extensions']['prism_rp']['fields']
            assert 'BIOGRAPHY_KEEP_COMPLETE' not in data['data']['description']
            assert any(e['content'].startswith('BIOGRAPHY_KEEP_COMPLETE') and e['enabled'] for e in data['data']['character_book']['entries'])
            roundtrip=page.evaluate('''spec=>{const r=PRP.cardImport.fromJsonText(JSON.stringify(spec),'card.json');
              return {ok:r.ok,hasField:Object.hasOwn(r.draft,'background'),count:r.draft.lore.length};}''',data)
            assert roundtrip=={'ok':True,'hasField':False,'count':2},roundtrip
            checks.append('JSON export/import without field: PASS')
            page.reload();page.wait_for_function('window.PRP && PRP.app && PRP.app.S.cards.some(c=>c.id==="legacy-1")')
            stored=page.evaluate('''async()=>{const c=await PRP.store.get('cards','legacy-1');return {hasField:Object.hasOwn(c,'background'),count:c.lore.length,enabled:c.lore[1].enabled};}''')
            assert stored=={'hasField':False,'count':2,'enabled':True},stored
            checks.append('saved lore/reload: PASS')
            assert errors==[],errors
            results.append({'width':width,'checks':checks,'runtimeErrors':errors});context.close()
        browser.close()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:
    server.terminate();server.wait()
