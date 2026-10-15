// Тесты чистых модулей Prism RP: node tests/run.js
"use strict";
const assert = require("assert");
const path = require("path");
const J = (p) => path.join(__dirname, "..", "js", p);
require(J("core/util.js"));
require(J("prism/scene.js"));
require(J("prism/experience.js"));
require(J("prism/assembler.js"));
require(J("cards/ccard.js"));
require(J("providers/openai.js"));
require(J("chat/tree.js"));
require(J("images/compose.js"));
require(J("images/backends.js"));
require(J("images/compile.js"));
const { scene: S, experience: E, assembler: A, ccard: C, openai: O, tree: T, imgCompose: IC, imgBackends: IB, imgCompile: ICP } = globalThis.PRP;

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log("✗ " + name + "\n   " + (e.message || e)); }
}

/* ── Сцена ── */
t("parse: директивы вырезаются, операции собираются", () => {
  const r = S.parse("Она улыбнулась.\n\n[scene: time=+15m; loc=Кафе, терраса; Химэ.wear=худи, джинсы]");
  assert.strictEqual(r.text, "Она улыбнулась.");
  assert.strictEqual(r.ops.length, 3);
  assert.deepStrictEqual(r.ops[2], { subject: "Химэ", key: "wear", value: "худи, джинсы", raw: "Химэ.wear=худи, джинсы" });
});
t("stripForDisplay прячет незакрытую директиву при стриминге", () => {
  assert.strictEqual(S.stripForDisplay("Привет [scene: time=+1"), "Привет");
});
t("время: сдвиг, переход через полночь и день", () => {
  let st = S.fold("time=23:50", [{ ops: S.parseBody("time=+20m") }]);
  assert.strictEqual(st.clock.min, 10);
  assert.strictEqual(st.clock.day, 2);
});
t("время: ранее текущего без даты — следующий день", () => {
  const st = S.fold("time=22:00", [{ ops: S.parseBody("time=08:30") }]);
  assert.strictEqual(st.clock.day, 2);
  assert.strictEqual(st.clock.min, 510);
});
t("время: дата DD.MM и ISO, перенос месяца", () => {
  let st = S.fold("time=31.05 23:30", [{ ops: S.parseBody("time=+1h") }]);
  assert.strictEqual(S.formatClock(st.clock), "01.06, 00:30");
  st = S.fold("time=2026-12-31 23:00", [{ ops: S.parseBody("time=+2h") }]);
  assert.strictEqual(S.formatClock(st.clock), "01.01.2027, 01:00");
});
t("время: 18.40 читается как время, 14.05 — как дата", () => {
  assert.strictEqual(S.fold("time=18.40", []).clock.min, 18 * 60 + 40);
  assert.strictEqual(S.fold("time=14.05", []).clock.m, 5);
});
t("гардероб: add/remove с частичным совпадением, wear=- очищает", () => {
  let st = S.fold("Химэ.wear=белая блузка, юбка, пиджак", [{ ops: S.parseBody("Химэ.remove=пиджак; Химэ.add=шарф") }]);
  assert.deepStrictEqual(st.chars["Химэ"].wear, ["белая блузка", "юбка", "шарф"]);
  st = S.fold("Химэ.wear=юбка", [{ ops: S.parseBody("химэ.remove=Юбка") }]);
  assert.deepStrictEqual(st.chars["Химэ"].wear, []);
  st = S.fold("Химэ.wear=юбка", [{ ops: S.parseBody("Химэ.wear=-") }]);
  assert.deepStrictEqual(st.chars["Химэ"].wear, []);
});
t("отношения: шаг ограничен ±3, итог ±10, причина в журнале", () => {
  const st = S.fold("", [{ msgId: "m1", ops: S.parseBody("Химэ.rel=+7 спас; Химэ.rel=-1 соврал о деньгах") }]);
  assert.strictEqual(st.chars["Химэ"].rel, 2);
  assert.strictEqual(st.chars["Химэ"].relLog[1].why, "соврал о деньгах");
  assert.strictEqual(st.chars["Химэ"].relLog[0].msgId, "m1");
});
t("присутствие: enter/leave без дублей, регистр не важен", () => {
  const st = S.fold("enter=Юки, Кэн", [{ ops: S.parseBody("enter=юки; leave=кэн") }]);
  assert.deepStrictEqual(st.present, ["Юки"]);
});
t("relset: точная установка из формы", () => {
  const st = S.fold("", [{ ops: S.parseBody("Химэ.rel=+2 a; Химэ.relset=7 вручную") }]);
  assert.strictEqual(st.chars["Химэ"].rel, 7);
  assert.strictEqual(st.chars["Химэ"].relLog[1].delta, 5);
  assert.strictEqual(S.summaryLine(S.fold("time=14.05 18:00; loc=Кафе; weather=дождь", [])), "14.05, 18:00 · Кафе · дождь");
});
t("неизвестные ключи не ломают сцену", () => {
  const r = S.apply(S.emptyState(), S.parseBody("foo=bar; Химэ.xyz=1; просто текст"));
  assert.strictEqual(r.applied.length, 0);
  assert.strictEqual(r.ignored.length, 3);
});
t("describe: отношение словом и причиной, без чисел", () => {
  const st = S.fold("loc=Кафе; Химэ.mood=смущена", [{ ops: S.parseBody("Химэ.rel=-2 соврал о деньгах") }]);
  const d = S.describe(st, { userName: "Кира" });
  assert.ok(d.includes("Место: Кафе"));
  assert.ok(d.includes("отношение к собеседнику (Кира): настороженно — соврал о деньгах"));
  assert.ok(!/-2/.test(d));
});

