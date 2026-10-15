/* Prism RP — текстовый провайдер, OpenAI-совместимый /chat/completions.
   Покрывает облачные API (DeepSeek, OpenRouter и др.) и локальные серверы
   (LM Studio, Ollama, llama.cpp, KoboldCpp). Стриминг SSE, повторы только для
   временных сбоев и только пока ничего не получено, честная диагностика CORS. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const PRESETS = [
    { id: "lmstudio", name: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", local: true, extendedSamplers: true },
    { id: "ollama", name: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", local: true, extendedSamplers: true },
    { id: "llamacpp", name: "llama.cpp server", baseUrl: "http://127.0.0.1:8080/v1", local: true, extendedSamplers: true },
    { id: "koboldcpp", name: "KoboldCpp", baseUrl: "http://127.0.0.1:5001/v1", local: true, extendedSamplers: true },
    { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", local: false, extendedSamplers: true },
    { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", local: false, extendedSamplers: false },
    { id: "custom", name: "Другой OpenAI-совместимый", baseUrl: "", local: false, extendedSamplers: false },
  ];

  function base(p) {
    return String(p.baseUrl || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  }

  function isLocalUrl(url) {
    try {
      const h = new URL(url).hostname;
      return /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith(".local");
    } catch (e) { return false; }
  }

  function headers(p) {
    const h = { "Content-Type": "application/json" };
    if (p.apiKey) h.Authorization = "Bearer " + p.apiKey;
    if (/openrouter\.ai/.test(p.baseUrl || "")) { h["HTTP-Referer"] = "http://localhost"; h["X-Title"] = "Prism RP"; }
    return h;
  }

  /* ── SSE ────────────────────────────────────────────────────────────── */
  function createSSEParser(onData) {
    let buf = "";
    return {
      push(chunk) {
        buf += chunk;
        let nl;
        while ((nl = buf.search(/\r?\n/)) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + (buf[nl] === "\r" ? 2 : 1));
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === "[DONE]") { onData(null, true); continue; }
          try { onData(JSON.parse(payload), false); } catch (e) { /* неполная строка или мусор — пропускаем */ }
        }
      },
      flush() { if (buf.trim()) this.push("\n"); },
    };
  }

  function deltaOf(json) {
    const ch = json && json.choices && json.choices[0];
    if (!ch) return { text: "", reasoning: "", finish: null };
    const d = ch.delta || ch.message || {};
    return {
      text: typeof d.content === "string" ? d.content : typeof ch.text === "string" ? ch.text : "",
      reasoning: d.reasoning_content || d.reasoning || "",
      finish: ch.finish_reason || null,
    };
  }

  /* ── Ошибки ─────────────────────────────────────────────────────────── */
  class ProviderError extends Error {
    constructor(message, extra) { super(message); Object.assign(this, extra || {}); }
  }

  async function diagnoseNetwork(p) {
    const url = base(p);
    if (!isLocalUrl(url)) return "Сервер недоступен: проверьте адрес, интернет и ключ.";
    try {
      await fetch(url + "/models", { mode: "no-cors" });
      return "Локальный сервер отвечает, но браузер блокирует запрос (CORS). Включите CORS в настройках сервера " +
        "(LM Studio: Developer → Settings → Enable CORS; Ollama: переменная OLLAMA_ORIGINS=*).";
    } catch (e) {
      return "Локальный сервер по адресу " + url + " не отвечает: он не запущен или порт другой.";
    }
  }

  async function httpError(res) {
    let text = "";
    try { text = await res.text(); } catch (e) {}
    let msg = text;
    try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || j.message || text; } catch (e) {}
    return new ProviderError(`Сервер ответил ${res.status}: ${String(msg).slice(0, 400) || res.statusText}`, { status: res.status });
  }

  const sleep = (ms, signal) => new Promise((ok, fail) => {
    const t = setTimeout(ok, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); fail(new DOMException("Aborted", "AbortError")); }, { once: true });
  });

  /* ── API ────────────────────────────────────────────────────────────── */
  async function listModels(p) {
    let res;
    try { res = await fetch(base(p) + "/models", { headers: headers(p) }); }
    catch (e) { throw new ProviderError(await diagnoseNetwork(p)); }
    if (!res.ok) throw await httpError(res);
    const j = await res.json();
    return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
  }

  function body(p, messages, params) {
    const b = { model: p.model || undefined, messages, stream: true };
    const s = params || {};
    const put = (k, v) => { if (v !== undefined && v !== null && v !== "" && !Number.isNaN(v)) b[k] = v; };
    put("temperature", s.temperature);
    put("top_p", s.top_p);
    put("max_tokens", s.max_tokens);
    put("frequency_penalty", s.frequency_penalty || undefined);
    put("presence_penalty", s.presence_penalty || undefined);
    if (s.stop && s.stop.length) b.stop = s.stop;
    if (p.extendedSamplers) {
      put("min_p", s.min_p || undefined);
      put("top_k", s.top_k || undefined);
      put("repetition_penalty", s.repetition_penalty && s.repetition_penalty !== 1 ? s.repetition_penalty : undefined);
    }
    return b;
  }

  // onDelta({text, reasoning}) вызывается на каждый кусок; возвращает полный результат.
  async function chat(p, messages, params, opts) {
    const o = opts || {};
    const signal = o.signal;
    const maxAttempts = o.maxAttempts || 3;
    let received = false;
    for (let attempt = 1; ; attempt++) {
      try {
        return await once();
      } catch (e) {
        if (e.name === "AbortError" || (signal && signal.aborted)) throw e;
        const transient = e.network || [502, 503, 504].includes(e.status);
        if (!transient || received || attempt >= maxAttempts) {
          if (e.network) throw new ProviderError(await diagnoseNetwork(p), { network: true });
          throw e;
        }
        const capped = Math.min(8000, 800 * Math.pow(2, attempt - 1));
        await sleep(capped * (0.5 + Math.random() * 0.5), signal);
      }
    }

    async function once() {
      let res;
      try {
        res = await fetch(base(p) + "/chat/completions", {
          method: "POST", headers: headers(p), body: JSON.stringify(body(p, messages, params)), signal,
        });
      } catch (e) {
        if (e.name === "AbortError") throw e;
        throw new ProviderError(String(e.message || e), { network: true });
      }
      if (!res.ok) throw await httpError(res);
      const out = { text: "", reasoning: "", finish: null };
      const ctype = res.headers.get("content-type") || "";
      if (!res.body || ctype.includes("application/json")) {
        const d = deltaOf(await res.json());
        Object.assign(out, d);
        received = true;
        if (o.onDelta) o.onDelta({ text: d.text, reasoning: d.reasoning });
        return out;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const parser = createSSEParser((json, done) => {
        if (done || !json) return;
        const d = deltaOf(json);
        if (d.text || d.reasoning) {
          received = true;
          out.text += d.text; out.reasoning += d.reasoning;
          if (o.onDelta) o.onDelta({ text: d.text, reasoning: d.reasoning });
        }
        if (d.finish) out.finish = d.finish;
      });
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(dec.decode(value, { stream: true }));
      }
      parser.flush();
      return out;
    }
  }

  // Модели, пишущие рассуждение прямо в текст: <think>…</think>.
  function splitThink(text) {
    const s = String(text || "");
    const m = s.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/i);
    if (!m) return { text: s, reasoning: "" };
    return { reasoning: m[1].trim(), text: m[2] ? s.slice(m[0].length).replace(/^\s+/, "") : "" };
  }

  PRP.openai = { PRESETS, listModels, chat, createSSEParser, deltaOf, splitThink, isLocalUrl, ProviderError };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.openai;
})(typeof window !== "undefined" ? window : globalThis);
