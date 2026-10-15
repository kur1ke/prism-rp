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
require(J("assist/assist.js"));
require(J("ui/render.js"));
const { scene: S, experience: E, assembler: A, ccard: C, openai: O, tree: T, imgCompose: IC, imgBackends: IB, imgCompile: ICP, assist: AST, render: RN } = globalThis.PRP;

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
  assert.ok(!built.messages[0].content.includes("Что Химэ помнит"), "пустой опыт — допустимо");
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
  scenario: "", systemPrompt: "", postHistory: "", mesExample: "<START>\n{{char}}: Ну и ладно!",
  lore: [{ keys: ["университет"], content: "Токийский университет", enabled: true }, { keys: [], content: "Мир — современная Япония", constant: true }],
};
t("сборка: слои подписаны, макросы подставлены, протокол в конце", () => {
  const st = S.fold("loc=Кафе", []);
  const r = A.build({ card, userName: "Кира", sceneState: st, experiences: [R1("ev", { event: "Он предал её", weight: 3 })], history: [{ role: "assistant", text: "Привет" }, { role: "user", text: "Как университет?" }] });
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
  assert.ok(r.report.used <= r.report.budget && r.report.fits && !r.report.overflow);
});

/* ── Сборщик: указания автора и строгий бюджет (этап 1) ── */
const authorCard = { name: "Юки", description: "shy but curious", personality: "", scenario: "", systemPrompt: "always answer in first person", postHistory: "use terse sentences", lore: [] };
const costOf = (msgs) => msgs.reduce((n, x) => n + Math.ceil(x.content.length / 3.5) + 4, 0);
t("PRISM1-13: указания автора отделены от склонностей", () => {
  const r = A.build({ card: authorCard, history: [{ role: "user", text: "hi" }] });
  const head = r.messages[0].content, post = r.messages[r.messages.length - 1].content;
  const cardSec = head.slice(head.indexOf("### Склонности"));
  assert.ok(cardSec.startsWith("### Склонности и характер Юки") && cardSec.includes("shy but curious"));
  assert.ok(!cardSec.split("### ")[1].includes("always answer"), "system_prompt не внутри склонностей");
  assert.ok(head.indexOf("### Указания автора карточки (правила") < head.indexOf("### Склонности"));
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
  const order = ["Ты ведёшь ролевую игру", "### Указания автора", "### Склонности", "PERSONA", "LORE", "EXP", "### Сейчас (факты)"].map((k) => h.indexOf(k));
  assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
  assert.strictEqual(r.messages[1].content, "hi");
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
  assert.ok(h.includes("### Склонности и характер Юки") && h.includes("Абзац 0."));
  assert.ok(!h.includes("Абзац 39."));
  const layers = r1.report.truncated.map((t) => t.layer);
  assert.ok(layers.includes("card.description") && layers.includes("card.scenario") && layers.includes("examples"));
  // Абзацы не режутся посередине: каждый оставшийся абзац описания целиком
  const desc = h.slice(h.indexOf("Абзац 0."), h.indexOf("\n\n###", h.indexOf("Абзац 0.")) > 0 ? h.indexOf("\n\n###", h.indexOf("Абзац 0.")) : undefined);
  assert.ok(desc.split("\n\n").every((p) => !p.startsWith("Абзац") || p.endsWith(".")));
});
t("огромные указания после истории ≤ бюджета, уступают раньше карточки", () => {
  const c = Object.assign({}, authorCard, { postHistory: big(3000) });
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

console.log(`\n${passed} пройдено, ${failed} с ошибками`);
process.exit(failed ? 1 : 0);
});
