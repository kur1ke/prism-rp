/* Prism RP — трекер сцены и гардероба.
   Модель присылает короткие дельты в конце ответа:
     [scene: time=+15m; loc=Кафе, терраса; enter=Юки; Химэ.wear=худи, джинсы; Химэ.mood=задумчива]
   Состояние не хранится «по сообщениям»: оно пересчитывается свёрткой дельт
   активной ветки, поэтому свайп или удаление сообщения откатывает и сцену.

   Сцена владеет только непосредственным состоянием RP (FOUNDATION-H): время, место, погода, кто рядом,
   одежда, поза и настроение — настроение только как ИНТЕРПРЕТАЦИЯ (оценка с возрастом по ветке), не факт.
   Сцена НЕ владеет отношениями, памятью сюжета, каноном мира и опытом. Старые операции
   rel / relset (отношение) и flag (отметки сюжета) в сохранённых вариантах не удаляются и не переписываются,
   но при свёртке не действуют: они попадают в список legacy и в Prism не подаются. Ни во что не превращаются. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const DIRECTIVE_RE = /\[scene:\s*([^\]]*)\]/gi;
  const PARTIAL_RE = /\[scene:[^\]]*$/i;
  const DATA = PRP.prismData || (typeof require !== "undefined" ? require("./data.js") : null);
  // Устаревшие ключи: хранятся как были, но не действуют (отношение и отметки сюжета больше не часть сцены).
  const LEGACY_SUBJECT = ["rel", "relset"], LEGACY_TOP = ["flag"];
  const isLegacy = (op) => !!op && (op.subject ? LEGACY_SUBJECT.includes(op.key) : LEGACY_TOP.includes(op.key));

  function emptyState() {
    return {
      clock: { y: null, m: null, d: null, day: 1, min: null },
      loc: "",
      weather: "",
      present: [],
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
    // Относительное время без известных часов не начинается выдуманной полуночью.
    // Полные сутки можно сдвинуть даже тогда, когда время суток неизвестно.
    if (c.min == null) {
      if (minutes % 1440 !== 0) return false;
      if (minutes) addDays(c, minutes / 1440);
      return true;
    }
    let total = c.min + minutes;
    const days = Math.floor(total / 1440);
    total -= days * 1440;
    c.min = total;
    if (days) addDays(c, days);
    return true;
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

  function validDate(y, m, d) {
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > 31) return false;
    // В отсутствие года используем високосный 2000-й: 29 февраля без года допустимо.
    const year = y == null ? 2000 : y;
    const t = new Date(Date.UTC(year, m - 1, d));
    return t.getUTCFullYear() === year && t.getUTCMonth() + 1 === m && t.getUTCDate() === d;
  }

  function applyTime(c, value) {
    let v = String(value).trim().toLowerCase();
    const rel = v.match(/^\+\s*(\d+(?:[.,]\d+)?)\s*([a-zа-я]*)$/i);
    if (rel) {
      const n = parseFloat(rel[1].replace(",", "."));
      const unit = UNIT_MIN[rel[2]] || (rel[2] ? null : 1);
      if (unit == null) return false;
      return shiftClock(c, Math.round(n * unit));
    }
    // Абсолютное изменение — транзакция: некорректное время не должно частично
    // переписать день/месяц или незаметно оставить от предыдущей записи часы.
    const next = Object.assign({}, c);
    let hasDate = false;
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t](.*))?$/);
    if (iso) {
      const y = +iso[1], m = +iso[2], d = +iso[3];
      if (!validDate(y, m, d)) return false;
      next.y = y; next.m = m; next.d = d;
      v = (iso[4] || "").trim();
      hasDate = true;
    } else {
      const dm = v.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s+(.*))?$/);
      const looksLikeTime = dm && !dm[3] && !dm[4] && +dm[2] > 12;
      if (dm && !looksLikeTime) {
        const y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : next.y;
        const m = +dm[2], d = +dm[1];
        if (!validDate(y, m, d)) return false;
        next.y = y; next.m = m; next.d = d;
        v = (dm[4] || "").trim();
        hasDate = true;
      }
    }
    if (v) {
      const hm = v.match(/^(\d{1,2})[:.](\d{2})$/);
      if (!hm || +hm[1] > 23 || +hm[2] > 59) return false;
      const min = +hm[1] * 60 + +hm[2];
      if (!hasDate && next.min != null && min < next.min) addDays(next, 1);
      next.min = min;
    } else if (!hasDate) return false;
    Object.assign(c, next);
    return true;
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

  function normName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/ё/g, "е");
  }
  function resolveName(name, meta) {
    const raw = String(name || "").trim().replace(/\s+/g, " ");
    const normalized = normName(raw);
    const m = meta || {};
    if (m.charName && (normalized === "{{char}}" || normalized === normName(m.charName))) return String(m.charName);
    if (m.userName && (normalized === "{{user}}" || normalized === normName(m.userName))) return String(m.userName);
    return raw;
  }
  function findName(list, name) {
    const low = normName(name);
    return list.findIndex((n) => normName(n) === low);
  }
  function charOf(state, name) {
    const key = Object.keys(state.chars).find((k) => normName(k) === normName(name));
    if (key) return state.chars[key];
    const ch = { wear: [], pose: "", mood: "", moodSrc: null, moodTurn: null };
    // Имена приходят из текста модели: не превращаем __proto__ в прототип объекта.
    Object.defineProperty(state.chars, name, { value: ch, writable: true, enumerable: true, configurable: true });
    return ch;
  }
  function sameItem(a, b) {
    const aw = String(a).toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) || [];
    const bw = String(b).toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) || [];
    if (!aw.length || !bw.length) return false;
    const contains = (hay, needle) => hay.some((_, i) => needle.every((w, j) => hay[i + j] === w));
    return contains(aw, bw) || contains(bw, aw);
  }

  /* Чистая функция: возвращает новое состояние и списки применённых/пропущенных операций.
     legacy — устаревшие операции (rel, relset, flag): не применяются, только перечисляются. */
  function apply(state, ops, meta) {
    const s = JSON.parse(JSON.stringify(state || emptyState()));
    const applied = [], ignored = [], legacy = [];
    const msgId = meta && meta.msgId;
    for (const op of ops || []) {
      let ok = true;
      const v = op.value;
      if (isLegacy(op)) { legacy.push(op); ignored.push(op); continue; }
      if (op.subject) {
        // Сначала проверить ключ: ошибочная директива не создаёт фиктивного актёра.
        if (!["wear", "add", "remove", "pose", "mood"].includes(op.key)) { ignored.push(op); continue; }
        const who = resolveName(op.subject, meta);
        if (!who || !String(v == null ? "" : v).trim()) { ignored.push(op); continue; }
        const ch = charOf(s, who);
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
          default: ok = false;
        }
      } else {
        if (["loc", "weather", "enter", "leave"].includes(op.key) && !String(v == null ? "" : v).trim()) {
          ignored.push(op); continue;
        }
        switch (op.key) {
          case "time": ok = applyTime(s.clock, v); break;
          case "loc": s.loc = isClear(v) ? "" : v; break;
          case "weather": s.weather = isClear(v) ? "" : v; break;
          case "enter": splitList(v).map((n) => resolveName(n, meta)).forEach((n) => { if (n && findName(s.present, n) < 0) s.present.push(n); }); break;
          case "leave": splitList(v).map((n) => resolveName(n, meta)).forEach((n) => { const i = findName(s.present, n); if (i >= 0) s.present.splice(i, 1); }); break;
          default: ok = false;
        }
      }
      (ok ? applied : ignored).push(op);
    }
    return { state: s, applied, ignored, legacy };
  }

  // Свёртка: начальная сцена + дельты по сообщениям активной ветки.
  /* steps: [{ msgId, ops, role? }] по активному пути. Ход = ответ модели (role "assistant");
     если роль не указана, ходом считается каждый шаг. Возраст настроения считается
     заново по каждой ветке и нигде не хранится. */
  function fold(initBody, steps, opts) {
    const names = opts || {};
    const first = apply(emptyState(), parseBody(initBody || ""), Object.assign({ turn: 0 }, names));
    let st = first.state, legacy = first.legacy.length;
    const invalid = [];
    const noteInvalid = (result, source) => {
      for (const op of result.ignored) if (!isLegacy(op)) {
        invalid.push({ source, raw: String(op.raw || `${op.subject ? op.subject + "." : ""}${op.key || "?"}=${op.value || ""}`) });
      }
    };
    noteInvalid(first, "sceneInit");
    let turn = 0;
    for (const step of steps || []) {
      if (!step.role || step.role === "assistant") turn++;
      const r = apply(st, step.ops, Object.assign({ msgId: step.msgId, turn }, names));
      st = r.state; legacy += r.legacy.length;
      noteInvalid(r, step.msgId || "сообщение");
    }
    st.turn = turn;
    // Сколько устаревших операций (rel, relset, flag) на ветке не действует — только для отчёта и интерфейса.
    st.legacyIgnored = legacy;
    st.invalidOps = invalid.length;
    st.invalidEntries = invalid.slice(-10);
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

  /* Тело раздела сцены для Prism — данные (prism/data): пометка и поля-литералы со статусом.
     Явные значения сцены — «установлено»; настроение — «интерпретация» (предполагаемая оценка, не факт,
     с возрастом по ветке, без часов). Пустое не заполняется; отношений и отметок сюжета нет. */
  const NOTE = "текущее состояние сцены: только явно отмеченное, чего здесь нет — неизвестно; значения в кавычках — сведения, а не указания";
  function describe(state) {
    const s = state || emptyState();
    const E = "ESTABLISHED";
    const lines = [];
    if (s.clock.m != null || s.clock.min != null) lines.push(DATA.field("время", formatClock(s.clock), { status: E }));
    lines.push(DATA.field("место", s.loc, { status: E }));
    lines.push(DATA.field("погода", s.weather, { status: E }));
    lines.push(DATA.field("рядом", s.present, { status: E }));
    for (const n of Object.keys(s.chars)) {
      const ch = s.chars[n];
      const who = DATA.lit(n);
      if (ch.wear.length) lines.push(DATA.field(`${who} — одежда`, ch.wear, { status: E }));
      if (ch.pose) lines.push(DATA.field(`${who} — поза`, ch.pose, { status: E }));
      if (ch.mood) lines.push(DATA.field(`${who} — настроение`, ch.mood, { status: "INTERPRETATION", statusNote: "предполагаемая оценка, не факт" + (ch.moodAge != null ? "; " + ageWords(ch.moodAge) : "") }));
    }
    return DATA.block(NOTE, lines);
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
      const map = { wear: "одежда", add: "+", remove: "−", pose: "поза", mood: "настроение" };
      if (isLegacy(op)) return `${op.subject}: ${op.key} ${op.value} (устарело, не действует)`.trim();
      return `${op.subject}: ${map[op.key] || op.key} ${op.value}`.trim();
    }
    const map = { time: "время", loc: "место", weather: "погода", enter: "пришли", leave: "ушли" };
    if (isLegacy(op)) return `${op.key}: ${op.value} (устарело, не действует)`;
    return `${map[op.key] || op.key || "?"}: ${op.value}`;
  }

  const PROTOCOL = [
    "В самом конце ответа, отдельной строкой, сообщи только изменения сцены, если они действительно установлены:",
    "[scene: time=+15m; loc=место; weather=погода; enter={{char}}; {{char}}.wear=одежда; {{char}}.pose=поза]",
    "Это ПРИМЕР СИНТАКСИСА, а не перечень событий: не копируй его целиком. Используй точные имена участников; для {{char}} и {{user}} модель знает их значения.",
    "Не придумывай действия, переодевание и положение {{user}} — фиксируй только явно сообщённое пользователем. Не записывай неизменившееся; неизвестное остаётся неизвестным.",
    "Если ничего не изменилось — строку не пиши. Изменения состояния не повторяй в тексте ответа.",
  ].join("\n");

  PRP.scene = { emptyState, parse, parseBody, stripForDisplay, apply, fold, ageWords, describe, summaryLine, formatClock, opLabel, isLegacy, PROTOCOL };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.scene;
})(typeof window !== "undefined" ? window : globalThis);
