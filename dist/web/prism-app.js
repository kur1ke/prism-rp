/* Prism RP 0.5.0 — сборка для загрузчика. Исходники: github.com/kur1ke/prism-rp */
(function () {
  var d = document;
  ["https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Onest:wght@400;500;600;700&display=swap"].forEach(function (h) { var l = d.createElement("link"); l.rel = "stylesheet"; l.href = h; d.head.appendChild(l); });
  var st = d.createElement("style"); st.textContent = "/* Prism RP — дизайн-система.\n   Идея: свет, разложенный призмой. Спокойные сливово-чернильные поверхности;\n   единственный яркий элемент — спектральная линия под шапкой чата, которая\n   течёт, пока модель пишет. Интерфейс — Onest, ролевая проза — Literata. */\n\n:root, [data-theme=\"dusk\"] {\n  --bg: #15131d;\n  --surface: #1c1a27;\n  --raised: #252233;\n  --sunken: #110f18;\n  --line: #322d45;\n  --line-soft: #26223a;\n  --text: #ece7f6;\n  --text-2: #b9b2cf;\n  --muted: #8d86a6;\n  --accent: #b79cff;\n  --accent-strong: #9c7bff;\n  --accent-ink: #160f2b;\n  --accent-wash: rgba(183, 156, 255, .12);\n  --me: #4a3a8c;\n  --me-ink: #f3efff;\n  --them: #221f30;\n  --ok: #6fd6a8;\n  --warn: #f2c26b;\n  --danger: #ff8a9a;\n  --prose: #e9e4f2;\n  --action: #a99fc4;\n  --speech: #fff6e8;\n  --shadow: 0 18px 50px rgba(5, 3, 12, .55);\n  --spectrum: linear-gradient(90deg, #7fd1ff, #b79cff 30%, #ff9ec7 55%, #ffd08a 78%, #8ff0c3);\n  color-scheme: dark;\n}\n[data-theme=\"dawn\"] {\n  --bg: #f1eef7;\n  --surface: #ffffff;\n  --raised: #f6f3fb;\n  --sunken: #e8e3f2;\n  --line: #ddd6ea;\n  --line-soft: #ebe6f3;\n  --text: #1e1a2b;\n  --text-2: #4b4462;\n  --muted: #7a7393;\n  --accent: #6b4edb;\n  --accent-strong: #5636c9;\n  --accent-ink: #ffffff;\n  --accent-wash: rgba(107, 78, 219, .09);\n  --me: #6b4edb;\n  --me-ink: #ffffff;\n  --them: #ffffff;\n  --ok: #1f9d6c;\n  --warn: #b7791f;\n  --danger: #d0384f;\n  --prose: #231e33;\n  --action: #6e6788;\n  --speech: #1e1a2b;\n  --shadow: 0 18px 50px rgba(60, 40, 120, .14);\n  --spectrum: linear-gradient(90deg, #39a7e6, #6b4edb 30%, #e05596 55%, #e7a33c 78%, #2fb985);\n  color-scheme: light;\n}\n[data-theme=\"paper\"] {\n  --bg: #efe8dc;\n  --surface: #f8f3ea;\n  --raised: #f2ebdf;\n  --sunken: #e6dccc;\n  --line: #d9ccb6;\n  --line-soft: #e5dacb;\n  --text: #2b2318;\n  --text-2: #54473a;\n  --muted: #85766a;\n  --accent: #7a4d9e;\n  --accent-strong: #653a8a;\n  --accent-ink: #fbf6ff;\n  --accent-wash: rgba(122, 77, 158, .1);\n  --me: #7a4d9e;\n  --me-ink: #fbf6ff;\n  --them: #fbf7f0;\n  --ok: #3f8a5c;\n  --warn: #9c6a12;\n  --danger: #b03a3a;\n  --prose: #2b2318;\n  --action: #7a6a5a;\n  --speech: #1f1810;\n  --shadow: 0 18px 50px rgba(80, 60, 30, .15);\n  --spectrum: linear-gradient(90deg, #3d8fc2, #7a4d9e 30%, #c2507e 55%, #c98a2a 78%, #3f9a72);\n  color-scheme: light;\n}\n\n:root {\n  --ui: \"Onest\", system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif;\n  --read: \"Literata\", Georgia, \"Times New Roman\", serif;\n  --fs: 15px;\n  --prose-fs: 17px;\n  --r-s: 8px;\n  --r-m: 12px;\n  --r-l: 18px;\n  --rail: 264px;\n  --drawer: 384px;\n}\n\n* { box-sizing: border-box; }\nhtml, body { height: 100%; margin: 0; }\nbody { background: var(--bg); color: var(--text); font: var(--fs)/1.5 var(--ui); -webkit-font-smoothing: antialiased; text-align: left; }\nbutton, input, textarea, select { font: inherit; color: inherit; }\n[hidden] { display: none !important; }\n:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }\n::selection { background: var(--accent-wash); }\n.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }\n\n/* ── Каркас ─────────────────────────────────────────────────────────── */\n/* Perchance по умолчанию центрирует текст страницы — возвращаем обычное выравнивание. */\n.app { text-align: left; display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: 100dvh; overflow: hidden; }\n/* Служебные контейнеры не участвуют в сетке: их содержимое позиционируется фиксированно. */\n#pop-root, #modal-root { display: contents; }\n.rail { background: var(--surface); border-right: 1px solid var(--line-soft); display: flex; flex-direction: column; min-height: 0; }\n.stage { display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; }\n\n.brand { display: flex; align-items: center; gap: 10px; padding: 18px 18px 14px; font-weight: 700; font-size: 17px; letter-spacing: -.01em; background: none; border: 0; cursor: pointer; text-align: left; }\n.brand-glyph { width: 26px; height: 26px; flex: none; }\n.rail-nav { padding: 0 10px; display: flex; flex-direction: column; gap: 2px; }\n.rail-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--r-s); border: 0; background: none; cursor: pointer; color: var(--text-2); text-align: left; width: 100%; }\n.rail-item:hover { background: var(--raised); color: var(--text); }\n.rail-item.active { background: var(--accent-wash); color: var(--text); }\n.rail-item svg { width: 18px; height: 18px; flex: none; }\n.rail-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 6px; color: var(--muted); font-size: 13px; }\n.rail-chats { flex: 1; overflow: auto; padding: 0 10px 10px; }\n.rail-chat { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 8px; border-radius: var(--r-m); cursor: pointer; }\n.rail-chat:hover { background: var(--raised); }\n.rail-chat.active { background: var(--raised); box-shadow: inset 2px 0 0 var(--accent); }\n.rail-chat .t1 { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.rail-chat .t2 { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.rail-chat .kind { color: var(--muted); }\n.rail-chat .kind svg { width: 15px; height: 15px; }\n.rail-foot { border-top: 1px solid var(--line-soft); padding: 10px; display: flex; gap: 6px; }\n\n/* ── Кнопки и поля ──────────────────────────────────────────────────── */\n.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--line); background: var(--raised); padding: 8px 14px; border-radius: var(--r-m); cursor: pointer; white-space: nowrap; color: var(--text); font-weight: 500; line-height: 1.2; }\n.btn:hover { border-color: var(--accent); }\n.btn svg { width: 17px; height: 17px; }\n.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }\n.btn-primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); }\n.btn-ghost { background: transparent; border-color: transparent; color: var(--text-2); }\n.btn-ghost:hover { background: var(--raised); border-color: transparent; color: var(--text); }\n.btn-danger { background: transparent; border-color: color-mix(in srgb, var(--danger) 50%, transparent); color: var(--danger); }\n.btn-sm { padding: 5px 10px; font-size: 13.5px; border-radius: var(--r-s); }\n.btn:disabled { opacity: .45; cursor: default; }\n.icon-btn { display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: var(--r-s); border: 0; background: none; color: var(--text-2); cursor: pointer; flex: none; }\n.icon-btn:hover { background: var(--raised); color: var(--text); }\n.icon-btn.on { color: var(--accent); background: var(--accent-wash); }\n.icon-btn svg { width: 19px; height: 19px; }\n.file-btn input { display: none; }\n\n.field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; min-width: 0; }\n.field > label, .label { font-size: 13px; color: var(--text-2); font-weight: 500; display: inline-flex; align-items: center; gap: 4px 6px; flex-wrap: wrap; }\n.label svg, .field > label svg { width: 15px; height: 15px; flex: none; }\n.field .help { font-size: 12.5px; color: var(--muted); }\n.input, .field input:not([type=checkbox]):not([type=range]), .field textarea, .field select {\n  width: 100%; background: var(--sunken); border: 1px solid var(--line); border-radius: var(--r-s); padding: 8px 10px; color: var(--text);\n}\n.field textarea { resize: vertical; min-height: 76px; line-height: 1.5; }\n.input:focus, .field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-wash); }\n.row { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }\n.row > .btn { align-self: flex-end; }\n.row > .field { flex: 1; min-width: 100px; }\n.check { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; margin: 8px 0; cursor: pointer; text-align: left; }\n.check > span { flex: 1; min-width: 0; }\n.checks { display: flex; flex-wrap: wrap; gap: 0 18px; }\n.checks .check { margin: 4px 0; }\n.check input { margin-top: 3px; accent-color: var(--accent); }\n.check small { display: block; color: var(--muted); font-size: 12.5px; }\n\n.seg { display: inline-flex; background: var(--sunken); border: 1px solid var(--line-soft); border-radius: 999px; padding: 3px; gap: 2px; }\n.seg button { border: 0; background: none; padding: 5px 13px; border-radius: 999px; cursor: pointer; color: var(--text-2); font-size: 13.5px; display: inline-flex; align-items: center; gap: 6px; }\n.seg button svg { width: 15px; height: 15px; }\n.seg button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.25); }\n\n.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 4px 3px 10px; border-radius: 999px; background: var(--raised); border: 1px solid var(--line-soft); font-size: 13.5px; max-width: 100%; }\n.chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.chip button { border: 0; background: none; color: var(--muted); cursor: pointer; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; padding: 0; }\n.chip button:hover { background: var(--line); color: var(--text); }\n.chip button svg { width: 12px; height: 12px; }\n.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }\n.chip-add { border: 1px dashed var(--line); background: transparent; border-radius: 999px; padding: 3px 10px; min-width: 90px; width: 140px; font-size: 13.5px; color: var(--text); }\n.chip-add:focus { outline: none; border-color: var(--accent); border-style: solid; }\n\n/* ── Аватары ────────────────────────────────────────────────────────── */\n.av { position: relative; flex: none; border-radius: 50%; overflow: hidden; display: grid; place-items: center; font-weight: 700; color: #fff; background: var(--raised); }\n.av img { width: 100%; height: 100%; object-fit: cover; }\n.av-34 { width: 34px; height: 34px; font-size: 14px; }\n.av-40 { width: 40px; height: 40px; font-size: 16px; }\n.av-48 { width: 48px; height: 48px; font-size: 19px; }\n.av-me { background: var(--sunken); color: var(--accent); border: 1px solid var(--line); }\n\n/* ── Главный экран ──────────────────────────────────────────────────── */\n.home { flex: 1; overflow: auto; }\n.home-inner { max-width: 1180px; margin: 0 auto; padding: 34px 32px 60px; }\n.home-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }\n.home h1 { font-size: 30px; line-height: 1.15; margin: 0; letter-spacing: -.02em; font-weight: 700; }\n.home .sub { color: var(--text-2); margin: 6px 0 0; max-width: 60ch; }\n.home-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }\n.search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-m); padding: 0 10px; height: 38px; min-width: 220px; }\n.search svg { width: 17px; height: 17px; color: var(--muted); flex: none; }\n.search input { border: 0; background: none; outline: none; width: 100%; height: 100%; }\n.search:focus-within { border-color: var(--accent); }\n\n.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 18px; }\n.tile { position: relative; border-radius: var(--r-l); overflow: hidden; aspect-ratio: 3 / 4; background: var(--surface); border: 1px solid var(--line-soft); cursor: pointer; display: block; padding: 0; text-align: left; color: #fff; }\n.tile:hover .tile-art { transform: scale(1.035); }\n.tile-art { position: absolute; inset: 0; transition: transform .45s cubic-bezier(.2,.7,.2,1); display: grid; place-items: center; font-size: 64px; font-weight: 700; color: rgba(255,255,255,.85); }\n.tile-art img { width: 100%; height: 100%; object-fit: cover; }\n.tile-shade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 45%, rgba(10, 6, 20, .88)); }\n.tile-body { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px; }\n.tile-name { font-weight: 700; font-size: 17px; line-height: 1.2; text-shadow: 0 1px 8px rgba(0,0,0,.4); }\n.tile-tags { font-size: 12.5px; opacity: .78; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.tile-count { position: absolute; top: 10px; right: 10px; background: rgba(10, 6, 20, .55); backdrop-filter: blur(6px); border-radius: 999px; font-size: 12px; padding: 2px 9px; }\n.tile-new { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-2); border: 1.5px dashed var(--line); background: transparent; }\n.tile-new:hover { border-color: var(--accent); color: var(--text); }\n.tile-new svg { width: 30px; height: 30px; }\n.tile-new label, .tile-new span { cursor: pointer; }\n\n.welcome { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin: 8px 0 30px; }\n.step { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-l); padding: 18px; }\n.step h3 { margin: 6px 0 4px; font-size: 16px; }\n.step p { margin: 0 0 12px; color: var(--text-2); font-size: 14px; }\n.step .n { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-wash); color: var(--accent); font-weight: 700; font-size: 13px; }\n.section-title { font-size: 15px; font-weight: 600; color: var(--text-2); margin: 30px 0 12px; }\n\n/* ── Чат ────────────────────────────────────────────────────────────── */\n.chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }\n.chat-head { display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 18px; background: var(--surface); position: relative; min-height: 64px; }\n.chat-head::after { content: \"\"; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--spectrum); opacity: .35; background-size: 200% 100%; }\n.app.generating .chat-head::after { opacity: 1; animation: flow 2.4s linear infinite; }\n@keyframes flow { from { background-position: 0 0; } to { background-position: -200% 0; } }\n.head-who { min-width: 0; flex: 1; }\n.head-name { font-weight: 700; font-size: 16px; display: flex; gap: 10px; align-items: center; }\n.head-name .rename { opacity: 0; }\n.head-who:hover .rename { opacity: 1; }\n.head-scene { color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.head-scene.live { color: var(--accent); }\n.head-tools { display: flex; align-items: center; gap: 2px; }\n\n.findbar { display: flex; gap: 8px; align-items: center; padding: 8px 18px; background: var(--surface); border-bottom: 1px solid var(--line-soft); }\n.findbar .search { flex: 1; height: 34px; }\n.findbar .count { color: var(--muted); font-size: 13px; min-width: 52px; text-align: right; }\nmark { background: color-mix(in srgb, var(--warn) 40%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }\nmark.cur { background: var(--warn); color: #1b1300; }\n\n.feed { flex: 1; overflow: auto; padding: 26px 22px 12px; scroll-behavior: smooth; }\n.feed-inner { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }\n\n/* Сцена: проза */\n.turn { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 14px; }\n.turn-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 2px; }\n.turn-name { font-weight: 650; font-size: 14.5px; }\n.turn-time { color: var(--muted); font-size: 12px; }\n.prose { font-family: var(--read); font-size: var(--prose-fs); line-height: 1.72; color: var(--prose); white-space: pre-wrap; overflow-wrap: anywhere; }\n.prose em { color: var(--action); font-style: italic; }\n.prose q { quotes: none; color: var(--speech); }\n.prose strong { font-weight: 650; }\n.turn.user .prose { font-family: var(--ui); font-size: 15.5px; line-height: 1.6; color: var(--text); }\n.turn.user .bubble-plain { background: var(--raised); border: 1px solid var(--line-soft); border-radius: 4px var(--r-l) var(--r-l) var(--r-l); padding: 10px 14px; display: inline-block; max-width: 100%; }\n.cursor::after { content: \"\"; display: inline-block; width: .5em; height: 1.05em; vertical-align: -0.15em; margin-left: 2px; background: var(--accent); animation: caret 1s steps(2) infinite; border-radius: 2px; }\n@keyframes caret { 50% { opacity: 0; } }\n\n.turn-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 8px; }\n.delta { font-size: 12px; color: var(--text-2); background: var(--sunken); border: 1px solid var(--line-soft); padding: 1px 8px; border-radius: 999px; }\n.tools { display: flex; align-items: center; gap: 2px; margin-top: 6px; opacity: 0; transition: opacity .15s; }\n.turn:hover .tools, .turn:focus-within .tools, .turn.last .tools, .msg-row:hover .tools, .msg-row.last .tools { opacity: 1; }\n.tool { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 12.5px; padding: 4px 7px; border-radius: 7px; }\n.tool:hover { background: var(--raised); color: var(--text); }\n.tool svg { width: 15px; height: 15px; }\n.swipes { display: inline-flex; align-items: center; color: var(--muted); font-size: 12.5px; margin-right: 6px; }\n.swipes .tool { padding: 4px; }\ndetails.think { margin: 2px 0 8px; font-size: 13.5px; color: var(--muted); }\ndetails.think summary { cursor: pointer; list-style: none; display: inline-flex; gap: 6px; align-items: center; }\ndetails.think summary::-webkit-details-marker { display: none; }\ndetails.think summary svg { width: 14px; height: 14px; }\ndetails.think div { white-space: pre-wrap; margin-top: 6px; padding: 8px 12px; border-left: 2px solid var(--line); }\n.err { color: var(--danger); font-size: 14px; margin-top: 6px; white-space: pre-wrap; display: flex; gap: 8px; align-items: flex-start; }\n.err svg { width: 17px; height: 17px; flex: none; margin-top: 2px; }\n.editor { width: 100%; min-height: 140px; background: var(--sunken); border: 1px solid var(--accent); border-radius: var(--r-m); padding: 12px; resize: vertical; font-family: var(--read); font-size: 16px; line-height: 1.6; }\n\n/* Картинки */\n.shots { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }\n.shot { position: relative; margin: 0; width: min(100%, 440px); border-radius: var(--r-l); overflow: hidden; background: var(--sunken); border: 1px solid var(--line-soft); }\n.shot img { display: block; width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; }\n.shot.wait { display: flex; flex-direction: column; }\n.shot-wait { flex: 1; display: grid; place-items: center; color: var(--text-2); font-size: 14px; background:\n  linear-gradient(110deg, transparent 30%, var(--accent-wash) 50%, transparent 70%) var(--sunken); background-size: 250% 100%; animation: shimmer 1.6s linear infinite; min-height: 120px; }\n@keyframes shimmer { from { background-position: 150% 0; } to { background-position: -100% 0; } }\n.shot-cap { font-size: 12px; color: var(--muted); padding: 8px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.shot-tools { position: absolute; top: 8px; right: 8px; display: flex; gap: 2px; background: rgba(12, 8, 22, .62); backdrop-filter: blur(6px); border-radius: 10px; padding: 2px; opacity: 0; transition: opacity .15s; }\n.shot:hover .shot-tools, .shot:focus-within .shot-tools { opacity: 1; }\n.shot-tools .icon-btn { color: #f2eefc; width: 32px; height: 32px; }\n.shot-tools .icon-btn:hover { background: rgba(255,255,255,.14); color: #fff; }\n.shot.failed { width: auto; max-width: 440px; padding: 12px 14px; aspect-ratio: auto !important; }\n.shots.in-bubble .shot { width: min(78%, 360px); }\n.msg-row.them .shots.in-bubble { justify-content: flex-start; }\n@media (hover: none) { .shot-tools { opacity: 1; } }\n.lightbox { background: rgba(6, 4, 12, .88); }\n.lb-fig { margin: 0; max-width: min(1200px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 10px; }\n.lb-fig img { max-width: 100%; max-height: calc(100dvh - 120px); object-fit: contain; border-radius: var(--r-m); }\n.lb-fig figcaption { display: flex; gap: 12px; align-items: center; justify-content: space-between; color: #d9d3ea; font-size: 13.5px; }\n.lb-fig figcaption > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.lb-tools { display: flex; gap: 6px; flex: none; }\n.lb-tools .icon-btn { color: #f2eefc; }\n.lora-rows { display: flex; flex-direction: column; gap: 6px; }\n.lora-row { flex-wrap: nowrap; align-items: center; }\n.prov.dim { opacity: .55; }\n\n/* Мессенджер */\n.app.messenger .feed { background:\n  radial-gradient(circle at 15% 10%, var(--accent-wash), transparent 40%),\n  radial-gradient(circle at 85% 90%, var(--accent-wash), transparent 45%); }\n.app.messenger .feed-inner { max-width: 660px; gap: 2px; }\n.daymark { align-self: center; font-size: 12px; color: var(--muted); background: var(--surface); border: 1px solid var(--line-soft); padding: 2px 12px; border-radius: 999px; margin: 12px 0 8px; }\n.msg-row { display: flex; flex-direction: column; margin-top: 8px; }\n.msg-row.me { align-items: flex-end; }\n.msg-row.them { align-items: flex-start; }\n.bub { max-width: min(78%, 480px); padding: 8px 13px; border-radius: 20px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.42; margin-top: 3px; font-size: 15.5px; position: relative; }\n.msg-row.me .bub { background: var(--me); color: var(--me-ink); }\n.msg-row.them .bub { background: var(--them); border: 1px solid var(--line-soft); }\n.msg-row.me .bub:last-of-type { border-bottom-right-radius: 6px; }\n.msg-row.them .bub:last-of-type { border-bottom-left-radius: 6px; }\n.stamp { font-size: 11px; color: var(--muted); margin: 3px 8px 0; }\n.typing { display: inline-flex; gap: 4px; padding: 12px 15px !important; }\n.typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: dot 1.2s infinite; }\n.typing i:nth-child(2) { animation-delay: .18s; } .typing i:nth-child(3) { animation-delay: .36s; }\n@keyframes dot { 0%, 70%, 100% { opacity: .25; transform: none; } 35% { opacity: 1; transform: translateY(-2px); } }\n.status-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); display: inline-block; }\n\n/* Композер */\n.composer-wrap { padding: 8px 18px 16px; }\n.composer { max-width: 820px; margin: 0 auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-l); padding: 8px 8px 8px 14px; box-shadow: var(--shadow); }\n.app.messenger .composer { max-width: 660px; }\n.composer:focus-within { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }\n.composer textarea { width: 100%; border: 0; outline: none; background: none; resize: none; max-height: 240px; padding: 6px 0; line-height: 1.5; font-size: 15.5px; }\n.composer-bar { display: flex; align-items: center; gap: 6px; }\n.composer-bar .spacer { flex: 1; }\n.pill { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line-soft); background: var(--raised); border-radius: 999px; padding: 4px 11px 4px 9px; font-size: 13px; color: var(--text-2); cursor: pointer; max-width: 260px; }\n.pill:hover { border-color: var(--accent); color: var(--text); }\n.pill span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pill svg { width: 15px; height: 15px; flex: none; }\n.meter { width: 22px; height: 22px; flex: none; }\n.meter circle { fill: none; stroke-width: 3; }\n.meter .bg { stroke: var(--line); }\n.meter .fg { stroke: var(--accent); stroke-linecap: round; transition: stroke-dasharray .4s; }\n.meter.hot .fg { stroke: var(--warn); }\n.send { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; cursor: pointer; flex: none; }\n.send:hover { background: var(--accent-strong); }\n.send svg { width: 18px; height: 18px; }\n.send.stop { background: var(--danger); color: #fff; }\n\n/* Поповеры */\n.pop { position: fixed; z-index: 60; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-m); box-shadow: var(--shadow); padding: 6px; min-width: 260px; max-width: min(360px, 94vw); max-height: 70vh; overflow: auto; }\n.pop-title { font-size: 12.5px; color: var(--muted); padding: 8px 10px 4px; }\n.pop-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: var(--r-s); cursor: pointer; color: var(--text); }\n.pop-item:hover { background: var(--raised); }\n.pop-item.on { background: var(--accent-wash); }\n.pop-item small { display: block; color: var(--muted); font-size: 12.5px; }\n.pop-item svg { width: 17px; height: 17px; flex: none; color: var(--muted); }\n.pop-sep { height: 1px; background: var(--line-soft); margin: 6px 4px; }\n\n/* ── Выдвижная панель ───────────────────────────────────────────────── */\n.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: var(--drawer); max-width: 100vw; background: var(--surface); border-left: 1px solid var(--line); z-index: 40; display: flex; flex-direction: column; transform: translateX(102%); transition: transform .26s cubic-bezier(.2,.7,.2,1); box-shadow: var(--shadow); }\n.drawer.open { transform: none; }\n@media (min-width: 1280px) {\n  .app.drawer-open { grid-template-columns: var(--rail) minmax(0, 1fr) var(--drawer); }\n  .app.drawer-open .drawer { position: relative; transform: none; box-shadow: none; grid-column: 3; grid-row: 1; transition: none; }\n}\n.drawer-head { display: flex; align-items: center; gap: 4px; padding: 10px 8px 0 12px; border-bottom: 1px solid var(--line-soft); }\n.drawer-tabs { display: flex; gap: 2px; flex: 1; overflow-x: auto; }\n.dtab { border: 0; background: none; padding: 10px 10px 12px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }\n.dtab svg { width: 16px; height: 16px; }\n.dtab.on { color: var(--text); border-bottom-color: var(--accent); }\n.drawer-body { flex: 1; overflow: auto; padding: 18px; }\n.block { margin-bottom: 22px; }\n.block-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 650; font-size: 14.5px; margin-bottom: 10px; }\n.block-title small { color: var(--muted); font-weight: 400; font-size: 12.5px; }\n.hint { font-size: 13px; color: var(--muted); margin: 0 0 12px; line-height: 1.5; }\n.panel { background: var(--raised); border: 1px solid var(--line-soft); border-radius: var(--r-m); padding: 14px; margin-bottom: 10px; }\n.who { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }\n.who b { font-size: 15px; }\n.quick { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }\n.rel { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center; }\n.rel input[type=range] { width: 100%; accent-color: var(--accent); }\n.rel output { font-size: 13.5px; color: var(--text-2); min-width: 104px; text-align: right; }\n.rel-log { grid-column: 1 / -1; font-size: 12.5px; color: var(--muted); }\n.pick { display: inline-flex; border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; }\n.pick button { border: 0; background: var(--sunken); padding: 5px 9px; cursor: pointer; font-size: 13px; color: var(--text-2); border-right: 1px solid var(--line); }\n.pick button:last-child { border-right: 0; }\n.pick button.on { background: var(--accent); color: var(--accent-ink); }\n.memo { background: var(--raised); border: 1px solid var(--line-soft); border-radius: var(--r-m); padding: 12px 14px; margin-bottom: 8px; cursor: pointer; position: relative; }\n.memo:hover { border-color: var(--line); }\n.memo.off { opacity: .55; }\n.memo .ev { font-size: 14.5px; }\n.memo .in { font-size: 13px; color: var(--text-2); margin-top: 4px; font-style: italic; }\n.memo .mt { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }\n.tag { font-size: 11.5px; padding: 1px 8px; border-radius: 999px; background: var(--sunken); color: var(--text-2); }\n.tag.pos { color: var(--ok); }\n.tag.neg { color: var(--danger); }\n.memo-bar { position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; }\n.kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 14px; margin: 0; }\n.kv dt { color: var(--muted); }\n.kv dd { margin: 0; }\n.code { white-space: pre-wrap; font: 12.5px/1.55 ui-monospace, \"SF Mono\", Consolas, monospace; background: var(--sunken); border: 1px solid var(--line-soft); border-radius: var(--r-s); padding: 12px; overflow-wrap: anywhere; max-height: 60vh; overflow: auto; }\n.code .role { color: var(--accent); font-weight: 700; }\n.bar-meter { height: 8px; border-radius: 999px; background: var(--sunken); overflow: hidden; display: flex; margin: 8px 0 4px; }\n.bar-meter i { display: block; height: 100%; }\n.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--text-2); }\n.legend span::before { content: \"\"; display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; background: var(--c); vertical-align: 0; }\n\n/* ── Модальные окна ─────────────────────────────────────────────────── */\n.scrim { position: fixed; inset: 0; background: rgba(8, 5, 16, .55); z-index: 35; backdrop-filter: blur(2px); }\n.modal-wrap { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 24px; background: rgba(8, 5, 16, .55); backdrop-filter: blur(3px); }\n.modal { width: min(920px, 100%); max-height: min(780px, 100%); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-l); box-shadow: var(--shadow); display: grid; grid-template-columns: 210px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }\n.modal.narrow { width: min(560px, 100%); grid-template-columns: minmax(0, 1fr); }\n.modal-head { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; padding: 16px 16px 14px 22px; border-bottom: 1px solid var(--line-soft); }\n.modal-head h2 { margin: 0; font-size: 18px; flex: 1; letter-spacing: -.01em; }\n.modal-nav { padding: 12px 10px; border-right: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 2px; overflow: auto; }\n.modal-body { overflow: auto; padding: 22px 26px 26px; }\n.modal-body h3 { font-size: 16px; margin: 0 0 4px; }\n.modal-body .lead { color: var(--text-2); margin: 0 0 18px; font-size: 14px; }\n.modal-foot { display: flex; gap: 8px; justify-content: flex-end; padding-top: 10px; }\n.prov { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; border: 1px solid var(--line-soft); border-radius: var(--r-m); background: var(--raised); margin-bottom: 8px; cursor: pointer; }\n.prov.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-wash); }\n.prov .radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line); }\n.prov.on .radio { border: 5px solid var(--accent); }\n.prov .nm { font-weight: 600; }\n.prov .ds { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 14px; }\n.preset { border: 1px solid var(--line-soft); background: var(--raised); border-radius: var(--r-m); padding: 10px 12px; cursor: pointer; text-align: left; }\n.preset.on { border-color: var(--accent); background: var(--accent-wash); }\n.preset b { display: block; font-size: 14px; }\n.preset small { color: var(--muted); font-size: 12.5px; }\n.themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }\n.theme { border: 2px solid var(--line-soft); border-radius: var(--r-m); padding: 0; cursor: pointer; overflow: hidden; background: none; text-align: left; }\n.theme.on { border-color: var(--accent); }\n.theme .sw { height: 64px; display: flex; align-items: flex-end; padding: 8px; gap: 5px; }\n.theme .sw i { display: block; height: 10px; border-radius: 3px; }\n.theme .nm { padding: 8px 10px; font-size: 13.5px; font-weight: 600; background: var(--raised); }\n.card-edit { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 22px; }\n.portrait { width: 180px; aspect-ratio: 3 / 4; border-radius: var(--r-l); overflow: hidden; display: grid; place-items: center; font-size: 56px; font-weight: 700; color: #fff; position: relative; }\n.portrait img { width: 100%; height: 100%; object-fit: cover; }\n.portrait .chg { position: absolute; bottom: 8px; left: 8px; right: 8px; }\n.lore { border: 1px solid var(--line-soft); border-radius: var(--r-m); padding: 12px; margin-bottom: 8px; background: var(--raised); }\n\n.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: var(--raised); border: 1px solid var(--line); padding: 10px 16px; border-radius: var(--r-m); z-index: 90; max-width: min(560px, 92vw); box-shadow: var(--shadow); display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; }\n.toast.err { border-color: var(--danger); }\n.toast svg { width: 18px; height: 18px; flex: none; margin-top: 1px; }\n.toast.err svg { color: var(--danger); }\n.toast:not(.err) svg { color: var(--ok); }\n\n.empty-note { text-align: center; color: var(--muted); padding: 26px 10px; font-size: 14px; }\n.only-narrow { display: none !important; }\n\n/* ── Адаптив ────────────────────────────────────────────────────────── */\n@media (max-width: 900px) {\n  .app { grid-template-columns: minmax(0, 1fr); }\n  .rail { position: fixed; left: 0; top: 0; bottom: 0; width: min(300px, 86vw); z-index: 45; transform: translateX(-102%); transition: transform .26s cubic-bezier(.2,.7,.2,1); box-shadow: var(--shadow); }\n  .rail.open { transform: none; }\n  .only-narrow { display: inline-grid !important; }\n  .modal { grid-template-columns: minmax(0, 1fr); }\n  .modal-nav { flex-direction: row; border-right: 0; border-bottom: 1px solid var(--line-soft); overflow-x: auto; padding: 8px; }\n  .modal-nav .rail-item { width: auto; white-space: nowrap; }\n  .card-edit { grid-template-columns: minmax(0, 1fr); }\n  .portrait { width: 140px; }\n}\n@media (max-width: 600px) {\n  .home-inner { padding: 20px 16px 40px; }\n  .home h1 { font-size: 24px; }\n  .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }\n  .feed { padding: 16px 12px 8px; }\n  .turn { grid-template-columns: 30px minmax(0, 1fr); gap: 10px; }\n  .turn .av { width: 30px; height: 30px; font-size: 13px; }\n  .composer-wrap { padding: 6px 10px 10px; }\n  .pill { max-width: 150px; }\n  .modal-wrap { padding: 0; }\n  .modal { max-height: 100%; height: 100%; border-radius: 0; }\n  .drawer { width: 100vw; }\n  .head-tools .wide { display: none; }\n  :root { --prose-fs: 16px; }\n}\n\n/* Редактор карточки: ключ спецификации рядом с подписью */\n.spec-key { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); background: var(--raised); border: 1px solid var(--line-soft); border-radius: 5px; padding: 0 5px; font-weight: 400; }\n.alt-greet > label { justify-content: space-between; display: flex; }\n.alt-greet .icon-btn { width: 26px; height: 26px; }\n\n/* Где редактировать персонажа: кнопка на плитке и шапка чата */\n.tile-edit { position: absolute; top: 10px; left: 10px; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 8px; border-radius: 999px; border: 0; cursor: pointer;\n  background: rgba(10, 6, 20, .6); backdrop-filter: blur(6px); color: #fff; font: 500 12.5px var(--ui); opacity: .9; transition: opacity .15s, background .15s; z-index: 2; }\n.tile-edit svg { width: 14px; height: 14px; }\n.tile:hover .tile-edit, .tile:focus-within .tile-edit, .tile-edit:focus-visible { opacity: 1; }\n.tile-edit:hover { background: var(--accent); }\n@media (hover: none) { .tile-edit { opacity: 1; } .tile-edit span { display: none; } .tile-edit { padding: 6px; } }\n.head-av { border: 0; padding: 0; background: none; cursor: pointer; border-radius: 50%; line-height: 0; }\n.head-av:hover { box-shadow: 0 0 0 2px var(--accent); }\n.head-card { border: 0; padding: 0; background: none; font: inherit; color: inherit; cursor: pointer; text-align: left; }\n.head-card:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }\n\n/* Ассистент — разговор с моделью вне игры */\n.assist-mark { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-wash); color: var(--accent); flex: none; }\n.assist-mark svg { width: 22px; height: 22px; }\n.assist-head .pill .av { width: 18px; height: 18px; font-size: 10px; flex: none; }\n.pop-item .av { flex: none; }\n.av-18 { width: 18px; height: 18px; font-size: 10px; }\n.av-22 { width: 22px; height: 22px; font-size: 11px; }\n.assist-empty { text-align: center; padding: 6vh 8px 10px; max-width: 620px; margin: 0 auto; }\n.assist-hero { width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 20px; display: grid; place-items: center; background: var(--accent-wash); color: var(--accent); }\n.assist-hero svg { width: 34px; height: 34px; }\n.assist-empty h2 { margin: 0 0 8px; font-size: 22px; letter-spacing: -.01em; }\n.assist-empty p { color: var(--text-2); margin: 0 auto 20px; line-height: 1.55; }\n.starters { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; text-align: left; }\n.starter { border: 1px solid var(--line-soft); background: var(--surface); color: var(--text); border-radius: var(--r-m); padding: 12px 14px; cursor: pointer; font: inherit; font-size: 14px; text-align: left; line-height: 1.4; }\n.starter:hover { border-color: var(--accent); background: var(--accent-wash); }\n.aturn { display: flex; flex-direction: column; min-width: 0; }\n.aturn.user { align-items: flex-end; }\n.aturn.user .bubble-plain { background: var(--accent-wash); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); border-radius: var(--r-l) var(--r-l) 4px var(--r-l); padding: 10px 14px; max-width: min(640px, 92%); line-height: 1.55; overflow-wrap: anywhere; }\n.aturn .tools { margin-top: 4px; }\n.aturn:hover .tools, .aturn:focus-within .tools, .aturn.last .tools { opacity: 1; }\n.md { font-size: 15.5px; line-height: 1.65; color: var(--text); overflow-wrap: anywhere; }\n.md > :first-child { margin-top: 0; }\n.md > :last-child { margin-bottom: 0; }\n.md p { margin: 0 0 .75em; }\n.md ul, .md ol { margin: 0 0 .75em; padding-left: 1.4em; }\n.md li { margin: .2em 0; }\n.md h3, .md h4, .md h5, .md h6 { margin: 1em 0 .4em; font-size: 1.05em; }\n.md h3 { font-size: 1.15em; }\n.md blockquote { margin: 0 0 .75em; padding: 2px 12px; border-left: 3px solid var(--line); color: var(--text-2); }\n.md code { font: .9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--raised); border: 1px solid var(--line-soft); border-radius: 5px; padding: 0 4px; }\n.md .mdcode { position: relative; margin: 0 0 .9em; }\n.md pre { margin: 0; background: var(--raised); border: 1px solid var(--line-soft); border-radius: var(--r-m); padding: 12px 14px; overflow: auto; white-space: pre-wrap; }\n.md pre code { background: none; border: 0; padding: 0; font-size: 13.5px; line-height: 1.55; }\n.md .code-copy { position: absolute; top: 6px; right: 6px; opacity: .7; }\n.md .code-copy:hover { opacity: 1; }\n.md.cursor > :last-child::after, .md.cursor:empty::after { content: \"\"; display: inline-block; width: .5em; height: 1.05em; vertical-align: -0.15em; margin-left: 2px; background: var(--accent); animation: caret 1s steps(2) infinite; border-radius: 2px; }\n.md.cursor::after { content: none; }\n@media (max-width: 600px) { .assist-head .pill { max-width: 128px; } .assist-head .assist-mark { display: none; } }\n.assist-head .head-who { overflow: hidden; }\n.assist-head .head-scene { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\n/* Prism: переполнение, отбор опыта, непривязанные записи */\n.err-block { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--danger); border-radius: var(--r-m); padding: 10px 12px; color: var(--text); background: color-mix(in srgb, var(--danger) 10%, transparent); font-size: 14px; }\n.err-block svg { width: 18px; height: 18px; color: var(--danger); flex: none; margin-top: 2px; }\n.exp-debug summary { cursor: pointer; font-weight: 600; font-size: 14px; }\n.exp-debug table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }\n.exp-debug th, .exp-debug td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }\n.exp-debug th { color: var(--muted); font-weight: 500; }\n.exp-debug tr.sel td:first-child { color: var(--text); font-weight: 600; }\n.exp-debug td:not(:first-child) { white-space: nowrap; color: var(--text-2); }\n.legacy-block { border-top: 1px dashed var(--line); padding-top: 12px; margin-top: 8px; }\n.legacy-block .memo { cursor: default; }\n"; d.head.appendChild(st);
  var boot = d.getElementById("prism-boot"); if (boot) boot.remove();
  var wrap = d.createElement("div"); wrap.innerHTML = "<div id=\"app\" class=\"app\">\n  <aside class=\"rail\" id=\"rail\" aria-label=\"Навигация\"></aside>\n  <main class=\"stage\" id=\"stage\"></main>\n  <aside class=\"drawer\" id=\"drawer\" aria-label=\"Панель сцены\"></aside>\n  <div class=\"scrim\" id=\"scrim\" hidden></div>\n  <div id=\"pop-root\"></div>\n  <div id=\"modal-root\"></div>\n  <div class=\"toast\" id=\"toast\" role=\"status\" hidden></div>\n  <input type=\"file\" id=\"file-card\" accept=\".png,.json,image/png,application/json\" multiple hidden>\n  <input type=\"file\" id=\"file-backup\" accept=\".json,application/json\" hidden>\n  <input type=\"file\" id=\"file-avatar\" accept=\"image/*\" hidden>\n</div>\n\n<!-- Порядок загрузки = порядок зависимостей (каждый модуль берёт зависимости из PRP при загрузке).\n     1. ядро → 2. чистые модули предметной области и транспорт → 3. платформенные адаптеры и представления\n     → 4. прикладные сервисы → 5. оболочка интерфейса и контроллеры → 6. корень приложения. -->";
  while (wrap.firstChild) d.body.appendChild(wrap.firstChild);
  window.PRISM_RP_VERSION = "0.5.0";
})();
/* js/core/util.js */
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

