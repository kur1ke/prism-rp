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
const html = fs.readFileSync(path.join(ROOT, "templates/loader-testing.html"), "utf8");
assert.match(html, /__PRP_TEST_MIRROR = true/);
assert.match(html, /PRISM_RP_CHANNEL = "testing"/);
assert.match(html, /api\.github\.com\/repos\/kur1ke\/prism-rp\/branches\/testing/);
assert.match(html, /cdn\.jsdelivr\.net\/gh\/kur1ke\/prism-rp@/);
assert.doesNotMatch(html, /kur1ke\.github\.io\/prism-rp\/dist\/web/);
const bare = html.replace(/<script[\s\S]*?<\/script>/g, "");
assert.doesNotMatch(bare, /[\[\]{}]/);
// Test-pinned offline bundle must use the current IndexedDB schema: otherwise
// API downtime can silently load v6 code over an existing v7/v8 database.
const storeJs=fs.readFileSync(path.join(ROOT, "js/core/store.js"), "utf8");
const currentDbVersion=Number(storeJs.match(/const DB_VERSION = (\d+)/)[1]);
const fallbackDbVersion=Number(html.match(/var safeDbVersion = (\d+)/)[1]);
assert.equal(fallbackDbVersion,currentDbVersion,
  "the immutable fallback is declared for a stale IndexedDB schema; repin a verified testing bundle");
