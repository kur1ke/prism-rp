/* Prism RP — текстовый провайдер Perchance (ai-text-plugin).
   Плагин принимает не список сообщений, а инструкцию и начало ответа, поэтому
   адаптер разворачивает собранный Prism-контекст в стенограмму и просит
   продолжить её репликой персонажа. Инструкция передаётся ФУНКЦИЕЙ, чтобы
   Perchance не раскрывал [ ] и { } в тексте карточек и сообщений.
   Вне Perchance провайдер просто недоступен — ядро от него не зависит. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  function plugin() {
    if (typeof root.ai === "function") return root.ai;
    if (root.root && typeof root.root.ai === "function") return root.root.ai;
    return null;
  }

  function available() { return !!plugin(); }

  function meta() {
    const ai = plugin();
    if (!ai) return null;
    try { return ai({ getMetaObject: true }); } catch (e) { return null; }
  }

  /* messages из сборщика → { instruction, startWith, stop }
     closing — последняя строка инструкции вместо «Напиши следующее сообщение…» (проверка инициативы: персонаж
     может промолчать). Это часть инструкции, а не строка стенограммы: новой реплики пользователя не появляется. */
  function toPrompt(messages, names, closing, outputFormat) {
    const char = names.char || "Персонаж";
    const user = names.user || "Пользователь";
    // Perchance cannot accept structured chat roles. For Messenger we send
    // role-tagged *data* instead of a dialogue to complete as "Name: ...".
    // RP keeps its existing transcript/seed contract unchanged.
    const bodyOnly = outputFormat === "message-body";
    const sys = [], post = [], lines = [];
    let seenChat = false;
    for (const m of messages) {
      if (m.role === "system") (seenChat ? post : sys).push(m.content);
      else {
        seenChat = true;
        lines.push(bodyOnly
          ? JSON.stringify({ role: m.role, content: String(m.content || "") })
          : `${m.role === "user" ? user : char}: ${m.content}`);
      }
    }
    const instruction = [
      sys.join("\n\n"),
      bodyOnly ? "### История сообщений (JSON-строки: данные контекста, НЕ образец формата ответа)" : "### Переписка до этого момента",
      lines.join("\n\n") || "(пока пусто)",
      post.join("\n\n"),
      bodyOnly ? "### Формат ответа: только текст сообщения. Не копируй JSON, имена отправителей, метки ролей или подписи. Для нескольких сообщений используй пустую строку между ними." : "",
      closing ? String(closing) : bodyOnly
        ? `Напиши только содержимое сообщения, которое ${char} отправляет ${user}. Без имени отправителя или заголовка.`
        : `Напиши следующее сообщение ${char}. Только реплику ${char}, без пометок и без текста за ${user}.`,
    ].filter(Boolean).join("\n\n");
    return {
      instruction,
      startWith: bodyOnly ? "" : `${char}:`,
      // Retain the existing cross-speaker guard for transcript-like completions.
      stop: [`\n${user}:`, `\n\n${user}:`],
    };
  }

  // Тот же контракт, что у PRP.openai.chat: onDelta({text}), signal, возвращает {text, reasoning}
  // opts.continueFrom — продолжить уже начатый ответ: он уходит в startWith.
  function chat(names, messages, opts) {
    const o = opts || {};
    const ai = plugin();
    if (!ai) return Promise.reject(new Error("ai-text-plugin недоступен: приложение запущено не на Perchance."));
    const bodyOnly = o.outputFormat === "message-body";
    const p = toPrompt(messages, names, o.closing, o.outputFormat);
    if (o.continueFrom) p.startWith = bodyOnly ? o.continueFrom : `${names.char || "Персонаж"}: ${o.continueFrom}`;
    let started = false, text = "";
    const handle = ai({
      instruction: () => p.instruction,
      startWith: () => p.startWith,
      stopSequences: () => p.stop,
      hideStartWith: true,
      onChunk: (data) => {
        if (data.isFromStartWith) return;
        let chunk = data.textChunk || "";
        if (!started) { chunk = chunk.replace(/^\s+/, ""); if (chunk) started = true; }
        if (!chunk) return;
        text += chunk;
        if (o.onDelta) o.onDelta({ text: chunk, reasoning: "" });
      },
    });
    if (o.signal) o.signal.addEventListener("abort", () => { try { handle.stop(); } catch (e) {} }, { once: true });
    return Promise.resolve(handle).then((res) => {
      // In body-only mode, streaming already excludes the transport seed
      // (isFromStartWith). Prefer that exact body over generatedText, whose
      // inclusion of startWith varies across plugin versions.
      let out = bodyOnly && text ? text : (res && res.generatedText != null ? String(res.generatedText) : text);
      if (bodyOnly && !text && p.startWith && out.startsWith(p.startWith)) {
        out = out.slice(p.startWith.length); // remove only our exact seed, never a model-written name
      }
      out = out.replace(/^\s+/, "");
      // Transcript continuation guard is RP-only. Messenger content (including
      // quoted names) is not rewritten or stripped by a UI-facing regex.
      if (!bodyOnly) out = out.split(new RegExp(`\\n+${escapeRe(names.user || "Пользователь")}:`))[0];
      if (o.signal && o.signal.aborted) {
        const e = new Error("Остановлено"); e.name = "AbortError"; e.partial = out; throw e;
      }
      return { text: out.trim(), reasoning: "", finish: "stop" };
    });
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Простой вызов без стриминга: служебные задачи (перевод промпта картинки).
  async function simple(instruction) {
    const ai = plugin();
    if (!ai) throw new Error("ai-text-plugin недоступен");
    const res = await ai({ instruction: () => instruction });
    return res && res.generatedText != null ? String(res.generatedText) : String(res || "");
  }

  PRP.perchance = { available, meta, chat, toPrompt, simple };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.perchance;
})(typeof window !== "undefined" ? window : globalThis);
