// Тесты чистых модулей Prism RP: node tests/run.js
"use strict";
const assert = require("assert");
const path = require("path");
const J = (p) => path.join(__dirname, "..", "js", p);
require(J("core/util.js"));
require(J("prism/scene.js"));
require(J("prism/experience.js"));
require(J("prism/scenario.js"));
require(J("prism/assembler.js"));
require(J("cards/model.js"));
require(J("cards/ccard.js"));
require(J("cards/formats/common.js"));
require(J("cards/formats/detect.js"));
require(J("cards/formats/cc-v1.js"));
require(J("cards/formats/cc-v2.js"));
require(J("cards/formats/cc-v3.js"));
require(J("cards/formats/urv-v2.js"));
require(J("cards/validate.js"));
require(J("cards/import.js"));
require(J("providers/openai.js"));
require(J("chat/tree.js"));
require(J("images/compose.js"));
require(J("images/backends.js"));
require(J("images/compile.js"));
require(J("assist/assist.js"));
require(J("core/settings.js"));
require(J("ui/render.js"));
const { scene: S, experience: E, assembler: A, ccard: C, openai: O, tree: T, imgCompose: IC, imgBackends: IB, imgCompile: ICP, assist: AST, render: RN, settings: STG, cardModel: CM, cardFormats: CF, cardImport: IMP, cardValidate: VAL } = globalThis.PRP;
// Импорт карточки из объекта → черновик (для тестов, где важен только результат).
const normalize = (json) => { const r = IMP.fromObject(json, "json", "t.json"); if (!r.ok) throw new Error(r.issues.map((x) => x.message).join("; ")); return r.draft; };
const authored = (sys, post) => ({ system: CM.directive(sys || "", "authored"), postHistory: CM.directive(post || "", "authored") });

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

/* ── Опыт: канон чата и веток (этап 1) ── */
// Дерево чата X:  R → A1 → A2 → A3
//                        └→ B2 → B3
const P = (ids, sw) => ids.map((id) => ({ id, swipeIdx: (sw && sw[id]) || 0 }));
const PATH_A3 = P(["R", "A1", "A2", "A3"]), PATH_B3 = P(["R", "A1", "B2", "B3"]);
const X = (id, extra) => Object.assign({ id, owner: "c1", status: "active", event: "событие " + id, valence: 0, weight: 1, about: ["user"], domains: ["тест"], createdAt: 1, source: { messageIds: [] } }, extra);
const E1 = X("E1", { chatId: "X", source: { chatId: "X", messageIds: ["A2"] } });
const E2 = X("E2", { chatId: "X", source: { chatId: "X", messageIds: ["B2"] } });
const E3 = X("E3", { chatId: "X", source: { chatId: "X", messageIds: [] } });
const E4 = X("E4", { chatId: "Y", source: { chatId: "Y", messageIds: [] } });
const E5 = X("E5", { chatId: null, legacyUnscoped: true, source: { messageIds: [] } });
const ALL = [E1, E2, E3, E4, E5];
const vis = (path) => ALL.filter((r) => E.visibility(r, { chatId: "X", path }).visible).map((r) => r.id);

t("PRISM1-2/3: опыт ветки A не виден в ветке B и возвращается", () => {
  assert.deepStrictEqual(vis(PATH_A3), ["E1", "E3"]);
  assert.deepStrictEqual(vis(PATH_B3), ["E2", "E3"]);
  assert.deepStrictEqual(vis(PATH_A3), ["E1", "E3"]);
  // В Prism попадает только видимое
  const sel = E.rank(ALL, { chatId: "X", path: PATH_B3, present: ["user"], text: "тест" }).selected.map((r) => r.id).sort();
  assert.deepStrictEqual(sel, ["E2", "E3"]);
});
t("PRISM1-1/5: другой чат с той же карточкой не видит опыт, ручная запись — только в своём чате", () => {
  const y = ALL.filter((r) => E.visibility(r, { chatId: "Y", path: [] }).visible).map((r) => r.id);
  assert.deepStrictEqual(y, ["E4"]);
  const ySel = E.rank(ALL, { chatId: "Y", path: [], present: ["user"], text: "тест" }).selected;
  assert.deepStrictEqual(ySel.map((r) => r.id), ["E4"]);
});
t("PRISM1-4: ручная запись видна во всех ветках своего чата", () => {
  assert.ok(vis(PATH_A3).includes("E3") && vis(PATH_B3).includes("E3") && vis(P(["R"])).includes("E3"));
});
t("удалённая ветка: запись хранится, но не видна и никуда не переносится", () => {
  const afterDelete = P(["R", "A1", "B2x"]); // ветку A2 удалили, путь пошёл иначе
  assert.ok(!E.visibility(E1, { chatId: "X", path: afterDelete }).visible);
  assert.strictEqual(E1.chatId, "X");
  assert.deepStrictEqual(E1.source.messageIds, ["A2"]);
});
t("другой вариант ответа (свайп) скрывает опыт, записанный из прежнего варианта", () => {
  const r = X("S", { chatId: "X", source: { chatId: "X", messageIds: ["A2"], swipes: { A2: 0 } } });
  assert.ok(E.visibility(r, { chatId: "X", path: P(["R", "A1", "A2"], { A2: 0 }) }).visible);
  assert.ok(!E.visibility(r, { chatId: "X", path: P(["R", "A1", "A2"], { A2: 1 }) }).visible);
});
t("PRISM1-6/7: миграция не угадывает чат и сохраняет все записи", () => {
  const legacy = [
    { id: "m1", owner: "c1", event: "есть source.chatId", interpretation: "i1", consequences: "k1", source: { chatId: "X", messageIds: ["A2"] } },
    { id: "m2", owner: "c1", event: "сообщения из одного чата", source: { messageIds: ["A1", "A2"] } },
    { id: "m3", owner: "c1", event: "сообщения из разных чатов", source: { messageIds: ["A1", "Q1"] } },
    { id: "m4", owner: "c1", event: "сообщение не найдено", source: { messageIds: ["ZZ"] } },
    { id: "m5", owner: "c1", event: "без происхождения", source: { messageIds: [] } },
    { id: "m6", owner: "c1", event: "уже со своим chatId", chatId: "Y", source: { messageIds: [] } },
  ];
  const snapshot = JSON.parse(JSON.stringify(legacy));
  const msgChat = { A1: "X", A2: "X", Q1: "Y" };
  const res = E.migrate(legacy, { messageChat: (id) => msgChat[id] || null });
  const by = Object.fromEntries(res.records.map((r) => [r.id, r]));
  assert.strictEqual(res.records.length, legacy.length);
  assert.strictEqual(by.m1.chatId, "X");
  assert.strictEqual(by.m2.chatId, "X");
  for (const id of ["m3", "m4", "m5"]) { assert.strictEqual(by[id].chatId, null); assert.strictEqual(by[id].legacyUnscoped, true); assert.strictEqual(E.scopeOf(by[id]), "legacy"); }
  assert.strictEqual(by.m6.chatId, "Y");
  assert.strictEqual(res.legacy, 3);
  for (const r of snapshot) {
    const n = by[r.id];
    assert.strictEqual(n.event, r.event); assert.strictEqual(n.interpretation, r.interpretation); assert.strictEqual(n.consequences, r.consequences);
    assert.deepStrictEqual(n.source.messageIds, r.source.messageIds);
  }
  assert.deepStrictEqual(legacy, snapshot, "исходные объекты не изменены");
  // Идемпотентность
  const again = E.migrate(res.records, { messageChat: (id) => msgChat[id] || null });
  assert.deepStrictEqual(again.changed, []);
  assert.deepStrictEqual(again.records, res.records);
  // Непривязанные не попадают в Prism ни одного чата
  const migrated = res.records.map((r) => Object.assign({}, r, { status: "active", domains: ["тест"] }));
  assert.ok(!E.rank(migrated, { chatId: "X", path: PATH_A3, present: ["user"], text: "тест" }).selected.some((r) => ["m3", "m4", "m5"].includes(r.id)));
});
t("ручная привязка старой записи: становится записью на весь чат, происхождение сохранено", () => {
  const r = E.assignToChat({ id: "m3", legacyUnscoped: true, chatId: null, source: { messageIds: ["A1", "Q1"] } }, "X");
  assert.strictEqual(r.chatId, "X"); assert.ok(!r.legacyUnscoped);
  assert.deepStrictEqual(r.source.originMessageIds, ["A1", "Q1"]);
  assert.strictEqual(E.scopeOf(r), "chat");
  assert.ok(E.visibility(r, { chatId: "X", path: PATH_B3 }).visible);
});

