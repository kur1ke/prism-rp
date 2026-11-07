"""F29: real import review and editor preserve explicit author-directive consent."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
fixture = {'type': 'urv-char', 'version': 2, 'data': {
    'profile': {'name': 'Мира', 'age': '28', 'appearance': 'Короткие волосы.',
                'personality': 'Сдержанна. Говорит коротко.', 'scenario': 'Встреча в библиотеке.',
                'systemNote': 'IMPORT_SYSTEM_SENTINEL'},
    'firstMessage': ['Здравствуйте.'], 'reminderMessage': 'IMPORT_POST_SENTINEL',
    'systemPrompt': 'COMPILED_SENTINEL Короткие волосы. Сдержанна. Говорит коротко. Встреча в библиотеке.', 'userOverride': {'name': 'SOURCE_ONLY'}}}
def upload(page, name, value):
    page.set_input_files('#file-card', {'name': name, 'mimeType': 'application/json',
                                      'buffer': value.encode() if isinstance(value, str) else json.dumps(value).encode()})
def stored(page):
    return page.evaluate("async() => (await PRP.store.exportAll()).cards")
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
results = []
try:
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for width in [1440, 390]:
            context = browser_context(browser, viewport={'width': width, 'height': 900})
            page = context.new_page(); errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_selector('.home-welcome')
            for name, value, message in [('unknown.json', {'foo': 1}, 'Формат не распознан'), ('broken.json', '{', 'корректным JSON')]:
                upload(page, name, value); page.wait_for_selector('.imp-item.bad')
                assert message in page.inner_text('.imp-modal')
                assert page.is_disabled('[data-act=import-confirm]')
                page.click('.modal-foot [data-act=import-cancel]')
                page.wait_for_selector('.imp-modal', state='detached')
            page.reload(); page.wait_for_selector('.home-welcome'); assert stored(page) == []
            upload(page, 'mira.json', fixture); page.wait_for_selector('.imp-modal')
            review = page.inner_text('.imp-modal')
            assert all(s in review for s in ['URV v2', 'Собранный промпт', 'userOverride'])
            assert page.locator('[data-imp-dir]').count() == 2
            assert not page.locator('[data-imp-dir]:checked').count()
            page.click('.modal-foot [data-act=import-cancel]')
            page.wait_for_selector('.imp-modal', state='detached'); assert stored(page) == []
            upload(page, 'mira.json', fixture); page.wait_for_selector('.imp-modal')
            page.click('[data-act=import-confirm]'); page.wait_for_selector('.imp-modal', state='detached')
            assert len(stored(page)) == 1
            imported = stored(page)[0]
            for field in ['appearance', 'personality', 'scenario']:
                assert imported[field] == fixture['data']['profile'][field]
            assert not imported.get('mesExample')
            page.click('.home-greeting-actions [data-act=characters]'); page.wait_for_selector('.tile[data-id]')
            for saved in [False, True]:
                page.locator('.tile', has_text='Мира').locator('.tile-edit').click()
                page.click('[data-act=card-section][data-section=prompts]')
                assert 'из файла' in page.inner_text('.modal-body')
                assert not page.is_checked('[data-cf-dir=system][type=checkbox]')
                assert not page.is_checked('[data-cf-dir=postHistory][type=checkbox]')
                page.click('[data-act=card-section][data-section=meta]')
                assert 'URV v2' in page.inner_text('.modal-body')
                page.click('[data-act=card-save]'); page.wait_for_selector('.modal', state='detached')
            def payload():
                return page.evaluate('''async()=>{
                    const card=(await PRP.store.exportAll()).cards[0];
                    return JSON.stringify(PRP.assembler.build({card,mode:'rp',contextTokens:32000,
                      history:[{role:'user',text:'Здравствуйте.'}]}).messages);
                }''')
            assert all(s not in payload() for s in ['IMPORT_SYSTEM_SENTINEL', 'IMPORT_POST_SENTINEL', 'COMPILED_SENTINEL', 'SOURCE_ONLY'])
            page.locator('.tile', has_text='Мира').locator('.tile-edit').click()
            page.click('[data-act=card-section][data-section=prompts]')
            page.check('[data-cf-dir=system][type=checkbox]')
            page.click('[data-act=card-save]'); page.wait_for_selector('.modal', state='detached')
            page.reload(); page.wait_for_function('window.PRP && PRP.app')
            text = payload()
            assert 'IMPORT_SYSTEM_SENTINEL' in text
            assert all(s not in text for s in ['IMPORT_POST_SENTINEL', 'COMPILED_SENTINEL', 'SOURCE_ONLY'])
            assert errors == [], errors
            page.screenshot(path=str(out / f'import-{width}.png'), full_page=True)
            results.append({'width': width, 'status': 'PASS'})
            context.close()
        browser.close()
finally:
    server.terminate(); server.wait()
(out / 'results.json').write_text(json.dumps(results, indent=2)); print(json.dumps(results))
