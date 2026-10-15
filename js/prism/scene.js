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
    return (state.chars[name] = { wear: [], pose: "", mood: "", rel: 0, relLog: [] });
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
          case "mood": ch.mood = isClear(v) ? "" : v; break;
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
  function fold(initBody, steps) {
    let st = apply(emptyState(), parseBody(initBody || "")).state;
    for (const step of steps || []) st = apply(st, step.ops, { msgId: step.msgId }).state;
    return st;
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
      if (ch.mood) bits.push("настроение (оценка): " + ch.mood);
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

  PRP.scene = { emptyState, parse, parseBody, stripForDisplay, apply, fold, describe, summaryLine, formatClock, relWord, opLabel, PROTOCOL };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.scene;
})(typeof window !== "undefined" ? window : globalThis);