/* ── Опыт: отбор (этап 1) ── */
const R1 = (id, extra) => Object.assign({ id, owner: "c1", chatId: "X", status: "active", valence: 0, weight: 1, about: [], domains: [], createdAt: 1, source: { messageIds: [] } }, extra);
t("PRISM1-9: тема важнее присутствия, важности и свежести", () => {
  const set = [
    R1("old-topic", { event: "Взял у неё деньги в долг и не вернул", domains: ["деньги"], weight: 1, about: ["user"], createdAt: 1 }),
    R1("recent-user", { event: "Ходили в кино", domains: ["кино"], weight: 1, about: ["user"], createdAt: 10 }),
    R1("heavy-unrel", { event: "Умерла бабушка", domains: ["семья"], weight: 3, about: [], createdAt: 5 }),
    R1("user-wrong", { event: "Спорили о музыке", domains: ["музыка"], weight: 2, about: ["user"], createdAt: 9 }),
  ];
  const r = E.rank(set, { chatId: "X", path: [], present: ["user"], text: "Слушай, насчёт долга: деньги я верну", names: ["Химэ", "Кира"], limit: 8 });
  assert.strictEqual(r.ranked[0].id, "old-topic");
  assert.ok(!r.selected.some((x) => x.id === "recent-user"), "свежесть не спасает нерелевантное");
  assert.ok(!r.selected.some((x) => x.id === "user-wrong"), "присутствие не заменяет тему");
  assert.ok(!r.selected.some((x) => x.id === "heavy-unrel"), "важность не создаёт релевантность");
  assert.deepStrictEqual(r.selected.map((x) => x.id), ["old-topic"]);
  const dbg = r.debug.find((x) => x.id === "old-topic");
  assert.ok(dbg.topic >= 1 && dbg.selected && dbg.visible);
});
t("PRISM1-10: свежесть решает только при равной релевантности", () => {
  const set = [
    R1("older", { domains: ["деньги"], weight: 2, about: ["user"], createdAt: 1 }),
    R1("newer", { domains: ["деньги"], weight: 2, about: ["user"], createdAt: 9 }),
    R1("newest-weaker", { domains: ["деньги"], weight: 1, about: ["user"], createdAt: 20 }),
  ];
  const r = E.rank(set, { chatId: "X", path: [], present: ["user"], text: "деньги", limit: 8 });
  assert.deepStrictEqual(r.ranked.map((x) => x.id), ["newer", "older", "newest-weaker"]);
});
t("PRISM1-8: нет подбора по противоположному знаку", () => {
  const set = [
    R1("fin", { event: "Украл у неё деньги", domains: ["деньги", "доверие"], valence: -3, weight: 2, about: ["user"], createdAt: 1 }),
    R1("flowers", { event: "Подарил ей цветы", domains: ["цветы", "подарок"], valence: 2, weight: 1, about: ["user"], createdAt: 2 }),
  ];
  const r = E.rank(set, { chatId: "X", path: [], present: ["user"], text: "Можно тебе доверить деньги?", limit: 8 });
  assert.deepStrictEqual(r.selected.map((x) => x.id), ["fin"]);
  assert.ok(!r.selected.some((x) => x.__counter));
});
t("важность не создаёт релевантность: несколько «важных» записей не по теме и одна старая по теме", () => {
  const set = [
    R1("w3a", { event: "Бросил её одну после аварии", domains: ["доверие", "опасность"], weight: 3, about: ["user"], createdAt: 5 }),
    R1("w3b", { event: "Признался ей в любви", domains: ["любовь"], weight: 3, about: ["user"], createdAt: 6 }),
    R1("w3c", { event: "Спас её на пожаре", domains: ["пожар", "спасение"], weight: 3, about: ["user"], createdAt: 7 }),
    R1("ramen", { event: "Научил её варить рамен", domains: ["рамен", "готовка"], weight: 1, about: ["user"], createdAt: 1 }),
  ];
  const r = E.rank(set, { chatId: "X", path: [], present: ["user"], text: "Какой рецепт рамена тебе больше нравится?", limit: 8 });
  assert.deepStrictEqual(r.selected.map((x) => x.id), ["ramen"]);
  const none = E.rank(set, { chatId: "X", path: [], present: ["user"], text: "Сегодня хорошая погода.", limit: 8 });
  assert.deepStrictEqual(none.selected, [], "если ничего не относится к теме, опыт не подаётся");
  const built = A.build({ card: { name: "Химэ", description: "d" }, experiences: none.ranked, history: [{ role: "user", text: "Сегодня хорошая погода." }] });
  assert.ok(!built.messages[0].content.includes("### Релевантный прошлый опыт Химэ"), "пустой опыт — допустимо");
});
t("тема: имена участников не засчитываются как совпадение темы", () => {
  const set = [R1("name", { event: "Химэ рассердилась", domains: ["химэ"], weight: 1 })];
  const r = E.rank(set, { chatId: "X", path: [], present: [], text: "Химэ, привет", names: ["Химэ"], limit: 8 });
  assert.strictEqual(r.selected.length, 0);
});

/* ── Сцена: возраст настроения (этап 1) ── */
const turns = (ids, moodAt) => ids.flatMap((id) => [
  { msgId: "u" + id, role: "user", ops: [] },
  { msgId: id, role: "assistant", ops: id === moodAt ? S.parseBody("Химэ.mood=подавлена") : [] },
]);
t("PRISM1-11: возраст настроения считается по активной ветке", () => {
  const ids = Array.from({ length: 13 }, (_, i) => "M" + (i + 1));
  const st = S.fold("", turns(ids, "M3"));
  assert.strictEqual(st.chars["Химэ"].mood, "подавлена");
  assert.strictEqual(st.chars["Химэ"].moodSrc, "M3");
  assert.strictEqual(st.chars["Химэ"].moodAge, 10);
  assert.ok(S.describe(st).includes("настроение (оценка): подавлена — отмечено 10 ходов назад"));
  const now = S.fold("", turns(["M1", "M2", "M3"], "M3"));
  assert.ok(S.describe(now).includes("отмечено сейчас"));
});
t("PRISM1-12: соседняя ветка не наследует настроение; возврат восстанавливает возраст", () => {
  const common = turns(["M1", "M2"], null);
  const branchA = common.concat(turns(["M3", "M4", "M5"], "M3"));
  const branchB = common.concat(turns(["N3", "N4"], null));
  assert.ok(!S.fold("", branchB).chars["Химэ"]);
  const back = S.fold("", branchA);
  assert.strictEqual(back.chars["Химэ"].moodAge, 2);
});

/* ── Сборщик ── */
const card = {
  name: "Химэ", description: "Студентка, {{user}} — её одногруппник.", personality: "ревнивая, но отходчивая",
  scenario: "", mesExample: "<START>\n{{char}}: Ну и ладно!",
  lore: [{ keys: ["университет"], content: "Токийский университет", enabled: true }, { keys: [], content: "Мир — современная Япония", constant: true }],
};
t("сборка: слои подписаны, макросы подставлены, протокол в конце", () => {
  const st = S.fold("loc=Кафе", []);
  const r = A.build({ card, userName: "Кира", sceneState: st, experiences: [R1("ev", { event: "Он предал её", weight: 3 })], history: [{ role: "assistant", text: "Привет" }, { role: "user", text: "Как университет?" }] });
  const sys = r.messages[0].content;
  assert.ok(sys.includes("### Характер Химэ"));
  assert.ok(sys.includes("Кира — её одногруппник"));
  assert.ok(sys.includes("### Релевантный прошлый опыт Химэ"));
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
  assert.ok(r.report.used <= r.report.budget && r.report.fits && !r.report.overflow);
});

/* ── Сборщик: указания автора и строгий бюджет (этап 1) ── */
const authorCard = { name: "Юки", description: "shy but curious", personality: "", scenario: "", directives: authored("always answer in first person", "use terse sentences"), lore: [] };
const costOf = (msgs) => msgs.reduce((n, x) => n + Math.ceil(x.content.length / 3.5) + 4, 0);
t("PRISM1-13: указания автора отделены от склонностей", () => {
  const r = A.build({ card: authorCard, history: [{ role: "user", text: "hi" }] });
  const head = r.messages[0].content, post = r.messages[r.messages.length - 1].content;
  const cardSec = head.slice(head.indexOf("### Характер"));
  assert.ok(cardSec.startsWith("### Характер Юки") && cardSec.includes("shy but curious"));
  assert.ok(!cardSec.split("### ")[1].includes("always answer"), "system_prompt не внутри склонностей");
  assert.ok(head.indexOf("### Указания автора карточки (правила") < head.indexOf("### Характер"));
  assert.ok(head.includes("always answer in first person"));
  assert.ok(post.startsWith("### Указания автора карточки (после истории)\nuse terse sentences"));
  assert.ok(post.indexOf("use terse sentences") < post.indexOf("[scene:"), "после истории — до протокола, ближе всего к ответу среди указаний");
});
t("PRISM1-14: переключатель «не передавать инструкции после истории»", () => {
  const h = [{ role: "user", text: "hi" }];
  const on = A.build({ card: authorCard, history: h });
  const off = A.build({ card: authorCard, history: h, noPostHistory: true });
  assert.ok(on.messages.some((x) => x.content.includes("use terse sentences")));
  assert.ok(!off.messages.some((x) => x.content.includes("use terse sentences")));
  assert.strictEqual(off.messages[0].content, on.messages[0].content, "остальное без изменений");
  assert.ok(off.report.postHistoryDisabled);
  assert.strictEqual(A.build({ card: authorCard, history: h }).report.postHistory, true, "по умолчанию совместимость");
});
t("порядок слоёв в итоговом контексте", () => {
  const c = Object.assign({}, authorCard, { lore: [{ keys: [], content: "LORE", constant: true, enabled: true }] });
  const r = A.build({ card: c, userDesc: "PERSONA", sceneState: S.fold("loc=Кафе", []), experiences: [R1("e", { event: "EXP" })], history: [{ role: "user", text: "hi" }] });
  const h = r.messages[0].content;
  const order = ["Ты играешь за", "### Указания автора", "### Характер", "PERSONA", "LORE", "EXP", "### Сейчас (факты)"].map((k) => h.indexOf(k));
  assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
  assert.strictEqual(r.messages[1].content, "hi");
});

