"""F26 editor wording and preserved lore controls/save/export/reload."""
import json,pathlib,shutil,socket,subprocess,sys
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'))
  for width in [1440,390]:
   context=browser.new_context(viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e,bag=errors:bag.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   page.evaluate('''async()=>{
    const P=PRP,DB=P.store,ctx=P.app.ctx;
    const c=Object.assign(P.cardModel.blank(),{id:'lore-card',name:'Аля',description:'DESC_MARKER',lore:[{id:'entry',comment:'Кафе',content:'LORE_MARKER',keys:['Луна'],secondary_keys:['вечер'],selective:true,constant:true,enabled:true,position:'before_char',insertion_order:5}]});
    await DB.put('cards',c);await ctx.nav.loadAll();await P.controllers.cards(ctx).actions['edit-card']({dataset:{id:c.id}});
   }''')
   page.locator('[data-act="card-section"][data-section="lore"]').click()
   assert page.locator('[data-lore="0"][data-k="position"] option').all_text_contents()==['В начале лорбука','В конце лорбука']
   body=page.locator('.card-modal .modal-body').inner_text()
   assert 'Активировать без ключевых слов' in body and 'При нехватке контекста' in body and 'обходит обе проверки' in body
   assert 'всегда в контексте' not in body and 'Перед описанием персонажа' not in body
   assert page.locator('[data-lore="0"][data-k="constant"]').is_checked()
   page.locator('[data-lore="0"][data-k="position"]').select_option('after_char')
   page.locator('[data-lore="0"][data-k="constant"]').uncheck()
   page.locator('[data-act="card-save"]').click();page.wait_for_function('!document.querySelector(".card-modal")')
   first=page.evaluate("async()=>{const c=await PRP.store.get('cards','lore-card');return {position:c.lore[0].position,constant:c.lore[0].constant,matched:PRP.assembler.matchLore(c.lore,'').length};}")
   assert first=={'position':'after_char','constant':False,'matched':0}
   page.evaluate("async()=>{await PRP.controllers.cards(PRP.app.ctx).actions['edit-card']({dataset:{id:'lore-card'}});}")
   page.locator('[data-act="card-section"][data-section="lore"]').click()
   page.locator('[data-lore="0"][data-k="position"]').select_option('before_char')
   page.locator('[data-lore="0"][data-k="constant"]').check()
   page.screenshot(path=str(out/f'editor-{width}.png'))
   page.locator('[data-act="card-save"]').click();page.wait_for_function('!document.querySelector(".card-modal")')
   final=page.evaluate("async()=>{const c=await PRP.store.get('cards','lore-card'),e=PRP.ccard.toSpec(c,'v2').data.character_book.entries[0];return {position:e.position,constant:e.constant,selective:e.selective,keys:e.keys,secondary:e.secondary_keys,matched:PRP.assembler.matchLore(c.lore,'').length};}")
   assert final=={'position':'before_char','constant':True,'selective':True,'keys':['Луна'],'secondary':['вечер'],'matched':1}
   page.reload();page.wait_for_function('window.PRP && PRP.app');saved=page.evaluate("async()=>{const c=await PRP.store.get('cards','lore-card');return {position:c.lore[0].position,constant:c.lore[0].constant,secondary:c.lore[0].secondary_keys};}")
   assert saved=={'position':'before_char','constant':True,'secondary':['вечер']};assert not errors,errors
   results.append({'width':width,'editorLabels':'PASS','controlSaveExportReload':'PASS','activation':'PASS','runtimeErrors':errors});context.close()
  browser.close()
 (out/'browser.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:server.terminate();server.wait()
