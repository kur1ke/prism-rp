/* Prism RP — сервис мира чата (прикладной уровень): наложение мира на чат, канон с учётом ветки,
   отбор фактов для Prism и явные действия пользователя.

   • Хранение: коллекция worldOverlays, одна запись на чат (ключ chatId). В S — только наложение текущего чата.
   • Канон: пак и линза персонажа чата (world/resolve) + наложение + активная ветка (world/canon),
     затем отбор по таймлайну/варианту чата и по релевантности (world/retrieve).
   • Для генерации всё только читается: context() ничего не пишет. Наложение меняется только
     явным действием пользователя (commit, setSelectors) — никогда из ответа модели, сцены, опыта или сценария.
   DOM не трогает; ветку и сцену берёт у сервиса чата, пак и линзу — у сервиса мира (W1). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const OV = PRP.worldOverlay, WC = PRP.worldCanon, WRT = PRP.worldRetrieve, WR = PRP.worldResolve, BR = PRP.branch, TR = PRP.tree;

  const STORE = "worldOverlays";
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function create(ctx) {
    const { S, DB } = ctx;
    const chat = () => ctx.svc.chat, world = () => ctx.svc.world;

    async function load(chatId) {
      const rec = chatId ? await DB.get(STORE, chatId) : null;
      S.worldOverlay = rec ? OV.normalize(rec, chatId) : chatId ? OV.blank(chatId) : null;
      return S.worldOverlay;
    }
    // Наложение текущего чата (только из S, без хранилища). Чужое наложение не возвращается никогда.
    function current() {
      const c = ctx.chat();
      if (!c) return null;
      return S.worldOverlay && S.worldOverlay.chatId === c.id ? S.worldOverlay : OV.blank(c.id);
    }

    // Слой W1 для персонажа чата: пак + линза. Нет линзы — нет пака; линза к пропавшему паку — предупреждение.
    function base() {
      const cd = ctx.card();
      const lens = cd && world() ? world().lensForCard(cd.id) : null;
      if (!lens) return { base: null, lens: null, pack: null };
      const pack = world().packById(lens.packId);
      if (!pack) return { base: { facts: [], excluded: [], report: { warnings: [{ level: "warning", code: "pack-missing", message: `Пак мира ${lens.packId} не найден.`, ref: lens.packId }] } }, lens, pack: null };
      return { base: WR.resolve(pack, lens), lens, pack };
    }

    /* Канон для ветки p (по умолчанию — активной): действующие факты, исключения, события, отбор по селекторам. */
    function canon(p) {
      const c = ctx.chat();
      const path = p || chat().path();
      const ov = current();
      const b = base();
      const r = WC.resolveChat(b.base, ov, { chatId: c ? c.id : null, path: chat().pathCtx(path) });
      const sel = WC.filterSelectors(r.facts, { timeline: ov ? ov.timeline : "", variant: ov ? ov.variant : "" });
      return Object.assign(r, { eligible: sel.eligible, filtered: sel.filtered, overlay: ov, lens: b.lens, pack: b.pack });
    }

    /* Для Prism (только чтение). → { facts: отобранные в порядке релевантности, report } */
    function context(p, scene) {
      const c = ctx.chat(), cd = ctx.card();
      if (!c || !cd) return { facts: [], report: null };
      const path = p || chat().path();
      const k = canon(path);
      const history = path.map((m) => TR.activeSwipe(m).text).filter(Boolean);
      const st = scene || chat().sceneState(path);
      const lens = k.lens || {};
      const r = WRT.retrieve(k.eligible, {
        text: history.slice(-4).join("\n"), sceneLoc: st.loc || "", present: st.present || [],
        skipNames: [cd.name, ctx.persona().name], focusEntities: lens.focusEntities, focusTopics: lens.focusTopics,
        relevanceHints: lens.relevanceHints, limit: S.settings && S.settings.worldLimit != null ? S.settings.worldLimit : WRT.DEFAULT_LIMIT,
      });
      return {
        facts: r.ranked,
        report: {
          effective: k.facts.length, eligible: k.eligible.length, relevant: r.relevantCount, selected: r.ranked.length,
          filtered: k.filtered, excluded: k.excluded, inactiveEvents: k.events.filter((e) => !e.active).length,
          rows: r.rows, warnings: k.warnings, timeline: k.overlay ? k.overlay.timeline : "", variant: k.overlay ? k.overlay.variant : "",
        },
      };
    }

    /* Явное действие пользователя: черновик → проверка → привязка (ветка/чат) → сохранение.
       draft: { op, targetFactId?, fact?, scope: "branch" | "chat", note? }. Ветку без сообщений не к чему привязать —
       сохранение отклоняется, область сама на «весь чат» не меняется. → { entry } | { error, issues } */
    async function commit(draft) {
      const c = ctx.chat();
      if (!c) return { error: "Откройте чат." };
      const path = chat().path();
      const anchor = draft && draft.scope === "branch" ? BR.anchorOf(chat().pathCtx(path)) : null;
      const entry = OV.makeEntry(Object.assign({}, draft, { anchor }));
      const k = canon(path);
      const issues = OV.validateNew(entry, { ids: new Set(k.known) });
      if (OV.hasErrors(issues)) return { error: issues.filter((x) => x.level === "error").map((x) => x.message).join(" "), issues };
      const next = clone(current());
      next.entries.push(entry);
      await DB.put(STORE, next);
      S.worldOverlay = next;
      return { entry, issues };
    }
    // Явный выбор таймлайна и варианта чата (селекторы отбора). Пак и линза не меняются.
    async function setSelectors(sel) {
      const c = ctx.chat();
      if (!c) return null;
      const next = clone(current());
      next.timeline = String((sel && sel.timeline) || "").trim();
      next.variant = String((sel && sel.variant) || "").trim();
      await DB.put(STORE, next);
      S.worldOverlay = next;
      return next;
    }
    // Чат удалён — его наложение тоже (каждый чат — свой мир). Пак и линза не трогаются.
    async function removeForChat(chatId) {
      await DB.del(STORE, chatId);
      if (S.worldOverlay && S.worldOverlay.chatId === chatId) S.worldOverlay = null;
    }
    /* Восстановление бэкапа: проверка ДО записи. Запись мира чата принимается, только если:
         • сама запись проходит проверку (OV.validateOverlay: объект, есть chatId, entries — список);
         • её чат существует там, куда восстанавливаем:
             замена (replace: true, по умолчанию) — только чаты из самого бэкапа (data.chats);
             добавление (replace: false) — чаты из бэкапа ∪ уже существующие (existingChatIds);
         • в бэкапе это единственная запись для этого чата. Если записей для одного chatId несколько —
           отбрасываются ВСЕ записи этого чата: какая из них верна, неизвестно, истории не сливаются.
       Ничего не переназначается и не подбирается: запись без своего чата не пишется.
       Битые события внутри принятой записи остаются (видны в отчёте и не применяются).
       opts: { replace, existingChatIds } — режим и id локальных чатов даёт вызывающий (DOM здесь нет).
       → { data, rejected, warnings, issues: [{ level, code, message, chatId? }] } */
    function checkBackup(data, opts) {
      if (!data || !Array.isArray(data[STORE])) return { data, rejected: 0, warnings: 0, issues: [] };
      const o = opts || {};
      const replace = o.replace !== false;
      const valid = new Set((Array.isArray(data.chats) ? data.chats : []).filter((c) => c && c.id).map((c) => String(c.id)));
      if (!replace) for (const id of o.existingChatIds || []) valid.add(String(id));
      const issues = [];
      let rejected = 0, warnings = 0;
      const perChat = new Map();
      for (const rec of data[STORE]) {
        const id = rec && typeof rec === "object" ? String(rec.chatId || "").trim() : "";
        if (id) perChat.set(id, (perChat.get(id) || 0) + 1);
      }
      const ok = [];
      for (const rec of data[STORE]) {
        const iss = OV.validateOverlay(rec);
        if (OV.hasErrors(iss)) { rejected++; issues.push(...iss.filter((x) => x.level === "error")); continue; }
        const chatId = String(rec.chatId).trim();
        if (perChat.get(chatId) > 1) {
          rejected++;
          issues.push({ level: "error", code: "overlay-duplicate-chat", message: "В бэкапе несколько записей мира для одного чата — ни одна не восстановлена.", chatId });
          continue;
        }
        if (!valid.has(chatId)) {
          rejected++;
          issues.push({ level: "error", code: "overlay-orphan-chat", message: "Запись мира относится к чату, которого нет" + (replace ? " в бэкапе." : " ни в бэкапе, ни здесь."), chatId });
          continue;
        }
        warnings += iss.length;
        issues.push(...iss.map((x) => Object.assign({ chatId }, x)));
        ok.push(OV.normalize(rec));
      }
      return { data: Object.assign({}, data, { [STORE]: ok }), rejected, warnings, issues };
    }

    // Для вкладки «Мир чата»: канон активной ветки, исключения и история событий.
    function view() {
      const c = ctx.chat();
      if (!c) return null;
      const path = chat().path();
      const k = canon(path);
      const filteredIds = new Set(k.filtered.map((x) => x.id));
      return { facts: k.facts, filtered: k.filtered, filteredIds, excluded: k.excluded, events: k.events, warnings: k.warnings,
        overlay: k.overlay, lens: k.lens, pack: k.pack, canBranch: path.length > 0 };
    }

    return { load, current, canon, context, commit, setSelectors, removeForChat, checkBackup, view, STORE };
  }

  PRP.worldOverlayService = { create };
})(typeof window !== "undefined" ? window : globalThis);
