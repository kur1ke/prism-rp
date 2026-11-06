"use strict";
const assert = require('node:assert/strict');
const B = require('../js/core/backup.js'), T = require('../js/chat/tree.js');
const msg = (id, parentId = null) => ({id, parentId, chatId:'h', createdAt:0});
const backup = messages => ({cards:[{id:'c'}],chats:[{id:'h',cardId:'c'}],messages});
assert.equal(B.check(backup({})).fatal,false,'non-array collection follows existing import handling');
for (const messages of [[msg('a','a')], [msg('a','b'),msg('b','a')],
  [msg('root'),msg('a','b'),msg('b','a'),msg('tail','a')]]) {
  const original=JSON.stringify(messages), result=B.check(backup(messages));
  assert.equal(result.fatal,true);
  assert.ok(result.issues.some(i=>i.code==='message-cycle'));
  assert.equal(JSON.stringify(messages),original,'validation must not rewrite source');
}
const existing={cards:['c'],chats:['h'],messages:[msg('a'),msg('b','a')]};
assert.equal(B.check(backup([msg('a','b')]),{replace:false,existing}).fatal,true,'merged edges form cycle');
assert.equal(B.check(backup([msg('a')]),{replace:false,existing}).fatal,false);
assert.equal(B.check(backup([msg('a','b')]),{replace:true,existing}).fatal,false,'replace ignores local edges');
const valid=[msg('r'),msg('a','r'),msg('b','r'),msg('c','b')];
assert.equal(B.check(backup(valid)).fatal,false);
assert.deepEqual(T.descendants(valid,'r'),['a','b','c']);
assert.equal(T.latestLeaf(valid,'r'),'c');
assert.equal(T.latestLeaf(valid,'c'),'c');
// Run unsafe traversals in a bounded subprocess: regression cannot hang CI.
const {spawnSync}=require('node:child_process');
const child=spawnSync(process.execPath,['-e',`
 const assert=require('node:assert/strict'),T=require(${JSON.stringify(require.resolve('../js/chat/tree.js'))});
 const self=[{id:'a',parentId:'a'}];
 assert.deepEqual(T.descendants(self,'a'),[]);assert.equal(T.latestLeaf(self,'a'),null);
 const cycle=[{id:'a',parentId:'b',createdAt:0},{id:'b',parentId:'a',createdAt:0},{id:'tail',parentId:'b',createdAt:-1}];
 assert.deepEqual(T.descendants(cycle,'a'),['b','tail']);assert.equal(T.latestLeaf(cycle,'a'),null);
`],{timeout:2000,encoding:'utf8'});
assert.equal(child.status,0,child.error?.message||child.stderr);
const deep=Array.from({length:20000},(_,i)=>msg('n'+i,i?'n'+(i-1):null));
assert.equal(B.check(backup(deep)).fatal,false,'iterative validation handles deep histories');
deep[0].parentId=deep.at(-1).id;
assert.equal(B.check(backup(deep)).fatal,true);
console.log('A07 backup cycle validation and bounded tree traversal: PASS');
