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
    /* Сцена RP активной ветки. У переписки сцены нет (FOUNDATION-H): пустое состояние — служебные строки
       [scene:] в переписке (в том числе старые, сохранённые до разделения режимов) сцену не создают
       и не попадают ни в Prism, ни в картинки, ни в ассистента. */
    function sceneState(p) {
      const c = ctx.chat();
      if (c && c.mode === "messenger") return SC.fold("", []);
      return SC.fold(c ? c.sceneInit : "", (p || path()).map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })), {
        charName: ctx.card() && ctx.card().name, userName: ctx.persona() && ctx.persona().name,
      });
    }
    /* Служебная строка [scene:] из текста ответа: в сцене — операции сцены; в переписке — вырезается из текста,
       а операции хранятся в варианте только как неактивные (ignoredSceneOps, для совместимости и отладки). */
    function sceneFields(ops) {
      const c = ctx.chat();
      return c && c.mode === "messenger" ? { sceneOps: [], ignoredSceneOps: ops || [] } : { sceneOps: ops || [] };
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
    /* Атомарная запись сообщения и состояния чата (leafId, превью) — ОДНОЙ транзакцией (DB.putAll).
       Память (S.messages, текущий чат) меняется только после успеха; при отказе не меняется ничего — ни в базе, ни в памяти.
       msg — полная новая версия сообщения (вызывающий передаёт копию; объект в памяти обновляется на месте).
       leafId — новый конец ветки (undefined — прежний). → сообщение в памяти. */
    async function commitMessage(msg, leafId) {
      const c = ctx.chat();
      const m = JSON.parse(JSON.stringify(msg));
      const next = JSON.parse(JSON.stringify(c));
      if (leafId !== undefined) next.leafId = leafId;
      const p = TR.path(TR.index(S.messages.filter((x) => x.id !== m.id).concat([m])), next.leafId);
      const last = p.slice(-1)[0];
      next.preview = (last && last.role === "user" ? "Вы: " : "") + (last ? TR.activeSwipe(last).text : "").replace(/\s+/g, " ").slice(0, 90);
      await DB.putAll([["messages", m], ["chats", next]]);
      const i = S.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) { for (const k of Object.keys(S.messages[i])) if (!(k in m)) delete S.messages[i][k]; Object.assign(S.messages[i], m); }
      else S.messages.push(m);
      Object.assign(c, next);
      return i >= 0 ? S.messages[i] : m;
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
    // Режим задаётся только здесь и дальше не меняется: сцена остаётся сценой, переписка — перепиской.
    async function createChat(mode, cardId) {
      const cd = S.cards.find((x) => x.id === (cardId || S.cardId));
      if (!cd) return null;
      const c = { id: U.uid("chat"), cardId: cd.id, mode, title: mode === "messenger" ? "Переписка" : "Сцена", sceneInit: "", leafId: null, createdAt: Date.now() };
      let first = null;
      if (mode === "rp" && (cd.firstMes || (cd.altGreetings || []).length)) {
        const vars = { char: cd.name, user: ctx.persona().name };
        first = newMsg("assistant", null, "");
        first.chatId = c.id; // newMsg normally uses the currently selected chat
        first.opening = "authored";
        first.swipes = [cd.firstMes].concat(cd.altGreetings || []).filter(Boolean).map((g) => {
          const parsed = SC.parse(U.macros(g, vars));
          return { text: parsed.text, sceneOps: parsed.ops, createdAt: Date.now() };
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
    async function saveEdit(msgId, text) {
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const sw = TR.activeSwipe(m);
      const parsed = SC.parse(text);
      sw.text = m.role === "assistant" ? parsed.text : text.trim();
      if (m.role === "assistant") {
        // Правка текста переопределяет модельные дельты, но ручные корректировки
        // принадлежат пользователю и продолжают действовать ПОСЛЕ них.
        const manual = (sw.sceneOps || []).filter((o) => o.manual);
        delete sw.ignoredSceneOps;
        Object.assign(sw, sceneFields(parsed.ops.concat(manual)));
      }
      // Извлечённые факты зависят от исходного текста этого свайпа.
      // Изменение текста делает их недействительными до нового анализа.
      delete sw.stateEvents; delete sw.stateStatus;
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
    /* Добавить пользовательский ответ в ветку: становится новым концом.
       swipeExtra — неизменяемые сведения варианта, например метка времени переписки { messengerAt } (её даёт messenger/service). */
    async function addUserMessage(text, swipeExtra) {
      const c = ctx.chat();
      const m = newMsg("user", c.leafId, text);
      if (swipeExtra) Object.assign(m.swipes[0], swipeExtra);
      return commitMessage(m, m.id);
    }

    /* ── Сцена из форм ─────────────────────────────────────────────────── */
    function op(subject, key, value) {
      return { subject: subject || undefined, key, value, raw: `${subject ? subject + "." : ""}${key}=${value}`, manual: true };
    }
    // Ручные изменения сцены пишутся в последнее сообщение ветки (или в начальную сцену пустого чата).
    async function applySceneOps(ops) {
      if (!ops.length) return false;
      const c = ctx.chat();
      if (!c || c.mode === "messenger") return false; // у переписки сцены нет
      // Ручное изменение не записывается, если оно не может подействовать
      // (например, +15 минут при ещё неизвестном времени суток).
      const preview = SC.apply(sceneState(), ops, { charName: ctx.card() && ctx.card().name, userName: ctx.persona() && ctx.persona().name });
      if (preview.ignored.length || preview.applied.length !== ops.length) return false;
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

    return { path, sceneState, sceneFields, pathCtx, putMsg, putChat, touch, commitMessage, newMsg, loadMessages, createChat, latestForCard, deleteChat, deleteFrom, saveEdit, swipe, addUserMessage, op, applySceneOps, exportText, checkBackupChats };
  }

  PRP.chatService = { create };
})(typeof window !== "undefined" ? window : globalThis);
