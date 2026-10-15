/* Prism RP — общие утилиты. Классические скрипты: всё в globalThis.PRP,
   чтобы приложение открывалось и с file://, и через локальный сервер,
   а чистые модули можно было проверять в Node. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  function uid(prefix) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + "_" : "") + Date.now().toString(36) + rnd;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Подстановка {{char}} / {{user}} в полях карточки (стандарт CCv2/CCv3).
  function macros(text, vars) {
    return String(text || "")
      .replace(/\{\{\s*char\s*\}\}/gi, vars.char || "")
      .replace(/\{\{\s*user\s*\}\}/gi, vars.user || "")
      .replace(/<BOT>/g, vars.char || "")
      .replace(/<USER>/g, vars.user || "");
  }

  // Простая шина событий для связи модулей без прямых зависимостей.
  function createBus() {
    const map = new Map();
    return {
      on(evt, fn) {
        if (!map.has(evt)) map.set(evt, new Set());
        map.get(evt).add(fn);
        return () => map.get(evt).delete(fn);
      },
      emit(evt, data) {
        (map.get(evt) || []).forEach((fn) => {
          try { fn(data); } catch (e) { console.error("[bus]", evt, e); }
        });
      },
    };
  }

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }

  // Приблизительный счёт токенов: ~3.5 символа на токен для смешанного RU/EN текста.
  function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(String(text).length / 3.5);
  }

  PRP.util = { uid, escapeHtml, macros, createBus, clone, estimateTokens };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.util;
})(typeof window !== "undefined" ? window : globalThis);
