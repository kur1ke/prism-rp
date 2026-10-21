// Сборка Prism RP из одних исходников в две цели:
//   dist/perchance/lists.txt  — вставить в левую панель (Lists) генератора Perchance
//   dist/perchance/html.html  — вставить в правую панель (HTML) генератора Perchance
//   dist/standalone/index.html — один файл, открывается в браузере без Perchance
// Запуск: node build.js
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const html = read("index.html");
const css = read("css/app.css");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const body = html.match(/<body>([\s\S]*?)<script/)[1].trim();
// Шрифты (Onest, Literata) — внешние ссылки из <head>; без сети сработают системные запасные.
const fontLinks = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g)].map((m) => m[0]).join("\n");
const version = JSON.parse(read("package.json")).version;
const stamp = `<!-- Prism RP ${version} · собрано ${new Date().toISOString().slice(0, 10)} · исходники: index.html, css/, js/ -->`;

const jsBlocks = scripts.map((src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(`${src}: содержит </script> — сломает встраивание`);
  return `<script>/* ${src} */\n${code}\n</script>`;
});
if (/<\/style/i.test(css)) throw new Error("css содержит </style>");

// Perchance вычисляет [ ] и { } в HTML-панели везде, кроме <script> и <style>.
const bare = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const bad = bare.match(/[\[\]{}]/);
if (bad) throw new Error(`Разметка вне <script>/<style> содержит «${bad[0]}» — Perchance попытается это вычислить`);

fs.mkdirSync(path.join(ROOT, "dist/perchance"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "dist/standalone"), { recursive: true });

const lists = [
  "// Prism RP " + version + " — панель Lists генератора Perchance",
  "// Бесплатная текстовая модель Perchance. Приложение вызывает её из HTML-панели как ai(...).",
  "ai = {import:ai-text-plugin}",
  "// Бесплатная генерация изображений Perchance. Приложение вызывает её как image(...).",
  "image = {import:text-to-image-plugin}",
  "",
].join("\n");

const perchanceHtml = [
  stamp,
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
  fontLinks,
  `<style>\n${css}\n</style>`,
  body,
  ...jsBlocks,
  "",
].join("\n");

const standalone = [
  "<!doctype html>",
  `<html lang="ru">`,
  "<head>",
  `<meta charset="utf-8">`,
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
  "<title>Prism RP</title>",
  stamp,
  fontLinks,
  `<style>\n${css}\n</style>`,
  "</head>",
  "<body>",
  body,
  ...jsBlocks,
  "</body>",
  "</html>",
  "",
].join("\n");

