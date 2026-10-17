/* Prism RP — время переписки (TEMPORAL). Чистый модуль.

   • Моменты хранятся как ISO-строки в UTC (неизменяемы после записи сообщения);
     часовой пояс чата (IANA, например "Asia/Tokyo") влияет только на показ и на ввод «местного» времени.
   • «Сейчас» переписки: live — переданные часы (функция clock, в приложении — Date.now; в тестах — подставные);
     manual — сохранённое manualNow; само по себе не идёт и никогда не тикает.
   • Прошедшее время считается только между известными моментами; неизвестное остаётся неизвестным.
   Без DOM, хранилища, сети, таймеров и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const DEFAULT_TZ = "UTC";

  function validTimeZone(tz) {
    if (!tz || typeof tz !== "string") return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
  }
  function systemTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ; } catch (e) { return DEFAULT_TZ; }
  }
  const toMs = (iso) => { if (iso == null || iso === "") return null; const t = typeof iso === "number" ? iso : Date.parse(iso); return Number.isFinite(t) ? t : null; };
  const toIso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

  // Части местного времени в поясе tz.
  function parts(ms, tz) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const o = {};
    for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = +p.value;
    return o;
  }
  // Смещение пояса (мс) в момент ms.
  function offset(ms, tz) {
    const p = parts(ms, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }
  /* Местное «стенное» время "YYYY-MM-DDTHH:mm" в поясе tz → момент (мс UTC). null — неразборчиво. */
  function fromLocal(wall, tz) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(wall || "").trim());
    if (!m || !validTimeZone(tz)) return null;
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    let t = guess - offset(guess, tz);
    t = guess - offset(t, tz); // уточнение у границы перехода на летнее время
    return t;
  }
  // Момент → местное "YYYY-MM-DDTHH:mm" (для полей ввода).
  function toLocalInput(ms, tz) {
    if (!Number.isFinite(ms) || !validTimeZone(tz)) return "";
    const p = parts(ms, tz), z = (n) => String(n).padStart(2, "0");
    return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
  }
  // Для людей и модели: "17.10.2026, 09:20".
  function format(ms, tz) {
    if (!Number.isFinite(ms)) return "";
    const p = parts(ms, validTimeZone(tz) ? tz : DEFAULT_TZ), z = (n) => String(n).padStart(2, "0");
    return `${z(p.day)}.${z(p.month)}.${p.year}, ${z(p.hour)}:${z(p.minute)}`;
  }
  // Прошедшее время словами: "20 мин", "3 ч 5 мин", "2 дн 4 ч", "меньше минуты".
  function elapsedWords(ms) {
    if (!Number.isFinite(ms)) return "";
    if (ms < 0) return "";
    const min = Math.floor(ms / 60000);
    if (min < 1) return "меньше минуты";
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), mm = min % 60;
    if (d) return `${d} дн${h ? " " + h + " ч" : ""}`;
    if (h) return `${h} ч${mm ? " " + mm + " мин" : ""}`;
    return `${mm} мин`;
  }

  /* «Сейчас» переписки. env: { timeMode, manualNow }; clock: () => мс. → мс | null (manual без времени) */
  function nowOf(env, clock) {
    const e = env || {};
    if (e.timeMode === "manual") return toMs(e.manualNow);
    const c = typeof clock === "function" ? clock() : Date.now();
    return Number.isFinite(c) ? c : null;
  }

  PRP.messengerTime = { DEFAULT_TZ, validTimeZone, systemTimeZone, toMs, toIso, fromLocal, toLocalInput, format, elapsedWords, nowOf, offset };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.messengerTime;
})(typeof window !== "undefined" ? window : globalThis);