/* js/core/store.js */
/* Prism RP — хранилище в IndexedDB. Всё хранится локально в браузере;
   бэкап — один JSON со всеми коллекциями. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const DB_NAME = "prism-rp";
  const DB_VERSION = 3;
  const STORES = ["cards", "chats", "messages", "experience", "settings", "images", "assist"];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
        if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" }).createIndex("cardId", "cardId");
        if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" }).createIndex("chatId", "chatId");
        if (!db.objectStoreNames.contains("experience")) db.createObjectStore("experience", { keyPath: "id" }).createIndex("owner", "owner");
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
        // v2: картинки отдельно от сообщений, чтобы правка текста не переписывала мегабайты.
        if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "id" }).createIndex("chatId", "chatId");
        // v3: разговоры с ассистентом (вне ролевой игры), сообщения хранятся внутри разговора.
        if (!db.objectStoreNames.contains("assist")) db.createObjectStore("assist", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("База занята другой вкладкой"));
    });
    return dbPromise;
  }

  function wrap(req) {
    return new Promise((ok, fail) => { req.onsuccess = () => ok(req.result); req.onerror = () => fail(req.error); });
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((ok, fail) => {
      const t = db.transaction(store, mode);
      let result;
      Promise.resolve(fn(t.objectStore(store))).then((r) => { result = r; }, fail);
      t.oncomplete = () => ok(result);
      t.onerror = () => fail(t.error);
      t.onabort = () => fail(t.error || new Error("Транзакция прервана"));
    });
  }

  const api = {
    get: (store, id) => tx(store, "readonly", (s) => wrap(s.get(id))),
    all: (store) => tx(store, "readonly", (s) => wrap(s.getAll())),
    byIndex: (store, index, value) => tx(store, "readonly", (s) => wrap(s.index(index).getAll(value))),
    put: (store, obj) => {
      if (store !== "settings") obj.updatedAt = Date.now();
      return tx(store, "readwrite", (s) => wrap(s.put(obj))).then(() => obj);
    },
    putMany: (store, list) => tx(store, "readwrite", (s) => Promise.all(list.map((o) => wrap(s.put(o))))),
    del: (store, id) => tx(store, "readwrite", (s) => wrap(s.delete(id))),
    delMany: (store, ids) => tx(store, "readwrite", (s) => Promise.all(ids.map((id) => wrap(s.delete(id))))),

    async getSetting(key, fallback) {
      const r = await api.get("settings", key);
      return r ? r.value : fallback;
    },
    setSetting: (key, value) => api.put("settings", { key, value }),

    async exportAll(opts) {
      const out = { app: "prism-rp", version: 3, exportedAt: new Date().toISOString() };
      for (const s of STORES) if (!(opts && opts.noImages && s === "images")) out[s] = await api.all(s);
      return out;
    },
    // replace=true очищает коллекции перед загрузкой
    async importAll(data, replace) {
      if (!data || data.app !== "prism-rp") throw new Error("Это не бэкап Prism RP");
      for (const s of STORES) {
        if (!Array.isArray(data[s])) continue;
        if (replace) await tx(s, "readwrite", (st) => wrap(st.clear()));
        await api.putMany(s, data[s]);
      }
    },
  };

  PRP.store = api;
})(typeof window !== "undefined" ? window : globalThis);

/* js/core/settings.js */
/* Prism RP — настройки: значения по умолчанию и чистые вычисления над ними.
   Не читает DOM, хранилище и сеть: на вход — объект настроек, на выход — значения.
   Сохранение настроек делает приложение (app.js) через хранилище. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const DEFAULTS = {
    activeProvider: "perchance",
    providers: [],
    samplerPreset: "balanced",
    sampler: { temperature: 0.9, top_p: 0.95, min_p: 0.05, top_k: 0, repetition_penalty: 1.05, max_tokens: 700 },
    contextTokens: 8192,
    autoContext: true,
    singleSystem: false,
    sceneProtocol: true,
    noPostHistory: false,
    expLimit: 8,
    theme: "dusk",
    proseSize: 17,
    persona: { name: "Пользователь", description: "" },
    images: {
      enabled: true, backend: "perchance", url: "", key: "", model: "", vae: "", sampler: "", scheduler: "",
      steps: 28, cfg: 5.5, seed: "", sizeMode: "auto", fixedSize: "1024x1024", maxSide: 1216,
      hires: false, hiresScale: 1.5, hiresUpscaler: "R-ESRGAN 4x+ Anime6B", hiresDenoise: 0.4, hiresSteps: 0,
      fixedPrompt: "", promptMode: "append", negative: "", format: "tags", translate: true,
      modelDraws: true, autoDraw: true, extra: "",
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // Сохранённые настройки поверх значений по умолчанию (вложенные группы — тоже поверх).
  // perchanceImages: доступна ли генерация картинок Perchance (для первого запуска вне Perchance).
  function merge(saved, opts) {
    const s = Object.assign(clone(DEFAULTS), saved || {});
    s.sampler = Object.assign({}, DEFAULTS.sampler, s.sampler || {});
    s.persona = Object.assign({}, DEFAULTS.persona, s.persona || {});
    s.images = Object.assign({}, DEFAULTS.images, s.images || {});
    if (!saved && opts && opts.perchanceImages === false) s.images.backend = "a1111";
    return s;
  }

  function persona(s) { return (s && s.persona) || DEFAULTS.persona; }

  // Список текстовых моделей: бесплатная Perchance (если доступна) + свои API.
  function providerList(s, perchanceAvailable) {
    const list = [];
    if (perchanceAvailable) list.push({ id: "perchance", name: "Perchance", kind: "perchance", label: "Perchance" });
    for (const p of s.providers) list.push(Object.assign({ kind: "openai", label: p.model ? `${p.name} · ${p.model}` : p.name }, p));
    return list;
  }
  function activeProvider(s, list) {
    return list.find((p) => p.id === s.activeProvider) || list[0] || null;
  }
  // Объём контекста: для Perchance — из метаданных плагина, если включено; иначе из настроек.
  // perchanceMeta — объект или функция (вызывается, только если метаданные нужны).
  function contextTokens(s, provider, perchanceMeta) {
    if (s.autoContext && provider && provider.kind === "perchance") {
      const m = typeof perchanceMeta === "function" ? perchanceMeta() : perchanceMeta;
      if (m && m.idealMaxContextTokens) return m.idealMaxContextTokens;
    }
    return s.contextTokens || 8192;
  }
  function imagesOn(s, perchanceImagesAvailable) {
    const ic = s.images;
    return ic.enabled && (ic.backend !== "perchance" || perchanceImagesAvailable);
  }
  function qualityPinned(s) {
    const ic = s.images;
    return ic.promptMode !== "off" && !!String(ic.fixedPrompt || "").trim();
  }

  PRP.settings = { DEFAULTS, merge, persona, providerList, activeProvider, contextTokens, imagesOn, qualityPinned };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.settings;
})(typeof window !== "undefined" ? window : globalThis);

/* js/prism/scene.js */
/* Prism RP — трекер сцены и гардероба.
   Модель присылает короткие дельты в конце ответа:
     [scene: time=+15m; loc=Кафе, терраса; enter=Юки; Химэ.wear=худи, джинсы; Химэ.rel=+1 помог]
   Приложение хранит состояние, а модель видит его как факты.
   Состояние не хранится «по сообщениям»: оно пересчитывается свёрткой дельт
   активной ветки, поэтому свайп или удаление сообщения откатывает и сцену. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const DIRECTIVE_RE = /\[scene:\s*([^\]]*)\]/gi;
  const PARTIAL_RE = /\[scene:[^\]]*$/i;
  const REL_MIN = -10, REL_MAX = 10, REL_STEP_MAX = 3;

  function emptyState() {
    return {
      clock: { y: null, m: null, d: null, day: 1, min: null },
      loc: "",
      weather: "",
      present: [],
      flags: [],
      chars: {},
    };
  }

  /* ── Разбор ─────────────────────────────────────────────────────────── */

  function parseBody(body) {
    const ops = [];
    String(body || "")
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        const eq = part.indexOf("=");
        if (eq <= 0) {
          ops.push({ key: "", value: part, raw: part });
          return;
        }
        const keyRaw = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        const dot = keyRaw.lastIndexOf(".");
        if (dot > 0) {
          ops.push({
            subject: keyRaw.slice(0, dot).trim(),
            key: keyRaw.slice(dot + 1).trim().toLowerCase(),
            value,
            raw: part,
          });
        } else {
          ops.push({ key: keyRaw.toLowerCase(), value, raw: part });
        }
      });
    return ops;
  }

  // Достаёт все директивы из текста ответа. Возвращает очищенный текст и операции.
  function parse(text) {
    const ops = [];
    const clean = String(text || "").replace(DIRECTIVE_RE, (_, body) => {
      ops.push(...parseBody(body));
      return "";
    });
    return { text: tidy(clean), ops };
  }

  // Для стриминга: прячет и законченные, и ещё не закрытые директивы.
  function stripForDisplay(text) {
    return tidy(String(text || "").replace(DIRECTIVE_RE, "").replace(PARTIAL_RE, ""));
  }

  function tidy(s) {
    return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ── Время ──────────────────────────────────────────────────────────── */

  const UNIT_MIN = { m: 1, min: 1, "мин": 1, h: 60, "ч": 60, d: 1440, "д": 1440, "дн": 1440 };

  function shiftClock(c, minutes) {
    const base = c.min == null ? 0 : c.min;
    let total = base + minutes;
    let days = Math.floor(total / 1440);
    total -= days * 1440;
    c.min = total;
    if (days) addDays(c, days);
  }

  function addDays(c, days) {
    c.day += days;
    if (c.m != null) {
      const dt = new Date(Date.UTC(c.y || 2000, c.m - 1, c.d));
      dt.setUTCDate(dt.getUTCDate() + days);
      c.m = dt.getUTCMonth() + 1;
      c.d = dt.getUTCDate();
      if (c.y != null) c.y = dt.getUTCFullYear();
    }
  }

  function applyTime(c, value) {
    let v = String(value).trim().toLowerCase();
    const rel = v.match(/^\+\s*(\d+(?:[.,]\d+)?)\s*([a-zа-я]*)$/i);
    if (rel) {
      const n = parseFloat(rel[1].replace(",", "."));
      const unit = UNIT_MIN[rel[2]] || (rel[2] ? null : 1);
      if (unit == null) return false;
      shiftClock(c, Math.round(n * unit));
      return true;
    }
    let matched = false;
    // ISO: 2026-05-14 [18:40]
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t](.*))?$/);
    if (iso) {
      c.y = +iso[1]; c.m = +iso[2]; c.d = +iso[3];
      v = (iso[4] || "").trim();
      matched = true;
    } else {
      // 14.05[.2026] [18:40]
      const dm = v.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s+(.*))?$/);
      // «18.40» без года и времени — это время, если вторая часть не похожа на месяц.
      const looksLikeTime = dm && !dm[3] && !dm[4] && +dm[2] > 12;
      if (dm && !looksLikeTime && +dm[2] >= 1 && +dm[2] <= 12 && +dm[1] >= 1 && +dm[1] <= 31) {
        c.d = +dm[1]; c.m = +dm[2];
        c.y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : c.y;
        v = (dm[4] || "").trim();
        matched = true;
      }
    }
    if (!v) return matched;
    const hm = v.match(/^(\d{1,2})[:.](\d{2})$/);
    if (hm) {
      const min = +hm[1] * 60 + +hm[2];
      if (min >= 1440) return matched;
      // Время раньше текущего без указания даты — это уже следующий день.
      if (!matched && c.min != null && min < c.min) addDays(c, 1);
      c.min = min;
      return true;
    }
    return matched;
  }

  function formatClock(c) {
    const parts = [];
    if (c.m != null) {
      const dd = String(c.d).padStart(2, "0"), mm = String(c.m).padStart(2, "0");
      parts.push(c.y != null ? `${dd}.${mm}.${c.y}` : `${dd}.${mm}`);
    } else {
      parts.push("день " + c.day);
    }
    if (c.min != null) {
      parts.push(String(Math.floor(c.min / 60)).padStart(2, "0") + ":" + String(c.min % 60).padStart(2, "0"));
    }
    return parts.join(", ");
  }

  /* ── Применение ─────────────────────────────────────────────────────── */

  function splitList(v) {
    return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
  }

  function isClear(v) {
    return /^(-|—|–|нет|none)$/i.test(String(v).trim());
  }

  function findName(list, name) {
    const low = name.toLowerCase();
    return list.findIndex((n) => n.toLowerCase() === low);
  }

  function charOf(state, name) {
    const key = Object.keys(state.chars).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key) return state.chars[key];
    return (state.chars[name] = { wear: [], pose: "", mood: "", moodSrc: null, moodTurn: null, rel: 0, relLog: [] });
  }

  function sameItem(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
  }

  // Чистая функция: возвращает новое состояние и списки применённых/пропущенных операций.
  function apply(state, ops, meta) {
    const s = JSON.parse(JSON.stringify(state || emptyState()));
    const applied = [], ignored = [];
    const msgId = meta && meta.msgId;
    for (const op of ops || []) {
      let ok = true;
      const v = op.value;
      if (op.subject) {
        const ch = charOf(s, op.subject);
        switch (op.key) {
          case "wear": ch.wear = isClear(v) ? [] : splitList(v); break;
          case "add": splitList(v).forEach((it) => { if (!ch.wear.some((w) => sameItem(w, it))) ch.wear.push(it); }); break;
          case "remove": splitList(v).forEach((it) => { ch.wear = ch.wear.filter((w) => !sameItem(w, it)); }); break;
          case "pose": ch.pose = isClear(v) ? "" : v; break;
          case "mood":
            ch.mood = isClear(v) ? "" : v;
            // Источник оценки на активном пути: сообщение и номер хода (для возраста).
            ch.moodSrc = ch.mood ? (msgId || null) : null;
            ch.moodTurn = ch.mood ? (meta && meta.turn != null ? meta.turn : 0) : null;
            break;
          case "rel": {
            const m = String(v).match(/^([+-]?\d+)\s*(.*)$/);
            if (!m) { ok = false; break; }
            const delta = Math.max(-REL_STEP_MAX, Math.min(REL_STEP_MAX, parseInt(m[1], 10)));
            ch.rel = Math.max(REL_MIN, Math.min(REL_MAX, ch.rel + delta));
            if (delta) ch.relLog.push({ delta, why: m[2].trim(), msgId: msgId || null });
            if (ch.relLog.length > 20) ch.relLog = ch.relLog.slice(-20);
            break;
          }
          case "relset": {
            // Ручная установка из формы: точное значение, без ограничения шага.
            const m = String(v).match(/^([+-]?\d+)\s*(.*)$/);
            if (!m) { ok = false; break; }
            const target = Math.max(REL_MIN, Math.min(REL_MAX, parseInt(m[1], 10)));
            const delta = target - ch.rel;
            ch.rel = target;
            if (delta) ch.relLog.push({ delta, why: m[2].trim() || "поправлено вручную", msgId: msgId || null });
            if (ch.relLog.length > 20) ch.relLog = ch.relLog.slice(-20);
            break;
          }
          default: ok = false;
        }
      } else {
        switch (op.key) {
          case "time": ok = applyTime(s.clock, v); break;
          case "loc": s.loc = isClear(v) ? "" : v; break;
          case "weather": s.weather = isClear(v) ? "" : v; break;
          case "enter": splitList(v).forEach((n) => { if (findName(s.present, n) < 0) s.present.push(n); }); break;
          case "leave": splitList(v).forEach((n) => { const i = findName(s.present, n); if (i >= 0) s.present.splice(i, 1); }); break;
          case "flag": splitList(v).forEach((f) => {
            if (f.startsWith("-")) s.flags = s.flags.filter((x) => x !== f.slice(1));
            else if (!s.flags.includes(f)) s.flags.push(f);
          }); break;
          default: ok = false;
        }
      }
      (ok ? applied : ignored).push(op);
    }
    return { state: s, applied, ignored };
  }

  // Свёртка: начальная сцена + дельты по сообщениям активной ветки.
  /* steps: [{ msgId, ops, role? }] по активному пути. Ход = ответ модели (role "assistant");
     если роль не указана, ходом считается каждый шаг. Возраст настроения считается
     заново по каждой ветке и нигде не хранится. */
  function fold(initBody, steps) {
    let st = apply(emptyState(), parseBody(initBody || ""), { turn: 0 }).state;
    let turn = 0;
    for (const step of steps || []) {
      if (!step.role || step.role === "assistant") turn++;
      st = apply(st, step.ops, { msgId: step.msgId, turn }).state;
    }
    st.turn = turn;
    for (const n of Object.keys(st.chars)) {
      const ch = st.chars[n];
      ch.moodAge = ch.mood ? Math.max(0, turn - (ch.moodTurn || 0)) : null;
    }
    return st;
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function ageWords(age) {
    if (age == null) return "";
    if (age === 0) return "отмечено сейчас";
    return `отмечено ${age} ${plural(age, "ход", "хода", "ходов")} назад`;
  }

  /* ── Описание для модели и для интерфейса ───────────────────────────── */

  function relWord(rel) {
    if (rel <= -6) return "враждебно";
    if (rel <= -3) return "холодно";
    if (rel <= -1) return "настороженно";
    if (rel === 0) return "нейтрально";
    if (rel <= 2) return "тепло";
    if (rel <= 5) return "близко";
    return "очень близко";
  }

  // Текст блока «Сейчас (факты)». Отношения — словом и причиной, без голых чисел.
  function describe(state, opts) {
    const o = opts || {};
    const s = state || emptyState();
    const lines = [];
    const when = formatClock(s.clock);
    if (s.clock.m != null || s.clock.min != null) lines.push("Время: " + when);
    if (s.loc) lines.push("Место: " + s.loc);
    if (s.weather) lines.push("Погода: " + s.weather);
    if (s.present.length) lines.push("Рядом: " + s.present.join(", "));
    const names = Object.keys(s.chars);
    for (const n of names) {
      const ch = s.chars[n];
      const bits = [];
      if (ch.wear.length) bits.push("одет(а): " + ch.wear.join(", "));
      if (ch.pose) bits.push(ch.pose);
      if (ch.mood) bits.push("настроение (оценка): " + ch.mood + (ch.moodAge != null ? " — " + ageWords(ch.moodAge) : ""));
      if (ch.rel !== 0 || ch.relLog.length) {
        const why = ch.relLog.slice(-2).map((r) => r.why).filter(Boolean);
        bits.push(`отношение к собеседнику (${o.userName || "собеседник"}): ${relWord(ch.rel)}` + (why.length ? ` — ${why.join("; ")}` : ""));
      }
      if (bits.length) lines.push(`${n}: ${bits.join("; ")}`);
    }
    if (s.flags.length) lines.push("Отметки сюжета: " + s.flags.join(", "));
    return lines.join("\n");
  }

  // Одна строка для шапки чата.
  function summaryLine(state) {
    const s = state || emptyState();
    const parts = [];
    if (s.clock.m != null || s.clock.min != null) parts.push(formatClock(s.clock));
    if (s.loc) parts.push(s.loc);
    if (s.weather) parts.push(s.weather);
    return parts.join(" · ");
  }

  // Короткие подписи изменений для плашек под сообщением.
  function opLabel(op) {
    if (op.subject) {
      const map = { wear: "одежда", add: "+", remove: "−", pose: "поза", mood: "настроение", rel: "отношение", relset: "отношение =" };
      return `${op.subject}: ${map[op.key] || op.key} ${op.value}`.trim();
    }
    const map = { time: "время", loc: "место", weather: "погода", enter: "пришли", leave: "ушли", flag: "отметка" };
    return `${map[op.key] || op.key || "?"}: ${op.value}`;
  }

  const PROTOCOL = [
    "В самом конце ответа, отдельной строкой, сообщи только изменения сцены, если они были:",
    "[scene: time=+15m; loc=место; weather=погода; enter=Имя; leave=Имя; Имя.wear=полный комплект одежды; Имя.add=предмет; Имя.remove=предмет; Имя.pose=поза; Имя.mood=настроение; Имя.rel=+1 причина]",
    "Указывай только то, что изменилось. Не пересказывай сцену в тексте ответа. Если ничего не изменилось — строку не пиши.",
  ].join("\n");

  PRP.scene = { emptyState, parse, parseBody, stripForDisplay, apply, fold, ageWords, describe, summaryLine, formatClock, relWord, opLabel, PROTOCOL };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.scene;
})(typeof window !== "undefined" ? window : globalThis);

/* js/prism/experience.js */
/* Prism RP — опыт персонажа (Experience).
   Запись = свидетельство прошлого, а не инструкция.

   Канон (этап 1):
   • Каждый чат — отдельный мир. Опыт принадлежит чату: record.chatId === chat.id.
     Одна и та же карточка в другом чате этот опыт не видит.
   • Внутри чата опыт подчиняется веткам так же, как сцена:
       – source.messageIds пуст → запись «на весь чат», видна во всех ветках;
       – иначе запись видна, только если ВСЕ её сообщения лежат на активном пути,
         и (если записан source.swipes) у них активен тот же вариант ответа.
     Скрытые записи не удаляются: вернулись в ветку — запись снова видна.
   • Записи без надёжной привязки к чату (старые данные) не угадываются:
     они помечаются legacyUnscoped, хранятся целиком и в Prism не попадают,
     пока пользователь сам не привяжет их к чату.

   Отбор: входит только запись, совпавшая по теме с происходящим. Среди подходящих порядок:
   тема → участники → важность → свежесть (только при равенстве). Важность не создаёт
   релевантность; знак события (valence) — метаданные и отбор не запускает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  function blank(ownerId, chatId) {
    return {
      id: null,
      chatId: chatId || null,
      owner: ownerId || null,
      witnesses: [],
      event: "",
      interpretation: "",
      consequences: "",
      domains: [],
      about: [],
      valence: 0,
      weight: 1,
      source: { chatId: chatId || null, messageIds: [], swipes: {}, sceneTime: "" },
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /* ── Канон: чат и ветка ─────────────────────────────────────────────── */

  // "branch" — привязана к сообщениям; "chat" — на весь чат; "legacy" — без надёжного чата.
  function scopeOf(r) {
    if (!r || r.legacyUnscoped || !r.chatId) return "legacy";
    return (r.source && r.source.messageIds && r.source.messageIds.length) ? "branch" : "chat";
  }

  /* ctx: { chatId, path: [{id, swipeIdx}] } — активный путь текущего чата.
     → { visible, reason } */
  function visibility(r, ctx) {
    const c = ctx || {};
    if (!r) return { visible: false, reason: "нет записи" };
    const scope = scopeOf(r);
    if (scope === "legacy") return { visible: false, reason: "не привязана к чату" };
    if (r.chatId !== c.chatId) return { visible: false, reason: "другой чат" };
    if (scope === "chat") return { visible: true, reason: "на весь чат" };
    const onPath = new Map((c.path || []).map((p) => [p.id, p.swipeIdx || 0]));
    const sw = (r.source && r.source.swipes) || {};
    for (const id of r.source.messageIds) {
      if (!onPath.has(id)) return { visible: false, reason: "другая ветка" };
      if (sw[id] != null && onPath.get(id) !== sw[id]) return { visible: false, reason: "другой вариант ответа" };
    }
    return { visible: true, reason: "в этой ветке" };
  }

  /* Миграция старых записей. Чистая функция, идемпотентна.
     lookup.messageChat(id) → chatId сообщения или null (если сообщения нет).
     → { records: [новые объекты], changed: [id], legacy: число } */
  function migrate(records, lookup) {
    const L = lookup || {};
    const out = [], changed = [];
    let legacy = 0;
    for (const r0 of records || []) {
      const r = JSON.parse(JSON.stringify(r0));
      r.source = r.source || {};
      if (!Array.isArray(r.source.messageIds)) r.source.messageIds = [];
      let chatId = r.chatId || null;
      if (!chatId && r.source.chatId) chatId = r.source.chatId;
      if (!chatId && r.source.messageIds.length && L.messageChat) {
        const chats = new Set(r.source.messageIds.map((id) => L.messageChat(id)));
        // Только однозначно: все сообщения найдены и все из одного чата.
        if (chats.size === 1 && !chats.has(null) && !chats.has(undefined)) chatId = [...chats][0];
      }
      if (chatId) {
        if (r.chatId !== chatId || r.legacyUnscoped) {
          r.chatId = chatId;
          delete r.legacyUnscoped;
          if (!r.source.chatId) r.source.chatId = chatId;
          changed.push(r.id);
        }
      } else {
        legacy++;
        if (!r.legacyUnscoped || r.chatId) { r.legacyUnscoped = true; r.chatId = null; changed.push(r.id); }
      }
      out.push(r);
    }
    return { records: out, changed, legacy };
  }

  // Ручная привязка старой записи к чату. Происхождение сохраняется в source.originMessageIds;
  // запись становится «на весь чат», потому что её сообщения этому чату не принадлежат.
  function assignToChat(r0, chatId) {
    const r = JSON.parse(JSON.stringify(r0));
    r.source = r.source || {};
    if ((r.source.messageIds || []).length) r.source.originMessageIds = r.source.messageIds.slice();
    r.source.messageIds = [];
    r.source.swipes = {};
    r.source.assignedManually = true;
    r.chatId = chatId;
    delete r.legacyUnscoped;
    return r;
  }

  /* ── Отбор по теме ───────────────────────────────────────────────────── */

  function stem(w) {
    w = String(w || "").toLowerCase().trim();
    return w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w;
  }
  function tokens(text) {
    return String(text || "").toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) || [];
  }
  // Словарь контекста: уникальные слова без имён участников.
  function contextVocab(text, names) {
    const skip = new Set();
    for (const n of names || []) tokens(n).forEach((t) => skip.add(t));
    const set = new Set();
    for (const t of tokens(text)) if (t.length >= 3 && !skip.has(t)) set.add(t);
    return { words: [...set], skip };
  }
  // Тема (домен) совпала, если каждое её слово (по основе) встречается в контексте.
  function domainHit(domain, vocab) {
    const parts = tokens(domain).filter((t) => t.length >= 3 && !vocab.skip.has(t));
    if (!parts.length) return false;
    return parts.every((p) => { const s = stem(p); return vocab.words.some((w) => w.startsWith(s)); });
  }

  // Числа отбора для одной записи.
  function relevance(r, ctx, vocab) {
    const doms = [...new Set((r.domains || []).map((d) => String(d).toLowerCase().trim()).filter(Boolean))];
    const domainHits = doms.filter((d) => domainHit(d, vocab)).length;
    // Слабый запасной сигнал: длинные слова самого события, если темы не заданы или не совпали.
    let wordHits = 0;
    if (!domainHits) {
      const ev = new Set(tokens(r.event).filter((t) => t.length >= 5 && !vocab.skip.has(t)).map(stem));
      for (const s of ev) if (vocab.words.some((w) => w.startsWith(s))) wordHits++;
    }
    const topic = domainHits + 0.25 * Math.min(wordHits, 3);
    const present = new Set(ctx.present || []);
    const participant = (r.about || []).some((a) => present.has(a)) ? 1 : 0;
    return { topic, domainHits, wordHits, participant, weight: Number(r.weight) || 1 };
  }


  /* records: все записи; ctx: { chatId, path, present: [ids], text, names: [имена], limit, ownerId? }
     → { selected: [записи в хронологическом порядке], debug: [строки отбора] } */
  function rank(records, ctx) {
    const c = ctx || {};
    const limit = c.limit != null ? c.limit : 8;
    const vocab = contextVocab(c.text, c.names);
    const rows = [];
    for (const r of records || []) {
      if (c.ownerId && r.owner && r.owner !== c.ownerId) continue;
      const vis = visibility(r, c);
      const inChat = r.chatId === c.chatId && scopeOf(r) !== "legacy";
      if (!inChat) continue; // чужие чаты и непривязанные записи даже не показываем в отладке
      const rel = relevance(r, c, vocab);
      // Релевантность решает, может ли запись войти; важность лишь упорядочивает подходящие.
      const eligible = vis.visible && r.status === "active" && rel.topic > 0;
      rows.push({ r, visible: vis.visible, reason: vis.reason, active: r.status === "active", eligible, ...rel, recencyRank: 0, selected: false });
    }
    // Свежесть: ранг среди записей чата (1 — самая новая). Только для разрешения равенства.
    rows.slice().sort((a, b) => (b.r.createdAt || 0) - (a.r.createdAt || 0)).forEach((x, i) => { x.recencyRank = i + 1; });
    const cmp = (a, b) => (b.topic - a.topic) || (b.participant - a.participant) || (b.weight - a.weight) || (a.recencyRank - b.recencyRank);
    const pool = rows.filter((x) => x.eligible).sort(cmp);
    pool.slice(0, limit).forEach((x, i) => { x.selected = true; x.priority = i + 1; });
    const selectedRows = pool.filter((x) => x.selected);
    return {
      // Порядок важности (priority) нужен сборщику: при нехватке места уходят последние.
      ranked: selectedRows.map((x) => x.r),
      // Хронологический порядок читается моделью как история, а не как рейтинг.
      selected: selectedRows.map((x) => x.r).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      debug: rows.sort((a, b) => (b.selected - a.selected) || cmp(a, b)).map((x) => ({
        id: x.r.id, event: x.r.event, topic: x.topic, domainHits: x.domainHits, wordHits: x.wordHits, participant: x.participant,
        weight: x.weight, recencyRank: x.recencyRank, visible: x.visible, reason: x.reason, active: x.active, selected: x.selected, priority: x.priority || null,
      })),
      visibleCount: rows.filter((x) => x.visible && x.active).length,
    };
  }

  // Совместимость: только список в хронологическом порядке.
  function select(records, ctx) { return rank(records, ctx).selected; }

  function formatOne(r) {
    const parts = ["— " + (r.source && r.source.sceneTime ? `[${r.source.sceneTime}] ` : "") + String(r.event || "").trim()];
    if (r.interpretation) parts.push("  тогда понял(а) это так: " + r.interpretation.trim());
    if (r.consequences) parts.push("  последствия: " + r.consequences.trim());
    return parts.join("\n");
  }
  function format(list) { return (list || []).map(formatOne).join("\n"); }

  PRP.experience = { blank, scopeOf, visibility, migrate, assignToChat, rank, select, format, formatOne, tokens, stem };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.experience;
})(typeof window !== "undefined" ? window : globalThis);

