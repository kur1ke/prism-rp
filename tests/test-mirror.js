"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname, "..");
function storeName(flag) {
  let opened = null;
  const ctx = { PRP: {}, __PRP_TEST_MIRROR: flag };
  ctx.window = ctx;
  ctx.indexedDB = { open(name) { opened = name; throw Error("probe stops here"); } };
  ctx.setTimeout = setTimeout;
  ctx.clearTimeout = clearTimeout;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/core/store.js"), "utf8"), ctx);
  ctx.PRP.store.get("settings", "ui").catch(() => {});
  return opened;
}
assert.equal(storeName(true), "prism-rp-testing");
assert.equal(storeName(false), "prism-rp");
assert.equal(storeName(undefined), "prism-rp");
const html = fs.readFileSync(path.join(ROOT, "dist/perchance/loader-testing.html"), "utf8");
assert.match(html, /__PRP_TEST_MIRROR = true/);
assert.match(html, /PRISM_RP_CHANNEL = "testing"/);
assert.match(html, /api\.github\.com\/repos\/kur1ke\/prism-rp\/branches\/testing/);
assert.match(html, /cdn\.jsdelivr\.net\/gh\/kur1ke\/prism-rp@/);
assert.doesNotMatch(html, /kur1ke\.github\.io\/prism-rp\/dist\/web/);
const bare = html.replace(/<script[\s\S]*?<\/script>/g, "");
assert.doesNotMatch(bare, /[\[\]{}]/);
const scriptCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
async function run(reply,fail) {
  let src="", scripts=[],badge={textContent:""},boot={textContent:""};
  const document = {
    getElementById(id) { return id==="prism-testing-badge"?badge:id==="prism-boot"?boot:null; },
    createElement(tag) { assert.equal(tag,"script"); return {src:"",onload:null,onerror:null}; },
    head: {appendChild(el) { src=el.src; scripts.push(el); }}
  };
  const ctx={document,window:null,fetch:()=>fail?Promise.reject(Error("network")):Promise.resolve({ok:true,json:async()=>({commit:{sha:reply}})}),encodeURIComponent};
  ctx.window=ctx;
  vm.runInNewContext(scriptCode,ctx);
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  return {ctx,src,badge,boot,scripts};
}
(async ()=>{
  const sha="e338fa4dab0eb6a7e70b0e6f25ea0ddc23eb31a3";
  const ok=await run(sha,false);
  assert.equal(ok.ctx.__PRP_TEST_MIRROR,true);
  assert.equal(ok.ctx.PRISM_RP_TEST_REVISION,sha);
  assert.ok(ok.src.includes("@"+sha+"/dist/web/prism-app.js"));
  assert.ok(!ok.src.includes("@main"));
  assert.equal(ok.scripts.length,1);
  ok.scripts[0].onerror();
  assert.equal(ok.scripts.length,2, "CDN error must start raw fallback");
  assert.ok(ok.scripts[1].src.includes("raw.githubusercontent.com/kur1ke/prism-rp/"+sha+"/dist/web/prism-app.js"));
  assert.equal(ok.ctx.PRISM_RP_TEST_REVISION,sha, "fallback must keep the same commit");
  assert.ok(!ok.scripts[1].src.includes("/main/"));
  ok.scripts[1].onerror();
  assert.match(ok.boot.textContent,/оба источника недоступны/);
  const fallback=await run(null,true);
  assert.ok(fallback.src.includes("@testing/dist/web/prism-app.js"));
  assert.match(fallback.badge.textContent,/кэш/);
  const malformed=await run("<script>",false);
  assert.ok(malformed.src.includes("@testing/dist/web/prism-app.js"));
  console.log("Test mirror checks: storage isolation, pinned release, fallback, SHA validation — OK");
})().catch(e=>{console.error(e);process.exitCode=1;});
