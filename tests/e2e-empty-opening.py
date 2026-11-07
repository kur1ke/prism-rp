"""F29: empty scene UI, failed/retried opening and single-system preflight."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
results = []
def idle(page):
    page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.turn')
try:
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for width in [1440, 390]:
            for case in ['user-first', 'opening', 'single-system']:
                context = browser_context(browser, viewport={'width': width, 'height': 900})
                page = context.new_page(); errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                page.wait_for_selector('.home-welcome')
                page.evaluate('''async single=>{
                    const {ctx,S}=PRP.app, DB=PRP.store;
                    await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Мира',
                      description:'Взрослая библиотекарь.',scenario:'SCEN_OPENING_SENTINEL'}));
                    await ctx.nav.loadAll();const id=await ctx.svc.chat.createChat('rp','card');await ctx.nav.openChat(id);
                    S.settings.singleSystem=single;S.settings.images.enabled=false;
                    S.settings.autoContext=false;S.settings.contextTokens=32000;
                    S.settings.providers=[{id:'fixture',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
                    S.settings.activeProvider='fixture';
                    ctx.svc.memory.observe=async()=>({status:'disabled'});
                    PRP.llm.simple=async()=>JSON.stringify({events:[]});
                    window.__calls=[];window.__fail=false;
                    const original=window.fetch;
                    window.fetch=async(url,opts)=>{
                      if(String(url)==='https://fixture.invalid/v1/chat/completions'){
                        __calls.push(JSON.parse(opts.body));
                        if(__fail)return new Response('Fixture failure',{status:400});
                        const nl=String.fromCharCode(10);
                        return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Здравствуйте. Книга на столе.'}}]})+nl+nl+'data: [DONE]'+nl+nl,
                          {status:200,headers:{'Content-Type':'text/event-stream'}});
                      }return original(url,opts);
                    };
                }''', case == 'single-system')
                page.wait_for_selector('.opening-start')
                assert page.locator('.turn').count() == 0
                assert page.evaluate('__calls.length') == 0
                if case == 'opening':
                    page.evaluate('window.__fail=true'); page.click('[data-act=opening]')
                    page.wait_for_function('__calls.length===1'); idle(page)
                    assert page.locator('.turn').count() == 0
                    assert page.locator('.opening-start [data-act=opening]').count() == 1
                    assert page.evaluate('PRP.app.S.messages.length===0 && PRP.app.ctx.chat().leafId==null')
                    page.evaluate('window.__fail=false'); page.click('[data-act=opening]')
                    page.wait_for_selector('.turn.assistant'); idle(page)
                    calls = page.evaluate('__calls'); assert len(calls) == 2
                    messages = calls[-1]['messages']
                    assert 'SCEN_OPENING_SENTINEL' in json.dumps(messages)
                    assert 'Начни сцену' in json.dumps(messages, ensure_ascii=False)
                    assert not any(m['role'] == 'user' for m in messages)
                    assert page.locator('.turn').count() == 1
                    page.reload(); page.wait_for_selector('.turn.assistant')
                    assert page.locator('.turn').count() == 1
                    assert page.locator('.opening-start').count() == 0
                else:
                    if case == 'single-system':
                        page.click('[data-act=opening]'); idle(page)
                        assert page.evaluate('__calls.length') == 0
                        assert page.locator('.turn').count() == 0
                        assert 'первый ход пользователя' in page.inner_text('#toast')
                    page.fill('#input', 'Вы здесь?'); page.click('[data-act=send]')
                    page.wait_for_selector('.turn.assistant'); idle(page)
                    calls = page.evaluate('__calls'); assert len(calls) == 1
                    messages = calls[0]['messages']
                    assert 'SCEN_OPENING_SENTINEL' in json.dumps(messages)
                    assert [m['content'] for m in messages if m['role']=='user'] == ['Вы здесь?']
                    assert page.locator('.turn').count() == 2
                    if case == 'single-system': assert [m['role'] for m in messages] == ['system','user']
                assert errors == [], errors
                page.screenshot(path=str(out / f'{case}-{width}.png'), full_page=True)
                results.append({'width':width,'case':case,'status':'PASS'}); context.close()
        browser.close()
finally:
    server.terminate(); server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2)); print(json.dumps(results))
