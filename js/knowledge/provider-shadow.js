/* K1.5 optional adapter to the existing PRISM text transport.
   Explicit invocation only. No stored settings, memory writes or background calls. */
(function(root){
"use strict";
const P=root.PRP=root.PRP||{};
const MAX_MESSAGES=12;
const MAX_INPUT=24000;
function create(options){
 const o=options||{},llm=o.llm||P.llm;
 const provider=o.provider;
 if(!provider||!llm||typeof llm.simple!=="function")
   return {error:"provider-unavailable"};
 const maxTokens=Math.max(120,Math.min(1000,Number(o.maxTokens)||800));
 const generate=async(instruction,meta)=>{
   if(typeof instruction!=="string"||!instruction.trim()||instruction.length>MAX_INPUT)
     throw Error("instruction-budget-exceeded");
   return llm.simple(provider,instruction,{maxTokens});
 };
 return {generate,maxMessages:MAX_MESSAGES};
}
async function run(input,options){
 const adapter=create(options);
 if(adapter.error)return {error:adapter.error,rows:[]};
 if(!P.knowledgeLiveShadow||typeof P.knowledgeLiveShadow.run!=="function")
   return {error:"shadow-runner-unavailable",rows:[]};
 if(!input||!Array.isArray(input.path)||input.path.length>adapter.maxMessages)
   return {error:"shadow-message-budget-exceeded",rows:[]};
 return P.knowledgeLiveShadow.run(input,adapter.generate);
}
P.knowledgeProviderShadow={create,run};
if(typeof module!=="undefined"&&module.exports)module.exports=P.knowledgeProviderShadow;
})(typeof window!=="undefined"?window:globalThis);
