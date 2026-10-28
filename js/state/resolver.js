/* Prism RP — one read-only projection of the selected-path StateTracker snapshot.
   No scene/World writes, no state extraction, no independent storage or authority.
   The caller supplies one already-resolved snapshot for an exact path/swipe.
   Legacy Messenger Environment remains an input baseline, not a competing
   store of extracted state events. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TRACK = PRP.stateTracker || (typeof require !== "undefined" ? require("./tracker.js") : null);
  const TR = PRP.tree || (typeof require !== "undefined" ? require("../chat/tree.js") : null);
  const MT = PRP.messengerTime || (typeof require !== "undefined" ? require("../messenger/time.js") : null);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  // Freshness affects the *presentation* of remote reports, not the canon.
  // A past report cannot be offered as guaranteed current just because no
  // subsequent event overwrote it. Neither a new location nor activity is
  // invented from elapsed wall-clock time.
  const REPORT_STALE_MS = 2 * 60 * 60 * 1000;

  const WORLD_FIELDS = Object.freeze([
    "location", "activity", "visualWear", "visualPose", "visualHair",
    "nearby", "ongoing", "availability",
  ]);
  const SCENE_FIELDS = Object.freeze([
    ["wear", "wear"], ["pose", "pose"], ["hair", "visualHair"],
  ]);

  function world(base, tracked) {
    if (!base) return base;
    const out = clone(base);
    if (!tracked || !tracked.character) return out;
    const known = tracked.character;
    for (const field of WORLD_FIELDS) {
      if (known.fieldStatus && Object.prototype.hasOwnProperty.call(known.fieldStatus, field)) out[field] = clone(known[field]);
    }
    out.fieldStatus = clone(known.fieldStatus || {});
    // A later explicit outfit change can invalidate a legacy baseline even
    // when no replacement garments are known. Without this override the
    // legacyWorld visualWear would leak back into the new Messenger view.
    const wear = tracked.state && tracked.state.actors &&
      tracked.state.actors.char && tracked.state.actors.char.wearState;
    out.wearInvalidated = !!(wear && wear.invalidated);
    if (out.wearInvalidated) out.visualWear = [];
    // Closed-world starting outfit (and later explicit full wear.set) is not
    // equivalent to "unknown unspecified underlayers". Expose this *derived*
    // bit to Messenger's budgeted Prism view; no second inventory is stored.
    out.wearComplete = !!(tracked.state && tracked.state.actors &&
      tracked.state.actors.char && tracked.state.actors.char.wearState &&
      tracked.state.actors.char.wearState.complete);
    out.visualWearRemoved = clone(known.visualWearRemoved || []);
    out.visualWearPartial = clone(known.visualWearPartial || []);
    out.intentions = clone(known.intentions || []);
    // Latest authenticated on-body visual evidence is NOT a full outfit and
    // does not negate other known garment facts. It must be rendered distinctly
    // from the initial outfit to avoid presenting the origin as a new photo.
    out.latestPhotoWear = tracked.latestPhotoWear ? clone(tracked.latestPhotoWear) : null;
    out.latestAuthoredShot = tracked.latestAuthoredShot ? clone(tracked.latestAuthoredShot) : null;
    return out;
  }

  function messengerFreshness(base, path, now) {
    if (!base) return base;
    const out = clone(base);
    const timeline = Array.isArray(path) ? path : [];
    if (!Number.isFinite(now)) return out;
    for (const field of ["location", "activity"]) {
      const status = out.fieldStatus && out.fieldStatus[field];
      const source = status && status.source;
      if (!out[field] || !status || status.certainty !== "reported" ||
          !source || !source.messageId) continue;
      const msg = timeline.find((m) => m && m.id === source.messageId);
      if (!msg || (msg.swipeIdx || 0) !== (source.swipeIdx || 0)) continue;
      const sw = TR.activeSwipe(msg);
      const at = MT.toMs(sw && sw.messengerAt && sw.messengerAt.at);
      if (at == null || now < at || now - at < REPORT_STALE_MS) continue;
      // The exact quote still exists in canonical path state; only Messenger
      // status / prompt is downgraded to "last known". This is NOT a clear
      // event and must not affect Scene, Memory, swipes, or stored history.
      out.lastReported = out.lastReported || {};
      out.lastReported[field] = { value: out[field], at: MT.toIso(at), ageMs: now - at };
      out[field] = null;
    }
    return out;
  }

  function scene(base, tracked, names) {
    if (!base) return base;
    const out = clone(base);
    if (!tracked || !tracked.state || !tracked.state.actors) return out;
    out.chars = out.chars || {};
    for (const [actorId, name] of [["char", names && names.char], ["user", names && names.user]]) {
      if (!name) continue;
      const actor = tracked.state.actors[actorId];
      if (!actor || !actor.fields) continue;
      const previous = out.chars[name] || { wear: [], pose: "", mood: "" };
      const projected = Object.assign({}, previous);
      for (const [field, target] of SCENE_FIELDS) {
        const datum = TRACK.fieldOf(tracked.state, actorId, field);
        if (datum) projected[target] = clone(datum.value == null ? (field === "wear" ? [] : "") : datum.value);
      }
      // Materialize from canonical fields, not a possibly stale compatibility
      // mirror. Unknown wear must not create a fictional actor in a POV shot.
      if (out.chars[name] || SCENE_FIELDS.some(([field]) => TRACK.fieldOf(tracked.state, actorId, field))) out.chars[name] = projected;
    }
    return out;
  }

  function wearFacts(tracked) {
    if (!tracked || !tracked.state || !tracked.state.actors) return [];
    return ["char", "user"].map((actor) => ({
      actor,
      known: !!(tracked.state.actors[actor] && tracked.state.actors[actor].wearState && tracked.state.actors[actor].wearState.known),
      complete: !!(tracked.state.actors[actor] && tracked.state.actors[actor].wearState && tracked.state.actors[actor].wearState.complete),
      worn: clone((tracked.state.actors[actor] && tracked.state.actors[actor].wearState &&
        tracked.state.actors[actor].wearState.worn) || []),
      removed: clone((tracked.state.actors[actor] && tracked.state.actors[actor].wearState &&
        tracked.state.actors[actor].wearState.removed) || []),
      partiallyWorn: clone((tracked.state.actors[actor] && tracked.state.actors[actor].wearState &&
        tracked.state.actors[actor].wearState.partiallyWorn) || []),
    }));
  }

  function resolve(o) {
    const input = o || {};
    return {
      scene: scene(input.scene, input.tracked, input.names),
      world: world(input.world, input.tracked),
      wearFacts: wearFacts(input.tracked),
    };
  }
  PRP.stateResolver = { world, messengerFreshness, REPORT_STALE_MS, scene, wearFacts, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.stateResolver;
})(typeof window !== "undefined" ? window : globalThis);
