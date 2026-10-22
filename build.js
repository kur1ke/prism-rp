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
const buildSha = /^[a-f0-9]{40}$/i.test(process.env.GITHUB_SHA || "") ? process.env.GITHUB_SHA.toLowerCase() : "";
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
  `  window.PRISM_RP_BUILD_SHA = ${JSON.stringify(buildSha)};`,
  "})();",
  ...scripts.map((src) => `/* ${src} */
${read(src)}`),
  "",
].join("\n");
fs.writeFileSync(path.join(ROOT, "dist/web/prism-app.js"), webBundle);
fs.writeFileSync(path.join(ROOT, "dist/web/version.json"), JSON.stringify({ version, buildSha, builtAt: new Date().toISOString() }) + "\n");

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

// Test mirror loader lives as readable source, so rebuilds cannot discard fixes.
const testingLoader = read("templates/loader-testing.html");
const testingBare = testingLoader.replace(/<script[\s\S]*?<\/script>/g, "");
if (/[\[\]{}]/.test(testingBare)) throw new Error("тестовый загрузчик содержит [ ] { } вне <script>");
fs.writeFileSync(path.join(ROOT, "dist/perchance/loader-testing.html"), testingLoader);