/* js/prism/assembler.js */
/* Prism RP — сборщик контекста.
   Prism не хранится: на каждом ходе он собирается из Card + Scene + релевантного
   Experience. Каждый слой подаётся своей формулировкой, чтобы модель читала
   склонности и воспоминания как контекст восприятия, а не как приказы. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util || (typeof require !== "undefined" ? require("../core/util.js") : null);
  const SCENE = PRP.scene || (typeof require !== "undefined" ? require("./scene.js") : null);
  const EXP = PRP.experience || (typeof require !== "undefined" ? require("./experience.js") : null);

  const TEMPLATES = {
    rp: {
      frame:
        "Ты ведёшь ролевую игру за {{char}}. Собеседник играет {{user}}.\n" +
        "Решай, как {{char}} поступит именно сейчас, исходя из сцены, характера и памяти. " +
        "Черты характера влияют на то, как {{char}} воспринимает происходящее, но не предписывают поступков. " +
        "Воспоминания — свидетельства прошлого: {{char}} может поступить вопреки им, но не забывает их без причины. " +
        "Не пиши реплики, мысли и действия за {{user}}.",
      card: "Склонности и характер {{char}} (влияют на восприятие, не диктуют поступки)",
      memory: "Что {{char}} помнит (свидетельства прошлого; {{char}} может действовать вопреки им, но не забывает их)",
      scene: "Сейчас (факты)",
      persona: "Кто такой {{user}}",
      lore: "Сведения о мире",
      examples: "Примеры манеры речи {{char}} (стиль, не сюжет)",
      author: "Указания автора карточки (правила игры от автора, а не черты персонажа)",
      authorPost: "Указания автора карточки (после истории)",
    },
    messenger: {
      frame:
        "{{char}} переписывается с {{user}} в мессенджере. Пиши только сообщения, которые {{char}} отправляет: " +
        "коротко, живо, в манере {{char}}, без описаний действий, прозы и ремарок в звёздочках. " +
        "Можно отправить несколько сообщений подряд — разделяй их пустой строкой. " +
        "Черты характера влияют на восприятие, но не предписывают поступков; воспоминания — свидетельства прошлого, а не инструкции. " +
        "Не пиши за {{user}}.",
      card: "Склонности и характер {{char}} (влияют на восприятие, не диктуют поступки)",
      memory: "Что {{char}} помнит (свидетельства прошлого; {{char}} может действовать вопреки им, но не забывает их)",
      scene: "Жизнь {{char}} сейчас, вне переписки (видит только {{char}}; рассказывает о ней, только если сам(а) захочет)",
      persona: "Кто такой {{user}}",
      lore: "Сведения о мире",
      examples: "Примеры манеры {{char}} (стиль, не сюжет)",
      author: "Указания автора карточки (правила игры от автора, а не черты персонажа)",
      authorPost: "Указания автора карточки (после истории)",
    },
  };

  function matchLore(entries, text) {
    const raw = String(text || ""), low = raw.toLowerCase();
    const hit = (e, keys) => (keys || []).some((k) => {
      k = String(k || "").trim();
      return k && (e.case_sensitive ? raw.includes(k) : low.includes(k.toLowerCase()));
    });
    return (entries || [])
      .filter((e) => e && e.enabled !== false && e.content)
      // Выборочная запись (selective): нужен основной ключ И хотя бы один дополнительный.
      .filter((e) => e.constant || (hit(e, e.keys) && (!e.selective || !(e.secondary_keys || []).length || hit(e, e.secondary_keys))))
      .sort((a, b) => (a.insertion_order || 0) - (b.insertion_order || 0));
  }

  function section(title, body) {
    body = String(body || "").trim();
    return body ? `### ${title}\n${body}` : "";
  }

  /* Сборка контекста со строгим бюджетом.

     opts: {
       mode: 'rp'|'messenger', card, userName, userDesc, sceneState,
       experiences: [] — уже отобранные, В ПОРЯДКЕ ВАЖНОСТИ (первая — самая релевантная),
       history: [{role, text}], contextTokens, reserveTokens, singleSystem, minHistory,
       sceneProtocol, extraPost, noPostHistory
     }

     Итоговый порядок (обычный транспорт):
       system: РАМКА → УКАЗАНИЯ АВТОРА (system_prompt) → лорбук «до персонажа» → КАРТОЧКА
               → примеры речи → ПЕРСОНА → лорбук → ОПЫТ → СЦЕНА
       user/assistant: ИСТОРИЯ
       system: УКАЗАНИЯ АВТОРА ПОСЛЕ ИСТОРИИ (post_history) → протокол сцены и рисования
     При singleSystem всё служебное идёт одним system в начале, затем строго user/assistant.

     Бюджет: итоговая оценка (Σ токены сообщений + 4 на сообщение) ≤ budget.
     Если не помещается, уступают по порядку:
       1 старая история → 2 примеры речи → 3 лорбук → 4 менее релевантный опыт
       → 5 указания после истории → 6 персона, сценарий, указания автора, хвост описания
       (по абзацам, затем по предложениям) → 7 самый релевантный опыт → 8 история до последнего сообщения.
     Рамка, сцена, протокол, имя и личность персонажа не режутся никогда. Если и они
     не помещаются — report.overflow = true (без молчаливого превышения). */
  function build(opts) {
    const o = Object.assign({ mode: "rp", contextTokens: 8192, reserveTokens: 700, singleSystem: false, minHistory: 4, sceneProtocol: true, noPostHistory: false }, opts);
    const T = TEMPLATES[o.mode] || TEMPLATES.rp;
    const card = o.card || {};
    const vars = { char: card.name || "Персонаж", user: o.userName || "Пользователь" };
    const m = (x) => U.macros(x, vars);
    const tok = U.estimateTokens;
    const budget = Math.max(512, o.contextTokens - o.reserveTokens);

    const history = (o.history || []).filter((h) => h && h.text);
    const recentText = history.slice(-4).map((h) => h.text).join("\n");
    const loreAll = matchLore(card.lore, recentText);

    // Изменяемое состояние сборки: что сейчас входит.
    const st = {
      authorSys: m(card.systemPrompt || "").trim(),
      description: m(card.description || "").trim(),
      personality: m(card.personality || "").trim(),
      scenario: m(card.scenario || "").trim(),
      examples: card.mesExample ? m(card.mesExample).replace(/<START>/gi, "").trim() : "",
      persona: m(o.userDesc || "").trim(),
      lore: loreAll.slice(),
      exps: (o.experiences || []).slice(),
      postHistory: o.noPostHistory ? "" : m(card.postHistory || "").trim(),
      keepOld: null, // сколько старых сообщений (сверх minHistory) оставить; null — все
      minH: Math.min(o.minHistory, history.length),
    };
    const frame = m(T.frame);
    const scene = section(m(T.scene), SCENE.describe(o.sceneState, { userName: vars.user }));
    const protocol = [o.sceneProtocol ? SCENE.PROTOCOL : "", o.extraPost ? m(o.extraPost) : ""].filter(Boolean).join("\n\n");

    function parts() {
      const loreText = (pos) => st.lore.filter((e) => (e.position === "before_char") === (pos === "before")).map((e) => m(e.content)).join("\n\n");
      const cardBody = [st.description, st.personality ? "Личность: " + st.personality : "", st.scenario ? "Сценарий: " + st.scenario : ""].filter(Boolean).join("\n\n");
      const older = history.slice(0, history.length - st.minH);
      const keptOlder = st.keepOld == null ? older : older.slice(older.length - st.keepOld);
      const kept = keptOlder.concat(history.slice(history.length - st.minH));
      return {
        head: [
          frame,
          section(T.author, st.authorSys),
          section(m(T.lore), loreText("before")),
          section(m(T.card), cardBody || "(описания нет)"),
          section(m(T.examples), st.examples),
          section(m(T.persona), st.persona),
          section(m(T.lore), loreText("after")),
          section(m(T.memory), EXP.format(st.exps.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))),
          scene,
        ].filter(Boolean),
        post: [section(T.authorPost, st.postHistory), protocol].filter(Boolean),
        history: kept,
      };
    }
    function render() {
      const p = parts();
      const msgs = p.history.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text }));
      if (o.singleSystem) {
        // Строгие Jinja-шаблоны: одно system в начале, затем строго user/assistant.
        const merged = [];
        for (const x of msgs) {
          const last = merged[merged.length - 1];
          if (last && last.role === x.role) last.content += "\n\n" + x.content;
          else merged.push(Object.assign({}, x));
        }
        if (!merged.length || merged[0].role !== "user") merged.unshift({ role: "user", content: "[Начало]" });
        return { p, messages: [{ role: "system", content: p.head.concat(p.post).join("\n\n") }].concat(merged) };
      }
      const out = [{ role: "system", content: p.head.join("\n\n") }].concat(msgs);
      if (p.post.length) out.push({ role: "system", content: p.post.join("\n\n") });
      return { p, messages: out };
    }
    const cost = (msgs) => msgs.reduce((n, x) => n + tok(x.content) + 4, 0);
    const fits = () => cost(render().messages) <= budget;

    const truncated = [];
    const note = (layer, detail) => {
      const t = truncated.find((x) => x.layer === layer);
      if (t) { if (typeof detail === "number") t.dropped = (t.dropped || 0) + detail; else if (detail) t.detail = detail; }
      else truncated.push(Object.assign({ layer }, typeof detail === "number" ? { dropped: detail } : detail ? { detail } : {}));
    };

    // Порядок уступок. Каждая функция убирает одну порцию и возвращает true, либо false, если убирать нечего.
    const olderCount = Math.max(0, history.length - st.minH);
    const reducers = [
      function oldHistory() {
        const cur = st.keepOld == null ? olderCount : st.keepOld;
        if (!cur) return false;
        // Двоичный поиск: сколько самых свежих старых сообщений можно оставить.
        let lo = 0, hi = cur - 1;
        st.keepOld = 0;
        if (!fits()) { note("history", cur); return true; }
        while (lo < hi) {
          const mid = Math.ceil((lo + hi + 1) / 2);
          st.keepOld = mid;
          if (fits()) lo = mid; else hi = mid - 1;
        }
        st.keepOld = lo;
        note("history", cur - lo);
        return true;
      },
      function examples() { if (!st.examples) return false; st.examples = ""; note("examples", "примеры речи"); return true; },
      function lore() { if (!st.lore.length) return false; st.lore.pop(); note("lore", 1); return true; },
      function lowExperience() { if (st.exps.length <= 1) return false; st.exps.pop(); note("experience", 1); return true; },
      function postHistory() { if (!st.postHistory) return false; st.postHistory = ""; note("postHistory", "указания после истории"); return true; },
      function persona() { if (!st.persona) return false; st.persona = ""; note("persona", "описание собеседника"); return true; },
      function scenario() { if (!st.scenario) return false; st.scenario = ""; note("card.scenario", "сценарий"); return true; },
      function authorSys() { if (!st.authorSys) return false; st.authorSys = ""; note("authorSys", "указания автора"); return true; },
      function descriptionTail() {
        const d = st.description;
        if (!d) return false;
        const paras = d.split(/\n\s*\n/);
        let next;
        if (paras.length > 1) next = paras.slice(0, -1).join("\n\n");
        else {
          const sents = d.match(/[^.!?…]+[.!?…]+[»")\]]*\s*|[^.!?…]+$/g) || [d];
          if (sents.length <= 1) return false; // первое предложение — минимум описания
          next = sents.slice(0, -1).join("").trim();
        }
        st.description = next;
        note("card.description", `описание сокращено до ${next.length} симв. из ${(m(card.description || "").trim()).length}`);
        return true;
      },
      function topExperience() { if (!st.exps.length) return false; st.exps.pop(); note("experience", 1); return true; },
      function recentHistory() { if (st.minH <= 1) return false; st.minH--; st.keepOld = 0; note("history", 1); return true; },
    ];

    let overflow = false;
    if (!fits()) {
      for (const r of reducers) {
        while (!fits() && r()) { /* уступаем порциями */ }
        if (fits()) break;
      }
      overflow = !fits();
    }

    const { p, messages } = render();
    const used = cost(messages);
    const keptHistory = p.history;
    const tokLayer = (x) => tok(x) + (x ? 2 : 0);
    const loreKept = st.lore.length;
    return {
      messages,
      report: {
        budget,
        used,
        fits: used <= budget,
        overflow,
        truncated,
        historyKept: keptHistory.length,
        historyTotal: history.length,
        experienceKept: st.exps.length,
        experienceDropped: (o.experiences || []).length - st.exps.length,
        loreKept,
        loreMatched: loreAll.length,
        loreDropped: loreAll.length - loreKept,
        examples: !!st.examples,
        postHistory: !!st.postHistory,
        postHistoryDisabled: !!o.noPostHistory && !!(card.postHistory || "").trim(),
        layers: {
          frame: tok(frame),
          author: tokLayer(section(T.author, st.authorSys)) + tokLayer(section(T.authorPost, st.postHistory)),
          card: tokLayer(p.head.find((x) => x.startsWith("### " + m(T.card))) || "") + tokLayer(st.examples ? section(m(T.examples), st.examples) : "") + tokLayer(st.persona ? section(m(T.persona), st.persona) : ""),
          memory: tokLayer(st.exps.length ? section(m(T.memory), EXP.format(st.exps)) : ""),
          scene: tok(scene),
          lore: tokLayer(st.lore.length ? st.lore.map((e) => m(e.content)).join("\n\n") : ""),
          history: keptHistory.reduce((n, h) => n + tok(h.text) + 4, 0),
          post: tok(protocol),
        },
      },
    };
  }

  PRP.assembler = { build, matchLore, TEMPLATES };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.assembler;
})(typeof window !== "undefined" ? window : globalThis);

/* js/assist/assist.js */
/* Prism RP — ассистент: разговор с самой моделью вне ролевой игры.
   Консультации по карточкам, сценам, промптам, разбор чата. Модель здесь —
   помощник автора, а не персонаж; Prism-рамка (Card/Experience/Scene) не применяется.
   По желанию к разговору подключается карточка персонажа и выдержка из его чата. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util;

  const SYSTEM = [
    "Ты — ассистент внутри Prism RP, среды для ролевой игры с ИИ-персонажами. Сейчас ты говоришь с автором напрямую, вне игры: ты не персонаж и не продолжаешь сцену, если тебя об этом прямо не просят.",
    "Помогаешь с тем, что нужно автору: писать и улучшать карточки персонажей (поля Character Card V2: description, personality, scenario, first_mes, alternate_greetings, mes_example, system_prompt, post_history_instructions, лорбук), придумывать сюжетные ходы и приветствия, разбирать, почему персонаж ведёт себя так или иначе, подбирать теги для картинок (danbooru) и настройки моделей.",
    "Как устроен Prism RP: карточка задаёт склонности персонажа, а не команды; опыт — свидетельства прошлого, а не инструкции; сцену (время, место, одежду, отношения) ведёт приложение. Хорошая карточка описывает характер через конкретные привычки и реакции, а не через списки прилагательных.",
    "Отвечай по существу и на языке собеседника. Если просят текст для поля карточки — дай готовый текст, который можно скопировать целиком. Если вопрос неясен — уточни одним вопросом.",
  ].join("\n\n");

  // need: "" — без персонажа, "card" — нужен персонаж, "chat" — нужен и чат.
  const STARTERS = [
    { need: "", t: "Помоги придумать персонажа", q: "Помоги придумать нового персонажа для ролевой игры. Сначала задай мне 3–4 вопроса, потом собери черновик карточки по полям." },
    { need: "", t: "Как написать живую карточку", q: "Как написать карточку персонажа, чтобы он ощущался живым, а не набором прилагательных? Дай короткие правила и небольшой пример." },
    { need: "", t: "Какую модель выбрать", q: "Какие модели и настройки генерации лучше подходят для ролевой игры на русском языке? Учти, что у меня может быть бесплатная модель Perchance или локальная модель." },
    { need: "card", t: "Улучши описание персонажа", q: "Посмотри на описание персонажа и предложи, как сделать его живее: что убрать, что добавить. Затем дай переписанный вариант целиком." },
    { need: "card", t: "Придумай приветствие", q: "Придумай альтернативное приветствие для этого персонажа — другая ситуация знакомства, 2–3 абзаца." },
    { need: "card", t: "Теги для картинок", q: "Составь теги danbooru для внешности и основных нарядов этого персонажа в формате гардероба Prism: «название | alias: теги»." },
    { need: "chat", t: "Разбери поведение в чате", q: "Почему персонаж в этом чате ведёт себя именно так? Что в карточке или контексте на это влияет и что поправить, если я хочу иначе?" },
    { need: "chat", t: "Куда развить сюжет", q: "Предложи три разных направления, куда можно развить сюжет этого чата дальше, и как подтолкнуть к каждому своей репликой." },
  ];
  function starters(hasCard, hasChat) {
    return STARTERS.filter((x) => (x.need === "" && !hasCard) || (x.need === "card" && hasCard) || (x.need === "chat" && hasChat));
  }


  // Карточка → компактный текст для контекста ассистента.
  function cardText(card) {
    if (!card) return "";
    const f = (label, v) => (v && String(v).trim() ? `${label}:\n${String(v).trim()}` : "");
    const alts = (card.altGreetings || []).filter(Boolean);
    const lore = (card.lore || []).filter((e) => e && e.content).slice(0, 20)
      .map((e) => `- [${(e.keys || []).join(", ") || "без ключей"}${e.constant ? ", постоянная" : ""}] ${e.content}`).join("\n");
    const im = card.image || {};
    return [
      `Имя: ${card.name}`,
      f("Описание (description)", card.description),
      f("Личность (personality)", card.personality),
      f("Сценарий (scenario)", card.scenario),
      f("Первое сообщение (first_mes)", card.firstMes),
      alts.length ? `Альтернативные приветствия: ${alts.length}` : "",
      f("Примеры диалогов (mes_example)", card.mesExample),
      f("Системный промпт карточки", card.systemPrompt),
      f("Инструкции после истории", card.postHistory),
      lore ? `Лорбук:\n${lore}` : "",
      im.trigger || im.wardrobe || im.look ? f("Изображения — триггер", im.trigger) + (im.look ? `\nВнешность для картинок:\n${im.look}` : "") + (im.wardrobe ? `\nГардероб:\n${im.wardrobe}` : "") : "",
    ].filter(Boolean).join("\n\n");
  }

  // Последние сообщения чата → стенограмма (самые свежие важнее, режем с начала).
  function chatText(lines, budgetTokens) {
    const out = [];
    let used = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const s = `${lines[i].name}: ${lines[i].text}`;
      const c = U.estimateTokens(s) + 2;
      if (used + c > budgetTokens) break;
      out.unshift(s); used += c;
    }
    const cut = lines.length - out.length;
    return (cut > 0 ? `(ранние ${cut} сообщ. не поместились)\n\n` : "") + out.join("\n\n");
  }

  /* o: { system, card, chatLines, sceneLine, userName, history:[{role,text}], contextTokens, reserveTokens }
     → { messages, report } */
  function build(o) {
    const budget = Math.max(1024, (o.contextTokens || 8192) - (o.reserveTokens || 1200));
    const sys = [o.system || SYSTEM];
    if (o.userName) sys.push(`Собеседника зовут ${o.userName}.`);
    let used = U.estimateTokens(sys.join("\n\n"));
    const ct = cardText(o.card);
    if (ct) { const b = `### Карточка персонажа, о котором идёт речь\n${ct}`; sys.push(b); used += U.estimateTokens(b); }
    const hist = o.history || [];
    // История разговора с ассистентом: от новых к старым.
    const kept = [];
    let histBudget = Math.max(600, Math.floor((budget - used) * (o.chatLines && o.chatLines.length ? 0.5 : 1)));
    for (let i = hist.length - 1; i >= 0; i--) {
      const c = U.estimateTokens(hist[i].text) + 4;
      if (c > histBudget && kept.length) break;
      kept.unshift(hist[i]); histBudget -= c; used += c;
    }
    let chatBlock = "";
    if (o.chatLines && o.chatLines.length) {
      chatBlock = `### Выдержка из ролевого чата${o.sceneLine ? ` (сцена сейчас: ${o.sceneLine})` : ""}\n${chatText(o.chatLines, Math.max(300, budget - used))}`;
      sys.push(chatBlock);
      used += U.estimateTokens(chatBlock);
    }
    const messages = [{ role: "system", content: sys.join("\n\n") }]
      .concat(kept.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text })));
    return { messages, report: { budget, used, historyKept: kept.length, historyTotal: hist.length, card: !!ct, chat: !!chatBlock } };
  }

  // Заголовок разговора по первой реплике.
  function title(text) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length > 48 ? s.slice(0, 46).replace(/\s+\S*$/, "") + "…" : s || "Новый разговор";
  }

  function blank(ctx) {
    const now = Date.now();
    return { id: U.uid("as"), title: "Новый разговор", messages: [], ctx: Object.assign({ cardId: null, chatId: null }, ctx || {}), createdAt: now, updatedAt: now };
  }

  PRP.assist = { SYSTEM, STARTERS, starters, cardText, chatText, build, title, blank };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.assist;
})(typeof window !== "undefined" ? window : globalThis);

