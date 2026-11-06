"""F22: actual IndexedDB writers, coherent export, file download and UI restore."""
from browser_support import launch_chromium, browser_context
import json, os, pathlib, shutil, socket, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='prism-f22-'))
out.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
    with sync_playwright() as p:
        browser=launch_chromium(p)
        for width in [1440,390]:
            context=browser_context(browser, viewport={'width':width,'height':900},accept_downloads=True)
            context.add_init_script('window.__PRP_TEST_MIRROR=true')
            page=context.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            if os.environ.get('PRISM_SNAPSHOT_HTML'):
                page.route('**/dist/standalone/index.html',lambda route:route.fulfill(path=os.environ['PRISM_SNAPSHOT_HTML'],content_type='text/html'))
            page.goto(f'http://127.0.0.1:{port}/dist/standalone/index.html')
            page.wait_for_function('window.PRP && PRP.app && document.querySelector("#stage").innerText.length>0')
            checks=page.evaluate('''async()=>{
              const DB=PRP.store,assert=(v,m)=>{if(!v)throw Error(m);},checks=[];
              const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
              canvas.getContext('2d').fillRect(0,0,512,512);
              const base={app:'prism-rp',version:8,
                cards:[Object.assign(PRP.cardModel.blank(),{id:'old-card',name:'Аля',description:'BEFORE'})],
                chats:[{id:'old-chat',cardId:'old-card',mode:'rp',leafId:'old-reply',preview:'BEFORE'}],
                messages:[{id:'old-user',chatId:'old-chat',parentId:null,role:'user',swipeIdx:0,swipes:[{text:'USER'}]},
                  {id:'old-reply',chatId:'old-chat',parentId:'old-user',parentSwipeIdx:0,role:'assistant',swipeIdx:0,
                    swipes:[{text:'BEFORE',images:[{id:'old-image',status:'done',seed:17,ratio:'1:1',w:512,h:512}]},{text:'ALT'}]},
                  {id:'fork-reply',chatId:'old-chat',parentId:'old-user',parentSwipeIdx:0,role:'assistant',swipeIdx:0,swipes:[{text:'FORK'}]}],
                images:[{id:'old-image',chatId:'old-chat',msgId:'old-reply',dataUrl:canvas.toDataURL('image/png')}],
                settings:[{key:'snapshot-marker',value:'KEEP_SETTING'}],
                experience:[{id:'archive',owner:'old-card',text:'INERT_ARCHIVE'}],
                assist:[{id:'old-assist',ctx:{type:'general'},messages:[{role:'user',content:'KEEP_ASSIST'}]}]};
              window.__base=base;
              const getAll=IDBObjectStore.prototype.getAll;
              const withWriter=async(write)=>{
                let writer=null,queued=false;
                IDBObjectStore.prototype.getAll=function(...args){
                  const req=getAll.apply(this,args);
                  if(this.name==='cards')req.addEventListener('success',()=>{if(!queued){queued=true;writer=write();}});
                  return req;
                };
                let backup;
                try{backup=await DB.exportAll();}finally{IDBObjectStore.prototype.getAll=getAll;}
                assert(queued,'concurrent writer not queued');await writer;return backup;
              };
              await DB.importAll(base,true);
              const added=await withWriter(()=>DB.putAll([
                ['cards',{id:'new-card',name:'Новая'}],['chats',{id:'new-chat',cardId:'new-card',mode:'messenger',leafId:'new-message'}],
                ['messages',{id:'new-message',chatId:'new-chat',parentId:null,role:'user',swipeIdx:0,swipes:[{text:'NEW'}]}]
              ]));
              const present=[added.cards.some(x=>x.id==='new-card'),added.chats.some(x=>x.id==='new-chat'),added.messages.some(x=>x.id==='new-message')];
              assert(present.every(x=>x===present[0]),'F22 split snapshot: '+JSON.stringify(present));
              assert(!PRP.backup.check(added,{replace:true}).issues.length,'inconsistent snapshot rejected by backup.check');
              assert(!!await DB.get('messages','new-message'),'concurrent writer did not finish');checks.push('concurrent creation: PASS');
              await DB.importAll(base,true);
              const changed=await withWriter(async()=>{
                const c=await DB.get('cards','old-card'),ch=await DB.get('chats','old-chat'),m=await DB.get('messages','old-reply');
                c.description=ch.preview=m.swipes[0].text='AFTER';await DB.putAll([['cards',c],['chats',ch],['messages',m]]);
              });
              const values=[changed.cards[0].description,changed.chats[0].preview,changed.messages.find(m=>m.id==='old-reply').swipes[0].text];
              assert(values.every(v=>v===values[0]),'mixed update revisions');checks.push('concurrent update: PASS');
              await DB.importAll(base,true);
              const removed=await withWriter(()=>DB.mutateBatch({deletes:[['cards','old-card'],['chats','old-chat'],
                ['messages','old-user'],['messages','old-reply'],['messages','fork-reply'],['images','old-image'],['experience','archive']]}));
              assert(removed.cards.length===removed.chats.length&&removed.messages.length===removed.cards.length*3,'mixed deletion snapshot');
              assert(!PRP.backup.check(removed,{replace:true}).issues.length,'orphan after concurrent deletion');checks.push('concurrent deletion: PASS');
              await DB.importAll(base,true);
              IDBObjectStore.prototype.getAll=function(...args){if(this.name==='images')throw Error('images must not be read');return getAll.apply(this,args);};
              const noImages=await DB.exportAll({noImages:true});IDBObjectStore.prototype.getAll=getAll;
              assert(!('images' in noImages)&&noImages.messages.length===3&&noImages.experience[0].text==='INERT_ARCHIVE','noImages contract');checks.push('noImages: PASS');
              IDBObjectStore.prototype.getAll=function(...args){if(this.name==='messages')throw Error('F22 request setup failure');return getAll.apply(this,args);};
              let failed=false;try{await DB.exportAll();}catch(e){failed=e.message==='F22 request setup failure';}finally{IDBObjectStore.prototype.getAll=getAll;}
              assert(failed,'partial export resolved after failed request');checks.push('failed request: PASS');
              IDBObjectStore.prototype.getAll=function(...args){const req=getAll.apply(this,args);
                if(this.name==='messages'){const t=this.transaction;req.addEventListener('success',()=>t.abort());}return req;};
              failed=false;try{await DB.exportAll();}catch(e){failed=true;}finally{IDBObjectStore.prototype.getAll=getAll;}
              assert(failed,'partial export resolved after transaction abort');checks.push('abort after reads: PASS');
              const retry=await DB.exportAll();assert(retry.messages.length===3,'retry failed');
              window.__backup=retry;await PRP.app.ctx.nav.loadAll();PRP.app.ctx.ui.openSettings('data');
              return checks;
            }''')
            # A failing export must not trigger a file download through the real UI.
            downloads=[];page.on('download',lambda d:downloads.append(d))
            page.evaluate('''()=>{window.__getAll=IDBObjectStore.prototype.getAll;
              IDBObjectStore.prototype.getAll=function(...args){if(this.name==='messages')throw Error('F22 UI export failure');return __getAll.apply(this,args);};}''')
            page.click('[data-act=backup]')
            page.wait_for_function('document.body.innerText.includes("F22 UI export failure")')
            assert downloads==[], 'failed snapshot downloaded a partial file'
            page.evaluate('()=>{IDBObjectStore.prototype.getAll=__getAll;}')
            with page.expect_download() as info:page.click('[data-act=backup]')
            path=out/f'backup-{width}.json';info.value.save_as(path)
            data=json.loads(path.read_text());assert data['app']=='prism-rp' and data['version']==8 and len(data['messages'])==3
            # A07: real file-input restore must reject cycles before any writes.
            dialog_mode={'replace':True}
            page.on('dialog',lambda dialog:dialog.accept() if dialog_mode['replace'] else dialog.dismiss())
            before=page.evaluate('PRP.store.exportAll()')
            before.pop('exportedAt')
            for kind in ['self','pair','additive']:
                bad=json.loads(json.dumps(data))
                user=next(m for m in bad['messages'] if m['id']=='old-user')
                user['parentId']='old-user' if kind=='self' else 'old-reply'
                if kind=='additive':bad['messages']=[user]
                dialog_mode['replace']=kind!='additive'
                badpath=out/f'cycle-{kind}-{width}.json'
                badpath.write_text(json.dumps(bad))
                page.locator('#file-backup').set_input_files(str(badpath))
                page.wait_for_function('document.body.innerText.includes("в связях сообщений обнаружен цикл")')
                after=page.evaluate('PRP.store.exportAll()');after.pop('exportedAt')
                assert after==before,(kind,'failed restore changed data')
                assert page.evaluate('!!PRP.app.S.modal && document.querySelector("#file-backup").value===""')
            dialog_mode['replace']=True
            # Restore the downloaded file using the application's normal file input.
            page.evaluate('PRP.store.importAll({app:"prism-rp",version:8},true)')
            page.locator('#file-backup').set_input_files(str(path))
            page.wait_for_function('!PRP.app.S.modal && PRP.app.S.cards.some(c=>c.id==="old-card")')
            restored=page.evaluate('''async()=>{
              const DB=PRP.store;return {cards:await DB.all('cards'),chats:await DB.all('chats'),messages:await DB.all('messages'),
                images:await DB.all('images'),experience:await DB.all('experience'),assist:await DB.all('assist'),settings:await DB.all('settings')};
            }''')
            for collection in restored:
                assert restored[collection]==data[collection], (width,collection,'restore changed snapshot')
            assert page.evaluate('''async()=>{const ctx=PRP.app.ctx;await ctx.nav.openChat('old-chat');
              await ctx.svc.chat.selectBranch('fork-reply');const fork=ctx.svc.chat.path().at(-1).swipes[0].text;
              await ctx.svc.chat.selectBranch('old-reply',1);return [fork,PRP.tree.activeSwipe(ctx.svc.chat.path().at(-1)).text];}''')==['FORK','ALT']
            page.reload();page.wait_for_selector('.chat-head')
            assert page.evaluate('PRP.tree.activeSwipe(PRP.app.ctx.svc.chat.path().at(-1)).text')=='ALT'
            assert errors==[],errors
            checks+=['UI failure/no download: PASS','cyclic replace/additive refused without writes: PASS','UI download/restore: PASS','branches/swipes/reload: PASS']
            results.append({'width':width,'checks':checks,'runtimeErrors':errors})
            context.close()
        browser.close()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
finally:
    server.terminate();server.wait()
