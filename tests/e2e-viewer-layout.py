"""Image viewer: loaded image sizes, long prompts, visible hit targets and close button."""
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
        for width, height in [(1440,900),(900,568),(390,844),(320,568)]:
            context=browser_context(browser,viewport={'width':width,'height':height})
            page=context.new_page()
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_selector('.home-welcome')
            for shape in [[2,3],[832,1216],[1216,832]]:
                for prompt in ['longprompt'*1000, 'Подпись к изображению. '*80]:
                    page.evaluate("""({shape,prompt})=>{
                      const {S,ctx}=PRP.app,canvas=document.createElement('canvas');
                      [canvas.width,canvas.height]=shape;
                      S.imgUrls.fixture=canvas.toDataURL();
                      S.modal={kind:'image',im:{id:'fixture',draw:prompt},mid:'fixture',sw:0};
                      ctx.ui.renderModal();
                    }""",{'shape':shape,'prompt':prompt})
                    page.wait_for_function("document.querySelector('.lightbox img')?.complete && document.querySelector('.lightbox img').naturalWidth > 0")
                    bounds=page.evaluate("""()=>[...document.querySelectorAll('.lb-fig,.lb-fig img,.lb-tools button')].map(e=>{
                      const r=e.getBoundingClientRect(),button=e.matches('button');
                      return {tag:e.tagName,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
                        clickable:!button || document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e};
                    })""")
                    assert all(b['width']>0 and b['height']>0 and b['x']>=-1 and b['y']>=-1 and
                               b['right']<=width+1 and b['bottom']<=height+1 and b['clickable'] for b in bounds),bounds
                    assert page.evaluate('PRP.app.S.modal.im.draw')==prompt
                    page.screenshot(path=str(out/f'viewer-{width}-{shape[0]}-{len(prompt)}.png'))
                    page.click('.lightbox [data-act=modal-close]')
                    page.wait_for_selector('.lightbox',state='detached')
                    assert page.evaluate('PRP.app.S.modal') is None
                    results.append({'width':width,'height':height,'shape':shape,'promptChars':len(prompt),'passed':True})
            context.close()
        browser.close()
finally:
    server.terminate()
    server.wait()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
