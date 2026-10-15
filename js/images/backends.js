/* Prism RP — провайдеры изображений.
   • perchance — text-to-image-plugin (бесплатно, только на Perchance);
   • a1111     — локальный Automatic1111 / Forge / ReForge / SwarmUI (sdapi/v1);
   • openai    — любой OpenAI-совместимый /images/generations.
   Единый контракт: generate(cfg, req) → { dataUrl, seed, info }.
   Запрос генерации не повторяется автоматически: сервер мог уже начать рисовать,
   и повтор дал бы вторую картинку (урок из форка). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const IC = PRP.imgCompose || (typeof require !== "undefined" ? require("./compose.js") : null);

  const trim = (u) => String(u || "").trim().replace(/\/+$/, "");
  function isLocal(url) {
    try { return /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(new URL(url).hostname); }
    catch (e) { return false; }
  }

  async function diagnose(url, kind) {
    if (!isLocal(url)) return `Сервер изображений ${url} недоступен: проверьте адрес и интернет.`;
    try {
      await fetch(url, { mode: "no-cors" });
      const origin = (root.location && root.location.origin && root.location.origin !== "null") ? root.location.origin : "*";
      return kind === "a1111"
        ? `Локальный сервер отвечает, но браузер блокирует запрос (CORS). Запустите Forge/A1111 с флагами --api --cors-allow-origins=${origin}`
        : `Локальный сервер отвечает, но браузер блокирует запрос (CORS). Разрешите источник ${origin} в настройках сервера.`;
    } catch (e) {
      return `Локальный сервер ${url} не отвечает: он не запущен, занят или порт другой. Для Forge/A1111 нужен флаг --api.`;
    }
  }

  async function call(url, init, kind) {
    let r;
    try { r = await fetch(url, init); }
    catch (e) { if (e.name === "AbortError") throw e; throw new Error(await diagnose(url.replace(/\/(sdapi|v1)\/.*$/, ""), kind)); }
    if (!r.ok) {
      let t = ""; try { t = await r.text(); } catch (e) {}
      let msg = t; try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.detail || j.message || t; } catch (e) {}
      throw new Error(`Сервер изображений ответил ${r.status}: ${String(typeof msg === "string" ? msg : JSON.stringify(msg)).slice(0, 300)}`);
    }
    return r;
  }

  function headers(cfg) {
    const h = { "Content-Type": "application/json" };
    if (cfg.key) h.Authorization = "Bearer " + cfg.key;
    return h;
  }

  function extra(cfg) {
    if (!cfg.extra || !String(cfg.extra).trim()) return {};
    try { const j = JSON.parse(cfg.extra); return j && typeof j === "object" ? j : {}; } catch (e) { return {}; }
  }

  function seedOf(cfg, req) {
    for (const v of [req.seed, cfg.seed]) {
      if (v !== "" && v != null && !isNaN(Number(v)) && Number(v) !== -1) return Number(v);
    }
    return Math.floor(Math.random() * 1e9);
  }

  /* ── Perchance ─────────────────────────────────────────────────────── */
  function perchancePlugin() {
    if (typeof root.image === "function") return root.image;
    if (root.root && typeof root.root.image === "function") return root.root.image;
    return null;
  }
  async function perchance(cfg, req) {
    const plug = perchancePlugin();
    if (!plug) throw new Error("Генерация изображений Perchance доступна, только когда приложение запущено как генератор на Perchance.");
    const seed = seedOf(cfg, req);
    const res = await plug({
      prompt: req.prompt,
      negativePrompt: req.negative || undefined,
      resolution: IC.perchanceResolution(req.ratio),
      seed,
      hideGalleryButtons: true,
    });
    const dataUrl = res && (res.dataUrl || (res.canvas && res.canvas.toDataURL && res.canvas.toDataURL("image/png")) || (typeof res === "string" || res instanceof String ? String(res) : ""));
    if (!dataUrl || !/^data:image\//.test(dataUrl)) throw new Error("Perchance не вернул изображение (возможно, запрос отклонён фильтром).");
    return { dataUrl, seed, info: { backend: "perchance", resolution: IC.perchanceResolution(req.ratio) } };
  }

  /* ── A1111 / Forge ─────────────────────────────────────────────────── */
  function a1111Body(cfg, req) {
    const wh = req.size || IC.sizeFor(req.ratio, { mode: cfg.sizeMode, fixed: cfg.fixedSize, maxSide: Number(cfg.maxSide) || 1216 });
    const body = {
      prompt: req.prompt,
      negative_prompt: req.negative || "",
      width: wh[0], height: wh[1],
      steps: Number(cfg.steps) || 28,
      cfg_scale: Number(cfg.cfg) || 5.5,
      seed: seedOf(cfg, req),
      batch_size: 1, n_iter: 1,
      save_images: false, send_images: true,
    };
    if (cfg.sampler) body.sampler_name = cfg.sampler;
    if (cfg.scheduler) body.scheduler = cfg.scheduler;
    const ov = {};
    if (cfg.model) ov.sd_model_checkpoint = cfg.model;
    if (cfg.vae) ov.sd_vae = cfg.vae;
    if (Object.keys(ov).length) body.override_settings = ov;
    if (cfg.hires) {
      // Второй проход: SDXL-модели лучше всего прорабатывают лица и руки около 1 Мп и выше.
      body.enable_hr = true;
      body.hr_scale = Math.max(1, Math.min(4, Number(cfg.hiresScale) || 1.5));
      if (cfg.hiresUpscaler) body.hr_upscaler = cfg.hiresUpscaler;
      const hs = Number(cfg.hiresSteps) || 0;
      body.hr_second_pass_steps = hs > 0 ? hs : Math.max(1, Math.round(body.steps / 2));
      const dn = Number(cfg.hiresDenoise);
      body.denoising_strength = Math.max(0, Math.min(1, isNaN(dn) ? 0.4 : dn));
    }
    return Object.assign(body, extra(cfg));
  }
  async function a1111(cfg, req) {
    const base = trim(cfg.url);
    if (!base) throw new Error("Не задан адрес сервера изображений.");
    const body = a1111Body(cfg, req);
    const r = await call(base + "/sdapi/v1/txt2img", { method: "POST", headers: headers(cfg), body: JSON.stringify(body), signal: req.signal }, "a1111");
    const data = await r.json();
    const b64 = data && Array.isArray(data.images) && data.images[0];
    if (!b64) throw new Error("Сервер не вернул изображение.");
    let info = {};
    try { info = JSON.parse(data.info || "{}") || {}; } catch (e) {}
    return { dataUrl: "data:image/png;base64," + String(b64).replace(/^data:[^,]*,/, ""), seed: info.seed != null ? info.seed : body.seed, info: { backend: "a1111", width: body.width, height: body.height, sampler: info.sampler_name || body.sampler_name, model: info.sd_model_name || cfg.model, steps: body.steps, cfg: body.cfg_scale, hires: !!body.enable_hr } };
  }

  // Списки с сервера A1111: модели, VAE, сэмплеры, апскейлеры, LoRA, embeddings.
  async function a1111List(cfg, what) {
    const base = trim(cfg.url);
    const paths = { models: "/sdapi/v1/sd-models", vaes: "/sdapi/v1/sd-vae", samplers: "/sdapi/v1/samplers", schedulers: "/sdapi/v1/schedulers", upscalers: "/sdapi/v1/upscalers", loras: "/sdapi/v1/loras", embeddings: "/sdapi/v1/embeddings" };
    const r = await call(base + paths[what], { headers: headers(cfg) }, "a1111");
    const data = await r.json();
    if (what === "embeddings") return Object.keys((data && data.loaded) || {}).sort((a, b) => a.localeCompare(b));
    if (!Array.isArray(data)) return [];
    const pick = { models: (m) => m.title || m.model_name, samplers: (s) => s.name, schedulers: (s) => s.label || s.name, upscalers: (u) => u.name || u.model_name, loras: (l) => l.name || l.alias, vaes: (v) => v.model_name || v.name };
    return [...new Set(data.map(pick[what]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  /* ── OpenAI-совместимые ────────────────────────────────────────────── */
  async function openai(cfg, req) {
    const base = trim(cfg.url);
    if (!base) throw new Error("Не задан адрес API изображений.");
    const wh = IC.openaiSize(req.ratio);
    const body = Object.assign({ prompt: req.prompt, n: 1, size: wh[0] + "x" + wh[1], response_format: "b64_json" }, cfg.model ? { model: cfg.model } : {}, extra(cfg));
    const r = await call(base + "/images/generations", { method: "POST", headers: headers(cfg), body: JSON.stringify(body), signal: req.signal }, "openai");
    const data = await r.json();
    const d = data && Array.isArray(data.data) && data.data[0];
    if (d && d.b64_json) return { dataUrl: "data:image/png;base64," + d.b64_json, seed: null, info: { backend: "openai", size: body.size, model: cfg.model } };
    if (d && d.url) {
      const img = await call(d.url, {}, "openai");
      const blob = await img.blob();
      const dataUrl = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
      return { dataUrl, seed: null, info: { backend: "openai", size: body.size, model: cfg.model } };
    }
    throw new Error("API не вернул изображение.");
  }

  function available(kind) {
    if (kind === "perchance") return !!perchancePlugin();
    return true;
  }

  function generate(cfg, req) {
    const kind = cfg.backend || "perchance";
    if (kind === "a1111") return a1111(cfg, req);
    if (kind === "openai") return openai(cfg, req);
    return perchance(cfg, req);
  }

  PRP.imgBackends = { generate, a1111Body, a1111List, available, isLocal, perchancePlugin };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.imgBackends;
})(typeof window !== "undefined" ? window : globalThis);
