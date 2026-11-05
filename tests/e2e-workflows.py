"""Real HTTP roleplay streaming, swipes, continuation, assistant and PNG export."""
from browser_support import launch_chromium, browser_context
import base64
import struct
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
              S.settings.providers=[{id:'fixture',name:'Mock',kind:'openai',baseUrl:url,model:'mock-rp-7b',models:['mock-rp-7b','mock-rp-13b']}];
              S.settings.activeProvider='fixture';S.settings.images.enabled=false;await ctx.saveSettings();
              const d=ctx.svc.cards.draft(null);d.name='Химэ';d.description='Студентка.';d.firstMes='Привет, {{user}}!';
              d.image={loras:[{name:'Orihime_IL',weight:0.7}]};
              const r=await ctx.svc.cards.save(d);await ctx.nav.newChat('rp',r.card.id);
            }""", f'http://127.0.0.1:{mock_port}/v1')
            page.wait_for_selector('.turn.assistant')
            assert 'Привет, Пользователь!' in page.inner_text('#feed')
            assert page.locator('.composer .meter').count() == 1
            assert page.locator('[data-act=initiative]').count() == 0
            page.fill('#input', 'Привет, как ты?')
            page.keyboard.press('Enter')
            page.wait_for_function("document.querySelectorAll('.turn.assistant').length === 2 && !PRP.app.S.gen && !PRP.app.S.turn && !PRP.app.S.tracking")
            assert 'Садись' in page.inner_text('.turn.last .prose')
            page.click('.turn.last [data-act=continue]')
            page.wait_for_function("!PRP.app.S.gen && !PRP.app.S.turn && !PRP.app.S.tracking && document.querySelector('.turn.last .prose').innerText.split('Садись').length === 3")
            page.click('.turn.last [data-act=regen]')
            page.wait_for_function("!PRP.app.S.gen && !PRP.app.S.turn && !PRP.app.S.tracking && document.querySelector('.turn.last .swipes').innerText.includes('2/2')")
            page.click('.turn.last [data-act=swipe][data-dir="-1"]')
            page.wait_for_function("document.querySelector('.turn.last .swipes').innerText.includes('1/2')")
            page.keyboard.press('Control+f')
            page.fill('#find-q','садись')
            page.wait_for_function("document.querySelector('#find-count').innerText.includes('из')")
            page.keyboard.press('Escape')
            page.click('[data-act=model-pop]')
            assert page.locator('.pop [data-act=pick-model]').count()==2
            page.click('.pop [data-act=pick-model][data-model=mock-rp-13b]')
            page.wait_for_function("PRP.app.ctx.provider().model === 'mock-rp-13b'")
            if width < 700:
                page.click('[data-act=rail]')
            page.click('.rail [data-act=settings]')
            page.click('[data-act=settings][data-section=images]')
            page.check('[data-img-check=enabled]')
            page.uncheck('[data-img-check=translate]')
            page.click('[data-act=img-backend][data-id=a1111]')
            page.fill('[data-imgcfg=url]',f'http://127.0.0.1:{mock_port}')
            page.dispatch_event('[data-imgcfg=url]','change')
            page.click('[data-act=img-lists]')
            page.wait_for_function("document.querySelector('.modal').innerText.includes('Модели: 1, LoRA: 2')")
            assert page.input_value('[data-imgcfg=model]')=='illustriousXL_v01.safetensors'
            assert page.locator('[data-act=img-lora-add]').count()==0
            page.click('[data-act=modal-close]')
            if page.locator('.rail.open').count():
                page.click('#scrim',position={'x':width-5,'y':100})
            page.click('.turn.last [data-act=draw]')
            page.wait_for_selector('.turn.last .shot img')
            page.wait_for_function('!PRP.app.S.drawing.size')
            page.locator('.turn.last .shot').hover()
            page.click('.turn.last [data-act=img-info]')
            assert 'Seed' in page.inner_text('.pop')
            page.keyboard.press('Escape')
            page.click('.turn.last [data-act=img-pin]')
            page.wait_for_function("document.querySelector('#toast').innerText.includes('закреплён')")
            page.click('.turn.last .shot img')
            page.wait_for_selector('.lightbox img')
            close_bounds=page.locator('.lightbox [data-act=modal-close]').bounding_box()
            close_visible=bool(close_bounds and 0 <= close_bounds['x'] and close_bounds['x']+close_bounds['width'] <= width)
            print(json.dumps({'width':width,'lightboxCloseInViewport':close_visible}),flush=True)
            page.keyboard.press('Escape')
            page.wait_for_selector('.lightbox',state='detached')
            image_seed=page.evaluate("()=>{const p=PRP.app.ctx.svc.chat.path(),m=p[p.length-1];return m.swipes[m.swipeIdx||0].images[0].seed;}")
            page.click('.turn.last [data-act=img-regen]')
            page.wait_for_function("old=>{const p=PRP.app.ctx.svc.chat.path(),m=p[p.length-1];return !PRP.app.S.drawing.size && m.swipes[m.swipeIdx||0].images.some(i=>i.seed!==old);}",arg=image_seed)
            page.click('[data-act=chat-menu]')
            page.click('.pop [data-act=edit-card]')
            page.click('[data-act=card-section][data-section=meta]')
            with page.expect_download() as download:
                page.click('[data-act=card-png]')
            png=Path(download.value.path()).read_bytes()
            assert png.startswith(b'\x89PNG\r\n\x1a\n')
            offset=8
            exported=None
            while offset < len(png):
                length=struct.unpack('>I',png[offset:offset+4])[0]
                if png[offset+4:offset+8] == b'tEXt':
                    key,_,value=png[offset+8:offset+8+length].partition(b'\0')
                    if key == b'chara':exported=json.loads(base64.b64decode(value))['data']
                offset+=length+12
            assert exported['name']=='Химэ'
            assert exported['extensions']['prism_rp']['image']['loras'][0]['name']=='Orihime_IL'
            page.click('[data-act=modal-close]')
            page.click('[data-act=chat-menu]')
            page.click('.pop [data-act=assist-about-chat]')
            page.wait_for_selector('.assist-empty')
            assert 'Химэ + чат' in page.inner_text('.assist-head')
            page.click('.starter:has-text("Разбери поведение")')
            page.wait_for_selector('.aturn.assistant .tools')
            assert 'карточка: да, чат: да' in page.inner_text('.aturn.assistant .md')
            assert page.locator('.aturn.assistant .md li').count()==2
            assert page.locator('.aturn.assistant .md pre').count()==1
            page.click('[data-act=assist-new]')
            page.wait_for_selector('.assist-empty')
            page.click('[data-act=assist-ctx]')
            page.click('.pop [data-act=assist-pick-card][data-id=""]')
            assert 'Без персонажа' in page.inner_text('.assist-head')
            page.fill('#input','Как написать карточку?')
            page.keyboard.press('Enter')
            page.wait_for_function("document.querySelector('.aturn.assistant .md')?.innerText.includes('карточка: нет')")
            page.click('[data-act=assist-list]')
            assert page.locator('.pop [data-act=assist-open]').count()==2
            page.keyboard.press('Escape')
            page.click('[data-act=assist-regen]')
            page.wait_for_function('!PRP.app.S.gen')
            assert page.locator('.aturn.assistant').count()==1
            page.reload()
            page.wait_for_selector('.assist-head')
            assert page.locator('.aturn').count()==2
            assert not errors, errors
            page.screenshot(path=str(out / f'workflows-{width}.png'))
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
