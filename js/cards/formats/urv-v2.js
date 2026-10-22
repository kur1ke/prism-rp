/* Prism RP — адаптер URV v2 (type: "urv-char", version: 2).
   Профиль раскладывается по полям Prism. Заметка (systemNote) и напоминание (reminderMessage)
   становятся импортированными указаниями — выключенными. Собранный data.systemPrompt, повторяющий
   разложенные поля, только хранится и показывается на проверке: он не включается никогда.
   userOverride и неизвестные поля хранятся и показываются, но во время работы не используются. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const F = PRP.cardFormats, CM = PRP.cardModel;
  const { clone, str, isObj, unmapped, customFromUnknown, loreEntry, note } = F.helpers;

  const DATA_KNOWN = ["id", "name", "description", "profile", "firstMessage", "reminderMessage", "userOverride", "lorebook", "exampleDialogue", "systemPrompt",
    "imageTrigger", "outfitTags", "imageStyleTrigger", "nsfwTags", "imageLoras"];
  const PROFILE_KNOWN = ["name", "age", "gender", "appearance", "personality", "background", "scenario", "systemNote"];

  const text = (v) => (typeof v === "string" ? v : isObj(v) ? str(v.text != null ? v.text : v.content != null ? v.content : v.message) : str(v));
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

  // Пример диалога URV → блок формата mes_example. → строка или null, если форма не распознана.
  function exampleBlock(ex) {
    const line = (who, t) => (String(t || "").trim() ? `${who}: ${String(t).trim()}` : "");
    if (typeof ex === "string") return ex.trim() ? "<START>\n" + ex.trim() : "";
    if (Array.isArray(ex)) {
      if (ex.every((x) => typeof x === "string")) return ["<START>", line("{{user}}", ex[0]), line("{{char}}", ex[1])].concat(ex.slice(2).map((t, i) => line(i % 2 ? "{{char}}" : "{{user}}", t))).filter(Boolean).join("\n");
      if (ex.every((x) => isObj(x) && x.role)) return ["<START>"].concat(ex.map((x) => line(/^(user|human)$/i.test(x.role) ? "{{user}}" : "{{char}}", text(x)))).filter(Boolean).join("\n");
      return null;
    }
    if (isObj(ex)) {
      const u = ex.user != null ? ex.user : ex.input != null ? ex.input : ex.question;
      const c = ex.char != null ? ex.char : ex.character != null ? ex.character : ex.assistant != null ? ex.assistant : ex.output != null ? ex.output : ex.answer;
      if (u != null || c != null) return ["<START>", line("{{user}}", text(u)), line("{{char}}", text(c))].filter(Boolean).join("\n");
      if (ex.text != null || ex.content != null) return "<START>\n" + text(ex).trim();
    }
    return null;
  }

  // Лорбук URV: объект-карта или массив. Ключ карты — ключевое слово, если запись своих ключей не задаёт
  // и ключ не похож на служебный id.
  function loreFromUrv(lb, notes) {
    const out = [];
    const looksLikeId = (k) => /^\d+$/.test(k) || /^[0-9a-f-]{16,}$/i.test(k) || /^(entry|lore)[-_]?\d+$/i.test(k);
    if (Array.isArray(lb)) lb.forEach((e, i) => out.push(loreEntry(e, i, { source: "urv.lorebook" })));
    else if (isObj(lb)) Object.keys(lb).forEach((k, i) => {
      const v = lb[k];
      const e = loreEntry(typeof v === "string" ? { content: v } : v, i, { source: "urv.lorebook", sourceKey: k });
      if (!e.keys.length && !looksLikeId(k)) e.keys = [k];
      if (!e.comment) e.comment = looksLikeId(k) ? "" : k;
      out.push(e);
    });
    else if (lb != null) notes.push(note("warning", "lore-shape", "Лорбук в незнакомом виде: сохранён в исходнике, но не разобран."));
    const empty = out.filter((e) => !e.content.trim()).length;
    if (empty) notes.push(note("warning", "lore-empty", `Записей лорбука без текста: ${empty}. Они перенесены, но в модель не попадут.`));
    return out;
  }

  // Карта «название → теги» в строки формата Prism «название: теги».
  function mapLines(v) {
    if (typeof v === "string") return v;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join("\n");
    if (isObj(v) && Object.values(v).every((x) => typeof x === "string" || (Array.isArray(x) && x.every((y) => typeof y === "string")))) {
      return Object.keys(v).map((k) => `${k}: ${Array.isArray(v[k]) ? v[k].join(", ") : v[k]}`).join("\n");
    }
    return null;
  }
  function loras(v) {
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : null;
    if (!list) return null;
    const out = [];
    for (const x of list) {
      if (isObj(x) && str(x.name).trim()) out.push({ name: str(x.name).trim(), weight: x.weight != null ? Number(x.weight) || 1 : 1 });
      else if (typeof x === "string" && x.trim()) {
        const m = x.trim().match(/^<?(?:lora:)?([^:>]+)(?::([\d.]+))?>?$/i);
        if (!m) return null;
        out.push({ name: m[1].trim(), weight: m[2] ? Number(m[2]) : 1 });
      } else if (x != null && !(typeof x === "string")) return null;
    }
    return out;
  }

  /* Собранный systemPrompt: повторяет ли он разложенные поля?
     Берутся начала (до 60 символов) непустых полей длиной от 20 символов и ищутся в тексте промпта. */
  function compiledCheck(prompt, fields) {
    const p = norm(prompt);
    const probes = Object.keys(fields).filter((k) => norm(fields[k]).length >= 20);
    const hits = probes.filter((k) => p.includes(norm(fields[k]).slice(0, 60)));
    const compiled = hits.length >= 2 || (hits.length === 1 && probes.length === 1);
    return { compiled, hits, probes };
  }

  F.register("urv2", (json, detection) => {
    const notes = [];
    const data = json.data, prof = isObj(data.profile) ? data.profile : {};
    const d = CM.blank();
    d.name = (str(prof.name).trim() || str(data.name).trim());
    const facts = [prof.age != null && str(prof.age).trim() ? `Возраст: ${str(prof.age).trim()}` : "", prof.gender != null && str(prof.gender).trim() ? `Пол: ${str(prof.gender).trim()}` : ""].filter(Boolean).join(" · ");
    d.description = [facts, str(data.description).trim()].filter(Boolean).join("\n\n");
    if (facts) notes.push(note("info", "profile-facts", "Возраст и пол из профиля добавлены в начало описания."));
    d.appearance = str(prof.appearance);
    d.personality = str(prof.personality);
    d.background = str(prof.background);
    d.scenario = str(prof.scenario);

    // Первые сообщения: первое — основное, остальные — альтернативные приветствия.
    const fm = Array.isArray(data.firstMessage) ? data.firstMessage : data.firstMessage != null ? [data.firstMessage] : [];
    const greetings = fm.map(text).map((s) => s.trim()).filter(Boolean);
    d.firstMes = greetings[0] || "";
    d.altGreetings = greetings.slice(1);
    if (greetings.length > 1) notes.push(note("warning", "multi-first", `Первых сообщений: ${greetings.length}. Первое стало основным, остальные — альтернативными приветствиями.`));

    // Примеры диалогов.
    const exs = Array.isArray(data.exampleDialogue) ? data.exampleDialogue : data.exampleDialogue != null ? [data.exampleDialogue] : [];
    const blocks = exs.map(exampleBlock);
    const bad = blocks.filter((b) => b === null).length;
    d.mesExample = blocks.filter(Boolean).join("\n");
    if (bad) notes.push(note("warning", "examples-shape", `Примеров диалога в незнакомом виде: ${bad}. Они сохранены в исходнике, но не перенесены.`));

    d.lore = loreFromUrv(data.lorebook, notes);

    // Указания: заметка и напоминание — импортированные, выключенные.
    d.directives.system = CM.importedDirective(str(prof.systemNote));
    d.directives.postHistory = CM.importedDirective(str(data.reminderMessage));

    const source = {
      format: "urv2", version: "2", sourceType: detection.sourceType, adapter: "urv-v2", importedAt: Date.now(), raw: clone(json),
      unmapped: [], compiled: [], preserved: {},
    };

    // Собранный systemPrompt.
    const sp = str(data.systemPrompt);
    if (sp.trim()) {
      const chk = compiledCheck(sp, { appearance: d.appearance, personality: d.personality, background: d.background, scenario: d.scenario, systemNote: str(prof.systemNote) });
      if (chk.compiled) {
        source.compiled.push({ field: "data.systemPrompt", text: sp, matched: chk.hits });
        notes.push(note("warning", "compiled-prompt", "Собранный промпт источника (data.systemPrompt) сохранён, но не включён: те же поля импортированы по отдельности."));
      } else if (!d.directives.system.text.trim()) {
        d.directives.system = CM.importedDirective(sp);
        notes.push(note("warning", "system-prompt-candidate", "data.systemPrompt не похож на собранный дубль полей: предложен как указание автора, выключен."));
      } else {
        source.preserved.systemPrompt = sp;
        notes.push(note("warning", "system-prompt-preserved", "data.systemPrompt сохранён, но не включён: место указания занято заметкой профиля (systemNote)."));
      }
    }

    // userOverride: хранится и показывается, во время работы не используется.
    if (data.userOverride != null && (typeof data.userOverride !== "string" || data.userOverride.trim())) {
      source.preserved.userOverride = clone(data.userOverride);
      notes.push(note("warning", "user-override", "userOverride (переопределение собеседника из URV) сохранён, но не применяется."));
    }
    if (data.id != null) source.preserved.id = clone(data.id);

    // Картинки: переносится только то, что отображается однозначно.
    const im = {};
    const keep = (k, why) => { source.preserved[k] = clone(data[k]); notes.push(note("warning", "image-preserved", `${k} сохранён, но не перенесён: ${why}.`)); };
    if (str(data.imageTrigger).trim()) im.trigger = str(data.imageTrigger).trim();
    if (str(data.imageStyleTrigger).trim()) im.styleTrigger = str(data.imageStyleTrigger).trim();
    if (data.outfitTags != null) { const v = mapLines(data.outfitTags); if (v == null) keep("outfitTags", "незнакомый вид"); else if (v.trim()) im.wardrobe = v; }
    if (data.nsfwTags != null) { const v = mapLines(data.nsfwTags); if (v == null) keep("nsfwTags", "незнакомый вид"); else if (v.trim()) im.nsfw = v; }
    if (data.imageLoras != null) { const v = loras(data.imageLoras); if (v) im.loras = v; else keep("imageLoras", "незнакомый вид"); }
    if (Object.keys(im).length) { d.image = im; notes.push(note("info", "image-mapped", "Настройки картинок перенесены: " + Object.keys(im).join(", ") + ".")); }

    d.customFields = customFromUnknown(data, DATA_KNOWN, "data", "urv2")
      .concat(customFromUnknown(prof, PROFILE_KNOWN, "data.profile", "urv2"));
    if (d.customFields.length) notes.push(note("info", "custom-mapped", `${d.customFields.length} дополнительных полей перенесены в пользовательские (выключены).`));
    source.unmapped = unmapped(data, DATA_KNOWN, "data").concat(unmapped(prof, PROFILE_KNOWN, "data.profile"));
    if (source.unmapped.length) notes.push(note("info", "unmapped", `Поля сохранены, но не используются: ${source.unmapped.join(", ")}.`));
    d.source = source;
    return { draft: d, notes };
  });

  F.urv = { compiledCheck, exampleBlock };
})(typeof window !== "undefined" ? window : globalThis);
