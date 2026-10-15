/* Prism RP — опыт персонажа (Experience).
   Запись = свидетельство прошлого, а не инструкция. Отбор релевантного опыта
   намеренно добирает противовес: если выбрана сильная запись одного знака
   о человеке, к ней добавляется лучшая запись противоположного знака о нём же,
   чтобы реакция взвешивала, а не повторяла одну травму. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  function blank(ownerId) {
    return {
      id: null,
      chatId: null,
      owner: ownerId || null,
      witnesses: [],
      event: "",
      interpretation: "",
      consequences: "",
      domains: [],
      about: [],
      valence: 0,
      weight: 1,
      source: { chatId: null, messageIds: [], sceneTime: "" },
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function stem(w) {
    w = String(w || "").toLowerCase().trim();
    return w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w;
  }

  function domainHits(rec, textLow) {
    let n = 0;
    for (const d of rec.domains || []) {
      const s = stem(d);
      if (s && textLow.includes(s)) n++;
    }
    return n;
  }

  // records: все записи; ctx: { ownerId, present: [id], text, limit }
  function select(records, ctx) {
    const c = ctx || {};
    const limit = c.limit || 8;
    const textLow = String(c.text || "").toLowerCase();
    const present = new Set(c.present || []);
    const pool = (records || []).filter((r) => r.status === "active" && (!c.ownerId || r.owner === c.ownerId));
    if (!pool.length) return [];
    const times = pool.map((r) => r.createdAt || 0);
    const tMin = Math.min(...times), tMax = Math.max(...times);
    const scored = pool.map((r) => {
      const aboutHit = (r.about || []).some((a) => present.has(a)) ? 1 : 0;
      const recency = tMax > tMin ? ((r.createdAt || 0) - tMin) / (tMax - tMin) : 1;
      const score = 2 * aboutHit + 1.5 * domainHits(r, textLow) + (r.weight || 1) + recency;
      return { r, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const chosen = scored.slice(0, limit).map((x) => x.r);
    const chosenIds = new Set(chosen.map((r) => r.id));

    // Противовесы — сверх лимита, не больше двух.
    const extra = [];
    for (const r of chosen) {
      if (Math.abs(r.valence || 0) < 2 || extra.length >= 2) continue;
      for (const p of r.about || []) {
        const sign = Math.sign(r.valence);
        const hasOpposite = chosen.concat(extra).some((x) => (x.about || []).includes(p) && Math.sign(x.valence || 0) === -sign);
        if (hasOpposite) continue;
        const best = scored.find((x) => !chosenIds.has(x.r.id) && !extra.some((e) => e.id === x.r.id) &&
          (x.r.about || []).includes(p) && Math.sign(x.r.valence || 0) === -sign);
        if (best) extra.push(Object.assign({}, best.r, { __counter: true }));
        if (extra.length >= 2) break;
      }
    }
    // Хронологический порядок читается моделью как история, а не как рейтинг.
    return chosen.concat(extra).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  function format(list) {
    return (list || []).map((r) => {
      const parts = ["— " + (r.source && r.source.sceneTime ? `[${r.source.sceneTime}] ` : "") + r.event.trim()];
      if (r.interpretation) parts.push("  тогда понял(а) это так: " + r.interpretation.trim());
      if (r.consequences) parts.push("  последствия: " + r.consequences.trim());
      return parts.join("\n");
    }).join("\n");
  }

  PRP.experience = { blank, select, format };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.experience;
})(typeof window !== "undefined" ? window : globalThis);