/* js/cards/ccard.js */
/* Prism RP — карточки персонажей Character Card V1/V2/V3.
   Импорт из JSON и PNG (tEXt/iTXt «chara» и «ccv3»), экспорт обратно в JSON и PNG.
   Исходный JSON сохраняется целиком в card.raw, чтобы поля, которые приложение
   не моделирует (extensions и т. п.), переживали импорт → экспорт без потерь. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  /* ── base64 ⇄ UTF-8 ─────────────────────────────────────────────────── */
  function b64ToUtf8(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ── PNG ────────────────────────────────────────────────────────────── */
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function readChunks(u8) {
    for (let i = 0; i < 8; i++) if (u8[i] !== SIG[i]) throw new Error("Файл не является PNG");
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const chunks = [];
    let p = 8;
    while (p + 8 <= u8.length) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      const data = u8.subarray(p + 8, p + 8 + len);
      chunks.push({ type, data });
      p += 12 + len;
      if (type === "IEND") break;
    }
    return chunks;
  }

  function latin1(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function textChunks(chunks) {
    const out = {};
    for (const c of chunks) {
      if (c.type === "tEXt") {
        const z = c.data.indexOf(0);
        if (z > 0) out[latin1(c.data.subarray(0, z)).toLowerCase()] = latin1(c.data.subarray(z + 1));
      } else if (c.type === "iTXt") {
        const z = c.data.indexOf(0);
        if (z <= 0) continue;
        const key = latin1(c.data.subarray(0, z)).toLowerCase();
        const comp = c.data[z + 1];
        if (comp) continue; // сжатый iTXt в карточках не встречается
        let q = z + 3;
        q = c.data.indexOf(0, q) + 1; // language
        q = c.data.indexOf(0, q) + 1; // translated keyword
        out[key] = new TextDecoder("utf-8").decode(c.data.subarray(q));
      }
    }
    return out;
  }

  function cardJsonFromPng(u8) {
    const t = textChunks(readChunks(u8));
    const raw = t.ccv3 || t.chara;
    if (!raw) throw new Error("В PNG нет данных карточки (chara/ccv3)");
    const txt = /^\s*\{/.test(raw) ? raw : b64ToUtf8(raw);
    return JSON.parse(txt);
  }

  function makeChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  function textChunk(key, value) {
    const k = new TextEncoder().encode(key);
    const v = new TextEncoder().encode(value); // value — base64, т. е. ASCII
    const data = new Uint8Array(k.length + 1 + v.length);
    data.set(k, 0); data[k.length] = 0; data.set(v, k.length + 1);
    return makeChunk("tEXt", data);
  }

  // Встраивает карточку в PNG: убирает старые chara/ccv3, пишет V2 и V3 перед IEND.
  function embedInPng(u8, card) {
    const chunks = readChunks(u8);
    const parts = [new Uint8Array(SIG)];
    for (const c of chunks) {
      if (c.type === "tEXt" || c.type === "iTXt") {
        const z = c.data.indexOf(0);
        const key = z > 0 ? latin1(c.data.subarray(0, z)).toLowerCase() : "";
        if (key === "chara" || key === "ccv3") continue;
      }
      if (c.type === "IEND") {
        parts.push(textChunk("chara", utf8ToB64(JSON.stringify(toSpec(card, "v2")))));
        parts.push(textChunk("ccv3", utf8ToB64(JSON.stringify(toSpec(card, "v3")))));
      }
      parts.push(makeChunk(c.type, c.data));
    }
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /* ── Нормализация ───────────────────────────────────────────────────── */
  function arr(v) { return Array.isArray(v) ? v.slice() : v ? [v] : []; }

  function normalize(json) {
    const spec = json && json.spec;
    const d = spec === "chara_card_v2" || spec === "chara_card_v3" ? json.data || {} : json || {};
    const book = d.character_book || null;
    return {
      id: null,
      name: d.name || d.char_name || "Без имени",
      description: d.description || "",
      personality: d.personality || "",
      scenario: d.scenario || "",
      firstMes: d.first_mes || "",
      altGreetings: arr(d.alternate_greetings),
      mesExample: d.mes_example || "",
      systemPrompt: d.system_prompt || "",
      postHistory: d.post_history_instructions || "",
      creatorNotes: d.creator_notes || "",
      tags: arr(d.tags),
      creator: d.creator || "",
      version: d.character_version || "",
      lore: book && Array.isArray(book.entries)
        ? book.entries.map((e, i) => ({
            keys: arr(e.keys).map(String),
            secondary_keys: arr(e.secondary_keys).map(String),
            selective: !!e.selective,
            content: e.content || "",
            enabled: e.enabled !== false,
            constant: !!e.constant,
            case_sensitive: !!e.case_sensitive,
            insertion_order: e.insertion_order != null ? e.insertion_order : i,
            position: e.position === "before_char" ? "before_char" : "after_char",
            comment: e.comment || e.name || "",
            raw: e,
          }))
        : [],
      image: (d.extensions && d.extensions.prism_rp && d.extensions.prism_rp.image) ? JSON.parse(JSON.stringify(d.extensions.prism_rp.image)) : undefined,
      avatar: null,
      spec: spec || "v1",
      raw: json,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function toSpec(card, ver) {
    const v3 = ver === "v3";
    const base = card.raw && card.raw.data ? JSON.parse(JSON.stringify(card.raw.data)) : {};
    const oldBook = base.character_book || {};
    const data = Object.assign(base, {
      name: card.name,
      description: card.description,
      personality: card.personality,
      scenario: card.scenario,
      first_mes: card.firstMes,
      mes_example: card.mesExample,
      creator_notes: card.creatorNotes,
      system_prompt: card.systemPrompt,
      post_history_instructions: card.postHistory,
      alternate_greetings: card.altGreetings || [],
      tags: card.tags || [],
      creator: card.creator || "",
      character_version: card.version || "",
      extensions: base.extensions || {},
    });
    if (card.lore && card.lore.length) {
      data.character_book = Object.assign({}, oldBook, {
        extensions: oldBook.extensions || {},
        entries: card.lore.map((e, i) => {
          const raw = e.raw && typeof e.raw === "object" ? JSON.parse(JSON.stringify(e.raw)) : {};
          return Object.assign(raw, {
            keys: e.keys || [],
            secondary_keys: e.secondary_keys || [],
            selective: !!e.selective,
            content: e.content || "",
            extensions: raw.extensions || {},
            enabled: e.enabled !== false,
            insertion_order: e.insertion_order != null ? Number(e.insertion_order) || 0 : i,
            case_sensitive: !!e.case_sensitive,
            constant: !!e.constant,
            position: e.position === "before_char" ? "before_char" : "after_char",
            name: e.comment || "",
            comment: e.comment || "",
            id: i,
            ...(v3 ? { use_regex: !!raw.use_regex } : {}),
          });
        }),
      });
    } else delete data.character_book;
    // Настройки изображений (триггер, LoRA, гардероб) едут вместе с карточкой
    // в пространстве extensions — другие приложения его не трогают.
    const ext = Object.assign({}, data.extensions);
    const im = card.image && Object.keys(card.image).length ? card.image : null;
    if (im) ext.prism_rp = Object.assign({}, ext.prism_rp, { image: JSON.parse(JSON.stringify(im)) });
    else if (ext.prism_rp) { ext.prism_rp = Object.assign({}, ext.prism_rp); delete ext.prism_rp.image; if (!Object.keys(ext.prism_rp).length) delete ext.prism_rp; }
    data.extensions = ext;
    if (v3) {
      data.group_only_greetings = data.group_only_greetings || [];
      data.nickname = data.nickname || undefined;
      return { spec: "chara_card_v3", spec_version: "3.0", data };
    }
    delete data.assets; delete data.group_only_greetings; delete data.nickname;
    return { spec: "chara_card_v2", spec_version: "2.0", data };
  }

  PRP.ccard = { normalize, toSpec, cardJsonFromPng, embedInPng, crc32, b64ToUtf8, utf8ToB64 };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.ccard;
})(typeof window !== "undefined" ? window : globalThis);

/* js/chat/tree.js */
/* Prism RP — дерево сообщений. Каждое сообщение знает родителя;
   у ответа модели есть свайпы (варианты), активный свайп выбирает ветку текста.
   Активная ветка = путь от выбранного листа к корню. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  function index(list) {
    const byId = new Map();
    for (const m of list || []) byId.set(m.id, m);
    return byId;
  }

  function path(byId, leafId) {
    const out = [];
    const seen = new Set();
    let cur = leafId ? byId.get(leafId) : null;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return out;
  }

  function children(list, parentId) {
    return (list || []).filter((m) => (m.parentId || null) === (parentId || null)).sort((a, b) => a.createdAt - b.createdAt);
  }

  // Все потомки (для удаления ветки).
  function descendants(list, id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const m of list) if (m.parentId === cur) { out.push(m.id); stack.push(m.id); }
    }
    return out;
  }

  // Самый свежий лист под узлом — куда переходить после переключения ветки.
  function latestLeaf(list, id) {
    let cur = id;
    for (;;) {
      const kids = children(list, cur);
      if (!kids.length) return cur;
      cur = kids[kids.length - 1].id;
    }
  }

  function activeSwipe(m) {
    if (!m || !m.swipes || !m.swipes.length) return { text: "", sceneOps: [] };
    return m.swipes[Math.min(m.swipeIdx || 0, m.swipes.length - 1)];
  }

  PRP.tree = { index, path, children, descendants, latestLeaf, activeSwipe };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.tree;
})(typeof window !== "undefined" ? window : globalThis);

/* js/images/compose.js */
/* Prism RP — сборка промпта изображения (чистые функции).
   Перенос логики из модулей форка (image-endpoint / image-prompt / промпт
   персонажа), переписанной под архитектуру Prism RP: данные берутся из
   карточки (card.image), персоны (persona.image) и состояния сцены.

   Конвейер:
     [draw: …] из ответа  ─┐
     сцена (одежда, поза) ─┼─ compose()  → { scene, keep, absence }
     карточка и персона   ─┘        scene ─ compile (перевод LLM) ─┐
                                    keep ─ «как есть», в начало ───┴─ finalise() → { prompt, negative }

   Принципы, вынесенные из форка:
   • Сцена важнее устаревшего трекера: если [draw:] одевает персонажа иначе,
     теги гардероба не добавляются — иначе одежда «усредняется».
   • Теги гардероба и внешности — это словарь LoRA; LLM-переводчик их не видит
     и не переписывает, они ставятся в начало промпта без изменений.
   • Триггер, негатив и LoRA персонажа — только когда он в кадре.
   • Повтор тега ничего не даёт; «solo» неверен, когда в кадре двое.
   • POV: камера — глаза пользователя; его внешность не добавляется. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  /* ── Словоформы и карты «ключ: теги» ───────────────────────────────── */
  const WORD_RE = /[^\p{L}\p{N}]+/u;
  function words(s) { return String(s || "").toLowerCase().split(WORD_RE).filter(Boolean); }

  // «красное» ~ «красном», «Лёня» ~ «Лёне», но «girl» не совпадает с «1girl».
  function wordFormMatch(key, word) {
    if (key === word) return true;
    if (key.length < 4 || word.length < 4) return false;
    const stem = key.slice(0, Math.max(3, key.length - 2));
    return word.startsWith(stem) && Math.abs(word.length - key.length) <= 3;
  }
  // Все слова ключа встречаются в тексте (в любой словоформе) → число слов, иначе 0.
  function mentions(key, text) {
    const k = words(key).filter((w) => w.length >= 2);
    if (!k.length) return 0;
    const hay = words(text);
    for (const w of k) if (!hay.some((h) => wordFormMatch(w, h))) return 0;
    return k.length;
  }

  const cleanTags = (t) => String(t || "").split(",").map((s) => s.trim().replace(/^["'«»„“”]+|["'«»„“”]+$/g, "")).filter(Boolean).join(", ");

  /* Строки «ключ: теги». Ключ может быть с вариантами «school uniform | школьная форма».
     «ключ:» без тегов собирает следующие строки (длинный список, вставленный блоком).
     Двоеточие после запятой или < — это часть тегов (<lora:x:0.8>), а не ключ. */
  function parseMap(text) {
    const out = [];
    let key = "", acc = [];
    const flush = () => { const t = cleanTags(acc.join(", ")); if (key && t) out.push({ key, tags: t }); key = ""; acc = []; };
    for (const raw of String(text || "").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const ci = line.indexOf(":");
      const si = line.search(/[<,]/);
      const sep = ci === -1 || (si !== -1 && si < ci) ? -1 : ci;
      if (sep !== -1) {
        flush();
        const k = line.slice(0, sep).trim(), rest = line.slice(sep + 1).trim();
        if (!k) continue;
        if (rest) out.push({ key: k, tags: cleanTags(rest) }); else key = k;
        continue;
      }
      if (key) acc.push(line);
      else out.push({ key: "", tags: cleanTags(line) }); // строка без ключа — базовая
    }
    flush();
    return out;
  }
  const isBase = (k) => /^(|base|always|всегда|база)$/i.test(String(k).trim());
  const isSuffix = (k) => /^(suffix|в конце)$/i.test(String(k).trim());

  function bestVariant(key, text) {
    let score = 0, len = 0;
    for (const v of String(key).split("|").map((s) => s.trim()).filter(Boolean)) {
      const s = mentions(v, text);
      if (s > score || (s === score && s && v.length > len)) { score = s; len = v.length; }
    }
    return { score, len };
  }

  // Гардероб: базовые строки + ОДИН лучший образ по описанию одежды.
  function resolveWardrobe(map, outfitText) {
    const always = [];
    let best = "", bestScore = 0, bestLen = 0;
    for (const { key, tags } of parseMap(map)) {
      if (isBase(key)) { always.push(tags); continue; }
      if (isSuffix(key)) continue;
      const { score, len } = bestVariant(key, outfitText);
      if (score && (score > bestScore || (score === bestScore && len > bestLen))) { best = tags; bestScore = score; bestLen = len; }
    }
    return [...always, best].filter(Boolean).join(", ");
  }

  // Внешность: базовые строки + все совпавшие по тексту кадра или по именам присутствующих.
  function resolveAppearance(map, text, names) {
    const keep = [], tail = [];
    for (const { key, tags } of parseMap(map)) {
      if (isSuffix(key)) { tail.push(tags); continue; }
      if (isBase(key)) { keep.push(tags); continue; }
      const hit = String(key).split("|").map((s) => s.trim()).filter(Boolean)
        .some((v) => mentions(v, text) || (names || []).some((n) => mentions(v, n)));
      if (hit) keep.push(tags);
    }
    return { tags: keep.join(", "), suffix: tail.join(", ") };
  }

  /* ── Гигиена тегов ─────────────────────────────────────────────────── */
  // Делит по запятым, не разрезая «(detailed face, sharp eyes:1.2)».
  function splitTags(text) {
    const s = String(text == null ? "" : text), out = [];
    let cur = "", depth = 0;
    for (const ch of s) {
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  const norm = (s) => String(s).toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  function bareTag(tag) {
    let t = String(tag).trim();
    if (!t || /^<lora:/i.test(t)) return "";
    for (let i = 0; i < 3; i++) {
      const m = t.match(/^[([{]([\s\S]*)[)\]}](?:\s*:\s*[0-9.]+)?$/);
      if (!m) break;
      t = m[1].trim();
    }
    return norm(t.replace(/\s*:\s*[0-9]+(?:\.[0-9]+)?\s*$/, ""));
  }
  // Соотношения сторон уже учтены размером кадра; score_N — шум вне Pony.
  function normalizeTags(text) {
    return splitTags(text).filter((t) => !/^\d{1,3}\s*:\s*\d{1,3}$/.test(t) && !/^score[ _]\d+(_up)?$/i.test(t)).join(", ");
  }
  const QUALITY = new Set(("masterpiece|best quality|amazing quality|great quality|high quality|highest quality|top quality|good quality|" +
    "very aesthetic|aesthetic|absurdres|highres|hires|high resolution|ultra high res|8k|4k|2k|ultra detailed|ultra-detailed|" +
    "extremely detailed|highly detailed|hyper detailed|hyper-detailed|hyperdetailed|super detailed|insanely detailed|very detailed|" +
    "detailed|sharp focus|intricate lineart|clean lines|perfect anatomy|smooth shading|vivid colors|extremely detailed cg|" +
    "newest|sharp lines|clean lineart").split("|"));
  function stripQuality(text) { return splitTags(text).filter((t) => !QUALITY.has(bareTag(t))).join(", "); }

  // Сколько людей в кадре по тегам: 1girl+1boy, 2girls, hetero, «two girls»…
  function subjectCount(text) {
    const b = " " + String(text).toLowerCase() + " ";
    let n = 0;
    if (/\b\d*\s*boys?\b/.test(b)) n++;
    if (/\b\d*\s*girls?\b/.test(b)) n++;
    if (/\b(?:hetero|yaoi|yuri|group|threesome)\b/.test(b)) n = Math.max(n, 2);
    if (/\b(?:multiple|several|two|three|[2-9])\s*(?:girls|boys|people|others)\b/.test(b)) n = Math.max(n, 2);
    return n;
  }
  function dropContradictorySolo(prompt) {
    if (subjectCount(prompt) < 2) return prompt;
    return splitTags(prompt).filter((t) => !/^(solo|solo focus)$/.test(bareTag(t))).join(", ");
  }

  /* Убирает точные повторы и теги, все слова которых уже есть в триггере персонажа
     (это его «блок личности»). Исключение — в кадре двое разных полов: общая черта
     («orange hair») может принадлежать обоим. LoRA-токены не трогаются. */
  function dedupe(prompt, trigger) {
    const tWords = new Set(), tTags = new Set();
    splitTags(trigger).forEach((t) => { const n = norm(t); tTags.add(n); words(n).filter((w) => w.length > 2).forEach((w) => tWords.add(w)); });
    const low = String(prompt).toLowerCase().replace(/<lora:[^>]*>/g, " ");
    const twoKinds = (/\b\d*\s*girls?\b/.test(low) && /\b\d*\s*boys?\b/.test(low)) || /\b(?:hetero|yaoi|yuri)\b/.test(low);
    const seen = new Set(), out = [];
    for (const tag of splitTags(prompt)) {
      const n = norm(tag);
      if (seen.has(n)) continue;
      seen.add(n);
      if (tWords.size && !twoKinds && !tTags.has(n) && !/^<lora:/i.test(tag) && /^[\x20-\x7e]*$/.test(tag)) {
        const w = words(n).filter((x) => x.length > 2);
        if (w.length && w.every((x) => tWords.has(x))) continue;
      }
      out.push(tag);
    }
    return out.join(", ");
  }

  const GARMENTS = ["dress", "skirt", "shirt", "blouse", "t-shirt", "hoodie", "sweater", "jacket", "coat", "jeans", "shorts", "pants", "trousers",
    "uniform", "kimono", "yukata", "swimsuit", "bikini", "lingerie", "pajamas", "towel", "apron", "suit", "crop top", "tank top",
    "платье", "юбка", "рубашка", "блузка", "футболка", "худи", "свитер", "куртка", "пальто", "джинсы", "шорты", "брюки", "форма",
    "кимоно", "купальник", "бикини", "бельё", "белье", "пижама", "полотенце", "фартук", "костюм", "топ", "майка"];
  function garmentWords(text) { return GARMENTS.filter((g) => mentions(g, text)); }
  // Сцена одевает персонажа иначе, чем записано в трекере/гардеробе → трекер устарел.
  function wardrobeConflicts(draw, wardrobeTags, outfitText) {
    const inDraw = garmentWords(draw);
    if (!inDraw.length) return false;
    const known = new Set(garmentWords(wardrobeTags + ", " + (outfitText || "")));
    return !inDraw.some((g) => known.has(g));
  }

  /* ── Кто в кадре ───────────────────────────────────────────────────── */
  function ownerKeys(card) {
    const im = card.image || {};
    const keys = [card.name].concat(String(im.aliases || "").split(",")).concat(splitTags(im.trigger).slice(0, 1));
    (im.loras || []).forEach((l) => keys.push(l.name));
    return keys.map((k) => String(k || "").trim()).filter((k) => k.length >= 3);
  }
  /* Персонаж в кадре, если сцена его называет (имя, псевдоним, первый тег триггера,
     имя LoRA), или если сцена вообще не называет конкретных людей. Отсутствует —
     только когда в кадре явно назван кто-то другой (тег-имя вида name_surname), а он нет.
     Так триггер и LoRA одного персонажа не «перекрашивают» другого. */
  function ownerPresent(card, drawText) {
    const t = String(drawText || "").replace(/[_\-]/g, " ");
    if (ownerKeys(card).some((k) => mentions(k.replace(/[_\-]/g, " "), t))) return true;
    const namesSomeone = /\b[a-z]{3,}_[a-z]{3,}\b/i.test(String(drawText || ""));
    return !namesSomeone;
  }

  /* ── compose: из [draw:] и состояния — сцена для перевода и неизменяемые теги ── */
  function compose(o) {
    const card = o.card || {}, im = card.image || {}, pim = (o.persona && o.persona.image) || {};
    const st = o.scene || { chars: {}, present: [] };
    const key = Object.keys(st.chars || {}).find((k) => k.toLowerCase() === String(card.name || "").toLowerCase());
    const ch = key ? st.chars[key] : null;
    const outfit = ch ? ch.wear.join(", ") : "";
    let draw = String(o.draw || "").trim();
    const subVars = (s) => String(s || "").replace(/\{\{char\}\}/gi, card.name || "").replace(/\{\{user\}\}/gi, (o.persona && o.persona.name) || "");

    let wardrobe = resolveWardrobe(im.wardrobe, outfit);
    const stale = wardrobeConflicts(draw, wardrobe, outfit);
    if (stale) wardrobe = "";
    const bits = [];
    if (outfit && !wardrobe && !stale && !garmentWords(draw).length) bits.push("clothing: " + outfit);
    if (ch && ch.pose && !draw) bits.push(ch.pose);
    let sceneText = [draw, bits.join(", ")].filter(Boolean).join(", ");

    // Карта внешности персонажа: базовые строки всегда, ключевые — когда сцена их называет.
    const hay = sceneText.toLowerCase();
    const look = [], tail = [];
    for (const { key: k, tags } of parseMap(subVars(im.look))) {
      if (isSuffix(k)) { tail.push(tags); continue; }
      if (!isBase(k) && !bestVariant(k, hay).score) continue;
      const fresh = splitTags(tags).filter((p) => !hay.includes(p.toLowerCase()));
      if (fresh.length) look.push(fresh.join(", "));
    }

    // Пользователь в кадре или POV.
    let userTags = "", userTail = "";
    if (pim.view === "first") {
      const second = subjectCount(sceneText) >= 2 || /\bpov (penis|hands|feet)\b/i.test(sceneText + "," + (pim.povTags || ""));
      userTags = ["pov", second ? "" : "solo", cleanTags(pim.povTags)].filter(Boolean).join(", ");
    } else if (pim.appearance) {
      const u = resolveAppearance(subVars(pim.appearance), sceneText, st.present || []);
      userTags = u.tags; userTail = u.suffix;
      // Пользователь есть в трекере, а сцена нарисована «соло» — добавить его тег-субъект.
      const subj = (splitTags(userTags).find((t) => /^\d+(girl|boy)s?$/i.test(t)) || "");
      if (subj && !new RegExp("\\b" + subj + "\\b", "i").test(sceneText)) sceneText += ", " + subj;
    }

    // NSFW-модификаторы карточки — только по тексту сцены, никогда по одежде из трекера.
    const nsfw = resolveWardrobe(String(im.nsfw || "").split("\n").filter((l) => !isBase(l.split(":")[0])).join("\n"), sceneText);
    return {
      scene: [look.join(", "), sceneText, tail.join(", ")].filter(Boolean).join(", "),
      keep: [wardrobe, userTags, nsfw].filter(Boolean).join(", "),
      tail: userTail,
      ownerPresent: ownerPresent(card, draw || sceneText),
      stale,
    };
  }

  /* ── finalise: итоговый промпт и негатив ───────────────────────────── */
  const POV_NEG = ["extra legs", "extra arms", "disembodied limb", "floating limbs", "headless body", "extra torso"];
  const POV_SOLO_NEG = ["1boy", "male focus", "multiple boys"];

  function loraTokens(list) {
    return (list || []).filter((l) => l && l.name && Number(l.weight) !== 0).map((l) => `<lora:${l.name}:${Number(l.weight) || 1}>`).join(" ");
  }
  function combine(scene, fixed, mode) {
    const s = String(scene || "").trim(), f = String(fixed || "").trim();
    if (!f || mode === "off") return s;
    if (mode === "replace") return f;
    if (mode === "prepend") return [f, s].filter(Boolean).join(", ");
    return [s, f].filter(Boolean).join(", ");
  }
  function joinUnique(...lists) {
    const seen = new Set(), out = [];
    for (const l of lists) for (const t of splitTags(l)) { const n = norm(t); if (n && !seen.has(n)) { seen.add(n); out.push(t); } }
    return out.join(", ");
  }

  /* o: { compiled, composed, card, settings (images), persona, backend }
     backend: "a1111" — LoRA-токены в промпт; иначе LoRA не поддерживаются. */
  function finalise(o) {
    const s = o.settings || {}, im = (o.card && o.card.image) || {}, c = o.composed || {};
    const pinned = s.promptMode !== "off" && String(s.fixedPrompt || "").trim();
    let scene = String(o.compiled == null ? c.scene : o.compiled);
    if (pinned) scene = stripQuality(scene);
    const present = c.ownerPresent !== false;
    const trigger = present ? String(im.trigger || "").trim() : "";
    // Стилевые теги персонажа — только те, о которых просит сцена.
    const style = splitTags(im.styleTrigger).filter((t) => mentions(bareTag(t), scene)).join(", ");
    const loras = o.backend === "a1111"
      ? loraTokens((present ? (im.loras || []) : []).filter((l, i, a) => a.findIndex((x) => norm(x.name) === norm(l.name)) === i))
      : "";
    const body = [c.keep, scene, loras, trigger, style, c.tail].filter(Boolean).join(", ");
    let p = combine(body, s.fixedPrompt, s.promptMode || "append");
    if (s.promptMode === "replace" && loras && !p.includes("<lora:")) p += ", " + loras;
    const prompt = dropContradictorySolo(normalizeTags(dedupe(p, [trigger, im.styleTrigger].filter(Boolean).join(", "))));

    const pov = o.persona && o.persona.image && o.persona.image.view === "first";
    const povNeg = pov ? POV_NEG.concat(subjectCount(prompt) < 2 && !/\b1boy\b/.test(prompt) ? POV_SOLO_NEG : []) : [];
    const negative = joinUnique(s.negative, present ? im.negative : "", c.absence, povNeg.join(", "));
    return { prompt, negative };
  }

  /* ── Размер кадра ──────────────────────────────────────────────────── */
  const SDXL = [[1024, 1024], [1152, 896], [896, 1152], [1216, 832], [832, 1216], [1344, 768], [768, 1344], [1536, 640], [640, 1536]];
  const RATIOS = { "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "3:2": [3, 2], "2:3": [2, 3], "16:9": [16, 9], "9:16": [9, 16], "21:9": [21, 9], "9:21": [9, 21] };
  // Сохраняет пропорцию, площадь ~1 Мп, кратно 64, предпочитает обученные SDXL-размеры.
  function sizeFor(ratio, opts) {
    const o = opts || {};
    if (o.mode === "fixed" && /\d+x\d+/.test(o.fixed || "")) { const m = o.fixed.match(/(\d+)x(\d+)/); return [+m[1], +m[2]]; }
    const r = RATIOS[ratio] || RATIOS["1:1"];
    const asp = r[0] / r[1], max = o.maxSide || 1216, area = o.area || 1024 * 1024;
    let w = Math.sqrt(area * asp), h = w / asp;
    const k = Math.min(1, max / Math.max(w, h)); w *= k; h *= k;
    const fit = (v) => { let x = Math.max(64, Math.round(v / 64) * 64); while (x > max && x > 64) x -= 64; return x; };
    const fw = fit(w), fh = fit(h);
    const err = (a, b) => Math.abs(Math.log(a / b / asp));
    let best = null, be = Infinity;
    for (const b of SDXL) {
      if (Math.max(b[0], b[1]) > max) continue;
      if (b[0] * b[1] < area * 0.85 || b[0] * b[1] > area * 1.15) continue;
      const e = err(b[0], b[1]);
      if (e < be) { be = e; best = b; }
    }
    return best && be <= err(fw, fh) + 0.002 ? best.slice() : [fw, fh];
  }
  const PERCHANCE_RES = ["512x512", "512x768", "768x512", "768x768"];
  function perchanceResolution(ratio) {
    const r = RATIOS[ratio] || RATIOS["1:1"];
    if (r[0] === r[1]) return "768x768";
    return r[0] > r[1] ? "768x512" : "512x768";
  }
  const OPENAI_SIZES = [[1024, 1024], [1536, 1024], [1024, 1536], [1792, 1024], [1024, 1792]];
  function openaiSize(ratio) {
    const r = RATIOS[ratio] || RATIOS["1:1"], t = Math.log(r[0] / r[1]);
    return OPENAI_SIZES.reduce((a, b) => (Math.abs(Math.log(b[0] / b[1]) - t) < Math.abs(Math.log(a[0] / a[1]) - t) ? b : a));
  }

  /* ── Директивы [draw: …] в ответе модели ───────────────────────────── */
  const DRAW_RE = /\[draw:\s*([^\]]+)\]/gi;
  function parseDraws(text) {
    const draws = [];
    const clean = String(text || "").replace(DRAW_RE, (_, body) => {
      let prompt = body.trim(), ratio = "1:1";
      const m = prompt.match(/,?\s*(\d{1,2}:\d{1,2})\s*$/);
      if (m && RATIOS[m[1]]) { ratio = m[1]; prompt = prompt.slice(0, m.index).trim(); }
      if (prompt) draws.push({ prompt, ratio });
      return "";
    });
    return { text: clean.replace(/\n{3,}/g, "\n\n").trim(), draws };
  }
  function stripDrawsForDisplay(text) { return String(text || "").replace(DRAW_RE, "").replace(/\[draw:[^\]]*$/i, ""); }

  /* Инструкция модели, когда она может «нарисовать» момент сама. */
  function drawInstruction(o) {
    const opts = o || {};
    const tags = opts.format !== "description";
    const pinned = !!opts.qualityPinned;
    const lines = [
      "Ты можешь показать собеседнику картинку. Для этого напиши ОДНУ директиву отдельной строкой: [draw: <prompt>]",
      tags
        ? "- <prompt> — только то, что видит камера в этот момент, списком английских тегов в стиле danbooru через запятую (например: 1girl, long orange hair, white blouse, sitting at a table, library, soft lighting, close-up). Без предложений."
        : "- <prompt> — только то, что видит камера в этот момент, одним-двумя простыми английскими предложениями.",
      pinned ? "- Не пиши теги качества (masterpiece, best quality, absurdres, 8k) и веса вида (x:1.3) — приложение добавит их само." : "- Начни с короткого постоянного блока качества (masterpiece, best quality).",
      "- Порядок: персонажи в кадре и их внешность → действие, поза, выражение, одежда, место → свет и ракурс.",
      opts.pov
        ? "- Вид от первого лица: камера — глаза собеседника, его самого в кадре нет. Начни с pov, его лицо и одежду не описывай; видимые части тела — только тегами pov hands / pov feet и т. п. Если в кадре один человек — это solo."
        : "- Рисуй всех, кто физически в сцене. Если собеседник рядом — он тоже в кадре: теги на обоих (1girl, 1boy) и у каждого своё действие. solo — только когда в кадре один человек. Каждый названный человек: имя + пол + возраст + 1–2 приметы (например, ichigo_kurosaki, male, young man, short orange hair).",
      "- Покажи действие, а не только позу, и сохрани градус сцены: ничего откровеннее и ничего целомудреннее, чем происходит. Обычный момент остаётся обычным.",
      "- Промпт всегда на английском; нелатинские имена — в латинской транскрипции.",
      "- В конце можно указать пропорции: [draw: <prompt>, 16:9]. Варианты: 16:9, 9:16, 4:3, 3:4, 1:1 (по умолчанию).",
      "- Не больше одной директивы за ответ, и только когда картинка действительно уместна или о ней просят.",
    ];
    return lines.join("\n");
  }

  /* Правила перевода сцены в промпт (для compile.js). */
  function rewriteRules(o) {
    const opts = o || {};
    const q = opts.qualityPinned
      ? "Do NOT write quality tags (masterpiece, best quality, absurdres, 8k) or weighted tags — the app pins its own."
      : "Keep quality tags the scene already has; if none, add a short consistent set (masterpiece, best quality).";
    const base = opts.format === "description"
      ? "Rewrite the scene into a prompt for an image model that reads natural language (SDXL, Flux). Output ONLY one to three English sentences, no lists, no quotes, no markdown.\nORDER: who is in frame (name, gender, age, look; each person their own appearance and action) → what they do and where → style, lighting, camera."
      : "Rewrite the scene into a prompt for an anime Stable Diffusion model (SDXL / Pony / Illustrious / NoobAI). Output ONLY one line of comma-separated English danbooru tags. No sentences, no quotes, no markdown.\nORDER: each person in frame — name immediately followed by gender, age category and 1-2 visual anchors (e.g. rukia_kuchiki, female, young woman, short black hair) plus the count tag (1girl, 1boy, 2girls; solo only for exactly one person) → action, pose, expression, clothing exactly as described, setting, time of day → style, lighting, camera.";
    const rules = [
      "Keep every concrete detail: pose, action, expression, exactly the garments described, place, time, framing.",
      "Keep the amount of clothing exactly as described. Never add nudity or sexual content the scene did not state; if the scene is sexual, name the act plainly with standard tags, never soften it.",
      q,
      "Translate anything not in English; romanise non-Latin names.",
      opts.format === "description" ? "60 words or fewer." : "50 tags or fewer.",
    ];
    let txt = base + "\nRULES:\n" + rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
    if (opts.pov) txt += "\nFIRST-PERSON VIEW: the camera is the viewer's eyes. Start with pov; never describe the viewer; only one person in frame unless the scene shows the viewer's hands etc.";
    if (opts.identity) txt += "\nCHARACTER (keep this look constant; tags listed as injected later must NOT be repeated):\n" + opts.identity;
    return txt;
  }

  function needsRewrite(s) { return /[Ѐ-ԯ぀-ヿ㐀-鿿가-힯]/.test(String(s || "")); }

  PRP.imgCompose = {
    words, wordFormMatch, mentions, parseMap, resolveWardrobe, resolveAppearance,
    splitTags, bareTag, normalizeTags, stripQuality, subjectCount, dropContradictorySolo, dedupe,
    wardrobeConflicts, ownerPresent, compose, finalise, loraTokens, sizeFor, perchanceResolution, openaiSize,
    parseDraws, stripDrawsForDisplay, drawInstruction, rewriteRules, needsRewrite, RATIOS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.imgCompose;
})(typeof window !== "undefined" ? window : globalThis);

/* js/images/backends.js */
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

/* js/images/compile.js */
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
    if (!s || o.translate === false || !IC.needsRewrite(s) || typeof generateText !== "function") return { text: s, compiled: false };
    await warm();
    const key = ["v1", o.format || "tags", o.pov ? "pov" : "std", o.qualityPinned ? "q" : "", o.identity || "", s].join("\u0001");
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

/* js/providers/openai.js */
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

/* js/providers/perchance.js */
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

/* js/providers/router.js */
/* Prism RP — выбор транспорта текстовой модели.
   Единая точка вызова для генерации, картинок и ассистента: по виду провайдера
   отправляет готовые сообщения в Perchance (ai-text-plugin) или в OpenAI-совместимый API.
   Ничего не знает о сцене, опыте, карточках и дереве чата — только о транспорте. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const PC = PRP.perchance, OA = PRP.openai;

  /* prov — элемент settings.providerList; messages — [{role, content}].
     opts: { names: {char, user} (для Perchance), sampler (для API), signal, onDelta, continueFrom }
     → { text, reasoning } (контракт PRP.openai.chat / PRP.perchance.chat) */
  function chat(prov, messages, opts) {
    const o = opts || {};
    return prov.kind === "perchance"
      ? PC.chat(o.names || {}, messages, { signal: o.signal, onDelta: o.onDelta, continueFrom: o.continueFrom || null })
      : OA.chat(prov, messages, o.sampler, { signal: o.signal, onDelta: o.onDelta });
  }

  // Короткий служебный вызов без стриминга (перевод сцены в промпт картинки).
  async function simple(prov, instruction) {
    if (!prov) throw new Error("нет текстовой модели");
    if (prov.kind === "perchance") return PC.simple(instruction);
    const r = await OA.chat(prov, [{ role: "user", content: instruction }], { temperature: 0.3, max_tokens: 400 }, {});
    return OA.splitThink(r.text).text;
  }

  PRP.llm = { chat, simple };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/render.js */
/* Prism RP — вспомогательные функции отображения (без побочных эффектов). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const esc = (s) => PRP.util.escapeHtml(s);

  // Иконки: тонкий штрих 1.6, currentColor.
  const P = {
    home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    scene: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    memory: '<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    prism: '<path d="M12 4 4 19h16z"/><path d="M2 12h6.5M15.5 10.5 22 8M15.8 12.8 22 13M15 15l7 3.5"/>',
    card: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><circle cx="12" cy="10" r="2.8"/><path d="M7.5 17c1-2.2 2.6-3.2 4.5-3.2s3.5 1 4.5 3.2"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
    regen: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    edit: '<path d="m15 5 4 4L8.5 19.5H4.5v-4z"/><path d="m13 7 4 4"/>',
    trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5h5V7"/>',
    left: '<path d="m14.5 6-6 6 6 6"/>',
    right: '<path d="m9.5 6 6 6-6 6"/>',
    cont: '<path d="M5 6v12M9 6l9 6-9 6z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    bubble: '<path d="M20 11.5c0 4-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 19.5l1.3-3.6A6.6 6.6 0 0 1 4 11.5c0-4 3.6-7 8-7s8 3 8 7z"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    think: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/>',
    sliders: '<path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1-.8-1.4-.8-2.3 0-1 .8-1.7 1.8-1.7h2c2 0 3.7-1.6 3.7-3.7C20.5 6.8 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
    data: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    shirt: '<path d="M9 4 4.5 6.5l1.8 4L8 9.8V20h8V9.8l1.7.7 1.8-4L15 4c-.6 1.3-1.7 2-3 2s-2.4-.7-3-2z"/>',
    panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
    brush: '<path d="M14.5 4.5 19.5 9.5 11 18l-5-5z"/><path d="M6 13c-2 0-2.5 2-2.5 3.5S2.5 20 2.5 20s4 .5 5.5-1 1-3 1-3"/>',
    pin: '<path d="M9 4h6l-1 5 3 3H7l3-3zM12 12v8"/>',
    assist: '<path d="M20 12.5c0 3.9-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 20l1.3-3.6A6.6 6.6 0 0 1 4 12.5c0-3.9 3.6-7 8-7"/><path d="M17.5 2.8l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  };
  function icon(name, cls) {
    return `<svg class="${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;
  }

  const GLYPH = `<svg class="brand-glyph" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="prism-g" x1="0" x2="1"><stop offset="0" stop-color="#7fd1ff"/><stop offset=".35" stop-color="#b79cff"/><stop offset=".65" stop-color="#ff9ec7"/><stop offset="1" stop-color="#ffd08a"/></linearGradient></defs><path d="M14 6 5 25h18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M1 17h7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 15.5 31 12.5M18.3 17.5 31 17.5M18.6 19.5 31 22.5" stroke="url(#prism-g)" stroke-width="1.8" stroke-linecap="round"/></svg>`;

  // Стабильный оттенок из имени — для заглушек без портрета.
  function hue(name) {
    let h = 0;
    for (const ch of String(name || "?")) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }
  function artBg(name) {
    const h = hue(name);
    return `background:linear-gradient(150deg,hsl(${h} 55% 52%),hsl(${(h + 48) % 360} 50% 30%) 70%,hsl(${(h + 80) % 360} 45% 22%))`;
  }
  function initial(name) { return esc(String(name || "?").trim().charAt(0).toUpperCase() || "?"); }

  function avatar(card, size, extra) {
    const name = (card && card.name) || "?";
    const cls = `av av-${size || 40} ${extra || ""}`;
    if (card && card.avatar) return `<div class="${cls}"><img src="${card.avatar}" alt=""></div>`;
    if (card && card.me) return `<div class="${cls} av-me">${initial(name)}</div>`;
    return `<div class="${cls}" style="${artBg(name)}">${initial(name)}</div>`;
  }
  function art(card) {
    if (card.avatar) return `<div class="tile-art"><img src="${card.avatar}" alt="" loading="lazy"></div>`;
    return `<div class="tile-art" style="${artBg(card.name)}">${initial(card.name)}</div>`;
  }

  // Ролевая проза: *действие*, «речь» / "речь", **акцент**.
  function rpText(text) {
    let h = esc(text);
    h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    h = h.replace(/(«[^»\n]+»|&quot;[^\n]+?&quot;|“[^”\n]+”)/g, "<q>$1</q>");
    return h;
  }

  // Ответы ассистента: безопасный минимум Markdown. Сначала всё экранируется,
  // затем размечаются блоки кода, заголовки, списки, цитаты, **жирный**, *курсив*, `код`.
  function md(text) {
    const src = String(text || "").replace(/\r\n?/g, "\n");
    const parts = src.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g);
    const inline = (s) => s
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    let out = "";
    parts.forEach((p, i) => {
      if (i % 2 === 1) {
        const m = p.match(/^```([^\n]*)\n([\s\S]*?)(?:```)?$/);
        const code = m ? m[2].replace(/\n$/, "") : p;
        out += `<div class="mdcode"><button class="tool code-copy" data-act="copy-code" title="Скопировать">${icon("copy")}</button><pre><code>${esc(code)}</code></pre></div>`;
        return;
      }
      const lines = esc(p).split("\n");
      let list = null, para = [];
      const flush = () => {
        if (para.length) { out += `<p>${inline(para.join("<br>"))}</p>`; para = []; }
        if (list) { out += `<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join("")}</${list.tag}>`; list = null; }
      };
      for (const line of lines) {
        let m;
        if (!line.trim()) { flush(); continue; }
        if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); const hl = Math.max(3, m[1].length + 1); out += `<h${hl}>${inline(m[2])}</h${hl}>`; continue; }
        if ((m = line.match(/^&gt;\s?(.*)$/))) { flush(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
        if ((m = line.match(/^\s*[-*•]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
          const tag = /^\s*\d/.test(line) ? "ol" : "ul";
          if (para.length) { out += `<p>${inline(para.join("<br>"))}</p>`; para = []; }
          if (list && list.tag !== tag) flush();
          if (!list) list = { tag, items: [] };
          list.items.push(m[1]);
          continue;
        }
        if (list) flush();
        para.push(line);
      }
      flush();
    });
    return out;
  }

  // Мессенджер: ответ делится на отдельные сообщения по пустым строкам.
  function bubbles(text) {
    return String(text || "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  }

  function time(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  function day(ts) {
    const d = new Date(ts || Date.now());
    const today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Сегодня";
    if (d.toDateString() === y.toDateString()) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }
  function ago(ts) {
    if (!ts) return "";
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "только что";
    if (s < 3600) return Math.floor(s / 60) + " мин назад";
    if (s < 86400) return Math.floor(s / 3600) + " ч назад";
    return day(ts);
  }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  PRP.render = { esc, icon, GLYPH, avatar, art, artBg, rpText, md, bubbles, time, day, ago, plural, hue };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/files.js */
/* Prism RP — файловый ввод-вывод браузера: скачать, прочитать, нарисовать PNG портрета, буфер обмена.
   Платформенный адаптер для сервисов и контроллеров; правил приложения не содержит. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render;

  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[\\/:*?"<>|]+/g, "_");
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function readFile(file, as) {
    return new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => fail(r.error);
      if (as === "text") r.readAsText(file);
      else if (as === "dataurl") r.readAsDataURL(file);
      else r.readAsArrayBuffer(file);
    });
  }

  // PNG-байты портрета для экспорта карточки: исходный PNG, перерисованная картинка или заглушка с инициалом.
  function avatarPngBytes(cd) {
    return new Promise((ok, fail) => {
      const draw = (img) => {
        const cv = document.createElement("canvas");
        cv.width = img ? img.naturalWidth : 600; cv.height = img ? img.naturalHeight : 800;
        const g = cv.getContext("2d");
        if (img) g.drawImage(img, 0, 0);
        else {
          const h = R.hue(cd.name);
          const gr = g.createLinearGradient(0, 0, 600, 800);
          gr.addColorStop(0, `hsl(${h} 55% 52%)`); gr.addColorStop(1, `hsl(${(h + 80) % 360} 45% 22%)`);
          g.fillStyle = gr; g.fillRect(0, 0, 600, 800);
          g.fillStyle = "rgba(255,255,255,.88)"; g.font = "bold 300px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText((cd.name || "?").charAt(0).toUpperCase(), 300, 420);
        }
        cv.toBlob(async (b) => ok(new Uint8Array(await b.arrayBuffer())), "image/png");
      };
      if (cd.avatar && cd.avatar.startsWith("data:image/png")) fetch(cd.avatar).then((r) => r.arrayBuffer()).then((b) => ok(new Uint8Array(b)), fail);
      else if (cd.avatar) { const img = new Image(); img.onload = () => draw(img); img.onerror = () => draw(null); img.src = cd.avatar; }
      else draw(null);
    });
  }

  // Копирование в буфер; при запрете Clipboard API — через временное поле.
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
  }

  PRP.files = { download, readFile, avatarPngBytes, copyText };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/views/kit.js */
/* Prism RP — общие части представлений: пресеты, темы, повторяющиеся куски разметки.
   Представления — чистые функции «модель (m) → HTML»; действия размечены data-act
   и обрабатываются контроллерами (js/ui/controllers). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render;
  const { esc, icon } = R;

  const SAMPLER_PRESETS = [
    { id: "precise", name: "Точный", hint: "держится карточки, меньше сюрпризов", v: { temperature: 0.7, top_p: 0.9, min_p: 0.08, top_k: 0, repetition_penalty: 1.05 } },
    { id: "balanced", name: "Сбалансированный", hint: "по умолчанию", v: { temperature: 0.9, top_p: 0.95, min_p: 0.05, top_k: 0, repetition_penalty: 1.05 } },
    { id: "lively", name: "Живой", hint: "больше инициативы и неожиданностей", v: { temperature: 1.1, top_p: 0.98, min_p: 0.03, top_k: 0, repetition_penalty: 1.08 } },
  ];
  const THEMES = [
    { id: "dusk", name: "Сумерки", c: ["#15131d", "#252233", "#b79cff", "#ff9ec7"] },
    { id: "dawn", name: "Рассвет", c: ["#f1eef7", "#ffffff", "#6b4edb", "#e05596"] },
    { id: "paper", name: "Бумага", c: ["#efe8dc", "#f8f3ea", "#7a4d9e", "#c98a2a"] },
  ];
  const WEATHER = ["ясно", "облачно", "пасмурно", "дождь", "ливень", "снег", "туман", "гроза", "жара", "мороз", "ветрено"];

  function loraRows(act, list) {
    return `<div class="lora-rows">${list.map((l, i) => `<div class="row lora-row"><input class="input" data-${act}-name="${i}" list="dl-loras" value="${esc(l.name)}" placeholder="имя LoRA" style="flex:3">
      <input class="input" type="number" step="0.05" data-${act}-w="${i}" value="${esc(String(l.weight))}" style="flex:1;max-width:90px">
      <button class="icon-btn" data-act="${act}-del" data-i="${i}" title="Убрать">${icon("x")}</button></div>`).join("")}
      <button class="btn btn-sm" data-act="${act}-add">${icon("plus")}LoRA</button></div>`;
  }

  PRP.viewKit = { SAMPLER_PRESETS, THEMES, WEATHER, loraRows };
  Object.assign((PRP.views = PRP.views || {}), { SAMPLER_PRESETS, THEMES });
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/views/home.js */
/* Prism RP — левая навигация и главный экран (галерея персонажей). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Навигация слева ──────────────────────────────────────────────── */
  function rail(m) {
    const chats = m.chats.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40);
    return `
      <button class="brand" data-act="home" title="На главную">${R.GLYPH}<span>Prism RP</span></button>
      <nav class="rail-nav">
        <button class="rail-item ${m.view === "home" ? "active" : ""}" data-act="home">${icon("home")}Персонажи</button>
        <button class="rail-item ${m.view === "assist" ? "active" : ""}" data-act="assist" title="Разговор с моделью вне игры: советы, карточки, разбор чата">${icon("assist")}Ассистент</button>
        <button class="rail-item" data-act="import">${icon("upload")}Импорт карточки</button>
      </nav>
      <div class="rail-head"><span>Недавние чаты</span></div>
      <div class="rail-chats">
        ${chats.length ? chats.map((c) => {
          const cd = m.cards.find((x) => x.id === c.cardId);
          if (!cd) return "";
          return `<div class="rail-chat ${m.chat && m.chat.id === c.id && m.view === "chat" ? "active" : ""}" data-act="open-chat" data-id="${c.id}" role="button" tabindex="0">
            ${R.avatar(cd, 34)}
            <div style="min-width:0"><div class="t1">${esc(cd.name)}</div><div class="t2">${esc(c.preview || c.title || "")}</div></div>
            <span class="kind" title="${c.mode === "messenger" ? "Переписка" : "Сцена"}">${icon(c.mode === "messenger" ? "bubble" : "book")}</span>
          </div>`;
        }).join("") : `<p class="hint" style="padding:6px 10px">Здесь появятся ваши чаты.</p>`}
      </div>
      <div class="rail-foot">
        <button class="btn btn-ghost btn-sm" data-act="settings" style="flex:1;justify-content:flex-start">${icon("settings")}Настройки</button>
        <button class="icon-btn" data-act="cycle-theme" title="Сменить тему">${icon("palette")}</button>
      </div>`;
  }

  /* ── Главный экран ────────────────────────────────────────────────── */
  function home(m) {
    const q = (m.homeQuery || "").toLowerCase();
    const cards = m.cards.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.tags || []).join(" ").toLowerCase().includes(q));
    const prov = m.provider;
    const welcome = !m.cards.length ? `
      <div class="welcome">
        <div class="step"><div class="n">1</div><h3>Добавьте персонажа</h3><p>Импортируйте карточку PNG или JSON (форматы V1–V3) или создайте с нуля.</p>
          <div class="row"><button class="btn btn-primary btn-sm" data-act="import">${icon("upload")}Импорт</button><button class="btn btn-sm" data-act="new-card">${icon("plus")}Создать</button></div></div>
        <div class="step"><div class="n">2</div><h3>Подключите модель</h3><p>${prov ? `Сейчас выбрана: ${esc(prov.label)}.` : "На Perchance бесплатная модель готова сразу; можно подключить свой API."}</p>
          <button class="btn btn-sm" data-act="settings" data-section="models">${icon("cpu")}Модели</button></div>
        <div class="step"><div class="n">3</div><h3>Начните сцену или переписку</h3><p>Сцена — ролевая проза с учётом места, времени и одежды. Переписка — короткие сообщения, как в мессенджере.</p></div>
      </div>` : "";
    const recent = m.chats.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
    return `<div class="home"><div class="home-inner">
      <div class="home-top">
        <div><h1>${m.cards.length ? "Персонажи" : "Добро пожаловать в Prism RP"}</h1>
          <p class="sub">${m.cards.length ? `${m.cards.length} ${R.plural(m.cards.length, "персонаж", "персонажа", "персонажей")}. Выберите, с кем продолжить.` : "Среда для ролевой игры, где персонаж реагирует на сцену через свой характер и пережитый опыт, а время, место и одежду ведёт приложение."}</p></div>
        ${m.cards.length ? `<div class="home-tools">
          <label class="search">${icon("search")}<input id="home-q" placeholder="Найти по имени или тегу" value="${esc(m.homeQuery || "")}"></label>
          <button class="btn" data-act="import">${icon("upload")}Импорт</button>
          <button class="btn btn-primary" data-act="new-card">${icon("plus")}Создать</button></div>` : ""}
      </div>
      ${welcome}
      ${recent.length ? `<div class="section-title">Продолжить</div>
        <div class="gallery" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
        ${recent.map((c) => {
          const cd = m.cards.find((x) => x.id === c.cardId);
          if (!cd) return "";
          return `<div class="rail-chat panel" style="margin:0" data-act="open-chat" data-id="${c.id}" role="button" tabindex="0">${R.avatar(cd, 34)}
            <div style="min-width:0"><div class="t1">${esc(cd.name)} <span class="tag">${c.mode === "messenger" ? "переписка" : "сцена"}</span></div><div class="t2">${esc(c.preview || "Новый чат")}</div></div>
            <span class="t2">${esc(R.ago(c.updatedAt))}</span></div>`;
        }).join("")}</div>` : ""}
      ${m.cards.length ? `<div class="section-title">Все персонажи</div>` : ""}
      <div class="gallery">
        ${cards.map((cd) => {
          const n = m.chats.filter((c) => c.cardId === cd.id).length;
          return `<div class="tile" data-act="open-card" data-id="${cd.id}" title="Начать или продолжить чат с ${esc(cd.name)}" role="button" tabindex="0">
            ${R.art(cd)}<div class="tile-shade"></div>
            ${n ? `<span class="tile-count">${n} ${R.plural(n, "чат", "чата", "чатов")}</span>` : ""}
            <button class="tile-edit" data-act="edit-card" data-id="${cd.id}" title="Редактировать карточку">${icon("edit")}<span>Изменить</span></button>
            <div class="tile-body"><div class="tile-name">${esc(cd.name)}</div><div class="tile-tags">${esc((cd.tags || []).slice(0, 4).join(", ") || cd.creator || " ")}</div></div>
          </div>`;
        }).join("")}
        ${m.cards.length ? `<div class="tile tile-new" role="group">
          ${icon("plus")}<button class="btn btn-sm" data-act="new-card">Создать</button><button class="btn btn-sm btn-ghost" data-act="import">Импорт</button></div>` : ""}
      </div>
      ${q && !cards.length ? `<p class="empty-note">Никого не нашлось по запросу «${esc(m.homeQuery)}».</p>` : ""}
    </div></div>`;
  }

  Object.assign((PRP.views = PRP.views || {}), { rail, home });
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/views/chat.js */
/* Prism RP — экран чата: шапка, лента (сцена и переписка), картинки в сообщениях, поле ввода, поповеры чата. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Чат ──────────────────────────────────────────────────────────── */
  function chat(m) {
    return `<section class="chat">
      ${chatHead(m)}
      ${m.find ? `<div class="findbar"><label class="search">${icon("search")}<input id="find-q" placeholder="Поиск по этому чату" value="${esc(m.find.q || "")}"></label>
        <span class="count" id="find-count"></span>
        <button class="icon-btn" data-act="find-prev" title="Предыдущее">${icon("left")}</button><button class="icon-btn" data-act="find-next" title="Следующее">${icon("right")}</button>
        <button class="icon-btn" data-act="find-close" title="Закрыть поиск">${icon("x")}</button></div>` : ""}
      <div class="feed" id="feed"><div class="feed-inner" id="feed-inner">${feed(m)}</div></div>
      ${composer(m)}
    </section>`;
  }

  function chatHead(m) {
    const cd = m.card, c = m.chat;
    const line = SC.summaryLine(m.scene);
    const status = c.mode === "messenger"
      ? (m.gen ? `<span class="head-scene live">печатает…</span>` : `<span class="head-scene"><span class="status-dot"></span> ${esc(messengerStatus(m) || "в сети")}</span>`)
      : `<span class="head-scene ${m.gen ? "live" : ""}">${m.gen ? "пишет…" : esc(line || "Сцена не задана — откройте панель сцены")}</span>`;
    return `<header class="chat-head">
      <button class="icon-btn only-narrow" data-act="rail" title="Меню">${icon("menu")}</button>
      <button class="head-av" data-act="edit-card" title="Карточка персонажа">${R.avatar(cd, 40)}</button>
      <div class="head-who"><div class="head-name"><button class="head-card" data-act="edit-card" title="Открыть карточку персонажа">${esc(cd.name)}</button> <button class="tool rename" data-act="rename-chat" title="Переименовать чат">${esc(c.title || "")} ${icon("edit")}</button></div>${status}</div>
      <div class="head-tools">
        <div class="seg wide" role="group" aria-label="Режим">
          <button class="${c.mode === "rp" ? "on" : ""}" data-act="mode" data-mode="rp" title="Сцена">${icon("book")}<span>Сцена</span></button>
          <button class="${c.mode === "messenger" ? "on" : ""}" data-act="mode" data-mode="messenger" title="Переписка">${icon("bubble")}<span>Переписка</span></button>
        </div>
        <button class="icon-btn ${m.find ? "on" : ""}" data-act="find" title="Поиск (Ctrl+F)">${icon("search")}</button>
        <button class="icon-btn" data-act="edit-card" title="Карточка персонажа">${icon("card")}</button>
        <button class="icon-btn ${m.drawerOpen ? "on" : ""}" data-act="drawer" title="Сцена, опыт, Prism">${icon("panel")}</button>
        <button class="icon-btn" data-act="chat-menu" title="Ещё">${icon("more")}</button>
      </div>
    </header>`;
  }

  function messengerStatus(m) {
    const st = m.scene;
    const k = Object.keys(st.chars).find((n) => n.toLowerCase() === m.card.name.toLowerCase());
    return [st.loc, k && st.chars[k].pose].filter(Boolean).join(", ");
  }

  function feed(m) {
    if (!m.path.length) {
      return `<div class="empty-note">${m.chat.mode === "messenger"
        ? `Напишите ${esc(m.card.name)} первым — например, «привет, чем занята?»`
        : `Опишите, с чего начинается сцена, или задайте место и время в панели сцены.`}</div>`;
    }
    return m.chat.mode === "messenger" ? messengerFeed(m) : rpFeed(m);
  }

  function swipeNav(msg, isLast) {
    if (msg.role !== "assistant") return "";
    const n = msg.swipes.length, i = (msg.swipeIdx || 0) + 1;
    if (n < 2 && !isLast) return "";
    return `<span class="swipes"><button class="tool" data-act="swipe" data-dir="-1" data-id="${msg.id}" title="Предыдущий вариант" ${i === 1 ? "disabled" : ""}>${icon("left")}</button>${i}/${n}<button class="tool" data-act="swipe" data-dir="1" data-id="${msg.id}" title="${isLast && i === n ? "Новый вариант" : "Следующий вариант"}">${icon("right")}</button></span>`;
  }

  function tools(msg, isLast) {
    return `<div class="tools">${swipeNav(msg, isLast)}
      ${msg.role === "assistant" && isLast ? `<button class="tool" data-act="regen" data-id="${msg.id}">${icon("regen")}Другой вариант</button>
        <button class="tool" data-act="continue" data-id="${msg.id}">${icon("cont")}Продолжить</button>` : ""}
      ${msg.role === "assistant" ? `<button class="tool" data-act="draw" data-id="${msg.id}" title="Нарисовать этот момент">${icon("brush")}Нарисовать</button>` : ""}
      <button class="tool" data-act="edit" data-id="${msg.id}">${icon("edit")}Править</button>
      <button class="tool" data-act="to-exp" data-id="${msg.id}" title="Сохранить событие в опыт персонажа">${icon("memory")}В опыт</button>
      <button class="tool" data-act="delete" data-id="${msg.id}" title="Удалить с этого места">${icon("trash")}</button></div>`;
  }

  function editor(msg, sw) {
    const raw = sw.text + (msg.role === "assistant" && sw.sceneOps && sw.sceneOps.length ? "\n\n[scene: " + sw.sceneOps.map((o) => o.raw).join("; ") + "]" : "");
    return `<textarea class="editor" id="edit-${msg.id}">${esc(raw)}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn btn-primary btn-sm" data-act="save-edit" data-id="${msg.id}">Сохранить</button>
      <button class="btn btn-sm btn-ghost" data-act="cancel-edit">Отмена</button></div>`;
  }

  // Изменения сцены от модели под сообщением; ручные правки видны в панели сцены.
  function deltas(sw) {
    const ops = (sw.sceneOps || []).filter((o) => !o.manual);
    if (!ops.length) return "";
    const shown = ops.slice(0, 6);
    return `<div class="turn-meta">${shown.map((o) => `<span class="delta">${esc(SC.opLabel(o))}</span>`).join("")}${ops.length > 6 ? `<span class="delta">ещё ${ops.length - 6}</span>` : ""}</div>`;
  }

  function liveText(m) {
    return PRP.imgCompose.stripDrawsForDisplay(SC.stripForDisplay(OA.splitThink(m.gen.raw).text));
  }

  // Картинки сообщения: в работе, готовые, с ошибкой.
  function shots(m, msg, sw, bubble) {
    const list = sw.images || [];
    if (!list.length) return "";
    const idx = msg.swipes.indexOf(sw);
    return `<div class="shots ${bubble ? "in-bubble" : ""}">${list.map((im) => {
      const ar = im.w && im.h ? `${im.w}/${im.h}` : (im.ratio || "1:1").replace(":", "/");
      const base = `data-mid="${msg.id}" data-sw="${idx}" data-img="${im.id}"`;
      if (im.status === "pending") {
        return `<figure class="shot wait" style="aspect-ratio:${ar}"><div class="shot-wait"><span>${esc(im.stage || "Рисую…")}</span></div>
          <figcaption class="shot-cap">${esc(im.draw || "")}</figcaption></figure>`;
      }
      if (im.status === "error") {
        return `<figure class="shot failed"><div class="err">${icon("alert")}<span>${esc(im.error || "Не получилось нарисовать.")}</span></div>
          <div class="row"><button class="btn btn-sm" data-act="img-regen" ${base}>${icon("regen")}Попробовать ещё раз</button><button class="btn btn-sm btn-ghost" data-act="img-del" ${base}>Убрать</button></div></figure>`;
      }
      const url = m.imgUrls && m.imgUrls[im.id];
      return `<figure class="shot" style="aspect-ratio:${ar}">
        ${url ? `<img src="${url}" alt="${esc(im.draw || "картинка")}" data-act="img-view" ${base} loading="lazy">` : `<div class="shot-wait"><span>Загрузка…</span></div>`}
        <div class="shot-tools">
          <button class="icon-btn" data-act="img-regen" ${base} title="Нарисовать заново, другой seed">${icon("regen")}</button>
          <button class="icon-btn" data-act="img-pin" ${base} title="Закрепить seed ${im.seed != null ? im.seed : ""} за персонажем">${icon("pin")}</button>
          <button class="icon-btn" data-act="img-info" ${base} title="Промпт и параметры">${icon("info")}</button>
          <button class="icon-btn" data-act="img-dl" ${base} title="Скачать">${icon("download")}</button>
          <button class="icon-btn" data-act="img-del" ${base} title="Удалить картинку">${icon("trash")}</button>
        </div></figure>`;
    }).join("")}</div>`;
  }

  function imageInfo(im) {
    return `<div class="pop-title">Промпт</div><div class="code" style="max-height:200px">${esc(im.prompt || "")}</div>
      ${im.negative ? `<div class="pop-title">Негатив</div><div class="code" style="max-height:120px">${esc(im.negative)}</div>` : ""}
      ${im.compiledFrom ? `<div class="pop-title">Сцена до перевода</div><div class="code" style="max-height:120px">${esc(im.compiledFrom)}</div>` : ""}
      <dl class="kv" style="padding:8px 10px;font-size:13px"><dt>Seed</dt><dd>${esc(im.seed != null ? String(im.seed) : "—")}</dd>
      <dt>Размер</dt><dd>${esc(im.w && im.h ? im.w + "×" + im.h : (im.info && im.info.resolution) || "—")}</dd>
      <dt>Где</dt><dd>${esc({ perchance: "Perchance", a1111: "Forge / A1111", openai: "API" }[im.backend] || im.backend || "—")}${im.info && im.info.model ? " · " + esc(im.info.model) : ""}</dd></dl>`;
  }

  function rpFeed(m) {
    const me = { name: m.persona.name, me: true };
    return m.path.map((msg, idx) => {
      const isLast = idx === m.path.length - 1;
      const sw = TR.activeSwipe(msg);
      const live = m.gen && m.gen.msgId === msg.id;
      const who = msg.role === "user" ? me : m.card;
      let body;
      if (m.editingMsg === msg.id) body = editor(msg, sw);
      else {
        const reasoning = live ? m.gen.reasoning : sw.reasoning;
        const text = live ? (m.gen.prefix || "") + liveText(m) : sw.text;
        const prose = R.rpText(text);
        body = `${reasoning ? `<details class="think"><summary>${icon("think")}Рассуждение модели</summary><div>${esc(reasoning)}</div></details>` : ""}
          <div class="prose ${live ? "cursor" : ""}" id="text-${msg.id}">${msg.role === "user" ? `<span class="bubble-plain">${prose}</span>` : prose}</div>
          ${sw.error ? `<div class="err">${icon("alert")}<span>${esc(sw.error)}</span></div>` : ""}
          ${!live ? shots(m, msg, sw) : ""}
          ${!live ? deltas(sw) : ""}
          ${live ? "" : tools(msg, isLast)}`;
      }
      return `<article class="turn ${msg.role} ${isLast ? "last" : ""}" data-mid="${msg.id}">${R.avatar(who, 40)}<div style="min-width:0">
        <div class="turn-head"><span class="turn-name">${esc(who.name)}</span><span class="turn-time">${R.time(sw.createdAt || msg.createdAt)}</span></div>${body}</div></article>`;
    }).join("");
  }

  function messengerFeed(m) {
    let lastDay = "";
    return m.path.map((msg, idx) => {
      const isLast = idx === m.path.length - 1;
      const sw = TR.activeSwipe(msg);
      const live = m.gen && m.gen.msgId === msg.id;
      const side = msg.role === "user" ? "me" : "them";
      const d = R.day(sw.createdAt || msg.createdAt);
      const mark = d !== lastDay ? `<div class="daymark">${esc(d)}</div>` : "";
      lastDay = d;
      if (m.editingMsg === msg.id) return mark + `<div class="msg-row ${side}">${editor(msg, sw)}</div>`;
      if (live) {
        const parts = R.bubbles(liveText(m));
        return mark + `<div class="msg-row them" id="text-${msg.id}">${parts.map((p) => `<div class="bub">${esc(p)}</div>`).join("")}<div class="bub typing"><i></i><i></i><i></i></div></div>`;
      }
      const parts = R.bubbles(sw.text);
      return mark + `<div class="msg-row ${side} ${isLast ? "last" : ""}" data-mid="${msg.id}">${parts.map((p) => `<div class="bub">${esc(p)}</div>`).join("")}${shots(m, msg, sw, true)}
        ${sw.error ? `<div class="err">${icon("alert")}<span>${esc(sw.error)}</span></div>` : ""}
        <div class="stamp">${R.time(sw.createdAt || msg.createdAt)}</div>${tools(msg, isLast)}</div>`;
    }).join("");
  }

  function meter(m) {
    const r = m.lastPrism && m.lastPrism.report;
    if (!r) return "";
    const frac = Math.max(0, Math.min(1, r.used / r.budget));
    const C = 2 * Math.PI * 8.5;
    return `<svg class="meter ${frac > 0.9 ? "hot" : ""}" viewBox="0 0 22 22" role="img" aria-label="Контекст заполнен на ${Math.round(frac * 100)}%"><circle class="bg" cx="11" cy="11" r="8.5"/><circle class="fg" cx="11" cy="11" r="8.5" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 11 11)"/></svg>`;
  }

  function composer(m) {
    const p = m.provider;
    const preset = SAMPLER_PRESETS.find((x) => x.id === m.settings.samplerPreset);
    const r = m.lastPrism && m.lastPrism.report;
    return `<div class="composer-wrap"><div class="composer">
      <textarea id="input" rows="1" placeholder="${m.chat.mode === "messenger" ? "Сообщение" : `Что делает и говорит ${esc(m.persona.name)}…`}" aria-label="Сообщение"></textarea>
      <div class="composer-bar">
        <button class="pill" data-act="model-pop" title="Модель и стиль генерации">${icon("cpu")}<span>${esc(p ? p.label : "Выбрать модель")}${preset && p && p.kind !== "perchance" ? " · " + esc(preset.name) : ""}</span></button>
        ${r ? `<button class="pill" data-act="open-prism" title="Сколько контекста занято: ${r.used} из ${r.budget} токенов">${meter(m)}<span>${Math.round((r.used / r.budget) * 100)}%</span></button>` : ""}
        <span class="spacer"></span>
        ${m.gen ? `<button class="send stop" data-act="stop" title="Остановить">${icon("stop")}</button>`
          : `<button class="send" data-act="send" title="Отправить (Enter)">${icon("send")}</button>`}
      </div></div></div>`;
  }

  /* ── Поповеры ─────────────────────────────────────────────────────── */
  function modelPop(m) {
    const act = m.provider;
    const edit = act && act.kind === "openai" ? m.settings.providers.find((x) => x.id === act.id) : null;
    return `<div class="pop-title">Модель</div>
      ${m.providers.map((p) => `<button class="pop-item ${act && act.id === p.id ? "on" : ""}" data-act="pick-provider" data-id="${p.id}">${icon(p.kind === "perchance" ? "star" : "cpu")}<span><span>${esc(p.name)}</span><small>${esc(p.kind === "perchance" ? "бесплатно, без ключа" : (p.model || "модель не выбрана"))}</small></span></button>`).join("")}
      ${edit && edit.models && edit.models.length ? `<div class="pop-sep"></div><div class="pop-title">Модели ${esc(edit.name)}</div>
        ${edit.models.slice(0, 30).map((md) => `<button class="pop-item ${md === edit.model ? "on" : ""}" data-act="pick-model" data-model="${esc(md)}">${esc(md)}</button>`).join("")}` : ""}
      ${act && act.kind !== "perchance" ? `<div class="pop-sep"></div><div class="pop-title">Стиль генерации</div>
        ${SAMPLER_PRESETS.map((s) => `<button class="pop-item ${m.settings.samplerPreset === s.id ? "on" : ""}" data-act="pick-preset" data-id="${s.id}"><span><span>${s.name}</span><small>${s.hint}</small></span></button>`).join("")}` : ""}
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="settings" data-section="models">${icon("settings")}Все настройки моделей</button>`;
  }

  function chatMenu(m) {
    return `<button class="pop-item" data-act="new-chat" data-mode="rp">${icon("book")}Новая сцена с ${esc(m.card.name)}</button>
      <button class="pop-item" data-act="new-chat" data-mode="messenger">${icon("bubble")}Новая переписка</button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="assist-about-chat">${icon("assist")}Спросить ассистента об этом чате</button>
      <button class="pop-item" data-act="edit-card">${icon("card")}Редактировать персонажа</button>
      <button class="pop-item" data-act="rename-chat">${icon("edit")}Переименовать чат</button>
      <button class="pop-item" data-act="export-chat" data-fmt="txt">${icon("download")}Скачать чат как текст</button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="delete-chat" style="color:var(--danger)">${icon("trash")}Удалить чат</button>`;
  }

  Object.assign((PRP.views = PRP.views || {}), { chat, chatHead, feed, composer, modelPop, chatMenu, imageInfo });
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/views/drawer.js */
/* Prism RP — выдвижная панель: сцена, опыт, Prism (что ушло в модель). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Выдвижная панель ─────────────────────────────────────────────── */
  function drawer(m) {
    const tabs = [["scene", "Сцена", "scene"], ["memory", "Опыт", "memory"], ["prism", "Prism", "prism"]];
    let body = "";
    if (!m.chat) body = `<p class="empty-note">Откройте чат.</p>`;
    else if (m.tab === "scene") body = sceneTab(m);
    else if (m.tab === "memory") body = memoryTab(m);
    else body = prismTab(m);
    return `<div class="drawer-head"><nav class="drawer-tabs">${tabs.map(([id, name, ic]) => `<button class="dtab ${m.tab === id ? "on" : ""}" data-act="tab" data-tab="${id}">${icon(ic)}${name}</button>`).join("")}</nav>
      <button class="icon-btn" data-act="drawer-close" title="Закрыть панель">${icon("x")}</button></div>
      <div class="drawer-body" id="drawer-body">${body}</div>`;
  }

  function sceneTab(m) {
    const st = m.scene, c = st.clock;
    const date = c.m != null ? `${String(c.d).padStart(2, "0")}.${String(c.m).padStart(2, "0")}${c.y != null ? "." + c.y : ""}` : "";
    const tm = c.min != null ? `${String(Math.floor(c.min / 60)).padStart(2, "0")}:${String(c.min % 60).padStart(2, "0")}` : "";
    const names = [];
    const add = (n) => { if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n); };
    add(m.card.name);
    st.present.forEach(add);
    Object.keys(st.chars).forEach(add);
    const people = names.map((n) => {
      const key = Object.keys(st.chars).find((k) => k.toLowerCase() === n.toLowerCase());
      const ch = key ? st.chars[key] : { wear: [], pose: "", mood: "", rel: 0, relLog: [] };
      const isMain = n.toLowerCase() === m.card.name.toLowerCase();
      return `<div class="panel" data-person="${esc(n)}">
        <div class="who">${R.avatar(isMain ? m.card : { name: n }, 34)}<b>${esc(n)}</b>
          ${st.present.some((p) => p.toLowerCase() === n.toLowerCase()) ? `<span class="tag">в сцене</span>` : `<button class="tool" data-act="sc-enter" data-name="${esc(n)}">в сцену</button>`}</div>
        <div class="field"><span class="label">${icon("shirt", "")} Одежда</span>
          <div class="chips">${ch.wear.map((w) => `<span class="chip"><span>${esc(w)}</span><button data-act="sc-remove" data-name="${esc(n)}" data-item="${esc(w)}" title="Снять">${icon("x")}</button></span>`).join("")}
            <input class="chip-add" data-sc-add="${esc(n)}" placeholder="+ надеть…"></div></div>
        <div class="row"><div class="field"><label>Поза, где</label><input data-sc-field="pose" data-name="${esc(n)}" value="${esc(ch.pose)}" placeholder="сидит у окна"></div>
          <div class="field"><label>Настроение</label><input data-sc-field="mood" data-name="${esc(n)}" value="${esc(ch.mood)}" placeholder="спокойна"></div></div>
        ${isMain ? `<div class="field"><label>Как относится к вам</label>
          <div class="rel"><input type="range" min="-10" max="10" step="1" value="${ch.rel}" data-sc-rel="${esc(n)}" aria-label="Отношение">
          <output id="rel-out">${esc(SC.relWord(ch.rel))} (${ch.rel > 0 ? "+" : ""}${ch.rel})</output>
          ${ch.relLog.length ? `<div class="rel-log">${ch.relLog.slice(-3).reverse().map((r) => esc(`${r.delta > 0 ? "+" : ""}${r.delta} — ${r.why || "без причины"}`)).join("<br>")}</div>` : ""}</div>
          <span class="help">Это рабочая оценка: модель видит её словом и с причиной, а не как приказ.</span></div>` : ""}
      </div>`;
    }).join("");
    return `
      <div class="block"><div class="block-title">Когда и где</div>
        <div class="row"><div class="field"><label>Дата</label><input id="sc-date" value="${esc(date)}" placeholder="14.05"></div>
          <div class="field"><label>Время</label><input id="sc-time" type="time" value="${esc(tm)}"></div>
          <button class="btn btn-sm" data-act="sc-time-set" style="margin-bottom:12px">Задать</button></div>
        <div class="quick">${[["+15m", "+15 мин"], ["+1h", "+1 час"], ["+3h", "+3 часа"], ["+1d", "+1 день"]].map(([v, l]) => `<button class="btn btn-sm btn-ghost" data-act="sc-shift" data-v="${v}">${icon("clock")}${l}</button>`).join("")}</div>
        <div class="field" style="margin-top:12px"><label>Место</label><input data-sc-top="loc" value="${esc(st.loc)}" placeholder="Кафе у кампуса, терраса"></div>
        <div class="field"><label>Погода</label><input data-sc-top="weather" list="weather-list" value="${esc(st.weather)}" placeholder="дождь"><datalist id="weather-list">${WEATHER.map((w) => `<option value="${w}">`).join("")}</datalist></div>
      </div>
      <div class="block"><div class="block-title">Кто рядом <small>${st.present.length || "никого"}</small></div>
        <div class="chips">${st.present.map((p) => `<span class="chip"><span>${esc(p)}</span><button data-act="sc-leave" data-name="${esc(p)}" title="Ушёл из сцены">${icon("x")}</button></span>`).join("")}
          <input class="chip-add" id="sc-enter-new" placeholder="+ добавить…"></div></div>
      <div class="block"><div class="block-title">Персонажи</div>${people}</div>
      <div class="block"><div class="block-title">Как модель ведёт сцену</div>
        <label class="check"><input type="checkbox" data-set="sceneProtocol" ${m.settings.sceneProtocol ? "checked" : ""}><span>Модель сообщает изменения сама<small>В конце ответа она пишет короткую служебную строку; приложение применяет её и прячет из текста.</small></span></label>
        <details><summary class="hint" style="cursor:pointer">Начальная сцена в текстовом виде</summary>
          <div class="field" style="margin-top:8px"><textarea id="scene-init" placeholder="time=14.05 18:00; loc=Кафе; Химэ.wear=белая блузка, юбка">${esc(m.chat.sceneInit || "")}</textarea></div>
          <button class="btn btn-sm" data-act="scene-init-save">Сохранить</button></details>
      </div>`;
  }

  function memoryTab(m) {
    const d = m.expDraft;
    const ev = m.expView || { visible: [], hiddenInChat: 0, legacy: [] };
    const list = ev.visible.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const scopeTag = (r) => (PRP.experience.scopeOf(r) === "branch" ? `<span class="tag" title="Видна только в этой ветке чата">ветка</span>` : `<span class="tag" title="Видна во всех ветках этого чата">весь чат</span>`);
    const valColor = (v) => (v > 0 ? "var(--ok)" : v < 0 ? "var(--danger)" : "var(--line)");
    const valWord = { "-3": "тяжело", "-2": "плохо", "-1": "неприятно", "0": "нейтрально", "1": "приятно", "2": "хорошо", "3": "очень важно" };
    if (d) {
      return `<div class="block"><div class="block-title">${d.id ? "Запись опыта" : "Новая запись опыта"}</div>
        ${d.source && d.source.sceneTime ? `<p class="hint">Время сцены: ${esc(d.source.sceneTime)}${d.source.messageIds && d.source.messageIds.length ? ", из сообщения" : ""}</p>` : ""}
        <div class="field"><label>Что произошло</label><textarea id="x-event" placeholder="Факт, без оценок: «Кира соврал Химэ, что был на работе»">${esc(d.event)}</textarea></div>
        <div class="field"><label>Как ${esc(m.card.name)} это поняла тогда</label><textarea id="x-interp" placeholder="Может быть ошибочным: «Решила, что он её не уважает»">${esc(d.interpretation)}</textarea></div>
        <div class="field"><label>Последствия</label><textarea id="x-cons" placeholder="Обещания, долги, раны: «Обещала больше не спрашивать»">${esc(d.consequences)}</textarea></div>
        <div class="field"><label>Насколько это было хорошо или плохо</label>
          <div class="pick" role="group">${[-3, -2, -1, 0, 1, 2, 3].map((v) => `<button data-act="x-val" data-v="${v}" class="${+d.valence === v ? "on" : ""}" title="${valWord[v]}">${v > 0 ? "+" + v : v}</button>`).join("")}</div>
          <span class="help" id="x-val-word">${valWord[d.valence]}</span></div>
        <div class="field"><label>Насколько важно</label>
          <div class="pick" role="group">${[1, 2, 3].map((v) => `<button data-act="x-weight" data-v="${v}" class="${+d.weight === v ? "on" : ""}">${["мелочь", "заметно", "важно"][v - 1]}</button>`).join("")}</div></div>
        <div class="field"><label>Темы — по ним опыт вспоминается к месту</label>
          <div class="chips" id="x-domains">${(d.domains || []).map((t) => `<span class="chip"><span>${esc(t)}</span><button data-act="x-domain-del" data-v="${esc(t)}">${icon("x")}</button></span>`).join("")}
          <input class="chip-add" id="x-domain-add" placeholder="+ деньги, доверие…"></div></div>
        <label class="check"><input type="checkbox" id="x-about-user" ${(d.about || []).includes("user") ? "checked" : ""}><span>Это про ${esc(m.persona.name)}</span></label>
        <div class="field"><label>Статус</label><select id="x-status">${[["active", "действует"], ["superseded", "пересмотрено — персонаж понял иначе"], ["archived", "в архиве"]].map(([v, l]) => `<option value="${v}" ${d.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="row"><button class="btn btn-primary btn-sm" data-act="exp-save">Сохранить</button><button class="btn btn-sm btn-ghost" data-act="exp-cancel">Отмена</button>
          ${d.id ? `<span style="flex:1"></span><button class="btn btn-danger btn-sm" data-act="exp-del">Удалить</button>` : ""}</div></div>`;
    }
    return `<div class="block"><div class="block-title">Опыт ${esc(m.card.name)} <small>${list.length}</small></div>
      <p class="hint">Пережитое в этом чате — в этом мире. Другие чаты с ${esc(m.card.name)} его не видят. Событие из сообщения видно только в своей ветке; добавленное вручную — во всех ветках чата.${ev.hiddenInChat ? ` В других ветках этого чата ещё ${ev.hiddenInChat} ${R.plural(ev.hiddenInChat, "запись", "записи", "записей")}.` : ""}</p>
      <button class="btn btn-sm" data-act="exp-new">${icon("plus")}Добавить событие</button></div>
      ${list.map((r) => `<div class="memo ${r.status !== "active" ? "off" : ""}" data-act="exp-edit" data-id="${r.id}" role="button" tabindex="0">
        <span class="memo-bar" style="background:${valColor(r.valence)}"></span>
        <div class="ev">${esc(r.event || "Без описания")}</div>
        ${r.interpretation ? `<div class="in">${esc(r.interpretation)}</div>` : ""}
        <div class="mt"><span class="tag ${r.valence > 0 ? "pos" : r.valence < 0 ? "neg" : ""}">${valWord[r.valence]}</span>
          ${(r.domains || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
          ${r.status === "superseded" ? `<span class="tag">пересмотрено</span>` : ""}${r.source && r.source.sceneTime ? `<span class="tag">${esc(r.source.sceneTime)}</span>` : ""}${scopeTag(r)}</div>
      </div>`).join("") || `<p class="empty-note">Пока пусто. Нажмите «В опыт» под важным сообщением.</p>`}
      ${ev.legacy.length ? `<div class="block legacy-block"><div class="block-title">Без привязки к чату <small>${ev.legacy.length}</small></div>
        <p class="hint">Старые записи, для которых нельзя точно сказать, в каком чате они случились. В контекст они не попадают. Привяжите к этому чату те, что относятся к нему.</p>
        ${ev.legacy.map((r) => `<div class="memo off"><span class="memo-bar" style="background:${valColor(r.valence)}"></span>
          <div class="ev">${esc(r.event || "Без описания")}</div>${r.interpretation ? `<div class="in">${esc(r.interpretation)}</div>` : ""}
          <div class="mt"><span class="tag">не привязана</span><span style="flex:1"></span><button class="btn btn-sm" data-act="exp-assign" data-id="${r.id}">Привязать к этому чату</button></div></div>`).join("")}</div>` : ""}`;
  }

  const TRUNC = { history: "старая история", examples: "примеры речи", lore: "лорбук", experience: "опыт", postHistory: "указания после истории", persona: "описание собеседника", "card.scenario": "сценарий", authorSys: "указания автора", "card.description": "описание" };
  const LAYERS = [["frame", "Рамка", "#7fd1ff"], ["author", "Указания автора", "#c9a2ff"], ["card", "Карточка", "#b79cff"], ["memory", "Опыт", "#ff9ec7"], ["scene", "Сцена", "#ffd08a"], ["lore", "Лорбук", "#8ff0c3"], ["history", "История", "#8d86a6"], ["post", "Протокол", "#5c5670"]];
  function prismTab(m) {
    const p = m.lastPrism;
    if (!p) return `<p class="hint">Здесь видно, что получает модель: карточку как склонности, опыт как свидетельства, сцену как факты.</p>
      <button class="btn btn-sm" data-act="prism-preview">${icon("prism")}Собрать для следующего хода</button>`;
    const r = p.report;
    const total = Object.values(r.layers).reduce((a, b) => a + b, 0) || 1;
    return `<div class="block"><div class="block-title">Контекст <small>${r.used} из ${r.budget} токенов, оценка</small></div>
        <div class="bar-meter">${LAYERS.map(([k, , c]) => `<i style="width:${(r.layers[k] / Math.max(total, r.budget)) * 100}%;background:${c}" title="${k}"></i>`).join("")}</div>
        <div class="legend">${LAYERS.filter(([k]) => r.layers[k]).map(([k, n, c]) => `<span style="--c:${c}">${n} ${r.layers[k]}</span>`).join("")}</div></div>
      ${r.overflow ? `<div class="block err-block">${icon("alert")}<div><b>Не помещается.</b> Даже после всех сокращений нужно ${r.used} из ${r.budget} токенов: рамка, сцена и последние сообщения больше, чем позволяет модель. Запрос не будет отправлен.</div></div>` : ""}
      <div class="block"><dl class="kv">
        <dt>Бюджет</dt><dd>${r.used} из ${r.budget} — ${r.fits ? "помещается" : "<b>не помещается</b>"}</dd>
        <dt>История</dt><dd>${r.historyKept} из ${r.historyTotal} сообщений</dd>
        <dt>Опыт</dt><dd>${r.experienceKept} ${R.plural(r.experienceKept, "запись", "записи", "записей")}${r.experienceDropped ? `, не поместилось ${r.experienceDropped}` : ""}${r.experienceVisible != null ? `; видно в ветке ${r.experienceVisible}` : ""}</dd>
        ${r.legacyUnscoped ? `<dt>Без привязки</dt><dd>${r.legacyUnscoped} — в контекст не идут</dd>` : ""}
        <dt>Лорбук</dt><dd>${r.loreKept} из ${r.loreMatched} сработавших${r.loreDropped ? `, не поместилось ${r.loreDropped}` : ""}</dd>
        <dt>Примеры речи</dt><dd>${r.examples ? "вошли" : "не вошли"}</dd>
        ${r.postHistoryDisabled ? `<dt>После истории</dt><dd>указания автора выключены в настройках</dd>` : ""}
        ${(r.truncated || []).length ? `<dt>Сокращено</dt><dd>${r.truncated.map((t) => esc(TRUNC[t.layer] || t.layer) + (t.dropped ? ` −${t.dropped}` : "") + (t.detail && t.layer === "card.description" ? ` (${esc(t.detail)})` : "")).join(", ")}</dd>` : ""}
        </dl></div>
      ${(r.expDebug || []).length ? `<details class="block exp-debug"><summary>Отбор опыта</summary>
        <table><thead><tr><th>Событие</th><th title="совпадение по темам">тема</th><th title="о присутствующих">участ.</th><th title="важность">важн.</th><th title="ранг свежести, только при равенстве">свеж.</th><th>итог</th></tr></thead><tbody>
        ${r.expDebug.map((x) => `<tr class="${x.selected ? "sel" : ""}"><td>${esc((x.event || "").slice(0, 60))}</td><td>${x.topic}</td><td>${x.participant}</td><td>${x.weight}</td><td>${x.recencyRank}</td><td>${x.selected ? "в контексте" : !x.visible ? esc(x.reason) : !x.active ? "не действует" : "не выбрано"}</td></tr>`).join("")}
        </tbody></table></details>` : ""}
      <div class="block"><div class="block-title">Что ушло в модель <button class="btn btn-sm btn-ghost" data-act="prism-preview">${icon("regen")}Обновить</button></div>
        <div class="code">${p.messages.map((x) => `<span class="role">${esc(x.role)}</span>\n${esc(x.content)}`).join("\n\n")}</div></div>`;
  }

  Object.assign((PRP.views = PRP.views || {}), { drawer });
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/views/settings.js */
/* Prism RP — окно настроек: модели, генерация, изображения, персона, вид, данные. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Настройки ────────────────────────────────────────────────────── */
  function settingsModal(m, section) {
    const nav = [["models", "Модели", "cpu"], ["gen", "Генерация", "sliders"], ["images", "Изображения", "image"], ["persona", "Вы", "user"], ["look", "Внешний вид", "palette"], ["data", "Данные", "data"]];
    const s = m.settings;
    let body = "";
    if (section === "models") {
      const editing = m.settings.providers.find((p) => p.id === m.editProviderId);
      body = `<h3>Модели</h3><p class="lead">Какая модель пишет за персонажей. Можно держать несколько и переключать прямо в чате.</p>
        ${m.providers.map((p) => `<div class="prov ${m.provider && m.provider.id === p.id ? "on" : ""}" data-act="pick-provider" data-id="${p.id}" role="radio" tabindex="0" aria-checked="${m.provider && m.provider.id === p.id}">
          <span class="radio"></span><div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="ds">${esc(p.kind === "perchance" ? "Бесплатная модель Perchance, ключ не нужен" : `${p.baseUrl || "адрес не задан"}${p.model ? " · " + p.model : ""}`)}</div></div>
          ${p.kind === "openai" ? `<button class="btn btn-sm btn-ghost" data-act="prov-edit" data-id="${p.id}">Изменить</button>` : ""}</div>`).join("")}
        ${!m.providers.some((p) => p.kind === "perchance") ? `<p class="hint">Бесплатная модель Perchance появится здесь, когда приложение запущено как генератор на Perchance.</p>` : ""}
        ${editing ? providerForm(editing) : `<div class="block-title" style="margin-top:20px">Подключить API</div>
          <div class="presets">${OA.PRESETS.map((pr) => `<button class="preset" data-act="prov-add" data-preset="${pr.id}"><b>${esc(pr.name)}</b><small>${pr.local ? "на этом компьютере" : pr.id === "custom" ? "любой совместимый" : "облачный API"}</small></button>`).join("")}</div>`}`;
    } else if (section === "gen") {
      const sm = s.sampler;
      const num = (k, label, step, help) => `<div class="field"><label>${label}</label><input type="number" step="${step}" data-sampler="${k}" value="${sm[k] != null ? sm[k] : ""}">${help ? `<span class="help">${help}</span>` : ""}</div>`;
      body = `<h3>Генерация</h3><p class="lead">Стиль, длина ответа и объём памяти. Для бесплатной модели Perchance параметры сэмплирования не применяются.</p>
        <div class="presets">${SAMPLER_PRESETS.map((p) => `<button class="preset ${s.samplerPreset === p.id ? "on" : ""}" data-act="pick-preset" data-id="${p.id}"><b>${p.name}</b><small>${p.hint}</small></button>`).join("")}
          <button class="preset ${s.samplerPreset === "custom" ? "on" : ""}" data-act="pick-preset" data-id="custom"><b>Свой</b><small>значения ниже</small></button></div>
        <div class="row">${num("temperature", "Температура", "0.05", "выше — смелее")}${num("top_p", "Top P", "0.01")}${num("min_p", "Min P", "0.01")}</div>
        <div class="row">${num("top_k", "Top K", "1", "0 — выключено")}${num("repetition_penalty", "Штраф за повторы", "0.01")}${num("max_tokens", "Длина ответа", "50", "в токенах")}</div>
        <div class="row"><div class="field"><label>Объём контекста</label><input type="number" step="512" data-set-num="contextTokens" value="${s.contextTokens}"><span class="help">в токенах; для Perchance берётся из плагина</span></div>
          <div class="field"><label>Записей опыта за ход</label><input type="number" min="0" max="30" data-set-num="expLimit" value="${s.expLimit}"></div></div>
        <label class="check"><input type="checkbox" data-set="autoContext" ${s.autoContext ? "checked" : ""}><span>Брать объём контекста из плагина Perchance</span></label>
        <label class="check"><input type="checkbox" data-set="singleSystem" ${s.singleSystem ? "checked" : ""}><span>Одно системное сообщение<small>Для локальных моделей со строгими шаблонами чата, которые ломаются от нескольких system.</small></span></label>
        <label class="check"><input type="checkbox" data-set="noPostHistory" ${s.noPostHistory ? "checked" : ""}><span>Не передавать инструкции после истории<small>Касается только указаний автора карточки (post_history_instructions), не самого характера. По умолчанию выключено — для совместимости с карточками.</small></span></label>
        <label class="check"><input type="checkbox" data-set="sceneProtocol" ${s.sceneProtocol ? "checked" : ""}><span>Модель сообщает изменения сцены<small>Время, место, одежда, настроение — короткой служебной строкой, которую приложение прячет.</small></span></label>
        <div class="block-title" style="margin-top:20px">Ассистент</div>
        <div class="field"><label for="assist-sys">Инструкция ассистента</label><textarea id="assist-sys" rows="5" data-set-text="assistSystem" placeholder="${esc(PRP.assist.SYSTEM)}">${esc(s.assistSystem || "")}</textarea>
          <span class="help">Как модель ведёт себя в разделе «Ассистент». Пусто — встроенная инструкция (видна серым).</span></div>`;
    } else if (section === "images") {
      body = imagesSettings(m);
    } else if (section === "persona") {
      const pi = m.persona.image || {};
      body = `<h3>Вы</h3><p class="lead">Как персонажи вас видят. Имя подставляется вместо {{user}} в карточках.</p>
        <div class="field"><label>Имя</label><input id="p-name" value="${esc(m.persona.name)}"></div>
        <div class="field"><label>Описание</label><textarea id="p-desc" rows="5" placeholder="Внешность, характер, кем вы приходитесь персонажам">${esc(m.persona.description)}</textarea></div>
        <div class="block-title" style="margin-top:20px">Вы на картинках</div>
        <div class="field"><label>Как рисовать сцену</label><select id="p-view"><option value="third" ${pi.view !== "first" ? "selected" : ""}>Со стороны — вы тоже в кадре</option><option value="first" ${pi.view === "first" ? "selected" : ""}>От первого лица — камера это ваши глаза (POV)</option></select></div>
        <div class="field"><label>Ваша внешность для картинок</label><textarea id="p-appearance" rows="4" placeholder="base: 1boy, short black hair, grey eyes&#10;костюм | suit: black suit, white shirt">${esc(pi.appearance || "")}</textarea>
          <span class="help">Теги, которые добавляются, когда вы в кадре. Строка base: — всегда; «ключ: теги» — когда ключ упомянут в сцене или так зовут присутствующего. Можно указать свою LoRA: &lt;lora:имя:0.8&gt;.</span></div>
        <div class="field"><label>Видимые части тела в POV</label><input id="p-povtags" value="${esc(pi.povTags || "")}" placeholder="pov hands"><span class="help">Только если они должны быть в кадре.</span></div>
        <div class="modal-foot"><button class="btn btn-primary" data-act="persona-save">Сохранить</button></div>`;
    } else if (section === "look") {
      body = `<h3>Внешний вид</h3><p class="lead">Тема и размер текста сцены.</p>
        <div class="themes">${THEMES.map((t) => `<button class="theme ${s.theme === t.id ? "on" : ""}" data-act="theme" data-id="${t.id}">
          <div class="sw" style="background:${t.c[0]}"><i style="width:36%;background:${t.c[1]}"></i><i style="width:18%;background:${t.c[2]}"></i><i style="width:12%;background:${t.c[3]}"></i></div><div class="nm">${t.name}</div></button>`).join("")}</div>
        <div class="field" style="margin-top:18px"><label>Размер текста сцены: <span id="fs-out">${s.proseSize}</span> px</label><input type="range" min="14" max="22" step="1" data-set-range="proseSize" value="${s.proseSize}" style="accent-color:var(--accent)"></div>`;
    } else {
      body = `<h3>Данные</h3><p class="lead">Всё хранится только в этом браузере. Бэкап переносит персонажей, чаты, опыт и настройки — в том числе на другую платформу.</p>
        <div class="row"><button class="btn" data-act="backup">${icon("download")}Скачать бэкап</button><button class="btn" data-act="restore">${icon("upload")}Загрузить бэкап</button></div>
        <p class="hint" style="margin-top:14px">${m.stats}</p>`;
    }
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Настройки">
      <div class="modal-head"><h2>Настройки</h2><button class="icon-btn" data-act="modal-close" title="Закрыть">${icon("x")}</button></div>
      <nav class="modal-nav">${nav.map(([id, n, ic]) => `<button class="rail-item ${section === id ? "active" : ""}" data-act="settings" data-section="${id}">${icon(ic)}${n}</button>`).join("")}</nav>
      <div class="modal-body">${body}</div></div></div>`;
  }

  function imagesSettings(m) {
    const c = m.settings.images, lists = m.imgLists || {};
    const backs = [["perchance", "Perchance", "бесплатно, без настроек", m.perchanceImages], ["a1111", "Forge / A1111 / ReForge", "ваш локальный сервер Stable Diffusion", true], ["openai", "OpenAI-совместимый API", "облачные сервисы изображений", true]];
    const dl = (id, arr) => `<datalist id="${id}">${(arr || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`;
    const inp = (k, label, ph, list, help, type) => `<div class="field"><label>${label}</label><input data-imgcfg="${k}" ${type ? `type="${type}"` : ""} ${list ? `list="${list}"` : ""} value="${esc(c[k] != null ? c[k] : "")}" placeholder="${esc(ph || "")}">${help ? `<span class="help">${help}</span>` : ""}</div>`;
    const chk = (k, label, help) => `<label class="check"><input type="checkbox" data-img-check="${k}" ${c[k] ? "checked" : ""}><span>${label}${help ? `<small>${help}</small>` : ""}</span></label>`;
    let conn = "";
    if (c.backend === "a1111") {
      conn = `${inp("url", "Адрес сервера", "http://127.0.0.1:7860", "", "Forge/A1111 запускается с флагами --api и --cors-allow-origins=" + esc(m.origin))}
        <div class="row" style="align-items:center;margin:-4px 0 12px"><button class="btn btn-sm" data-act="img-lists">${icon("regen")}Проверить и загрузить списки</button><span class="hint" style="margin:0">${lists.at ? `Модели: ${(lists.models || []).length}, LoRA: ${(lists.loras || []).length}` : "модели, VAE, сэмплеры, LoRA с сервера"}</span></div>
        <div class="row">${inp("model", "Модель (checkpoint)", "как на сервере", "dl-models")}${inp("vae", "VAE", "Automatic", "dl-vaes")}</div>
        <div class="row">${inp("sampler", "Сэмплер", "Euler a", "dl-samplers")}${inp("scheduler", "Планировщик", "", "dl-schedulers")}</div>
        <div class="row">${inp("steps", "Шаги", "28", "", "", "number")}${inp("cfg", "CFG", "5.5", "", "", "number")}${inp("seed", "Seed", "случайный", "", "пусто — каждый раз новый")}</div>
        <div class="row"><div class="field"><label>Размер</label><select data-img-sel="sizeMode"><option value="auto" ${c.sizeMode !== "fixed" ? "selected" : ""}>По пропорциям сцены</option><option value="fixed" ${c.sizeMode === "fixed" ? "selected" : ""}>Всегда один</option></select></div>
          ${c.sizeMode === "fixed" ? inp("fixedSize", "Размер", "1024x1024") : inp("maxSide", "Макс. сторона", "1216", "", "", "number")}</div>
        ${chk("hires", "Hires fix — второй проход", "Заметно улучшает лица и руки на SDXL-моделях, но рисует дольше.")}
        ${c.hires ? `<div class="row">${inp("hiresScale", "Масштаб", "1.5", "", "", "number")}${inp("hiresUpscaler", "Апскейлер", "R-ESRGAN 4x+ Anime6B", "dl-upscalers")}${inp("hiresDenoise", "Denoise", "0.4", "", "", "number")}</div>` : ""}
        ${dl("dl-models", lists.models)}${dl("dl-vaes", lists.vaes)}${dl("dl-samplers", lists.samplers)}${dl("dl-schedulers", lists.schedulers)}${dl("dl-upscalers", lists.upscalers)}`;
    } else if (c.backend === "openai") {
      conn = `${inp("url", "Адрес API", "https://api.example.com/v1")}
        <div class="field"><label>Ключ API</label><input data-imgcfg="key" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(c.key || "")}"></div>
        ${inp("model", "Модель", "")}`;
    } else if (!m.perchanceImages) {
      conn = `<p class="hint">Генерация Perchance доступна, когда приложение запущено как генератор на Perchance. Здесь выберите локальный сервер или API.</p>`;
    }
    return `<h3>Изображения</h3><p class="lead">Чем рисовать и как собирается промпт. Персональные настройки — LoRA, триггеры, гардероб — задаются в карточке персонажа.</p>
      ${chk("enabled", "Рисовать картинки")}
      <div class="block-title" style="margin-top:14px">Чем рисовать</div>
      ${backs.map(([id, n, d, ok]) => `<div class="prov ${c.backend === id ? "on" : ""} ${ok ? "" : "dim"}" data-act="img-backend" data-id="${id}" role="radio" tabindex="0" aria-checked="${c.backend === id}"><span class="radio"></span><div><div class="nm">${n}</div><div class="ds">${d}${ok ? "" : " — только на Perchance"}</div></div><span></span></div>`).join("")}
      ${conn}
      <div class="block-title" style="margin-top:20px">Промпт</div>
      <div class="row"><div class="field"><label>Формат</label><select data-img-sel="format"><option value="tags" ${c.format !== "description" ? "selected" : ""}>Теги danbooru (аниме-модели, Pony, Illustrious)</option><option value="description" ${c.format === "description" ? "selected" : ""}>Описание словами (SDXL base, Flux)</option></select></div></div>
      ${chk("translate", "Переводить сцену на английский", "Модели изображений не понимают русский: сцену перепишет текстовая модель, перевод кэшируется.")}
      <div class="field"><label>Закреплённый блок</label><textarea data-imgcfg="fixedPrompt" rows="2" placeholder="masterpiece, best quality, amazing quality, absurdres">${esc(c.fixedPrompt || "")}</textarea><span class="help">Одинаковые теги качества и стиля в каждой картинке. Если блок задан, модель свои теги качества не пишет.</span></div>
      <div class="field"><label>Куда ставить блок</label><select data-img-sel="promptMode">${[["append", "в конец"], ["prepend", "в начало"], ["replace", "только блок, без сцены"], ["off", "не использовать"]].map(([v, l]) => `<option value="${v}" ${c.promptMode === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label>Негатив</label><textarea data-imgcfg="negative" rows="2" placeholder="lowres, bad anatomy, bad hands, extra digits">${esc(c.negative || "")}</textarea></div>
      ${c.backend === "a1111" ? `<p class="hint">LoRA задаются в карточке каждого персонажа: «Редактировать карточку → Изображения». Так они переезжают вместе с карточкой и не попадают в чужие картинки.</p>` : ""}
      <div class="block-title" style="margin-top:20px">Когда рисовать</div>
      ${chk("modelDraws", "Модель сама решает, когда показать картинку", "Она пишет короткую служебную строку [draw: …]; приложение её прячет и рисует.")}
      ${chk("autoDraw", "Рисовать сразу", "Иначе под сообщением появится кнопка «Нарисовать».")}`;
  }

  function providerForm(p) {
    return `<div class="panel" style="margin-top:16px"><div class="block-title">${esc(p.name)}</div>
      <div class="field"><label>Название</label><input id="prov-name" value="${esc(p.name)}"></div>
      <div class="field"><label>Адрес API</label><input id="prov-url" value="${esc(p.baseUrl)}" placeholder="https://…/v1"><span class="help">Обычно заканчивается на /v1</span></div>
      <div class="field"><label>Ключ API</label><input id="prov-key" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(p.apiKey || "")}" placeholder="для локальных серверов не нужен"></div>
      <div class="field"><label>Модель</label><div class="row" style="align-items:center"><input id="prov-model" list="prov-models" value="${esc(p.model || "")}" style="flex:1"><button class="btn btn-sm" data-act="prov-models">Загрузить список</button></div>
        <datalist id="prov-models">${(p.models || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>${p.models ? `<span class="help">Доступно моделей: ${p.models.length}</span>` : ""}</div>
      <label class="check"><input type="checkbox" id="prov-ext" ${p.extendedSamplers ? "checked" : ""}><span>Расширенные параметры<small>min_p, top_k, штраф за повторы — для локальных серверов и OpenRouter</small></span></label>
      <div class="row"><button class="btn btn-primary btn-sm" data-act="prov-save">Сохранить</button><button class="btn btn-sm btn-ghost" data-act="prov-close">Готово</button>
        <span style="flex:1"></span><button class="btn btn-danger btn-sm" data-act="prov-del">Удалить</button></div>
      <p class="hint" style="margin:10px 0 0">Ключ хранится только в этом браузере.</p></div>`;
  }


  Object.assign((PRP.views = PRP.views || {}), { settingsModal });
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/views/card-editor.js */
/* Prism RP — редактор персонажа (окно с разделами по Character Card V2/V3). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Редактор персонажа ───────────────────────────────────────────── */
  // Поля и их порядок — как в Character Card V2/V3 и SillyTavern. Рядом с подписью
  // мелко показан ключ спецификации, чтобы было видно, куда поле попадёт при экспорте.
  function cardModal(m, d, section) {
    const nav = [["main", "Основное", "card"], ["greet", "Приветствия", "bubble"], ["prompts", "Промпты", "edit"], ["lore", "Лорбук", "book"], ["images", "Изображения", "image"], ["meta", "Автор и файл", "download"]];
    const lab = (label, key) => `${label}${key ? ` <span class="spec-key">${key}</span>` : ""}`;
    const f = (id, label, key, value, rows, help, ph) => `<div class="field"><label for="${id}">${lab(label, key)}</label>${rows
      ? `<textarea id="${id}" rows="${rows}" data-cf="${id}" placeholder="${esc(ph || "")}">${esc(value || "")}</textarea>` : `<input id="${id}" data-cf="${id}" value="${esc(value || "")}" placeholder="${esc(ph || "")}">`}${help ? `<span class="help">${help}</span>` : ""}</div>`;
    let body = "";
    if (section === "main") {
      body = `<div class="card-edit"><div><div class="portrait" style="${d.avatar ? "" : R.artBg(d.name)}">${d.avatar ? `<img src="${d.avatar}" alt="">` : esc((d.name || "?").charAt(0).toUpperCase())}
          <button class="btn btn-sm chg" data-act="avatar-pick">${icon("upload")}Портрет</button></div></div>
        <div>${f("cf-name", "Имя", "name", d.name)}
          ${f("cf-desc", "Описание", "description", d.description, 9, "Внешность, характер, прошлое — всё, что постоянно. Prism подаёт это модели как склонности, а не как команды.", "Студентка второго курса, ревнивая, но отходчивая…")}
          ${f("cf-pers", "Краткое описание личности", "personality", d.personality, 2, "Несколько черт одной строкой.")}
          ${f("cf-scen", "Сценарий", "scenario", d.scenario, 3, "Обстоятельства: где и почему всё происходит.")}
          ${f("cf-tags", "Теги", "tags", (d.tags || []).join(", "), 0, "Через запятую.")}</div></div>`;
    } else if (section === "greet") {
      const alts = d.altGreetings || [];
      body = `${f("cf-first", "Первое сообщение", "first_mes", d.firstMes, 7, "С него начинается новый чат. В конце можно добавить строку [scene: …] с начальным местом и одеждой.")}
        <div class="block-title" style="margin-top:18px">${lab("Альтернативные приветствия", "alternate_greetings")}</div>
        <p class="hint" style="margin-top:0">В новом чате их можно листать стрелками под первым сообщением.</p>
        ${alts.map((g, i) => `<div class="field alt-greet"><label for="cf-alt-${i}">Приветствие ${i + 2}<button class="icon-btn" data-act="alt-del" data-i="${i}" title="Убрать">${icon("x")}</button></label><textarea id="cf-alt-${i}" rows="5" data-alt="${i}">${esc(g)}</textarea></div>`).join("")}
        <button class="btn btn-sm" data-act="alt-add">${icon("plus")}Добавить приветствие</button>`;
    } else if (section === "prompts") {
      body = `${f("cf-ex", "Примеры диалогов", "mes_example", d.mesExample, 8, "Как персонаж говорит. Каждый пример начинается с &lt;START&gt;, реплики — {{user}}: и {{char}}:", "<START>\n{{user}}: Привет.\n{{char}}: …")}
        ${f("cf-sys", "Системный промпт", "system_prompt", d.systemPrompt, 4, "Заменяет общий системный промпт. {{original}} подставит общий. Пусто — используется общий.")}
        ${f("cf-post", "Инструкции после истории", "post_history_instructions", d.postHistory, 3, "Идут в конец контекста, ближе всего к ответу (jailbreak / UJB в других приложениях).")}`;
    } else if (section === "lore") {
      const posSel = (i, v) => `<select data-lore="${i}" data-k="position"><option value="before_char" ${v === "before_char" ? "selected" : ""}>Перед описанием персонажа</option><option value="after_char" ${v !== "before_char" ? "selected" : ""}>После описания персонажа</option></select>`;
      body = `<p class="lead">${lab("Лорбук персонажа", "character_book")}<br>Сведения о мире подмешиваются в контекст, когда в последних сообщениях звучат ключевые слова.</p>
        ${(d.lore || []).map((e, i) => `<div class="lore">
          <div class="row"><div class="field" style="flex:2"><label>${lab("Название", "comment")}</label><input data-lore="${i}" data-k="comment" value="${esc(e.comment || "")}" placeholder="Кафе «Луна»"></div>
            <div class="field" style="flex:1;max-width:170px"><label>${lab("Порядок", "insertion_order")}</label><input type="number" data-lore="${i}" data-k="insertion_order" value="${esc(String(e.insertion_order != null ? e.insertion_order : i))}"></div></div>
          <div class="field"><label>${lab("Ключевые слова", "keys")}</label><input data-lore="${i}" data-k="keys" value="${esc((e.keys || []).join(", "))}" placeholder="кафе, Луна"></div>
          ${e.selective ? `<div class="field"><label>${lab("Дополнительные ключи", "secondary_keys")}</label><input data-lore="${i}" data-k="secondary_keys" value="${esc((e.secondary_keys || []).join(", "))}" placeholder="вечер, свидание"><span class="help">Запись сработает, только если звучит и основной, и хотя бы один дополнительный ключ.</span></div>` : ""}
          <div class="field"><label>${lab("Содержание", "content")}</label><textarea data-lore="${i}" data-k="content" rows="3">${esc(e.content || "")}</textarea></div>
          <div class="field"><label>${lab("Позиция", "position")}</label>${posSel(i, e.position)}</div>
          <div class="checks"><label class="check"><input type="checkbox" data-lore="${i}" data-k="enabled" ${e.enabled !== false ? "checked" : ""}><span>Включено</span></label>
          <label class="check"><input type="checkbox" data-lore="${i}" data-k="constant" ${e.constant ? "checked" : ""}><span>Постоянная — всегда в контексте</span></label>
          <label class="check"><input type="checkbox" data-lore="${i}" data-k="selective" ${e.selective ? "checked" : ""}><span>Выборочная — нужны доп. ключи</span></label>
          <label class="check"><input type="checkbox" data-lore="${i}" data-k="case_sensitive" ${e.case_sensitive ? "checked" : ""}><span>С учётом регистра</span></label></div>
          <div class="row" style="justify-content:flex-end"><button class="btn btn-sm btn-ghost" data-act="lore-del" data-i="${i}">${icon("trash")}Удалить запись</button></div></div>`).join("") || `<p class="empty-note">Лорбук пуст.</p>`}
        <button class="btn btn-sm" data-act="lore-add">${icon("plus")}Добавить запись</button>`;
    } else if (section === "images") {
      const im = d.image || {};
      const fi = (k, label, rows, help, ph) => `<div class="field"><label>${label}</label>${rows ? `<textarea data-ci="${k}" rows="${rows}" placeholder="${esc(ph || "")}">${esc(im[k] || "")}</textarea>` : `<input data-ci="${k}" value="${esc(im[k] != null ? im[k] : "")}" placeholder="${esc(ph || "")}">`}${help ? `<span class="help">${help}</span>` : ""}</div>`;
      body = `<p class="lead">Как рисовать ${esc(d.name || "персонажа")}. Триггер, негатив и LoRA персонажа применяются, только когда он в кадре.</p>
        ${fi("trigger", "Триггер — кто это", 2, "Имя персонажа в модели и 2–4 главные приметы. Идёт в каждую картинку с ним.", "orihime inoue, long orange hair, brown eyes, hair ornament")}
        ${fi("aliases", "Другие имена в сценах", 0, "Через запятую: как модель может назвать персонажа в [draw:] (латиницей).", "orihime, hime")}
        ${fi("styleTrigger", "Стилевые теги", 1, "Добавляются, только если сцена их упоминает.")}
        ${fi("negative", "Негатив персонажа", 1, "", "short hair, flat chest")}
        <div class="field"><label>LoRA персонажа</label>${loraRows("card-lora", im.loras || [])}<span class="help">Вес обычно 0.6–1. Применяются, только когда персонаж в кадре. Стилевые LoRA тоже ставьте сюда — у каждого персонажа свой набор.</span><datalist id="dl-loras">${((m.imgLists || {}).loras || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div>
        ${fi("seed", "Закреплённый seed", 0, "Пусто — случайный. Кнопкой у картинки можно закрепить удачный.")}
        ${fi("look", "Внешность", 3, "base: — всегда; «ключ: теги» — когда ключ есть в сцене (улыбка: gentle smile).", "base: brown eyes, large breasts\nочки | glasses: round glasses")}
        ${fi("wardrobe", "Гардероб", 5, "Образ подбирается по одежде из панели сцены: «худи | hoodie: теги». Теги идут в промпт без перевода — как их знает ваша LoRA. Если сцена одевает иначе, образ не добавляется.", "школьная форма | school uniform: serafuku, red neckerchief, pleated skirt\nхуди | hoodie: grey hoodie, denim shorts, <lora:outfit:0.7>")}
        ${fi("nsfw", "Откровенные модификаторы", 3, "Срабатывают только по тексту самой сцены, никогда по одежде из трекера.", "голая | nude: nude, nipples, navel")}`;
    } else {
      body = `${f("cf-creator", "Создатель", "creator", d.creator, 0, "", "ваш ник")}
        ${f("cf-version", "Версия персонажа", "character_version", d.version, 0, "", "1.0")}
        ${f("cf-notes", "Заметки создателя", "creator_notes", d.creatorNotes, 4, "Для людей, не для модели: как играть, рекомендованные настройки. В контекст не идут.")}
        <div class="block-title" style="margin-top:24px">Файл карточки</div><p class="hint">Экспорт в Character Card V2/V3 — открывается в SillyTavern, RisuAI, Chub и других. Поля, которых нет в редакторе, сохраняются как были. Настройки изображений и LoRA едут внутри карточки (extensions.prism_rp).</p>
        <div class="row"><button class="btn" data-act="card-png">${icon("download")}PNG с портретом</button><button class="btn" data-act="card-json">${icon("download")}JSON</button></div>
        ${d.id ? `<div class="block-title" style="margin-top:28px">Удаление</div><p class="hint">Удалит персонажа вместе со всеми чатами и опытом.</p>
        <button class="btn btn-danger" data-act="card-del">${icon("trash")}Удалить ${esc(d.name)}</button>` : ""}`;
    }
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Персонаж">
      <div class="modal-head"><h2>${esc(d.name || "Новый персонаж")}</h2>
        <button class="btn btn-primary btn-sm" data-act="card-save">${icon("check")}Сохранить</button>
        <button class="icon-btn" data-act="modal-close" title="Закрыть без сохранения">${icon("x")}</button></div>
      <nav class="modal-nav">${nav.map(([id, n, ic]) => `<button class="rail-item ${section === id ? "active" : ""}" data-act="card-section" data-section="${id}">${icon(ic)}${n}</button>`).join("")}</nav>
      <div class="modal-body">${body}</div></div></div>`;
  }
  Object.assign((PRP.views = PRP.views || {}), { cardModal });
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/views/assist.js */
/* Prism RP — экран ассистента (разговор с моделью вне игры) и его поповеры. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Ассистент: разговор с моделью вне игры ───────────────────────── */
  function assist(m) {
    const a = m.assist;
    const AS = PRP.assist;
    const cd = m.assistCard, ch = m.assistChat;
    const ctxLabel = cd ? `${esc(cd.name)}${ch ? " + чат" : ""}` : "Без персонажа";
    const head = `<header class="chat-head assist-head">
      <button class="icon-btn only-narrow" data-act="rail" title="Меню">${icon("menu")}</button>
      <div class="assist-mark">${icon("assist")}</div>
      <div class="head-who"><div class="head-name">Ассистент</div><span class="head-scene">${esc(a.messages.length ? a.title : "Разговор с моделью вне игры")}</span></div>
      <div class="head-tools">
        <button class="pill" data-act="assist-ctx" title="Что ассистент видит: карточку персонажа и выдержку из чата">${cd ? R.avatar(cd, 18) : icon("card")}<span>${ctxLabel}</span></button>
        <button class="icon-btn" data-act="assist-list" title="Все разговоры">${icon("clock")}</button>
        <button class="icon-btn" data-act="assist-new" title="Новый разговор">${icon("plus")}</button>
        ${a.messages.length ? `<button class="icon-btn" data-act="assist-del" title="Удалить разговор">${icon("trash")}</button>` : ""}
      </div></header>`;
    const empty = !a.messages.length ? `<div class="assist-empty">
        <div class="assist-hero">${icon("assist")}</div>
        <h2>О чём поговорим?</h2>
        <p>Здесь модель — ваш помощник, а не персонаж. Спросите совета по карточке, сцене или настройкам. ${cd ? `Ассистент видит карточку ${esc(cd.name)}${ch ? " и выдержку из выбранного чата" : ""}.` : "Подключите персонажа кнопкой вверху — тогда ассистент увидит его карточку и, по желанию, чат."}</p>
        <div class="starters">${AS.starters(!!cd, !!ch).map((x) => `<button class="starter" data-act="assist-starter" data-q="${esc(x.q)}">${esc(x.t)}</button>`).join("")}</div>
      </div>` : "";
    const feed = a.messages.map((msg, i) => {
      const live = m.gen && m.gen.assist && m.gen.msgId === msg.id;
      const last = i === a.messages.length - 1;
      const text = live ? m.gen.raw : msg.text;
      const th = OA.splitThink(text || "");
      const reasoning = live ? (m.gen.reasoning || th.reasoning) : msg.reasoning;
      const body = msg.role === "user" ? `<div class="bubble-plain">${esc(msg.text).replace(/\n/g, "<br>")}</div>`
        : `${reasoning ? `<details class="think"><summary>${icon("think")}Рассуждение модели</summary><div>${esc(reasoning)}</div></details>` : ""}<div class="md ${live ? "cursor" : ""}" id="text-${msg.id}">${R.md(th.text)}</div>`;
      return `<article class="aturn ${msg.role} ${last ? "last" : ""}" data-mid="${msg.id}">
        ${body}
        ${msg.error ? `<div class="err">${icon("alert")}<span>${esc(msg.error)}</span></div>` : ""}
        ${live ? "" : `<div class="tools">
          <button class="tool" data-act="assist-copy" data-id="${msg.id}">${icon("copy")}Скопировать</button>
          ${msg.role === "assistant" && last ? `<button class="tool" data-act="assist-regen" data-id="${msg.id}">${icon("regen")}Другой ответ</button>` : ""}
          ${msg.role === "user" ? `<button class="tool" data-act="assist-edit" data-id="${msg.id}" title="Вернуть в поле ввода и переспросить">${icon("edit")}Изменить</button>` : ""}
          <button class="tool" data-act="assist-msg-del" data-id="${msg.id}" title="Удалить это и всё после">${icon("trash")}</button></div>`}
      </article>`;
    }).join("");
    const p = m.provider;
    const composer = `<div class="composer-wrap"><div class="composer">
      <textarea id="input" rows="1" placeholder="Спросите ассистента…" aria-label="Сообщение ассистенту"></textarea>
      <div class="composer-bar">
        <button class="pill" data-act="model-pop" title="Модель">${icon("cpu")}<span>${esc(p ? p.label : "Выбрать модель")}</span></button>
        <span class="spacer"></span>
        ${m.gen ? `<button class="send stop" data-act="stop" title="Остановить">${icon("stop")}</button>` : `<button class="send" data-act="send" title="Отправить (Enter)">${icon("send")}</button>`}
      </div></div></div>`;
    return `<section class="chat assist">${head}<div class="feed" id="feed"><div class="feed-inner" id="feed-inner">${empty}${feed}</div></div>${composer}</section>`;
  }

  function assistCtxPop(m) {
    const cd = m.assistCard;
    const chats = cd ? m.chats.filter((c) => c.cardId === cd.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12) : [];
    return `<div class="pop-title">Персонаж для разговора</div>
      <button class="pop-item ${!cd ? "on" : ""}" data-act="assist-pick-card" data-id="">${icon("x")}<span>Без персонажа</span></button>
      ${m.cards.map((c) => `<button class="pop-item ${cd && cd.id === c.id ? "on" : ""}" data-act="assist-pick-card" data-id="${c.id}">${R.avatar(c, 22)}<span>${esc(c.name)}</span></button>`).join("")}
      ${cd ? `<div class="pop-sep"></div><div class="pop-title">Показать ассистенту чат</div>
        <button class="pop-item ${!m.assistChat ? "on" : ""}" data-act="assist-pick-chat" data-id="">${icon("x")}<span>Не показывать</span></button>
        ${chats.map((c) => `<button class="pop-item ${m.assistChat && m.assistChat.id === c.id ? "on" : ""}" data-act="assist-pick-chat" data-id="${c.id}">${icon(c.mode === "messenger" ? "bubble" : "book")}<span><span>${esc(c.title || (c.mode === "messenger" ? "Переписка" : "Сцена"))}</span><small>${esc(R.ago(c.updatedAt))}${c.preview ? " · " + esc(c.preview.slice(0, 40)) : ""}</small></span></button>`).join("") || `<p class="hint" style="padding:4px 10px">У персонажа пока нет чатов.</p>`}` : ""}`;
  }

  function assistListPop(m) {
    const list = (m.assistList || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return `<div class="pop-title">Разговоры с ассистентом</div>
      <button class="pop-item" data-act="assist-new">${icon("plus")}<span>Новый разговор</span></button>
      ${list.length ? `<div class="pop-sep"></div>` : ""}
      ${list.map((a) => `<button class="pop-item ${m.assist && m.assist.id === a.id ? "on" : ""}" data-act="assist-open" data-id="${a.id}">${icon("assist")}<span><span>${esc(a.title)}</span><small>${esc(R.ago(a.updatedAt))} · ${a.messages.length} ${R.plural(a.messages.length, "сообщение", "сообщения", "сообщений")}</small></span></button>`).join("")}`;
  }

  Object.assign((PRP.views = PRP.views || {}), { assist, assistCtxPop, assistListPop });
})(typeof window !== "undefined" ? window : globalThis);

/* js/chat/service.js */
/* Prism RP — сервис чата (прикладной уровень).
   Жизненный цикл чата и его сообщений: загрузка, создание с приветствием, правка,
   варианты, удаление ветки и чата, ручные изменения сцены, сохранение.
   Алгоритмы дерева — в chat/tree.js, свёртка сцены — в prism/scene.js; здесь только
   их применение к текущему чату и сохранение через хранилище.
   Зависимости передаются в create(ctx): состояние сессии S, хранилище DB, геттеры. DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, SC = PRP.scene;

  function create(ctx) {
    const { S, DB } = ctx;

    /* ── Путь и сцена активной ветки ───────────────────────────────────── */
    function path() {
      const c = ctx.chat();
      return c ? TR.path(TR.index(S.messages), c.leafId) : [];
    }
    function sceneState(p) {
      const c = ctx.chat();
      return SC.fold(c ? c.sceneInit : "", (p || path()).map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })));
    }
    // Путь в виде, который понимают модули Prism: [{id, swipeIdx}].
    function pathCtx(p) { return (p || path()).map((m) => ({ id: m.id, swipeIdx: m.swipeIdx || 0 })); }

    /* ── Сохранение ────────────────────────────────────────────────────── */
    async function putMsg(m) {
      await DB.put("messages", m);
      const i = S.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) S.messages[i] = m; else S.messages.push(m);
    }
    async function putChat(c) {
      await DB.put("chats", c);
      const i = S.chats.findIndex((x) => x.id === c.id);
      if (i >= 0) S.chats[i] = c; else S.chats.push(c);
    }
    // Обновить превью чата по последнему сообщению активной ветки и сохранить.
    async function touch() {
      const c = ctx.chat();
      if (!c) return;
      const last = path().slice(-1)[0];
      const t = last ? TR.activeSwipe(last).text : "";
      c.preview = (last && last.role === "user" ? "Вы: " : "") + t.replace(/\s+/g, " ").slice(0, 90);
      await putChat(c);
    }
    function newMsg(role, parentId, text) {
      const now = Date.now();
      return { id: U.uid("m"), chatId: S.chatId, parentId: parentId || null, role, swipes: [{ text: text || "", sceneOps: [], createdAt: now }], swipeIdx: 0, createdAt: now };
    }

    /* ── Жизненный цикл ────────────────────────────────────────────────── */
    function loadMessages(chatId) { return DB.byIndex("messages", "chatId", chatId); }

    // Новый чат; для режима «Сцена» — с приветствиями карточки как вариантами первого ответа.
    // Делает чат текущим (S.chatId, S.cardId, S.messages) и возвращает его id.
    async function createChat(mode, cardId) {
      const cd = S.cards.find((x) => x.id === (cardId || S.cardId));
      if (!cd) return null;
      const c = { id: U.uid("chat"), cardId: cd.id, mode, title: mode === "messenger" ? "Переписка" : "Сцена", sceneInit: "", leafId: null, createdAt: Date.now() };
      S.chatId = c.id; S.cardId = cd.id; S.messages = [];
      if (mode === "rp" && (cd.firstMes || (cd.altGreetings || []).length)) {
        const vars = { char: cd.name, user: ctx.persona().name };
        const m = newMsg("assistant", null, "");
        m.swipes = [cd.firstMes].concat(cd.altGreetings || []).filter(Boolean).map((g) => {
          const parsed = SC.parse(U.macros(g, vars));
          return { text: parsed.text, sceneOps: parsed.ops, createdAt: Date.now() };
        });
        await putMsg(m);
        c.leafId = m.id;
        c.preview = m.swipes[0].text.replace(/\s+/g, " ").slice(0, 90);
      }
      await putChat(c);
      return c.id;
    }
    function latestForCard(cardId) {
      return S.chats.filter((c) => c.cardId === cardId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
    }
    // Удалить чат целиком: сообщения, картинки и опыт этого мира. Состояние сбрасывается на «нет чата».
    async function deleteChat(c) {
      const ms = await DB.byIndex("messages", "chatId", c.id);
      await DB.delMany("experience", (await DB.byIndex("experience", "owner", c.cardId)).filter((x) => x.chatId === c.id).map((x) => x.id));
      await DB.delMany("messages", ms.map((m) => m.id));
      await DB.delMany("images", (await DB.byIndex("images", "chatId", c.id)).map((x) => x.id));
      await DB.del("chats", c.id);
      S.chats = S.chats.filter((x) => x.id !== c.id);
      S.chatId = null; S.messages = [];
    }

    /* ── Правки ветки ──────────────────────────────────────────────────── */
    // Удалить сообщение и всех его потомков; активной становится последняя оставшаяся ветка.
    async function deleteFrom(msgId) {
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const ids = [msgId].concat(TR.descendants(S.messages, msgId));
      const imgIds = [];
      S.messages.filter((x) => ids.includes(x.id)).forEach((x) => x.swipes.forEach((sw) => (sw.images || []).forEach((im) => imgIds.push(im.id))));
      await DB.delMany("images", imgIds);
      await DB.delMany("messages", ids);
      S.messages = S.messages.filter((x) => !ids.includes(x.id));
      const c = ctx.chat();
      const lastRoot = TR.children(S.messages, null).slice(-1)[0];
      c.leafId = m.parentId ? TR.latestLeaf(S.messages, m.parentId) : lastRoot ? TR.latestLeaf(S.messages, lastRoot.id) : null;
      await touch();
      return true;
    }
    async function saveEdit(msgId, text) {
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const sw = TR.activeSwipe(m);
      const parsed = SC.parse(text);
      sw.text = m.role === "assistant" ? parsed.text : text.trim();
      if (m.role === "assistant") sw.sceneOps = parsed.ops;
      await putMsg(m);
      await touch();
      return true;
    }
    /* Листать варианты ответа. → "regen", если надо сгенерировать новый вариант
       (листание вправо за последний вариант последнего ответа); true — переключено; false — ничего. */
    async function swipe(msgId, dir) {
      const m = S.messages.find((x) => x.id === msgId);
      if (!m) return false;
      const next = (m.swipeIdx || 0) + dir;
      if (next < 0) return false;
      const isLast = path().slice(-1)[0] === m;
      if (next >= m.swipes.length) return m.role === "assistant" && isLast ? "regen" : false;
      m.swipeIdx = next;
      await putMsg(m);
      await touch();
      return true;
    }
    // Добавить пользовательский ответ в ветку: становится новым концом.
    async function addUserMessage(text) {
      const c = ctx.chat();
      const m = newMsg("user", c.leafId, text);
      await putMsg(m);
      c.leafId = m.id;
      await touch();
      return m;
    }

    /* ── Сцена из форм ─────────────────────────────────────────────────── */
    function op(subject, key, value) {
      return { subject: subject || undefined, key, value, raw: `${subject ? subject + "." : ""}${key}=${value}`, manual: true };
    }
    // Ручные изменения сцены пишутся в последнее сообщение ветки (или в начальную сцену пустого чата).
    async function applySceneOps(ops) {
      if (!ops.length) return false;
      const c = ctx.chat();
      const leaf = path().slice(-1)[0];
      if (leaf) {
        const sw = TR.activeSwipe(leaf);
        sw.sceneOps = (sw.sceneOps || []).concat(ops);
        await putMsg(leaf);
      } else {
        c.sceneInit = [c.sceneInit, ops.map((o) => o.raw).join("; ")].filter(Boolean).join("; ");
        await putChat(c);
      }
      return true;
    }

    /* ── Прочее ────────────────────────────────────────────────────────── */
    function exportText() {
      const c = ctx.chat(), cd = ctx.card();
      const lines = path().map((m) => `${m.role === "user" ? ctx.persona().name : cd.name}: ${TR.activeSwipe(m).text}`);
      return { name: `${cd.name} — ${c.title || "чат"}.txt`, text: lines.join("\n\n") };
    }

    return { path, sceneState, pathCtx, putMsg, putChat, touch, newMsg, loadMessages, createChat, latestForCard, deleteChat, deleteFrom, saveEdit, swipe, addUserMessage, op, applySceneOps, exportText };
  }

  PRP.chatService = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/prism/experience-service.js */
/* Prism RP — сервис опыта (прикладной уровень).
   Загрузка опыта персонажа, однократная миграция старых записей, черновики,
   сохранение, удаление и ручная привязка к чату.
   Правила видимости, отбора и миграции — чистые функции prism/experience.js;
   здесь только их применение к текущему чату и работа с хранилищем. DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, EX = PRP.experience, SC = PRP.scene;

  function create(ctx) {
    const { S, DB } = ctx;
    const chat = () => ctx.svc.chat;

    // Все записи персонажа (по владельцу); видимость в чате и ветке решает EX.visibility.
    function loadForCard(cardId) { return DB.byIndex("experience", "owner", cardId); }

    // Миграция: привязка к чату без догадок (EX.migrate). Идемпотентна; пишет только изменённые записи.
    async function migrate() {
      const all = await DB.all("experience");
      const need = all.filter((r) => !r.chatId && !(r.source && r.source.chatId) && r.source && (r.source.messageIds || []).length);
      const msgChat = new Map();
      for (const r of need) for (const id of r.source.messageIds) {
        if (msgChat.has(id)) continue;
        const msg = await DB.get("messages", id);
        msgChat.set(id, msg ? msg.chatId : null);
      }
      const res = EX.migrate(all, { messageChat: (id) => (msgChat.has(id) ? msgChat.get(id) : null) });
      const changed = res.records.filter((r) => res.changed.includes(r.id));
      if (changed.length) await DB.putMany("experience", changed);
      S.legacyExperience = res.legacy;
      return res;
    }

    // Что показывать во вкладке «Опыт»: видимое в этой ветке, скрытое в других ветках, непривязанное.
    function view(p) {
      const vctx = { chatId: S.chatId, path: chat().pathCtx(p) };
      const inChat = S.experience.filter((r) => r.chatId === S.chatId && !r.legacyUnscoped);
      const visible = inChat.filter((r) => EX.visibility(r, vctx).visible);
      return { visible, hiddenInChat: inChat.length - visible.length, legacy: S.experience.filter((r) => EX.scopeOf(r) === "legacy") };
    }
    function legacyCount() { return S.experience.filter((r) => EX.scopeOf(r) === "legacy").length; }

    // Пустой черновик ручной записи (на весь чат).
    function blankDraft() { return Object.assign(EX.blank(S.cardId, S.chatId), { about: ["user"] }); }
    // Черновик из сообщения: привязка к сообщению и его варианту, время сцены на тот момент.
    function draftFromMessage(msgId) {
      const p = chat().path();
      const idx = p.findIndex((m) => m.id === msgId);
      const st = chat().sceneState(p.slice(0, idx + 1));
      const d = EX.blank(S.cardId, S.chatId);
      d.about = ["user"];
      const msg = p[idx];
      d.source = { chatId: S.chatId, messageIds: [msgId], swipes: { [msgId]: (msg && msg.swipeIdx) || 0 }, sceneTime: st.clock.m != null || st.clock.min != null ? SC.formatClock(st.clock) : "" };
      return d;
    }

    // Сохранить черновик. → строка ошибки для пользователя или null.
    async function save(d) {
      d.event = d.event.trim();
      if (!d.event) return "Опишите, что произошло.";
      if (!d.id) d.id = U.uid("x");
      d.owner = S.cardId;
      // Новая запись всегда принадлежит текущему чату; непривязанные старые не трогаем.
      if (!d.chatId && !d.legacyUnscoped) { d.chatId = S.chatId; d.source = Object.assign({ messageIds: [] }, d.source, { chatId: S.chatId }); }
      await DB.put("experience", d);
      const i = S.experience.findIndex((x) => x.id === d.id);
      if (i >= 0) S.experience[i] = d; else S.experience.push(d);
      return null;
    }
    async function remove(id) {
      await DB.del("experience", id);
      S.experience = S.experience.filter((x) => x.id !== id);
    }
    // Ручная привязка непривязанной записи к текущему чату (EX.assignToChat).
    async function assign(id) {
      const r = S.experience.find((x) => x.id === id);
      if (!r) return false;
      const nr = EX.assignToChat(r, S.chatId);
      await DB.put("experience", nr);
      S.experience = S.experience.map((x) => (x.id === nr.id ? nr : x));
      S.legacyExperience = Math.max(0, (S.legacyExperience || 1) - 1);
      return true;
    }
    function find(id) { return S.experience.find((x) => x.id === id); }

    return { loadForCard, migrate, view, legacyCount, blankDraft, draftFromMessage, save, remove, assign, find };
  }

  PRP.experienceService = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/prism/service.js */
/* Prism RP — сборка Prism для текущего чата (прикладной уровень).
   Связывает активную ветку, сцену, опыт и настройки с чистым сборщиком (prism/assembler.js):
   отбор опыта (EX.rank) → сборка контекста (AS.build) → отчёт для вкладки Prism.
   Хранилище, сеть и DOM не трогает. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, EX = PRP.experience, AS = PRP.assembler, IC = PRP.imgCompose, ST = PRP.settings;

  function create(ctx) {
    const { S } = ctx;
    const chat = () => ctx.svc.chat;

    // path — ветка до точки ответа; extraPost — дополнительное указание в конце (например, «продолжи»).
    function build(path, extraPost) {
      const c = ctx.chat(), cd = ctx.card();
      const s = S.settings;
      if (ST.imagesOn(s, ctx.env.perchanceImages()) && s.images.modelDraws) {
        const di = IC.drawInstruction({ format: s.images.format, qualityPinned: ST.qualityPinned(s), pov: (ctx.persona().image || {}).view === "first" });
        extraPost = [di, extraPost].filter(Boolean).join("\n\n");
      }
      const st = chat().sceneState(path);
      const history = path.map((m) => ({ role: m.role, text: TR.activeSwipe(m).text })).filter((h) => h.text);
      const recent = history.slice(-4).map((h) => h.text).join("\n");
      const ex = EX.rank(S.experience, {
        chatId: c.id, path: chat().pathCtx(path), ownerId: cd.id, present: ["user"].concat(st.present),
        text: recent, names: [cd.name, ctx.persona().name].concat(st.present), limit: s.expLimit,
      });
      const built = AS.build({
        mode: c.mode, card: cd, userName: ctx.persona().name, userDesc: ctx.persona().description,
        sceneState: st, experiences: ex.ranked, history, extraPost,
        contextTokens: ctx.contextTokens(), reserveTokens: s.sampler.max_tokens || 700,
        singleSystem: s.singleSystem, sceneProtocol: s.sceneProtocol, noPostHistory: !!s.noPostHistory,
      });
      built.report.expDebug = ex.debug;
      built.report.experienceVisible = ex.visibleCount;
      built.report.legacyUnscoped = S.experience.filter((r) => EX.scopeOf(r) === "legacy").length;
      return built;
    }

    // Предпросмотр для следующего хода (вкладка Prism, счётчик контекста).
    function refresh() {
      if (!ctx.chat() || !ctx.card()) { S.lastPrism = null; return; }
      S.lastPrism = Object.assign({ at: Date.now(), preview: true }, build(chat().path()));
    }

    return { build, refresh };
  }

  PRP.prismService = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/images/service.js */
/* Prism RP — картинки в чате (прикладной уровень).
   Порядок: промпт из сцены (compose) → перевод текстовой моделью (compile, через PRP.llm)
   → финальная сборка (finalise) → бэкенд (backends) → сохранение картинки.
   Также: загрузка картинок чата, восстановление прерванного рисования, списки с сервера A1111.
   Перерисовка — через порт ctx.ui. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, IC = PRP.imgCompose, ICP = PRP.imgCompile, IB = PRP.imgBackends, ST = PRP.settings, LLM = PRP.llm;

  function create(ctx) {
    const { S, DB, ui } = ctx;
    const chat = () => ctx.svc.chat;

    function textGen(instruction) { return LLM.simple(ctx.provider(), instruction); }

    // Подсказка переводчику: кто это и какие теги уже добавятся сами.
    function identityFor(cd) {
      const im = cd.image || {};
      const bits = ["name: " + cd.name];
      if (im.trigger) bits.push("already injected later (do NOT repeat these tags): " + im.trigger);
      const base = IC.parseMap(im.look).filter((e) => /^(|base|always)$/i.test(e.key)).map((e) => e.tags).join(", ");
      if (base) bits.push("look: " + base);
      return bits.join("\n");
    }

    // Картинки чата в память; рисование, прерванное закрытием страницы, не должно висеть «в работе».
    async function loadForChat(chatId) {
      S.imgUrls = {};
      (await DB.byIndex("images", "chatId", chatId)).forEach((x) => (S.imgUrls[x.id] = x.dataUrl));
      for (const msg of S.messages) for (const sw of msg.swipes) for (const im of sw.images || []) {
        if (im.status === "pending" && !S.drawing.has(im.id)) { im.status = "error"; im.error = "Рисование прервано. Попробуйте ещё раз."; }
      }
    }

    // reuse — существующая запись картинки (перерисовать); opts.seed — свой seed.
    async function draw(msg, sw, d, reuse, opts) {
      const o = opts || {};
      const cfg = S.settings.images, cd = ctx.card();
      if (!cfg.enabled) { ui.toast("Картинки выключены. Включите их в «Настройки → Изображения».", true); return; }
      if (cfg.backend === "perchance" && !IB.available("perchance")) { ui.toast("Рисование через Perchance доступно только в генераторе на Perchance. Выберите Forge/A1111 или API.", true); ui.openSettings("images"); return; }
      if (cfg.backend !== "perchance" && !String(cfg.url || "").trim()) { ui.toast("Укажите адрес сервера изображений.", true); ui.openSettings("images"); return; }
      const entry = reuse || { id: U.uid("img"), draw: d.prompt, ratio: d.ratio || "1:1" };
      Object.assign(entry, { status: "pending", stage: "Готовлю промпт…" });
      delete entry.error;
      if (!reuse) (sw.images = sw.images || []).push(entry);
      S.drawing.add(entry.id);
      const repaint = () => { if (ctx.chat() && ctx.chat().id === msg.chatId) ui.renderFeed(); };
      await chat().putMsg(msg);
      repaint();
      try {
        const path = chat().path();
        const upto = path.indexOf(msg) >= 0 ? path.slice(0, path.indexOf(msg) + 1) : path;
        const st = chat().sceneState(upto);
        const pers = ctx.persona();
        const composed = IC.compose({ draw: entry.draw, card: cd, scene: st, persona: pers });
        if (cfg.translate && IC.needsRewrite(composed.scene)) { entry.stage = "Перевожу сцену в промпт…"; repaint(); }
        const comp = await ICP.compile(composed.scene, { format: cfg.format, translate: cfg.translate, pov: (pers.image || {}).view === "first", qualityPinned: ST.qualityPinned(S.settings), identity: identityFor(cd) }, textGen);
        const fin = IC.finalise({ composed, compiled: comp.text, card: cd, settings: cfg, backend: cfg.backend, persona: pers });
        entry.stage = cfg.backend === "a1111" ? "Рисую на вашем сервере…" : "Рисую…";
        repaint();
        const seed = o.seed != null ? o.seed : (cd.image && String(cd.image.seed || "").trim() !== "" ? Number(cd.image.seed) : undefined);
        const res = await IB.generate(cfg, { prompt: fin.prompt, negative: fin.negative, ratio: entry.ratio, seed });
        await DB.put("images", { id: entry.id, chatId: msg.chatId, msgId: msg.id, dataUrl: res.dataUrl });
        S.imgUrls[entry.id] = res.dataUrl;
        const dims = res.info && res.info.width ? [res.info.width, res.info.height]
          : res.info && (res.info.resolution || res.info.size) ? String(res.info.resolution || res.info.size).split("x").map(Number) : null;
        Object.assign(entry, { status: "done", prompt: fin.prompt, negative: fin.negative, seed: res.seed, backend: cfg.backend, info: res.info, compiledFrom: comp.compiled ? composed.scene : "" });
        if (dims) { entry.w = dims[0]; entry.h = dims[1]; }
        delete entry.stage;
      } catch (e) {
        entry.status = "error";
        entry.error = e.message || String(e);
        delete entry.stage;
      }
      S.drawing.delete(entry.id);
      await chat().putMsg(msg);
      repaint();
    }

    // Нарисовать момент из сообщения: директива [draw:] модели или сам текст ответа.
    function drawFromMessage(msgId) {
      const msg = S.messages.find((x) => x.id === msgId);
      const sw = TR.activeSwipe(msg);
      const d = (sw.draws && sw.draws[0]) || { prompt: sw.text.replace(/\s+/g, " ").slice(0, 700), ratio: "1:1" };
      return draw(msg, sw, d);
    }

    // Картинка по координатам из разметки: сообщение, номер варианта, id картинки.
    function find(mid, swIdx, imgId) {
      const msg = S.messages.find((x) => x.id === mid);
      if (!msg) return {};
      const sw = msg.swipes[+swIdx];
      const im = sw && (sw.images || []).find((x) => x.id === imgId);
      return { msg, sw, im };
    }
    async function remove(msg, sw, im) {
      sw.images = sw.images.filter((x) => x !== im);
      await DB.del("images", im.id); delete S.imgUrls[im.id];
      await chat().putMsg(msg);
    }
    async function pinSeed(seed) {
      const cd = ctx.card(); cd.image = Object.assign({}, cd.image, { seed: String(seed) });
      await DB.put("cards", cd);
      return cd;
    }

    // Списки с сервера A1111/Forge: модели, VAE, сэмплеры, апскейлеры, LoRA (+ планировщики, если есть).
    async function fetchLists() {
      const cfg = S.settings.images, out = { at: Date.now() };
      for (const w of ["models", "vaes", "samplers", "upscalers", "loras"]) out[w] = await IB.a1111List(cfg, w);
      try { out.schedulers = await IB.a1111List(cfg, "schedulers"); } catch (e) { out.schedulers = []; }
      S.imgLists = out; await DB.setSetting("imgLists", out);
      if (!cfg.model && out.models[0]) cfg.model = out.models[0];
      return out;
    }

    return { textGen, loadForChat, draw, drawFromMessage, find, remove, pinSeed, fetchLists };
  }

  PRP.imageService = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/generation/service.js */
/* Prism RP — генерация ответа персонажа (прикладной уровень).
   Порядок хода: предварительная сборка Prism и проверка бюджета (до любых изменений дерева)
   → узел или вариант ответа → вызов модели через PRP.llm → разбор ответа ([scene:], [draw:],
   рассуждение) → сохранение → автокартинка.
   Режимы: "new" — новый ответ, "regen" — новый вариант, "continue" — дописать текущий вариант.
   Перерисовка — через порт ctx.ui (сервис не трогает DOM сам). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const TR = PRP.tree, SC = PRP.scene, OA = PRP.openai, IC = PRP.imgCompose, ST = PRP.settings, LLM = PRP.llm;

  const CONTINUE = "Продолжи последнее сообщение {{char}} ровно с того места, где оно оборвалось. Не повторяй уже написанное и не начинай заново.";

  function create(ctx) {
    const { S, ui } = ctx;
    const chat = () => ctx.svc.chat, prism = () => ctx.svc.prism, images = () => ctx.svc.images;

    async function generate(msgId, mode) {
      if (S.gen) return;
      const c = ctx.chat(), cd = ctx.card();
      const prov = ctx.provider();
      if (!c || !cd) return;
      if (!prov) { ui.toast("Модель не подключена. Откройте «Настройки → Модели».", true); ui.openSettings("models"); return; }
      mode = mode || (msgId ? "regen" : "new");

      // Предварительная проверка: контекст собирается ДО любых изменений дерева сообщений.
      // Если он не помещается, запрос не уходит и история не получает ни узла, ни варианта.
      let path = chat().path();
      if (mode === "regen") path = path.slice(0, path.findIndex((m) => m.id === msgId));
      const extraPost = mode === "continue" ? CONTINUE : "";
      const built = prism().build(path, extraPost);
      S.lastPrism = Object.assign({ at: Date.now(), provider: prov.label }, built);
      if (built.report.overflow) {
        ui.toast(`Контекст не помещается даже после всех сокращений (${built.report.used} из ${built.report.budget} токенов), запрос не отправлен. Увеличьте объём контекста в «Настройки → Генерация» или сократите сцену и карточку. Подробности — во вкладке Prism.`, true);
        if (S.drawerOpen) { S.tab = "prism"; ui.renderDrawer(); }
        ui.renderFeed();
        return;
      }

      let target, prefix = "";
      if (mode === "regen") {
        target = S.messages.find((m) => m.id === msgId);
        target.swipes.push({ text: "", sceneOps: [], createdAt: Date.now() });
        target.swipeIdx = target.swipes.length - 1;
      } else if (mode === "continue") {
        target = S.messages.find((m) => m.id === msgId);
        prefix = TR.activeSwipe(target).text;
      } else {
        target = chat().newMsg("assistant", c.leafId, "");
        c.leafId = target.id;
        await chat().putChat(c);
      }
      await chat().putMsg(target);

      const sw = TR.activeSwipe(target);
      const ctrl = new AbortController();
      S.gen = { ctrl, msgId: target.id, raw: "", reasoning: "", prefix: prefix ? prefix + (/\s$/.test(prefix) ? "" : " ") : "" };
      ui.renderFeed();
      if (S.drawerOpen && S.tab === "prism") ui.renderDrawer();
      ui.scrollBottom();

      const onDelta = (d) => { S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; ui.paintStreaming(); };
      let raw = "", reasoning = "", error = null;
      try {
        const res = await LLM.chat(prov, built.messages, {
          names: { char: cd.name, user: ctx.persona().name }, sampler: S.settings.sampler,
          signal: ctrl.signal, onDelta, continueFrom: prefix || null,
        });
        raw = res.text; reasoning = res.reasoning;
      } catch (e) {
        raw = e.partial != null ? e.partial : S.gen.raw;
        reasoning = S.gen.reasoning;
        if (e.name !== "AbortError") error = e.message || String(e);
      }
      const th = OA.splitThink(raw || "");
      const parsed = SC.parse(th.text);
      const dr = IC.parseDraws(parsed.text);
      if (mode === "continue") {
        if (dr.text) sw.text = S.gen.prefix + dr.text;
        sw.sceneOps = (sw.sceneOps || []).concat(parsed.ops);
        sw.draws = (sw.draws || []).concat(dr.draws);
      } else {
        sw.text = dr.text;
        sw.sceneOps = parsed.ops;
        sw.draws = dr.draws;
      }
      sw.reasoning = [sw.reasoning && mode === "continue" ? sw.reasoning : "", reasoning, th.reasoning].filter(Boolean).join("\n").trim();
      if (error) sw.error = error; else delete sw.error;
      S.gen = null;
      await chat().putMsg(target);
      await chat().touch();
      prism().refresh();
      ui.renderFeed();
      ui.renderRail();
      if (S.drawerOpen) ui.renderDrawer();
      ui.scrollBottom();
      if (!error && dr.draws.length && ST.imagesOn(S.settings, ctx.env.perchanceImages()) && S.settings.images.autoDraw) images().draw(target, sw, dr.draws[0]);
    }

    function stop() { if (S.gen) S.gen.ctrl.abort(); }

    return { generate, stop };
  }

  PRP.generationService = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/cards/service.js */
/* Prism RP — карточки персонажей (прикладной уровень).
   Импорт файлов (JSON/PNG) → разбор формата (cards/ccard.js) → сохранение; сохранение
   черновика редактора; удаление с каскадом; экспорт JSON/PNG.
   Смысл форматов (V1/V2/V3, PNG-чанки) — только в ccard.js. Файловый ввод-вывод — PRP.files. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, CC = PRP.ccard;

  function create(ctx) {
    const { S, DB } = ctx;
    const F = () => ctx.files;

    // Черновик для редактора: копия карточки или новая пустая.
    function draft(cd) { return U.clone(cd || Object.assign(CC.normalize({ name: "" }), { id: null })); }

    /* Импорт файлов по одному; ошибка одного файла не мешает остальным.
       → { last: последняя добавленная карточка | null, errors: [{file, message}] } */
    async function importFiles(files) {
      let last = null;
      const errors = [];
      for (const file of files) {
        try {
          let json, avatar = null;
          if (/\.json$/i.test(file.name) || file.type === "application/json") json = JSON.parse(await F().readFile(file, "text"));
          else { json = CC.cardJsonFromPng(new Uint8Array(await F().readFile(file))); avatar = await F().readFile(file, "dataurl"); }
          const cd = CC.normalize(json);
          cd.id = U.uid("card");
          cd.avatar = avatar;
          await DB.put("cards", cd);
          S.cards.unshift(cd);
          last = cd;
        } catch (e) {
          errors.push({ file: file.name, message: e.message });
          if (ctx.ui) ctx.ui.toast(`${file.name}: ${e.message}`, true);
        }
      }
      return { last, errors };
    }

    // Сохранить черновик редактора. → { error } или { card, isNew }.
    async function save(d) {
      d.name = (d.name || "").trim();
      if (!d.name) return { error: "Дайте персонажу имя." };
      if (d.image && d.image.loras) d.image.loras = d.image.loras.filter((l) => l.name);
      d.altGreetings = (d.altGreetings || []).map((g) => String(g || "").trim()).filter(Boolean);
      d.updatedAt = Date.now();
      const isNew = !d.id;
      if (isNew) { d.id = U.uid("card"); d.createdAt = Date.now(); }
      await DB.put("cards", d);
      const i = S.cards.findIndex((x) => x.id === d.id);
      if (i >= 0) S.cards[i] = d; else S.cards.unshift(d);
      return { card: d, isNew };
    }

    // Удалить персонажа вместе со всеми его чатами, сообщениями, картинками и опытом.
    async function remove(cd) {
      for (const c of S.chats.filter((x) => x.cardId === cd.id)) {
        const ms = await DB.byIndex("messages", "chatId", c.id);
        await DB.delMany("messages", ms.map((m) => m.id));
        await DB.delMany("images", (await DB.byIndex("images", "chatId", c.id)).map((x) => x.id));
        await DB.del("chats", c.id);
      }
      const xs = await DB.byIndex("experience", "owner", cd.id);
      await DB.delMany("experience", xs.map((x) => x.id));
      await DB.del("cards", cd.id);
      S.cards = S.cards.filter((c) => c.id !== cd.id);
      S.chats = S.chats.filter((c) => c.cardId !== cd.id);
      if (S.cardId === cd.id) { S.cardId = null; S.chatId = null; S.messages = []; S.view = "home"; }
    }

    function exportJson(d) {
      return { name: `${d.name || "персонаж"}.json`, text: JSON.stringify(CC.toSpec(d, "v3"), null, 2) };
    }
    async function exportPng(d) {
      return { name: `${d.name || "персонаж"}.png`, blob: new Blob([CC.embedInPng(await F().avatarPngBytes(d), d)], { type: "image/png" }) };
    }

    return { draft, importFiles, save, remove, exportJson, exportPng };
  }

  PRP.cardService = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/assist/service.js */
/* Prism RP — ассистент (прикладной уровень): разговоры с моделью вне игры.
   Выбор и сохранение разговоров, контекст из карточки и выдержки чата, генерация через PRP.llm.
   Смысловые правила (инструкция, сборка контекста) — в assist/assist.js. Перерисовка — через ctx.ui. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, TR = PRP.tree, SC = PRP.scene, OA = PRP.openai, AST = PRP.assist, LLM = PRP.llm;

  function create(ctx) {
    const { S, DB, ui } = ctx;

    function loadAll() { return DB.all("assist"); }

    // Выбрать разговор: по id, оставить уже открытый пустой или начать новый (наследуя персонажа).
    function pick(id, base) {
      const found = id && S.assistList.find((a) => a.id === id);
      if (found) S.assist = found;
      else if (!base && S.assist && !S.assist.messages.length) { /* пустой разговор уже открыт */ }
      else {
        const b = base || (S.assist ? { cardId: S.assist.ctx.cardId, chatId: null } : (S.view === "chat" && S.cardId ? { cardId: S.cardId, chatId: null } : {}));
        S.assist = AST.blank(b);
      }
    }
    async function save() {
      const a = S.assist;
      await DB.put("assist", a);
      if (!S.assistList.includes(a)) S.assistList.push(a);
    }
    async function remove(a) {
      await DB.del("assist", a.id);
      S.assistList = S.assistList.filter((x) => x !== a);
      S.assist = null;
    }

    // Выдержка из ролевого чата для контекста ассистента: реплики активной ветки и строка сцены.
    async function chatLines(chatId) {
      const c = S.chats.find((x) => x.id === chatId);
      if (!c) return { lines: [], scene: "" };
      const msgs = await DB.byIndex("messages", "chatId", chatId);
      const path = TR.path(TR.index(msgs), c.leafId);
      const cd = S.cards.find((x) => x.id === c.cardId);
      const lines = path.map((m) => ({ name: m.role === "user" ? ctx.persona().name : (cd ? cd.name : "Персонаж"), text: TR.activeSwipe(m).text || "" })).filter((l) => l.text.trim());
      const st = SC.fold(c.sceneInit, path.map((m) => ({ msgId: m.id, role: m.role, ops: TR.activeSwipe(m).sceneOps || [] })));
      return { lines, scene: SC.summaryLine(st) || "" };
    }

    async function send(text) {
      const a = S.assist;
      if (!a || S.gen) return;
      if (!a.messages.length) a.title = AST.title(text);
      a.messages.push({ id: U.uid("am"), role: "user", text, at: Date.now() });
      await save(); ui.rememberUi();
      await generate();
    }

    async function generate() {
      const a = S.assist;
      const prov = ctx.provider();
      if (!prov) { ui.toast("Модель не подключена. Откройте «Настройки → Модели».", true); ui.openSettings("models"); return; }
      const cd = a.ctx.cardId ? S.cards.find((c) => c.id === a.ctx.cardId) : null;
      const chatCtx = a.ctx.chatId ? await chatLines(a.ctx.chatId) : { lines: [], scene: "" };
      const target = { id: U.uid("am"), role: "assistant", text: "", at: Date.now() };
      const history = a.messages.map((x) => ({ role: x.role, text: x.text }));
      a.messages.push(target);
      const built = AST.build({
        system: (S.settings.assistSystem || "").trim() || AST.SYSTEM, card: cd, chatLines: chatCtx.lines, sceneLine: chatCtx.scene,
        userName: ctx.persona().name, history, contextTokens: ctx.contextTokens(), reserveTokens: 1500,
      });
      const ctrl = new AbortController();
      S.gen = { ctrl, msgId: target.id, raw: "", reasoning: "", assist: true };
      ui.renderStage();
      ui.scrollBottom();
      const onDelta = (d) => { if (!S.gen) return; S.gen.raw += d.text || ""; S.gen.reasoning += d.reasoning || ""; ui.paintAssist(); };
      let raw = "", reasoning = "", error = null;
      try {
        const sp = S.settings.sampler;
        const res = await LLM.chat(prov, built.messages, {
          names: { char: "Ассистент", user: ctx.persona().name },
          sampler: Object.assign({}, sp, { temperature: Math.min(sp.temperature || 0.7, 0.8), max_tokens: Math.max(sp.max_tokens || 0, 1500) }),
          signal: ctrl.signal, onDelta,
        });
        raw = res.text; reasoning = res.reasoning;
      } catch (e) {
        raw = e.partial != null ? e.partial : (S.gen ? S.gen.raw : "");
        reasoning = S.gen ? S.gen.reasoning : "";
        if (e.name !== "AbortError") error = e.message || String(e);
      }
      const th = OA.splitThink(raw || "");
      target.text = th.text.trim();
      target.reasoning = [reasoning, th.reasoning].filter(Boolean).join("\n").trim();
      if (error) target.error = error;
      S.gen = null;
      if (!target.text && !error) a.messages.pop();
      await save(); ui.rememberUi();
      if (S.view === "assist") { ui.renderStage(); ui.scrollBottom(); }
    }

    // Убрать сообщение и всё после него. → удалённые сообщения или null.
    async function cutFrom(id) {
      const a = S.assist;
      const i = a.messages.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const removed = a.messages.splice(i);
      await save(); ui.rememberUi();
      return removed;
    }

    return { loadAll, pick, save, remove, chatLines, send, generate, cutFrom };
  }

  PRP.assistService = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/shell.js */
