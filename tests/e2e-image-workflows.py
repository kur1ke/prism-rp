"""F29: actual RP/translation/A1111 adapters, auto Draw, identity, quality and seed."""
from browser_support import launch_chromium, browser_context
import json
from pathlib import Path
import socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   context=browser_context(browser,viewport={'width':width,'height':900});page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_selector('.home-welcome')
   page.evaluate('''async()=>{
    const {ctx,S}=PRP.app,DB=PRP.store;
    await DB.put('cards',Object.assign(PRP.cardModel.blank(),{id:'card',name:'Мира',description:'CARD_ROLE_SENTINEL',personality:'Спокойна.',
      firstMes:'Мира улыбается у окна.',lore:[{id:'lore',content:'LORE_ROLE_SENTINEL',constant:true,enabled:true}],
      image:{trigger:'mira, long chestnut hair',negative:'short hair',loras:[{name:'Mira_LoRA',weight:0.8}]}}));
    await ctx.nav.loadAll();const id=await ctx.svc.chat.createChat('rp','card');await ctx.nav.openChat(id);
    S.settings.providers=[{id:'fixture',kind:'openai',name:'Fixture',baseUrl:'https://rp.fixture.invalid/v1',model:'fixture'}];
    S.settings.activeProvider='fixture';S.settings.autoContext=false;S.settings.contextTokens=32000;
    Object.assign(S.settings.images,{enabled:true,backend:'a1111',url:'https://image.fixture.invalid',model:'fixture.safetensors',
      translate:false,drawPromptMode:'tags',autoDraw:true,modelDraws:true,modelDrawPolicy:'contextual',seed:'123456',fixedPrompt:'masterpiece, best quality'});
    ctx.svc.memory.observe=async()=>({status:'disabled'});
    const simple=PRP.llm.simple;PRP.llm.simple=(p,instruction,opts)=>instruction.includes('SCENE:')?simple(p,instruction,opts):Promise.resolve(JSON.stringify({events:[]}));
    window.__texts=[];window.__images=[];const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const base64=canvas.toDataURL('image/png').split(',')[1],original=window.fetch;
    window.fetch=async(url,opts)=>{
     if(String(url)==='https://rp.fixture.invalid/v1/chat/completions'){
      const body=JSON.parse(opts.body);__texts.push(body);
      const translation=body.messages.some(m=>m.content.includes('SCENE:'));
      const content=translation?'1girl, mira, smiling, waving, cafe terrace, evening':
        'Мира позирует.\\n[draw: 1girl, Мира, smiling, blue denim jeans, library, 2:3]';
      const nl=String.fromCharCode(10);
      return body.stream?new Response('data: '+JSON.stringify({choices:[{delta:{content}}]})+nl+nl+'data: [DONE]'+nl+nl,
       {status:200,headers:{'Content-Type':'text/event-stream'}}):new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
     }
     if(String(url)==='https://image.fixture.invalid/sdapi/v1/txt2img'){
      const body=JSON.parse(opts.body);__images.push(body);
      return new Response(JSON.stringify({images:[base64],parameters:{seed:body.seed},info:JSON.stringify({seed:body.seed})}),{headers:{'Content-Type':'application/json'}});
     }return original(url,opts);
    };
   }''')
   page.evaluate('PRP.controllers.settings(PRP.app.ctx).actions.settings({dataset:{section:"gen"}})')
   page.click('.preset[data-id=lively]')
   page.wait_for_function('async()=>(await PRP.store.getSetting("app",null)).sampler.temperature===1.1')
   page.click('[data-act=modal-close]')
   page.fill('#input','Нарисуй себя, пожалуйста');page.click('[data-act=send]')
   page.wait_for_selector('.turn.last .shot img');page.wait_for_function('!PRP.app.S.gen && !PRP.app.S.drawing.size && !PRP.app.S.tracking')
   assert '[draw:' not in page.inner_text('#feed')
   requests=page.evaluate('__texts');assert len(requests)==1
   assert requests[0]['temperature']==1.1
   system='\n'.join(m['content'] for m in requests[0]['messages'] if m['role']=='system')
   assert all(s in system for s in ['Ты играешь за','CARD_ROLE_SENTINEL','LORE_ROLE_SENTINEL'])
   images=page.evaluate('__images');assert len(images)==1
   image=images[0];prompt=image['prompt']
   assert '<lora:Mira_LoRA:0.8>' in prompt and prompt.count('<lora:')==1,prompt
   assert 'long chestnut hair' in prompt and 'blue denim jeans' in prompt,prompt
   assert prompt.count('masterpiece')==1,prompt
   assert (image['width'],image['height'])==(832,1216)
   assert 'short hair' in image['negative_prompt'] and image['seed']==123456,image
   assert image['override_settings']['sd_model_checkpoint']=='fixture.safetensors'
   page.evaluate('PRP.app.S.settings.images.translate=true')
   page.locator('.turn.assistant').first.locator('[data-act=draw]').click()
   page.wait_for_function('__images.length===2 && !PRP.app.S.drawing.size')
   translations=page.evaluate('__texts');assert len(translations)==2
   assert 'SCENE:' in translations[-1]['messages'][-1]['content']
   assert 'Мира улыбается у окна.' in translations[-1]['messages'][-1]['content']
   translated=page.evaluate('__images[1]')
   assert 'smiling, waving, cafe terrace' in translated['prompt'] and translated['seed']==123456
   assert errors==[],errors
   page.screenshot(path=str(out/f'images-{width}.png'),full_page=True)
   results.append({'width':width,'status':'PASS','autoDraw':True,'translationAdapter':True,'a1111Adapter':True});context.close()
  browser.close()
finally:server.terminate();server.wait()
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
