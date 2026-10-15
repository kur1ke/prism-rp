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

  // messages из сборщика → { instruction, startWith, stop }
  function toPrompt(messages, names) {
    const char = names.char || "Персонаж";
    const user = names.user || "Пользователь";
    const sys = [], post = [], lines = [];
    let seenChat = false;
    for (const m of messages) {
      if (m.role === "system") (seenChat ? post : sys).push(m.content);
      else {
        seenChat = true;
        lines.push(`${m.role === "user" ? user : char}: ${m.content}`);
      }
    }
    const instruction = [
      sys.join("\n\n"),
      "### Переписка до этого момента",
      lines.join("\n\n") || "(пока пусто)",
      post.join("\n\n"),
      `Напиши следующее сообщение ${char}. Только реплику ${char}, без пометок и без текста за ${user}.`,
    ].filter(Boolean).join("\n\n");
    return {
      instruction,
      startWith: `${char}:`,
      stop: [`\n${user}:`, `\n\n${user}:`],
    };
  }

  // Тот же контракт, что у PRP.openai.chat: onDelta({text}), signal, возвращает {text, reasoning}
  // opts.continueFrom — продолжить уже начатый ответ: он уходит в startWith.
  function chat(names, messages, opts) {
    const o = opts || {};
    const ai = plugin();
    if (!ai) return Promise.reject(new Error("ai-text-plugin недоступен: приложение запущено не на Perchance."));
    const p = toPrompt(messages, names);
    if (o.continueFrom) p.startWith = `${names.char || "Персонаж"}: ${o.continueFrom}`;
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
      let out = (res && res.generatedText != null ? String(res.generatedText) : text).replace(/^\s+/, "");
      // Модель иногда продолжает стенограмму — отрезаем чужие реплики.
      out = out.split(new RegExp(`\\n+${escapeRe(names.user || "Пользователь")}:`))[0];
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
