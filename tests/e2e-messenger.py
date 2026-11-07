"""Messenger setup/time, initiative refusal/error, atomic commit and provenance."""
from browser_support import launch_chromium, browser_context
import urllib.request
import json
from pathlib import Path
import socket
import subprocess
import sys
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind',
                           '127.0.0.1', '--directory', str(root)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    mock_port = probe.getsockname()[1]
mock = subprocess.Popen([sys.executable, str(root / 'tests/mock_server.py'), str(mock_port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
results = []
try:
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for width in [1440, 390]:
            context = browser_context(browser, viewport={'width': width, 'height': 900})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_selector('.home-welcome')
            page.evaluate("""async url=>{
              const {S,ctx}=PRP.app;
              window.__requests=[];const fetchOriginal=window.fetch;
              window.fetch=(url,opts)=>{if(String(url).endsWith('/chat/completions') && opts?.body)__requests.push(JSON.parse(opts.body));return fetchOriginal(url,opts);};
              S.settings.providers=[{id:'fixture',name:'Mock',kind:'openai',baseUrl:url,model:'mock-rp-7b'}];
              S.settings.activeProvider='fixture';S.settings.images.enabled=false;await ctx.saveSettings();
              const d=ctx.svc.cards.draft(null);d.name='Химэ';d.description='Студентка.';
              await ctx.svc.cards.save(d);await ctx.nav.goCharacters();
            }""", f'http://127.0.0.1:{mock_port}/v1')
            page.click('[data-act=new-card-chat][data-mode=messenger]')
            page.wait_for_selector('.ms-new')
            assert page.input_value('#ms-tz') == page.evaluate('PRP.messengerTime.systemTimeZone()')
            page.fill('#ms-tz','Asia/Tokyo')
            page.check('input[name=ms-mode][value=manual]')
            page.fill('#ms-manual','2026-11-05T09:00')
            page.click('[data-act=ms-create]')
            page.wait_for_selector('.composer #input')
            assert 'Переписка' in page.inner_text('.chat-head .mode-badge')
            assert page.locator('.mode-badge[data-act],select[data-act=chat-mode]').count()==0
            env=page.evaluate('PRP.app.S.messengerEnv')
            assert env['timeZone']=='Asia/Tokyo' and env['manualNow']=='2026-11-05T00:00:00.000Z'
            page.fill('#input','доброе утро')
            page.keyboard.press('Enter')
            page.wait_for_function("document.querySelectorAll('.msg-row.them').length === 1 && !PRP.app.S.gen && !PRP.app.S.turn && !PRP.app.S.tracking")
            assert all(t.strip()=='09:00' for t in page.locator('.msg-row .stamp').all_inner_texts())
            assert page.locator('.msg-row .stamp').count()==2
            request=next(r for r in page.evaluate('__requests') if any(m['role']=='user' and m['content']=='доброе утро' for m in r['messages']))
            system='\n'.join(m['content'] for m in request['messages'] if m['role']=='system')
            assert 'сейчас: 05.11.2026, 09:00 (Asia/Tokyo; время задано вручную)' in system,system
            frame=page.evaluate('PRP.util.macros(PRP.prismModes.TEMPLATES.messenger.frame,{char:"Химэ",user:"Пользователь"})')
            assert frame in system
            page.click('[data-act=drawer]');page.click('[data-act=tab][data-tab=env]')
            assert 'Среда' in page.inner_text('[data-act=tab][data-tab=env]')
            assert not page.locator('[data-act=tab][data-tab=scene]').count()
            page.click('[data-act=env-edit]');page.wait_for_selector('#env-location')
            page.wait_for_function('''()=>{const r=document.querySelector('.drawer.open').getBoundingClientRect(),b=document.querySelector('#drawer-body');
              return r.left>=-1 && r.right<=innerWidth+1 && b.scrollWidth<=b.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth;}''')
            page.click('[data-act=env-cancel]');page.click('[data-act=drawer-close]')
            page.wait_for_function("document.querySelector('.drawer').getBoundingClientRect().left>=innerWidth")
            assert page.evaluate('''()=>{const r=document.querySelector('[data-act=initiative]').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.width>40;}''')

            # Time editing is explicit; physical state remains read-only.
            page.click('[data-act=chat-menu]')
            page.click('.pop [data-act=time-open]')
            page.wait_for_selector('[data-act=env-advance][data-min="15"]')
            page.click('[data-act=env-advance][data-min="15"]')
            page.wait_for_function("PRP.app.S.messengerEnv.manualNow === '2026-11-05T00:15:00.000Z'")
            page.click('[data-act=modal-close]')
            assert all(t.strip()=='09:00' for t in page.locator('.msg-row .stamp').all_inner_texts())
            snapshot="""async()=>{const {S,ctx}=PRP.app,id=S.chatId;
              return JSON.stringify({msgs:await PRP.store.byIndex('messages','chatId',id),
                chat:await PRP.store.get('chats',id),env:await PRP.store.get('messengerEnvironments',id)});}"""
            assert page.evaluate('PRP.app.ctx.svc.messenger.addMarker({kind:"promise",text:"Созвониться вечером",scope:"chat"})').get('marker')
            env_before=page.evaluate('JSON.stringify(PRP.app.S.messengerEnv)')
            before=page.evaluate(snapshot)
            def mode(value):
                urllib.request.urlopen(f'http://127.0.0.1:{mock_port}/initiative?mode='+value).close()
            def toast(text):
                page.wait_for_function('(t)=>document.querySelector("#toast").innerText.includes(t)',arg=text)
            mode('decline')
            page.click('[data-act=initiative]')
            toast('Персонаж решил пока не писать')
            assert page.evaluate(snapshot)==before
            assert '[no-message]' not in page.inner_text('#feed')
            mode('error')
            page.click('[data-act=initiative]')
            toast('Проверка инициативы не удалась')
            assert page.evaluate(snapshot)==before
            page.evaluate('PRP.app.S.settings.singleSystem=true')
            page.click('[data-act=initiative]')
            toast('Одно системное сообщение')
            assert page.evaluate(snapshot)==before
            page.evaluate('PRP.app.S.settings.singleSystem=false')
            mode('message')
            page.evaluate("""()=>{window.__put=IDBObjectStore.prototype.put;
              IDBObjectStore.prototype.put=function(v,k){if(this.name==='chats')throw new DOMException('Fixture write failure','UnknownError');return __put.call(this,v,k);};}""")
            page.click('[data-act=initiative]')
            toast('Не удалось сохранить сообщение')
            page.evaluate('()=>{IDBObjectStore.prototype.put=window.__put;}')
            assert page.evaluate(snapshot)==before
            page.click('[data-act=initiative]')
            page.wait_for_function("document.querySelector('#feed').innerText.includes('INI-OK') && !PRP.app.S.gen && !PRP.app.S.tracking")
            last=page.evaluate("""()=>{const p=PRP.app.ctx.svc.chat.path(),m=p[p.length-1];return m.swipes[m.swipeIdx||0];}""")
            assert last['messengerAt']['at']=='2026-11-05T00:15:00.000Z'
            assert last['initiative']['trigger']=='user-check'
            assert page.locator('.msg-row.last .ini-tag').count()==1
            req=next(r for r in reversed(page.evaluate('__requests')) if any(m['role']=='system' and 'Проверка инициативы' in m['content'] for m in r['messages']))
            system='\n'.join(m['content'] for m in req['messages'] if m['role']=='system')
            assert '### Возможные поводы написать первым' in system and json.dumps('Созвониться вечером',ensure_ascii=False) in system
            assert 'Проверка инициативы' in req['messages'][-1]['content']
            assert [m['content'] for m in req['messages'] if m['role']=='user']==['доброе утро']
            assert page.evaluate('JSON.stringify(PRP.app.S.messengerEnv)')==env_before

            after=page.evaluate(snapshot)
            page.click('[data-act=initiative]')
            toast('дождитесь вашего ответа')
            assert page.evaluate(snapshot)==after
            page.reload()
            page.wait_for_selector('.msg-row.last .ini-tag')
            assert page.evaluate(snapshot)==after
            # Current contract blocks navigation during generation; stopping permits a safe retry.
            page.fill('#input','Спасибо.');page.keyboard.press('Enter')
            page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.turn && !PRP.app.S.tracking')
            current=page.evaluate('PRP.app.S.chatId')
            page.evaluate('''async()=>{const {S}=PRP.app;const other={id:'guard-other',cardId:S.cardId,mode:'messenger',leafId:null};
              await PRP.store.put('chats',other);S.chats.push(other);}''')
            stable=page.evaluate(snapshot);mode('message')
            page.evaluate('''()=>{const original=window.fetch;window.fetch=(url,opts)=>{
              if(String(url).endsWith('/chat/completions') && JSON.parse(opts.body).messages.some(m=>m.role==='system' && m.content.includes('Проверка инициативы'))){
                window.__heldSignal=opts.signal;return new Promise((resolve,reject)=>{opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});window.__release=()=>{const nl=String.fromCharCode(10);resolve(new Response('data: '+JSON.stringify({choices:[{delta:{content:'LATE_INITIATIVE'}}]})+nl+nl+'data: [DONE]'+nl+nl,{headers:{'Content-Type':'text/event-stream'}}));};});
              }return original(url,opts);};}''')
            page.click('[data-act=initiative]');page.wait_for_function('PRP.app.S.gen && PRP.app.S.gen.initiative')
            page.evaluate("PRP.app.ctx.nav.openChat('guard-other')")
            toast('перед переключением чата');assert page.evaluate('PRP.app.S.chatId')==current
            page.click('[data-act=stop]');page.wait_for_function('!PRP.app.S.gen')
            assert page.evaluate('__heldSignal.aborted')
            page.evaluate('__release()');page.wait_for_timeout(50)
            assert page.evaluate(snapshot)==stable
            assert page.evaluate("async()=>(await PRP.store.byIndex('messages','chatId','guard-other')).length")==0
            mode('message')
            assert not errors, errors
            page.screenshot(path=str(out / f'messenger-{width}.png'))
            results.append({'width': width, 'passed': True})
            context.close()
        browser.close()
finally:
    mock.terminate()
    mock.wait()
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
