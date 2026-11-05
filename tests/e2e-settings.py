"""Settings UI: provider discovery, sampler preset, theme and persisted reload."""
from browser_support import launch_chromium, browser_context
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
results = []
try:
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for width in [1440, 390]:
            context = browser_context(browser, viewport={'width': width, 'height': 900})
            context.route('https://fixture.invalid/v1/models', lambda route: route.fulfill(
                json={'data': [{'id': 'mock-rp-7b'}, {'id': 'mock-rp-13b'}]}))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_selector('.home-welcome')
            # Open the actual settings action through the responsive rail.
            if width <= 900:
                page.click('.home [data-act=rail]')
            page.click('.rail [data-act=settings]')
            page.click('[data-act=prov-add][data-preset=custom]')
            page.fill('#prov-url', 'https://fixture.invalid/v1')
            page.click('[data-act=prov-models]')
            page.wait_for_function("document.querySelector('.modal').innerText.includes('Доступно моделей: 2')")
            assert page.input_value('#prov-model') == 'mock-rp-7b'
            page.click('[data-act=prov-save]')
            page.click('[data-act=settings][data-section=gen]')
            assert not page.locator('[data-set=noPostHistory]').is_checked()
            page.click('.preset[data-id=lively]')
            page.wait_for_function("document.querySelector('[data-sampler=temperature]').value === '1.1'")
            page.click('[data-act=settings][data-section=look]')
            page.click('[data-act=theme][data-id=paper]')
            page.wait_for_function("document.documentElement.dataset.theme === 'paper'")
            page.click('[data-act=modal-close]')
            # Wait for the async settings save before testing persistence.
            page.wait_for_function('''async()=>{
              const r=await PRP.store.getSetting('app',null);
              return r && r.theme==='paper' && r.sampler.temperature===1.1 &&
                r.providers.some(p=>p.baseUrl==='https://fixture.invalid/v1' && p.model==='mock-rp-7b');
            }''')
            page.reload()
            page.wait_for_function('window.PRP && PRP.app && PRP.app.S.settings')
            saved = page.evaluate('''()=>{const s=PRP.app.S.settings;
              return {theme:s.theme,temperature:s.sampler.temperature,noPostHistory:s.noPostHistory,
                provider:s.providers.find(p=>p.baseUrl==='https://fixture.invalid/v1')};}''')
            assert saved['theme'] == 'paper' and saved['temperature'] == 1.1
            assert saved['noPostHistory'] is False
            assert saved['provider']['model'] == 'mock-rp-7b'
            assert len(saved['provider']['models']) == 2
            assert not errors, errors
            page.screenshot(path=str(out / f'settings-{width}.png'))
            results.append({'width': width, 'passed': True})
            context.close()
        browser.close()
finally:
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
