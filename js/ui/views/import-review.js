/* Prism RP — экран проверки импорта карточек.
   Показывает, что распознано и куда легло, что сохранено без использования, предупреждения и ошибки.
   Импортированные указания автора показаны отдельно, с флажками «включить» — по умолчанию сняты.
   Ничего не сохраняется, пока пользователь не нажмёт «Импортировать». */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render;
  const { esc, icon } = R;

  const FORMAT = { ccv1: "Character Card V1", ccv2: "Character Card V2", ccv3: "Character Card V3", urv2: "URV v2", unknown: "не распознан" };
  const LEVEL = { error: "Ошибка", warning: "Внимание", info: "Сведения" };
  const DIR = { system: "Указание автора (системное)", postHistory: "Указание автора после истории" };

  function fieldList(d) {
    const has = (v) => !!String(v || "").trim();
    const alts = (d.altGreetings || []).length;
    const rows = [
      ["Описание", has(d.description)], ["Внешность", has(d.appearance)], ["Личность", has(d.personality)], ["Прошлое", has(d.background)],
      ["Сценарий", has(d.scenario)],
      ["Первое сообщение" + (alts ? ` + ${alts} альтернативн.` : ""), has(d.firstMes)],
      ["Примеры диалога", has(d.mesExample)],
      [`Лорбук: ${(d.lore || []).length}`, (d.lore || []).length > 0],
      ["Настройки картинок", !!(d.image && Object.keys(d.image).length)],
    ];
    return `<ul class="imp-fields">${rows.map(([n, ok]) => `<li class="${ok ? "on" : ""}">${ok ? "✓" : "—"} ${esc(n)}</li>`).join("")}</ul>`;
  }

  function directives(d, i, choice) {
    const out = [];
    for (const k of ["system", "postHistory"]) {
      const x = d.directives && d.directives[k];
      if (!x || x.origin !== "imported" || !String(x.text || "").trim()) continue;
      out.push(`<div class="imp-dir">
        <label class="check"><input type="checkbox" data-imp-dir="${i}" data-k="${k}" ${choice && choice[k] ? "checked" : ""}>
          <span><b>${DIR[k]}</b> — импортировано, выключено. Включите, только если доверяете тексту.</span></label>
        <details><summary>Текст (${x.text.length} симв.)</summary><pre class="code">${esc(x.text)}</pre></details></div>`);
    }
    return out.length ? `<div class="block-title">Указания автора</div>${out.join("")}` : "";
  }

  function sourceInfo(d) {
    const s = d.source || {};
    const parts = [];
    for (const c of s.compiled || []) {
      parts.push(`<div class="imp-note warn"><b>Собранный промпт (${esc(c.field)})</b> — дубль разложенных полей, сохранён и <b>не будет включён</b>.
        <details><summary>Показать (${c.text.length} симв.)</summary><pre class="code">${esc(c.text)}</pre></details></div>`);
    }
    const pres = Object.keys(s.preserved || {});
    if (pres.length) {
      parts.push(`<div class="imp-note">Сохранено, но не используется: ${pres.map((k) => `<span class="spec-key">${esc(k)}</span>`).join(" ")}
        <details><summary>Показать</summary><pre class="code">${esc(JSON.stringify(s.preserved, null, 2))}</pre></details></div>`);
    }
    if ((s.unmapped || []).length) parts.push(`<div class="imp-note">Неизвестные поля (хранятся в исходнике): ${s.unmapped.map((k) => `<span class="spec-key">${esc(k)}</span>`).join(" ")}</div>`);
    return parts.join("");
  }

  function item(r, i, choice) {
    const det = r.detection || {};
    const fmt = `${FORMAT[det.format] || det.format}${det.sourceType ? ` · ${det.sourceType.toUpperCase()}` : ""}`;
    const issues = (r.issues || []).filter((x) => r.ok ? x.code !== "directive-system" && x.code !== "directive-postHistory" : true);
    const list = issues.length ? `<ul class="imp-issues">${issues.map((x) => `<li class="${x.level}"><b>${LEVEL[x.level]}:</b> ${esc(x.message)}</li>`).join("")}</ul>` : "";
    if (!r.ok) {
      return `<section class="imp-item bad" data-imp-item="${i}"><h3>${icon("x")} ${esc(r.fileName || "файл")}</h3>
        <p class="hint">Формат: ${esc(fmt)}. Карточка не будет добавлена.</p>${list}</section>`;
    }
    const d = r.draft;
    return `<section class="imp-item" data-imp-item="${i}"><h3>${esc(d.name)}</h3>
      <p class="hint">${esc(r.fileName || "")} · формат: ${esc(fmt)}</p>
      ${fieldList(d)}${directives(d, i, choice)}${sourceInfo(d)}${list}</section>`;
  }

  function importReview(m, modal) {
    const items = modal.items || [];
    const n = items.filter((r) => r.ok).length;
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal narrow imp-modal" role="dialog" aria-modal="true" aria-label="Проверка импорта">
      <div class="modal-head"><h2>Проверка импорта</h2>
        <button class="icon-btn" data-act="import-cancel" title="Отмена">${icon("x")}</button></div>
      <div class="modal-body"><p class="lead">Проверьте, что распознано. Пока вы не нажмёте «Импортировать», ничего не сохраняется.</p>
        ${items.map((r, i) => item(r, i, (modal.choices || [])[i])).join("")}
        <div class="modal-foot"><button class="btn" data-act="import-cancel">Отмена</button>
          <button class="btn btn-primary" data-act="import-confirm" ${n ? "" : "disabled"}>${icon("check")}Импортировать${items.length > 1 ? ` (${n})` : ""}</button></div></div></div></div>`;
  }

  Object.assign((PRP.views = PRP.views || {}), { importReview });
})(typeof window !== "undefined" ? window : globalThis);
