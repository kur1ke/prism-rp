"use strict";
// Imported fields remain literal data at HTML boundaries, including streaming paths.
const assert=require("node:assert/strict");
const path=require("node:path");
for(const file of ["core/util","core/settings","chat/tree","providers/openai","images/compose",
  "assist/assist","ui/render","ui/views/kit","ui/views/chat","ui/views/assist","ui/views/settings"])
 require(path.join(__dirname,"../js",file+".js"));
const P=globalThis.PRP, V=P.views, esc=P.render.esc;
const attack='id"><img src=x onerror="window.__f23=1">';
const msg=()=>({id:"message",role:"assistant",createdAt:1,swipeIdx:0,swipes:[{text:"SAFE_TEXT",createdAt:1}]});
const model=()=>({path:[msg()],chat:{id:"chat",mode:"rp"},card:{name:"Character"},persona:{name:"User"},
 settings:P.util.clone(P.settings.DEFAULTS),providers:[],provider:null,imgUrls:{},msTz:"UTC"});
let count=0;
function safe(html,expected){
 assert.ok(!html.includes(attack),"untrusted value escaped its HTML boundary");
 assert.ok(!html.includes("<img src=x"),"import must not introduce an executable element");
 assert.ok(html.includes(expected),"literal value must be retained");
 count++;
}
let m=model();m.path[0].id=attack;
safe(V.feed(m),'id="text-'+esc(attack)+'"');
m.gen={msgId:attack,raw:"LIVE_TEXT"};
safe(V.feed(m),'id="text-'+esc(attack)+'"');
m.chat.mode="messenger";
safe(V.feed(m),'id="text-'+esc(attack)+'"');
m=model();m.path=[];m.gen={opening:true,msgId:attack,raw:"LIVE_OPENING"};
safe(V.feed(m),'id="text-'+esc(attack)+'"');
m=model();m.path=[];m.chat.mode="messenger";m.gen={initiative:true,msgId:attack,raw:"LIVE_INITIATIVE"};
safe(V.feed(m),'id="text-'+esc(attack)+'"');
for(const status of ["pending","done"]){
 for(const fields of [{ratio:attack},{w:attack,h:1},{seed:attack}]){
  m=model();m.path[0].swipes[0].images=[{id:"image",status,ratio:"1:1",...fields}];
  // Pending placeholders do not display seed.
  if(status==="pending"&&fields.seed)continue;
  safe(V.feed(m),esc(attack));
 }
}
for(const field of ["id","role"]){
 m=model();m.assist={title:"Assistant",ctx:{},messages:[{id:"answer",role:"assistant",text:"**SAFE_ANSWER**",[field]:attack}]};
 safe(V.assist(m),esc(attack));
}
for(const key of ["temperature","top_p","min_p","top_k","repetition_penalty","max_tokens"]){
 m=model();m.settings.sampler[key]=attack;
 safe(V.settingsModal(m,"gen"),esc(attack));
}
for(const key of ["contextTokens","worldLimit","proseSize"]){
 m=model();m.settings[key]=attack;
 safe(V.settingsModal(m,key==="proseSize"?"look":"gen"),esc(attack));
}
m=model();m.path[0].id='id & "quoted" <literal>';
assert.ok(V.feed(m).includes('id="text-'+esc(m.path[0].id)+'"'));
assert.ok(V.feed(model()).includes('id="text-message"'));
console.log(count+" imported HTML boundary checks passed; ordinary IDs remain unchanged");
