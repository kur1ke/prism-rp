"""A05: real HTTP SSE stays open after DONE; actual RP/Messenger UI and native IDB must finish."""
from browser_support import launch_chromium,browser_context
import functools,http.server,json,pathlib,socket,sys,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
stats={}
class Handler(http.server.SimpleHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/fixture-stats':
   data=json.dumps(stats).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  else:super().do_GET()
 def do_POST(self):
  self.rfile.read(int(self.headers.get('Content-Length','0')))
  key=self.path.split('/')[2];stats[key]={'sent':False,'closed':False,'requests':stats.get(key,{}).get('requests',0)+1}
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Cache-Control','no-cache');self.send_header('Connection','keep-alive');self.end_headers()
  event=lambda text,reason='',finish=None:('data: '+json.dumps({'choices':[{'delta':{'content':text,'reasoning_content':reason},'finish_reason':finish}]},ensure_ascii=False)+'\r\n\r\n').encode()
  try:
   self.wfile.write(event('','THINKING'));self.wfile.flush();self.wfile.write(event('FINAL_REPLY','', 'stop'));self.wfile.flush()
   if key.startswith('messenger'):
    self.wfile.write(b'data: [DO');self.wfile.flush();self.wfile.write(b'NE]\r\n\r\n'+event('LATE_LEAK'))
   else:self.wfile.write(b'data: [DONE]\r\n\r\n'+event('LATE_LEAK'))
   self.wfile.flush();stats[key]['sent']=True
   # No EOF is sent: only a client cancellation should close this connection.
   self.connection.settimeout(30);stats[key]['closed']=self.connection.recv(1)==b''
  except (ConnectionResetError,BrokenPipeError):stats[key]['closed']=True
  except OSError:pass
  finally:self.close_connection=True
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)));port=server.server_address[1];threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for mode in ['rp','messenger']:
   for width in [1440,390]:
    key=f'{mode}-{width}';context=browser_context(browser,viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
    page.evaluate('''async({mode,key,base})=>{
     const {S,ctx}=PRP.app,DB=PRP.store,c=ctx.svc.chat;
     await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Fixture',description:'Independent character.'}));await ctx.nav.loadAll();const id=await c.createChat(mode,'card');
     if(mode==='messenger')await ctx.svc.messenger.createFor(id,{timeZone:'UTC',timeMode:'manual',manualNow:'2026-11-06T12:00:00.000Z'});
     await c.addUserMessage('Question');await ctx.nav.openChat(id);
     const provider={id:'fixture',kind:'openai',baseUrl:base+'/fixture/'+key+'/v1',model:'mock',label:'Fixture'};ctx.provider=()=>provider;ctx.processingProvider=ctx.provider;
     S.settings.autoContext=false;S.settings.contextTokens=32000;S.settings.images.enabled=false;
     PRP.llm.simple=async()=>JSON.stringify({events:[]});ctx.svc.memory.observe=async()=>({status:'fixture-disabled'});ctx.ui.renderAll();
    }''',{'mode':mode,'key':key,'base':f'http://127.0.0.1:{port}'})
    page.click('[data-act=reply]')
    page.wait_for_function("!PRP.app.S.gen && PRP.tree.activeSwipe(PRP.app.ctx.svc.chat.path().at(-1)).text==='FINAL_REPLY'",timeout=5000)
    page.wait_for_function('async(key)=>{const s=await(await fetch("/fixture-stats")).json();return s[key]?.closed;}',arg=key,timeout=5000)
    saved=page.evaluate('''async()=>{const {S,ctx}=PRP.app,m=ctx.svc.chat.path().at(-1),stored=await PRP.store.get('messages',m.id);return {text:PRP.tree.activeSwipe(stored).text,reasoning:PRP.tree.activeSwipe(stored).reasoning,preview:ctx.chat().preview};}''')
    assert saved=={'text':'FINAL_REPLY','reasoning':'THINKING','preview':'FINAL_REPLY'},saved
    assert stats[key]['requests']==1 and stats[key]['sent'] and stats[key]['closed'],stats[key]
    page.wait_for_function('async()=>{const ui=await PRP.store.getSetting("ui",{});return ui.chatId===PRP.app.S.chatId;}')
    page.reload();page.wait_for_selector('.chat-head')
    assert page.evaluate('PRP.tree.activeSwipe(PRP.app.ctx.svc.chat.path().at(-1)).text')=='FINAL_REPLY'
    assert not errors,errors
    results.append({'mode':mode,'width':width,'completionBeforeEOF':'PASS','readerCanceled':'PASS','textReasoningPreview':'PASS','requests':stats[key]['requests'],'reload':'PASS','runtimeErrors':errors});context.close()
  browser.close()
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
finally:server.shutdown();server.server_close()