t("RP frame simplification: граница {{user}}, сцена + характер + опыт, разделы раздельно, без повторов философии", () => {
  const st = S.fold("loc=Кафе", []);
  const r = A.build({ card: { name: "Химэ", description: "DESC" }, userName: "Кира", sceneState: st, experiences: [R1("ev", { event: "EVT", weight: 3 })], history: [{ role: "user", text: "hi" }] });
  const sys = r.messages[0].content;
  const frame = sys.split("\n\n###")[0];
  assert.ok(frame.includes("Ты играешь за Химэ") && frame.includes("Кира управляет только собой"));
  assert.ok(frame.includes("Не пиши мысли, действия или реплики за Кира"), "граница собеседника");
  assert.ok(frame.includes("текущей сцены") && frame.includes("характера Химэ") && frame.includes("релевантного прошлого опыта"));
  assert.ok(frame.includes("не являются жёстким сценарием"));
  // раздельные разделы
  const iCard = sys.indexOf("### Характер Химэ\nDESC"), iExp = sys.indexOf("### Релевантный прошлый опыт Химэ"), iScene = sys.indexOf("### Сейчас (факты)");
  assert.ok(iCard > 0 && iExp > iCard && iScene > iExp, JSON.stringify([iCard, iExp, iScene]));
  assert.ok(sys.slice(iExp).includes("EVT") && !sys.slice(iCard, iExp).includes("EVT"), "опыт не внутри характера");
  // убранные повторы
  for (const ph of ["не диктуют поступки", "не предписывают поступков", "свидетельства прошлого", "может действовать вопреки", "может поступить вопреки", "не забывает"]) {
    assert.ok(!sys.includes(ph), ph);
  }
  // кадр не длиннее прежнего
  assert.ok(A.TEMPLATES.rp.frame.length < 398);
  // переписка: рамка не тронута, повтор философии в заголовках убран
  const mf = A.TEMPLATES.messenger.frame;
  assert.ok(mf.includes("мессенджере") && mf.includes("Не пиши за {{user}}"));
  const ms = A.build({ mode: "messenger", card: { name: "Химэ", description: "D" }, experiences: [R1("ev", { event: "EVT" })], history: [{ role: "user", text: "hi" }] }).messages[0].content;
  assert.strictEqual(ms.split("свидетельства прошлого").length - 1, 1, "в переписке — один раз, в рамке");
});
const big = (n, ch) => (ch || "слово ").repeat(n);
const baseScene = S.fold("loc=Кафе; Юки.wear=пальто", []);
const hist = (n, len) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "user" : "assistant", text: big(len) + " #" + i }));
const strict = (r) => { assert.ok(r.report.used <= r.report.budget, `used ${r.report.used} > budget ${r.report.budget}`); assert.strictEqual(r.report.used, costOf(r.messages)); assert.ok(r.report.fits && !r.report.overflow); };
const BUD = { contextTokens: 3000, reserveTokens: 500 };
t("PRISM1-15: обычная сборка ≤ бюджета", () => strict(A.build(Object.assign({ card: authorCard, sceneState: baseScene, history: hist(6, 20) }, BUD))));
t("PRISM1-16: огромная история ≤ бюджета, последнее сообщение на месте", () => {
  const r = A.build(Object.assign({ card: authorCard, sceneState: baseScene, history: hist(400, 60) }, BUD));
  strict(r);
  assert.ok(r.messages.some((m) => m.content.endsWith("#399")));
  assert.ok(r.report.truncated.some((t) => t.layer === "history"));
});
t("PRISM1-17: огромный опыт ≤ бюджета, самая релевантная запись остаётся", () => {
  const exps = Array.from({ length: 40 }, (_, i) => R1("x" + i, { event: "СОБЫТИЕ" + i + " " + big(60), createdAt: i }));
  const r = A.build(Object.assign({ card: authorCard, sceneState: baseScene, experiences: exps, history: hist(4, 20) }, BUD));
  strict(r);
  assert.ok(r.messages[0].content.includes("СОБЫТИЕ0 "), "первая по важности осталась");
  assert.ok(r.report.experienceDropped > 0 && r.report.truncated.some((t) => t.layer === "experience"));
});
t("PRISM1-18: огромный лорбук ≤ бюджета", () => {
  const c = Object.assign({}, authorCard, { lore: Array.from({ length: 50 }, (_, i) => ({ keys: [], constant: true, enabled: true, content: "LORE" + i + " " + big(80), insertion_order: i })) });
  const r = A.build(Object.assign({ card: c, sceneState: baseScene, history: hist(4, 20) }, BUD));
  strict(r);
  assert.ok(r.report.loreDropped > 0 && r.report.loreKept < 50);
});
t("PRISM1-19: огромная карточка — детерминированно, по абзацам и предложениям, имя на месте", () => {
  const c = Object.assign({}, authorCard, { description: Array.from({ length: 40 }, (_, i) => `Абзац ${i}. ` + big(40, "текст ") + ".").join("\n\n"), scenario: big(300), mesExample: big(300) });
  const r1 = A.build(Object.assign({ card: c, sceneState: baseScene, history: hist(4, 20) }, BUD));
  const r2 = A.build(Object.assign({ card: c, sceneState: baseScene, history: hist(4, 20) }, BUD));
  strict(r1);
  assert.deepStrictEqual(r1.messages, r2.messages);
  const h = r1.messages[0].content;
  assert.ok(h.includes("### Характер Юки") && h.includes("Абзац 0."));
  assert.ok(!h.includes("Абзац 39."));
  const layers = r1.report.truncated.map((t) => t.layer);
  assert.ok(layers.includes("card.description") && layers.includes("card.scenario") && layers.includes("examples"));
  // Абзацы не режутся посередине: каждый оставшийся абзац описания целиком
  const desc = h.slice(h.indexOf("Абзац 0."), h.indexOf("\n\n###", h.indexOf("Абзац 0.")) > 0 ? h.indexOf("\n\n###", h.indexOf("Абзац 0.")) : undefined);
  assert.ok(desc.split("\n\n").every((p) => !p.startsWith("Абзац") || p.endsWith(".")));
});
t("огромные указания после истории ≤ бюджета, уступают раньше карточки", () => {
  const c = Object.assign({}, authorCard, { directives: authored("always answer in first person", big(3000)) });
  const r = A.build(Object.assign({ card: c, sceneState: baseScene, history: hist(4, 20) }, BUD));
  strict(r);
  assert.ok(r.report.truncated.some((t) => t.layer === "postHistory"));
  assert.ok(r.messages[0].content.includes("shy but curious"));
});
t("PRISM1-20: невозможное ядро (огромная сцена) — явный OVERFLOW, без молчаливого превышения", () => {
  const huge = S.fold("loc=" + big(3000), []);
  const r = A.build(Object.assign({ card: authorCard, sceneState: huge, history: hist(4, 20) }, BUD));
  assert.strictEqual(r.report.overflow, true);
  assert.strictEqual(r.report.fits, false);
  assert.ok(r.report.used > r.report.budget);
  assert.ok(r.messages[0].content.includes(big(3000).trim()), "сцена не обрезана наполовину");
});
t("PRISM1-21: отчёт о сокращениях точен", () => {
  const r = A.build(Object.assign({ card: Object.assign({}, authorCard, { mesExample: big(800) }), sceneState: baseScene, history: hist(200, 40) }, BUD));
  const layers = r.report.truncated.map((t) => t.layer);
  assert.ok(layers.includes("history"));
  const h = r.report.truncated.find((t) => t.layer === "history");
  assert.strictEqual(h.dropped, r.report.historyTotal - r.report.historyKept);
  assert.strictEqual(r.report.examples, !layers.includes("examples"));
});

t("continue после жёсткого сокращения: остаётся текущий ответ и указание продолжить", () => {
  const cont = "Продолжи последнее сообщение {{char}} ровно с того места, где оно оборвалось.";
  const h = hist(30, 120).concat([{ role: "assistant", text: "Начало ответа, которое надо продолжить" }]);
  const r = A.build({ card: authorCard, sceneState: baseScene, history: h, extraPost: cont, contextTokens: 900, reserveTokens: 300 });
  assert.ok(r.report.used <= r.report.budget && !r.report.overflow);
  const nonSys = r.messages.filter((m) => m.role !== "system");
  assert.strictEqual(nonSys[nonSys.length - 1].content, "Начало ответа, которое надо продолжить");
  assert.ok(r.messages[r.messages.length - 1].content.includes("Продолжи последнее сообщение Юки"));
});