/* Prism RP — оболочка интерфейса: модель представления, отрисовка областей экрана,
   поповеры, поиск по чату, потоковая отрисовка ответа, уведомления.
   Это «порт интерфейса» (ctx.ui), через который сервисы просят перерисовку, не трогая DOM сами.
   Разметку строят представления (js/ui/views/*), здесь — только куда и когда её вставить. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const SC = PRP.scene, OA = PRP.openai, IB = PRP.imgBackends, IC = PRP.imgCompose, R = PRP.render, V = PRP.views;

  function create(ctx) {
    const { S } = ctx;
    const $ = (sel, el) => (el || document).querySelector(sel);
    const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
    const narrow = () => window.innerWidth < 1280;
    const svc = () => ctx.svc;

    /* ── Уведомления ───────────────────────────────────────────────────── */
    let toastTimer = null;
    function toast(text, isErr) {
      const el = $("#toast");
      el.innerHTML = R.icon(isErr ? "alert" : "check") + `<span>${R.esc(text)}</span>`;
      el.className = "toast" + (isErr ? " err" : "");
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.hidden = true), isErr ? 8000 : 2800);
    }

    /* ── Модель представления ──────────────────────────────────────────── */
    function vm() {
      const path = svc().chat.path();
      return {
        S, view: S.view, cards: S.cards, chats: S.chats, card: ctx.card(), chat: ctx.chat(), persona: ctx.persona(), path,
        scene: ctx.chat() ? svc().chat.sceneState(path) : SC.emptyState(), gen: S.gen, editingMsg: S.editingMsg,
        provider: ctx.provider(), providers: ctx.providers(), settings: S.settings,
        exps: S.experience, expView: svc().exp.view(path), expDraft: S.expDraft, lastPrism: S.lastPrism, tab: S.tab, find: S.find,
        drawerOpen: S.drawerOpen, homeQuery: S.homeQuery, editProviderId: S.editProviderId,
        stats: `Персонажей: ${S.cards.length}, чатов: ${S.chats.length}.`,
        imgUrls: S.imgUrls, imgLists: S.imgLists, perchanceImages: IB.available("perchance"),
        origin: location.origin && location.origin !== "null" ? location.origin : "*",
        assist: S.assist, assistList: S.assistList,
        assistCard: S.assist && S.assist.ctx.cardId ? S.cards.find((c) => c.id === S.assist.ctx.cardId) || null : null,
        assistChat: S.assist && S.assist.ctx.chatId ? S.chats.find((c) => c.id === S.assist.ctx.chatId) || null : null,
      };
    }

    /* ── Отрисовка областей ────────────────────────────────────────────── */
    function applyLook() {
      document.documentElement.setAttribute("data-theme", S.settings.theme || "dusk");
      document.documentElement.style.setProperty("--prose-fs", (S.settings.proseSize || 17) + "px");
    }
    function autoGrow(t) { if (!t) return; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 240) + "px"; }
    function renderRail() { $("#rail").innerHTML = V.rail(vm()); }
    function renderStage() {
      const app = $("#app");
      const m = vm();
      const input = $("#input");
      const keep = input ? { v: input.value, s: input.selectionStart, f: document.activeElement === input } : null;
      const feedEl = $("#feed");
      const scroll = feedEl ? feedEl.scrollTop : null;
      if (S.view === "assist" && S.assist) {
        $("#stage").innerHTML = V.assist(m);
        app.classList.remove("messenger");
        if (keep) {
          const i = $("#input"); i.value = keep.v; autoGrow(i);
          if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (e) {} }
        }
        if (scroll != null && $("#feed")) $("#feed").scrollTop = scroll;
      } else if (S.view === "chat" && m.chat && m.card) {
        $("#stage").innerHTML = V.chat(m);
        app.classList.toggle("messenger", m.chat.mode === "messenger");
        if (keep) {
          const i = $("#input"); i.value = keep.v; autoGrow(i);
          if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (e) {} }
        }
        if (scroll != null) $("#feed").scrollTop = scroll;
        if (S.find) applyFind(false);
      } else {
        app.classList.remove("messenger");
        $("#stage").innerHTML = V.home(m);
      }
      app.classList.toggle("generating", !!S.gen);
    }
    function renderFeed() {
      if (S.view === "assist") return renderStage();
      const inner = $("#feed-inner");
      if (!inner) return renderStage();
      inner.innerHTML = V.feed(vm());
      const head = $(".chat-head");
      if (head) head.outerHTML = V.chatHead(vm());
      const comp = $(".composer-wrap");
      if (comp) {
        const i = $("#input");
        const keep = i ? i.value : "";
        const focused = document.activeElement === i;
        comp.outerHTML = V.composer(vm());
        const ni = $("#input"); ni.value = keep; autoGrow(ni);
        if (focused) ni.focus();
      }
      $("#app").classList.toggle("generating", !!S.gen);
      if (S.find) applyFind(false);
    }
    function renderHead() { const head = $(".chat-head"); if (head) head.outerHTML = V.chatHead(vm()); }
    function renderDrawer() {
      const d = $("#drawer");
      d.classList.toggle("open", S.drawerOpen && S.view === "chat");
      $("#app").classList.toggle("drawer-open", S.drawerOpen && S.view === "chat");
      const body = $("#drawer-body");
      const scroll = body ? body.scrollTop : 0;
      d.innerHTML = S.drawerOpen && S.view === "chat" ? V.drawer(vm()) : "";
      const nb = $("#drawer-body");
      if (nb) nb.scrollTop = scroll;
      syncScrim();
    }
    function renderModal() {
      const rootEl = $("#modal-root");
      if (!S.modal) { rootEl.innerHTML = ""; return; }
      const m = vm();
      const scroll = $(".modal-body") ? $(".modal-body").scrollTop : 0;
      if (S.modal.kind === "image") {
        const im = S.modal.im, url = S.imgUrls[im.id];
        rootEl.innerHTML = `<div class="modal-wrap lightbox" data-act="modal-bg"><figure class="lb-fig"><img src="${url}" alt="">
        <figcaption><span>${R.esc(im.draw || "")}</span><span class="lb-tools">
          <button class="btn btn-sm" data-act="img-modal-regen">${R.icon("regen")}Заново</button>
          <button class="btn btn-sm" data-act="img-dl" data-mid="${S.modal.mid}" data-sw="${S.modal.sw}" data-img="${im.id}">${R.icon("download")}Скачать</button>
          <button class="icon-btn" data-act="modal-close" title="Закрыть">${R.icon("x")}</button></span></figcaption></figure></div>`;
        return;
      }
      rootEl.innerHTML = S.modal.kind === "settings" ? V.settingsModal(m, S.modal.section) : V.cardModal(m, S.modal.draft, S.modal.section);
      if (S.modal.keepScroll && $(".modal-body")) $(".modal-body").scrollTop = scroll;
      S.modal.keepScroll = false;
    }
    function renderAll() { applyLook(); renderRail(); renderStage(); renderDrawer(); renderModal(); }
    function scrollBottom() { const el = $("#feed"); if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight)); }
    function syncScrim() {
      const railOpen = $("#rail").classList.contains("open");
      const drawerOverlay = S.drawerOpen && S.view === "chat" && narrow();
      $("#scrim").hidden = !(railOpen || drawerOverlay);
    }
    function openSettings(section) {
      closePop();
      S.modal = { kind: "settings", section: section || (S.modal && S.modal.kind === "settings" ? S.modal.section : "models") };
      renderModal();
    }
    // После смены настроек: пересобрать Prism и перерисовать то, что от них зависит.
    function refreshAfterSettings() {
      svc().prism.refresh();
      renderRail();
      if (S.view === "chat") renderFeed(); else renderStage();
      S.modal && (S.modal.keepScroll = true);
      renderModal();
    }

    /* ── Поповеры ──────────────────────────────────────────────────────── */
    function openPop(html, anchor) {
      const rootEl = $("#pop-root");
      rootEl.innerHTML = `<div class="pop" role="menu">${html}</div>`;
      const pop = rootEl.firstChild;
      const r = anchor.getBoundingClientRect();
      const h = pop.offsetHeight, w = pop.offsetWidth;
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      let left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
      if (r.left + w < window.innerWidth - 8 && anchor.closest(".composer")) left = Math.max(8, r.left);
      pop.style.top = top + "px";
      pop.style.left = left + "px";
      S.pop = anchor;
    }
    function closePop() { $("#pop-root").innerHTML = ""; S.pop = null; }

    /* ── Поиск по чату ─────────────────────────────────────────────────── */
    function applyFind(jump) {
      const feedEl = $("#feed-inner");
      const q = (S.find.q || "").trim().toLowerCase();
      const countEl = $("#find-count");
      if (!feedEl) return;
      if (!q) { if (countEl) countEl.textContent = ""; return; }
      const marks = [];
      $$(".prose, .bub", feedEl).forEach((rootEl) => {
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          const low = node.nodeValue.toLowerCase();
          let i = low.indexOf(q);
          if (i < 0) continue;
          const frag = document.createDocumentFragment();
          let pos = 0;
          while (i >= 0) {
            frag.appendChild(document.createTextNode(node.nodeValue.slice(pos, i)));
            const mk = document.createElement("mark");
            mk.textContent = node.nodeValue.slice(i, i + q.length);
            frag.appendChild(mk); marks.push(mk);
            pos = i + q.length;
            i = low.indexOf(q, pos);
          }
          frag.appendChild(document.createTextNode(node.nodeValue.slice(pos)));
          node.parentNode.replaceChild(frag, node);
        }
      });
      S.find.total = marks.length;
      if (S.find.idx >= marks.length) S.find.idx = 0;
      if (countEl) countEl.textContent = marks.length ? `${S.find.idx + 1} из ${marks.length}` : "нет";
      const cur = marks[S.find.idx];
      if (cur) { cur.classList.add("cur"); if (jump) cur.scrollIntoView({ block: "center", behavior: "smooth" }); }
    }
    function runFind(jump) { $("#feed-inner").innerHTML = V.feed(vm()); applyFind(jump); }

    /* ── Потоковая отрисовка ответа ────────────────────────────────────── */
    let paintQueued = false;
    function paintStreaming() {
      if (paintQueued) return;
      paintQueued = true;
      requestAnimationFrame(() => {
        paintQueued = false;
        if (!S.gen) return;
        const el = document.getElementById("text-" + S.gen.msgId);
        if (!el) return;
        const txt = IC.stripDrawsForDisplay(SC.stripForDisplay(OA.splitThink(S.gen.raw).text));
        if (ctx.chat().mode === "messenger") {
          el.innerHTML = R.bubbles(txt).map((p) => `<div class="bub">${R.esc(p)}</div>`).join("") + `<div class="bub typing"><i></i><i></i><i></i></div>`;
        } else el.innerHTML = R.rpText(S.gen.prefix + txt);
        const box = $("#feed");
        if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
      });
    }
    let assistPaintQueued = false;
    function paintAssist() {
      if (assistPaintQueued) return;
      assistPaintQueued = true;
      requestAnimationFrame(() => {
        assistPaintQueued = false;
        if (!S.gen || !S.gen.assist) return;
        const el = document.getElementById("text-" + S.gen.msgId);
        if (!el) return;
        el.innerHTML = R.md(OA.splitThink(S.gen.raw).text);
        const box = $("#feed");
        if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
      });
    }

    // Запомнить, что открыто, чтобы после перезагрузки вернуться туда же.
    function rememberUi() {
      ctx.DB.setSetting("ui", { chatId: S.view === "chat" ? S.chatId : null, drawerOpen: S.drawerOpen, view: S.view, assistId: S.view === "assist" && S.assist && S.assist.messages.length ? S.assist.id : null });
    }

    return {
      $, $$, narrow, toast, vm, applyLook, autoGrow,
      renderRail, renderStage, renderFeed, renderHead, renderDrawer, renderModal, renderAll, scrollBottom, syncScrim,
      openSettings, refreshAfterSettings, openPop, closePop, applyFind, runFind, paintStreaming, paintAssist, rememberUi,
    };
  }

  PRP.shell = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/controllers/chat.js */
