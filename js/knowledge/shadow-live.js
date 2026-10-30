/* K1.5: explicit, read-only live shadow evaluation; provider is injected. */
(function(root){
"use strict";
const P=root.PRP=root.PRP||{};
const I=P.knowledgeInterpreter||(typeof require!=="undefined"?require("./interpreter.js"):null);
const K=P.knowledgeCore||(typeof require!=="undefined"?require("./core.js"):null);
function classify(e){
 const m=String(e&&e.message||"").toLowerCase();
 if(e&&e.name==="AbortError")return "generator-aborted";
 if(/instruction-budget-exceeded/.test(m))return "instruction-budget-exceeded";
 if(/ai-text-plugin.*недоступен/.test(m))return "plugin-unavailable";
 if(/cors/.test(m))return "provider-cors";
 if(/429|rate.limit/.test(m))return "provider-rate-limited";
 if(/timeout|timed.out|время ожидания/.test(m))return "provider-timeout";
 if(/context|token|too.long|length/.test(m))return "provider-context-rejected";
 if(e&&Number.isInteger(e.status))return "provider-http-"+String(e.status);
 const n=e&&e.name;
 if(n==="TypeError")return "provider-type-error";
 if(n==="SyntaxError")return "provider-syntax-error";
 if(n==="RangeError")return "provider-range-error";
 return "generator-failed";
}
function fail(error){return {status:"unprocessed",error,committable:false,assertions:[],links:[],unresolved:[],issues:[error]};}
async function run(input,generate){
 if(!input||typeof input.chatId!=="string"||!input.chatId.trim()||
    !Array.isArray(input.path)||input.path.length>500||
    typeof generate!=="function")return {error:"invalid-shadow-input",rows:[]};
 let path;
 try{path=JSON.parse(JSON.stringify(input.path));}catch(_){return {error:"invalid-shadow-path",rows:[]};}
 if(path.some(m=>!m||m.chatId!==input.chatId||!Array.isArray(m.swipes)||
   !Number.isInteger(m.swipeIdx||0)||(m.swipeIdx||0)<0||
   (m.swipeIdx||0)>=m.swipes.length))
   return {error:"invalid-shadow-path",rows:[]};
 const assertions=[],links=[],outputs={},rows=[];
 const counts={ok:0,"no-changes":0,partial:0,unprocessed:0};
 for(let i=0;i<path.length;i++){
   const message=path[i];
   const req=I.prepare({chatId:input.chatId,path:path.slice(0,i+1),
     messageId:message.id,priorAssertions:assertions,priorLinks:links});
   let result,raw=null,elapsedMs=0,instructionChars=0;
   if(req.error)result=fail(req.error);
   else{
     const start=Date.now();
     try{
       const reply=await generate(req.instruction,{chatId:input.chatId,
         messageId:message.id,swipeIdx:req.swipeIdx,revision:req.revision});
       raw=typeof reply==="string"?reply:
         reply&&typeof reply.text==="string"?reply.text:
         reply&&typeof reply.generatedText==="string"?reply.generatedText:null;
       result=I.interpret(req,raw);
     }catch(e){result=fail(classify(e));}
     elapsedMs=Date.now()-start;
     if(raw!==null)outputs[message.id+":"+req.swipeIdx]={revision:req.revision,raw};
   }
   counts[result.status]++;
   if(result.committable){assertions.push(...result.assertions);links.push(...result.links);}
   rows.push({messageId:message.id,swipeIdx:message.swipeIdx||0,
     revision:req.error?null:req.revision,status:result.status,elapsedMs,instructionChars,
     issues:result.issues.slice(),unresolved:result.unresolved.slice(),
     proposedAssertions:result.assertions.length,proposedLinks:result.links.length});
   // One transport failure makes the remaining calls uninformative and costly.
   if(result.status==="unprocessed" && result.issues.some(x=>
      /^(generator-|plugin-unavailable|provider-|instruction-budget-exceeded)/.test(x)))break;
 }
 const projection=K.evaluate({chatId:input.chatId,path,assertions,links});
 const replay=I.replay({chatId:input.chatId,path,outputs});
 return {experimental:true,rows,counts,assertions,links,outputs,projection,
   replayConsistent:JSON.stringify(replay.projection)===JSON.stringify(projection)};
}
P.knowledgeLiveShadow={run};
if(typeof module!=="undefined"&&module.exports)module.exports=P.knowledgeLiveShadow;
})(typeof window!=="undefined"?window:globalThis);
