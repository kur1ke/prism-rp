/* Prism RP — сервис чата (прикладной уровень).
   Жизненный цикл чата и его сообщений: загрузка, создание с приветствием, правка,
   варианты, удаление ветки и чата, сохранение.
   Алгоритмы дерева — в chat/tree.js, состояние — в state/tracker.js; здесь только
   их применение к текущему чату и сохранение через хранилище.
   Зависимости передаются в create(ctx): состояние сессии S, хранилище DB, геттеры. DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree;

  function create(ctx) {
    const { S, DB } = ctx;

    /* ── Путь активной ветки ───────────────────────────────────── */
    function path() {
      const c = ctx.chat();
      return c ? TR.path(TR.index(S.messages), c.leafId) : [];
    }
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
    /* Атомарная запись сообщения и состояния чата (leafId, превью) — ОДНОЙ транзакцией (DB.putAll).
       Память (S.messages, текущий чат) меняется только после успеха; при отказе не меняется ничего — ни в базе, ни в памяти.
       msg — полная новая версия сообщения (вызывающий передаёт копию; объект в памяти обновляется на месте).
       leafId — новый конец ветки (undefined — прежний). → сообщение в памяти. */
    async function commitMessage(msg, leafId, edgeUpdates) {
      const c = ctx.chat();
      const m = JSON.parse(JSON.stringify(msg));
      const next = JSON.parse(JSON.stringify(c));
      if (leafId !== undefined) next.leafId = leafId;
      const p = TR.path(TR.index(S.messages.filter((x) => x.id !== m.id).concat([m])), next.leafId);
      const last = p.slice(-1)[0];
      next.preview = (last && last.role === "user" ? "Вы: " : "") + (last ? TR.activeSwipe(last).text : "").replace(/\s+/g, " ").slice(0, 90);
      if (edgeUpdates && edgeUpdates.length) {
        await DB.mutateBatch({ patches: edgeUpdates.map((x) => ["messages", x.id, { parentSwipeIdx: x.parentSwipeIdx }]), puts: [["messages", m], ["chats", next]] });
      } else await DB.putAll([["messages", m], ["chats", next]]);
      for (const update of edgeUpdates || []) {
        const existing = S.messages.find((x) => x.id === update.id);
        if (existing) existing.parentSwipeIdx = update.parentSwipeIdx;
      }
      const i = S.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) { for (const k of Object.keys(S.messages[i])) if (!(k in m)) delete S.messages[i][k]; Object.assign(S.messages[i], m); }
      else S.messages.push(m);
      Object.assign(c, next);
      return i >= 0 ? S.messages[i] : m;
    }
    function newMsg(role, parentId, text) {
      const now = Date.now();
      const parent = parentId && S.messages.find((m) => m.id === parentId && m.chatId === S.chatId);
      return { id: U.uid("m"), chatId: S.chatId, parentId: parentId || null,
        ...(parent ? { parentSwipeIdx: parent.swipeIdx || 0 } : {}),
        role, swipes: [{ text: text || "", createdAt: now }], swipeIdx: 0, createdAt: now };
    }

    /* ── Жизненный цикл ────────────────────────────────────────────────── */
    function loadMessages(chatId) { return DB.byIndex("messages", "chatId", chatId); }

    /* Новый чат. Режим «Сцена»: первое сообщение карточки и альтернативные приветствия — авторское
       начало, варианты одного корневого сообщения (без вызова модели; состояние извлекается Observer).
       Без первого сообщения чат создаётся пустым: ни заглушек, ни пустых узлов, leafId = null —
       начать может пользователь или, по явному действию, модель (generation/service, режим opening).
       Сценарий карточки в сцену не переносится. Делает чат текущим и возвращает его id. */
    // Режим задаётся только здесь и дальше не меняется: сцена остаётся сценой, переписка — перепиской.
    async function createChat(mode, cardId) {
      const cd = S.cards.find((x) => x.id === (cardId || S.cardId));
      if (!cd) return null;
      const c = { id: U.uid("chat"), cardId: cd.id, mode, title: mode === "messenger" ? "Переписка" : "Сцена", leafId: null, createdAt: Date.now() };
      let first = null;
      if (mode === "rp" && (cd.firstMes || (cd.altGreetings || []).length)) {
        const vars = { char: cd.name, user: ctx.persona().name };
        first = newMsg("assistant", null, "");
        first.chatId = c.id; // newMsg normally uses the currently selected chat
        first.opening = "authored";
        first.swipes = [cd.firstMes].concat(cd.altGreetings || []).filter(Boolean).map((g) => {
          return { text: U.macros(g, vars), createdAt: Date.now() };
        });
        c.leafId = first.id;
        c.preview = first.swipes[0].text.replace(/\s+/g, " ").slice(0, 90);
      }
      // Failure cannot leave an orphan opening or a chat without its root.
      await DB.putAll([["chats", c]].concat(first ? [["messages", first]] : []));
      S.chats.push(c);
      S.chatId = c.id; S.cardId = cd.id; S.messages = first ? [first] : [];
      return c.id;
    }
    function latestForCard(cardId) {
      return S.chats.filter((c) => c.cardId === cardId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
    }
    // Удалить чат целиком: сообщения, картинки, опыт, наложение мира и среду переписки этого чата. Состояние сбрасывается на «нет чата».
    async function deleteChat(c) {
      if (S.gen) throw new Error("Нельзя удалять чат во время незавершённого хода.");
      // Retire before awaiting any database operation: late Memory jobs may no
      // longer commit evidence to a chat that is being removed.
      if (ctx.svc.memory) ctx.svc.memory.retireChat(c.id);
      try {
      const ms = await DB.byIndex("messages", "chatId", c.id);
      const ex = (await DB.byIndex("experience", "owner", c.cardId)).filter((x) => x.chatId === c.id);
      const memories = await DB.byIndex("memories", "chatId", c.id);
      const reflections = await DB.byIndex("reflections", "chatId", c.id);
      const sources = await DB.byIndex("memorySources", "chatId", c.id);
      const images = await DB.byIndex("images", "chatId", c.id);
      const deletes = [
        ...ms.map(x => ["messages", x.id]), ...ex.map(x => ["experience", x.id]),
        ...memories.map(x => ["memories", x.id]), ...reflections.map(x => ["reflections", x.id]),
        ...sources.map(x => ["memorySources", x.id]), ...images.map(x => ["images", x.id]),
        ["worldOverlays", c.id], ["messengerEnvironments", c.id], ["chats", c.id]
      ];
      await DB.mutateBatch({ deletes });
      } catch (e) {
        if (ctx.svc.memory && ctx.svc.memory.restoreChat) ctx.svc.memory.restoreChat(c.id);
        throw e;
      }
      S.chats = S.chats.filter((x) => x.id !== c.id);
      if (S.worldOverlay && S.worldOverlay.chatId === c.id) S.worldOverlay = null;
      if (S.messengerEnv && S.messengerEnv.chatId === c.id) S.messengerEnv = null;
      if (S.chatId === c.id) { S.chatId = null; S.messages = []; }
    }

    /* ── Правки ветки ──────────────────────────────────────────────────── */
    // Delete the selected node and its descendants as one transaction with
    // the new chat leaf and preview. On abort S and IndexedDB remain unchanged.
    async function deleteFrom(msgId) {
      if (S.gen) throw new Error("Нельзя удалять ветку во время незавершённого хода.");
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const ids = [msgId].concat(TR.descendants(S.messages, msgId));
      const removed = new Set(ids);
      const imgIds = [];
      S.messages.filter(x => removed.has(x.id)).forEach(x =>
        x.swipes.forEach(sw => (sw.images || []).forEach(im => imgIds.push(im.id))));
      const remaining = S.messages.filter(x => !removed.has(x.id));
      const c = ctx.chat();
      const next = JSON.parse(JSON.stringify(c));
      const lastRoot = TR.children(remaining, null).slice(-1)[0];
      next.leafId = m.parentId ? TR.latestLeaf(remaining, m.parentId) :
        lastRoot ? TR.latestLeaf(remaining, lastRoot.id) : null;
      const leaf = TR.path(TR.index(remaining), next.leafId).slice(-1)[0];
      const text = leaf ? TR.activeSwipe(leaf).text : "";
      next.preview = (leaf && leaf.role === "user" ? "Вы: " : "") +
        String(text || "").replace(/\s+/g, " ").slice(0, 90);
      await DB.mutateBatch({ deletes: [
        ...imgIds.map(id => ["images", id]), ...ids.map(id => ["messages", id])
      ], puts: [["chats", next]] });
      S.messages = remaining;
      Object.assign(c, next);
      return true;
    }
    function editDraft(msgId, text) {
      const m = S.messages.find((x) => x.id === msgId);
      const body = String(text || "").trim(), c = ctx.chat();
      if (!c || !m || m.chatId !== c.id || m.role !== "user" || !path().includes(m) || !body || body === TR.activeSwipe(m).text) return null;
      const draft = newMsg("user", m.parentId, body);
      // A sibling replaces this user turn, not the character's reply. Keep
      // immutable delivery metadata, never copy extracted state from old text.
      draft.editedFrom = m.id;
      for (const key of ["messengerAt", "imageDataUrl"]) {
        const value = TR.activeSwipe(m)[key];
        if (value !== undefined) draft.swipes[0][key] = U.clone(value);
      }
      return draft;
    }
    // Freeze only the path actually visible now. Unknown variants of other
    // legacy branches cannot be reconstructed and must not be guessed.
    function unboundEdges() {
      const active = path();
      return active.slice(1).flatMap((m, i) => m.parentSwipeIdx == null && m.parentId === active[i].id
        ? [Object.assign({}, m, { parentSwipeIdx: active[i].swipeIdx || 0 })] : []);
    }
    async function saveEdit(msgId, text, opts) {
      const o = opts || {};
      if (S.gen || (S.turn && S.turn !== o.turn)) return false;
      const draft = editDraft(msgId, text);
      if (!draft) return false;
      if (o.draftId) draft.id = o.draftId;
      return commitMessage(draft, draft.id, unboundEdges());
    }

    async function selectBranch(msgId, swipeIdx) {
      const c = ctx.chat();
      if (!c || S.gen || S.turn) return false;
      const messages = S.messages.filter((m) => m.chatId === c.id);
      const route = TR.selection(messages, msgId, swipeIdx);
      if (!route) return false;
      const updateMap = new Map(unboundEdges().map((m) => [m.id, m]));
      route.forEach((p) => {
        const m = messages.find((x) => x.id === p.id);
        if (m.swipeIdx !== p.swipeIdx) updateMap.set(m.id, Object.assign({}, updateMap.get(m.id) || m, { swipeIdx: p.swipeIdx }));
      });
      const updates = [...updateMap.values()];
      const leaf = messages.find((m) => m.id === msgId);
      const chosen = route[route.length - 1].swipeIdx;
      const next = Object.assign({}, c, { leafId: msgId, preview: (leaf.role === "user" ? "Вы: " : "") + String(leaf.swipes[chosen].text || "").replace(/\s+/g, " ").slice(0, 90) });
      const lock = S.turn = { chatId: c.id, kind: "branch", phase: "branch" };
      try {
        const fields = (m) => Object.assign({ swipeIdx: m.swipeIdx || 0 }, m.parentSwipeIdx == null ? {} : { parentSwipeIdx: m.parentSwipeIdx });
        await DB.mutateBatch({ patches: updates.map((m) => ["messages", m.id, fields(m)]), puts: [["chats", next]] });
        for (const update of updates) Object.assign(S.messages.find((m) => m.id === update.id), fields(update));
        Object.assign(c, next);
        S.editingMsg = null;
        return true;
      } finally { if (S.turn === lock) S.turn = null; }
    }
    /* Листать варианты ответа. → "regen", если надо сгенерировать новый вариант
       (листание вправо за последний вариант последнего ответа); true — переключено; false — ничего. */
    async function swipe(msgId, dir) {
      const c = ctx.chat();
      if (!c || S.gen || S.turn) return false;
      const m = S.messages.find((x) => x.id === msgId);
      if (!m || m.chatId !== c.id) return false;
      const next = (m.swipeIdx || 0) + dir;
      if (!Number.isInteger(next) || next < 0) return false;
      const isLast = path().slice(-1)[0] === m;
      if (next >= m.swipes.length) return m.role === "assistant" && isLast ? "regen" : false;
      const lock = S.turn = { chatId: c.id, kind: "branch", phase: "branch" };
      try {
        // Preserve the current leaf and service-level ancestor swipe semantics.
        // Publish the selection only after message + preview commit together.
        await commitMessage(Object.assign({}, m, { swipeIdx: next }));
        return true;
      } finally { if (S.turn === lock) S.turn = null; }
    }
    /* Добавить пользовательский ответ в ветку: становится новым концом.
       swipeExtra — неизменяемые сведения варианта, например метка времени переписки { messengerAt } (её даёт messenger/service). */
    async function addUserMessage(text, swipeExtra) {
      const c = ctx.chat();
      const m = newMsg("user", c.leafId, text);
      if (swipeExtra) Object.assign(m.swipes[0], swipeExtra);
      return commitMessage(m, m.id);
    }

    /* ── Сцена из форм ─────────────────────────────────────────────────── */
    /* ── Бэкап ─────────────────────────────────────────────────────────── */
    /* Восстановление ДОБАВЛЕНИЕМ: локальный чат главнее входящего с тем же id в вопросе режима (режим фиксирован).
       Входящий чат с тем же id, но другим режимом отклоняется до записи вместе со всем, что к нему привязано
       (сообщения, картинки, опыт, наложение мира, среда переписки): иначе чужие сообщения попали бы в местный чат
       или режим переключился бы молча. При замене локальных чатов не остаётся — конфликтов нет.
       opts: { replace, existingChats: [{ id, mode }] } → { data, rejected, issues } */
    const CHAT_BOUND = [["messages", "chatId"], ["images", "chatId"], ["experience", "chatId"], ["memories", "chatId"], ["reflections", "chatId"], ["memorySources", "chatId"], ["worldOverlays", "chatId"], ["messengerEnvironments", "chatId"]];
    function checkBackupChats(data, opts) {
      const o = opts || {};
      if (!data || o.replace !== false || !Array.isArray(data.chats)) return { data, rejected: 0, issues: [] };
      const local = new Map((o.existingChats || []).filter((c) => c && c.id).map((c) => [String(c.id), c.mode || "rp"]));
      const conflict = new Set(), issues = [];
      for (const c of data.chats) {
        if (!c || !c.id || !local.has(String(c.id))) continue;
        const incoming = c.mode || "rp", here = local.get(String(c.id));
        if (incoming !== here) {
          conflict.add(String(c.id));
          issues.push({ level: "error", code: "chat-mode-conflict", message: `Чат в бэкапе — ${incoming === "messenger" ? "переписка" : "сцена"}, а здесь с тем же id — ${here === "messenger" ? "переписка" : "сцена"}: режим не меняется, чат из бэкапа не восстановлен.`, chatId: String(c.id) });
        }
      }
      if (!conflict.size) return { data, rejected: 0, issues };
      const out = Object.assign({}, data, { chats: data.chats.filter((c) => !(c && conflict.has(String(c.id)))) });
      for (const [store, key] of CHAT_BOUND) if (Array.isArray(data[store])) out[store] = data[store].filter((x) => !(x && conflict.has(String(x[key]))));
      return { data: out, rejected: conflict.size, issues };
    }

    /* ── Прочее ────────────────────────────────────────────────────────── */
    function exportText() {
      const c = ctx.chat(), cd = ctx.card();
      const lines = path().map((m) => `${m.role === "user" ? ctx.persona().name : cd.name}: ${TR.activeSwipe(m).text}`);
      return { name: `${cd.name} — ${c.title || "чат"}.txt`, text: lines.join("\n\n") };
    }

    return { path, pathCtx, putMsg, putChat, touch, commitMessage, newMsg, loadMessages, createChat, latestForCard, deleteChat, deleteFrom, editDraft, saveEdit, selectBranch, swipe, addUserMessage, exportText, checkBackupChats };
  }

  PRP.chatService = { create };
})(typeof window !== "undefined" ? window : globalThis);