/* Prism RP — контроллер чата: отправка, генерация, варианты, правка, удаление, режим, поиск, меню чата.
   Обработчики тонкие: прочитать ввод → вызвать сервис → перерисовать. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.chat = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $ } = ui;

    async function sendUser() {
      const input = $("#input");
      if (!input) return;
      const text = input.value.trim();
      if (!text || S.gen) return;
      if (S.view === "assist") { input.value = ""; ui.autoGrow(input); return svc.assist.send(text); }
      input.value = "";
      ui.autoGrow(input);
      await svc.chat.addUserMessage(text);
      ui.renderFeed();
      ui.scrollBottom();
      await svc.gen.generate();
    }
    async function afterBranchChange() {
      svc.prism.refresh();
      ui.renderFeed();
      if (S.drawerOpen) ui.renderDrawer();
    }

    const actions = {
      send: sendUser,
      stop: () => svc.gen.stop(),
      regen: (t) => svc.gen.generate(t.dataset.id, "regen"),
      continue: (t) => svc.gen.generate(t.dataset.id, "continue"),
      swipe: async (t) => {
        if (S.gen) return;
        const r = await svc.chat.swipe(t.dataset.id, +t.dataset.dir);
        if (r === "regen") return svc.gen.generate(t.dataset.id, "regen");
        if (r) await afterBranchChange();
      },
      edit: (t) => { S.editingMsg = t.dataset.id; ui.renderFeed(); const e = document.getElementById("edit-" + t.dataset.id); if (e) { e.focus(); e.style.height = Math.min(e.scrollHeight + 4, 520) + "px"; } },
      "save-edit": async (t) => {
        if (!S.messages.find((x) => x.id === t.dataset.id)) return;
        S.editingMsg = null;
        await svc.chat.saveEdit(t.dataset.id, document.getElementById("edit-" + t.dataset.id).value);
        await afterBranchChange();
      },
      "cancel-edit": () => { S.editingMsg = null; ui.renderFeed(); },
      delete: async (t) => {
        if (S.gen) return;
        if (!S.messages.find((x) => x.id === t.dataset.id) || !confirm("Удалить это сообщение и всё, что идёт после него в этой ветке?")) return;
        await svc.chat.deleteFrom(t.dataset.id);
        svc.prism.refresh();
        ui.renderFeed();
        ui.renderRail();
        if (S.drawerOpen) ui.renderDrawer();
      },
      mode: async (t) => { const c = ctx.chat(); if (c.mode === t.dataset.mode) return; c.mode = t.dataset.mode; await svc.chat.putChat(c); svc.prism.refresh(); ui.renderStage(); ui.renderRail(); ui.scrollBottom(); },
      find: () => { S.find = S.find ? null : { q: "", idx: 0 }; ui.renderStage(); const f = $("#find-q"); if (f) f.focus(); },
      "find-close": () => { S.find = null; ui.renderStage(); },
      "find-next": () => { if (!S.find.total) return; S.find.idx = (S.find.idx + 1) % S.find.total; ui.runFind(true); },
      "find-prev": () => { if (!S.find.total) return; S.find.idx = (S.find.idx - 1 + S.find.total) % S.find.total; ui.runFind(true); },
      "chat-menu": (t) => ui.openPop(V.chatMenu(ui.vm()), t),
      "model-pop": (t) => ui.openPop(V.modelPop(ui.vm()), t),
      "new-chat": (t) => { ui.closePop(); nav.newChat(t.dataset.mode); },
      "rename-chat": async () => {
        ui.closePop();
        const c = ctx.chat();
        const name = prompt("Название чата", c.title || "");
        if (name == null) return;
        c.title = name.trim() || c.title; await svc.chat.putChat(c); ui.renderStage(); ui.renderRail();
      },
      "export-chat": () => { ui.closePop(); const e = svc.chat.exportText(); ctx.files.download(e.name, e.text, "text/plain;charset=utf-8"); },
      "delete-chat": async () => {
        ui.closePop();
        const c = ctx.chat();
        if (!c || !confirm("Удалить этот чат? Вместе с ним удалится опыт персонажа, накопленный в этом мире.")) return;
        await svc.chat.deleteChat(c);
        nav.goHome();
      },
    };

    function input(t) {
      if (t.id === "input") ui.autoGrow(t);
      if (t.id === "find-q") { S.find.q = t.value; S.find.idx = 0; ui.runFind(true); }
    }
    function key(e, t) {
      if (t.id === "input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendUser(); return true; }
      if (t.id === "find-q" && e.key === "Enter") { e.preventDefault(); (e.shiftKey ? actions["find-prev"] : actions["find-next"])(); return true; }
      return false;
    }
    // Ctrl+F в чате — открыть поиск или перейти в его поле.
    function shortcut(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && S.view === "chat") { e.preventDefault(); if (!S.find) actions.find(); else { const f = $("#find-q"); if (f) f.focus(); } return true; }
      return false;
    }

    return { actions, input, key, shortcut };
  };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/controllers/drawer.js */
