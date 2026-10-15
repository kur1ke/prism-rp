// Создаёт тестовую карточку-PNG для e2e: node tests/make_card.js out.png
"use strict";
const fs = require("fs");
const path = require("path");
require(path.join(__dirname, "../js/core/util.js"));
for (const m of ["cards/model", "cards/ccard", "cards/formats/common", "cards/formats/detect", "cards/formats/cc-v1", "cards/formats/cc-v2", "cards/formats/cc-v3", "cards/formats/urv-v2", "cards/validate", "cards/import"]) require(path.join(__dirname, "../js/" + m + ".js"));
const C = globalThis.PRP.ccard, IMP = globalThis.PRP.cardImport;
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const card = IMP.fromObject({
  spec: "chara_card_v2", spec_version: "2.0",
  data: {
    name: "Химэ", description: "Студентка, ревнивая, но отходчивая. {{user}} — её одногруппник.",
    personality: "живая, вспыльчивая", scenario: "Вечер после пар.", first_mes: "*Химэ машет рукой.* «{{user}}! Ты пришёл.»\n\n[scene: time=14.05 18:00; loc=Кафе у кампуса; enter=Химэ; Химэ.wear=белая блузка, юбка]",
    alternate_greetings: ["Опять опаздываешь, {{user}}?"], mes_example: "<START>\n{{char}}: Ну и ладно!",
    tags: ["студентка"], creator: "test", character_version: "1",
    character_book: { entries: [{ keys: ["кафе"], content: "Кафе у кампуса работает до полуночи.", enabled: true, insertion_order: 0 }] },
    extensions: {},
  },
}, "json", "himeh.json").draft;
fs.writeFileSync(process.argv[2], C.embedInPng(png, card));
