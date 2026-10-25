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

  // Храним оригинальные байты в варианте сообщения; лишь текстовый отрывок поступает в Prism.
  async function readChatAttachment(file) {
    const A = PRP.chatAttachments;
    const kind = A.validate(file);
    const dataUrl = await readFile(file, "dataurl");
    const full = kind === "text" ? String(await readFile(file, "text")) : "";
    return {
      name: A.fileName(file.name), kind, mime: file.type || "application/octet-stream",
      size: file.size, dataUrl,
      ...(kind === "text" ? { excerpt: full.slice(0, A.MAX_TEXT_CHARS), truncated: full.length > A.MAX_TEXT_CHARS } : {}),
    };
  }
  async function saveChatAttachment(item) {
    if (!item || !/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(item.dataUrl || "")) throw new Error("Файл недоступен.");
    const response = await fetch(item.dataUrl);
    const blob = await response.blob();
    download(item.name || "файл", blob, item.mime);
  }

  PRP.files = { download, readFile, avatarPngBytes, copyText, readChatAttachment, saveChatAttachment };
})(typeof window !== "undefined" ? window : globalThis);
