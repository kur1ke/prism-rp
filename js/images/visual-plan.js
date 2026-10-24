/* PrismRP VC-01/02 — transient, branch-scoped image garment plan.
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

  const sameItem = (a, b) => String(a || "").toLowerCase().replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim() === String(b || "").toLowerCase().replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  // VC-02: Only validated source-swipe events can confirm that a REMOVED
  // item is simultaneously visible OFF the body in this exact image.
  // The folded canonical fact must point back to that same event; a copied
  // event from another branch or an edited source draw never qualifies.
  function offBodyEvidence(wear, source, events, draw) {
    if (!wear || !source || !draw || !Array.isArray(events)) return [];
    const accepted = [];
    for (const event of events.slice(0, 6)) {
      if (!event || event.actor !== "char" || event.field !== "wear" ||
          event.action !== "remove" || event.frameRole !== "off-body" ||
          event.evidenceType !== "draw" || event.visualScope !== "current-self" ||
          event.certainty === "intent" || !Array.isArray(event.value) ||
          event.value.length !== 1 || !event.evidence || !draw.includes(event.evidence)) continue;
      const known = wear.removed.find((item) => sameItem(item.item, event.value[0]) &&
        item.source && item.source.messageId === source.messageId &&
        Number(item.source.swipeIdx || 0) === source.swipeIdx &&
        item.source.evidence === event.evidence && item.source.evidenceType === "draw");
      if (known && !accepted.some((x) => sameItem(x.item, known.item)))
        accepted.push({ item: known.item, evidence: event.evidence });
    }
    return accepted;
  }

  function create(input) {
    const o = input || {};
    const owner = !!o.owner || !!o.cameraOwner;
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
    // "Removed from the body" and "absent from the frame" are distinct.
    // Authored photo object evidence can put a removed garment off-body.
    // Never emit a global absence tag before subject- and object-scoping is
    // proven by the structured final compilation (VC-03).
    const authored = !!o.shotAuthored;
    const result = {
      actor: owner ? "char" : null,
      source: source || null,
      shotAuthored: authored,
      wear,
      onBodyCandidates: wear ? wear.worn.concat(wear.partiallyWorn).map((x) => x.item) : [],
      absentFromBody: wear ? wear.removed.map((x) => x.item) : [],
      offBodyVisible: owner && authored ? offBodyEvidence(wear, source, o.currentEvents, String(o.draw || "")) : [],
      allowGlobalGarmentNegative: owner && !authored,
    };
    return freeze(result);
  }

  PRP.visualPlan = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.visualPlan;
})(typeof window !== "undefined" ? window : globalThis);