// Сборка для загрузчика: один JS-файл, который сам ставит стили, шрифты и разметку,
// а затем запускает приложение. Его подтягивает loader.html с GitHub Pages.
const PAGES = "https://kur1ke.github.io/prism-rp/dist/web/";
fs.mkdirSync(path.join(ROOT, "dist/web"), { recursive: true });
const fontHrefs = [...fontLinks.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const webBundle = [
  `/* Prism RP ${version} — сборка для загрузчика. Исходники: github.com/kur1ke/prism-rp */`,
  "(function () {",
  "  var d = document;",
  `  ${JSON.stringify(fontHrefs)}.forEach(function (h) { var l = d.createElement("link"); l.rel = "stylesheet"; l.href = h; d.head.appendChild(l); });`,
  `  var st = d.createElement("style"); st.textContent = ${JSON.stringify(css)}; d.head.appendChild(st);`,
  `  var boot = d.getElementById("prism-boot"); if (boot) boot.remove();`,
  `  var wrap = d.createElement("div"); wrap.innerHTML = ${JSON.stringify(body)};`,
  "  while (wrap.firstChild) d.body.appendChild(wrap.firstChild);",
  `  window.PRISM_RP_VERSION = ${JSON.stringify(version)};`,
  "})();",
  ...scripts.map((src) => `/* ${src} */
${read(src)}`),
  "",
].join("\n");
fs.writeFileSync(path.join(ROOT, "dist/web/prism-app.js"), webBundle);
fs.writeFileSync(path.join(ROOT, "dist/web/version.json"), JSON.stringify({ version, builtAt: new Date().toISOString() }) + "\n");

// Загрузчик для HTML-панели Perchance: вставляется один раз, дальше обновления приходят сами.
const loader = [
  `<!-- Prism RP — загрузчик. Вставляется в HTML-панель генератора Perchance один раз. -->`,
  `<!-- Само приложение подгружается с ${PAGES} — обновления приходят без правки генератора. -->`,
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
  `<div id="prism-boot" style="font: 15px system-ui, sans-serif; padding: 32px; color: #8d86a6; background: #15131d; min-height: 100vh; box-sizing: border-box">Загружаю Prism RP…</div>`,
  "<script>",
  "(function () {",
  `  var base = ${JSON.stringify(PAGES)};`,
  "  var s = document.createElement('script');",
  "  // Метка времени с точностью до минуты: браузер не держит старую версию дольше минуты.",
  "  s.src = base + 'prism-app.js?t=' + Math.floor(Date.now() / 60000);",
  "  s.onerror = function () {",
  "    var b = document.getElementById('prism-boot');",
  "    if (b) b.textContent = 'Не удалось загрузить Prism RP с GitHub Pages. Проверьте интернет и перезагрузите страницу.';",
  "  };",
  "  document.head.appendChild(s);",
  "})();",
  "</script>",
  "",
].join("\n");
const loaderBare = loader.replace(/<script[\s\S]*?<\/script>/g, "");
if (/[\[\]{}]/.test(loaderBare)) throw new Error("загрузчик содержит [ ] { } вне <script>");
fs.writeFileSync(path.join(ROOT, "dist/perchance/loader.html"), loader);

fs.writeFileSync(path.join(ROOT, "dist/perchance/lists.txt"), lists);
fs.writeFileSync(path.join(ROOT, "dist/perchance/html.html"), perchanceHtml);
fs.writeFileSync(path.join(ROOT, "dist/standalone/index.html"), standalone);
console.log(`Собрано ${version}: ${scripts.length} скриптов; perchance html ${(perchanceHtml.length / 1024).toFixed(0)} КБ, standalone ${(standalone.length / 1024).toFixed(0)} КБ`);

// Тестовый загрузчик сохраняется при каждом вызове node build.js.
fs.writeFileSync(path.join(ROOT, "dist/perchance/loader-testing.html"), "<!-- Prism RP TEST — изолированное зеркало. Рабочий генератор не изменять. -->\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<div id=\"prism-boot\" style=\"font:15px system-ui,sans-serif;padding:32px;color:#d7c7f4;background:#15131d;min-height:100vh;box-sizing:border-box\">Загружаю TEST-сборку PRISM…</div>\n<div id=\"prism-testing-badge\" aria-label=\"Тестовая версия PRISM\" style=\"position:fixed;right:12px;bottom:12px;z-index:2147483000;pointer-events:none;font:600 12px system-ui,sans-serif;background:#5d2569;color:#fff;padding:7px 11px;border:1px solid #e2a5e3;border-radius:8px;box-shadow:0 1px 7px #0008\">PRISM TEST · загрузка…</div>\n<script>\n(function () {\n  \"use strict\";\n  window.__PRP_TEST_MIRROR = true;\n  window.PRISM_RP_CHANNEL = \"testing\";\n  var api = \"https://api.github.com/repos/kur1ke/prism-rp/branches/testing\";\n  var cdn = \"https://cdn.jsdelivr.net/gh/kur1ke/prism-rp@\";\n  var raw = \"https://raw.githubusercontent.com/kur1ke/prism-rp/\";\n  var suffix = \"/dist/web/prism-app.js\";\n  var badge = document.getElementById(\"prism-testing-badge\");\n  var boot = document.getElementById(\"prism-boot\");\n  function status(t) { if (badge) badge.textContent = \"PRISM TEST · \" + t; }\n  function error(t) { if (boot) boot.textContent = \"Тестовая версия не загрузилась: \" + t + \". Рабочая версия не затронута.\"; status(\"ошибка загрузки\"); }\n  function load(ref, warning) {\n    if (!/^[a-f0-9]{40}$/.test(ref) && ref !== \"testing\") { error(\"неверный SHA\"); return; }\n    window.PRISM_RP_TEST_REVISION = ref;\n    var urls = [cdn + encodeURIComponent(ref) + suffix, raw + encodeURIComponent(ref) + suffix];\n    function attempt(index) {\n      status(index ? \"резервный источник · \" + ref.slice(0, 7) : (warning || ref.slice(0, 7)));\n      var script = document.createElement(\"script\");\n      script.src = urls[index];\n      script.onerror = function () {\n        if (index + 1 < urls.length) attempt(index + 1);\n        else error(\"оба источника недоступны (\" + ref.slice(0, 7) + \")\");\n      };\n      script.onload = function () {\n        if (!window.PRP || !window.PRISM_RP_VERSION) error(\"приложение не инициализировалось\");\n        else status((index ? \"резерв · \" : warning ? \"кэш ветки · \" : \"\") + ref.slice(0, 7));\n      };\n      document.head.appendChild(script);\n    }\n    attempt(0);\n  }\n  fetch(api, { cache: \"no-store\", headers: { \"Accept\": \"application/vnd.github+json\" } })\n    .then(function (res) { if (!res.ok) throw new Error(\"GitHub API \" + res.status); return res.json(); })\n    .then(function (data) { var sha = data && data.commit && data.commit.sha; if (!/^[a-f0-9]{40}$/.test(sha || \"\")) throw new Error(\"неверный ответ GitHub\"); load(sha); })\n    .catch(function () { load(\"testing\", \"возможно кэшированная ветка\"); });\n})();\n</script>\n");
