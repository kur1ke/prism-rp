/* Prism RP — сервис опыта (прикладной уровень).
   Загрузка опыта персонажа, однократная миграция старых записей, черновики,
   сохранение, удаление и ручная привязка к чату.
   Правила видимости, отбора и миграции — чистые функции prism/experience.js;
   здесь только их применение к текущему чату и работа с хранилищем. DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, EX = PRP.experience, SC = PRP.scene;

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
      const vctx = { chatId: S.chatId, path: chat().pathCtx(p) };
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
      d.source = { chatId: S.chatId, messageIds: [msgId], swipes: { [msgId]: (msg && msg.swipeIdx) || 0 }, sceneTime: st.clock.m != null || st.clock.min != null ? SC.formatClock(st.clock) : "" };
      return d;
    }

    // Сохранить черновик. → строка ошибки для пользователя или null.
    async function save(d) {
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
    function find(id) { return S.experience.find((x) => x.id === id); }

    return { loadForCard, migrate, view, legacyCount, blankDraft, draftFromMessage, save, remove, assign, find };
  }

  PRP.experienceService = { create };
})(typeof window !== "undefined" ? window : globalThis);
