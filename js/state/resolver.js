/* Prism RP — one read-only projection of the selected-path StateTracker snapshot.
   No scene/World writes, no state extraction, no independent storage or authority.
   The caller supplies one already-resolved snapshot for an exact path/swipe.
   Legacy Messenger Environment remains an input baseline, not a competing
   store of extracted state events. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const clone = (v) => JSON.parse(JSON.stringify(v));

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
    out.visualWearRemoved = clone(known.visualWearRemoved || []);
    out.visualWearPartial = clone(known.visualWearPartial || []);
    out.intentions = clone(known.intentions || []);
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
        if (actor.fields[field]) projected[target] = clone(actor.fields[field].value == null ? (field === "wear" ? [] : "") : actor.fields[field].value);
      }
      // Only materialize an actor if they were already present in the scene or
      // have state facts. Do not invent an extra actor in a POV image.
      if (out.chars[name] || SCENE_FIELDS.some(([field]) => actor.fields[field])) out.chars[name] = projected;
    }
    return out;
  }

  function wearFacts(tracked) {
    if (!tracked || !tracked.state || !tracked.state.actors) return [];
    return ["char", "user"].map((actor) => ({
      actor,
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
  PRP.stateResolver = { world, scene, wearFacts, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.stateResolver;
})(typeof window !== "undefined" ? window : globalThis);