/* ── Опыт ── */
const recs = [
  { id: "a", owner: "c1", status: "active", event: "Он предал её", valence: -3, weight: 3, about: ["user"], domains: ["доверие"], createdAt: 3 },
  { id: "b", owner: "c1", status: "active", event: "Он выручил её деньгами", valence: 2, weight: 1, about: ["user"], domains: ["деньги"], createdAt: 1 },
  { id: "c", owner: "c1", status: "active", event: "Поссорилась с сестрой", valence: -1, weight: 1, about: ["sis"], domains: [], createdAt: 2 },
  { id: "d", owner: "c2", status: "active", event: "чужой опыт", valence: 0, weight: 3, about: ["user"], domains: [], createdAt: 4 },
  { id: "e", owner: "c1", status: "superseded", event: "старое", valence: 0, weight: 3, about: ["user"], domains: [], createdAt: 5 },
];
t("опыт: только свой и активный (эпистемическая граница)", () => {
  const r = E.select(recs, { ownerId: "c1", present: ["user"], limit: 10 });
  assert.deepStrictEqual(r.map((x) => x.id).sort(), ["a", "b", "c"]);
});
t("опыт: противовес добирается сверх лимита", () => {
  const r = E.select(recs, { ownerId: "c1", present: ["user"], text: "", limit: 1 });
  assert.deepStrictEqual(r.map((x) => x.id), ["b", "a"]);
  assert.ok(r.find((x) => x.id === "b").__counter);
});
t("опыт: домены поднимают релевантность", () => {
  const r = E.select(recs, { ownerId: "c1", present: [], text: "Одолжишь денег?", limit: 1 });
  assert.strictEqual(r[0].id === "b" || r.some((x) => x.id === "b"), true);
});

/* ── Сборщик ── */
const card = {
  name: "Химэ", description: "Студентка, {{user}} — её одногруппник.", personality: "ревнивая, но отходчивая",
  scenario: "", systemPrompt: "", postHistory: "", mesExample: "<START>\n{{char}}: Ну и ладно!",
  lore: [{ keys: ["университет"], content: "Токийский университет", enabled: true }, { keys: [], content: "Мир — современная Япония", constant: true }],
};
t("сборка: слои подписаны, макросы подставлены, протокол в конце", () => {
  const st = S.fold("loc=Кафе", []);
  const r = A.build({ card, userName: "Кира", sceneState: st, experiences: [recs[0]], history: [{ role: "assistant", text: "Привет" }, { role: "user", text: "Как университет?" }] });
  const sys = r.messages[0].content;
  assert.ok(sys.includes("не диктуют поступки"));
  assert.ok(sys.includes("Кира — её одногруппник"));
  assert.ok(sys.includes("Что Химэ помнит"));
  assert.ok(sys.includes("Токийский университет"));
  assert.ok(sys.includes("Мир — современная Япония"));
  assert.ok(sys.includes("### Сейчас (факты)\nМесто: Кафе"));
  assert.strictEqual(r.messages[r.messages.length - 1].role, "system");
  assert.ok(r.messages[r.messages.length - 1].content.includes("[scene:"));
});
t("сборка: режим мессенджера меняет рамку и подпись сцены", () => {
  const r = A.build({ mode: "messenger", card, userName: "Кира", sceneState: S.fold("loc=Работа", []), history: [] });
  assert.ok(r.messages[0].content.includes("переписывается с Кира"));
  assert.ok(r.messages[0].content.includes("вне переписки"));
});
t("сборка: одно system и чередование для строгих шаблонов", () => {
  const r = A.build({ card, singleSystem: true, history: [{ role: "assistant", text: "a" }, { role: "user", text: "b" }, { role: "user", text: "c" }] });
  assert.strictEqual(r.messages.filter((m) => m.role === "system").length, 1);
  assert.strictEqual(r.messages[1].role, "user");
  for (let i = 2; i < r.messages.length; i++) assert.notStrictEqual(r.messages[i].role, r.messages[i - 1].role);
});
t("сборка: бюджет режет старую историю, но держит последние сообщения", () => {
  const long = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? "user" : "assistant", text: "x".repeat(700) + i }));
  const r = A.build({ card, history: long, contextTokens: 4096, reserveTokens: 500 });
  assert.ok(r.report.historyKept < 60 && r.report.historyKept >= 4);
  assert.ok(r.messages.some((m) => m.content.endsWith("59")));
  assert.ok(r.report.used <= r.report.budget + 1500);
});