/* ── Карточки ── */
function tinyPng() {
  // 1×1 прозрачный PNG
  return Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
}
t("карточка: V2 → PNG → обратно без потерь, extensions сохраняются", () => {
  const v2 = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Химэ ✿", description: "Описание", first_mes: "Привет", mes_example: "", personality: "", scenario: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: ["Йо"], tags: ["школа"], creator: "я", character_version: "1", extensions: { foo: { bar: 1 } }, character_book: { entries: [{ keys: ["Токио"], content: "Город", enabled: true, insertion_order: 0, extensions: {} }], extensions: {} } } };
  const card = normalize(v2);
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
  const c = normalize(src);
  assert.strictEqual(c.creatorNotes, "n"); assert.strictEqual(c.version, "1.2"); assert.deepStrictEqual(c.altGreetings, ["a1", "a2"]);
  assert.deepStrictEqual(c.lore[0].secondary_keys, ["вечер"]); assert.strictEqual(c.lore[0].position, "before_char"); assert.strictEqual(c.lore[0].comment, "Кафе");
  c.image = { trigger: "yuki", loras: [{ name: "Yuki_IL", weight: 0.8 }] };
  const out = C.toSpec(c, "v2").data;
  assert.strictEqual(out.creator_notes, "n"); assert.strictEqual(out.character_version, "1.2");
  const e = out.character_book.entries[0];
  assert.ok(e.selective && e.secondary_keys[0] === "вечер" && e.position === "before_char" && e.priority === 7 && e.extensions.st === 1 && e.name === "Кафе");
  assert.strictEqual(out.extensions.other_app.x, 1);
  assert.strictEqual(out.extensions.prism_rp.image.loras[0].name, "Yuki_IL");
  assert.strictEqual(normalize({ spec: "chara_card_v2", data: out }).image.loras[0].name, "Yuki_IL");
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
t("карточка: V1 и V3 импортируются", () => {
  assert.strictEqual(normalize({ name: "A", first_mes: "hi" }).firstMes, "hi");
  assert.strictEqual(normalize({ spec: "chara_card_v3", data: { name: "B", nickname: "Би", description: "d" } }).name, "B");
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
/* ── Ассистент ── */
t("ассистент: системная инструкция, карточка и чат в контексте, история по порядку", () => {
  const cd = { name: "Юки", description: "Тихая библиотекарша.", firstMes: "Привет.", lore: [{ keys: ["кафе"], content: "Кафе до полуночи", constant: true }] };
  const r = AST.build({ card: cd, chatLines: [{ name: "Кира", text: "Привет" }, { name: "Юки", text: "Здравствуй" }], sceneLine: "Библиотека",
    userName: "Кира", history: [{ role: "user", text: "Как улучшить описание?" }] });
  const sys = r.messages[0].content;
  assert.ok(sys.includes("не персонаж") && sys.includes("Тихая библиотекарша") && sys.includes("Кафе до полуночи"));
  assert.ok(sys.includes("Юки: Здравствуй") && sys.includes("Библиотека") && sys.includes("Собеседника зовут Кира"));
  assert.deepStrictEqual(r.messages.slice(1).map((m) => m.role), ["user"]);
  assert.ok(r.report.card && r.report.chat);
});
t("ассистент: без персонажа — только инструкция; своя инструкция заменяет встроенную", () => {
  const r = AST.build({ system: "СВОЯ", history: [{ role: "user", text: "a" }, { role: "assistant", text: "b" }, { role: "user", text: "c" }] });
  assert.strictEqual(r.messages[0].content, "СВОЯ");
  assert.deepStrictEqual(r.messages.slice(1).map((m) => m.content), ["a", "b", "c"]);
  assert.ok(!r.report.card && !r.report.chat);
});
t("ассистент: длинный чат режется с начала, свежие реплики остаются", () => {
  const lines = Array.from({ length: 400 }, (_, i) => ({ name: "A", text: "реплика номер " + i + " " + "слово ".repeat(30) }));
  const txt = AST.chatText(lines, 500);
  assert.ok(txt.includes("реплика номер 399") && !txt.includes("реплика номер 0 ") && txt.startsWith("(ранние"));
});
t("ассистент: заголовок и подсказки по контексту", () => {
  assert.strictEqual(AST.title("  Короткий   вопрос "), "Короткий вопрос");
  assert.ok(AST.title("слово ".repeat(30)).endsWith("…"));
  assert.ok(AST.starters(false, false).every((x) => x.need === ""));
  assert.ok(AST.starters(true, true).some((x) => x.need === "chat") && !AST.starters(true, false).some((x) => x.need === "chat"));
});
t("markdown: экранирование, списки, код, жирный", () => {
  const h = RN.md("# Заголовок\n\n**жирно** и *курсив* и `код`\n\n- раз\n- два\n\n1. один\n\n```\n<script>x</script>\n```\n<b>не тег</b>");
  assert.ok(h.includes("<h3>Заголовок</h3>") && h.includes("<strong>жирно</strong>") && h.includes("<em>курсив</em>") && h.includes("<code>код</code>"));
  assert.ok(h.includes("<ul><li>раз</li><li>два</li></ul>") && h.includes("<ol><li>один</li></ol>"));
  assert.ok(h.includes("&lt;script&gt;x&lt;/script&gt;") && !h.includes("<script>") && h.includes("&lt;b&gt;не тег&lt;/b&gt;"));
});

/* ── Настройки (core/settings.js, вынесено из app.js без изменения поведения) ── */
t("настройки: сохранённые поверх значений по умолчанию, вложенные группы тоже", () => {
  const s = STG.merge({ theme: "paper", sampler: { temperature: 1.2 }, images: { backend: "a1111" }, persona: { name: "Кира" } }, { perchanceImages: true });
  assert.strictEqual(s.theme, "paper");
  assert.strictEqual(s.sampler.temperature, 1.2); assert.strictEqual(s.sampler.max_tokens, 700);
  assert.strictEqual(s.images.backend, "a1111"); assert.strictEqual(s.images.steps, 28);
  assert.strictEqual(s.persona.name, "Кира"); assert.strictEqual(s.persona.description, "");
  assert.strictEqual(s.noPostHistory, false);
  s.sampler.temperature = 0; assert.strictEqual(STG.DEFAULTS.sampler.temperature, 0.9, "умолчания не мутируются");
});
t("настройки: первый запуск вне Perchance — картинки через A1111; с сохранёнными — как сохранено", () => {
  assert.strictEqual(STG.merge(null, { perchanceImages: false }).images.backend, "a1111");
  assert.strictEqual(STG.merge(null, { perchanceImages: true }).images.backend, "perchance");
  assert.strictEqual(STG.merge({ images: {} }, { perchanceImages: false }).images.backend, "perchance");
});
t("настройки: список моделей, активная, объём контекста", () => {
  const s = STG.merge({ providers: [{ id: "p1", name: "API", model: "m" }], activeProvider: "p1", contextTokens: 4096 });
  const withP = STG.providerList(s, true), noP = STG.providerList(s, false);
  assert.deepStrictEqual(withP.map((p) => p.id), ["perchance", "p1"]);
  assert.strictEqual(withP[1].label, "API · m"); assert.strictEqual(withP[1].kind, "openai");
  assert.strictEqual(STG.activeProvider(s, noP).id, "p1");
  assert.strictEqual(STG.activeProvider(Object.assign({}, s, { activeProvider: "нет" }), noP).id, "p1", "неизвестная → первая");
  assert.strictEqual(STG.contextTokens(s, withP[1], null), 4096);
  let called = 0;
  assert.strictEqual(STG.contextTokens(s, withP[1], () => { called++; return { idealMaxContextTokens: 9 }; }), 4096);
  assert.strictEqual(called, 0, "метаданные Perchance не запрашиваются для API");
  assert.strictEqual(STG.contextTokens(s, withP[0], () => ({ idealMaxContextTokens: 6000 })), 6000);
  assert.strictEqual(STG.contextTokens(Object.assign({}, s, { autoContext: false }), withP[0], () => ({ idealMaxContextTokens: 6000 })), 4096);
});
t("настройки: картинки включены и закреплённый блок качества", () => {
  const s = STG.merge({ images: { backend: "perchance", fixedPrompt: " masterpiece " } });
  assert.strictEqual(STG.imagesOn(s, false), false); assert.strictEqual(STG.imagesOn(s, true), true);
  assert.strictEqual(STG.qualityPinned(s), true);
  s.images.promptMode = "off"; assert.strictEqual(STG.qualityPinned(s), false);
});

/* ── FOUNDATION-A: импорт карточек (формат → адаптер → черновик → проверка) ── */
const fs = require("fs");
const URV = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "urv-orihime.json"), "utf8"));
const V2FULL = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Юки", description: "desc", personality: "pers", scenario: "scen", first_mes: "hi", mes_example: "<START>\n{{char}}: да",
  creator_notes: "", system_prompt: "SYS-IMPORTED", post_history_instructions: "POST-IMPORTED", alternate_greetings: ["a1"], tags: [], creator: "", character_version: "",
  extensions: { depth_prompt: { prompt: "DEPTH-EXT", depth: 4 } }, character_book: { entries: [{ keys: ["кафе"], content: "Кафе", enabled: true, insertion_order: 0 }] } } };
const imp = (json, st) => IMP.fromObject(json, st || "json", "f");
const outbound = (card) => A.build({ card, history: [{ role: "user", text: "hi" }] }).messages.map((m) => m.content).join("\n");

t("FA fixture 1: V1 → черновик", () => {
  const r = imp({ name: "Ая", description: "d", first_mes: "привет", personality: "p", scenario: "s", mes_example: "" });
  assert.ok(r.ok); assert.strictEqual(r.detection.format, "ccv1"); assert.strictEqual(r.draft.firstMes, "привет");
  const r2 = imp({ char_name: "Пиг", char_persona: "persona", char_greeting: "yo", world_scenario: "w", example_dialogue: "<START>" });
  assert.ok(r2.ok); assert.strictEqual(r2.draft.name, "Пиг"); assert.strictEqual(r2.draft.description, "persona"); assert.strictEqual(r2.draft.firstMes, "yo");
});
t("FA fixture 2: V2 → черновик, лорбук и приветствия", () => {
  const r = imp(V2FULL);
  assert.ok(r.ok); assert.strictEqual(r.detection.format, "ccv2");
  assert.deepStrictEqual(r.draft.altGreetings, ["a1"]); assert.strictEqual(r.draft.lore[0].keys[0], "кафе");
  assert.strictEqual(r.draft.source.format, "ccv2"); assert.strictEqual(r.draft.source.raw.data.name, "Юки");
});
t("FA fixture 3: V3 → черновик, V3-поля сохранены", () => {
  const r = imp({ spec: "chara_card_v3", spec_version: "3.0", data: Object.assign({}, V2FULL.data, { nickname: "Ю", group_only_greetings: ["g"], assets: [] }) });
  assert.ok(r.ok); assert.strictEqual(r.detection.format, "ccv3"); assert.strictEqual(r.draft.source.raw.data.nickname, "Ю");
});
t("FA fixture 4: PNG (chara и ccv3) → тот же черновик, что из JSON", () => {
  const c = normalize(V2FULL);
  const png = C.embedInPng(tinyPng(), c);
  const r = IMP.fromPngBytes(png, "x.png");
  assert.ok(r.ok); assert.strictEqual(r.detection.sourceType, "png"); assert.strictEqual(r.detection.format, "ccv3");
  assert.strictEqual(r.draft.name, "Юки"); assert.strictEqual(r.draft.description, "desc");
  const bad = IMP.fromPngBytes(tinyPng(), "plain.png");
  assert.ok(!bad.ok && bad.draft === null && bad.issues[0].level === "error");
});
t("FA fixture 5: URV v2 → черновик", () => {
  const r = imp(URV);
  assert.ok(r.ok, JSON.stringify(r.issues)); assert.strictEqual(r.detection.format, "urv2");
  const d = r.draft;
  assert.ok(d.name.trim()); assert.ok(d.appearance.trim() && d.personality.trim() && d.background.trim() && d.scenario.trim());
  assert.ok(/Возраст/.test(d.description));
  assert.ok(d.mesExample.startsWith("<START>"));
  assert.ok(d.source.preserved.userOverride, "userOverride сохранён");
  assert.ok(r.issues.some((x) => x.code === "user-override"));
});
t("FA fixture 6: неизвестный формат → ошибка, без черновика", () => {
  for (const j of [{ foo: 1 }, [], { spec: "chara_card_v9", data: {} }, { type: "urv-char", version: 3, data: {} }, {}, "строка", 42, null]) {
    const r = imp(j);
    assert.ok(!r.ok && r.draft === null, JSON.stringify(j)); assert.strictEqual(r.issues[0].code, "unknown-format");
  }
});
t("FA fixture 7: битый файл → ошибка, не «Без имени»", () => {
  const r = IMP.fromJsonText("{ not json", "x.json");
  assert.ok(!r.ok && r.draft === null && r.issues[0].code === "invalid-json");
  for (const j of [{ spec: "chara_card_v2", data: { name: "", description: "x" } }, { spec: "chara_card_v2", data: { name: "Пусто" } }, { spec: "chara_card_v2" }]) {
    const x = imp(j);
    assert.ok(!x.ok && x.issues.some((i) => i.level === "error"), JSON.stringify(j));
  }
});
t("FA fixture 8: system_prompt импортируется выключенным и не уходит в модель", () => {
  const d = imp(V2FULL).draft;
  assert.deepStrictEqual(d.directives.system, { text: "SYS-IMPORTED", origin: "imported", enabled: false, reviewed: false });
  assert.ok(!outbound(d).includes("SYS-IMPORTED"));
  d.directives.system.enabled = true;
  assert.ok(outbound(d).includes("SYS-IMPORTED"), "включённое — уходит");
});
t("FA fixture 9: post_history выключен и не уходит в модель", () => {
  const d = imp(V2FULL).draft;
  assert.strictEqual(d.directives.postHistory.enabled, false); assert.strictEqual(d.directives.postHistory.origin, "imported");
  assert.ok(!outbound(d).includes("POST-IMPORTED"));
  d.directives.postHistory.enabled = true;
  assert.ok(outbound(d).includes("POST-IMPORTED"));
  assert.ok(!A.build({ card: d, history: [{ role: "user", text: "hi" }], noPostHistory: true }).messages.some((m) => m.content.includes("POST-IMPORTED")), "общий выключатель цел");
});
t("FA fixture 10: URV собранный systemPrompt сохранён, помечен и не включается", () => {
  const r = imp(URV), d = r.draft;
  assert.strictEqual(d.source.compiled.length, 1); assert.strictEqual(d.source.compiled[0].field, "data.systemPrompt");
  assert.ok(r.issues.some((x) => x.code === "compiled-prompt"));
  assert.notStrictEqual(d.directives.system.text, URV.data.systemPrompt);
  d.directives.system.enabled = true; d.directives.postHistory.enabled = true;
  assert.ok(!outbound(d).includes(URV.data.systemPrompt.slice(0, 80)), "собранный промпт не уходит даже при включённых указаниях");
});
t("FA fixture 11: исходник и расширения не становятся указанием", () => {
  const d = imp(V2FULL).draft;
  d.directives.system.text = ""; d.directives.postHistory.text = "";
  const out = outbound(d);
  assert.ok(!out.includes("SYS-IMPORTED") && !out.includes("POST-IMPORTED") && !out.includes("DEPTH-EXT"));
  assert.strictEqual(CM.activeText(d, "system"), "");
  assert.ok(imp(V2FULL).issues.some((x) => x.code === "ext-depth-prompt"));
});
t("FA fixture 12: пустое указание = указания нет (без запасных путей)", () => {
  const d = imp(V2FULL).draft;
  d.directives.system = CM.directive("   ", "authored");
  assert.strictEqual(CM.activeText(d, "system"), "");
  assert.ok(!outbound(d).includes("Указания автора карточки (правила"));
  assert.strictEqual(C.toSpec(d, "v2").data.system_prompt, "");
});
t("FA fixture 13: несколько первых сообщений URV → основное + альтернативные", () => {
  const r = imp(URV);
  assert.ok(r.draft.firstMes.trim()); assert.ok(r.draft.altGreetings.length >= 1);
  assert.ok(r.issues.some((x) => x.code === "multi-first"));
  const one = imp({ type: "urv-char", version: 2, data: { name: "X", firstMessage: [{ text: "a" }, "b", ""] } }).draft;
  assert.strictEqual(one.firstMes, "a"); assert.deepStrictEqual(one.altGreetings, ["b"]);
});
t("FA fixture 14: лорбук URV в виде карты", () => {
  const lore = imp(URV).draft.lore;
  assert.ok(lore.length >= 3);
  const map = imp({ type: "urv-char", version: 2, data: { name: "X", description: "d", lorebook: { "Город": "Текст", "42": { content: "по id", keys: [] }, lore_3: { keys: ["k"], content: "c", priority: 9 } } } }).draft.lore;
  const city = map.find((e) => e.content === "Текст"), byId = map.find((e) => e.content === "по id"), l3 = map.find((e) => e.content === "c");
  assert.ok(city && byId && l3);
  assert.deepStrictEqual(city.keys, ["Город"]);
  assert.deepStrictEqual(byId.keys, [], "служебный id не становится ключом");
  assert.deepStrictEqual(l3.keys, ["k"]); assert.strictEqual(l3.insertion_order, 9);
});
t("FA fixture 15: экспорт после импорта — только включённые указания, выключенные в prism_rp", () => {
  const d = imp(V2FULL).draft;
  let out = C.toSpec(d, "v3").data;
  assert.strictEqual(out.system_prompt, ""); assert.strictEqual(out.post_history_instructions, "");
  assert.deepStrictEqual(out.extensions.prism_rp.disabledDirectives, { system: "SYS-IMPORTED", postHistory: "POST-IMPORTED" });
  assert.strictEqual(out.extensions.depth_prompt.prompt, "DEPTH-EXT", "чужие расширения сохранены");
  // E: повторный импорт экспорта не восстанавливает указания из расширения
  const back = imp({ spec: "chara_card_v3", data: out }).draft;
  assert.strictEqual(back.directives.system.text, ""); assert.strictEqual(back.directives.postHistory.text, "");
  assert.deepStrictEqual(back.source.preserved.disabledDirectives, { system: "SYS-IMPORTED", postHistory: "POST-IMPORTED" });
  d.directives.system.enabled = true;
  out = C.toSpec(d, "v2").data;
  assert.strictEqual(out.system_prompt, "SYS-IMPORTED"); assert.ok(!out.extensions.prism_rp || !out.extensions.prism_rp.disabledDirectives || !out.extensions.prism_rp.disabledDirectives.system);
  // URV → экспорт V2: внешность и прошлое в description, раздельные поля в prism_rp.fields, обратный импорт их восстанавливает
  const u = imp(URV).draft;
  const ux = C.toSpec(u, "v2");
  assert.ok(ux.data.description.includes("Внешность:\n") && ux.data.description.includes("Прошлое:\n"));
  assert.ok(!JSON.stringify(ux).includes("userOverride"), "исходник URV не переносится");
  const ub = imp(ux).draft;
  assert.strictEqual(ub.appearance, u.appearance); assert.strictEqual(ub.background, u.background); assert.strictEqual(ub.description, u.description);
  ux.data.description += "\n\nправка в другом приложении";
  assert.ok(imp(ux).draft.description.endsWith("правка в другом приложении"), "правленое описание не теряется");
});

