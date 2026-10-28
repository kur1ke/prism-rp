/* PrismRP — WearObservationResolver
   Observation (quoted text/DRAW) -> unique garment identity in active branch.
   Pure module. No provider, database, renderer, or secondary wardrobe.
   Never invent an action, a garment or a reference. */
(function(root) {
  "use strict";
  const PRP=root.PRP=root.PRP||{};
  const str=x=>String(x==null?"":x).trim();
  const tokens=s=>(str(s).toLowerCase().replace(/ё/g,"е").match(/[\p{L}\p{N}]+/gu)||[]);
  function stem(word) {
    const w=str(word).toLowerCase().replace(/ё/g,"е");
    if(w.length<=3)return w;
    const out=w.replace(/(?:ого|его|ому|ему|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ую|юю|ых|их|ым|им|ой|ей|ом|ем|а|я|у|ю|ы|и|е)$/u,"");
    return out.length>=3?out:w;
  }
  const stems=s=>tokens(s).filter(x=>x.length>=3).map(stem);
  const similar=(a,b)=>a===b||(Math.min(a.length,b.length)>=4&&
    a.slice(0,Math.min(a.length,b.length)-1)===b.slice(0,Math.min(a.length,b.length)-1));
  const contains=(all,word)=>all.some(w=>similar(w,word));
  // Diagnostic-only active-path identities; no source evidence or model data
  // becomes an instruction, selected garment or new inventory.
  const candidates=refs=>(refs||[]).slice(0,6)
    .filter(ref=>ref&&typeof ref.id==="string"&&typeof ref.item==="string")
    .map(ref=>({id:ref.id.slice(0,48),item:ref.item.slice(0,160),
      // Origin of the existing branch fact, not a new identity claim.
      ...(ref.source ? {origin:{
        kind:String(ref.source.kind||"").slice(0,32),
        messageId:String(ref.source.messageId||"").slice(0,64),
        swipeIdx:Number.isInteger(ref.source.swipeIdx)?ref.source.swipeIdx:0,
      }} : {}),
    }));
  // The short noun phrase must match a SINGLE current garment, including
  // all stated attributes. One matching colour alone is never a garment.
  function match(mention,refs) {
    const observed=stems(mention);
    if(!observed.length)return {reason:"empty-mention"};
    // The observed noun is at the end of the noun phrase, whereas the
    // canonical item may have qualifiers after it (e.g. "блузка с рукавом").
    // A bare adjective is not a garment identity.
    const rawWords=tokens(mention);
    if(/(?:ая|яя|ую|юю|ый|ий|ое|ее|ой|ей|ых|их|ым|им)$/iu.test(rawWords[rawWords.length-1]||""))
      return {reason:"missing-garment-noun"};
    const eligible=(refs||[]).filter(ref=>{
      if(!ref||typeof ref.item!=="string")return false;
      const known=stems(ref.item);
      if(!known.length||!contains(known,observed[observed.length-1]))return false;
      return observed.every(word=>contains(known,word));
    });
    return eligible.length===1?{reference:eligible[0]}:
      {reason:eligible.length?"ambiguous-garment":"unknown-garment",
        ...(eligible.length>1?{candidates:candidates(eligible)}:{})};
  }
  // A canonical garment can contain additional nouns after a preposition
  // ("блузка с коротким рукавом"). Anchor an abbreviated quote to the
  // garment's leading noun, never to a shared adjective ("белом белье").
  // This is a lexical guard, not a per-character clothing dictionary.
  function garmentHead(item) {
    const lead=str(item).split(/\s+(?:с|со|без|из|для|на|в|под)\s+/iu)[0];
    const words=tokens(lead), qualifier=/(?:ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ую|юю|ых|их|ым|им)$/iu;
    const russian=/[а-яё]/iu.test(lead);
    // Skip compound-colour prefixes such as "светло-розовая"; keep the
    // first nominal token in "юбка-плиссе", not its trailing descriptor.
    const noun=russian?words.find((word,i)=>word.length>=3&&!qualifier.test(word)&&
      !(i+1<words.length&&qualifier.test(words[i+1]))):
      words.slice().reverse().find(word=>word.length>=3);
    return noun?stem(noun):null;
  }
  // Transitional compatibility for Observer models that return the known
  // full name instead of a short literal quote. Derive only the contiguous
  // noun phrase immediately supported by the evidence. Explicit itemMention
  // is preferred; no free-form fuzzy guessing of arbitrary nouns.
  function phrase(evidence,ref) {
    const words=stems(ref.item),raw=str(evidence),head=garmentHead(ref.item);
    if(!head)return null;
    const spans=[...raw.matchAll(/[\p{L}\p{N}]+/gu)].map(m=>({
      text:m[0],stem:stem(m[0]),start:m.index,end:m.index+m[0].length
    }));
    const matches=[];
    for(let i=0;i<spans.length;i++){
      if(!similar(head,spans[i].stem))continue;
      if(/(?:ая|яя|ую|юю|ый|ий|ое|ее|ой|ей|ых|их|ым|им)$/iu.test(spans[i].text))continue;
      let first=i;
      while(first>0&&i-first<5&&contains(words,spans[first-1].stem))first--;
      // The immediately preceding descriptive word cannot silently conflict
      // with the existing item's attributes. Reject instead of picking a
      // known white blouse for an explicitly red blouse.
      if(first===i&&i>0&&/(?:ая|яя|ую|юю|ый|ий|ое|ее|ой|ей|ых|их|ым|им)$/iu.test(spans[i-1].text))
        continue;
      matches.push(raw.slice(spans[first].start,spans[i].end));
    }
    return matches.length===1?matches[0]:null;
  }
  // Resolve model's *semantic* garment label to a literal noun phrase in
  // the selected app-owned fragment. The model never has to copy declension
  // or adjectives verbatim. We still reject conflicting model attributes.
  function sourcePhrase(evidence,named){
    const raw=str(evidence),words=stems(named),terms=tokens(named);
    if(!words.length||!terms.length)return null;
    const noun=words[words.length-1];
    const spans=[...raw.matchAll(/[\p{L}\p{N}]+/gu)].map(m=>({
      text:m[0],start:m.index,end:m.index+m[0].length,stem:stem(m[0])
    }));
    const found=[];
    for(let i=0;i<spans.length;i++){
      if(!similar(spans[i].stem,noun))continue;
      let a=i;
      while(a>0&&i-a<5&&(
        contains(words,spans[a-1].stem) ||
        /(?:ая|яя|ую|юю|ый|ий|ое|ее|ой|ей|ых|их|ым|им|ом|ем)$/iu.test(spans[a-1].text)
      ))a--;
      const phrase=raw.slice(spans[a].start,spans[i].end);
      if(match(named,[{item:phrase}]).reference)found.push(phrase);
    }
    return found.length===1?found[0]:null;
  }
  function resolve(candidate,options) {
    const e=candidate||{},o=options||{};
    if(e.field!=="wear"||!["remove","adjust","add"].includes(e.action)||
       e.referenceId!=null||e.reference||e.evidenceType==="wear-inquiry")
      return {event:e,skipped:true};
    const src=e.evidenceType==="draw"?o.draw:o.text;
    const evidence=str(e.evidence);
    if(typeof src!=="string"||!evidence||!src.includes(evidence))return {event:e,skipped:true};
    const list=Array.isArray(e.value)?e.value:[];
    if(list.length!==1)return {event:e,skipped:true};
    const named=str(list[0]),refs=(Array.isArray(o.references)?o.references:[])
      .filter(x=>x&&x.actor===e.actor&&x.field==="wear"&&x.action===e.action);
    if(e.sourceSpan){
      // Indexed evidence is already the exact substring of the current
      // authored source. Derive short literal mentions from it, not the
      // untrusted model's optional itemMention or grammatical phrasing.
      const found=refs.map(ref=>({ref,mention:phrase(evidence,ref)}))
        .filter(x=>x.mention&&(named===x.ref.item||
          match(named,[x.ref]).reference));
      if(found.length>1)return {unresolved:"Разрешение предмета: ambiguous-garment",
        reason:"ambiguous-reference",candidates:candidates(found.map(x=>x.ref))};
      if(found.length===1){
        const valid=match(found[0].mention,refs);
        if(!valid.reference)return {unresolved:"Разрешение предмета: "+valid.reason,
          reason:valid.reason,...(valid.candidates?{candidates:valid.candidates}:{})};
        return {event:{...e,value:[found[0].ref.item],reference:found[0].ref,
          itemMention:found[0].mention},resolved:true};
      }
      if(e.action==="add"){
        const literal=sourcePhrase(evidence,named);
        if(literal)return {event:{...e,value:[literal]},resolved:true};
      }
      // Explain the failed boundary without promoting an unsupported fact.
      // The same error text formerly hid a wrong sourceId, a missing prior
      // reference, and a lexical parsing failure. Keep these distinct in Debug.
      const literal=sourcePhrase(evidence,named);
      return {unresolved:"Названный предмет не подтверждён выбранным исходным фрагментом",
        reason:literal ? "garment-not-in-current-references" :
          refs.length ? "source-has-no-matching-garment" : "unrecognized-garment-in-source"};
    }
    if(!refs.length){
      const plain={...e};delete plain.itemMention;
      return {event:plain,skipped:true};
    }
    // Do not rewrite a new garment into an old identity. The model's value
    // must either be literally quoted or exactly name a branch-local item.
    const exactValue=evidence.includes(named);
    const explicit=e.itemMention!=null?str(e.itemMention):null;
    if(explicit!=null&&(!explicit||!evidence.includes(explicit)))
      return {unresolved:"itemMention не подтверждён точной цитатой"};
    let mention=explicit||(exactValue?named:null);
    if(!mention){
      const exact=refs.filter(x=>str(x.item)===named);
      if(exact.length!==1)return {event:e,skipped:true};
      mention=phrase(evidence,exact[0]);
      if(!mention)return {unresolved:"Нет однозначного упоминания известной вещи в цитате"};
    }
    const found=match(mention,refs);
    if(!found.reference){
      // An explicitly new garment, with no matching reference, can still
      // be added by existing grounded validation.
      if(e.action==="add"&&found.reason==="unknown-garment"&&exactValue) {
        // A genuinely new garment has no old reference: don't turn the
        // resolver into an outfit lock. Leave its literal wear.add to the
        // existing source-grounded Tracker path.
        const novel={...e};delete novel.itemMention;
        return {event:novel,skipped:true};
      }
      return {unresolved:"Разрешение предмета: "+found.reason,
        ...(found.candidates?{candidates:found.candidates}:{})};
    }
    // Only an exact branch-local ref can override the model's surface name.
    if(!exactValue&&named!==found.reference.item)
      return {unresolved:"Полное название не соответствует выбранному предмету"};
    return {event:{...e,value:[found.reference.item],
      reference:found.reference,itemMention:mention},resolved:true};
  }
  function proof(mention,evidence,reference) {
    if(typeof mention!=="string"||!mention.trim()||
       typeof evidence!=="string"||!evidence.includes(mention)||
       !reference||typeof reference.item!=="string")return false;
    const result=match(mention,[reference]);
    return !!result.reference;
  }
  PRP.wearObservation={resolve,match,proof,phrase,stems};
  if(typeof module!=="undefined"&&module.exports)module.exports=PRP.wearObservation;
})(typeof window!=="undefined"?window:globalThis);