/* ── Карточки ── */
function tinyPng() {
  // 1×1 прозрачный PNG
  return Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
}
t("карточка: V2 → PNG → обратно без потерь, extensions сохраняются", () => {
  const v2 = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Химэ ✿", description: "Описание", first_mes: "Привет", mes_example: "", personality: "", scenario: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: ["Йо"], tags: ["школа"], creator: "я", character_version: "1", extensions: { foo: { bar: 1 } }, character_book: { entries: [{ keys: ["Токио"], content: "Город", enabled: true, insertion_order: 0, extensions: {} }], extensions: {} } } };
  const card = C.normalize(v2);
  assert.strictEqual(card.name, "Химэ ✿");
  assert.strictEqual(card.lore[0].keys[0], "Токио");
  const png = C.embedInPng(tinyPng(), card);
  const back = C.cardJsonFromPng(png);
  assert.strictEqual(back.spec, "chara_card_v3");
  assert.strictEqual(back.data.name, "Химэ ✿");
  assert.deepStrictEqual(back.data.extensions, { foo: { bar: 1 } });
  assert.strictEqual(back.data.character_book.entries[0].content, "Город");
  // повторная запись не плодит чанки
  const png2 = C.embedInPng(png, card);
  const s = Buffer.from(png2).toString("latin1");
  assert.strictEqual(s.split("tEXtchara").length - 1, 1);
});
t("карточка: поля CCv2 и лорбук туда-обратно, LoRA в extensions.prism_rp", () => {
  const src = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Юки", description: "d", personality: "p", scenario: "s", first_mes: "f", mes_example: "e",
    creator_notes: "n", system_prompt: "sp", post_history_instructions: "ph", alternate_greetings: ["a1", "a2"], tags: ["t"], creator: "me", character_version: "1.2",
    extensions: { other_app: { x: 1 } },
    character_book: { entries: [{ keys: ["кафе"], secondary_keys: ["вечер"], selective: true, content: "c", enabled: true, insertion_order: 5, position: "before_char", comment: "Кафе", constant: false, priority: 7, extensions: { st: 1 } }] } } };
  const c = C.normalize(src);
  assert.strictEqual(c.creatorNotes, "n"); assert.strictEqual(c.version, "1.2"); assert.deepStrictEqual(c.altGreetings, ["a1", "a2"]);
  assert.deepStrictEqual(c.lore[0].secondary_keys, ["вечер"]); assert.strictEqual(c.lore[0].position, "before_char"); assert.strictEqual(c.lore[0].comment, "Кафе");
  c.image = { trigger: "yuki", loras: [{ name: "Yuki_IL", weight: 0.8 }] };
  const out = C.toSpec(c, "v2").data;
  assert.strictEqual(out.creator_notes, "n"); assert.strictEqual(out.character_version, "1.2");
  const e = out.character_book.entries[0];
  assert.ok(e.selective && e.secondary_keys[0] === "вечер" && e.position === "before_char" && e.priority === 7 && e.extensions.st === 1 && e.name === "Кафе");
  assert.strictEqual(out.extensions.other_app.x, 1);
  assert.strictEqual(out.extensions.prism_rp.image.loras[0].name, "Yuki_IL");
  assert.strictEqual(C.normalize({ spec: "chara_card_v2", data: out }).image.loras[0].name, "Yuki_IL");
});
t("лорбук: выборочная запись требует доп. ключ, позиция before_char", () => {
  const cd = { name: "Юки", description: "Описание Юки", lore: [
    { keys: ["кафе"], secondary_keys: ["вечер"], selective: true, content: "LORE-SEL", enabled: true },
    { keys: ["кафе"], content: "LORE-BEFORE", position: "before_char", enabled: true },
    { keys: ["Кафе"], case_sensitive: true, content: "LORE-CASE", enabled: true }] };
  const sys1 = A.build({ card: cd, history: [{ role: "user", text: "пойдём в кафе" }] }).messages[0].content;
  assert.ok(!sys1.includes("LORE-SEL") && !sys1.includes("LORE-CASE"));
  assert.ok(sys1.indexOf("LORE-BEFORE") < sys1.indexOf("Описание Юки"));
  const sys2 = A.build({ card: cd, history: [{ role: "user", text: "Кафе вечером?" }] }).messages[0].content;
  assert.ok(sys2.includes("LORE-SEL") && sys2.includes("LORE-CASE"));
});
t("карточка: CRC верный (сверка с zlib)", () => {
  const zlib = require("zlib");
  const data = Buffer.from("IEND");
  assert.strictEqual(C.crc32(data), zlib.crc32 ? zlib.crc32(data) : 0xae426082);
});
t("карточка: V1 и V3 нормализуются", () => {
  assert.strictEqual(C.normalize({ name: "A", first_mes: "hi" }).firstMes, "hi");
  assert.strictEqual(C.normalize({ spec: "chara_card_v3", data: { name: "B", nickname: "Би" } }).name, "B");
});

