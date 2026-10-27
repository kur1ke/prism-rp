/* PrismRP VC-01 — transient, branch-scoped image garment plan.
   No persistence, model calls, state transitions, inventory, or scene authority.
   Unknown body state cannot be fabricated from a crop or missing tag. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const bounded = (rows) => (Array.isArray(rows) ? rows : []).slice(0, 12).map(clone);
  function freeze(v) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
    return v;
  }

  function create(input) {
    const o = input || {};
    const owner = !!o.owner;
    const fact = owner && Array.isArray(o.wearFacts)
      ? o.wearFacts.find((item) => item && item.actor === "char") : null;
    const wear = fact ? {
      known: !!fact.known,
      complete: !!fact.complete,
      worn: bounded(fact.worn),
      partiallyWorn: bounded(fact.partiallyWorn),
      removed: bounded(fact.removed),
    } : null;
    const source = o.source && {
      chatId: String(o.source.chatId || ""),
      messageId: String(o.source.messageId || ""),
      swipeIdx: Number(o.source.swipeIdx) || 0,
    };
    const authored = !!o.shotAuthored;
    // VC-02: only exact author-shot evidence, bound to the SAME source text,
    // may place a removed garment visibly off the body. Role metadata never
    // changes wearState and cannot promote an unknown garment to removed.
    const shot = String(o.draw || "");
    const frameObjects = Array.isArray(o.frameObjects) ? o.frameObjects : [];
    const offBodyVisible = wear && authored && shot
      ? frameObjects.slice(0, 6).filter(x => x && x.role === "offBody" &&
          typeof x.item === "string" && typeof x.evidence === "string" &&
          x.evidence.length > 0 && x.evidence.length <= 300 && shot.includes(x.evidence) &&
          wear.removed.some(g => g.item === x.item))
        .map(x => ({ role: "offBody", item: x.item, evidence: x.evidence })) : [];
    // "Removed from the body" and "absent from the frame" are distinct.
    // Until the Observer supplies typed, evidence-validated frame object roles
    // (VC-02), an authored photo MUST NOT generate a global garment negative:
    // that same garment may be held or lying on the bed.
    const result = {
      actor: owner ? "char" : null,
      source: source || null,
      shotAuthored: authored,
      wear,
      onBodyCandidates: wear ? wear.worn.concat(wear.partiallyWorn).map((x) => x.item) : [],
      absentFromBody: wear ? wear.removed.map((x) => x.item) : [],
      offBodyVisible,
      allowGlobalGarmentNegative: owner && !authored && !offBodyVisible.length,
    };
    return freeze(result);
  }


  // A mirror selfie is one human subject reflected once, not two humans.
  // This is source-shot metadata; a translator cannot create this mode.
  function singleMirror(shot, actors) {
    const src = String(shot || "");
    const mirrorPhoto = /\b(?:mirror[\s_-]*(?:selfie|portrait|photo)|(?:selfie|portrait|photo(?:graph)?)[^.!?]{0,65}\b(?:in|at|before|by)\s+(?:(?:the|a)\s+)?mirror|(?:mirror|reflection)[^.!?]{0,65}\bselfie)\b|(?:селфи|фото|снимок|портрет)[^.!?]{0,65}(?:в|перед|у)\s+зеркал|(?:зеркальн(?:ое|ый|ая)\s+(?:селфи|фото|снимок))/iu.test(src);
    if (!mirrorPhoto) return false;
    const explicitPair = /\b(?:[2-9]\s*(?:girls?|boys?|people|persons?|women|men)|(?:two|three|several|multiple)\s+(?:girls?|boys?|people|persons?|women|men)|(?:another|second|other)\s+(?:girl|boy|person|woman|man)|(?:with|alongside)\s+(?:a\s+)?(?:friend|partner|companion|boyfriend|girlfriend))\b|(?:дв[аоеу]|тр[иое])\s+(?:девуш(?:ки|ек)|парн(?:я|ей)|человек(?:а)?|люд(?:ей|ьми))|(?:с\s+(?:подругой|другом|девушкой|парнем|партн[её]ром)|вдво[её]м|вместе\s+с\s+подруг)/iu.test(src);
    const namedCompanion = /\b(?:with|alongside|and)\s+(?:[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?|[a-z]{2,}_[a-z]{2,})\b|(?:^|[\s,])(?:с|и)\s+\p{Lu}\p{L}{2,}/u.test(src);
    const scope = actors || {};
    return !explicitPair && !namedCompanion && !scope.empty && !scope.user && !scope.otherActorPresent &&
      !/\b(?:[2-9](?:girls?|boys?)|1girl\s*,\s*1boy|1boy\s*,\s*1girl)\b/i.test(src);
  }

  // Visual Prompt Plan: an in-memory, source-scoped compilation contract.
  // Sections describe WHAT can contribute, not invented missing image details.
  // The authored shot itself stays in SCENE exactly once (ImageCompile).
  const ORDER = Object.freeze(["SUBJECT", "COMPOSITION", "POSE", "CLOTHING",
    "ENVIRONMENT", "LIGHTING", "TECHNICAL", "QUALITY"]);
  function prompt(input) {
    const o = input || {}, actors = o.actors || {};
    const plan = o.visualPlan || null;
    const owner = !!actors.owner, user = !!actors.user;
    const wear = owner ? (o.wearState || (plan && plan.actor === "char" && plan.wear) || null) : null;
    const format = ["tags", "hybrid", "description"].includes(o.format) ? o.format : "tags";
    return freeze({
      version: 1,
      source: plan && plan.source ? clone(plan.source) : null,
      order: ORDER.slice(),
      sections: {
        SUBJECT: { owner, user, otherActor: !!o.otherActorPresent, authority: "source-frame" },
        COMPOSITION: { authority: "source-shot", shotAuthored: !!o.shotAuthored,
          singleMirror: singleMirror(o.shot, { ...actors, otherActorPresent: !!o.otherActorPresent }) },
        POSE: { authority: "source-shot", fallback: !o.shotAuthored && !o.messenger ? "rp-scene" : null },
        CLOTHING: { authority: wear ? "canonical-wear" : "source-shot",
          known: !!(wear && wear.known), complete: !!(wear && wear.complete),
          removed: wear ? wear.removed.length : 0,
          partial: wear ? wear.partiallyWorn.length : 0,
          offBody: plan ? plan.offBodyVisible.length : 0 },
        ENVIRONMENT: { authority: "source-shot", messenger: !!o.messenger },
        LIGHTING: { authority: "source-shot" },
        TECHNICAL: { format, authority: "backend" },
        QUALITY: { authority: format === "hybrid" || o.qualityPinned ? "finalise" : "translator", pinned: !!o.qualityPinned }
      }
    });
  }
  // A compact field order replaces (rather than repeats) the legacy generic
  // ORDER line in the translator instructions. No image source text is copied.
  function promptOrder(plan) {
    if (!plan || plan.version !== 1 || !plan.sections) return "";
    const s = plan.sections;
    return [
      "VISUAL PROMPT PLAN — order of meaning only; output NO section headings or empty placeholders:",
      "SUBJECT: retain only source-depicted people; owner " + (s.SUBJECT.owner ? "visible" : "not established") +
        ", user " + (s.SUBJECT.user ? "visible" : "not established") + ". No extra or duplicate people; keep each person's traits distinct.",
      "COMPOSITION: preserve the source shot's medium, viewpoint, camera angle, framing, placement and perspective; never infer POV from owner identity." +
        (s.COMPOSITION.singleMirror ? " SINGLE-PERSON MIRROR PHOTO: the photographed person and their reflection are ONE subject, not two characters. Depict one person in the mirror, with no outside duplicate or second person beside the mirror." : ""),
      "POSE: preserve the main depicted ACTION first, then source-backed body orientation, head, hands, limbs and weight; omit absent details.",
      "CLOTHING: use visible source clothing and canonical wear constraints when provided; never infer removed or hidden layers from a crop.",
      "ENVIRONMENT: preserve only source-backed locations, objects and spatial relationships.",
      "LIGHTING: preserve source-backed light and shadows only; invent no lighting setup.",
      "TECHNICAL: backend owns optical settings; do not invent camera lenses, rendering parameters or LoRA.",
      "QUALITY: " + (s.QUALITY.authority === "finalise" ? "added or pinned by finalise; do not duplicate quality tags." : "keep only source quality or the minimal requested default tags; no filler.") + " No unsolicited style or anatomy tags.",
      "For " + s.TECHNICAL.format + " output, render the SAME evidence as requested prose/tags, without headings. " +
        (s.TECHNICAL.format === "tags" ? "Use subject-count tags only for explicitly depicted people; solo only for exactly one person." : "")
    ].join("\n");
  }
  PRP.visualPlan = { create, prompt, promptOrder, singleMirror };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.visualPlan;
})(typeof window !== "undefined" ? window : globalThis);
