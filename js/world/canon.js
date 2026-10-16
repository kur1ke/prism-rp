/* Prism RP — канон мира чата: пак + линза + наложение чата + активная ветка → действующие факты. Чистый модуль.

   Власть (разрешение противоречий), от сильного к слабому:
     наложение активной ветки > наложение на весь чат > линза персонажа > общий пак.
   Слой W1 (пак → выключения линзы → замены линзы → добавления линзы) не меняется: на вход приходит
   готовый результат world/resolve. Поверх него:
     1. события «на весь чат» — базовый слой наложения, по порядку (createdAt, затем id);
     2. события видимой ветки — в порядке повествования: по глубине привязки на активной ветке
        (chat/branch.depthOf), при равенстве — createdAt, затем id. Время записи само порядок ветки не задаёт.
   Внутри слоя более позднее событие для той же цели побеждает; retract убирает цель;
   override убранного факта явно возвращает его (цель известна по id, reestablished: true).
   Видимость события ветки — то же правило, что у опыта (chat/branch.visibleOnPath): соседние ветки
   и другие варианты ответа хранятся, но не действуют; вернулись — мир собирается так же.
   Цели только по id; по тексту и похожим id ничего не подбирается. Битые события — в отчёте, в мир не входят.
   Отбор по таймлайну и варианту (filterSelectors) — отдельный шаг после разрешения власти.
   Входные данные не изменяются. Без DOM, хранилища, сети и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const BR = PRP.branch || (typeof require !== "undefined" ? require("../chat/branch.js") : null);
  const OV = PRP.worldOverlay || (typeof require !== "undefined" ? require("./overlay.js") : null);

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const W1_ORIGIN = { pack: "pack", override: "lens-override", lens: "lens-addition" };
  const META_LISTS = ["entities", "topics", "locations"];
  const META_STR = ["timeline", "variant"];

  function fromBase(f) {
    const out = { id: f.id, text: f.text, entities: f.entities || [], topics: f.topics || [], locations: f.locations || [],
      timeline: f.timeline || "", variant: f.variant || "", origin: W1_ORIGIN[f.origin] || f.origin || "pack" };
    if (f.origin === "override") { out.targetFactId = f.id; out.lensOverrideId = f.overrideId; }
    if (f.provenance) out.provenance = f.provenance;
    return out;
  }

  /* base — результат world/resolve (или null — у персонажа нет мира); overlay — запись наложения этого чата (или null);
     c: { chatId, path: [{ id, swipeIdx }] }.
     → { facts, excluded, events, warnings, known: [id] } */
  function resolveChat(base, overlay, c) {
    const cx = c || {};
    const warnings = [];
    const warn = (code, message, ref) => warnings.push({ level: "warning", code, message, ref: ref == null ? "" : String(ref) });
    const order = [], cur = new Map(), retracted = new Map();
    for (const f of (base && base.facts) || []) {
      if (!f || !f.id || cur.has(f.id)) continue; // world/resolve уже даёт единственные id
      order.push(f.id); cur.set(f.id, fromBase(f));
    }
    const known = new Set(order);
    const excluded = ((base && base.excluded) || []).map((x) => Object.assign({ layer: "w1" }, x));
    for (const w of (base && base.report && base.report.warnings) || []) warnings.push(Object.assign({ layer: "w1" }, w));

    const ov = overlay ? clone(overlay) : null;
    const entries = ov && Array.isArray(ov.entries) ? ov.entries : [];
    const otherChat = ov && cx.chatId && ov.chatId && ov.chatId !== cx.chatId;
    if (otherChat) warn("overlay-other-chat", "Наложение относится к другому чату — не применено.", ov.chatId);

    const rows = [];
    const chatEv = [], branchEv = [];
    entries.forEach((e, i) => {
      const row = { index: i, id: e && e.id, op: e && e.op, scope: e && e.scope, targetFactId: e && e.targetFactId || null,
        factId: e && e.op === "assert" && e.fact ? e.fact.id : null, text: e && e.fact ? e.fact.text : "", createdAt: e && e.createdAt,
        provenance: e && e.provenance || null, active: false, applied: false, code: "", reason: "" };
      rows.push(row);
      if (otherChat) { row.code = "other-chat"; row.reason = "другой чат"; return; }
      const errs = OV.validateEntry(e).filter((x) => x.level === "error");
      if (errs.length) {
        row.code = errs.some((x) => x.code === "branch-no-provenance") ? "malformed-provenance" : "malformed";
        row.reason = errs.map((x) => x.message).join(" ");
        warn(row.code === "malformed-provenance" ? "entry-malformed-provenance" : "entry-malformed", `Событие мира ${row.id || "№" + (i + 1)} повреждено и не применяется: ${row.reason}`, row.id || i);
        return;
      }
      if (e.scope === "chat") { row.active = true; row.code = "chat"; row.reason = "на весь чат"; chatEv.push({ e, row }); return; }
      const v = BR.visibleOnPath(e.provenance, cx.path);
      row.code = v.code; row.reason = v.reason;
      if (!v.visible) return; // соседняя ветка или другой вариант: хранится, не действует
      row.active = true;
      row.depth = BR.depthOf(e.provenance, cx.path);
      branchEv.push({ e, row });
    });
    const byTime = (a, b) => ((a.e.createdAt || 0) - (b.e.createdAt || 0)) || String(a.e.id).localeCompare(String(b.e.id));
    chatEv.sort(byTime);
    branchEv.sort((a, b) => (a.row.depth - b.row.depth) || byTime(a, b));

    function apply({ e, row }) {
      const origin = e.scope === "chat" ? "chat-overlay" : "branch-overlay";
      if (e.op === "assert") {
        const id = e.fact.id;
        if (known.has(id)) { row.reason = "id факта уже занят — не применено"; warn("assert-id-collides", `id нового факта ${id} уже занят — событие ${e.id} не применено.`, id); return; }
        known.add(id); order.push(id);
        cur.set(id, { id, text: e.fact.text, entities: e.fact.entities || [], topics: e.fact.topics || [], locations: e.fact.locations || [],
          timeline: e.fact.timeline || "", variant: e.fact.variant || "", origin, sourceEventId: e.id });
        row.applied = true;
        return;
      }
      const t = e.targetFactId;
      if (!known.has(t)) {
        row.reason = "цели нет в мире — не применено";
        warn(e.op === "override" ? "override-target-missing" : "retract-target-missing", `Факта ${t} нет в мире этого чата — событие ${e.id} не применено (ссылка сохранена).`, t);
        return;
      }
      if (e.op === "retract") {
        if (!cur.has(t)) { row.reason = "факт уже убран"; warn("already-retracted", `Факт ${t} уже убран — событие ${e.id} ничего не меняет.`, t); return; }
        retracted.set(t, { fact: cur.get(t), eventId: e.id, scope: e.scope });
        cur.delete(t);
        row.applied = true;
        return;
      }
      // override: значение цели (действующее или последнее перед убиранием) → новое; id цели сохраняется.
      const prev = cur.get(t) || retracted.get(t).fact;
      const next = { id: t, text: e.fact.text, entities: prev.entities, topics: prev.topics, locations: prev.locations, timeline: prev.timeline, variant: prev.variant,
        origin, sourceEventId: e.id, targetFactId: t, previousOrigin: prev.origin };
      for (const k of META_LISTS.concat(META_STR)) if (e.fact[k] !== undefined && e.fact[k] !== null) next[k] = e.fact[k];
      if (retracted.has(t)) { retracted.delete(t); next.reestablished = true; }
      cur.set(t, next);
      row.applied = true;
    }
    chatEv.forEach(apply);
    branchEv.forEach(apply);

    const facts = order.filter((id) => cur.has(id)).map((id) => cur.get(id));
    for (const [id, r] of retracted) excluded.push({ id, text: r.fact.text, reason: "retracted", sourceEventId: r.eventId, scope: r.scope, layer: "overlay" });
    return { facts, excluded, events: rows, warnings, known: [...known] };
  }

  /* Отбор по таймлайну и варианту чата. Нейтральный факт (пустые метки) подходит всегда.
     Факт с меткой подходит, только если выбран тот же селектор (точное совпадение после нормализации регистра и пробелов).
     Метка есть, а селектор не выбран, — факт не подходит. Ничего не угадывается. → { eligible, filtered } */
  function filterSelectors(facts, selectors) {
    const s = selectors || {};
    const tl = OV.normSel(s.timeline), vr = OV.normSel(s.variant);
    const eligible = [], filtered = [];
    for (const f of facts || []) {
      const ft = OV.normSel(f.timeline), fv = OV.normSel(f.variant);
      if (ft && ft !== tl) { filtered.push({ id: f.id, text: f.text, reason: tl ? "timeline-mismatch" : "timeline-unselected", value: f.timeline }); continue; }
      if (fv && fv !== vr) { filtered.push({ id: f.id, text: f.text, reason: vr ? "variant-mismatch" : "variant-unselected", value: f.variant }); continue; }
      eligible.push(f);
    }
    return { eligible, filtered };
  }

  PRP.worldCanon = { resolveChat, filterSelectors };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.worldCanon;
})(typeof window !== "undefined" ? window : globalThis);
