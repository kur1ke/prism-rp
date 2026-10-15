/* Prism RP — сервис чата (прикладной уровень).
   Жизненный цикл чата и его сообщений: загрузка, создание с приветствием, правка,
   варианты, удаление ветки и чата, ручные изменения сцены, сохранение.
   Алгоритмы дерева — в chat/tree.js, свёртка сцены — в prism/scene.js; здесь только
   их применение к текущему чату и сохранение через хранилище.
   Зависимости передаются в create(ctx): состояние сессии S, хранилище DB, геттеры. DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, SC = PRP.scene;

  function create(ctx) {
    const { S, DB } = ctx;

    /* ── Путь и сцена активной ветки ───────────────────────────────────── */
    function path() {
      const c = ctx.chat();
      return c ? TR.path(TR.index(S.messages), c.leafId) : [];
    }
    function sceneState(p) {
      const c = ctx.chat();
      return SC.fold(c ? c.sceneInit : "", (p || path()).map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })));
    }
    // Путь в виде, который понимают модули Prism: [{id, swipeIdx}].
    function pathCtx(p) { return (p || path()).map((m) => ({ id: m.id, swipeIdx: m.swipeIdx || 0 })); }

    /* ── Сохранение ────────────────────────────────────────────────────── */
    async function putMsg(m) {
      await DB.put("messages", m);
      const i = S.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) S.messages[i] = m; else S.messages.push(m);
    }
    async function putChat(c) {
      await DB.put("chats", c);
      const i = S.chats.findIndex((x) => x.id === c.id);
      if (i >= 0) S.chats[i] = c; else S.chats.push(c);
    }
    // Обновить превью чата по последнему сообщению активной ветки и сохранить.
    async function touch() {
      const c = ctx.chat();
      if (!c) return;
      const last = path().slice(-1)[0];
      const t = last ? TR.activeSwipe(last).text : "";
      c.preview = (last && last.role === "user" ? "Вы: " : "") + t.replace(/\s+/g, " ").slice(0, 90);
      await putChat(c);
    }
    function newMsg(role, parentId, text) {
      const now = Date.now();
      return { id: U.uid("m"), chatId: S.chatId, parentId: parentId || null, role, swipes: [{ text: text || "", sceneOps: [], createdAt: now }], swipeIdx: 0, createdAt: now };
    }

    /* ── Жизненный цикл ────────────────────────────────────────────────── */
    function loadMessages(chatId) { return DB.byIndex("messages", "chatId", chatId); }

    /* Новый чат. Режим «Сцена»: первое сообщение карточки и альтернативные приветствия — авторское
       начало, варианты одного корневого сообщения (без вызова модели; [scene:] разбирается как обычно).
       Без первого сообщения чат создаётся пустым: ни заглушек, ни пустых узлов, leafId = null —
       начать может пользователь или, по явному действию, модель (generation/service, режим opening).
       Сценарий карточки в сцену не переносится. Делает чат текущим и возвращает его id. */
    async function createChat(mode, cardId) {
      const cd = S.cards.find((x) => x.id === (cardId || S.cardId));
      if (!cd) return null;
      const c = { id: U.uid("chat"), cardId: cd.id, mode, title: mode === "messenger" ? "Переписка" : "Сцена", sceneInit: "", leafId: null, createdAt: Date.now() };
      S.chatId = c.id; S.cardId = cd.id; S.messages = [];
      if (mode === "rp" && (cd.firstMes || (cd.altGreetings || []).length)) {
        const vars = { char: cd.name, user: ctx.persona().name };
        const m = newMsg("assistant", null, "");
        m.opening = "authored";
        m.swipes = [cd.firstMes].concat(cd.altGreetings || []).filter(Boolean).map((g) => {
          const parsed = SC.parse(U.macros(g, vars));
          return { text: parsed.text, sceneOps: parsed.ops, createdAt: Date.now() };
        });
        await putMsg(m);
        c.leafId = m.id;
        c.preview = m.swipes[0].text.replace(/\s+/g, " ").slice(0, 90);
      }
      await putChat(c);
      return c.id;
    }
    function latestForCard(cardId) {
      return S.chats.filter((c) => c.cardId === cardId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
    }
    // Удалить чат целиком: сообщения, картинки и опыт этого мира. Состояние сбрасывается на «нет чата».
    async function deleteChat(c) {
      const ms = await DB.byIndex("messages", "chatId", c.id);
      await DB.delMany("experience", (await DB.byIndex("experience", "owner", c.cardId)).filter((x) => x.chatId === c.id).map((x) => x.id));
      await DB.delMany("messages", ms.map((m) => m.id));
      await DB.delMany("images", (await DB.byIndex("images", "chatId", c.id)).map((x) => x.id));
      await DB.del("chats", c.id);
      S.chats = S.chats.filter((x) => x.id !== c.id);
      S.chatId = null; S.messages = [];
    }

    /* ── Правки ветки ──────────────────────────────────────────────────── */
    // Удалить сообщение и всех его потомков; активной становится последняя оставшаяся ветка.
    async function deleteFrom(msgId) {
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const ids = [msgId].concat(TR.descendants(S.messages, msgId));
      const imgIds = [];
      S.messages.filter((x) => ids.includes(x.id)).forEach((x) => x.swipes.forEach((sw) => (sw.images || []).forEach((im) => imgIds.push(im.id))));
      await DB.delMany("images", imgIds);
      await DB.delMany("messages", ids);
      S.messages = S.messages.filter((x) => !ids.includes(x.id));
      const c = ctx.chat();
      const lastRoot = TR.children(S.messages, null).slice(-1)[0];
      c.leafId = m.parentId ? TR.latestLeaf(S.messages, m.parentId) : lastRoot ? TR.latestLeaf(S.messages, lastRoot.id) : null;
      await touch();
      return true;
    }
    async function saveEdit(msgId, text) {
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const sw = TR.activeSwipe(m);
      const parsed = SC.parse(text);
      sw.text = m.role === "assistant" ? parsed.text : text.trim();
      if (m.role === "assistant") sw.sceneOps = parsed.ops;
      await putMsg(m);
      await touch();
      return true;
    }
    /* Листать варианты ответа. → "regen", если надо сгенерировать новый вариант
       (листание вправо за последний вариант последнего ответа); true — переключено; false — ничего. */
    async function swipe(msgId, dir) {
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const next = (m.swipeIdx || 0) + dir;
      if (next < 0) return false;
      const isLast = path().slice(-1)[0] === m;
      if (next >= m.swipes.length) return m.role === "assistant" && isLast ? "regen" : false;
      m.swipeIdx = next;
      await putMsg(m);
      await touch();
      return true;
    }
    // Добавить пользовательский ответ в ветку: становится новым концом.
    async function addUserMessage(text) {
      const c = ctx.chat();
      const m = newMsg("user", c.leafId, text);
      await putMsg(m);
      c.leafId = m.id;
      await touch();
      return m;
    }

    /* ── Сцена из форм ─────────────────────────────────────────────────── */
    function op(subject, key, value) {
      return { subject: subject || undefined, key, value, raw: `${subject ? subject + "." : ""}${key}=${value}`, manual: true };
    }
    // Ручные изменения сцены пишутся в последнее сообщение ветки (или в начальную сцену пустого чата).
    async function applySceneOps(ops) {
      if (!ops.length) return false;
      const c = ctx.chat();
      const leaf = path().slice(-1)[0];
      if (leaf) {
        const sw = TR.activeSwipe(leaf);
        sw.sceneOps = (sw.sceneOps || []).concat(ops);
        await putMsg(leaf);
      } else {
        c.sceneInit = [c.sceneInit, ops.map((o) => o.raw).join("; ")].filter(Boolean).join("; ");
        await putChat(c);
      }
      return true;
    }

    /* ── Прочее ────────────────────────────────────────────────────────── */
    function exportText() {
      const c = ctx.chat(), cd = ctx.card();
      const lines = path().map((m) => `${m.role === "user" ? ctx.persona().name : cd.name}: ${TR.activeSwipe(m).text}`);
      return { name: `${cd.name} — ${c.title || "чат"}.txt`, text: lines.join("\n\n") };
    }

    return { path, sceneState, pathCtx, putMsg, putChat, touch, newMsg, loadMessages, createChat, latestForCard, deleteChat, deleteFrom, saveEdit, swipe, addUserMessage, op, applySceneOps, exportText };
  }

  PRP.chatService = { create };
})(typeof window !== "undefined" ? window : globalThis);
