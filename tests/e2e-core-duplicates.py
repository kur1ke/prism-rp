"""F09: actual bundle, stored card unchanged and editor still exposes original Core."""
from browser_support import launch_chromium, browser_context
import json, pathlib, shutil, socket, subprocess, sys
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
with socket.socket() as s:
 s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 with sync_playwright() as p:
  browser=launch_chromium(p)
  for width in [1440,390]:
   context=browser_context(browser, viewport={'width':width,'height':900});context.add_init_script('window.__PRP_TEST_MIRROR=true')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html');page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
   result=page.evaluate('''async()=>{
    const P=PRP,{ctx}=P.app,c=Object.assign(P.cardModel.blank(),{id:'dedup',name:'N',description:'DESC_MARKER',personality:'TRAIT_ONE\\n\\nTRAIT_TWO',appearance:'LOOK_MARKER',contextFields:{description:true,personality:true,appearance:true,prismCore:true}});
    c.prismCore=P.cardContext.deriveCore(c);await P.store.put('cards',c);const original=JSON.stringify(await P.store.get('cards',c.id));await ctx.nav.loadAll();
    for(const mode of ['rp','messenger'])for(const pc of [false,true]){
      const b=P.assembler.build({card:c,mode,contextTokens:32000,inputCost:pc?m=>P.perchance.inputCost({char:'N',user:'U'},m):undefined});
      const text=b.messages.map(m=>m.content).join('\\n');
      for(const marker of ['DESC_MARKER','TRAIT_ONE','TRAIT_TWO','LOOK_MARKER'])if(text.split(marker).length!==2)throw Error('duplicate '+marker);
      if(b.report.card.core.duplicates.length!==3)throw Error('missing diagnostics');
    }
    const outfit=P.stateInterpreter.initialOutfitInstruction(c,{});
    for(const marker of ['DESC_MARKER','TRAIT_ONE','TRAIT_TWO'])if(outfit.split(marker).length!==2)throw Error('outfit duplicate');
    if(JSON.stringify(await P.store.get('cards',c.id))!==original)throw Error('stored card changed');
    await P.controllers.cards(ctx).actions['edit-card']({dataset:{id:c.id}});
    return {coreTokens:P.cardContext.tokenUsage(c,32000).fields.prismCore,identity:c.prismCore.identity};
   }''')
   assert result['coreTokens']==0
   assert page.locator('[data-core="core-identity"]').input_value()=='DESC_MARKER'
   page.reload();page.wait_for_function('window.PRP && PRP.app')
   saved=page.evaluate("async()=>{const c=await PRP.store.get('cards','dedup');return {identity:c.prismCore.identity,traits:c.prismCore.traits,selected:c.contextFields.prismCore};}")
   assert saved=={'identity':'DESC_MARKER','traits':['TRAIT_ONE','TRAIT_TWO'],'selected':True}
   assert errors==[],errors
   results.append({'width':width,'payloads':4,'outfit':'PASS','storedCoreEditorReload':'PASS','runtimeErrors':errors});context.close()
  browser.close()
 (out/'browser.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
finally:
 server.terminate();server.wait()
