/* Prism RP — перевод сцены в промпт изображения.
   Модели Stable Diffusion не понимают русский текст: поза, одежда и сам смысл
   теряются. Поэтому сцена на другом языке переписывается текстовой моделью
   в англоязычные теги (или описание), сохраняя все детали и градус сцены.
   Английский текст проходит без изменений. Результат кэшируется: одна и та же
   сцена переводится один раз. При любой ошибке используется исходный текст. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const IC = PRP.imgCompose || (typeof require !== "undefined" ? require("./compose.js") : null);

  const mem = new Map();
  const MAX = 300;
  let persist = null; // { load(): Promise<object>, save(object) }

  function setStore(store) { persist = store; }
  async function warm() {
    if (!persist || mem.size) return;
    try { const o = (await persist.load()) || {}; Object.keys(o).slice(-MAX).forEach((k) => mem.set(k, o[k])); } catch (e) {}
  }
  function remember(k, v) {
    mem.set(k, v);
    while (mem.size > MAX) mem.delete(mem.keys().next().value);
    if (persist) try { persist.save(Object.fromEntries(mem)); } catch (e) {}
  }

  // generateText(instruction) → Promise<string>; передаётся приложением (Perchance или API).
  async function compile(scene, opts, generateText) {
    const s = String(scene || "").trim();
    const o = opts || {};
    if (!s || (!o.intentMode && (o.translate === false || !IC.needsRewrite(s))) || typeof generateText !== "function") return { text: s, compiled: false };
    await warm();
    const key = ["v3-frame", o.intentMode ? "intent" : "tags", o.format || "tags", o.pov ? "pov" : "std", o.qualityPinned ? "q" : "", o.identity || "", o.frame ? JSON.stringify(o.frame) : "", s].join("\u0001");
    if (mem.has(key)) return { text: mem.get(key), compiled: true, cached: true };
    const instruction = IC.rewriteRules(o) + "\n\nSCENE:\n" + s;
    try {
      let out = String((await generateText(instruction)) || "").replace(/\s+/g, " ").replace(/^["'`]+|["'`]+$/g, "").trim();
      out = out.replace(/^(prompt|tags)\s*:\s*/i, "");
      if (out.length < 4) return { text: s, compiled: false };
      remember(key, out);
      return { text: out, compiled: true };
    } catch (e) {
      return { text: s, compiled: false, error: e.message };
    }
  }

  function clear() { mem.clear(); if (persist) try { persist.save({}); } catch (e) {} }

  PRP.imgCompile = { compile, setStore, clear };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.imgCompile;
})(typeof window !== "undefined" ? window : globalThis);
