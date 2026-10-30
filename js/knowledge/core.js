/* PRISM Knowledge Core v0.1 — pure, read-only prototype.
   A selected chat path + source-bound assertions/links -> one factual projection.
   The core NEVER calls an LLM, reads IndexedDB, or grants prompt authority.
   No runtime integration while the legacy tracker owns the chat canon. */
(function (root) {
  "use strict";
  const PRP = root.PRP = root.PRP || {};
  const TIMES = new Set(["current", "past", "future", "unknown"]);
  const MODES = new Set(["established", "reported", "intended", "hypothetical"]);
  const KINDS = new Set(["single", "collection"]);
  const RELATIONS = new Set(["qualifies-time", "supersedes", "corroborates", "disputes"]);
  const MAX = { records: 500, quote: 1200, value: 4000 };
  const own = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
  const text = (v, max) => typeof v === "string" && v.length > 0 &&
    v.length <= (max || 200) && !!v.trim();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function valueKey(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(valueKey).join(",") + "]";
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + valueKey(v[k])).join(",") + "}";
  }
  function sourceAt(source, chatId, indexed) {
    if (!source || source.chatId !== chatId ||
        !text(source.messageId) || !Number.isInteger(source.swipeIdx) ||
        source.swipeIdx < 0 || !text(source.quote, MAX.quote)) return null;
    const selected = indexed.get(source.messageId);
    if (!selected || selected.message.chatId !== chatId ||
        selected.swipeIdx !== source.swipeIdx) return null;
    const sw = selected.swipe;
    if (source.kind === "text") {
      if (!String(sw.text || "").includes(source.quote)) return null;
    } else if (source.kind === "draw") {
      const index = source.drawIndex;
      if (!Number.isInteger(index) || index < 0 ||
          !Array.isArray(sw.draws) || !sw.draws[index] ||
          !String(sw.draws[index].prompt || "").includes(source.quote)) return null;
    } else return null;
    return selected.position;
  }
  function indexPath(path, chatId) {
    const index = new Map();
    for (const [position, message] of (path || []).entries()) {
      if (!message || message.chatId !== chatId || !text(message.id) ||
          !Array.isArray(message.swipes) || !Number.isInteger(message.swipeIdx || 0) ||
          message.swipeIdx < 0 || message.swipeIdx >= message.swipes.length ||
          index.has(message.id)) return null;
      index.set(message.id, {
        message, swipe: message.swipes[message.swipeIdx || 0],
        swipeIdx: message.swipeIdx || 0, position
      });
    }
    return index;
  }
  function validateFact(x, chatId) {
    if (!x || x.chatId !== chatId || !text(x.id) ||
        !text(x.subject) || !text(x.predicate) ||
        !TIMES.has(x.time) || !MODES.has(x.modality) ||
        !KINDS.has(x.cardinality) || !own(x, "value")) return false;
    try {
      const data = JSON.stringify(x.value);
      return typeof data === "string" && data.length <= MAX.value &&
        JSON.parse(data) !== undefined;
    } catch (_) { return false; }
  }
  function validateLink(x, chatId) {
    return !!(x && x.chatId === chatId && text(x.id) &&
      text(x.targetId) && RELATIONS.has(x.type) &&
      (x.type !== "qualifies-time" || TIMES.has(x.time)));
  }
  function evaluate(input) {
    const o = input || {}, chatId = o.chatId;
    if (!text(chatId)) return { error: "chat-id-required", accepted: [], rejected: [], current: [] };
    const indexed = indexPath(o.path || [], chatId);
    if (!indexed) return { error: "invalid-selected-path", accepted: [], rejected: [], current: [] };
    const candidates = [], rejected = [], ids = new Set();
    const raw = []
      .concat((o.assertions || []).map(record => ({ kind: "assertion", record })))
      .concat((o.links || []).map(record => ({ kind: "link", record })));
    if (raw.length > MAX.records) return { error: "record-limit", accepted: [], rejected: [], current: [] };
    for (const [sequence, candidate] of raw.entries()) {
      const x = candidate.record, valid = candidate.kind === "assertion"
        ? validateFact(x, chatId) : validateLink(x, chatId);
      const position = valid ? sourceAt(x.source, chatId, indexed) : null;
      if (!valid || position === null || ids.has(x.id)) {
        rejected.push({ id: x && x.id || null, reason: !valid ? "invalid-record"
          : position === null ? "source-not-on-selected-path" : "duplicate-id" });
        continue;
      }
      ids.add(x.id);
      candidates.push({ kind: candidate.kind, record: clone(x), position, sequence });
    }
    candidates.sort((a, b) => a.position - b.position || a.sequence - b.sequence);
    const byId = new Map(), accepted = [];
    for (const item of candidates) {
      const x = item.record;
      if (item.kind === "link") {
        const target = byId.get(x.targetId);
        if (!target || target.kind !== "assertion" || target.position > item.position ||
            (x.type === "supersedes" && target.record.modality === "hypothetical")) {
          rejected.push({ id: x.id, reason: "target-not-visible-earlier-fact" });
          continue;
        }
      }
      byId.set(x.id, item);
      accepted.push(item);
    }
    const facts = accepted.filter(x => x.kind === "assertion");
    const links = accepted.filter(x => x.kind === "link");
    const times = new Map(facts.map(x => [x.record.id, new Set([x.record.time])]));
    const superseded = new Set(), corroboration = new Map(), disputed = new Set();
    for (const item of links) {
      const l = item.record;
      if (l.type === "supersedes") superseded.add(l.targetId);
      if (l.type === "qualifies-time") {
        const set = times.get(l.targetId);
        // Unknown is a placeholder, not a conflicting temporal claim.
        set.delete("unknown");
        set.add(l.time);
      }
      if (l.type === "corroborates") {
        const ids = corroboration.get(l.targetId) || [];
        ids.push(l.id); corroboration.set(l.targetId, ids);
      }
      if (l.type === "disputes") disputed.add(l.targetId);
    }
    const groups = new Map(), diagnostics = [];
    for (const item of facts) {
      const x = item.record, t = times.get(x.id);
      if (t.size > 1) {
        diagnostics.push({ id: x.id, reason: "conflicting-time-qualifications" });
        continue;
      }
      if (!t.has("current") || !["established", "reported"].includes(x.modality) ||
          superseded.has(x.id)) continue;
      const key = JSON.stringify([x.subject, x.predicate]);
      const list = groups.get(key) || [];
      list.push({ claimId: x.id, value: clone(x.value), cardinality: x.cardinality,
        modality: x.modality, sources: [clone(x.source)].concat(
          (corroboration.get(x.id) || []).map(id => clone(byId.get(id).record.source))),
        disputed: disputed.has(x.id) });
      groups.set(key, list);
    }
    const current = [];
    for (const [key, list] of groups) {
      const [subject, predicate] = JSON.parse(key);
      const cardinalities = new Set(list.map(x => x.cardinality));
      const unique = new Map();
      for (const entry of list) {
        const k = valueKey(entry.value);
        if (!unique.has(k)) unique.set(k, entry);
        else {
          const existing = unique.get(k);
          existing.sources.push(...entry.sources);
        }
      }
      const values = [...unique.values()];
      const conflict = cardinalities.size !== 1 ||
        (cardinalities.has("single") && values.length > 1) ||
        values.some(x => x.disputed);
      if (conflict) diagnostics.push({ subject, predicate, reason: "unresolved-conflict",
        claimIds: list.map(x => x.claimId) });
      current.push({ subject, predicate, status: conflict ? "conflict" : "known",
        cardinality: cardinalities.size === 1 ? list[0].cardinality : "mixed",
        values });
    }
    current.sort((a, b) => a.subject.localeCompare(b.subject) || a.predicate.localeCompare(b.predicate));
    return { accepted: accepted.map(x => ({ kind: x.kind, ...x.record })),
      rejected, diagnostics, current };
  }
  PRP.knowledgeCore = { evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.knowledgeCore;
})(typeof window !== "undefined" ? window : globalThis);