/* Prism RP — контроллер выдвижной панели: сцена (ручные правки), опыт (форма записи), Prism (предпросмотр). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const SC = PRP.scene, U = PRP.util;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.drawer = function (ctx) {
    const { S, ui, svc } = ctx;
    const { $ } = ui;
    const op = (...a) => svc.chat.op(...a);

    // Ручные изменения сцены → в ветку; затем Prism, панель и шапка.
    async function applySceneOps(ops) {
      if (!(await svc.chat.applySceneOps(ops))) return;
      svc.prism.refresh();
      ui.renderDrawer();
      ui.renderHead();
    }

    // Форма записи опыта → черновик (S.expDraft).
    function collectExp() {
      const d = S.expDraft;
      if (!d || !$("#x-event")) return d;
      d.event = $("#x-event").value;
      d.interpretation = $("#x-interp").value;
      d.consequences = $("#x-cons").value;
      d.status = $("#x-status").value;
      const aboutUser = $("#x-about-user").checked;
      d.about = (d.about || []).filter((a) => a !== "user");
      if (aboutUser) d.about.unshift("user");
      return d;
    }

    const actions = {
      drawer: () => { S.drawerOpen = !S.drawerOpen; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      "drawer-close": () => { S.drawerOpen = false; ui.rememberUi(); ui.renderDrawer(); ui.renderFeed(); },
      tab: (t) => { collectExp(); S.tab = t.dataset.tab; if (S.tab === "prism") svc.prism.refresh(); ui.renderDrawer(); },
      "open-prism": () => { S.tab = "prism"; S.drawerOpen = true; svc.prism.refresh(); ui.renderDrawer(); ui.renderFeed(); },
      "prism-preview": () => { svc.prism.refresh(); ui.renderDrawer(); ui.renderFeed(); },
      // Сцена
      "sc-time-set": () => {
        const d = $("#sc-date").value.trim(), tm = $("#sc-time").value.trim();
        if (d && !/^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(d)) { ui.toast("Дата в виде 14.05 или 14.05.2026", true); return; }
        const v = [d, tm].filter(Boolean).join(" ");
        if (v) applySceneOps([op(null, "time", v)]);
      },
      "sc-shift": (t) => applySceneOps([op(null, "time", t.dataset.v)]),
      "sc-leave": (t) => applySceneOps([op(null, "leave", t.dataset.name)]),
      "sc-enter": (t) => applySceneOps([op(null, "enter", t.dataset.name)]),
      "sc-remove": (t) => applySceneOps([op(t.dataset.name, "remove", t.dataset.item)]),
      "scene-init-save": async () => { const c = ctx.chat(); c.sceneInit = $("#scene-init").value.trim(); await svc.chat.putChat(c); svc.prism.refresh(); ui.renderDrawer(); ui.renderFeed(); ui.toast("Начальная сцена сохранена."); },
      // Опыт
      "to-exp": (t) => {
        S.expDraft = svc.exp.draftFromMessage(t.dataset.id);
        S.tab = "memory";
        S.drawerOpen = true;
        ui.renderDrawer();
        ui.renderFeed();
        setTimeout(() => { const e = $("#x-event"); if (e) e.focus(); }, 280);
      },
      "exp-new": () => { S.expDraft = svc.exp.blankDraft(); ui.renderDrawer(); },
      "exp-edit": (t) => { S.expDraft = U.clone(svc.exp.find(t.dataset.id)); ui.renderDrawer(); },
      "exp-cancel": () => { S.expDraft = null; ui.renderDrawer(); },
      "exp-save": async () => {
        const err = await svc.exp.save(collectExp());
        if (err) { ui.toast(err, true); return; }
        S.expDraft = null;
        svc.prism.refresh();
        ui.renderDrawer();
        ui.toast("Событие сохранено в опыт.");
      },
      "exp-del": async () => {
        if (!confirm("Удалить это событие из опыта?")) return;
        await svc.exp.remove(S.expDraft.id);
        S.expDraft = null; svc.prism.refresh(); ui.renderDrawer();
      },
      "exp-assign": async (t) => {
        if (!svc.exp.find(t.dataset.id) || !confirm("Привязать эту запись к текущему чату? Она станет частью этого мира и будет видна во всех его ветках.")) return;
        await svc.exp.assign(t.dataset.id);
        svc.prism.refresh(); ui.renderDrawer();
        ui.toast("Запись привязана к этому чату.");
      },
      "x-val": (t) => { collectExp().valence = +t.dataset.v; ui.renderDrawer(); },
      "x-weight": (t) => { collectExp().weight = +t.dataset.v; ui.renderDrawer(); },
      "x-domain-del": (t) => { const d = collectExp(); d.domains = d.domains.filter((x) => x !== t.dataset.v); ui.renderDrawer(); },
    };

    function change(t) {
      if (t.dataset.scTop) { applySceneOps([op(null, t.dataset.scTop, t.value.trim() || "-")]); return true; }
      if (t.dataset.scField) { applySceneOps([op(t.dataset.name, t.dataset.scField, t.value.trim() || "-")]); return true; }
      if (t.dataset.scRel) { applySceneOps([op(t.dataset.scRel, "relset", t.value + " поправлено вручную")]); return true; }
      return false;
    }
    function input(t) {
      if (t.dataset.scRel) { const o = $("#rel-out"); if (o) o.textContent = `${SC.relWord(+t.value)} (${+t.value > 0 ? "+" : ""}${t.value})`; }
    }
    function key(e, t) {
      if (e.key === "Enter" && t.classList && t.classList.contains("chip-add")) {
        e.preventDefault();
        const v = t.value.trim();
        if (!v) return true;
        if (t.dataset.scAdd) applySceneOps([op(t.dataset.scAdd, "add", v)]);
        else if (t.id === "sc-enter-new") applySceneOps([op(null, "enter", v)]);
        else if (t.id === "x-domain-add") { const d = collectExp(); v.split(",").map((s) => s.trim()).filter(Boolean).forEach((x) => { if (!d.domains.includes(x)) d.domains.push(x); }); ui.renderDrawer(); setTimeout(() => { const n = $("#x-domain-add"); if (n) n.focus(); }, 0); }
        return true;
      }
      if (e.key === "Enter" && t.tagName === "INPUT" && (t.dataset.scTop || t.dataset.scField)) { t.blur(); return true; }
      return false;
    }

    return { actions, change, input, key };
  };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/controllers/cards.js */