t("FA unit: определение формата", () => {
  const f = (j) => CF.detect(j, "json").format;
  assert.strictEqual(f({ spec: "chara_card_v2", data: {} }), "ccv2");
  assert.strictEqual(f({ spec: "chara_card_v3", data: {} }), "ccv3");
  assert.strictEqual(f({ type: "urv-char", version: 2, data: {} }), "urv2");
  assert.strictEqual(f({ type: "urv-char", version: "2", data: {} }), "unknown");
  assert.strictEqual(f({ name: "A", description: "d" }), "ccv1");
  assert.strictEqual(f({ name: "A" }), "unknown", "одно имя — не карточка");
  assert.strictEqual(f({ spec: "chara_card_v2", data: "x" }), "unknown");
  assert.strictEqual(CF.detect({ spec: "chara_card_v2", data: {} }, "png").sourceType, "png");
  assert.strictEqual(CF.adapt({ foo: 1 }, { format: "unknown" }), null, "неизвестный не адаптируется");
});
t("FA unit: адаптеры дают каноническую форму", () => {
  const keys = Object.keys(CM.blank()).sort();
  for (const j of [{ name: "A", description: "d" }, V2FULL, { spec: "chara_card_v3", data: V2FULL.data }, URV]) {
    const d = imp(j).draft;
    assert.deepStrictEqual(Object.keys(d).sort(), keys);
    assert.strictEqual(d.schema, CM.SCHEMA);
    for (const k of ["system", "postHistory"]) assert.deepStrictEqual(Object.keys(d.directives[k]).sort(), ["enabled", "origin", "reviewed", "text"]);
    assert.ok(d.source && d.source.raw && d.source.format);
  }
});
t("FA unit: проверка черновика", () => {
  const b = CM.blank();
  assert.ok(VAL.validate(b).some((x) => x.code === "no-name"));
  b.name = "A";
  assert.ok(VAL.validate(b).some((x) => x.code === "empty-card"));
  b.firstMes = "hi";
  assert.ok(!VAL.hasErrors(VAL.validate(b)));
  b.directives.system = CM.importedDirective("x");
  assert.ok(VAL.validate(b).some((x) => x.code === "directive-system" && x.level === "warning"));
  const r = imp(V2FULL);
  assert.deepStrictEqual(r.issues.map((x) => x.level), r.issues.map((x) => x.level).slice().sort((a, c) => ["error", "warning", "info"].indexOf(a) - ["error", "warning", "info"].indexOf(c)), "ошибки → предупреждения → сведения");
});
t("FA unit: карантин указаний", () => {
  assert.deepStrictEqual(CM.importedDirective("t"), { text: "t", origin: "imported", enabled: false, reviewed: false });
  assert.deepStrictEqual(CM.importedDirective("  "), { text: "", origin: "authored", enabled: true, reviewed: true }, "пустое импортированное — просто пустое");
  assert.strictEqual(CM.directive("t").enabled, true, "своё — включено");
  const c = CM.blank(); c.directives.system = CM.importedDirective("Q");
  assert.strictEqual(CM.activeText(c, "system"), ""); assert.ok(CM.hasDisabledText(c, "system"));
  assert.ok(!A.build({ card: Object.assign(c, { name: "N", description: "d" }), history: [{ role: "user", text: "hi" }] }).messages.some((m) => m.content.includes("Q\n") || m.content.endsWith("Q")));
});
t("FA unit: URV — проверка собранного промпта", () => {
  const f = { a: "Длинное описание внешности персонажа номер один", b: "Характер у неё довольно сложный и переменчивый" };
  assert.ok(CF.urv.compiledCheck("Intro. " + f.a + ". И ещё: " + f.b, f).compiled);
  assert.ok(!CF.urv.compiledCheck("Совершенно другой текст указания", f).compiled);
  const own = imp({ type: "urv-char", version: 2, data: { name: "X", description: "d", systemPrompt: "Пиши от первого лица." } });
  assert.strictEqual(own.draft.directives.system.text, "Пиши от первого лица."); assert.strictEqual(own.draft.directives.system.enabled, false);
  assert.ok(own.issues.some((x) => x.code === "system-prompt-candidate"));
  const both = imp({ type: "urv-char", version: 2, data: { name: "X", description: "d", profile: { systemNote: "note" }, systemPrompt: "Другое указание." } });
  assert.strictEqual(both.draft.directives.system.text, "note"); assert.strictEqual(both.draft.source.preserved.systemPrompt, "Другое указание.");
});
t("FA unit: старые сохранённые карточки приводятся без смены поведения", () => {
  const old = { id: "c1", name: "Old", description: "d", systemPrompt: "OLD-SYS", postHistory: "", raw: { a: 1 }, spec: "chara_card_v2", lore: [] };
  const u = CM.upgradeStored(old);
  assert.strictEqual(u.directives.system.enabled, true); assert.strictEqual(u.directives.system.origin, "authored");
  assert.ok(!("systemPrompt" in u) && !("raw" in u)); assert.strictEqual(u.source.raw.a, 1); assert.strictEqual(u.id, "c1");
  assert.ok(outbound(u).includes("OLD-SYS"));
  assert.strictEqual(CM.upgradeStored(u), u, "повторно не трогает");
});
t("FA unit: внешность и прошлое в карточке и уступают бюджету раньше описания", () => {
  const c = Object.assign(CM.blank(), { name: "N", description: "DESC-CORE", appearance: "APP-X", background: "BG-Y" });
  const o = outbound(c);
  assert.ok(o.includes("Внешность: APP-X") && o.includes("Прошлое: BG-Y"));
  const fat = Object.assign(CM.blank(), { name: "N", description: "DESC-CORE " + big(250), appearance: "APP-X " + big(700), background: "BG-Y " + big(700) });
  const r = A.build(Object.assign({ card: fat, sceneState: baseScene, history: hist(4, 20) }, BUD));
  assert.ok(r.report.used <= r.report.budget && !r.report.overflow);
  const layers = r.report.truncated.map((x) => x.layer);
  assert.ok(layers.includes("card.background"), JSON.stringify(layers));
  assert.ok(r.messages[0].content.includes("DESC-CORE"), "описание остаётся");
});
t("FA unit: ассистент видит только включённые указания", () => {
  const c = imp(V2FULL).draft;
  assert.ok(!AST.cardText(c).includes("SYS-IMPORTED") && !AST.cardText(c).includes("POST-IMPORTED"));
  c.directives.system.enabled = true;
  assert.ok(AST.cardText(c).includes("SYS-IMPORTED"));
});