/* ── Провайдер ── */
t("SSE: куски, разорванные посреди строки, и [DONE]", () => {
  let text = "", done = false;
  const p = O.createSSEParser((j, d) => { if (d) done = true; else text += O.deltaOf(j).text; });
  p.push('data: {"choices":[{"delta":{"content":"При"}}]}\n\ndata: {"choi');
  p.push('ces":[{"delta":{"content":"вет"}}]}\r\n\r\ndata: [DONE]\n\n');
  assert.strictEqual(text, "Привет");
  assert.ok(done);
});
t("SSE: reasoning_content отделяется от текста", () => {
  const d = O.deltaOf({ choices: [{ delta: { reasoning_content: "думаю", content: "" } }] });
  assert.strictEqual(d.reasoning, "думаю");
});
t("splitThink: <think> в тексте", () => {
  assert.deepStrictEqual(O.splitThink("<think>хм</think>\nОтвет"), { reasoning: "хм", text: "Ответ" });
  assert.deepStrictEqual(O.splitThink("<think>ещё думаю"), { reasoning: "ещё думаю", text: "" });
});
t("isLocalUrl", () => {
  assert.ok(O.isLocalUrl("http://127.0.0.1:1234/v1"));
  assert.ok(O.isLocalUrl("http://192.168.1.5:7860"));
  assert.ok(!O.isLocalUrl("https://openrouter.ai/api/v1"));
});

/* ── Дерево ── */
t("дерево: путь, потомки, последний лист", () => {
  const list = [
    { id: "1", parentId: null, createdAt: 1 }, { id: "2", parentId: "1", createdAt: 2 },
    { id: "3", parentId: "1", createdAt: 3 }, { id: "4", parentId: "3", createdAt: 4 },
  ];
  assert.deepStrictEqual(T.path(T.index(list), "4").map((m) => m.id), ["1", "3", "4"]);
  assert.deepStrictEqual(T.descendants(list, "1").sort(), ["2", "3", "4"]);
  assert.strictEqual(T.latestLeaf(list, "1"), "4");
});


