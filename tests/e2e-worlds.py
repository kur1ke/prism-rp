"""World packs, per-character lenses, disabled facts, isolation and reload."""
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
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_selector('.home-welcome')
            page.evaluate("""async()=>{
              const {ctx}=PRP.app;
              for (const name of ['Аля','Юки']) {const d=ctx.svc.cards.draft(null);d.name=name;d.description='Описание';await ctx.svc.cards.save(d);}
              await ctx.nav.openAssist(null);
            }""")
            if width < 700:
                page.click('[data-act=rail]')
            page.click('.rail [data-act=world]')
            page.wait_for_selector('.world-layout')
            page.click('[data-act=world-new]')
            page.fill('#wp-name', 'Мир проверки')
            for i, text in enumerate(['WF-HOME: Тацуки живёт в Каракуре.', 'WF-REAPERS: Синигами видят духов.']):
                page.click('[data-act=world-fact-add]')
                page.fill(f'[data-wf="{i}"][data-k=text]', text)
            page.fill('[data-wf="0"][data-k=entities]', 'Тацуки')
            page.fill('[data-wf="0"][data-k=timeline]', 'canon')
            page.click('[data-act=world-save]')
            page.wait_for_function('PRP.app.S.worldPacks.length === 1')
            facts = page.evaluate('PRP.app.S.worldPacks[0].facts')
            assert len(facts) == 2 and facts[0]['entities'] == ['Тацуки'] and facts[0]['timeline'] == 'canon'
            async_edit = """async name=>{const {ctx,S}=PRP.app;await ctx.nav.goCharacters();
              await PRP.controllers.cards(ctx).actions['edit-card']({dataset:{id:S.cards.find(c=>c.name===name).id}});}"""
            page.evaluate(async_edit, 'Аля')
            page.click('[data-act=card-section][data-section=world]')
            page.select_option('[data-lens-pack]', label='Мир проверки')
            page.wait_for_selector('[data-lens-disable]')
            assert page.locator('.lens-fact').count() == 2
            page.locator('[data-act=lens-override-add]').first.click()
            page.fill('[data-lens-ovr="0"]', 'WF-OSAKA: Тацуки переехала в Осаку.')
            page.check('[data-lens-disable="'+facts[1]['id']+'"]')
            page.click('[data-act=lens-add]')
            page.fill('[data-lens-add="0"][data-k=text]', 'WF-NEIGHBOR: живёт напротив {{user}}.')
            page.click('[data-act=card-section][data-section=main]')
            page.click('[data-act=card-section][data-section=world]')
            effective = page.inner_text('.eff-world')
            assert all(x in effective for x in ['WF-OSAKA','WF-NEIGHBOR','не действует для персонажа'])
            assert page.locator('.eff-world li.off', has_text='WF-REAPERS').count() == 1
            page.click('[data-act=card-save]')
            page.wait_for_selector('.modal', state='detached')
            page.evaluate(async_edit, 'Юки')
            page.click('[data-act=card-section][data-section=world]')
            page.select_option('[data-lens-pack]', label='Мир проверки')
            effective = page.inner_text('.eff-world')
            assert 'WF-HOME' in effective and 'WF-REAPERS' in effective and 'WF-OSAKA' not in effective
            page.click('[data-act=card-save]')
            page.wait_for_selector('.modal', state='detached')
            page.reload()
            page.wait_for_function('window.PRP && PRP.app && PRP.app.S.worldLenses.length === 2')
            assert page.evaluate('PRP.app.S.worldPacks[0].facts') == facts
            page.evaluate(async_edit, 'Аля')
            page.click('[data-act=card-section][data-section=world]')
            assert 'WF-OSAKA' in page.inner_text('.eff-world') and 'WF-NEIGHBOR' in page.inner_text('.eff-world')
            assert not errors, errors
            page.screenshot(path=str(out / f'worlds-{width}.png'))
            results.append({'width': width, 'passed': True})
            context.close()
        browser.close()
finally:
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
