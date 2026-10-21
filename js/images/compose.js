/* Prism RP — сборка промпта изображения (чистые функции).
   Перенос логики из модулей форка (image-endpoint / image-prompt / промпт
   персонажа), переписанной под архитектуру Prism RP: данные берутся из
   карточки (card.image), персоны (persona.image) и состояния сцены.

   Конвейер:
     [draw: …] из ответа  ─┐
     сцена (одежда, поза) ─┼─ compose()  → { scene, keep, absence }
     карточка и персона   ─┘        scene ─ compile (перевод LLM) ─┐
                                    keep ─ «как есть», в начало ───┴─ finalise() → { prompt, negative }

   Принципы, вынесенные из форка:
   • Сцена важнее устаревшего трекера: если [draw:] одевает персонажа иначе,
     теги гардероба не добавляются — иначе одежда «усредняется».
   • Теги гардероба и внешности — это словарь LoRA; LLM-переводчик их не видит
     и не переписывает, они ставятся в начало промпта без изменений.
   • Триггер, негатив и LoRA персонажа — только когда он в кадре.
   • Повтор тега ничего не даёт; «solo» неверен, когда в кадре двое.
   • POV: камера — глаза пользователя; его внешность не добавляется. */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});

  /* ── Словоформы и карты «ключ: теги» ───────────────────────────────── */
  const WORD_RE = /[^\p{L}\p{N}]+/u;
  function words(s) { return String(s || "").toLowerCase().replace(/ё/g, "е").split(WORD_RE).filter(Boolean); }

  // «красное» ~ «красном», «Лёня» ~ «Лёне», но «girl» не совпадает с «1girl».
  function wordFormMatch(key, word) {
    if (key === word) return true;
    if (key.length < 4 || word.length < 4) return false;
    const stem = key.slice(0, Math.max(3, key.length - 2));
    return word.startsWith(stem) && Math.abs(word.length - key.length) <= 3;
  }
  // Все слова ключа встречаются в тексте (в любой словоформе) → число слов, иначе 0.
  function mentions(key, text) {
    const k = words(key).filter((w) => w.length >= 2);
    if (!k.length) return 0;
    const hay = words(text);
    for (const w of k) if (!hay.some((h) => wordFormMatch(w, h))) return 0;
    return k.length;
  }

  const cleanTags = (t) => String(t || "").split(",").map((s) => s.trim().replace(/^["'«»„“”]+|["'«»„“”]+$/g, "")).filter(Boolean).join(", ");

  /* Строки «ключ: теги». Ключ может быть с вариантами «school uniform | школьная форма».
     «ключ:» без тегов собирает следующие строки (длинный список, вставленный блоком).
     Двоеточие после запятой или < — это часть тегов (<lora:x:0.8>), а не ключ. */
  function parseMap(text) {
    const out = [];
    let key = "", acc = [];
    const flush = () => { const t = cleanTags(acc.join(", ")); if (key && t) out.push({ key, tags: t }); key = ""; acc = []; };
    for (const raw of String(text || "").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const ci = line.indexOf(":");
      const si = line.search(/[<,]/);
      const sep = ci === -1 || (si !== -1 && si < ci) ? -1 : ci;
      if (sep !== -1) {
        flush();
        const k = line.slice(0, sep).trim(), rest = line.slice(sep + 1).trim();
        if (!k) continue;
        if (rest) out.push({ key: k, tags: cleanTags(rest) }); else key = k;
        continue;
      }
      if (key) acc.push(line);
      else out.push({ key: "", tags: cleanTags(line) }); // строка без ключа — базовая
    }
    flush();
    return out;
  }
  const isBase = (k) => /^(|base|always|всегда|база)$/i.test(String(k).trim());
  const isSuffix = (k) => /^(suffix|в конце)$/i.test(String(k).trim());

  function bestVariant(key, text) {
    let score = 0, len = 0;
    for (const v of String(key).split("|").map((s) => s.trim()).filter(Boolean)) {
      const s = mentions(v, text);
      if (s > score || (s === score && s && v.length > len)) { score = s; len = v.length; }
    }
    return { score, len };
  }

  // Гардероб: базовые строки + ОДИН лучший образ по описанию одежды.
  function resolveWardrobe(map, outfitText) {
    const always = [];
    let best = "", bestScore = 0, bestLen = 0;
    for (const { key, tags } of parseMap(map)) {
      if (isBase(key)) { always.push(tags); continue; }
      if (isSuffix(key)) continue;
      const { score, len } = bestVariant(key, outfitText);
      if (score && (score > bestScore || (score === bestScore && len > bestLen))) { best = tags; bestScore = score; bestLen = len; }
    }
    return [...always, best].filter(Boolean).join(", ");
  }

  // Внешность: базовые строки + все совпавшие по тексту кадра или по именам присутствующих.
  function resolveAppearance(map, text, names) {
    const keep = [], tail = [];
    for (const { key, tags } of parseMap(map)) {
      if (isSuffix(key)) { tail.push(tags); continue; }
      if (isBase(key)) { keep.push(tags); continue; }
      const hit = String(key).split("|").map((s) => s.trim()).filter(Boolean)
        .some((v) => mentions(v, text) || (names || []).some((n) => mentions(v, n)));
      if (hit) keep.push(tags);
    }
    return { tags: keep.join(", "), suffix: tail.join(", ") };
  }

  /* ── Гигиена тегов ─────────────────────────────────────────────────── */
  // Делит по запятым, не разрезая «(detailed face, sharp eyes:1.2)».
  function splitTags(text) {
    const s = String(text == null ? "" : text), out = [];
    let cur = "", depth = 0;
    for (const ch of s) {
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  const norm = (s) => String(s).toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  function bareTag(tag) {
    let t = String(tag).trim();
    if (!t || /^<lora:/i.test(t)) return "";
    for (let i = 0; i < 3; i++) {
      const m = t.match(/^[([{]([\s\S]*)[)\]}](?:\s*:\s*[0-9.]+)?$/);
      if (!m) break;
      t = m[1].trim();
    }
    return norm(t.replace(/\s*:\s*[0-9]+(?:\.[0-9]+)?\s*$/, ""));
  }
  // Соотношения сторон уже учтены размером кадра; score_N — шум вне Pony.
  function normalizeTags(text) {
    return splitTags(text).filter((t) => !/^\d{1,3}\s*:\s*\d{1,3}$/.test(t) && !/^score[ _]\d+(_up)?$/i.test(t)).join(", ");
  }
  const QUALITY = new Set(("masterpiece|best quality|amazing quality|great quality|high quality|highest quality|top quality|good quality|" +
    "very aesthetic|aesthetic|absurdres|highres|hires|high resolution|ultra high res|8k|4k|2k|ultra detailed|ultra-detailed|" +
    "extremely detailed|highly detailed|hyper detailed|hyper-detailed|hyperdetailed|super detailed|insanely detailed|very detailed|" +
    "detailed|sharp focus|intricate lineart|clean lines|perfect anatomy|smooth shading|vivid colors|extremely detailed cg|" +
    "newest|sharp lines|clean lineart").split("|"));
  function stripQuality(text) { return splitTags(text).filter((t) => !QUALITY.has(bareTag(t))).join(", "); }

  // Сколько людей в кадре по тегам: 1girl+1boy, 2girls, hetero, «two girls»…
  function subjectCount(text) {
    const b = " " + String(text).toLowerCase() + " ";
    let n = 0;
    const count = b.matchAll(/\b([1-9])\s*(boys?|girls?)\b/g);
    for (const m of count) n += Number(m[1]);
    if (!n) {
      if (/\bboys?\b/.test(b)) n++;
      if (/\bgirls?\b/.test(b)) n++;
    }
    if (/\b(?:hetero|yaoi|yuri|group|threesome)\b/.test(b)) n = Math.max(n, 2);
    if (/\b(?:multiple|several|two|three|[2-9])\s*(?:girls|boys|people|others)\b/.test(b)) n = Math.max(n, 2);
    return n;
  }
  function dropContradictorySolo(prompt) {
    if (subjectCount(prompt) < 2) return prompt;
    return splitTags(prompt).filter((t) => !/^(solo|solo focus)$/.test(bareTag(t))).join(", ");
  }

  /* Убирает точные повторы и теги, все слова которых уже есть в триггере персонажа
     (это его «блок личности»). Исключение — в кадре двое разных полов: общая черта
     («orange hair») может принадлежать обоим. LoRA-токены не трогаются. */
  function dedupe(prompt, trigger) {
    const tWords = new Set(), tTags = new Set();
    splitTags(trigger).forEach((t) => { const n = norm(t); tTags.add(n); words(n).filter((w) => w.length > 2).forEach((w) => tWords.add(w)); });
    const low = String(prompt).toLowerCase().replace(/<lora:[^>]*>/g, " ");
    const twoKinds = (/\b\d*\s*girls?\b/.test(low) && /\b\d*\s*boys?\b/.test(low)) || /\b(?:hetero|yaoi|yuri)\b/.test(low);
    const seen = new Set(), seenLora = new Set(), out = [];
    for (const tag of splitTags(prompt)) {
      const n = norm(tag);
      const lm = tag.match(/^<lora:([^:>]+):/i);
      const lname = lm && norm(lm[1]);
      if (lname && seenLora.has(lname)) continue;
      if (lname) seenLora.add(lname);
      if (seen.has(n)) continue;
      seen.add(n);
      if (tWords.size && !twoKinds && !tTags.has(n) && !/^<lora:/i.test(tag) && /^[\x20-\x7e]*$/.test(tag)) {
        const w = words(n).filter((x) => x.length > 2);
        if (w.length && w.every((x) => tWords.has(x))) continue;
      }
      out.push(tag);
    }
    return out.join(", ");
  }

  const GARMENTS = ["джинсы", "hooded jacket", "dress", "skirt", "shirt", "blouse", "t-shirt", "hoodie", "sweater", "jacket", "coat", "jeans", "shorts", "pants", "trousers",
    "uniform", "kimono", "yukata", "swimsuit", "bikini", "lingerie", "pajamas", "towel", "apron", "suit", "crop top", "tank top",
    "платье", "юбка", "рубашка", "блузка", "футболка", "худи", "свитер", "куртка", "пальто", "джинсы", "шорты", "брюки", "форма",
    "кимоно", "купальник", "бикини", "бельё", "белье", "пижама", "полотенце", "фартук", "костюм", "топ", "майка"];
  function garmentWords(text) { return GARMENTS.filter((g) => mentions(g, text)); }
  // Сцена одевает персонажа иначе, чем записано в трекере/гардеробе → трекер устарел.
  function wardrobeConflicts(draw, wardrobeTags, outfitText) {
    const inDraw = garmentWords(draw);
    if (!inDraw.length) return false;
    const known = new Set(garmentWords(wardrobeTags + ", " + (outfitText || "")));
    return !inDraw.some((g) => known.has(g));
  }

  /* ── Кто в кадре ───────────────────────────────────────────────────── */
  function ownerKeys(card) {
    const im = card.image || {};
    const keys = [card.name].concat(String(im.aliases || "").split(",")).concat(splitTags(im.trigger).slice(0, 1));
    (im.loras || []).forEach((l) => keys.push(l.name));
    return keys.map((k) => String(k || "").trim()).filter((k) => k.length >= 3);
  }
  /* Контракт кадра: присутствие в сцене ≠ присутствие в конкретном изображении.
     Отсутствие явной привязки пользователя не добавляет его тегов; пустой интерьер
     не превращается в портрет. Для неоднозначного [draw:] сохраняем основной
     персонаж как совместимый запасной выбор, но не второго участника. */
  function identityKeys(card) {
    const base = ownerKeys(card);
    const result = [];
    for (const key of base) {
      result.push(key);
      const parts = words(key.replace(/[_-]/g, " "));
      if (parts.length === 2 && parts.every((x) => x.length >= 3)) result.push(parts[1] + " " + parts[0]);
    }
    return result;
  }
  const FRAME_EMPTY = /\b(?:empty|unoccupied|nobody|no[ _-]one|no[ _-]people|no[ _-]person|without[ _-]people|vacant|landscape[ _-]only|scenery[ _-]only|still[ _-]life)\b|пуст(?:ая|ой|ое|ые|ом|ую)?\b|без\s+людей|никого\s+нет/i;
  const FRAME_HUMAN = /\b(?:[1-9]girls?|[1-9]boys?|girls?|boys?|woman|women|man|men|person|people|portrait|selfie|face|smil(?:e|ing)|sitting|standing|hug(?:ging)?|posing|looking[ _-]at[ _-]viewer|pov)\b|портрет|селфи|улыба|сидит|стоит|обнима/i;
  const COUNT_TAG = /^([1-9])(girls?|boys?)$/i;
  function genderOf(tags) {
    const t = splitTags(parseMap(tags).map((x) => x.tags).join(", ") || tags).map((x) => x.toLowerCase());
    if (t.some((x) => /^(?:[1-9]girls?|female|woman|girl)$/.test(x))) return "girl";
    if (t.some((x) => /^(?:[1-9]boys?|male|man|boy)$/.test(x))) return "boy";
    return null;
  }
  function frameActors(card, persona, draw, opts) {
    const raw = String(draw || "");
    const text = raw.replace(/[_-]/g, " ");
    const ownerNamed = identityKeys(card).some((x) => mentions(x.replace(/[_-]/g, " "), text));
    const userName = (persona && persona.name) || "";
    const userNamed = userName.length >= 3 && !!mentions(userName, text);
    // Именной danbooru-тег другого персонажа (ichigo_kurosaki) исключает
    // автодобавление владельца карточки. Не путать с тегами одежды/внешности.
    const otherName = (raw.match(/\b[a-z]{3,}_[a-z]{3,}\b/gi) || []).some((x) => {
      if (identityKeys(card).some((key) => words(key.replace(/[_-]/g, " ")).sort().join(" ") === words(x.replace(/_/g, " ")).sort().join(" "))) return false;
      if (/^(?:long|short|black|white|orange|brown|red|blue|green|pink|purple|grey|gray|blonde|straight|curly|wavy|messy|school|side|front|back|bare|large|small|medium|light|dark|high|low|very|wide|full|half|upper|lower|closed|open)_/.test(x)) return false;
      const tok = x.split("_");
      return !tok.some((w) => ["hair", "eyes", "dress", "shirt", "skirt", "jacket", "hoodie", "uniform", "blouse", "pants", "sleeves", "view", "pose", "focus", "body", "face", "smile"].includes(w));
    });
    const empty = FRAME_EMPTY.test(text) && !ownerNamed && !userNamed;
    const qty = splitTags(raw).filter((x) => COUNT_TAG.test(x));
    const declared = qty.map((x) => { const m = x.match(COUNT_TAG); return { count: +m[1], gender: m[2].startsWith("girl") ? "girl" : "boy" }; });
    const total = declared.reduce((n, x) => n + x.count, 0);
    const charGender = genderOf([card.image && card.image.trigger, card.image && card.image.look].filter(Boolean).join(", "));
    const userGender = genderOf((persona && persona.image && persona.image.appearance) || "");
    // Один портрет с установленным полом пользователя и несовместимым полом карточки.
    const userOnlyByGender = !ownerNamed && !userNamed && total === 1 && !!charGender && !!userGender &&
      declared[0].gender === userGender && declared[0].gender !== charGender;
    const owner = ownerNamed || (!empty && !otherName && !userNamed && !userOnlyByGender && (FRAME_HUMAN.test(text) || !raw.trim() || !!(opts && opts.assumeOwner)));
    // Смешанный состав явно указан в кадре (например, 1girl + 1boy),
    // второй actor допускается только если его пол совпадает с профилем пользователя.
    const mixed = owner && !userNamed && total >= 2 && !!userGender && declared.some((x) => x.gender === userGender) &&
      (charGender ? declared.some((x) => x.gender === charGender) : declared.length >= 2);
    const user = userNamed || userOnlyByGender || mixed;
    return { owner, user, empty, ownerNamed, userNamed, reason: ownerNamed ? "owner-mentioned" : userNamed ? "user-mentioned" : empty ? "empty" : mixed ? "count-with-persona" : "fallback" };
  }
  function ownerPresent(card, drawText) { return frameActors(card, null, drawText).owner; }

  /* ── compose: из [draw:] и состояния — сцена для перевода и неизменяемые теги ── */
  function compose(o) {
    const card = o.card || {}, im = card.image || {}, persona = o.persona || {}, pim = persona.image || {};
    const st = o.scene || { chars: {}, present: [] };
    const messenger = !!o.messenger;
    const subVars = (v) => String(v || "").replace(/\{\{char\}\}/gi, card.name || "").replace(/\{\{user\}\}/gi, persona.name || "Пользователь");
    const draw = subVars(o.draw).trim();
    const actors = frameActors(card, persona, draw, { assumeOwner: o.assumeOwner });
    const keyOf = (name) => Object.keys(st.chars || {}).find((k) => k.toLowerCase().replace(/ё/g, "е") === String(name || "").toLowerCase().replace(/ё/g, "е"));
    const owner = actors.owner ? st.chars && st.chars[keyOf(card.name)] : null;
    const user = actors.user ? st.chars && st.chars[keyOf(persona.name)] : null;
    const outfit = owner && Array.isArray(owner.wear) ? owner.wear.join(", ") : "";
    const userOutfit = user && Array.isArray(user.wear) ? user.wear.join(", ") : "";

    let wardrobe = actors.owner ? resolveWardrobe(im.wardrobe, outfit) : "";
    // Когда одежда подтверждена состоянием переписки, общий/базовый гардероб
    // карточки не должен подменять её другой формой. Используем словарь
    // образов только если нашёлся явный ключ конкретной одежды.
    if (messenger && actors.owner && outfit && wardrobe) {
      const mapped = parseMap(im.wardrobe).some(({ key }) => key && !isBase(key) && !isSuffix(key) && bestVariant(key, outfit).score > 0);
      if (!mapped) wardrobe = "";
    }
    // В RP при явном изменении одежды в [draw:] старая одежда не навязывается.
    // В мессенджере явно установленная пользователем одежда имеет приоритет над
    // случайными противоречащими деталями от модели; смотрим по сохранённому snapshot.
    const stale = !messenger && actors.owner && wardrobeConflicts(draw, wardrobe, outfit);
    if (stale) wardrobe = "";
    const bits = [];
    if (actors.owner && outfit && !wardrobe && !messenger && !stale && !garmentWords(draw).length) bits.push("clothing: " + outfit);
    if (actors.owner && messenger && outfit && !wardrobe) bits.push("clothing: " + outfit);
    if (actors.owner && owner && owner.pose && (!draw || messenger)) bits.push("pose: " + owner.pose);
    if (actors.owner && owner && owner.visualHair) bits.push("hairstyle: " + owner.visualHair);
    if (actors.user && userOutfit) bits.push("user clothing: " + userOutfit);
    if (actors.user && user && user.pose) bits.push("user pose: " + user.pose);
    let sceneText = [draw, bits.join(", ")].filter(Boolean).join(", ");
    if (messenger && actors.owner && o.messenger.location && !/\b(?:cafe|room|park|street|city|house|home|bedroom|classroom|garden|hospital|library|hallway)\b/i.test(draw))
      sceneText += (sceneText ? ", " : "") + "location: " + o.messenger.location;

    const hay = sceneText.toLowerCase();
    const look = [], tail = [];
    if (actors.owner) for (const { key: k, tags } of parseMap(subVars(im.look))) {
      if (isSuffix(k)) { tail.push(tags); continue; }
      if (!isBase(k) && !bestVariant(k, hay).score) continue;
      const fresh = splitTags(tags).filter((p) => !hay.includes(p.toLowerCase()));
      if (fresh.length) look.push(fresh.join(", "));
    }

    let userTags = "", userTail = "";
    if (pim.view === "first") {
      // POV — камера, а не ещё один нарисованный человек.
      if (actors.owner || actors.user) userTags = ["pov", actors.owner && !actors.user ? "solo" : "", cleanTags(pim.povTags)].filter(Boolean).join(", ");
    } else if (actors.user && pim.appearance) {
      const u = resolveAppearance(subVars(pim.appearance), sceneText, [persona.name]);
      userTags = u.tags; userTail = u.suffix;
    }

    const nsfw = actors.owner ? resolveWardrobe(String(im.nsfw || "").split("\n").filter((l) => !isBase(l.split(":")[0])).join("\n"), sceneText) : "";
    return {
      scene: [look.join(", "), sceneText, tail.join(", ")].filter(Boolean).join(", "),
      keep: [wardrobe, userTags, nsfw].filter(Boolean).join(", "),
      tail: userTail,
      ownerPresent: actors.owner,
      subjects: actors,
      userPresent: actors.user,
      stale,
      visualWear: messenger && actors.owner ? outfit : "",
      provenance: { subjects: actors, card: actors.owner ? card.name : null, user: actors.user ? persona.name : null,
        outfit: outfit || null, userOutfit: userOutfit || null, messenger: messenger || false },
    };
  }

  // Несколько вариантов имени в самом trigger тоже описывают ОДНОГО владельца.
  // Сохраняем первый составной ID и визуальные теги без перестановок.
  function uniqueTrigger(card) {
    const tags = splitTags((card.image && card.image.trigger) || "");
    const candidate = tags.find((t) => {
      const w = words(t.replace(/[_-]/g, " "));
      return w.length === 2 && w.every((x) => x.length > 2) &&
        !/(?:hair|eyes|dress|shirt|skirt|jacket|hoodie|blouse|pose|body|view)/.test(w.join(" "));
    });
    if (!candidate) return tags.join(", ");
    const person = words(candidate.replace(/[_-]/g, " "));
    const signature = person.slice().sort().join(" ");
    let hadName = false;
    return tags.filter((tag) => {
      const w = words(tag.replace(/[_-]/g, " "));
      const same = w.slice().sort().join(" ") === signature;
      const short = w.length === 1 && person.includes(w[0]);
      if (short) return false; // одиночный псевдоним не создаёт второго персонажа
      if (!same) return true;
      if (hadName) return false;
      hadName = true;
      return true;
    }).join(", ");
  }
  function withoutConfiguredLora(text, list) {
    const names = new Set((list || []).filter((x) => x && x.name).map((x) => norm(x.name)));
    return splitTags(text).filter((tag) => {
      const m = tag.match(/^<lora:([^:>]+):/i);
      return !m || !names.has(norm(m[1]));
    }).join(", ");
  }

  // Триггер уже добавляется отдельным блоком. Удалить повторные имена из [draw:]
  // и из результата переводчика, включая "orihime_inoue" / "inoue_orihime".
  // Не трогать описательные теги вроде orange hair и чужие имена.
  function stripIdentityAliases(scene, card) {
    const keys = identityKeys(card).map((x) => words(x.replace(/[_-]/g, " ")).sort().join(" ")).filter(Boolean);
    return splitTags(scene).filter((tag) => {
      const w = words(tag.replace(/[_-]/g, " ")).sort().join(" ");
      return !keys.includes(w);
    }).join(", ");
  }
  // Зафиксированная вручную одежда в мессенджере — источник истины.
  // Теги альтернативной одежды от AI не должны конфликтовать с ней.
  const GARMENT_ALIASES = {
    "худи": "hoodie", "джинсы": "jeans", "платье": "dress", "юбка": "skirt", "рубашка": "shirt", "блузка": "blouse",
    "футболка": "t-shirt", "футболку": "t-shirt", "свитер": "sweater", "куртка": "jacket", "пальто": "coat",
    "брюки": "pants", "шорты": "shorts", "форма": "uniform", "кимоно": "kimono", "пижама": "pajamas",
    "пижаму": "pajamas", "белье": "lingerie", "бельё": "lingerie", "купальник": "swimsuit",
    "майка": "tank top", "топ": "crop top", "костюм": "suit", "hooded jacket": "hoodie",
  };
  function canonicalGarment(g) { return GARMENT_ALIASES[g] || g; }
  function enforceMessengerWardrobe(scene, outfit) {
    if (!String(outfit || "").trim()) return scene;
    const allowed = new Set(garmentWords(outfit).map(canonicalGarment));
    if (!allowed.size) return scene; // незнакомая одежда — не угадывать по словам
    return splitTags(scene).filter((tag) => {
      const garments = garmentWords(tag).map(canonicalGarment);
      return !garments.length || garments.some((g) => allowed.has(g));
    }).join(", ");
  }

  /* ── finalise: итоговый промпт и негатив ───────────────────────────── */
  const POV_NEG = ["extra legs", "extra arms", "disembodied limb", "floating limbs", "headless body", "extra torso"];
  const POV_SOLO_NEG = ["1boy", "male focus", "multiple boys"];

  function loraTokens(list) {
    return (list || []).filter((l) => l && l.name && Number(l.weight) !== 0).map((l) => `<lora:${l.name}:${Number(l.weight) || 1}>`).join(" ");
  }
  function combine(scene, fixed, mode) {
    const s = String(scene || "").trim(), f = String(fixed || "").trim();
    if (!f || mode === "off") return s;
    if (mode === "replace") return f;
    if (mode === "prepend") return [f, s].filter(Boolean).join(", ");
    return [s, f].filter(Boolean).join(", ");
  }
  function joinUnique(...lists) {
    const seen = new Set(), out = [];
    for (const l of lists) for (const t of splitTags(l)) { const n = norm(t); if (n && !seen.has(n)) { seen.add(n); out.push(t); } }
    return out.join(", ");
  }

  /* o: { compiled, composed, card, settings (images), persona, backend }
     backend: "a1111" — LoRA-токены в промпт; иначе LoRA не поддерживаются. */
  function finalise(o) {
    const s = o.settings || {}, im = (o.card && o.card.image) || {}, c = o.composed || {};
    const pinned = s.promptMode !== "off" && String(s.fixedPrompt || "").trim();
    let scene = String(o.compiled == null ? c.scene : o.compiled);
    if (c.ownerPresent !== false && im.trigger) scene = stripIdentityAliases(scene, o.card || {});
    if (c.provenance && c.provenance.messenger && c.ownerPresent !== false && !c.userPresent) scene = enforceMessengerWardrobe(scene, c.visualWear);
    if (pinned) scene = stripQuality(scene);
    const present = c.ownerPresent !== false;
    const trigger = present ? uniqueTrigger(o.card || {}) : "";
    // Стилевые теги персонажа — только те, о которых просит сцена.
    const style = present ? splitTags(im.styleTrigger).filter((t) => mentions(bareTag(t), scene)).join(", ") : "";
    const activeLoras = present ? (im.loras || []).filter((l, i, a) => a.findIndex((x) => norm(x.name) === norm(l.name)) === i) : [];
    const loras = o.backend === "a1111" ? loraTokens(activeLoras) : "";
    // Веса LoRA из карточки авторитетнее случайных дубликатов в [draw:] и переводе.
    if (loras) scene = withoutConfiguredLora(scene, activeLoras);
    const keep = loras ? withoutConfiguredLora(c.keep, activeLoras) : c.keep;
    // Character identity must precede variable shot details: later tags are less reliable anchors.
    // Do not inject the trigger for scenes in which the card owner is absent.
    const body = [trigger, keep, scene, loras, style, c.tail].filter(Boolean).join(", ");
    let p = combine(body, s.fixedPrompt, s.promptMode || "append");
    if (s.promptMode === "replace" && loras && !p.includes("<lora:")) p += ", " + loras;
    const prompt = dropContradictorySolo(normalizeTags(dedupe(p, [trigger, im.styleTrigger].filter(Boolean).join(", "))));

    const pov = o.persona && o.persona.image && o.persona.image.view === "first";
    const povNeg = pov ? POV_NEG.concat(subjectCount(prompt) < 2 && !/\b1boy\b/.test(prompt) ? POV_SOLO_NEG : []) : [];
    const negative = joinUnique(s.negative, present ? im.negative : "", c.absence, povNeg.join(", "));
    return { prompt, negative };
  }

  /* ── Размер кадра ──────────────────────────────────────────────────── */
  const SDXL = [[1024, 1024], [1152, 896], [896, 1152], [1216, 832], [832, 1216], [1344, 768], [768, 1344], [1536, 640], [640, 1536]];
  const RATIOS = { "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "3:2": [3, 2], "2:3": [2, 3], "16:9": [16, 9], "9:16": [9, 16], "21:9": [21, 9], "9:21": [9, 21] };
  // Сохраняет пропорцию, площадь ~1 Мп, кратно 64, предпочитает обученные SDXL-размеры.
  function sizeFor(ratio, opts) {
    const o = opts || {};
    if (o.mode === "fixed" && /\d+x\d+/.test(o.fixed || "")) { const m = o.fixed.match(/(\d+)x(\d+)/); return [+m[1], +m[2]]; }
    const r = RATIOS[ratio] || RATIOS["1:1"];
    const asp = r[0] / r[1], max = o.maxSide || 1216, area = o.area || 1024 * 1024;
    let w = Math.sqrt(area * asp), h = w / asp;
    const k = Math.min(1, max / Math.max(w, h)); w *= k; h *= k;
    const fit = (v) => { let x = Math.max(64, Math.round(v / 64) * 64); while (x > max && x > 64) x -= 64; return x; };
    const fw = fit(w), fh = fit(h);
    const err = (a, b) => Math.abs(Math.log(a / b / asp));
    let best = null, be = Infinity;
    for (const b of SDXL) {
      if (Math.max(b[0], b[1]) > max) continue;
      if (b[0] * b[1] < area * 0.85 || b[0] * b[1] > area * 1.15) continue;
      const e = err(b[0], b[1]);
      if (e < be) { be = e; best = b; }
    }
    return best && be <= err(fw, fh) + 0.002 ? best.slice() : [fw, fh];
  }
  const PERCHANCE_RES = ["512x512", "512x768", "768x512", "768x768"];
  function perchanceResolution(ratio) {
    const r = RATIOS[ratio] || RATIOS["1:1"];
    if (r[0] === r[1]) return "768x768";
    return r[0] > r[1] ? "768x512" : "512x768";
  }
  const OPENAI_SIZES = [[1024, 1024], [1536, 1024], [1024, 1536], [1792, 1024], [1024, 1792]];
  function openaiSize(ratio) {
    const r = RATIOS[ratio] || RATIOS["1:1"], t = Math.log(r[0] / r[1]);
    return OPENAI_SIZES.reduce((a, b) => (Math.abs(Math.log(b[0] / b[1]) - t) < Math.abs(Math.log(a[0] / a[1]) - t) ? b : a));
  }

  /* ── Директивы [draw: …] в ответе модели ───────────────────────────── */
  const DRAW_RE = /\[draw:\s*([^\]]+)\]/gi;
  function parseDraws(text) {
    const draws = [];
    const clean = String(text || "").replace(DRAW_RE, (_, body) => {
      let prompt = body.trim(), ratio = "1:1";
      const m = prompt.match(/,?\s*(\d{1,2}:\d{1,2})\s*$/);
      if (m && RATIOS[m[1]]) { ratio = m[1]; prompt = prompt.slice(0, m.index).trim(); }
      if (prompt) draws.push({ prompt, ratio });
      return "";
    });
    return { text: clean.replace(/\n{3,}/g, "\n\n").trim(), draws };
  }
  function stripDrawsForDisplay(text) { return String(text || "").replace(DRAW_RE, "").replace(/\[draw:[^\]]*$/i, ""); }

  /* Инструкция модели, когда она может «нарисовать» момент сама. */
  function drawInstruction(o) {
    const opts = o || {};
    const tags = opts.format !== "description";
    const pinned = !!opts.qualityPinned;
    const lines = [
      "Ты можешь показать собеседнику картинку. Для этого напиши ОДНУ директиву отдельной строкой: [draw: <prompt>]",
      tags
        ? "- <prompt> — только то, что видит камера в этот момент, списком английских тегов в стиле danbooru через запятую (например: 1girl, long orange hair, white blouse, sitting at a table, library, soft lighting, close-up). Без предложений."
        : "- <prompt> — только то, что видит камера в этот момент, одним-двумя простыми английскими предложениями.",
      pinned ? "- Не пиши теги качества (masterpiece, best quality, absurdres, 8k) и веса вида (x:1.3) — приложение добавит их само." : "- Начни с короткого постоянного блока качества (masterpiece, best quality).",
      "- Порядок: персонажи в кадре и их внешность → действие, поза, выражение, одежда, место → свет и ракурс.",
      opts.pov
        ? "- Вид от первого лица: камера — глаза собеседника, его самого в кадре нет. Начни с pov, его лицо и одежду не описывай; видимые части тела — только тегами pov hands / pov feet и т. п. Если в кадре один человек — это solo."
        : "- Указывай только тех людей, которые действительно видны в кадре. Присутствие рядом не означает обязательного попадания на фото. Если пользователь виден — явно назови его или покажи состав кадра (1girl, 1boy). Не дублируй одного персонажа разными именами. solo — только когда в кадре один человек. Каждый видимый человек: имя + пол + возраст + 1–2 приметы (например, ichigo_kurosaki, male, young man, short orange hair).",
      "- Покажи действие, а не только позу, и сохрани градус сцены: ничего откровеннее и ничего целомудреннее, чем происходит. Обычный момент остаётся обычным.",
      "- Промпт всегда на английском; нелатинские имена — в латинской транскрипции.",
      "- В конце можно указать пропорции: [draw: <prompt>, 16:9]. Варианты: 16:9, 9:16, 4:3, 3:4, 1:1 (по умолчанию).",
      "- Не больше одной директивы за ответ, и только когда картинка действительно уместна или о ней просят.",
    ];
    return lines.join("\n");
  }

  /* Правила перевода сцены в промпт (для compile.js). */
  function rewriteRules(o) {
    const opts = o || {};
    const q = opts.qualityPinned
      ? "Do NOT write quality tags (masterpiece, best quality, absurdres, 8k) or weighted tags — the app pins its own."
      : "Keep quality tags the scene already has; if none, add a short consistent set (masterpiece, best quality).";
    const base = opts.format === "description"
      ? "Rewrite the scene into a prompt for an image model that reads natural language (SDXL, Flux). Output ONLY one to three English sentences, no lists, no quotes, no markdown.\nORDER: who is in frame (name, gender, age, look; each person their own appearance and action) → what they do and where → style, lighting, camera."
      : "Rewrite the scene into a prompt for an anime Stable Diffusion model (SDXL / Pony / Illustrious / NoobAI). Output ONLY one line of comma-separated English danbooru tags. No sentences, no quotes, no markdown.\nORDER: each person in frame — name immediately followed by gender, age category and 1-2 visual anchors (e.g. rukia_kuchiki, female, young woman, short black hair) plus the count tag (1girl, 1boy, 2girls; solo only for exactly one person) → action, pose, expression, clothing exactly as described, setting, time of day → style, lighting, camera.";
    const rules = [
      "Keep every concrete detail: pose, action, expression, exactly the garments described, place, time, framing.",
      "Keep the amount of clothing exactly as described. Never add nudity or sexual content the scene did not state; if the scene is sexual, name the act plainly with standard tags, never soften it.",
      q,
      "Translate anything not in English; romanise non-Latin names.",
      opts.format === "description" ? "60 words or fewer." : "50 tags or fewer.",
    ];
    let txt = base + "\nRULES:\n" + rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
    if (opts.pov) txt += "\nFIRST-PERSON VIEW: the camera is the viewer's eyes. Start with pov; never describe the viewer; only one person in frame unless the scene shows the viewer's hands etc.";
    if (opts.frame) {
      const f = opts.frame;
      txt += "\nFRAME IDENTITY (do not invent extra copies or people):\n" +
        "Card owner is " + (f.owner ? "visible" : "NOT visible") + "; user is " + (f.user ? "visible" : "NOT visible") +
        ". Never inject either when not visible. Preserve any OTHER people explicitly in SCENE; one named person must not become two because of alternate tags.";
    }
    if (opts.identity) txt += "\nCHARACTER (keep this look constant; tags listed as injected later must NOT be repeated):\n" + opts.identity;
    return txt;
  }

  function needsRewrite(s) { return /[Ѐ-ԯ぀-ヿ㐀-鿿가-힯]/.test(String(s || "")); }

  PRP.imgCompose = {
    words, wordFormMatch, mentions, parseMap, resolveWardrobe, resolveAppearance,
    splitTags, bareTag, normalizeTags, stripQuality, subjectCount, dropContradictorySolo, dedupe,
    wardrobeConflicts, ownerPresent, frameActors, stripIdentityAliases, enforceMessengerWardrobe, uniqueTrigger, compose, finalise, loraTokens, sizeFor, perchanceResolution, openaiSize,
    parseDraws, stripDrawsForDisplay, drawInstruction, rewriteRules, needsRewrite, RATIOS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = PRP.imgCompose;
})(typeof window !== "undefined" ? window : globalThis);