/* ── Изображения ── */
t("словоформы: красное~красном, Лёня~Лёне, girl≠1girl", () => {
  assert.ok(IC.mentions("красное платье", "она в красном платье"));
  assert.ok(IC.mentions("Лёня", "рядом Лёне"));
  assert.ok(!IC.mentions("girl", "1girl, solo"));
});
t("карта: ключ с вариантами, многострочные теги, lora не путается с ключом", () => {
  const m = IC.parseMap("base: inoue orihime, orange hair\nschool uniform | школьная форма:\nserafuku, red neckerchief\n<lora:uni:0.7>, blazer\nsuffix: soft light");
  assert.strictEqual(m.length, 3);
  assert.strictEqual(m[1].key, "school uniform | школьная форма");
  assert.strictEqual(m[1].tags, "serafuku, red neckerchief, <lora:uni:0.7>, blazer");
  assert.strictEqual(m[2].key, "suffix");
});
t("гардероб: база + лучший образ по одежде из сцены", () => {
  const w = "base: orihime\nшкольная форма | school uniform: serafuku\nкрасное платье: red dress, <lora:dress:0.8>\nплатье: generic dress";
  assert.strictEqual(IC.resolveWardrobe(w, "белая блузка, юбка"), "orihime");
  assert.strictEqual(IC.resolveWardrobe(w, "красное платье, туфли"), "orihime, red dress, <lora:dress:0.8>");
  assert.strictEqual(IC.resolveWardrobe(w, "школьная форма"), "orihime, serafuku");
});
t("гигиена: запятые, пустые теги, пропорции, score_9", () => {
  assert.strictEqual(IC.normalizeTags("best quality,amazing quality, , 1girl,16:9, score_9, (smile, blush:1.2)"), "best quality, amazing quality, 1girl, (smile, blush:1.2)");
});
t("дедуп по триггеру: снимает повтор личности, кроме двух полов", () => {
  assert.strictEqual(IC.dedupe("1girl, long orange hair, smile, smile", "orihime, long hair, orange hair"), "1girl, smile");
  assert.strictEqual(IC.dedupe("1girl, 1boy, orange hair, smile", "orange hair"), "1girl, 1boy, orange hair, smile");
});
t("solo снимается, когда в кадре двое", () => {
  assert.strictEqual(IC.dropContradictorySolo("1girl, 1boy, solo, hug"), "1girl, 1boy, hug");
  assert.strictEqual(IC.dropContradictorySolo("1girl, solo"), "1girl, solo");
});
const imgCard = { name: "Химэ", image: { trigger: "orihime inoue, long orange hair", negative: "short hair", loras: [{ name: "Orihime_IL", weight: 0.8 }],
  wardrobe: "худи | hoodie: grey hoodie, jeans", look: "base: brown eyes\nулыбка: gentle smile", nsfw: "голая | nude: nude, nipples" } };
