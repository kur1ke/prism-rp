/* Prism RP — сервис опыта (прикладной уровень).
   Загрузка опыта персонажа, однократная миграция старых записей, черновики,
   сохранение, удаление и ручная привязка к чату.
   Правила видимости, отбора и миграции — чистые функции prism/experience.js;
   здесь только их применение к текущему чату и работа с хранилищем. DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, EX = PRP.experience, ME = PRP.memoryExtract, SC = PRP.scene, LLM = PRP.llm;

  function create(ctx) {
    const { S, DB } = ctx;
    const chat = () => ctx.svc.chat;

    // Все записи персонажа (по владельцу); видимость в чате и ветке решает EX.visibility.
    function loadForCard(cardId) { return DB.byIndex("experience", "owner", cardId); }

    // Миграция: привязка к чату без догадок (EX.migrate). Идемпотентна; пишет только изменённые записи.
    async function migrate() {
      const all = await DB.all("experience");
      const need = all.filter((r) => !r.chatId && !(r.source && r.source.chatId) && r.source && (r.source.messageIds || []).length);
      const msgChat = new Map();
      for (const r of need) for (const id of r.source.messageIds) {
        if (msgChat.has(id)) continue;
        const msg = await DB.get("messages", id);
        msgChat.set(id, msg ? msg.chatId : null);
      }
      const res = EX.migrate(all, { messageChat: (id) => (msgChat.has(id) ? msgChat.get(id) : null) });
      const changed = res.records.filter((r) => res.changed.includes(r.id));
      if (changed.length) await DB.putMany("experience", changed);
      S.legacyExperience = res.legacy;
      return res;
    }

    // Что показывать во вкладке «Опыт»: видимое в этой ветке, скрытое в других ветках, непривязанное.
    function view(p) {
      const vctx = { chatId: S.chatId, path: ME.provenancePath(p || chat().path()) };
      const inChat = S.experience.filter((r) => r.chatId === S.chatId && !r.legacyUnscoped);
      const visible = inChat.filter((r) => EX.visibility(r, vctx).visible);
      return { visible, hiddenInChat: inChat.length - visible.length, legacy: S.experience.filter((r) => EX.scopeOf(r) === "legacy") };
    }
    function legacyCount() { return S.experience.filter((r) => EX.scopeOf(r) === "legacy").length; }

    // Пустой черновик ручной записи (на весь чат).
    function blankDraft() { return Object.assign(EX.blank(S.cardId, S.chatId), { about: ["user"] }); }
    // Черновик из сообщения: привязка к сообщению и его варианту, время сцены на тот момент.
    function draftFromMessage(msgId) {
      const p = chat().path();
      const idx = p.findIndex((m) => m.id === msgId);
      const st = chat().sceneState(p.slice(0, idx + 1));
      const d = EX.blank(S.cardId, S.chatId);
      d.about = ["user"];
      const msg = p[idx];
      const provenance = ME.provenancePath(p);
      const sourcePath = provenance.find((x) => x.id === msgId);
      d.source = { chatId: S.chatId, messageIds: [msgId], swipes: { [msgId]: (msg && msg.swipeIdx) || 0 },
        textHashes: msg ? { [msgId]: ME.fingerprint(PRP.tree.activeSwipe(msg).text || "") } : {},
        ancestryHash: sourcePath && sourcePath.prefixHash || "",
        sceneTime: st.clock.m != null || st.clock.min != null ? SC.formatClock(st.clock) : "" };
      return d;
    }

    // Сохранить черновик. → строка ошибки для пользователя или null.
    async function save(d) {
      if (!d || !ctx.chat()) return "Нет активного чата.";
      // A reviewed source must still exist on the selected path in the same swipe
      // and retain its exact original text. Never silently broaden to chat scope.
      if (d.source && d.source.textHashes && Object.keys(d.source.textHashes).length) {
        const vis = EX.visibility(d, { chatId: S.chatId, path: ME.provenancePath(chat().path()) });
        if (!vis.visible) return "Источник изменился или находится в другой ветке. Проверьте опыт заново.";
      }
      if (d.source && d.source.proposedBy === "memory-extract-v1" &&
          S.experience.some((x) => x.chatId === S.chatId && x.id !== d.id && x.source &&
            x.source.proposedBy === "memory-extract-v1" &&
            x.source.messageIds && x.source.messageIds[0] === d.source.messageIds[0] &&
            x.source.evidence === d.source.evidence &&
            x.source.textHashes && x.source.textHashes[d.source.messageIds[0]] === d.source.textHashes[d.source.messageIds[0]]))
        return "Этот эпизод уже сохранён из данного источника.";
      d.event = d.event.trim();
      if (!d.event) return "Опишите, что произошло.";
      if (!d.id) d.id = U.uid("x");
      d.owner = S.cardId;
      // Новая запись всегда принадлежит текущему чату; непривязанные старые не трогаем.
      if (!d.chatId && !d.legacyUnscoped) { d.chatId = S.chatId; d.source = Object.assign({ messageIds: [] }, d.source, { chatId: S.chatId }); }
      await DB.put("experience", d);
      const i = S.experience.findIndex((x) => x.id === d.id);
      if (i >= 0) S.experience[i] = d; else S.experience.push(d);
      return null;
    }
    async function remove(id) {
      await DB.del("experience", id);
      S.experience = S.experience.filter((x) => x.id !== id);
    }
    // Ручная привязка непривязанной записи к текущему чату (EX.assignToChat).
    async function assign(id) {
      const r = S.experience.find((x) => x.id === id);
      if (!r) return false;
      const nr = EX.assignToChat(r, S.chatId);
      await DB.put("experience", nr);
      S.experience = S.experience.map((x) => (x.id === nr.id ? nr : x));
      S.legacyExperience = Math.max(0, (S.legacyExperience || 1) - 1);
      return true;
    }
    // Candidates are ephemeral; model responses do not write to IndexedDB or Prism.
    function candidates() {
      const data = S.expCandidates;
      if (!data || !ctx.chat() || data.chatId !== S.chatId || data.ownerId !== S.cardId ||
          data.pathSignature !== ME.pathSignature(chat().path()) ||
          !ME.sameSnapshot(data.window, chat().path())) return [];
      return data.items;
    }
    async function extractCandidates() {
      if (!ctx.chat() || !ctx.card()) return { status: "no-chat" };
      if (S.gen || S.expExtractBusy) return { status: "busy" };
      const prov = ctx.provider();
      if (!prov) return { status: "no-provider" };
      let window = ME.snapshot(chat().path());
      if (!window.length) return { status: "empty-history" };
      const ownerId = S.cardId, chatId = S.chatId;
      const pathSignature = ME.pathSignature(chat().path());
      const names = { character: ctx.card().name, user: ctx.persona().name };
      let prompt = ME.prompt(window, names, ctx.chat().mode);
      // Independent one-shot operation: bound complete outbound input and output,
      // regardless of current RP history/context. No silent over-budget call.
      const inputLimit = ctx.contextTokens() - 850;
      while (window.length && U.estimateTokens(ME.INSTRUCTION + prompt) > inputLimit) {
        window = window.slice(1);
        prompt = ME.prompt(window, names, ctx.chat().mode);
      }
      if (!window.length) return { status: "overflow" };
      S.expCandidates = null;
      S.expExtractBusy = true;
      try {
        const response = await LLM.chat(prov, [
          { role: "system", content: ME.INSTRUCTION },
          { role: "user", content: prompt },
        ], {
          names: { char: "Анализатор", user: "Источник" },
          sampler: { temperature: 0.15, max_tokens: 700 },
          outputFormat: "message-body",
        });
        if (S.chatId !== chatId || S.cardId !== ownerId ||
            pathSignature !== ME.pathSignature(chat().path()) ||
            !ME.sameSnapshot(window, chat().path())) return { status: "stale" };
        const parsed = ME.parse(PRP.openai.splitThink(response.text || "").text, window);
        if (parsed.status === "invalid") return parsed;
        S.expCandidates = { chatId, ownerId, pathSignature, window, items: parsed.candidates };
        return Object.assign({ count: parsed.candidates.length }, parsed);
      } catch (err) {
        return { status: "error", reason: err && err.message || String(err) };
      } finally { S.expExtractBusy = false; }
    }
    function selectCandidate(index) {
      const candidate = candidates()[Number(index)];
      if (!candidate || !ME.candidateIsCurrent(candidate, chat().path())) return null;
      const d = EX.blank(S.cardId, S.chatId);
      d.event = candidate.event;
      d.interpretation = candidate.interpretation;
      d.consequences = candidate.consequences;
      d.domains = candidate.domains.slice();
      d.about = candidate.aboutUser ? ["user"] : [];
      const ancestry = ME.provenancePath(chat().path()).find((x) => x.id === candidate.messageId);
      if (!ancestry) return null;
      d.source = { chatId: S.chatId, messageIds: [candidate.messageId],
        swipes: { [candidate.messageId]: candidate.swipeIdx },
        textHashes: { [candidate.messageId]: candidate.hash },
        ancestryHash: ancestry.prefixHash,
        evidence: candidate.quote, proposedBy: "memory-extract-v1", sceneTime: "" };
      return d;
    }
    function find(id) { return S.experience.find((x) => x.id === id); }

    return { loadForCard, migrate, view, legacyCount, blankDraft, draftFromMessage, save, remove,
      assign, find, candidates, extractCandidates, selectCandidate };
  }

  PRP.experienceService = { create };
})(typeof window !== "undefined" ? window : globalThis);
