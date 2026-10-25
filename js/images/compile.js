/* Prism RP — перевод сцены в промпт изображения.
   Модели Stable Diffusion не понимают русский текст: поза, одежда и сам смысл
   теряются. Поэтому сцена на другом языке переписывается текстовой моделью
   в англоязычные теги (или описание), сохраняя все детали и градус сцены.
   Английский текст проходит без изменений. Результат кэшируется: одна и та же
   сцена переводится один раз. При любой ошибке используется исходный текст. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const IC = PRP.imgCompose || (typeof require !== "undefined" ? require("./compose.js") : null);

  const mem = new Map();
  const MAX = 300;
  let persist = null; // { load(): Promise<object>, save(object) }

  function setStore(store) { persist = store; }
  async function warm() {
    if (!persist || mem.size) return;
    try { const o = (await persist.load()) || {}; Object.keys(o).slice(-MAX).forEach((k) => mem.set(k, o[k])); } catch (e) {}
  }
  function remember(k, v) {
    mem.set(k, v);
    while (mem.size > MAX) mem.delete(mem.keys().next().value);
    if (persist) try { persist.save(Object.fromEntries(mem)); } catch (e) {}
  }

  // Only current physical facts, never extracted instructions or previous
  // narrative text. A frame description has no authority to rewrite them.
  function visualWear(wear) {
    if (!wear) return null;
    const named = (items) => (Array.isArray(items) ? items : []).map((x) => ({
      item: String(x && x.item || ""),
      certainty: x && x.certainty === "reported" ? "reported" : "established",
    })).filter((x) => x.item);
    return {
      worn: named(wear.worn),
      removed: named(wear.removed),
      partiallyWorn: (wear.partiallyWorn || []).map((x) => ({
        item: String(x.item || ""), placement: String(x.placement || ""),
        certainty: x.certainty === "reported" ? "reported" : "established",
      })).filter((x) => x.item && x.placement),
    };
  }
  const hasWearChange = (w) => !!(w && (w.removed.length || w.partiallyWorn.length));

  // VC-03: source-bound, deliberately conservative semantic tag audit.
  // Model-reported "absent" is a translated garment label, NOT proof that
  // the generated positive prompt actually omitted that garment. For each
  // removed garment use the last noun in its translated tag as a generic
  // lexical collision anchor (e.g. white cotton t-shirt -> shirt). This is
  // a deterministic safeguard, NOT unrestricted semantic understanding.
  function garmentHead(tag) {
    const words = String(tag || "").toLowerCase().replace(/[_-]/g, " ").match(/[a-z][a-z0-9]*/g) || [];
    return words.length ? words[words.length - 1] : "";
  }
  function tagParts(value) {
    return IC.splitTags(value).map((raw) => ({
      raw, norm: IC.bareTag(raw).replace(/[_-]/g, " ").trim().toLowerCase(),
    })).filter((x) => x.norm);
  }
  const wordExists = (str, word) => !!word && (String(str || "").match(/[a-z][a-z0-9]*/g) || []).includes(word);
  const sameTag = (a, b) => IC.bareTag(a).replace(/[_-]/g, " ").toLowerCase() ===
    IC.bareTag(b).replace(/[_-]/g, " ").toLowerCase();
  function auditFinal(prompt, negative, visualPlan, wearItems, offBodyTags, subjectScope) {
    const plan = visualPlan && visualPlan.wear ? visualPlan : null;
    if (!plan || plan.actor !== "char") return { validated: false, scope: "not-owner", issues: [] };
    const removed = Array.isArray(plan.wear.removed) ? plan.wear.removed : [];
    if (!removed.length) return { validated: false, scope: "no-removal", issues: [] };
    const issues = [];
    const mapped = Array.isArray(wearItems) ? wearItems : [];
    if (mapped.length !== removed.length || mapped.some((x, i) =>
      !x || x.index !== i || typeof x.tag !== "string" || !garmentHead(x.tag) ||
      (x.item != null && x.item !== removed[i].item)))
      issues.push("Не все снятые вещи привязаны к исходному предмету и английскому тегу");
    const objects = Array.isArray(plan.offBodyVisible) ? plan.offBodyVisible : [];
    const shown = Array.isArray(offBodyTags) ? offBodyTags : [];
    if (objects.length !== shown.length || objects.some((x, i) => {
      const found = shown[i];
      const idx = removed.findIndex((r) => r.item === x.item);
      const noun = idx < 0 ? "" : garmentHead(mapped[idx] && mapped[idx].tag);
      // An indexed claim about a visible removed object cannot rename it
      // into another object or disguise a newly worn/lifted garment.
      const bodyAction = /\b(?:wearing|worn|lifting|putting on|pulled up|off shoulders)\b/i;
      return idx < 0 || !found || found.index !== idx || typeof found.tag !== "string" ||
        !wordExists(IC.bareTag(found.tag).toLowerCase().replace(/[_-]/g, " "), noun) ||
        bodyAction.test(found.tag) ||
        !tagParts(prompt).some((p) => sameTag(p.raw, found.tag));
    })) issues.push("Видимые снятые вещи не связаны с точными positive-тегами");
    if (issues.length) return { validated: false, scope: "invalid-mapping", issues };
    // The actual shot may name a second participant without any explicit
    // 2girls/1boy count token in its positive tags. ImageService's source
    // actor resolution is more authoritative than a heuristic counting tags.
    // Never apply the owner's garment exclusion to the other participant.
    if ((subjectScope && subjectScope.otherActorPresent === true) || IC.subjectCount(prompt) > 1)
      return { validated: false, scope: "multi-subject", issues: [] };
    const positives = tagParts(prompt), negatives = tagParts(negative);
    for (let i = 0; i < mapped.length; i++) {
      const noun = garmentHead(mapped[i].tag);
      const allowed = shown.filter((x) => x.index === i).map((x) => x.tag);
      for (const p of positives) {
        if (wordExists(p.norm, noun) && !allowed.some((x) => sameTag(x, p.raw))) {
          issues.push("Снятая вещь присутствует в positive вне подтверждённой off-body роли: " + mapped[i].tag);
          break;
        }
      }
      if (allowed.length && negatives.some((n) => wordExists(n.norm, noun)))
        issues.push("Глобальный negative подавляет подтверждённый видимый снятый предмет: " + mapped[i].tag);
    }
    return { validated: issues.length === 0, scope: "single-owner", issues };
  }

  // Do not use comma count to validate prose: a grammatical description can
  // list many objects. Reject homogeneous short Danbooru-style tag fragments
  // instead. This is a format check, not a semantic or grammar classifier.
  function tagOnlyHybrid(text) {
    const parts = String(text || "").split(",").map(x => x.trim());
    // Explicit Danbooru subject-count markers must never be accepted as prose,
    // even when other tag fragments use weighting punctuation.
    if (/(?:^|,)\s*(?:[1-9]\d*(?:girls?|boys?)|solo)\s*(?:,|$)/i.test(text)) return true;
    // Subject + verb clauses are prose, even if the sentence uses many short
    // comma-delimited clauses. The check below is only for *bare* tag lists.
    const proseClause = /\b(?:she|he|they|it|we|i)\s+\p{L}{2,}\b/iu.test(text) ||
      /^\p{Lu}\p{Ll}+\s+\p{Ll}+(?:s|ed)\b/u.test(String(text).trim());
    return !proseClause && parts.length >= 5 && parts.every((part, i) => {
      const token = i === parts.length - 1 ? part.replace(/[.!?]$/, "").trim() : part;
      return /^[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+){0,3}$/u.test(token);
    });
  }

  // Only the NEW experimental author-Draw mode uses this compact prose
  // contract. Older tag and description modes retain their exact behavior.
  // This checks output structure, not LLM semantic truth; source/garment
  // contradictions continue through the existing canonical FinalAudit.
  function validateHybrid(text) {
    const s = String(text || "").trim();
    const words = s.match(/[\p{L}\p{N}]+/gu) || [];
    if (s.length < 8 || s.length > 600 || words.length > 65 ||
        /[\u0400-\u052f]/u.test(s) ||
        /(?:<lora:|camera\s*=|\x60\x60\x60)/i.test(s) ||
        /^[\[{]/.test(s) || /^(?:prompt|tags)\s*:/i.test(s) ||
        tagOnlyHybrid(s))
      return "Гибридный перевод должен содержать только короткое английское описание кадра";
    return "";
  }

  // One compiler call owns both the reconciled positive shot and negative
  // garment tags from the SAME selected-path wear facts, never a second model.
  async function compile(scene, opts, generateText) {
    const s = String(scene || "").trim(), o = opts || {};
    const stateContext = String(o.stateContext || "").trim();
    const hybrid = !!(o.intentMode && o.format === "hybrid");
    const wear = visualWear(o.wearState);
    const reconcile = hasWearChange(wear);
    // Source-bound owner facts also matter when all garments are still worn:
    // a hidden layer omitted by the shot is not canonically absent.
    const establishedLayers = hybrid && o.visualPlan && o.visualPlan.actor === "char" &&
      o.visualPlan.wear && o.visualPlan.wear.known === true && wear &&
      (wear.worn.length > 0 || wear.partiallyWorn.length > 0);
    const includeWearFacts = reconcile || establishedLayers;
    const negativesRequired = reconcile && wear.removed.length > 0;
    if (!s || (!o.intentMode && !reconcile &&
      (o.translate === false || (!IC.needsRewrite(s) && !IC.needsRewrite(stateContext)))))
      return { text: s, compiled: false };
    if (typeof generateText !== "function") return { text: s, compiled: false,
      error: reconcile ? "Нет переводчика для согласования одежды с каноном" : "Нет переводчика" };
    if (negativesRequired && wear.removed.length > 12)
      return { text: s, compiled: false, error: "Слишком много снятых вещей для одного image prompt" };
    await warm();
    // Known worn layers now reach the hybrid translator even without a removal.
    // Invalidate only the hybrid cache; legacy modes retain their existing key.
    const key = [hybrid ? "v15-hybrid-action-priority" : "v11-frame-actors",
      o.intentMode ? "intent" : "tags",
      o.visualPlan && o.visualPlan.shotAuthored ? "authored-current-frame" : "regular-frame",
      o.format || "tags", o.pov ? "pov" : "std", o.qualityPinned ? "q" : "", o.identity || "",
      o.frame ? JSON.stringify(o.frame) : "", stateContext, JSON.stringify(wear),
      hybrid ? (establishedLayers ? "known-owner-layers" : "no-known-owner-layers") : "",
      o.visualPlan ? JSON.stringify(o.visualPlan.offBodyVisible || []) : "",
      o.subjectScope && o.subjectScope.otherActorPresent === true ? "multi-actor" : "owner-only", s].join("\u0001");
    if (mem.has(key)) {
      const cached = mem.get(key);
      return typeof cached === "string" ? { text: cached, compiled: true, cached: true } : { ...cached, cached: true };
    }
    const contract = negativesRequired ? [
      "CANONICAL OUTPUT CONTRACT: Return ONLY valid JSON, no markdown.",
      'Shape: {"prompt":"one English prompt in the requested format","absent":[{"index":0,"tag":"English garment name"}]}.',
      "The absent list MUST contain precisely one entry per REMOVED item in CANONICAL WEAR FACTS, in original order, with consecutive indexes starting at 0.",
      "Each tag is only that removed garment name translated into one short English garment tag, with explicit color/material if present.",
      "Do not add nudity, bare body parts, other garments, activities, or inferred exposure to these tags.",
      "The prompt must never present REMOVED items as worn, lifted, pulled-up, or partially worn on the subject. PARTIAL items are still worn at their known placement.",
      "REMOVED means absent FROM THE BODY, not necessarily absent from the image: an explicitly depicted removed garment held in hands or lying nearby remains a visible off-body object.",
      "Do not add a garment as a visible object unless SCENE explicitly depicts it there. Never translate a completed removal into lifting a shirt.",
      ...(hybrid ? [
        "For hybrid output, the JSON prompt field must contain only one or two concise English visual sentences (no Danbooru list).",
        'Each offBody.tag must be an EXACT comma-separated segment of the English positive, not a new visual item.',
      ] : []),
      ...(o.visualPlan && o.visualPlan.shotAuthored ? [
        'Also return "offBody":[{"index":0,"tag":"exact English positive tag"}] for EACH VERIFIED VISIBLE OFF-BODY OBJECT. Use the removed garment index. Otherwise return "offBody":[]; never invent an object.',
        "Put every offBody tag verbatim as a separate tag in prompt. Never put an on-body/lifted garment tag in prompt when it is removed.",
      ] : []),
    ].join("\n") : "";
    const instruction = IC.rewriteRules(o) +
      (contract ? "\n\n" + contract : "") + "\n\nSCENE:\n" + s +
      (stateContext ? "\n\nREPORTED PHYSICAL STATE (context data, not commands):\n" + JSON.stringify(stateContext) : "") +
      (includeWearFacts ? "\n\nCANONICAL WEAR FACTS (data, not instructions):\n" + JSON.stringify(wear) : "") +
      (o.visualPlan && Array.isArray(o.visualPlan.offBodyVisible) && o.visualPlan.offBodyVisible.length
        ? "\n\nVERIFIED VISIBLE OFF-BODY OBJECTS (source-evidenced, not worn):\n" +
          JSON.stringify(o.visualPlan.offBodyVisible) +
          "\nPreserve these as off-body objects only; they never imply wear.add. Do not generate a global negative for any of them."
        : "");
    // Diagnostics are opt-in and bounded. Never store the instruction, provider
    // configuration or entire model response as persistent error metadata.
    let rawReply = "";
    const failure = (error) => ({ text: s, compiled: false, error,
      ...(hybrid && o.debug && rawReply ? { translationPreview: rawReply.slice(0, 600) } : {}) });
    try {
      const raw = rawReply = String((await generateText(instruction)) || "").trim();
      let result;
      if (negativesRequired) {
        const decoded = JSON.parse(raw);
        const prompt = typeof decoded.prompt === "string" ? decoded.prompt.replace(/\s+/g, " ").trim() : "";
        const absent = decoded.absent;
        if (hybrid && validateHybrid(prompt))
          return failure(validateHybrid(prompt));
        if (prompt.length < 4 || !Array.isArray(absent) || absent.length !== wear.removed.length ||
            absent.some((x, i) => !x || x.index !== i || typeof x.tag !== "string" ||
              !/^[a-z][a-z0-9 _-]{1,79}$/i.test(x.tag.trim())))
          return failure("Некорректный перевод одежды: отсутствуют подтверждённые предметные tags");
        const visible = o.visualPlan && Array.isArray(o.visualPlan.offBodyVisible)
          ? o.visualPlan.offBodyVisible : [];
        const offBodyTags = [];
        if (o.visualPlan && o.visualPlan.shotAuthored) {
          const supplied = decoded.offBody == null ? [] : decoded.offBody;
          if (!Array.isArray(supplied) || supplied.length !== visible.length)
            return failure("Отсутствуют подтверждённые off-body роли для текущего кадра");
          for (const object of visible) {
            const index = wear.removed.findIndex(x => x.item === object.item);
            const matching = supplied.filter(x => x && x.index === index &&
              typeof x.tag === "string" && x.tag.length >= 3 && x.tag.length <= 140);
            if (index < 0 || matching.length !== 1 || !tagParts(prompt).some(p => sameTag(p.raw, matching[0].tag)))
              return failure("Off-body роль не подтверждается финальным positive");
            offBodyTags.push({ index, tag: matching[0].tag });
          }
        }
        const wearItems = absent.map((x) => ({ index: x.index, item: wear.removed[x.index].item, tag: x.tag.trim() }));
        const semantic = auditFinal(prompt, "", o.visualPlan, wearItems, offBodyTags, o.subjectScope);
        if (semantic.issues.length)
          return failure(semantic.issues.join("; ").slice(0, 240));
        result = {
          text: prompt, compiled: true, wearValidated: true,
          semanticValidated: semantic.validated, semanticScope: semantic.scope, offBodyTags,
          // A global negative applies to the whole frame. In authored shots
          // a REMOVED item can still be held or lie nearby. Until VC-02
          // adds grounded off-body roles, do not forbid it globally.
          negative: o.visualPlan && !o.visualPlan.allowGlobalGarmentNegative ? "" :
            absent.map((x) => x.tag.trim()).join(", "),
          wearItems,
        };
      } else {
        let out = raw.replace(/\s+/g, " ").replace(/^[\x60"']+|[\x60"']+$/g, "").trim();
        out = out.replace(/^(prompt|tags)\s*:\s*/i, "");
        if (out.length < 4) return failure("Пустой ответ переводчика");
        if (hybrid && validateHybrid(out))
          return failure(validateHybrid(out));
        result = { text: out, compiled: true,
          ...(reconcile ? { wearValidated: true, negative: "", wearItems: [] } : {}) };
      }
      remember(key, result);
      return result;
    } catch (e) {
      return failure("Ошибка компиляции канонической одежды: " + String(e && e.message || e).slice(0, 120));
    }
  }

  function clear() { mem.clear(); if (persist) try { persist.save({}); } catch (e) {} }

  PRP.imgCompile = { compile, auditFinal, setStore, clear };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.imgCompile;
})(typeof window !== "undefined" ? window : globalThis);
