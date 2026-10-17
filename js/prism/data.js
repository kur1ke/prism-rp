/* Prism RP — граница «данные / указания» для Prism (FOUNDATION-H). Чистый модуль.

   Всё, что в Prism является СВЕДЕНИЯМИ (карточка, персона, сценарий, лорбук, опыт, сцена, мир, среда переписки),
   подаётся детерминированным представлением-данными:
     • раздел начинается с пометки [данные · …] — какие это сведения и какой у них статус;
     • каждое значение — литерал JSON в одной строке: перевод строки, «###», ограждения кода или
       «Игнорируй систему» внутри текста не начинают новый раздел и не становятся указанием;
     • подписи полей пишет только код, текст пользователя или файла в подпись не попадает;
     • текст по смыслу не меняется: ничего не вырезается, не переписывается и не «очищается» моделью.
   Указания (указания автора карточки, служебные указания текущей операции) этим модулем НЕ оборачиваются.

   Эпистемический статус (общий словарь, используется там, где он нужен смыслу Prism):
     ESTABLISHED    — установлено явно (место в сцене, действующий факт мира, поле среды переписки);
     DERIVED        — выведено приложением (прошло времени, кто писал последним);
     INTERPRETATION — толкование (настроение в сцене, как персонаж понял событие тогда);
     UNKNOWN        — неизвестно: не заполняется значением по умолчанию.
   Без DOM, хранилища, сети и S. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  const STATUS = { ESTABLISHED: "установлено", DERIVED: "выведено", INTERPRETATION: "интерпретация", UNKNOWN: "неизвестно" };
  const MARK = "[данные";
  // Переводы строк, включая разделители строки и абзаца Юникода (U+2028, U+2029).
  const BREAKS = new RegExp("[\\r\\n" + String.fromCharCode(0x2028, 0x2029) + "]+", "g");

  // Значение-литерал: одна строка, кавычки, экранирование JSON. Смысл текста не меняется.
  function lit(v) { return JSON.stringify(String(v == null ? "" : v)); }
  // Однострочный текст для подписей и имён в заголовках (имя персонажа, собеседника): переводы строк → пробел.
  function oneLine(v) { return String(v == null ? "" : v).replace(BREAKS, " ").replace(/\s{2,}/g, " ").trim(); }
  const empty = (v) => v == null || (Array.isArray(v) ? !v.length : !String(v).trim());

  // Пометка в начале раздела-данных: что это и как читать.
  function note(text) { return `${MARK} · ${oneLine(text)}]`; }

  /* Строка поля: «- подпись (статус): "значение"». Пустое значение — «неизвестно» (если unknown: true) или строки нет.
     label и status — только из кода. value — строка или список строк. */
  function field(label, value, o) {
    const x = o || {};
    const st = x.status ? ` (${STATUS[x.status] || x.status}${x.statusNote ? "; " + x.statusNote : ""})` : "";
    if (empty(value)) return x.unknown ? `- ${label}: ${STATUS.UNKNOWN}` : "";
    const v = Array.isArray(value) ? value.filter((s) => !empty(s)).map(lit).join(", ") : lit(value);
    return `- ${label}${st}: ${v}`;
  }
  // Тело раздела-данных: пометка и непустые строки. Без строк — пусто (раздела нет).
  function block(noteText, lines) {
    const ls = (lines || []).filter((l) => l && String(l).trim());
    return ls.length ? [note(noteText)].concat(ls).join("\n") : "";
  }

  /* Для проверок: заголовки разделов в собранном тексте (строки, начинающиеся с «#»).
     Литералы занимают одну строку и начинаются с «- » или кавычки, поэтому заголовком быть не могут. */
  function headings(text) {
    return String(text || "").split("\n").filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.replace(/^#{1,6}\s+/, ""));
  }

  PRP.prismData = { STATUS, MARK, lit, oneLine, note, field, block, headings };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.prismData;
})(typeof window !== "undefined" ? window : globalThis);
