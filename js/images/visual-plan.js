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
    // Until the Observer supplies typed, evidence-validated frame object roles
    // (VC-02), an authored photo MUST NOT generate a global garment negative:
    // that same garment may be held or lying on the bed.
    const authored = !!o.shotAuthored;
    const result = {
      actor: owner ? "char" : null,
      source: source || null,
      shotAuthored: authored,
      wear,
      onBodyCandidates: wear ? wear.worn.concat(wear.partiallyWorn).map((x) => x.item) : [],
      absentFromBody: wear ? wear.removed.map((x) => x.item) : [],
      offBodyVisible: [], // never inferred from REMOVED; VC-02 binds exact shot evidence.
      allowGlobalGarmentNegative: owner && !authored,
    };
    return freeze(result);
  }

  PRP.visualPlan = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.visualPlan;
})(typeof window !== "undefined" ? window : globalThis);