t("FA review fix: prism_rp.disabledDirectives — только сохранность, переживает круги импорта/экспорта", () => {
  for (const spec of ["chara_card_v2", "chara_card_v3"]) {
    const ver = spec === "chara_card_v3" ? "v3" : "v2";
    const card = { spec, data: { name: "Х", description: "d", first_mes: "hi", system_prompt: "", post_history_instructions: "",
      extensions: { prism_rp: { disabledDirectives: { system: "OLD-SYS", postHistory: "OLD-POST" } } } } };
    // 1: импорт — только в source.preserved
    const r = imp(card);
    assert.ok(r.ok);
    assert.strictEqual(r.draft.directives.system.text, ""); assert.strictEqual(r.draft.directives.postHistory.text, "");
    assert.deepStrictEqual(r.draft.source.preserved.disabledDirectives, { system: "OLD-SYS", postHistory: "OLD-POST" });
    assert.ok(!r.issues.some((x) => x.code === "directive-system" || x.code === "directive-postHistory"));
    // 2: рантайм не видит, даже если пустые указания включены
    const on = JSON.parse(JSON.stringify(r.draft));
    on.directives.system.enabled = true; on.directives.postHistory.enabled = true;
    assert.ok(!outbound(on).includes("OLD-") && !AST.cardText(on).includes("OLD-"));
    // 3: первый повторный экспорт сохраняет в расширении, стандартные поля пусты
    const ex1 = C.toSpec(r.draft, ver);
    assert.strictEqual(ex1.data.system_prompt, ""); assert.strictEqual(ex1.data.post_history_instructions, "");
    assert.deepStrictEqual(ex1.data.extensions.prism_rp.disabledDirectives, { system: "OLD-SYS", postHistory: "OLD-POST" });
    // 4: второй импорт — снова не указание
    const r2 = imp(ex1);
    assert.strictEqual(r2.draft.directives.system.text, ""); assert.strictEqual(r2.draft.directives.postHistory.text, "");
    assert.ok(!outbound(r2.draft).includes("OLD-"));
    // 5: второй экспорт — всё ещё сохранено
    const ex2 = C.toSpec(r2.draft, ver);
    assert.deepStrictEqual(ex2.data.extensions.prism_rp.disabledDirectives, { system: "OLD-SYS", postHistory: "OLD-POST" });
    assert.strictEqual(ex2.data.system_prompt, "");
    // 6: текущее выключенное указание побеждает устаревшее сохранённое по тому же ключу
    const nw = JSON.parse(JSON.stringify(r2.draft));
    nw.directives.system = CM.directive("NEW-SYS", "authored"); nw.directives.system.enabled = false;
    const ex3 = C.toSpec(nw, ver);
    assert.strictEqual(ex3.data.system_prompt, "");
    assert.deepStrictEqual(ex3.data.extensions.prism_rp.disabledDirectives, { system: "NEW-SYS", postHistory: "OLD-POST" });
    // C: включённое указание — только в system_prompt; сохранённое по тому же ключу остаётся хранением
    nw.directives.system.enabled = true;
    const ex4 = C.toSpec(nw, ver);
    assert.strictEqual(ex4.data.system_prompt, "NEW-SYS");
    assert.deepStrictEqual(ex4.data.extensions.prism_rp.disabledDirectives, { system: "OLD-SYS", postHistory: "OLD-POST" });
    const r4 = imp(ex4).draft;
    assert.strictEqual(r4.directives.system.text, "NEW-SYS"); assert.strictEqual(r4.directives.system.enabled, false, "из system_prompt — импортированное, выключено");
    assert.strictEqual(r4.directives.postHistory.text, "");
  }
  // экспорт выключенного канонического указания и повторный импорт без восстановления
  const c = imp(V2FULL).draft;
  const out = C.toSpec(c, "v2");
  assert.strictEqual(out.data.extensions.prism_rp.disabledDirectives.system, "SYS-IMPORTED"); assert.strictEqual(out.data.system_prompt, "");
  const back = imp(out).draft;
  assert.strictEqual(back.directives.system.text, ""); assert.ok(!outbound(back).includes("SYS-IMPORTED"));
  assert.strictEqual(C.toSpec(back, "v2").data.extensions.prism_rp.disabledDirectives.system, "SYS-IMPORTED");
});

