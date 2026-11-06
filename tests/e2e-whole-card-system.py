"""Explicit whole-card experiment: setting/reload, actual transports and return to data."""
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
            for mode in ['rp', 'messenger']:
                for kind in ['openai', 'perchance']:
                    context = browser_context(browser, viewport={'width': width, 'height': 900})
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
                    page.wait_for_selector('.home-welcome')
                    # Use the actual selection control; keep the previously published experiment testable.
                    page.evaluate('PRP.controllers.settings(PRP.app.ctx).actions.settings({dataset:{section:"gen"}})')
                    assert page.locator('#card-prompt-format').input_value() == 'data'
                    page.select_option('#card-prompt-format', 'whole-system')
                    page.wait_for_function('async()=>(await PRP.store.getSetting("app",null)).wholeCardSystemPrompt===true')
                    page.reload()
                    page.wait_for_function('window.PRP && PRP.app && PRP.app.S.settings.wholeCardSystemPrompt===true')
                    page.evaluate('''async({mode,kind})=>{
                      const {ctx,S}=PRP.app,DB=PRP.store;
                      const card=Object.assign(PRP.cardModel.blank(),{id:'card',name:'Мира',
                        description:'Исследовательница.\\nПолный текст описания.',personality:'Инициативна.\\nГоворит точно.',
                        appearance:'Короткие каштановые волосы.',scenario:'Хочет вернуть {{user}} книжку.'});
                      await DB.put('cards',card);await ctx.nav.loadAll();
                      const id=await ctx.svc.chat.createChat(mode,card.id);
                      if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-06T12:00:00.000Z'});
                      await ctx.nav.openChat(id);
                      S.settings.images.enabled=false;S.settings.autoContext=false;S.settings.contextTokens=32000;
                      S.settings.providers=[{id:'api',kind:'openai',name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}];
                      S.settings.activeProvider=kind==='openai'?'api':'perchance';
                      PRP.llm.simple=async()=>JSON.stringify({events:[]});ctx.svc.memory.observe=async()=>({status:'disabled'});
                      window.__calls=[];
                      window.ai=request=>{
                        if(request.getMetaObject)return {idealMaxContextTokens:32000};
                        __calls.push(request.instruction());return Promise.resolve({generatedText:'Я принесла книжку.'});
                      };
                      const original=window.fetch;
                      window.fetch=async(url,opts)=>{
                        if(String(url)==='https://fixture.invalid/v1/chat/completions'){
                          const body=JSON.parse(opts.body);__calls.push(body.messages[0].content);
                          const nl=String.fromCharCode(10);
                          return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Я принесла книжку.'}}]})+nl+nl+'data: [DONE]'+nl+nl,
                            {status:200,headers:{'Content-Type':'text/event-stream'}});
                        }return original(url,opts);
                      };
                      window.__cardBefore=JSON.stringify(await DB.get('cards','card'));
                    }''', {'mode': mode, 'kind': kind})
                    page.fill('#input', 'Что ты задумала?')
                    page.click('[data-act=send]')
                    page.wait_for_function('__calls.length===1 && !PRP.app.S.gen && !PRP.app.S.turn')
                    request = page.evaluate('__calls[0]')
                    assert '### Указания автора карточки (цельный промпт персонажа — эксперимент)' in request
                    assert 'Характер и манера речи:\nИнициативна.\nГоворит точно.' in request
                    assert 'Исходная ситуация:\nХочет вернуть Пользователь книжку.' in request
                    assert '### Характер Мира' not in request
                    page.evaluate('PRP.controllers.settings(PRP.app.ctx).actions.settings({dataset:{section:"gen"}})')
                    page.screenshot(path=str(out / f'whole-card-{mode}-{kind}-{width}.png'))
                    page.select_option('#card-prompt-format', 'data')
                    page.wait_for_function('async()=>(await PRP.store.getSetting("app",null)).wholeCardSystemPrompt===false')
                    page.click('[data-act=modal-close]')
                    page.fill('#input', 'А теперь?')
                    page.click('[data-act=send]')
                    page.wait_for_function('__calls.length===2 && !PRP.app.S.gen && !PRP.app.S.turn')
                    restored = page.evaluate('__calls[1]')
                    assert 'цельный промпт персонажа — эксперимент' not in restored
                    assert '- личность: "Инициативна.\\nГоворит точно."' in restored
                    assert page.evaluate('async()=>__cardBefore===JSON.stringify(await PRP.store.get("cards","card"))')
                    assert not errors, errors
                    results.append({'width': width, 'mode': mode, 'transport': kind, 'passed': True})
                    context.close()
        browser.close()
finally:
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
