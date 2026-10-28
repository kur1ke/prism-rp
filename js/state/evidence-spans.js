/* PrismRP — immutable observation source spans.
   The RP observer selects IDs, never copies literal evidence. The runtime
   slices the ORIGINAL source and pins UTF-16 offsets for swipe-local replay.
   Pure module: no provider, DB, network, UI or memory authority. */
(function(root) {
  "use strict";
  const PRP=root.PRP=root.PRP||{};
  const MAX=48, MAX_LEN=420;
  function chunks(source,kind) {
    const text=String(source||"");
    const out=[];
    let begin=0;
    function add(a,b){
      while(a<b&&/\s/u.test(text[a]))a++;
      while(b>a&&/\s/u.test(text[b-1]))b--;
      if(a>=b||out.length>=MAX)return;
      const idx=out.filter(x=>x.kind===kind).length;
      out.push({id:(kind==="draw"?"D":"T")+idx,kind,start:a,end:b,text:text.slice(a,b)});
    }
    // Clause-independent sentences keep the actual predicate, its garment and
    // any negation in the same fragment. Only overlong sentences are divided
    // at punctuation/whitespace with exact offsets; no synthetic paraphrase.
    for(let i=0;i<=text.length;i++){
      const stop=i===text.length||/[.!?。！？;\n]/u.test(text[i]);
      if(!stop)continue;
      let end=i===text.length?i:i+1;
      let a=begin;
      while(end-a>MAX_LEN){
        let p=-1;
        for(let j=a+MAX_LEN;j>Math.max(a,a+120);j--){
          if(/[,،\s]/u.test(text[j])){p=j+1;break;}
        }
        if(p<0)p=a+MAX_LEN;
        add(a,p);a=p;
      }
      add(a,end);begin=end;
    }
    return out;
  }
  function catalog(opts){
    const o=opts||{};
    // These are the exact input slices Observer sees, not historical text.
    return chunks(String(o.text||"").slice(0,4500),"text")
      .concat(chunks(String(o.draw||"").slice(0,1600),"draw"));
  }
  function resolve(sourceId,options){
    if(typeof sourceId!=="string"||!new RegExp("^[TD][0-9]{1,2}$").test(sourceId))
      return {error:"invalid-source-id"};
    const row=catalog(options).find(x=>x.id===sourceId);
    return row?{span:{kind:row.kind,start:row.start,end:row.end},
      evidence:row.text}:{error:"unknown-source-id"};
  }
  function validate(event,source){
    if(!event||!event.sourceSpan)return null;
    const span=event.sourceSpan;
    if(!span||typeof span!=="object"||Array.isArray(span)||
       !["draw","text"].includes(span.kind)||
       !Number.isInteger(span.start)||!Number.isInteger(span.end)||
       span.start<0||span.end<=span.start||span.end-span.start>MAX_LEN)
      return "некорректная адресная цитата";
    if(span.kind==="draw"&&event.evidenceType!=="draw")
      return "тип адресной цитаты не соответствует DRAW";
    if(span.kind==="text"&&event.evidenceType!=null)
      return "адресная цитата текста не соответствует источнику";
    if(!source)return "нет источника адресной цитаты";
    const draws=Array.isArray(source.draws)?source.draws:[];
    const index=event.drawIndex==null?draws.length-1:event.drawIndex;
    const original=span.kind==="draw"?draws[index]&&draws[index].prompt:source.text;
    if(typeof original!=="string"||original.slice(span.start,span.end)!==event.evidence)
      return "адресная цитата не принадлежит исходному сообщению";
    // Prove the offsets correspond to a real app-created fragment (not a
    // model-chosen arbitrary span), including across continued DRAW replays.
    const known=chunks(original,span.kind).some(x=>
      x.start===span.start&&x.end===span.end&&x.text===event.evidence);
    return known?null:"адресная цитата не совпадает с фрагментом источника";
  }
  PRP.evidenceSpans={catalog,resolve,validate,MAX,MAX_LEN};
  if(typeof module!=="undefined"&&module.exports)module.exports=PRP.evidenceSpans;
})(typeof window!=="undefined"?window:globalThis);
