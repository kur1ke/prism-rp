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
    // Structured tasks have no dialogue seed, speaker stops or Messenger prose rules.
    // Roles of non-system messages remain explicit data, including embedded JSON.
    if (outputFormat === "json") {
      return {
        instruction: messages.map((m) => m.role === "system" ? String(m.content || "")
          : JSON.stringify({ role: m.role, content: String(m.content || "") }))
          .concat(closing ? String(closing) : "",
            "Верни только JSON согласно заданной схеме. Без Markdown и текста вне JSON.")
          .filter(Boolean).join("\n\n"),
        startWith: "", stop: [],
      };
    }
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

  const IMAGE_NOTE = "\n\nК последнему сообщению пользователя прикреплено изображение. Это фотография в переписке, а не свидетельство текущей обстановки персонажа. Ответь в роли персонажа с учётом действительно видимого на снимке.\n";

  // Pure preparation shared by budget estimation and the actual plugin call.
  function prepareChat(names, messages, opts) {
    const o = opts || {}, n = names || {};
    let history = messages;
    const continuing = !!o.continueFrom && o.outputFormat !== "json";
    if (continuing) {
      // The selected reply is the completion seed, not a second completed turn.
      // Preserve trailing system instructions and any non-matching history.
      let last = messages.length - 1;
      while (last >= 0 && messages[last].role === "system") last--;
      if (last >= 0 && messages[last].role === "assistant" && messages[last].content === o.continueFrom)
        history = messages.filter((_, i) => i !== last);
    }
    const closing = o.closing || (continuing
      ? `Продолжи уже начатое сообщение ${n.char || "Персонаж"} с конца заданного начала. Верни только новый текст продолжения, без повторения начала и без новой реплики за ${n.user || "Пользователь"}.`
      : null);
    const p = toPrompt(history, n, closing, o.outputFormat);
    if (o.continueFrom) p.startWith = o.outputFormat === "message-body" || o.outputFormat === "json"
      ? o.continueFrom : `${n.char || "Персонаж"}: ${o.continueFrom}`;
    if (o.imageDataUrl) p.instruction += IMAGE_NOTE;
    return p;
  }

  function inputCost(names, messages, opts) {
    const p = prepareChat(names, messages, opts);
    return PRP.util.estimateTokens(p.instruction) + PRP.util.estimateTokens(p.startWith);
  }

  // Тот же контракт, что у PRP.openai.chat: onDelta({text}), signal, возвращает {text, reasoning}
  // opts.continueFrom — продолжить уже начатый ответ: он уходит в startWith.
  function chat(names, messages, opts) {
    const o = opts || {};
    if (o.signal && o.signal.aborted) return Promise.reject(abortError(""));
    const ai = plugin();
    if (!ai) return Promise.reject(new Error("ai-text-plugin недоступен: приложение запущено не на Perchance."));
    const bodyOnly = o.outputFormat === "message-body";
    const unprefixed = bodyOnly || o.outputFormat === "json";
    const p = prepareChat(names, messages, o);
    return generate(ai, p, o, names, unprefixed, false);
  }

  // Shared cancellation lifecycle; simple requests keep their raw instruction
  // and result format, without dialogue wrappers or a response seed.
  function generate(ai, p, o, names, unprefixed, simple) {
    let started = false, text = "";
    function outputText(res) {
      if (simple) return res && res.generatedText != null ? String(res.generatedText)
        : res == null ? text : String(res || "");
      // Streaming already excludes the transport seed, including RP continuation.
      // (isFromStartWith). Prefer that exact body over generatedText, whose
      // inclusion of startWith varies across plugin versions.
      const seeded = unprefixed || !!o.continueFrom;
      let out = seeded && text ? text : (res && res.generatedText != null ? String(res.generatedText) : text);
      if (seeded && !text && p.startWith && out.startsWith(p.startWith)) {
        out = out.slice(p.startWith.length); // remove only our exact seed, never a model-written name
      }
      out = out.replace(/^\s+/, "");
      // Transcript continuation guard is RP-only. Messenger content (including
      // quoted names) and structured JSON are not cut by speaker-name regexes.
      if (!unprefixed) out = out.split(new RegExp(`\\n+${escapeRe(names.user || "Пользователь")}:`))[0];
      return out;
    }
    return new Promise((resolve, reject) => {
      let finished = false, handle, stopped = false;
      const finish = (settle, value) => {
        if (finished) return;
        finished = true;
        if (o.signal) o.signal.removeEventListener("abort", onAbort);
        settle(value);
      };
      const stopHandle = () => {
        if (!handle || stopped) return;
        stopped = true;
        try { if (typeof handle.stop === "function") handle.stop(); } catch (_) {}
      };
      const onAbort = () => {
        finish(reject, abortError(outputText(null)));
        stopHandle();
      };
      if (o.signal) {
        o.signal.addEventListener("abort", onAbort, { once: true });
        if (o.signal.aborted) { onAbort(); return; }
      }
      const imageBlob = o.imageDataUrl ? awaitImageBlob(o.imageDataUrl, o.signal) : null;
      Promise.resolve(imageBlob).then((blob) => {
        if (finished) return;
        handle = ai({
          instruction: () => blob ? [p.instruction, blob] : p.instruction,
          ...(simple ? {} : { startWith: () => p.startWith, stopSequences: () => p.stop, hideStartWith: true }),
          onChunk: (data) => {
            if (finished || (o.signal && o.signal.aborted)) return;
            if (data.isFromStartWith) return;
            let chunk = data.textChunk || "";
            if (!started) { chunk = chunk.replace(/^\s+/, ""); if (chunk) started = true; }
            if (!chunk) return;
            text += chunk;
            if (o.onDelta) o.onDelta({ text: chunk, reasoning: "" });
          },
        });
        // Abort can happen synchronously inside ai(), before it returns its handle.
        if (finished) stopHandle();
        return Promise.resolve(handle).then((res) => {
          if (finished) return;
          return { text: simple ? outputText(res) : outputText(res).trim(), reasoning: "", finish: "stop" };
        });
      }).then((result) => finish(resolve, result), (error) => finish(reject, error));
    });
  }

  function abortError(partial) {
    const e = new Error("Остановлено"); e.name = "AbortError"; e.partial = partial;
    return e;
  }

  async function awaitImageBlob(url, signal) {
    const response = await fetch(url, { signal });
    if (signal && signal.aborted) throw abortError("");
    if (!response.ok) throw new Error("Не удалось прочитать вложение");
    return response.blob();
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Простой вызов без стриминга: служебные задачи (перевод промпта картинки).
  async function simple(instruction, options) {
    const o = options || {};
    if (o.signal && o.signal.aborted) throw abortError("");
    const ai = plugin();
    if (!ai) throw new Error("ai-text-plugin недоступен");
    const res = await generate(ai, { instruction }, o, {}, true, true);
    return res.text;
  }

  PRP.perchance = { available, meta, chat, toPrompt, prepareChat, inputCost, simple };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.perchance;
})(typeof window !== "undefined" ? window : globalThis);
