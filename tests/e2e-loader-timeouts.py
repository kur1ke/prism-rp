"""F24: real browser fetch/inline execution with mocked HTTPS routes and virtual time.
No external network or live Perchance API. Run after node build.js.
"""
from browser_support import launch_chromium, browser_context
import hashlib,json,os,pathlib,shutil,sys,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-loader-'))
out.mkdir(parents=True,exist_ok=True)
loader=(root/'templates/loader-testing.html').read_text()
bundle=(root/'dist/web/prism-app.js').read_text()
sha='e338fa4dab0eb6a7e70b0e6f25ea0ddc23eb31a3'
manifest=json.loads((root/'tests/fixtures/testing-fallback.json').read_text())
pinned=manifest['revision']
fallback_path=os.environ.get('PRISM_FALLBACK_BUNDLE')
fallback_bundle=pathlib.Path(fallback_path).read_bytes() if fallback_path else None
if fallback_bundle:
 assert hashlib.sha256(fallback_bundle).hexdigest()==manifest['bundleSha256']
good='window.__boots=(window.__boots||0)+1;window.PRP={};window.PRISM_RP_VERSION="test";'
results=[]
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 for scenario in ['normal-app','late-cdn','late-api','all-stalled','http-fallback','runtime-error','syntax-error']+(['fallback-app'] if fallback_bundle else []):
  context=browser_context(browser, viewport={'width':1100,'height':800})
  if scenario in ['late-cdn','late-api']:
   # Cancellation is intentionally ignored; late successful responses must still be harmless.
   context.add_init_script('''const fetchOriginal=window.fetch;window.fetch=(url,options)=>{const {signal,...rest}=options||{};return fetchOriginal(url,rest);};''')
  context.add_init_script('''window.__openedDbs=[];const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(name,...rest){window.__openedDbs.push(name);return open.call(this,name,...rest);};''')
  page=context.new_page();page.clock.install();errors=[];requests=[];held={}
  page.on('pageerror',lambda e:errors.append(str(e)))
  def respond(route,body,status=200,kind='text/javascript'):
   route.fulfill(status=status,content_type=kind,headers={'Access-Control-Allow-Origin':'*'},body=body)
  def handle(route):
   url=route.request.url
   if url.startswith('https://prism-loader.test/'):
    route.fulfill(status=200,content_type='text/html; charset=utf-8',body=loader);return
   if 'api.github.com/' in url:
    requests.append(url)
    if scenario in ['late-api','all-stalled']:held['api']=route;return
    if scenario=='fallback-app':respond(route,'unavailable',503);return
    respond(route,json.dumps({'commit':{'sha':sha}}),kind='application/json');return
   if 'cdn.jsdelivr.net/' in url:
    requests.append(url)
    if scenario in ['late-cdn','all-stalled']:held['cdn']=route;return
    if scenario=='fallback-app':respond(route,'window.__boots=(window.__boots||0)+1;'+fallback_bundle.decode());return
    if scenario=='http-fallback':respond(route,'unavailable',503);return
    if scenario=='runtime-error':respond(route,good+'document.getElementById("prism-boot").remove();throw new Error("intentional startup failure");');return
    if scenario=='syntax-error':respond(route,'<html>not javascript</html>');return
    code='window.__boots=(window.__boots||0)+1;'+bundle if scenario=='normal-app' else good
    respond(route,code);return
   if 'raw.githubusercontent.com/' in url:
    requests.append(url)
    if scenario=='all-stalled':held['raw']=route;return
    respond(route,good);return
   route.abort()
  page.route('**/*',handle)
  page.goto('https://prism-loader.test/',wait_until='domcontentloaded')
  if scenario in ['normal-app','fallback-app']:
   page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   assert page.evaluate('window.__boots')==1
   assert page.evaluate('window.__openedDbs')==['prism-rp-testing']
   assert len(requests)==2,requests
   if scenario=='fallback-app':
    assert page.evaluate('window.PRISM_RP_BUILD_SHA')==manifest['buildSha']
    assert page.evaluate('window.PRISM_RP_TEST_REVISION')==pinned
    assert page.evaluate('!!PRP.stateTracker && !PRP.scene && !PRP.experience')
    assert pinned in requests[1]
    page.screenshot(path=str(out/'fallback-app.png'))
  elif scenario=='late-cdn':
   page.wait_for_function('document.querySelector("#prism-testing-badge").textContent.includes("e338fa4")')
   assert 'cdn' in held,held
   page.clock.fast_forward(20000)
   page.wait_for_function('window.__boots===1')
   respond(held['cdn'],'window.__late=true;'+good)
   page.wait_for_timeout(50)
   assert page.evaluate('window.__boots===1 && !window.__late')
   assert len(requests)==3 and all(sha in u for u in requests[1:]),requests
  elif scenario=='late-api':
   page.wait_for_timeout(20);assert 'api' in held
   page.clock.fast_forward(5000);page.wait_for_function('window.__boots===1')
   respond(held['api'],json.dumps({'commit':{'sha':sha}}),kind='application/json');page.wait_for_timeout(50)
   assert page.evaluate('window.PRISM_RP_TEST_REVISION')==pinned
   assert page.evaluate('window.__boots')==1 and len(requests)==2,requests
  elif scenario=='all-stalled':
   page.wait_for_timeout(20);assert 'api' in held
   page.clock.fast_forward(5000);page.wait_for_timeout(20);assert 'cdn' in held
   page.clock.fast_forward(20000);page.wait_for_timeout(20);assert 'raw' in held
   page.clock.fast_forward(20001)
   page.clock.run_for(100)
   page.wait_for_function('document.querySelector("#prism-boot").textContent.includes("оба источника недоступны")')
   assert page.evaluate('window.__boots||0')==0
   assert len(requests)==3 and all(pinned in u for u in requests[1:]),requests
   page.screenshot(path=str(out/'bounded-failure.png'))
  elif scenario=='http-fallback':
   page.wait_for_function('window.__boots===1');assert len(requests)==3 and all(sha in u for u in requests[1:]),requests
  else:
   page.wait_for_function('document.querySelector("#prism-boot").textContent.includes("приложение не инициализировалось")')
   assert page.locator('#prism-boot').is_visible()
   page.clock.fast_forward(100000);assert len(requests)==2,requests
   assert page.evaluate('window.__boots||0')==(1 if scenario=='runtime-error' else 0)
  if scenario not in ['runtime-error','syntax-error']:assert errors==[],errors
  else:assert len(errors)==1,errors
  assert not any('@main' in u or '/main/' in u or '@testing' in u for u in requests)
  results.append({'scenario':scenario,'result':'PASS','executions':page.evaluate('window.__boots||0'),'requests':len(requests),'runtimeErrors':errors})
  # Resolve retained routes before closing so Playwright has no pending handlers.
  for route in held.values():
   try:route.abort()
   except Exception:pass
  page.wait_for_timeout(20)
  context.close()
 browser.close()
(out/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
