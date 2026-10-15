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

  PRP.render = { esc, icon, GLYPH, avatar, art, artBg, rpText, bubbles, time, day, ago, plural, hue };
})(typeof window !== "undefined" ? window : globalThis);