const st0 = S.fold("enter=Химэ; Химэ.wear=худи, джинсы; Химэ.pose=сидит у окна", []);
t("compose: гардероб из сцены уходит в неизменяемые теги", () => {
  const c = IC.compose({ draw: "1girl, sitting, cafe", card: imgCard, scene: st0, persona: { name: "Кира" } });
  assert.strictEqual(c.keep, "grey hoodie, jeans");
  assert.ok(c.scene.startsWith("brown eyes"));
  assert.ok(c.ownerPresent);
});
t("compose: сцена одевает иначе → устаревший гардероб не добавляется", () => {
  const c = IC.compose({ draw: "1girl, red dress, standing", card: imgCard, scene: st0, persona: {} });
  assert.strictEqual(c.keep, "");
  assert.ok(c.stale);
});
t("compose: NSFW-теги только по сцене, а не по одежде", () => {
  assert.ok(!IC.compose({ draw: "1girl, smile", card: imgCard, scene: st0, persona: {} }).keep.includes("nude"));
  assert.ok(IC.compose({ draw: "1girl, nude, bed", card: imgCard, scene: st0, persona: {} }).keep.includes("nipples"));
});
t("compose: POV — внешность пользователя не добавляется, solo для одного", () => {
  const c = IC.compose({ draw: "1girl, looking at viewer", card: imgCard, scene: st0, persona: { image: { view: "first", appearance: "base: 1boy, black hair" } } });
  assert.strictEqual(c.keep, "grey hoodie, jeans, pov, solo");
  assert.ok(!c.keep.includes("black hair"));
});
t("compose: внешность пользователя и его тег-субъект в сцене", () => {
  const c = IC.compose({ draw: "1girl, hug", card: imgCard, scene: st0, persona: { image: { appearance: "base: 1boy, black hair" } } });
  assert.ok(c.keep.includes("1boy, black hair"));
  assert.ok(/\b1boy\b/.test(c.scene));
});
t("finalise: LoRA и триггер персонажа, закреплённый блок качества, негатив", () => {
  const composed = IC.compose({ draw: "1girl, sitting, cafe, masterpiece", card: imgCard, scene: st0, persona: {} });
  const f = IC.finalise({ composed, card: imgCard, backend: "a1111", settings: { fixedPrompt: "masterpiece, best quality", promptMode: "append", negative: "lowres", loras: [{ name: "detail", weight: 0.5 }] } });
  // Общие LoRA из настроек больше не применяются — только LoRA карточки.
  assert.ok(f.prompt.includes("<lora:Orihime_IL:0.8>") && !f.prompt.includes("<lora:detail"));
  assert.ok(f.prompt.includes("orihime inoue"));
  assert.strictEqual(f.prompt.split("masterpiece").length - 1, 1);
  assert.strictEqual(f.negative, "lowres, short hair");
});
t("finalise: другой названный персонаж без неё → её триггер, LoRA и негатив не идут", () => {
  const composed = IC.compose({ draw: "1boy, ichigo_kurosaki, standing", card: imgCard, scene: st0, persona: {} });
  const f = IC.finalise({ composed, card: imgCard, backend: "a1111", settings: { negative: "lowres" } });
  assert.ok(!f.prompt.includes("Orihime_IL") && !f.prompt.includes("orihime inoue"));
  assert.strictEqual(f.negative, "lowres");
});
t("finalise: для Perchance/OpenAI LoRA-токены не добавляются", () => {
  const composed = IC.compose({ draw: "1girl", card: imgCard, scene: st0, persona: {} });
  assert.ok(!IC.finalise({ composed, card: imgCard, backend: "perchance", settings: {} }).prompt.includes("<lora:"));
});
t("размеры: SDXL-бакеты, Perchance, OpenAI", () => {
  assert.deepStrictEqual(IC.sizeFor("1:1"), [1024, 1024]);
  assert.deepStrictEqual(IC.sizeFor("2:3"), [832, 1216]);
  assert.deepStrictEqual(IC.sizeFor("16:9"), [1216, 704]);
  assert.deepStrictEqual(IC.sizeFor("16:9", { maxSide: 1344 }), [1344, 768]);
  assert.deepStrictEqual(IC.sizeFor("16:9", { mode: "fixed", fixed: "1024x768" }), [1024, 768]);
  assert.strictEqual(IC.perchanceResolution("9:16"), "512x768");
  assert.deepStrictEqual(IC.openaiSize("16:9"), [1792, 1024]);
});
t("директивы [draw:] с пропорциями вырезаются из текста", () => {
  const r = IC.parseDraws("Она улыбается.\n\n[draw: 1girl, smile, cafe, 16:9]");
  assert.strictEqual(r.text, "Она улыбается.");
  assert.deepStrictEqual(r.draws, [{ prompt: "1girl, smile, cafe", ratio: "16:9" }]);
  assert.strictEqual(IC.stripDrawsForDisplay("Текст [draw: 1girl, sm"), "Текст ");
});
t("A1111: тело запроса с hires, VAE, моделью и seed", () => {
  const b = IB.a1111Body({ steps: 30, cfg: 6, model: "illustrious.safetensors", vae: "sdxl_vae", hires: true, hiresScale: 1.5, hiresUpscaler: "R-ESRGAN 4x+ Anime6B", sampler: "Euler a" }, { prompt: "p", negative: "n", ratio: "2:3", seed: 42 });
  assert.strictEqual(b.width, 832); assert.strictEqual(b.height, 1216);
  assert.strictEqual(b.seed, 42);
  assert.strictEqual(b.enable_hr, true); assert.strictEqual(b.hr_second_pass_steps, 15); assert.strictEqual(b.denoising_strength, 0.4);
  assert.deepStrictEqual(b.override_settings, { sd_model_checkpoint: "illustrious.safetensors", sd_vae: "sdxl_vae" });
});

async function asyncTests() {
  let calls = 0;
  const gen = async (ins) => { calls++; assert.ok(ins.includes("SCENE:\nОна сидит")); return "1girl, sitting, cafe"; };
  const a = await ICP.compile("Она сидит в кафе", { format: "tags" }, gen);
  const b = await ICP.compile("Она сидит в кафе", { format: "tags" }, gen);
  const c = await ICP.compile("1girl, standing", { format: "tags" }, gen);
  t("перевод: результат, кэш, английский без вызова", () => {
    assert.strictEqual(a.text, "1girl, sitting, cafe");
    assert.ok(b.cached);
    assert.strictEqual(c.compiled, false);
    assert.strictEqual(calls, 1);
  });
  const d = await ICP.compile("Она стоит", {}, async () => { throw new Error("down"); });
  t("перевод: при ошибке модели — исходный текст", () => assert.strictEqual(d.text, "Она стоит"));
}
asyncTests().then(() => {
console.log(`\n${passed} пройдено, ${failed} с ошибками`);
process.exit(failed ? 1 : 0);
});
