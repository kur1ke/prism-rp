// Создаёт тестовую карточку-PNG для e2e: node tests/make_card.js out.png
"use strict";
const fs = require("fs");
const path = require("path");
require(path.join(__dirname, "../js/core/util.js"));
require(path.join(__dirname, "../js/cards/ccard.js"));
const C = globalThis.PRP.ccard;
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const card = C.normalize({
  spec: "chara_card_v2", spec_version: "2.0",
  data: {
    name: "Химэ", description: "Студентка, ревнивая, но отходчивая. {{user}} — её одногруппник.",
    personality: "живая, вспыльчивая", scenario: "Вечер после пар.", first_mes: "*Химэ машет рукой.* «{{user}}! Ты пришёл.»\n\n[scene: time=14.05 18:00; loc=Кафе у кампуса; enter=Химэ; Химэ.wear=белая блузка, юбка]",
    alternate_greetings: ["Опять опаздываешь, {{user}}?"], mes_example: "<START>\n{{char}}: Ну и ладно!",
    tags: ["студентка"], creator: "test", character_version: "1",
    character_book: { entries: [{ keys: ["кафе"], content: "Кафе у кампуса работает до полуночи.", enabled: true, insertion_order: 0 }] },
    extensions: {},
  },
});
fs.writeFileSync(process.argv[2], C.embedInPng(png, card));
