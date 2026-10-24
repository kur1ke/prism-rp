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
    const nav = [["main", "Основное", "card"], ["greet", "Приветствия", "bubble"], ["prompts", "Промпты", "edit"], ["lore", "Лорбук", "book"], ["images", "Изображения", "image"], ["world", "Мир", "globe"], ["meta", "Автор и файл", "download"]];
    const lab = (label, key) => `${label}${key ? ` <span class="spec-key">${key}</span>` : ""}`;
    const f = (id, label, key, value, rows, help, ph) => `<div class="field"><label for="${id}">${lab(label, key)}</label>${rows
      ? `<textarea id="${id}" rows="${rows}" data-cf="${id}" placeholder="${esc(ph || "")}">${esc(value || "")}</textarea>` : `<input id="${id}" data-cf="${id}" value="${esc(value || "")}" placeholder="${esc(ph || "")}">`}${help ? `<span class="help">${help}</span>` : ""}</div>`;
    const dirField = (k, label, key, rows, help) => {
      const x = (d.directives && d.directives[k]) || { text: "", origin: "authored", enabled: true };
      const badge = x.origin === "imported" ? `<span class="dir-badge imported">из файла${x.reviewed ? "" : " · не проверено"}</span>` : `<span class="dir-badge">своё</span>`;
      return `<div class="field"><label for="cf-dir-${k}">${lab(label, key)} ${badge}</label>
        <textarea id="cf-dir-${k}" rows="${rows}" data-cf-dir="${k}">${esc(x.text || "")}</textarea>
        <label class="check"><input type="checkbox" data-cf-dir="${k}" ${x.enabled ? "checked" : ""}><span>Включено — отправлять модели</span></label>
        <span class="help">${help}</span></div>`;
    };
    const state = m.modal || {};
    let body = "";
    if (section === "main") {
      body = `<div class="card-edit"><div class="card-identity"><div class="portrait" style="${d.avatar ? "" : R.artBg(d.name)}">${d.avatar ? `<img src="${d.avatar}" alt="">` : esc((d.name || "?").charAt(0).toUpperCase())}
          <button class="btn btn-sm chg" data-act="avatar-pick">${icon("upload")}Портрет</button></div>
          <div class="card-identity-name">${f("cf-name", "Имя", "name", d.name)}</div></div>
        <div class="card-fields">
          ${f("cf-desc", "Описание", "description", d.description, 7, "Кто это — всё, что постоянно. Prism подаёт это модели как склонности, а не как команды.", "Студентка второго курса, ревнивая, но отходчивая…")}
          ${f("cf-app", "Внешность", "", d.appearance, 3, "При экспорте в Character Card добавляется в description абзацем «Внешность».")}
          ${f("cf-pers", "Личность", "personality", d.personality, 3, "Черты характера, манера держаться.")}
          ${f("cf-bg", "Прошлое", "", d.background, 3, "При экспорте в Character Card добавляется в description абзацем «Прошлое».")}
          ${f("cf-scen", "Сценарий", "scenario", d.scenario, 3, "Обстоятельства: где и почему всё происходит.")}
          ${f("cf-tags", "Теги", "tags", (d.tags || []).join(", "), 0, "Через запятую.")}</div></div>
        <details class="card-disclosure"><summary>Ядро для Prism — расширенная настройка</summary>
          ${coreBlock(d)}</details>
        <details class="card-disclosure" ${(d.customFields || []).length ? "open" : ""}>
          <summary>Пользовательские поля (${(d.customFields || []).length})</summary>
          <p class="hint">Поля — дополнительные сведения, а не инструкции. Передача модели включается для каждого поля отдельно. Импортированные поля всегда выключены.</p>
          ${(d.customFields || []).map((field, i) => {
            const detailOpen = !!(state.expandedCustom && state.expandedCustom[field.id]);
            const origin = field.origin;
            return `
            <div class="lore">
              <div class="row"><div class="field" style="flex:1">
                <label>Название поля</label><input data-custom="${i}" data-k="label" value="${esc(field.label || "")}" placeholder="Например: Речь, привычки, особые способности">
              </div><button type="button" class="btn btn-sm btn-ghost" data-act="custom-del" data-i="${i}" title="Удалить поле">Удалить</button></div>
              <div class="field"><label>Содержание</label><textarea data-custom="${i}" data-k="text" rows="3">${esc(field.text || "")}</textarea></div>
              <div class="row wrap">
                <label class="check"><input type="checkbox" data-custom="${i}" data-k="enabled" ${field.enabled ? "checked" : ""}><span>Передавать модели</span></label>
                <label class="check"><input type="checkbox" data-custom-more="${esc(field.id)}" ${detailOpen ? "checked" : ""}><span>Подробнее</span></label>
              </div>
              <div class="custom-field-extra" ${detailOpen ? "" : "hidden"}>
                <div class="field"><label for="cf-custom-mode-${i}">Когда передавать</label>
                  <select id="cf-custom-mode-${i}" data-custom="${i}" data-k="mode">
                    <option value="relevant" ${field.mode !== "always" ? "selected" : ""}>Когда относится к разговору</option>
                    <option value="always" ${field.mode === "always" ? "selected" : ""}>На каждом ходе, если позволяет бюджет</option>
                  </select></div>
                <p class="hint">Происхождение: ${origin && origin.imported ? `импортировано из ${esc(origin.format || "другого формата")}; исходное поле <code>${esc(origin.path || "неизвестно")}</code>.` : "создано пользователем."}</p>
              </div>
            </div>`;
          }).join("")}
          <button type="button" class="btn btn-sm" data-act="custom-add">+ Добавить поле</button>
        </details>`;
    } else if (section === "greet") {
      const alts = d.altGreetings || [];
      body = `${f("cf-first", "Первое сообщение", "first_mes", d.firstMes, 7, "С него начинается новый чат. В конце можно добавить строку [scene: …] с начальным местом и одеждой.")}
        <div class="block-title" style="margin-top:18px">${lab("Альтернативные приветствия", "alternate_greetings")}</div>
        <p class="hint" style="margin-top:0">В новом чате их можно листать стрелками под первым сообщением.</p>
        ${alts.map((g, i) => `<div class="field alt-greet"><label for="cf-alt-${i}">Приветствие ${i + 2}<button class="icon-btn" data-act="alt-del" data-i="${i}" title="Убрать">${icon("x")}</button></label><textarea id="cf-alt-${i}" rows="5" data-alt="${i}">${esc(g)}</textarea></div>`).join("")}
        <button class="btn btn-sm" data-act="alt-add">${icon("plus")}Добавить приветствие</button>`;
    } else if (section === "prompts") {
      body = `${f("cf-ex", "Примеры диалогов", "mes_example", d.mesExample, 8, "Как персонаж говорит. Каждый пример начинается с &lt;START&gt;, реплики — {{user}}: и {{char}}:", "<START>\n{{user}}: Привет.\n{{char}}: …")}
        <div class="block-title" style="margin-top:18px">Указания автора</div>
        <p class="hint" style="margin-top:0">Отдельный уровень власти: в модель уходят, только когда включены. Указания из импортированного файла приходят выключенными — включите их, если доверяете тексту.</p>
        ${dirField("system", "Системное указание", "system_prompt", 4, "Идёт отдельным разделом «указания автора» в начале контекста.")}
        ${dirField("postHistory", "Указание после истории", "post_history_instructions", 3, "Идёт в конец контекста, ближе всего к ответу. Общий выключатель — в настройках.")}`;
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
    } else if (section === "world") {
      body = PRP.views.lensSection(m, d);
    } else if (section === "images") {
      const im = d.image || {};
      const fi = (k, label, rows, help, ph) => `<div class="field"><label>${label}</label>${rows ? `<textarea data-ci="${k}" rows="${rows}" placeholder="${esc(ph || "")}">${esc(im[k] || "")}</textarea>` : `<input data-ci="${k}" value="${esc(im[k] != null ? im[k] : "")}" placeholder="${esc(ph || "")}">`}${help ? `<span class="help">${help}</span>` : ""}</div>`;
      const adv = im.loraAdvanced || {};
      body = `<p class="lead">Изображения: настройки для генератора, отдельно от RP-внешности персонажа.</p>
        <div class="image-settings-grid"><details class="card-disclosure" id="image-base-panel" ${state.imageBaseOpen !== false ? "open" : ""}><summary>Базовая генерация</summary>
          ${fi("look", "Внешность — теги", 3, "Описательные теги отдельно от активации LoRA. base: — для внешнего изображения персонажа; «ключ: теги» — при совпадении ключа со сценой. Эти теги не обязаны попадать в кадр, снятый камерой персонажа.", "base: brown eyes, long orange hair")}
          ${fi("wardrobe", "Гардероб", 5, "Наряды по ключам из текущей сцены, без автоматической смены одежды.", "худи | hoodie: grey hoodie")}
          ${fi("styleTrigger", "Стилевые теги", 1, "Применяются, только если сцена их упоминает.")}
          ${fi("negative", "Негатив персонажа", 1, "", "short hair")}
          ${fi("seed", "Закреплённый seed", 0, "Пусто — случайный.")}
          ${fi("nsfw", "Модификаторы по ключам сцены", 3, "Не запускаются автоматически по одежде.", "ключ: соответствующие теги")}
        </details>
        <details class="card-disclosure" id="image-lora-panel" ${state.imageLoraOpen ? "open" : ""}><summary>LoRA</summary>
          ${fi("trigger", "Триггер активации LoRA", 2, "Весь текст этого поля добавляется в positive prompt при участии персонажа, независимо от кадрирования. Для новых карточек указывайте здесь только обязательные слова активации LoRA; описания внешности задавайте отдельно выше. Существующие многотеговые триггеры сохраняются без изменений.", "lilithx")}
          <div class="field"><label>Подключённые LoRA</label>${loraRows("card-lora", im.loras || [])}<span class="help">Имя файла и вес; поддерживается Forge/A1111.</span>
          <datalist id="dl-loras">${((m.imgLists || {}).loras || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div>
          ${fi("aliases", "Другие имена в сценах", 0, "Варианты упоминания персонажа.", "orihime, hime")}
          <label class="check"><input type="checkbox" data-lora-advanced="enabled" ${adv.enabled ? "checked" : ""}><span>Продвинутый режим — использовать дополнительные правила LoRA</span></label>
          <details class="card-disclosure lora-advanced-panel" ${adv.enabled ? "open" : ""}><summary>Расширенные параметры LoRA</summary>
            <p class="hint">Дополнительные правила активны только с галочкой. Они не заменяют основной триггер. Формат «ключ сцены: теги».</p>
            <textarea data-lora-advanced="rules" rows="5" placeholder="уши | ears: black cat ears&#10;хвост | tail: fluffy black cat tail">${esc(adv.rules || "")}</textarea>
          </details>
        </details></div>`;
    } else {
      body = `${f("cf-creator", "Создатель", "creator", d.creator, 0, "", "ваш ник")}
        ${f("cf-version", "Версия персонажа", "character_version", d.version, 0, "", "1.0")}
        ${f("cf-notes", "Заметки создателя", "creator_notes", d.creatorNotes, 4, "Для людей, не для модели: как играть, рекомендованные настройки. В контекст не идут.")}
        ${sourceBlock(d.source)}
        <div class="block-title" style="margin-top:24px">Файл карточки</div><p class="hint">Экспорт в Character Card V2/V3 — открывается в SillyTavern, RisuAI, Chub и других. Поля, которых нет в редакторе, сохраняются как были. Настройки изображений и LoRA едут внутри карточки (extensions.prism_rp).</p>
        <div class="row"><button class="btn" data-act="card-png">${icon("download")}PNG с портретом</button><button class="btn" data-act="card-json">${icon("download")}JSON</button></div>
        ${d.id ? `<div class="block-title" style="margin-top:28px">Удаление</div><p class="hint">Удалит персонажа вместе со всеми чатами и опытом.</p>
        <button class="btn btn-danger" data-act="card-del">${icon("trash")}Удалить ${esc(d.name)}</button>` : ""}`;
    }
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal card-modal" role="dialog" aria-modal="true" aria-label="Персонаж">
      <div class="modal-head"><h2>${esc(d.name || "Новый персонаж")}</h2>
        <button class="btn btn-primary btn-sm" data-act="card-save">${icon("check")}Сохранить</button>
        <button class="icon-btn" data-act="modal-close" title="Закрыть без сохранения">${icon("x")}</button></div>
      <nav class="modal-nav">${nav.map(([id, n, ic]) => `<button class="rail-item ${section === id ? "active" : ""}" data-act="card-section" data-section="${id}">${icon(ic)}${n}</button>`).join("")}</nav>
      <div class="modal-body">${body}</div></div></div>`;
  }
  /* Ядро для Prism: что модель получает о персонаже на каждом ходе. Явное ядро правится здесь;
     без него показывается запасное, собранное из полей (без модели). Остальное из карточки подаётся по ходу разговора. */
  function coreBlock(d) {
    const CC = PRP.cardContext;
    const ex = CC.normCore(d.prismCore);
    const fb = CC.core(Object.assign({}, d, { prismCore: null }));
    const state = !ex ? "Запасное — собрано из описания и личности" : ex.source === "imported" && !ex.reviewed ? "Из файла, не проверено — пока используется запасное" : "Задано явно";
    const lines = (a) => esc((a || []).join("\n"));
    const ta = (id, label, val, rows, ph, help) => `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}" data-core="${id}" placeholder="${esc(ph)}">${val}</textarea>${help ? `<span class="help">${help}</span>` : ""}</div>`;
    const preview = !ex || !ex.reviewed ? `<div class="core-preview"><span class="label">Сейчас Prism использует</span>
        <p class="hint"><b>Описание:</b> ${esc(fb.identity || "—")}</p><p class="hint"><b>Личность:</b> ${esc(fb.personality || "—")}</p>
        ${fb.truncated.length ? `<p class="hint">Сокращено: ${fb.truncated.map((x) => `${x.field === "description" ? "описание" : "личность"} ${x.kept} из ${x.total} симв.${x.cut === "word" || x.cut === "hard" ? " (первое предложение слишком длинное — обрезано, «…»)" : ""}`).join(", ")}. Остальное подаётся, когда относится к разговору.</p>` : ""}</div>` : "";
    return `<div class="block core-block" id="prism-core"><div class="block-title" style="margin-top:22px">Ядро для Prism <span class="tag" id="core-state">${esc(state)}</span></div>
      <p class="hint">Коротко о том, кто это: подаётся модели на каждом ходе. Прошлое, внешность и подробности описания подаются, только когда относятся к разговору. Поля карточки не меняются; модель ядро не пишет.</p>
      ${preview}
      ${ta("core-identity", "Кто это", esc(ex ? ex.identity : ""), 3, "Студентка второго курса, живёт одна в Каракуре…")}
      ${ta("core-traits", "Черты", ex ? lines(ex.traits) : "", 3, "по одной на строку", "По одной на строку.")}
      ${ta("core-voice", "Манера речи", ex ? lines(ex.voice) : "", 2, "по одной на строку")}
      ${ta("core-durable", "Устойчивое", ex ? lines(ex.durableContext) : "", 2, "постоянные обстоятельства, по одному на строку")}
      ${ex && ex.source === "imported" && !ex.reviewed ? `<label class="check"><input type="checkbox" data-core-reviewed><span>Проверено — использовать это ядро</span></label>` : ""}
      <div class="row wrap"><button class="btn btn-sm" data-act="core-derive">Собрать из карточки</button>
        ${ex ? `<button class="btn btn-sm btn-ghost" data-act="core-clear">Сбросить — собирать автоматически</button>` : ""}</div></div>`;
  }
  // Откуда карточка: формат исходника и то, что сохранено без использования. Только показ.
  function sourceBlock(s) {
    if (!s) return "";
    const FORMAT = { ccv1: "Character Card V1", ccv2: "Character Card V2", ccv3: "Character Card V3", urv2: "URV v2" };
    const pres = Object.keys(s.preserved || {}), comp = (s.compiled || []).length, unm = (s.unmapped || []).length;
    return `<div class="block-title" style="margin-top:24px">Исходник</div>
      <p class="hint">Импортировано из ${esc(FORMAT[s.format] || s.format || "файла")}${s.sourceType ? ` (${esc(String(s.sourceType).toUpperCase())})` : ""}${s.importedAt ? `, ${esc(new Date(s.importedAt).toLocaleString())}` : ""}.
      Исходный файл хранится целиком и во время игры не читается.${comp ? " Собранный промпт источника сохранён и не включается." : ""}
      ${pres.length ? `<br>Сохранено без использования: ${pres.map((k) => `<span class="spec-key">${esc(k)}</span>`).join(" ")}.` : ""}
      ${unm ? `<br>Неизвестные поля: ${s.unmapped.map((k) => `<span class="spec-key">${esc(k)}</span>`).join(" ")}.` : ""}</p>`;
  }
  Object.assign((PRP.views = PRP.views || {}), { cardModal });
})(typeof window !== "undefined" ? window : globalThis);