/* ── FOUNDATION-B: жизненный цикл сценария и начало сцены ── */
const SCN = globalThis.PRP.scenario;
// Узлы для веток: role + id.
const U_ = (id) => ({ id, role: "user" }), A_ = (id) => ({ id, role: "assistant" });
t("B-1: пустой чат — сценарий подаётся", () => {
  assert.strictEqual(SCN.forGeneration([], { mode: "new" }).included, true);
  assert.strictEqual(SCN.forGeneration([], { mode: "opening" }).included, true);
});
t("B-2/B-3: только начало (авторское или сгенерированное), реплик пользователя нет — сценарий подаётся", () => {
  assert.strictEqual(SCN.forGeneration([A_("a0")], { mode: "new" }).included, true);
});
t("B-4: ответ на первую реплику пользователя получает сценарий (и без начала, и после него)", () => {
  assert.strictEqual(SCN.forGeneration([U_("u1")], { mode: "new" }).included, true);
  assert.strictEqual(SCN.forGeneration([A_("a0"), U_("u1")], { mode: "new" }).included, true);
});
t("B-5/B-6: после первого ответа и на поздних ходах — сценария нет", () => {
  assert.strictEqual(SCN.forGeneration([A_("a0"), U_("u1"), A_("a1")], { mode: "new" }).included, false, "предпросмотр после первого обмена");
  assert.strictEqual(SCN.forGeneration([U_("u1"), A_("a1")], { mode: "new" }).included, false);
  assert.strictEqual(SCN.forGeneration([A_("a0"), U_("u1"), A_("a1"), U_("u2")], { mode: "new" }).included, false);
  assert.strictEqual(SCN.forGeneration([U_("u1"), U_("u2")], { mode: "new" }).included, false, "вторая реплика подряд — уже не первая");
});
t("B-7/B-8: ветки — без реплик пользователя сценарий возвращается, соседняя ветка не влияет", () => {
  // A ── B(user) ── C ; A' (другой корень/вариант без пользователя)
  const withUser = [A_("A"), U_("B"), A_("C")], noUser = [A_("D")];
  assert.strictEqual(SCN.forGeneration(withUser, { mode: "new" }).included, false);
  assert.strictEqual(SCN.forGeneration(noUser, { mode: "new" }).included, true);
  assert.strictEqual(SCN.forGeneration(withUser, { mode: "new" }).included, false, "вызовы не влияют друг на друга");
});
t("B-10/B-11: другой вариант первого ответа — со сценарием, позднего — без", () => {
  const p = [A_("a0"), U_("u1"), A_("a1"), U_("u2"), A_("a2")];
  assert.strictEqual(SCN.forGeneration(p, { mode: "regen", targetId: "a1" }).included, true);
  assert.strictEqual(SCN.forGeneration(p, { mode: "regen", targetId: "a2" }).included, false);
  assert.strictEqual(SCN.forGeneration(p, { mode: "regen", targetId: "a0" }).included, true, "другой вариант начала");
});
t("B-12: «продолжить» — по той же границе", () => {
  const p = [A_("a0"), U_("u1"), A_("a1"), U_("u2"), A_("a2")];
  assert.strictEqual(SCN.forGeneration(p.slice(0, 1), { mode: "continue", targetId: "a0" }).included, true, "дописать начало");
  assert.strictEqual(SCN.forGeneration(p.slice(0, 3), { mode: "continue", targetId: "a1" }).included, true, "дописать первый ответ");
  assert.strictEqual(SCN.forGeneration(p, { mode: "continue", targetId: "a2" }).included, false, "дописать поздний ответ");
});
t("B-13: детерминированно, без флага «израсходован»", () => {
  const p = [A_("a0"), U_("u1"), A_("a1")];
  const before = JSON.stringify(p);
  const r1 = SCN.forGeneration(p, { mode: "new" }), r2 = SCN.forGeneration(p, { mode: "new" });
  assert.deepStrictEqual(r1, r2); assert.strictEqual(JSON.stringify(p), before, "путь не меняется");
  assert.ok(!/consumed/i.test(require("fs").readFileSync(J("prism/scenario.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
});
t("FB: сценарий — отдельный раздел «начало истории», не в склонностях; выключается решением", () => {
  const cd = { name: "Юки", description: "Тихая.", scenario: "SCEN-LIB дождливый вечер", lore: [] };
  const on = A.build({ card: cd, sceneState: S.fold("loc=Кафе", []), history: [{ role: "user", text: "hi" }] });
  const head = on.messages[0].content;
  const cardSec = head.slice(head.indexOf("### Характер")).split("\n### ")[0];
  assert.ok(!cardSec.includes("SCEN-LIB"), "не внутри склонностей");
  assert.ok(head.includes("### С чего начинается история") && head.includes("SCEN-LIB"));
  assert.ok(head.indexOf("SCEN-LIB") < head.indexOf("### Сейчас"), "перед сценой");
  assert.strictEqual(on.report.scenarioIncluded, true); assert.strictEqual(on.report.scenarioState, "included");
  const off = A.build({ card: cd, history: [{ role: "user", text: "hi" }], includeScenario: false });
  assert.ok(!off.messages.some((m) => m.content.includes("SCEN-LIB")));
  assert.strictEqual(off.report.scenarioState, "past-first-turn");
  assert.strictEqual(A.build({ card: Object.assign({}, cd, { scenario: "" }), history: [] }).report.scenarioState, "none");
});

// Сервисы чата, Prism и генерации на памяти: хранилище — Map, модель — подставная функция.
let fbLLM = null;
globalThis.PRP.llm = { chat: (...a) => fbLLM(...a) };
require(J("chat/service.js"));
require(J("prism/experience-service.js"));
require(J("prism/service.js"));
require(J("generation/service.js"));
function fbHarness(card, opts) {
  const o = opts || {};
  const store = { messages: new Map(), chats: new Map() };
  const DB = {
    put: async (st, x) => { (store[st] = store[st] || new Map()).set(x.id, JSON.parse(JSON.stringify(x))); },
    byIndex: async (st, idx, v) => [...((store[st] || new Map()).values())].filter((x) => x[idx] === v),
    delMany: async (st, ids) => ids.forEach((id) => store[st] && store[st].delete(id)),
    del: async (st, id) => store[st] && store[st].delete(id),
  };
  const S = { settings: Object.assign(STG.merge({}), o.settings || {}), cards: [Object.assign(CM.blank(), { id: "c1" }, card)], chats: [], cardId: "c1", chatId: null, messages: [], experience: [], gen: null, drawerOpen: false, tab: "scene", lastPrism: null };
  const toasts = [];
  const noop = () => {};
  const ctx = {
    S, DB, env: { perchanceImages: () => false },
    card: () => S.cards.find((c) => c.id === S.cardId) || null,
    chat: () => S.chats.find((c) => c.id === S.chatId) || null,
    persona: () => STG.persona(S.settings),
    provider: () => o.provider || ({ id: "mock", label: "mock", kind: "openai" }),
    contextTokens: () => o.contextTokens || 8192,
    svc: {}, nav: {},
    ui: { toast: (t, err) => toasts.push({ t, err }), renderFeed: noop, renderDrawer: noop, renderRail: noop, scrollBottom: noop, paintStreaming: noop, openSettings: noop },
  };
  ctx.svc.chat = PRP.chatService.create(ctx);
  ctx.svc.prism = PRP.prismService.create(ctx);
  ctx.svc.gen = PRP.generationService.create(ctx);
  return { S, ctx, store, toasts, chat: ctx.svc.chat, gen: ctx.svc.gen, prism: ctx.svc.prism };
}
const allText = (msgs) => msgs.map((m) => m.content).join("\n");
async function ta(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; console.log("✗ " + name + "\n   " + (e.stack || e.message || e).split("\n").slice(0, 3).join("\n   ")); }
}
async function foundationB() {
  const CARD_NOFIRST = { name: "Юки", description: "Тихая библиотекарша.", scenario: "SCEN-LIB: дождливый вечер в университетской библиотеке." };
  const CARD_FIRST = { name: "Хана", description: "Весёлая.", scenario: "SCEN-FEST: фестиваль, полдень.", firstMes: "Она стоит у входа.\n\n[scene: loc=Ворота]", altGreetings: ["Она машет рукой.\n\n[scene: loc=Сцена]"] };
  const reply = (text) => async (prov, messages, o) => { reply.last = messages; if (o.onDelta) o.onDelta({ text }); return { text, reasoning: "" }; };

  await ta("B-21/B-22/B-23: первое сообщение — корень без вызова модели, приветствия — варианты, сцена по активному варианту", async () => {
    const h = fbHarness(CARD_FIRST);
    let called = 0; fbLLM = async () => { called++; return { text: "x" }; };
    await h.chat.createChat("rp");
    const p = h.chat.path();
    assert.strictEqual(called, 0); assert.strictEqual(p.length, 1); assert.strictEqual(p[0].role, "assistant"); assert.strictEqual(p[0].parentId, null);
    assert.strictEqual(p[0].opening, "authored"); assert.strictEqual(p[0].swipes.length, 2);
    assert.strictEqual(h.chat.sceneState().loc, "Ворота");
    await h.chat.swipe(p[0].id, 1);
    assert.strictEqual(h.chat.sceneState().loc, "Сцена");
    // B-9: смена авторского варианта не расходует сценарий
    h.prism.refresh();
    assert.ok(allText(h.S.lastPrism.messages).includes("SCEN-FEST"));
    assert.ok(!h.S.lastPrism.messages.some((m) => /SCEN-FEST/.test(m.content) && m.content.includes("loc=")), "сценарий не превращён в сцену");
    assert.notStrictEqual(h.chat.sceneState().loc, "SCEN-FEST");
  });
  await ta("B-24/FB-11: без первого сообщения — пустой чат без заглушек, leafId = null", async () => {
    const h = fbHarness(CARD_NOFIRST);
    let called = 0; fbLLM = async () => { called++; return { text: "x" }; };
    const id = await h.chat.createChat("rp");
    assert.ok(id); assert.strictEqual(h.ctx.chat().leafId, null); assert.strictEqual(h.S.messages.length, 0);
    assert.strictEqual(h.store.messages.size, 0); assert.strictEqual(called, 0, "открытие чата не вызывает модель");
    assert.ok(!h.ctx.chat().preview, "превью нейтральное");
    assert.strictEqual(h.chat.sceneState().loc, "", "сценарий не переносится в сцену");
    h.prism.refresh();
    assert.ok(allText(h.S.lastPrism.messages).includes("SCEN-LIB"), "B-1 предпросмотр пустого чата");
  });
  await ta("B-14: начало сцены при переполнении — модель не вызывается, ничего не сохраняется", async () => {
    const h = fbHarness(Object.assign({}, CARD_NOFIRST, { description: "Очень. ".repeat(10) }), { contextTokens: 600 });
    await h.chat.createChat("rp");
    h.S.chats[0].sceneInit = "loc=" + "огромная библиотека ".repeat(400);
    let called = 0; fbLLM = async () => { called++; return { text: "x" }; };
    const r = await h.gen.generate(null, "opening");
    assert.strictEqual(r.reason, "overflow"); assert.strictEqual(called, 0);
    assert.strictEqual(h.store.messages.size, 0); assert.strictEqual(h.ctx.chat().leafId, null);
    assert.ok(h.S.lastPrism.report.overflow); assert.ok(h.toasts.some((x) => x.err));
  });
  await ta("B-15/B-20: ошибка модели — ни узла, ни leafId; повтор после ошибки работает", async () => {
    const h = fbHarness(CARD_NOFIRST);
    await h.chat.createChat("rp");
    fbLLM = async (prov, msgs, o) => { o.onDelta({ text: "Частичный текст" }); throw new Error("сеть недоступна"); };
    let r = await h.gen.generate(null, "opening");
    assert.strictEqual(r.reason, "error"); assert.strictEqual(h.store.messages.size, 0); assert.strictEqual(h.S.messages.length, 0);
    assert.strictEqual(h.ctx.chat().leafId, null); assert.strictEqual(h.S.gen, null);
    assert.ok(h.toasts.some((x) => x.err && x.t.includes("сеть недоступна")));
    fbLLM = async () => ({ text: "   " });
    r = await h.gen.generate(null, "opening");
    assert.strictEqual(r.reason, "error", "пустой ответ — тоже без записи"); assert.strictEqual(h.store.messages.size, 0);
    fbLLM = reply("Библиотека почти пуста. Юки поднимает взгляд от книги.");
    r = await h.gen.generate(null, "opening");
    assert.ok(r.ok); assert.strictEqual(h.store.messages.size, 1);
  });
  await ta("B-16: отмена — ни узла, ни частичного текста", async () => {
    const h = fbHarness(CARD_NOFIRST);
    await h.chat.createChat("rp");
    // Отмена посреди потока; транспорт (как Perchance) может вернуть частичный текст без исключения.
    fbLLM = async (prov, msgs, o) => { o.onDelta({ text: "Нача" }); h.gen.stop(); return { text: "Нача" }; };
    const r = await h.gen.generate(null, "opening");
    assert.strictEqual(r.reason, "aborted"); assert.strictEqual(h.store.messages.size, 0); assert.strictEqual(h.ctx.chat().leafId, null);
    fbLLM = async (prov, msgs, o) => { h.gen.stop(); const e = new Error("aborted"); e.name = "AbortError"; e.partial = "Нача"; throw e; };
    assert.strictEqual((await h.gen.generate(null, "opening")).reason, "aborted"); assert.strictEqual(h.store.messages.size, 0);
  });
  await ta("B-17/B-18/B-19/FB-15: успешное начало — ровно один корень, [scene:] разобран, превью и Prism обновлены, без фальшивой реплики", async () => {
    const h = fbHarness(CARD_NOFIRST);
    await h.chat.createChat("rp");
    let seen = null;
    fbLLM = async (prov, msgs, o) => { seen = msgs; assert.ok(h.S.gen && h.S.gen.opening); assert.strictEqual(h.store.messages.size, 0, "до ответа дерево не тронуто"); o.onDelta({ text: "…" });
      return { text: "Юки закрывает книгу.\n\n[scene: loc=Читальный зал; time=19:00]" }; };
    const r = await h.gen.generate(null, "opening");
    assert.ok(r.ok);
    assert.strictEqual(h.store.messages.size, 1);
    const m = h.S.messages[0];
    assert.strictEqual(m.role, "assistant"); assert.strictEqual(m.parentId, null); assert.strictEqual(m.opening, "generated");
    assert.strictEqual(h.ctx.chat().leafId, m.id); assert.strictEqual(m.swipes[0].text, "Юки закрывает книгу.");
    assert.strictEqual(h.chat.sceneState().loc, "Читальный зал");
    assert.ok(h.ctx.chat().preview.startsWith("Юки закрывает книгу"));
    // в модель: сценарий, карточка, указание начать; ни одной реплики пользователя
    const txt = allText(seen);
    assert.ok(txt.includes("SCEN-LIB") && txt.includes("Тихая библиотекарша") && txt.includes("Начни сцену"));
    assert.ok(!seen.some((x) => x.role === "user"), "нет фальшивой реплики пользователя");
    assert.ok(!seen.some((x) => x.role === "assistant"), "нет истории");
    // B-3: после сгенерированного начала предпросмотр всё ещё со сценарием
    assert.ok(allText(h.S.lastPrism.messages).includes("SCEN-LIB") && h.S.lastPrism.preview);
    assert.strictEqual(h.S.lastPrism.report.scenarioState, "included");
  });
  await ta("FB-16: указание начала учитывается в строгом бюджете", async () => {
    const h = fbHarness(CARD_NOFIRST, { contextTokens: 1200 });
    await h.chat.createChat("rp");
    let seen = null, r = null; fbLLM = async (p, msgs) => { seen = msgs; r = h.S.lastPrism.report; return { text: "Привет." }; };
    await h.gen.generate(null, "opening");
    const est = seen.reduce((n, x) => n + globalThis.PRP.util.estimateTokens(x.content) + 4, 0);
    assert.ok(allText(seen).includes("Начни сцену"), "указание в отправленном");
    assert.strictEqual(est, r.used, "отчёт считает ровно то, что ушло, вместе с указанием");
    assert.ok(r.used <= r.budget && !r.overflow);
  });
  await ta("B-4/B-5/B-30 (FB-4/FB-5): пользователь пишет первым — первый ответ со сценарием, следующий без", async () => {
    const h = fbHarness(CARD_NOFIRST);
    await h.chat.createChat("rp");
    const sent = [];
    fbLLM = async (p, msgs) => { sent.push(allText(msgs)); return { text: "Да, я здесь." }; };
    await h.chat.addUserMessage("Ты ещё здесь?");
    await h.gen.generate();
    assert.ok(sent[0].includes("SCEN-LIB"), "первый ответ получает сценарий");
    assert.strictEqual(h.chat.path()[0].role, "user", "реплика пользователя — корень");
    h.prism.refresh();
    assert.ok(!allText(h.S.lastPrism.messages).includes("SCEN-LIB"), "предпросмотр после первого ответа — без сценария");
    assert.strictEqual(h.S.lastPrism.report.scenarioState, "past-first-turn");
    await h.chat.addUserMessage("Что читаешь?");
    await h.gen.generate();
    assert.ok(!sent[1].includes("SCEN-LIB"), "второй ответ — без сценария");
    // B-10: другой вариант ПЕРВОГО ответа — снова со сценарием; B-11: позднего — без
    const p = h.chat.path();
    await h.gen.generate(p[1].id, "regen");
    assert.ok(sent[2].includes("SCEN-LIB"));
    await h.gen.generate(p[3].id, "regen");
    assert.ok(!sent[3].includes("SCEN-LIB"));
    // B-12: продолжить первый ответ — со сценарием, поздний — без
    await h.gen.generate(p[1].id, "continue");
    assert.ok(sent[4].includes("SCEN-LIB"));
    await h.gen.generate(p[3].id, "continue");
    assert.ok(!sent[5].includes("SCEN-LIB"));
    // B-7: вернуться на ветку без реплик пользователя невозможно в этом чате (корень — пользователь); см. авторский случай ниже
  });
  await ta("FB авторское начало: предпросмотр со сценарием → ответ на первую реплику со сценарием → дальше без; ветка без реплик восстанавливает", async () => {
    const h = fbHarness(CARD_FIRST);
    await h.chat.createChat("rp");
    const root = h.chat.path()[0];
    h.prism.refresh();
    assert.ok(allText(h.S.lastPrism.messages).includes("SCEN-FEST"), "B-2");
    const sent = [];
    fbLLM = async (p, msgs) => { sent.push(allText(msgs)); return { text: "Привет-привет!" }; };
    await h.chat.addUserMessage("Привет.");
    await h.gen.generate();
    assert.ok(sent[0].includes("SCEN-FEST"));
    h.prism.refresh();
    assert.ok(!allText(h.S.lastPrism.messages).includes("SCEN-FEST"));
    // B-7/B-8: другой вариант начала — новая ветка без реплик пользователя; модель зовётся с указанием начать
    await h.gen.generate(root.id, "regen");
    assert.ok(sent[1].includes("SCEN-FEST") && sent[1].includes("Начни сцену"), "другой вариант начала — со сценарием и указанием");
    // переключение листа на корень (ветка без пользователя) восстанавливает сценарий в предпросмотре
    h.ctx.chat().leafId = root.id;
    h.prism.refresh();
    assert.ok(allText(h.S.lastPrism.messages).includes("SCEN-FEST"), "ветка без реплик пользователя");
    h.ctx.chat().leafId = T.latestLeaf(h.S.messages, root.id);
    h.prism.refresh();
    assert.ok(!allText(h.S.lastPrism.messages).includes("SCEN-FEST"), "соседняя ветка с репликой — без");
  });
  await ta("FB-24: начало сцены — только включённые указания автора", async () => {
    const card = Object.assign({}, CARD_NOFIRST, { directives: { system: CM.importedDirective("IMPORTED-OFF"), postHistory: CM.directive("AUTHORED-ON", "authored") } });
    const h = fbHarness(card);
    await h.chat.createChat("rp");
    let seen = null; fbLLM = async (p, msgs) => { seen = allText(msgs); return { text: "Начало." }; };
    await h.gen.generate(null, "opening");
    assert.ok(!seen.includes("IMPORTED-OFF") && seen.includes("AUTHORED-ON"));
  });

  await ta("SS-A: начало сцены в обычном режиме — ни одной реплики пользователя", async () => {
    const h = fbHarness(CARD_NOFIRST);
    await h.chat.createChat("rp");
    let seen = null; fbLLM = async (p, msgs) => { seen = msgs; return { text: "Начало." }; };
    assert.ok((await h.gen.generate(null, "opening")).ok);
    assert.ok(!seen.some((m) => m.role === "user") && !allText(seen).includes("[Начало]"));
  });
  const SS_CARD = Object.assign({}, CARD_NOFIRST, { directives: { system: CM.directive("AUTH-SYS-ON", "authored"), postHistory: CM.importedDirective("IMPORTED-OFF") } });
  await ta("SS-B..F: «одно системное сообщение» + Perchance — только system, без «[Начало]»; указание в бюджете, сценарий, указания автора по правилам", async () => {
    const h = fbHarness(SS_CARD, { settings: { singleSystem: true }, provider: { id: "perchance", label: "Perchance", kind: "perchance" } });
    await h.chat.createChat("rp");
    let seen = null, rep = null; fbLLM = async (p, msgs) => { seen = msgs; rep = h.S.lastPrism.report; return { text: "Юки поднимает взгляд." }; };
    const r = await h.gen.generate(null, "opening");
    assert.ok(r.ok);
    assert.deepStrictEqual(seen.map((m) => m.role), ["system"], "B: только system");
    const txt = allText(seen);
    assert.ok(!txt.includes("[Начало]"));
    assert.ok(txt.includes("Начни сцену"), "C: указание есть");
    assert.strictEqual(seen.reduce((n, x) => n + globalThis.PRP.util.estimateTokens(x.content) + 4, 0), rep.used, "C: в бюджете");
    assert.ok(rep.used <= rep.budget && !rep.syntheticUser && rep.needsUserFirst);
    assert.ok(txt.includes("SCEN-LIB"), "D: сценарий");
    assert.ok(txt.includes("AUTH-SYS-ON"), "E: включённое указание");
    assert.ok(!txt.includes("IMPORTED-OFF"), "F: выключенное импортированное");
    assert.strictEqual(h.store.messages.size, 1);
  });
  await ta("SS-G: «одно системное сообщение» + OpenAI-совместимый сервер — отказ до вызова, ничего не меняется; можно написать первым", async () => {
    const h = fbHarness(SS_CARD, { settings: { singleSystem: true } });
    await h.chat.createChat("rp");
    let called = 0; fbLLM = async () => { called++; return { text: "x" }; };
    const r = await h.gen.generate(null, "opening");
    assert.strictEqual(r.reason, "needs-user-first"); assert.strictEqual(called, 0);
    assert.strictEqual(h.store.messages.size, 0); assert.strictEqual(h.S.messages.length, 0); assert.strictEqual(h.ctx.chat().leafId, null);
    assert.strictEqual(h.chat.sceneState().loc, ""); assert.strictEqual(h.S.gen, null);
    assert.ok(h.toasts.some((x) => x.err && x.t.includes("первый ход пользователя")));
    // пользователь пишет первым — обычный ход работает, реплика настоящая
    let seen = null; fbLLM = async (p, msgs) => { called++; seen = msgs; return { text: "Да." }; };
    await h.chat.addUserMessage("Ты ещё здесь?");
    await h.gen.generate();
    assert.strictEqual(called, 1); assert.deepStrictEqual(seen.map((m) => m.role), ["system", "user"]);
    assert.strictEqual(seen[1].content, "Ты ещё здесь?"); assert.ok(allText(seen).includes("SCEN-LIB"));
  });
  await ta("SS-G2: другой вариант корневого начала при строгом шаблоне — отказ до добавления варианта", async () => {
    const h = fbHarness(Object.assign({}, SS_CARD, { firstMes: "Привет." }), { settings: { singleSystem: true } });
    await h.chat.createChat("rp");
    const root = h.chat.path()[0];
    let called = 0; fbLLM = async () => { called++; return { text: "x" }; };
    await h.gen.generate(root.id, "regen");
    assert.strictEqual(called, 0); assert.strictEqual(h.S.messages[0].swipes.length, 1); assert.strictEqual(h.ctx.chat().leafId, root.id);
  });
  await ta("SS-H: обычный разговор при «одном системном» — как раньше («[Начало]» перед ответом на приветствие)", async () => {
    const h = fbHarness(Object.assign({}, SS_CARD, { firstMes: "Привет." }), { settings: { singleSystem: true } });
    await h.chat.createChat("rp");
    let seen = null; fbLLM = async (p, msgs) => { seen = msgs; return { text: "Ответ." }; };
    await h.chat.addUserMessage("Здравствуй.");
    await h.gen.generate();
    assert.deepStrictEqual(seen.map((m) => m.role), ["system", "user", "assistant", "user"]);
    assert.strictEqual(seen[1].content, "[Начало]");
    const built = A.build({ card: { name: "N", description: "d" }, singleSystem: true, history: [{ role: "assistant", text: "a" }, { role: "user", text: "b" }] });
    assert.ok(built.report.syntheticUser && !built.report.needsUserFirst);
  });
  await ta("пустой чат: обычная генерация без реплик тоже идёт как начало (без пустого узла)", async () => {
    const h = fbHarness(CARD_NOFIRST);
    await h.chat.createChat("rp");
    fbLLM = async () => { throw new Error("нет"); };
    await h.gen.generate();
    assert.strictEqual(h.store.messages.size, 0); assert.strictEqual(h.ctx.chat().leafId, null);
  });
}

foundationB().then(() => {
  console.log(`\n${passed} пройдено, ${failed} с ошибками`);
  process.exit(failed ? 1 : 0);
});
});
