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