/* Prism RP — контроллер карточек: импорт, редактор персонажа (форма → черновик), сохранение, экспорт, удаление. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.cards = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $, $$ } = ui;

    function openCardEditor(cd) {
      S.modal = { kind: "card", section: "main", draft: svc.cards.draft(cd) };
      ui.renderModal();
      setTimeout(() => { const n = $("#cf-name"); if (n && !S.modal.draft.name) n.focus(); }, 30);
    }
    // Поля открытого раздела редактора → черновик (S.modal.draft).
    function collectCard() {
      const d = S.modal.draft;
      const map = { "cf-name": "name", "cf-desc": "description", "cf-pers": "personality", "cf-scen": "scenario", "cf-first": "firstMes", "cf-ex": "mesExample", "cf-sys": "systemPrompt", "cf-post": "postHistory", "cf-creator": "creator", "cf-version": "version", "cf-notes": "creatorNotes" };
      $$("[data-cf]").forEach((el) => {
        const id = el.dataset.cf;
        if (map[id]) d[map[id]] = el.value;
        else if (id === "cf-tags") d.tags = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      });
      if ($("[data-alt]") || S.modal.section === "greet") {
        d.altGreetings = (d.altGreetings || []).slice();
        $$("[data-alt]").forEach((el) => { d.altGreetings[+el.dataset.alt] = el.value; });
      }
      if ($("[data-ci]") || $("[data-card-lora-name]")) {
        d.image = Object.assign({}, d.image);
        $$("[data-ci]").forEach((el) => { d.image[el.dataset.ci] = el.value; });
        d.image.loras = $$("[data-card-lora-name]").map((el) => {
          const w = $(`[data-card-lora-w="${el.dataset.cardLoraName}"]`);
          return { name: el.value.trim(), weight: w && w.value !== "" ? Number(w.value) : 1 };
        });
      }
      $$("[data-lore]").forEach((el) => {
        const e = d.lore[+el.dataset.lore];
        if (!e) return;
        const k = el.dataset.k;
        if (k === "keys" || k === "secondary_keys") e[k] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
        else if (k === "content" || k === "comment" || k === "position") e[k] = el.value;
        else if (k === "insertion_order") e[k] = el.value === "" ? 0 : Number(el.value) || 0;
        else e[k] = el.checked;
      });
      return d;
    }
    const keepScroll = () => { S.modal.keepScroll = true; ui.renderModal(); };

    const actions = {
      import: () => $("#file-card").click(),
      "new-card": () => openCardEditor(null),
      "open-card": (t) => nav.openCard(t.dataset.id),
      "edit-card": (t) => { ui.closePop(); const id = t.dataset.id; openCardEditor(id ? S.cards.find((x) => x.id === id) : ctx.card()); },
      "card-section": (t) => { collectCard(); S.modal.section = t.dataset.section; ui.renderModal(); },
      "card-save": async () => {
        const r = await svc.cards.save(collectCard());
        if (r.error) { ui.toast(r.error, true); S.modal.section = "main"; ui.renderModal(); return; }
        S.modal = null;
        ui.renderAll();
        ui.toast(r.isNew ? `${r.card.name} создан(а). Нажмите на портрет, чтобы начать.` : "Изменения сохранены.");
      },
      "avatar-pick": () => { collectCard(); $("#file-avatar").click(); },
      "lore-add": () => { const d = collectCard(); d.lore = (d.lore || []).concat([{ keys: [], secondary_keys: [], selective: false, content: "", comment: "", enabled: true, constant: false, case_sensitive: false, position: "after_char", insertion_order: (d.lore || []).length * 10 }]); keepScroll(); },
      "lore-del": (t) => { const d = collectCard(); d.lore.splice(+t.dataset.i, 1); keepScroll(); },
      "alt-add": () => { const d = collectCard(); d.altGreetings = (d.altGreetings || []).concat([""]); keepScroll(); setTimeout(() => { const el = $(`[data-alt="${d.altGreetings.length - 1}"]`); if (el) el.focus(); }, 30); },
      "alt-del": (t) => { const d = collectCard(); d.altGreetings.splice(+t.dataset.i, 1); keepScroll(); },
      "card-lora-add": () => { const d = collectCard(); d.image = d.image || {}; d.image.loras = (d.image.loras || []).concat([{ name: "", weight: 0.8 }]); keepScroll(); },
      "card-lora-del": (t) => { const d = collectCard(); d.image.loras.splice(+t.dataset.i, 1); keepScroll(); },
      "card-json": () => { const e = svc.cards.exportJson(collectCard()); ctx.files.download(e.name, e.text, "application/json"); },
      "card-png": async () => { const e = await svc.cards.exportPng(collectCard()); ctx.files.download(e.name, e.blob); },
      "card-del": async () => {
        const cd = S.modal.draft;
        if (!confirm(`Удалить «${cd.name}» вместе со всеми чатами и опытом? Это нельзя отменить.`)) return;
        await svc.cards.remove(cd);
        S.modal = null;
        ui.renderAll();
        ui.toast(`${cd.name} удалён(а).`);
      },
    };

    async function change(t) {
      if (t.id === "file-card") {
        const r = await svc.cards.importFiles([...t.files]);
        if (r.last) { S.view = "home"; ui.renderAll(); ui.toast(`Добавлен(а): ${r.last.name}`); }
        t.value = "";
        return true;
      }
      if (t.id === "file-avatar" && t.files[0]) { S.modal.draft.avatar = await ctx.files.readFile(t.files[0], "dataurl"); t.value = ""; ui.renderModal(); return true; }
      if (t.dataset.lore !== undefined && t.dataset.k === "selective" && S.modal && S.modal.kind === "card") { collectCard(); keepScroll(); return true; }
      return false;
    }

    return { actions, change };
  };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/controllers/settings.js */
/* Prism RP — контроллер настроек: модели и провайдеры, генерация, изображения, персона, вид, бэкап. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const U = PRP.util, OA = PRP.openai, V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.settings = function (ctx) {
    const { S, ui, svc, nav, DB } = ctx;
    const { $, $$ } = ui;
    const save = () => ctx.saveSettings();

    function editingProvider() { return S.settings.providers.find((p) => p.id === S.editProviderId); }
    function readProviderForm(p) {
      if (!$("#prov-name")) return;
      p.name = $("#prov-name").value.trim() || "API";
      p.baseUrl = $("#prov-url").value.trim();
      p.apiKey = $("#prov-key").value.trim();
      p.model = $("#prov-model").value.trim();
      p.extendedSamplers = $("#prov-ext").checked;
    }
    function collectImgForm() {
      const c = S.settings.images;
      $$("[data-imgcfg]").forEach((el) => {
        const k = el.dataset.imgcfg;
        c[k] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value.trim();
      });
      delete c.loras; // LoRA живут только в карточках персонажей
    }

    const actions = {
      settings: (t) => ui.openSettings(t.dataset.section),
      "cycle-theme": async () => {
        const ids = V.THEMES.map((t) => t.id);
        S.settings.theme = ids[(ids.indexOf(S.settings.theme) + 1) % ids.length];
        ui.applyLook(); await save();
        ui.toast("Тема: " + V.THEMES.find((t) => t.id === S.settings.theme).name);
      },
      theme: async (t) => { S.settings.theme = t.dataset.id; ui.applyLook(); await save(); S.modal.keepScroll = true; ui.renderModal(); },
      "pick-provider": async (t) => {
        if (t.closest("[data-act=prov-edit]")) return;
        S.settings.activeProvider = t.dataset.id; await save(); ui.closePop(); ui.refreshAfterSettings();
      },
      "pick-model": async (t) => {
        const p = S.settings.providers.find((x) => x.id === ctx.provider().id);
        p.model = t.dataset.model; await save(); ui.closePop(); ui.refreshAfterSettings();
      },
      "pick-preset": async (t) => {
        S.settings.samplerPreset = t.dataset.id;
        const pr = V.SAMPLER_PRESETS.find((x) => x.id === t.dataset.id);
        if (pr) Object.assign(S.settings.sampler, pr.v);
        await save(); ui.closePop(); ui.refreshAfterSettings();
      },
      // Провайдеры
      "prov-add": async (t) => {
        const pr = OA.PRESETS.find((x) => x.id === t.dataset.preset);
        const p = { id: U.uid("prov"), presetId: pr.id, name: pr.id === "custom" ? "Мой API" : pr.name, baseUrl: pr.baseUrl, apiKey: "", model: "", extendedSamplers: pr.extendedSamplers };
        S.settings.providers.push(p);
        S.settings.activeProvider = p.id;
        S.editProviderId = p.id;
        await save(); ui.refreshAfterSettings();
        setTimeout(() => { const el = $(pr.baseUrl ? (pr.local ? "#prov-model" : "#prov-key") : "#prov-url"); if (el) el.focus(); }, 30);
      },
      "prov-edit": (t, e) => { e.stopPropagation(); S.editProviderId = t.dataset.id; S.modal.keepScroll = true; ui.renderModal(); },
      "prov-close": () => { const p = editingProvider(); if (p) readProviderForm(p); save(); S.editProviderId = null; ui.refreshAfterSettings(); },
      "prov-save": async () => { readProviderForm(editingProvider()); await save(); ui.refreshAfterSettings(); ui.toast("Сохранено."); },
      "prov-del": async () => {
        const p = editingProvider();
        if (!confirm(`Удалить «${p.name}»?`)) return;
        S.settings.providers = S.settings.providers.filter((x) => x !== p);
        if (S.settings.activeProvider === p.id) S.settings.activeProvider = (ctx.providers()[0] || {}).id || "";
        S.editProviderId = null;
        await save(); ui.refreshAfterSettings();
      },
      "prov-models": async () => {
        const p = editingProvider(); readProviderForm(p);
        try { p.models = await OA.listModels(p); if (!p.model && p.models[0]) p.model = p.models[0]; await save(); ui.refreshAfterSettings(); ui.toast(`Найдено моделей: ${p.models.length}`); }
        catch (err) { ui.toast(err.message, true); }
      },
      "persona-save": async () => {
        S.settings.persona = { name: $("#p-name").value.trim() || "Пользователь", description: $("#p-desc").value,
          image: { view: $("#p-view").value, appearance: $("#p-appearance").value, povTags: $("#p-povtags").value.trim() } };
        await save(); ui.refreshAfterSettings(); ui.toast("Сохранено.");
      },
      // Изображения
      "img-backend": (t) => {
        // Сначала перерисовать (синхронно), потом сохранить: иначе ввод в новое поле во время сохранения теряется.
        collectImgForm(); S.settings.images.backend = t.dataset.id; S.modal.keepScroll = true; ui.renderModal(); save();
      },
      "img-lists": async () => {
        collectImgForm(); await save();
        try {
          const out = await svc.images.fetchLists();
          await save();
          ui.toast(`Сервер на связи: моделей ${out.models.length}, LoRA ${out.loras.length}.`);
        } catch (e) { ui.toast(e.message, true); }
        S.modal.keepScroll = true; ui.renderModal();
      },
      // Данные
      backup: async () => ctx.files.download(`prism-rp-бэкап-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await DB.exportAll()), "application/json"),
      restore: () => $("#file-backup").click(),
    };

    async function change(t) {
      if (t.id === "file-backup" && t.files[0]) {
        const data = JSON.parse(await ctx.files.readFile(t.files[0], "text"));
        const replace = confirm("Заменить текущие данные бэкапом?\n\nОК — заменить, Отмена — добавить к существующим.");
        await DB.importAll(data, replace);
        t.value = "";
        S.modal = null; S.view = "home";
        await nav.loadAll(); ui.renderAll();
        ui.toast("Бэкап загружен.");
        return true;
      }
      if (t.dataset.imgcfg !== undefined) { collectImgForm(); await save(); return true; }
      if (t.dataset.imgCheck) { collectImgForm(); S.settings.images[t.dataset.imgCheck] = t.checked; ui.refreshAfterSettings(); await save(); return true; }
      if (t.dataset.imgSel) { collectImgForm(); S.settings.images[t.dataset.imgSel] = t.value; ui.refreshAfterSettings(); await save(); return true; }
      if (t.dataset.sampler) { S.settings.sampler[t.dataset.sampler] = t.value === "" ? null : +t.value; S.settings.samplerPreset = "custom"; await save(); ui.refreshAfterSettings(); return true; }
      if (t.dataset.setText) { S.settings[t.dataset.setText] = t.value; await save(); return true; }
      if (t.dataset.setNum) { S.settings[t.dataset.setNum] = +t.value; await save(); ui.refreshAfterSettings(); return true; }
      if (t.dataset.setRange) { S.settings[t.dataset.setRange] = +t.value; ui.applyLook(); await save(); return true; }
      if (t.dataset.set) { S.settings[t.dataset.set] = t.checked; await save(); ui.refreshAfterSettings(); if (S.drawerOpen) ui.renderDrawer(); return true; }
      return false;
    }
    function input(t) {
      if (t.dataset.setRange) { const o = $("#fs-out"); if (o) o.textContent = t.value; document.documentElement.style.setProperty("--prose-fs", t.value + "px"); }
    }

    return { actions, change, input };
  };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/controllers/images.js */
/* Prism RP — контроллер картинок в чате: нарисовать, перерисовать, закрепить seed, скачать, удалить, просмотр. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.images = function (ctx) {
    const { S, ui, svc } = ctx;
    const findImg = (t) => svc.images.find(t.dataset.mid, t.dataset.sw, t.dataset.img);
    const newSeed = () => Math.floor(Math.random() * 1e9);

    const actions = {
      draw: (t) => svc.images.drawFromMessage(t.dataset.id),
      "img-regen": (t) => { const { msg, sw, im } = findImg(t); if (im) svc.images.draw(msg, sw, null, im, { seed: newSeed() }); },
      "img-pin": async (t) => {
        const { im } = findImg(t);
        if (!im || im.seed == null) { ui.toast("У этой картинки нет seed.", true); return; }
        const cd = await svc.images.pinSeed(im.seed);
        ui.toast(`Seed ${im.seed} закреплён за ${cd.name}.`);
      },
      "img-info": (t) => { const { im } = findImg(t); if (im) ui.openPop(V.imageInfo(im), t); },
      "img-dl": (t) => {
        const { im } = findImg(t);
        const url = im && S.imgUrls[im.id];
        if (url) fetch(url).then((r) => r.blob()).then((b) => ctx.files.download(`${ctx.card().name} ${im.seed != null ? im.seed : im.id}.png`, b));
      },
      "img-del": async (t) => {
        const { msg, sw, im } = findImg(t);
        if (!im) return;
        await svc.images.remove(msg, sw, im);
        ui.renderFeed();
      },
      "img-view": (t) => { const { im } = findImg(t); if (im) { S.modal = { kind: "image", im, mid: t.dataset.mid, sw: t.dataset.sw }; ui.renderModal(); } },
      "img-modal-regen": () => {
        const { mid, sw, im } = S.modal;
        const msg = S.messages.find((x) => x.id === mid);
        S.modal = null; ui.renderModal();
        svc.images.draw(msg, msg.swipes[+sw], null, im, { seed: newSeed() });
      },
    };

    return { actions };
  };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/controllers/assist.js */
/* Prism RP — контроллер ассистента: разговоры, контекст (персонаж и чат), копирование, другой ответ, правка. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const V = PRP.views;

  PRP.controllers = PRP.controllers || {};
  PRP.controllers.assist = function (ctx) {
    const { S, ui, svc, nav } = ctx;
    const { $ } = ui;
    const saveConv = async () => { await svc.assist.save(); ui.rememberUi(); };
    const copy = async (text) => { await ctx.files.copyText(text); ui.toast("Скопировано."); };

    const actions = {
      assist: () => nav.openAssist(S.assist && S.assist.messages.length ? S.assist.id : null),
      "assist-new": () => { ui.closePop(); if (S.assist && !S.assist.messages.length) { $("#input") && $("#input").focus(); return; } nav.openAssist(null, S.assist ? { cardId: S.assist.ctx.cardId, chatId: S.assist.ctx.chatId } : null); },
      "assist-open": (t) => { ui.closePop(); nav.openAssist(t.dataset.id); },
      "assist-list": (t) => ui.openPop(V.assistListPop(ui.vm()), t),
      "assist-ctx": (t) => ui.openPop(V.assistCtxPop(ui.vm()), t),
      "assist-pick-card": async (t) => {
        const a = S.assist; a.ctx.cardId = t.dataset.id || null; a.ctx.chatId = null;
        if (a.messages.length) await saveConv();
        ui.renderStage();
        const anchor = $("[data-act=assist-ctx]");
        if (a.ctx.cardId && anchor) ui.openPop(V.assistCtxPop(ui.vm()), anchor); else ui.closePop();
      },
      "assist-pick-chat": async (t) => {
        const a = S.assist; a.ctx.chatId = t.dataset.id || null;
        if (a.messages.length) await saveConv();
        ui.closePop(); ui.renderStage();
      },
      "assist-about-chat": () => { ui.closePop(); nav.openAssist(null, { cardId: S.cardId, chatId: S.chatId }); },
      "assist-starter": (t) => { if (S.gen) return; svc.assist.send(t.dataset.q); },
      "assist-copy": (t) => { const m = S.assist.messages.find((x) => x.id === t.dataset.id); if (m) copy(m.text); },
      "copy-code": (t) => { const c = t.parentElement.querySelector("code"); if (c) copy(c.textContent); },
      "assist-regen": async (t) => { if (S.gen) return; await svc.assist.cutFrom(t.dataset.id); await svc.assist.generate(); },
      "assist-edit": async (t) => {
        if (S.gen) return;
        const removed = await svc.assist.cutFrom(t.dataset.id);
        ui.renderStage();
        const i = $("#input"); if (i && removed) { i.value = removed[0].text; ui.autoGrow(i); i.focus(); }
      },
      "assist-msg-del": async (t) => { if (S.gen) return; await svc.assist.cutFrom(t.dataset.id); ui.renderStage(); },
      "assist-del": async () => {
        const a = S.assist;
        if (!a || S.gen || !confirm(`Удалить разговор «${a.title}»?`)) return;
        await svc.assist.remove(a);
        nav.openAssist(null);
        ui.toast("Разговор удалён.");
      },
    };

    return { actions };
  };
})(typeof window !== "undefined" ? window : globalThis);

/* js/ui/app.js */
/* Prism RP — корень приложения (composition root).
   Здесь: состояние сессии, сборка контекста зависимостей, навигация, загрузка,
   разбор событий DOM по контроллерам, запуск. Правил предметной области здесь нет:
     события  → контроллеры (js/ui/controllers/*) — тонкие обработчики
              → сервисы (chat, generation, prism, experience, cards, images, assist)
              → чистые модули (prism/*, chat/tree, cards/ccard, images/*, assist/assist)
              → хранилище (core/store) и транспорт моделей (providers/*)
     перерисовка — через порт интерфейса (js/ui/shell.js).
   Платформонезависимо: на Perchance добавляется провайдер ai-text-plugin, везде доступны
   OpenAI-совместимые API. Данные — в IndexedDB текущего сайта, переезд — через бэкап JSON. */
(function () {
  "use strict";
  const PRP = window.PRP;
  const { util: U, store: DB, settings: ST, perchance: PC, imgBackends: IB, imgCompile: ICP } = PRP;

  /* ── Состояние сессии ────────────────────────────────────────────────
     Данные: settings, cards, chats, messages (текущего чата), experience (персонажа), assistList.
     Навигация: view, cardId, chatId, assist (открытый разговор).
     Генерация (временное): gen, drawing (id картинок в работе).
     Интерфейс: drawerOpen, tab, find, homeQuery, modal, editProviderId, pop, editingMsg, expDraft.
     Кэш: lastPrism (последняя сборка), imgUrls (картинки чата), imgLists (списки A1111), legacyExperience. */
  const S = {
    settings: null, cards: [], chats: [],
    view: "home", cardId: null, chatId: null, messages: [], experience: [],
    gen: null, lastPrism: null, editingMsg: null, expDraft: null,
    drawerOpen: false, tab: "scene", find: null, homeQuery: "",
    modal: null, editProviderId: null, pop: null,
    imgUrls: {}, imgLists: {}, drawing: new Set(),
    assist: null, assistList: [],
  };

  /* ── Контекст зависимостей ───────────────────────────────────────────
     Передаётся явно в сервисы и контроллеры. Сервисы не трогают DOM: перерисовку
     просят через ctx.ui; контроллеры читают DOM и вызывают сервисы. */
  const ctx = {
    S, DB,
    files: PRP.files,
    env: { perchanceImages: () => IB.available("perchance") },
    card: () => S.cards.find((c) => c.id === S.cardId) || null,
    chat: () => S.chats.find((c) => c.id === S.chatId) || null,
    persona: () => ST.persona(S.settings),
    providers: () => ST.providerList(S.settings, PC.available()),
    provider: () => ST.activeProvider(S.settings, ctx.providers()),
    contextTokens: () => ST.contextTokens(S.settings, ctx.provider(), () => PC.meta()),
    saveSettings: () => DB.setSetting("app", S.settings),
    svc: {},
    nav: {},
  };
  ctx.ui = PRP.shell.create(ctx);
  ctx.svc.chat = PRP.chatService.create(ctx);
  ctx.svc.exp = PRP.experienceService.create(ctx);
  ctx.svc.prism = PRP.prismService.create(ctx);
  ctx.svc.images = PRP.imageService.create(ctx);
  ctx.svc.gen = PRP.generationService.create(ctx);
  ctx.svc.cards = PRP.cardService.create(ctx);
  ctx.svc.assist = PRP.assistService.create(ctx);
  const { ui, svc } = ctx;
  const { $ } = ui;

  /* ── Загрузка ─────────────────────────────────────────────────────── */
  async function loadAll() {
    const saved = await DB.getSetting("app", null);
    S.settings = ST.merge(saved, { perchanceImages: IB.available("perchance") });
    S.imgLists = (await DB.getSetting("imgLists", {})) || {};
    ICP.setStore({ load: () => DB.getSetting("imgPromptCache", {}), save: (o) => DB.setSetting("imgPromptCache", o) });
    S.cards = (await DB.all("cards")).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    S.chats = await DB.all("chats");
    S.assistList = await svc.assist.loadAll();
    await svc.exp.migrate();
    const saveUi = (await DB.getSetting("ui", {})) || {};
    S.drawerOpen = !!saveUi.drawerOpen && !ui.narrow();
    if (saveUi.chatId && S.chats.some((c) => c.id === saveUi.chatId)) await openChat(saveUi.chatId, true);
    else if (saveUi.view === "assist") openAssist(saveUi.assistId, null, true);
  }

  /* ── Навигация ───────────────────────────────────────────────────── */
  async function openChat(chatId, quiet) {
    const c = S.chats.find((x) => x.id === chatId);
    if (!c) return;
    S.chatId = chatId;
    S.cardId = c.cardId;
    S.view = "chat";
    S.messages = await svc.chat.loadMessages(chatId);
    S.experience = await svc.exp.loadForCard(c.cardId);
    await svc.images.loadForChat(chatId);
    S.editingMsg = null; S.expDraft = null; S.find = null;
    svc.prism.refresh();
    ui.rememberUi();
    if (!quiet) { ui.renderAll(); ui.scrollBottom(); }
    $("#rail").classList.remove("open");
    ui.syncScrim();
  }
  function goHome() {
    S.view = "home";
    S.find = null;
    ui.rememberUi();
    $("#rail").classList.remove("open");
    ui.renderAll();
  }
  async function newChat(mode, cardId) {
    const id = await svc.chat.createChat(mode, cardId);
    if (id) await openChat(id);
  }
  async function openCard(cardId) {
    const latest = svc.chat.latestForCard(cardId);
    if (latest) return openChat(latest.id);
    return newChat("rp", cardId);
  }
  function openAssist(id, base, quiet) {
    if (S.gen) { ui.toast("Дождитесь окончания ответа или остановите его.", true); return; }
    svc.assist.pick(id, base);
    S.view = "assist";
    S.find = null;
    S.drawerOpen = S.drawerOpen && !ui.narrow();
    ui.rememberUi();
    $("#rail").classList.remove("open");
    if (!quiet) { ui.renderAll(); ui.scrollBottom(); setTimeout(() => { const i = $("#input"); if (i && !ui.narrow()) i.focus(); }, 30); }
  }
  Object.assign(ctx.nav, { loadAll, openChat, goHome, newChat, openCard, openAssist });

  /* ── Контроллеры и разбор событий ─────────────────────────────────── */
  const C = PRP.controllers;
  const controllers = [C.chat, C.drawer, C.cards, C.settings, C.images, C.assist].map((make) => make(ctx));
  const ACTS = Object.assign({
    home: goHome,
    "open-chat": (t) => openChat(t.dataset.id),
    rail: () => { $("#rail").classList.toggle("open"); ui.syncScrim(); },
    "modal-bg": (t, e) => { if (e.target === t) { S.modal = null; ui.renderModal(); } },
    "modal-close": () => { S.modal = null; ui.renderModal(); },
  }, ...controllers.map((c) => c.actions));
  const chatCtl = controllers[0];

  // Поповеры закрываются кликом мимо, кроме кнопок, которые их открывают.
  const POP_ANCHORS = "[data-act=model-pop],[data-act=chat-menu],[data-act=assist-ctx],[data-act=assist-list]";
  async function onClick(e) {
    if (S.pop && !e.target.closest(".pop") && !e.target.closest(POP_ANCHORS)) ui.closePop();
    const t = e.target.closest("[data-act]");
    if (!t || t.disabled) return;
    const fn = ACTS[t.dataset.act];
    if (!fn) return;
    if (t.dataset.act === "modal-bg" && e.target !== t) return;
    try { await fn(t, e); } catch (err) { console.error(err); ui.toast(err.message || String(err), true); }
  }
  async function onChange(e) {
    const t = e.target;
    try {
      for (const c of controllers) if (c.change && (await c.change(t))) return;
    } catch (err) { console.error(err); ui.toast(err.message || String(err), true); }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === "home-q") {
      S.homeQuery = t.value;
      const pos = t.selectionStart;
      ui.renderStage();
      const n = $("#home-q"); n.focus(); n.setSelectionRange(pos, pos);
    }
    for (const c of controllers) if (c.input) c.input(t);
  }
  function onKey(e) {
    const t = e.target;
    for (const c of controllers) if (c.key && c.key(e, t)) return;
    if (chatCtl.shortcut(e)) return;
    if (e.key === "Escape") {
      if (S.pop) return ui.closePop();
      if (S.modal) { S.modal = null; return ui.renderModal(); }
      if (S.editingMsg) { S.editingMsg = null; return ui.renderFeed(); }
      if (S.find) return ACTS["find-close"]();
      if (S.drawerOpen && ui.narrow()) return ACTS["drawer-close"]();
    }
    if ((e.key === "Enter" || e.key === " ") && t.getAttribute && t.getAttribute("role") === "button" && t.dataset.act) { e.preventDefault(); t.click(); }
  }
  function bind() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("keydown", onKey);
    $("#scrim").addEventListener("click", () => {
      $("#rail").classList.remove("open");
      if (S.drawerOpen && ui.narrow()) { S.drawerOpen = false; ui.renderDrawer(); ui.renderFeed(); }
      ui.syncScrim();
    });
    window.addEventListener("resize", () => { ui.syncScrim(); if (S.pop) ui.closePop(); });
  }

  async function init() {
    bind();
    try {
      await loadAll();
      if (!ctx.providers().some((p) => p.id === S.settings.activeProvider)) S.settings.activeProvider = (ctx.providers()[0] || {}).id || "";
      ui.renderAll();
      ui.scrollBottom();
    } catch (e) {
      console.error(e);
      S.settings = S.settings || U.clone(ST.DEFAULTS);
      ui.renderAll();
      ui.toast("Не удалось открыть хранилище браузера: " + e.message, true);
    }
  }

  PRP.app = { S, ctx, generate: (...a) => svc.gen.generate(...a), refreshPrism: () => svc.prism.refresh() };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

