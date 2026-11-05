"""Current welcome → catalog → PNG review → card editor → persisted catalog."""
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
card = out / 'character.png'
subprocess.run(['node', str(root / 'tests/make_card.js'), str(card)], check=True)
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
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_selector('.home-welcome')
            page.click('.home-greeting-actions [data-act=characters]')
            page.wait_for_selector('.welcome .step')
            page.set_input_files('#file-card', str(card))
            page.wait_for_selector('.imp-modal')
            assert 'Химэ' in page.inner_text('.imp-modal')
            assert page.locator('.tile[data-id]').count() == 0
            page.click('[data-act=import-confirm]')
            page.wait_for_selector('.imp-modal', state='detached')
            page.click('.home-greeting-actions [data-act=characters]')
            page.wait_for_selector('.tile[data-id]')
            assert 'Химэ' in page.inner_text('.gallery')
            page.click('.home-tools [data-act=new-card]')
            page.wait_for_function("document.activeElement && document.activeElement.id === 'cf-name'")
            page.fill('#cf-name', 'Юки')
            page.fill('#cf-desc', 'Тихая библиотекарша.')
            page.click('[data-act=card-section][data-section=greet]')
            page.click('[data-act=alt-add]')
            page.fill('[data-alt="0"]', 'Второе приветствие.')
            page.click('[data-act=card-section][data-section=main]')
            assert page.input_value('#cf-name') == 'Юки'
            page.click('[data-act=card-save]')
            page.wait_for_selector('.modal', state='detached')
            page.locator('.tile[data-id]', has_text='Юки').locator('.tile-edit').click()
            assert page.input_value('#cf-desc') == 'Тихая библиотекарша.'
            page.click('[data-act=card-section][data-section=greet]')
            assert page.input_value('[data-alt="0"]') == 'Второе приветствие.'
            page.click('[data-act=modal-close]')
            page.reload()
            page.wait_for_function('window.PRP && PRP.app && PRP.app.S.cards.length === 2')
            page.evaluate('PRP.app.ctx.nav.goCharacters()')
            page.wait_for_selector('.gallery')
            assert page.locator('.tile[data-id]').count() == 2
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert not errors, errors
            page.screenshot(path=str(out / f'catalog-{width}.png'))
            results.append({'width': width, 'passed': True})
            context.close()
        browser.close()
finally:
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