assert.match(html,/var safeRevision = "c92f1c685a237c989047f327f9cedac1d9f750e2"/);
assert.doesNotMatch(html,/9355480089a1dd2d25b25be528b5bf93bc3a847b/);
const scriptCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const pinned="c92f1c685a237c989047f327f9cedac1d9f750e2";
const sha="e338fa4dab0eb6a7e70b0e6f25ea0ddc23eb31a3";
const good='window.__boots=(window.__boots||0)+1;window.PRP={};window.PRISM_RP_VERSION="test";window.PRISM_RP_BUILD_SHA="'+sha+'";';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function run(){
 const requests=[],scripts=[],timers=new Map(),badge={textContent:""},boot={textContent:"",isConnected:true};let time=0,seq=0;
 const ctx={encodeURIComponent,AbortController,Promise};ctx.window=ctx;
 ctx.addEventListener=()=>{};ctx.removeEventListener=()=>{};
 ctx.setTimeout=(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:time+ms});return id;};
 ctx.clearTimeout=id=>timers.delete(id);
 ctx.document={getElementById:id=>id==="prism-testing-badge"?badge:boot,
  createElement:tag=>{assert.equal(tag,"script");return {textContent:"",src:""};},
  head:{appendChild:el=>{assert.equal(el.src,"","fetching alone must never execute code");scripts.push(el);vm.runInContext(el.textContent,ctx);}}};
 // Deliberately ignore AbortSignal to prove the settled gate, not cancellation alone.
 ctx.fetch=(url,options)=>{
  const headers=deferred(),body=deferred();
  const r={url,options,headers:(status=200)=>headers.resolve({ok:status>=200&&status<300,status,json:()=>body.promise,text:()=>body.promise}),
   body:value=>body.resolve(value),respond:value=>{r.headers();r.body(value);},fail:error=>headers.reject(error||Error("network"))};
  requests.push(r);return headers.promise;
 };
 vm.createContext(ctx);vm.runInContext(scriptCode,ctx);
 const tick=async(ms)=>{
  const end=time+ms;
  for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
   time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}
  time=end;await flush();
 };
 return {ctx,requests,scripts,timers,badge,boot,tick};
}
async function apiOk(h){await flush();assert.equal(h.requests.length,1);h.requests[0].respond({commit:{sha}});await flush();assert.equal(h.requests.length,2);}
function immutable(h,ref){
 for(const r of h.requests.slice(1))assert.ok(r.url.includes(ref),r.url);
 assert.ok(!h.requests.some(r=>/@testing|@main|\/main\//.test(r.url)));
}
(async()=>{
 const ok=run();await apiOk(ok);ok.requests[1].respond(good);await flush();
 assert.equal(ok.ctx.__PRP_TEST_MIRROR,true);assert.equal(ok.ctx.PRISM_RP_TEST_REVISION,sha);assert.equal(ok.ctx.__boots,1);assert.equal(ok.scripts.length,1);assert.equal(ok.timers.size,0);immutable(ok,sha);

 const fallback=run();await apiOk(fallback);fallback.requests[1].fail();await flush();
 assert.ok(fallback.requests[2].url.includes("raw.githubusercontent.com"));fallback.requests[2].respond(good);await flush();assert.equal(fallback.ctx.__boots,1);immutable(fallback,sha);

 const timeout=run();await apiOk(timeout);await timeout.tick(20000);assert.equal(timeout.requests[1].options.signal.aborted,true);
 assert.equal(timeout.requests.length,3);timeout.requests[2].respond(good);await flush();
 timeout.requests[1].respond('window.__lateCdn=true;'+good);await flush();assert.equal(timeout.ctx.__boots,1);assert.equal(timeout.ctx.__lateCdn,undefined);immutable(timeout,sha);

 const slowBody=run();await apiOk(slowBody);slowBody.requests[1].headers();await flush();await slowBody.tick(20000);
 slowBody.requests[2].respond(good);await flush();slowBody.requests[1].body('window.__lateBody=true;'+good);await flush();assert.equal(slowBody.ctx.__boots,1);assert.equal(slowBody.ctx.__lateBody,undefined);

 const slowApi=run();await flush();await slowApi.tick(5000);assert.equal(slowApi.requests[0].options.signal.aborted,true);
 assert.equal(slowApi.ctx.PRISM_RP_TEST_REVISION,pinned);slowApi.requests[0].respond({commit:{sha}});await flush();assert.equal(slowApi.requests.length,2);
 slowApi.requests[1].respond(good);await flush();assert.equal(slowApi.ctx.__boots,1);assert.equal(slowApi.ctx.PRISM_RP_TEST_REVISION,pinned);immutable(slowApi,pinned);
 assert.match(slowApi.badge.textContent,/закреплено c92f1c6/);assert.match(slowApi.badge.textContent,/сборка e338fa4/);assert.match(slowApi.badge.textContent,/DB v8/);assert.match(slowApi.badge.textContent,/API недоступен/);

 const apiBody=run();await flush();apiBody.requests[0].headers();await flush();await apiBody.tick(5000);
 apiBody.requests[0].body({commit:{sha}});await flush();assert.equal(apiBody.ctx.PRISM_RP_TEST_REVISION,pinned);assert.equal(apiBody.requests.length,2);

 for(const response of [null,{commit:{sha:"<script>"}},{commit:{sha:"main"}}]){
  const h=run();await flush();h.requests[0].respond(response);await flush();assert.equal(h.ctx.PRISM_RP_TEST_REVISION,pinned);immutable(h,pinned);
 }
 const rejected=run();await flush();rejected.requests[0].fail();await flush();assert.equal(rejected.ctx.PRISM_RP_TEST_REVISION,pinned);
 rejected.requests[1].respond('window.PRP={};window.PRISM_RP_VERSION="test";');await flush();assert.match(rejected.badge.textContent,/SHA сборки отсутствует/);

 const allStalled=run();await flush();await allStalled.tick(45000);assert.equal(allStalled.requests.length,3);
 assert.match(allStalled.boot.textContent,/оба источника недоступны или не ответили вовремя/);assert.equal(allStalled.timers.size,0);assert.equal(allStalled.scripts.length,0);
 allStalled.requests[1].respond(good);allStalled.requests[2].respond(good);await flush();assert.equal(allStalled.ctx.__boots,undefined);

 const http=run();await apiOk(http);http.requests[1].headers(503);await flush();http.requests[2].headers(404);await flush();assert.match(http.boot.textContent,/оба источника недоступны/);assert.equal(http.scripts.length,0);

 for(const code of ["<html>not javascript</html>",good+'throw new Error("startup failed");',""]){
  const h=run();await apiOk(h);h.requests[1].respond(code);await flush();assert.match(h.boot.textContent,/приложение не инициализировалось/);
  assert.equal(h.requests.length,2,"never retry after executing potentially partial code");assert.equal(h.scripts.length,1);
 }
 const inTime=run();await flush();await inTime.tick(4999);inTime.requests[0].respond({commit:{sha}});await flush();await inTime.tick(19999);
 inTime.requests[1].respond(good);await flush();await inTime.tick(100000);assert.equal(inTime.ctx.__boots,1);assert.equal(inTime.requests.length,2);assert.equal(inTime.timers.size,0);
 console.log("Test mirror checks: isolation, immutable refs, bounded headers/body, abort, late results, single execution and startup errors — OK");
})().catch(e=>{console.error(e);process.exitCode=1;});
