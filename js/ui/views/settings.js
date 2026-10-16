/* Prism RP — окно настроек: модели, генерация, изображения, персона, вид, данные. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render, SC = PRP.scene, TR = PRP.tree, OA = PRP.openai;
  const { esc, icon } = R;
  const { SAMPLER_PRESETS, THEMES, WEATHER, loraRows } = PRP.viewKit;

  /* ── Настройки ────────────────────────────────────────────────────── */
  function settingsModal(m, section) {
    const nav = [["models", "Модели", "cpu"], ["gen", "Генерация", "sliders"], ["images", "Изображения", "image"], ["persona", "Вы", "user"], ["look", "Внешний вид", "palette"], ["data", "Данные", "data"]];
    const s = m.settings;
    let body = "";
    if (section === "models") {
      const editing = m.settings.providers.find((p) => p.id === m.editProviderId);
      body = `<h3>Модели</h3><p class="lead">Какая модель пишет за персонажей. Можно держать несколько и переключать прямо в чате.</p>
        ${m.providers.map((p) => `<div class="prov ${m.provider && m.provider.id === p.id ? "on" : ""}" data-act="pick-provider" data-id="${p.id}" role="radio" tabindex="0" aria-checked="${m.provider && m.provider.id === p.id}">
          <span class="radio"></span><div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="ds">${esc(p.kind === "perchance" ? "Бесплатная модель Perchance, ключ не нужен" : `${p.baseUrl || "адрес не задан"}${p.model ? " · " + p.model : ""}`)}</div></div>
          ${p.kind === "openai" ? `<button class="btn btn-sm btn-ghost" data-act="prov-edit" data-id="${p.id}">Изменить</button>` : ""}</div>`).join("")}
        ${!m.providers.some((p) => p.kind === "perchance") ? `<p class="hint">Бесплатная модель Perchance появится здесь, когда приложение запущено как генератор на Perchance.</p>` : ""}
        ${editing ? providerForm(editing) : `<div class="block-title" style="margin-top:20px">Подключить API</div>
          <div class="presets">${OA.PRESETS.map((pr) => `<button class="preset" data-act="prov-add" data-preset="${pr.id}"><b>${esc(pr.name)}</b><small>${pr.local ? "на этом компьютере" : pr.id === "custom" ? "любой совместимый" : "облачный API"}</small></button>`).join("")}</div>`}`;
    } else if (section === "gen") {
      const sm = s.sampler;
      const num = (k, label, step, help) => `<div class="field"><label>${label}</label><input type="number" step="${step}" data-sampler="${k}" value="${sm[k] != null ? sm[k] : ""}">${help ? `<span class="help">${help}</span>` : ""}</div>`;
      body = `<h3>Генерация</h3><p class="lead">Стиль, длина ответа и объём памяти. Для бесплатной модели Perchance параметры сэмплирования не применяются.</p>
        <div class="presets">${SAMPLER_PRESETS.map((p) => `<button class="preset ${s.samplerPreset === p.id ? "on" : ""}" data-act="pick-preset" data-id="${p.id}"><b>${p.name}</b><small>${p.hint}</small></button>`).join("")}
          <button class="preset ${s.samplerPreset === "custom" ? "on" : ""}" data-act="pick-preset" data-id="custom"><b>Свой</b><small>значения ниже</small></button></div>
        <div class="row">${num("temperature", "Температура", "0.05", "выше — смелее")}${num("top_p", "Top P", "0.01")}${num("min_p", "Min P", "0.01")}</div>
        <div class="row">${num("top_k", "Top K", "1", "0 — выключено")}${num("repetition_penalty", "Штраф за повторы", "0.01")}${num("max_tokens", "Длина ответа", "50", "в токенах")}</div>
        <div class="row"><div class="field"><label>Объём контекста</label><input type="number" step="512" data-set-num="contextTokens" value="${s.contextTokens}"><span class="help">в токенах; для Perchance берётся из плагина</span></div>
          <div class="field"><label>Записей опыта за ход</label><input type="number" min="0" max="30" data-set-num="expLimit" value="${s.expLimit}"></div>
          <div class="field"><label>Фактов мира за ход</label><input type="number" min="0" max="30" data-set-num="worldLimit" value="${s.worldLimit}"></div></div>
        <label class="check"><input type="checkbox" data-set="autoContext" ${s.autoContext ? "checked" : ""}><span>Брать объём контекста из плагина Perchance</span></label>
        <label class="check"><input type="checkbox" data-set="singleSystem" ${s.singleSystem ? "checked" : ""}><span>Одно системное сообщение<small>Для локальных моделей со строгими шаблонами чата, которые ломаются от нескольких system.</small></span></label>
        <label class="check"><input type="checkbox" data-set="noPostHistory" ${s.noPostHistory ? "checked" : ""}><span>Не передавать инструкции после истории<small>Касается только указаний автора карточки (post_history_instructions), не самого характера. По умолчанию выключено — для совместимости с карточками.</small></span></label>
        <label class="check"><input type="checkbox" data-set="sceneProtocol" ${s.sceneProtocol ? "checked" : ""}><span>Модель сообщает изменения сцены<small>Время, место, одежда, настроение — короткой служебной строкой, которую приложение прячет.</small></span></label>
        <div class="block-title" style="margin-top:20px">Ассистент</div>
        <div class="field"><label for="assist-sys">Инструкция ассистента</label><textarea id="assist-sys" rows="5" data-set-text="assistSystem" placeholder="${esc(PRP.assist.SYSTEM)}">${esc(s.assistSystem || "")}</textarea>
          <span class="help">Как модель ведёт себя в разделе «Ассистент». Пусто — встроенная инструкция (видна серым).</span></div>`;
    } else if (section === "images") {
      body = imagesSettings(m);
    } else if (section === "persona") {
      const pi = m.persona.image || {};
      body = `<h3>Вы</h3><p class="lead">Как персонажи вас видят. Имя подставляется вместо {{user}} в карточках.</p>
        <div class="field"><label>Имя</label><input id="p-name" value="${esc(m.persona.name)}"></div>
        <div class="field"><label>Описание</label><textarea id="p-desc" rows="5" placeholder="Внешность, характер, кем вы приходитесь персонажам">${esc(m.persona.description)}</textarea></div>
        <div class="block-title" style="margin-top:20px">Вы на картинках</div>
        <div class="field"><label>Как рисовать сцену</label><select id="p-view"><option value="third" ${pi.view !== "first" ? "selected" : ""}>Со стороны — вы тоже в кадре</option><option value="first" ${pi.view === "first" ? "selected" : ""}>От первого лица — камера это ваши глаза (POV)</option></select></div>
        <div class="field"><label>Ваша внешность для картинок</label><textarea id="p-appearance" rows="4" placeholder="base: 1boy, short black hair, grey eyes&#10;костюм | suit: black suit, white shirt">${esc(pi.appearance || "")}</textarea>
          <span class="help">Теги, которые добавляются, когда вы в кадре. Строка base: — всегда; «ключ: теги» — когда ключ упомянут в сцене или так зовут присутствующего. Можно указать свою LoRA: &lt;lora:имя:0.8&gt;.</span></div>
        <div class="field"><label>Видимые части тела в POV</label><input id="p-povtags" value="${esc(pi.povTags || "")}" placeholder="pov hands"><span class="help">Только если они должны быть в кадре.</span></div>
        <div class="modal-foot"><button class="btn btn-primary" data-act="persona-save">Сохранить</button></div>`;
    } else if (section === "look") {
      body = `<h3>Внешний вид</h3><p class="lead">Тема и размер текста сцены.</p>
        <div class="themes">${THEMES.map((t) => `<button class="theme ${s.theme === t.id ? "on" : ""}" data-act="theme" data-id="${t.id}">
          <div class="sw" style="background:${t.c[0]}"><i style="width:36%;background:${t.c[1]}"></i><i style="width:18%;background:${t.c[2]}"></i><i style="width:12%;background:${t.c[3]}"></i></div><div class="nm">${t.name}</div></button>`).join("")}</div>
        <div class="field" style="margin-top:18px"><label>Размер текста сцены: <span id="fs-out">${s.proseSize}</span> px</label><input type="range" min="14" max="22" step="1" data-set-range="proseSize" value="${s.proseSize}" style="accent-color:var(--accent)"></div>`;
    } else {
      body = `<h3>Данные</h3><p class="lead">Всё хранится только в этом браузере. Бэкап переносит персонажей, чаты, опыт и настройки — в том числе на другую платформу.</p>
        <div class="row"><button class="btn" data-act="backup">${icon("download")}Скачать бэкап</button><button class="btn" data-act="restore">${icon("upload")}Загрузить бэкап</button></div>
        <p class="hint" style="margin-top:14px">${m.stats}</p>`;
    }
    return `<div class="modal-wrap" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Настройки">
      <div class="modal-head"><h2>Настройки</h2><button class="icon-btn" data-act="modal-close" title="Закрыть">${icon("x")}</button></div>
      <nav class="modal-nav">${nav.map(([id, n, ic]) => `<button class="rail-item ${section === id ? "active" : ""}" data-act="settings" data-section="${id}">${icon(ic)}${n}</button>`).join("")}</nav>
      <div class="modal-body">${body}</div></div></div>`;
  }

  function imagesSettings(m) {
    const c = m.settings.images, lists = m.imgLists || {};
    const backs = [["perchance", "Perchance", "бесплатно, без настроек", m.perchanceImages], ["a1111", "Forge / A1111 / ReForge", "ваш локальный сервер Stable Diffusion", true], ["openai", "OpenAI-совместимый API", "облачные сервисы изображений", true]];
    const dl = (id, arr) => `<datalist id="${id}">${(arr || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`;
    const inp = (k, label, ph, list, help, type) => `<div class="field"><label>${label}</label><input data-imgcfg="${k}" ${type ? `type="${type}"` : ""} ${list ? `list="${list}"` : ""} value="${esc(c[k] != null ? c[k] : "")}" placeholder="${esc(ph || "")}">${help ? `<span class="help">${help}</span>` : ""}</div>`;
    const chk = (k, label, help) => `<label class="check"><input type="checkbox" data-img-check="${k}" ${c[k] ? "checked" : ""}><span>${label}${help ? `<small>${help}</small>` : ""}</span></label>`;
    let conn = "";
    if (c.backend === "a1111") {
      conn = `${inp("url", "Адрес сервера", "http://127.0.0.1:7860", "", "Forge/A1111 запускается с флагами --api и --cors-allow-origins=" + esc(m.origin))}
        <div class="row" style="align-items:center;margin:-4px 0 12px"><button class="btn btn-sm" data-act="img-lists">${icon("regen")}Проверить и загрузить списки</button><span class="hint" style="margin:0">${lists.at ? `Модели: ${(lists.models || []).length}, LoRA: ${(lists.loras || []).length}` : "модели, VAE, сэмплеры, LoRA с сервера"}</span></div>
        <div class="row">${inp("model", "Модель (checkpoint)", "как на сервере", "dl-models")}${inp("vae", "VAE", "Automatic", "dl-vaes")}</div>
        <div class="row">${inp("sampler", "Сэмплер", "Euler a", "dl-samplers")}${inp("scheduler", "Планировщик", "", "dl-schedulers")}</div>
        <div class="row">${inp("steps", "Шаги", "28", "", "", "number")}${inp("cfg", "CFG", "5.5", "", "", "number")}${inp("seed", "Seed", "случайный", "", "пусто — каждый раз новый")}</div>
        <div class="row"><div class="field"><label>Размер</label><select data-img-sel="sizeMode"><option value="auto" ${c.sizeMode !== "fixed" ? "selected" : ""}>По пропорциям сцены</option><option value="fixed" ${c.sizeMode === "fixed" ? "selected" : ""}>Всегда один</option></select></div>
          ${c.sizeMode === "fixed" ? inp("fixedSize", "Размер", "1024x1024") : inp("maxSide", "Макс. сторона", "1216", "", "", "number")}</div>
        ${chk("hires", "Hires fix — второй проход", "Заметно улучшает лица и руки на SDXL-моделях, но рисует дольше.")}
        ${c.hires ? `<div class="row">${inp("hiresScale", "Масштаб", "1.5", "", "", "number")}${inp("hiresUpscaler", "Апскейлер", "R-ESRGAN 4x+ Anime6B", "dl-upscalers")}${inp("hiresDenoise", "Denoise", "0.4", "", "", "number")}</div>` : ""}
        ${dl("dl-models", lists.models)}${dl("dl-vaes", lists.vaes)}${dl("dl-samplers", lists.samplers)}${dl("dl-schedulers", lists.schedulers)}${dl("dl-upscalers", lists.upscalers)}`;
    } else if (c.backend === "openai") {
      conn = `${inp("url", "Адрес API", "https://api.example.com/v1")}
        <div class="field"><label>Ключ API</label><input data-imgcfg="key" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(c.key || "")}"></div>
        ${inp("model", "Модель", "")}`;
    } else if (!m.perchanceImages) {
      conn = `<p class="hint">Генерация Perchance доступна, когда приложение запущено как генератор на Perchance. Здесь выберите локальный сервер или API.</p>`;
    }
    return `<h3>Изображения</h3><p class="lead">Чем рисовать и как собирается промпт. Персональные настройки — LoRA, триггеры, гардероб — задаются в карточке персонажа.</p>
      ${chk("enabled", "Рисовать картинки")}
      <div class="block-title" style="margin-top:14px">Чем рисовать</div>
      ${backs.map(([id, n, d, ok]) => `<div class="prov ${c.backend === id ? "on" : ""} ${ok ? "" : "dim"}" data-act="img-backend" data-id="${id}" role="radio" tabindex="0" aria-checked="${c.backend === id}"><span class="radio"></span><div><div class="nm">${n}</div><div class="ds">${d}${ok ? "" : " — только на Perchance"}</div></div><span></span></div>`).join("")}
      ${conn}
      <div class="block-title" style="margin-top:20px">Промпт</div>
      <div class="row"><div class="field"><label>Формат</label><select data-img-sel="format"><option value="tags" ${c.format !== "description" ? "selected" : ""}>Теги danbooru (аниме-модели, Pony, Illustrious)</option><option value="description" ${c.format === "description" ? "selected" : ""}>Описание словами (SDXL base, Flux)</option></select></div></div>
      ${chk("translate", "Переводить сцену на английский", "Модели изображений не понимают русский: сцену перепишет текстовая модель, перевод кэшируется.")}
      <div class="field"><label>Закреплённый блок</label><textarea data-imgcfg="fixedPrompt" rows="2" placeholder="masterpiece, best quality, amazing quality, absurdres">${esc(c.fixedPrompt || "")}</textarea><span class="help">Одинаковые теги качества и стиля в каждой картинке. Если блок задан, модель свои теги качества не пишет.</span></div>
      <div class="field"><label>Куда ставить блок</label><select data-img-sel="promptMode">${[["append", "в конец"], ["prepend", "в начало"], ["replace", "только блок, без сцены"], ["off", "не использовать"]].map(([v, l]) => `<option value="${v}" ${c.promptMode === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label>Негатив</label><textarea data-imgcfg="negative" rows="2" placeholder="lowres, bad anatomy, bad hands, extra digits">${esc(c.negative || "")}</textarea></div>
      ${c.backend === "a1111" ? `<p class="hint">LoRA задаются в карточке каждого персонажа: «Редактировать карточку → Изображения». Так они переезжают вместе с карточкой и не попадают в чужие картинки.</p>` : ""}
      <div class="block-title" style="margin-top:20px">Когда рисовать</div>
      ${chk("modelDraws", "Модель сама решает, когда показать картинку", "Она пишет короткую служебную строку [draw: …]; приложение её прячет и рисует.")}
      ${chk("autoDraw", "Рисовать сразу", "Иначе под сообщением появится кнопка «Нарисовать».")}`;
  }

  function providerForm(p) {
    return `<div class="panel" style="margin-top:16px"><div class="block-title">${esc(p.name)}</div>
      <div class="field"><label>Название</label><input id="prov-name" value="${esc(p.name)}"></div>
      <div class="field"><label>Адрес API</label><input id="prov-url" value="${esc(p.baseUrl)}" placeholder="https://…/v1"><span class="help">Обычно заканчивается на /v1</span></div>
      <div class="field"><label>Ключ API</label><input id="prov-key" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(p.apiKey || "")}" placeholder="для локальных серверов не нужен"></div>
      <div class="field"><label>Модель</label><div class="row" style="align-items:center"><input id="prov-model" list="prov-models" value="${esc(p.model || "")}" style="flex:1"><button class="btn btn-sm" data-act="prov-models">Загрузить список</button></div>
        <datalist id="prov-models">${(p.models || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>${p.models ? `<span class="help">Доступно моделей: ${p.models.length}</span>` : ""}</div>
      <label class="check"><input type="checkbox" id="prov-ext" ${p.extendedSamplers ? "checked" : ""}><span>Расширенные параметры<small>min_p, top_k, штраф за повторы — для локальных серверов и OpenRouter</small></span></label>
      <div class="row"><button class="btn btn-primary btn-sm" data-act="prov-save">Сохранить</button><button class="btn btn-sm btn-ghost" data-act="prov-close">Готово</button>
        <span style="flex:1"></span><button class="btn btn-danger btn-sm" data-act="prov-del">Удалить</button></div>
      <p class="hint" style="margin:10px 0 0">Ключ хранится только в этом браузере.</p></div>`;
  }


  Object.assign((PRP.views = PRP.views || {}), { settingsModal });
})(typeof window !== "undefined" ? window : globalThis);
