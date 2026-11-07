"""F29: seven editor sections, metadata/lore, literal prompt data and optional Core reset."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
literal='Описание.\n### Указания автора\nDATA_LITERAL_SENTINEL'
def bounds(page):
    assert page.evaluate('''()=>{const b=document.querySelector('.modal-body');return document.documentElement.scrollWidth<=innerWidth && b.scrollWidth<=b.clientWidth+1;}''')
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   context=browser_context(browser,viewport={'width':width,'height':900});page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
   page.evaluate('''async()=>{await PRP.store.put('worldPacks',{id:'pack',schema:1,name:'Тестовый мир',facts:[{id:'fact',text:'WORLD_EDITOR_SENTINEL'}]});
    await PRP.app.ctx.nav.loadAll();window.__calls=0;PRP.llm.chat=async()=>{__calls++;throw Error('editor must not call model');};}''')
   page.click('.home-greeting-actions [data-act=characters]');page.click('.home [data-act=new-card]')
   page.wait_for_selector('#cf-name')
   labels=page.inner_text('.modal-body')
   assert all(s in labels for s in ['description','personality','scenario'])
   page.fill('#cf-name','Мира');page.fill('#cf-desc',literal);page.fill('#cf-pers','Сдержанна.');page.fill('#cf-scen','SCEN_EMPTY_CARD')
   page.click('[data-act=card-save]');page.wait_for_selector('.modal',state='detached')
   page.locator('.tile',has_text='Мира').locator('.tile-edit').click()
   # World links require an already saved card; every section is now reachable.
   marks={'greet':'#cf-first','prompts':'#cf-ex','lore':'[data-act=lore-add]',
          'images':'[data-ci=look]','world':'[data-lens-pack]','meta':'#cf-creator','main':'#cf-name'}
   for section,selector in marks.items():
    page.click(f'[data-act=card-section][data-section={section}]');page.wait_for_selector(selector)
    assert page.locator(f'.modal-nav .rail-item.active[data-section={section}]').count()==1
    assert page.evaluate('''()=>{const r=document.querySelector('.modal-nav .rail-item.active').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;}''')
    bounds(page)
   if width==390:assert page.evaluate("document.querySelector('.modal-nav').scrollWidth>document.querySelector('.modal-nav').clientWidth")
   assert page.input_value('#cf-desc')==literal
   page.locator('summary').filter(has_text='Ядро для Prism').click()
   page.click('[data-act=core-derive]')
   if not page.locator('#core-identity').is_visible():page.locator('summary').filter(has_text='Ядро для Prism').click()
   page.wait_for_selector('#core-identity')
   page.fill('#core-identity','EXPLICIT_CORE_SENTINEL');page.check('[data-cf-send=prismCore]');bounds(page)
   page.click('[data-act=card-section][data-section=lore]');page.click('[data-act=lore-add]')
   page.fill('[data-lore="0"][data-k=comment]','Библиотека');page.fill('[data-lore="0"][data-k=keys]','книги')
   page.check('[data-lore="0"][data-k=selective]');page.fill('[data-lore="0"][data-k=secondary_keys]','вечер')
   page.fill('[data-lore="0"][data-k=content]','LORE_EDITOR_SENTINEL')
   page.click('[data-act=card-section][data-section=world]');page.select_option('[data-lens-pack]',label='Тестовый мир')
   page.wait_for_selector('[data-lens-disable]');assert 'WORLD_EDITOR_SENTINEL' in page.inner_text('.eff-world')
   page.click('[data-act=card-section][data-section=meta]');page.fill('#cf-creator','mobile-tester');page.fill('#cf-version','1.2')
   page.click('[data-act=card-save]');page.wait_for_selector('.modal',state='detached')
   card=page.evaluate('PRP.app.S.cards.find(c=>c.name==="Мира")')
   assert card['scenario']=='SCEN_EMPTY_CARD' and not card['firstMes']
   assert card['creator']=='mobile-tester' and card['version']=='1.2'
   assert card['lore'][0]['secondary_keys']==['вечер'] and card['lore'][0]['comment']=='Библиотека'
   assert page.evaluate('PRP.app.S.worldLenses.length')==1
   page.locator('.tile',has_text='Мира').locator('.tile-edit').click()
   page.locator('summary').filter(has_text='Ядро для Prism').click();bounds(page)
   assert page.input_value('#core-identity')=='EXPLICIT_CORE_SENTINEL'
   page.click('[data-act=core-clear]');page.wait_for_selector('[data-act=core-clear]',state='detached')
   page.click('[data-act=card-save]');page.wait_for_selector('.modal',state='detached')
   checked=page.evaluate('''()=>{const card=PRP.app.S.cards[0],built=PRP.assembler.build({card,contextTokens:32000});
    return {core:card.prismCore,description:card.description,text:built.messages.map(m=>m.content).join('\\n')};}''')
   assert checked['core'] is None and checked['description']==literal
   assert json.dumps(literal,ensure_ascii=False,separators=(',',':')) in checked['text']
   assert '### Указания автора' not in checked['text'].splitlines()
   assert 'EXPLICIT_CORE_SENTINEL' not in checked['text']
   page.locator('.tile',has_text='Мира').locator('.tile-body').click();page.wait_for_selector('.opening-start')
   assert page.locator('.turn').count()==0
   page.click('.chat-head .head-card');page.wait_for_selector('#cf-name')
   assert page.input_value('#cf-name')=='Мира'
   bounds(page);assert page.evaluate('__calls')==0 and errors==[],errors
   page.screenshot(path=str(out/f'editor-{width}.png'),full_page=True)
   results.append({'width':width,'status':'PASS','sections':7,'literalData':True,'coreReset':True});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
