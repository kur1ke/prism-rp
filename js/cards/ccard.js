/* Prism RP — файл карточки Character Card: чтение карточки из PNG (tEXt/iTXt «chara» и «ccv3»)
   и экспорт канонической карточки обратно в JSON / PNG (V2 и V3).
   Разбор форматов при импорте — в cards/formats/* (определение формата и адаптеры). */
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

  /* ── Экспорт ────────────────────────────────────────────────────────────
     Каноническая карточка Prism (cards/model.js) → Character Card V2/V3.
     • Внешность и прошлое, которых нет в стандарте, складываются в description абзацами;
       раздельные поля Prism едут в extensions.prism_rp.fields (для обратного импорта в Prism).
     • В system_prompt / post_history_instructions попадают только ВКЛЮЧЁННЫЕ указания.
       Выключенные (например, непроверенные импортированные) хранятся в
       extensions.prism_rp.disabledDirectives — только для сохранности: при импорте это поле
       хранится в source.preserved и указанием не становится.
       Порядок для disabledDirectives (детерминированный):
         1) берётся сохранённое source.preserved.disabledDirectives (как было в файле);
         2) поверх — текущие выключенные непустые указания карточки (текущее побеждает по тому же ключу);
         3) включённые указания идут только в system_prompt / post_history_instructions;
            сохранённое значение по тому же ключу при этом остаётся в расширении как есть
            (это лишь хранение: при импорте и во время игры оно не читается).
     • Для карточек, импортированных из V2/V3, неизвестные поля data исходника сохраняются.
       Исходники других форматов (V1, URV) в экспорт не переносятся. */
  function toSpec(card, ver) {
    const CM = PRP.cardModel;
    const v3 = ver === "v3";
    const src = card.source && (card.source.format === "ccv2" || card.source.format === "ccv3") && card.source.raw && card.source.raw.data;
    const base = src ? JSON.parse(JSON.stringify(src)) : {};
    const oldBook = base.character_book || {};
    const description = [card.description, card.appearance ? "Внешность:\n" + card.appearance : "", card.background ? "Прошлое:\n" + card.background : ""]
      .map((x) => String(x || "").trim()).filter(Boolean).join("\n\n");
    const data = Object.assign(base, {
      name: card.name,
      description,
      personality: card.personality || "",
      scenario: card.scenario || "",
      first_mes: card.firstMes || "",
      mes_example: card.mesExample || "",
      creator_notes: card.creatorNotes || "",
      system_prompt: CM.activeText(card, "system"),
      post_history_instructions: CM.activeText(card, "postHistory"),
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
          const raw = e.raw && typeof e.raw === "object" && (card.source && /^ccv/.test(card.source.format)) ? JSON.parse(JSON.stringify(e.raw)) : {};
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
    } else data.character_book = Object.assign({}, oldBook, { entries: [], extensions: oldBook.extensions || {} });
    // Пространство Prism в extensions: картинки, раздельные поля, выключенные указания.
    const ext = Object.assign({}, data.extensions);
    const pr = Object.assign({}, ext.prism_rp);
    delete pr.image; delete pr.fields; delete pr.disabledDirectives; delete pr.prismCore; delete pr.customFields;
    // Stable export shape: all editable image slots exist even when empty.
    const imageDefaults = { trigger: "", aliases: "", styleTrigger: "", negative: "", seed: "", look: "", wardrobe: "", nsfw: "", loras: [], loraAdvanced: { enabled: false, rules: "" } };
    pr.image = Object.assign(imageDefaults, card.image ? JSON.parse(JSON.stringify(card.image)) : {});
    if (!Array.isArray(pr.image.loras)) pr.image.loras = [];
    pr.image.loraAdvanced = Object.assign({ enabled: false, rules: "" }, pr.image.loraAdvanced && typeof pr.image.loraAdvanced === "object" && !Array.isArray(pr.image.loraAdvanced) ? pr.image.loraAdvanced : {});
    // Ядро Prism — только данные в своём расширении (никогда не в system_prompt): при импорте оно непроверенное.
    const core = PRP.cardContext && PRP.cardContext.normCore(card.prismCore);
    pr.prismCore = core ? { schema: core.schema, identity: core.identity, traits: core.traits, voice: core.voice, durableContext: core.durableContext } : null;
    // Always include the Prism-specific slots, including empty fields.
    pr.fields = { description: card.description || "", appearance: card.appearance || "", background: card.background || "" };
    pr.customFields = CM.normalizeCustomFields(card.customFields);
    const kept = card.source && card.source.preserved && card.source.preserved.disabledDirectives;
    const dis = kept && typeof kept === "object" && !Array.isArray(kept) ? JSON.parse(JSON.stringify(kept)) : {};
    if (CM.hasDisabledText(card, "system")) dis.system = card.directives.system.text;
    if (CM.hasDisabledText(card, "postHistory")) dis.postHistory = card.directives.postHistory.text;
    if (Object.keys(dis).length) pr.disabledDirectives = dis;
    if (Object.keys(pr).length) ext.prism_rp = pr; else delete ext.prism_rp;
    data.extensions = ext;
    if (v3) {
      data.group_only_greetings = data.group_only_greetings || [];
      data.nickname = data.nickname || undefined;
      return { spec: "chara_card_v3", spec_version: "3.0", data };
    }
    delete data.assets; delete data.group_only_greetings; delete data.nickname;
    return { spec: "chara_card_v2", spec_version: "2.0", data };
  }

  PRP.ccard = { toSpec, cardJsonFromPng, embedInPng, crc32, b64ToUtf8, utf8ToB64 };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.ccard;
})(typeof window !== "undefined" ? window : globalThis);
