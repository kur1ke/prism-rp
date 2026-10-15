# Архитектура Prism RP

Классические скрипты без сборщика модулей: каждый файл — IIFE, кладёт свой публичный API в `window.PRP`. Один и тот же код работает на Perchance, с `file://`, с GitHub Pages и в Node-тестах. `build.js` склеивает файлы в порядке тегов `<script>` из `index.html`. Этот порядок и есть порядок зависимостей.

## Направление зависимостей

```
События DOM
   │
   ▼
ui/app.js ── корень: состояние сессии S, контекст ctx, навигация, разбор событий
   │
   ├─► ui/controllers/*  тонкие обработчики: прочитать ввод → вызвать сервис → перерисовать
   │        │
   │        ▼
   ├─► сервисы (прикладной уровень, create(ctx); DOM не трогают, перерисовку просят через ctx.ui)
   │     chat/service · prism/service · prism/experience-service · generation/service
   │     images/service · cards/service · assist/service
   │        │
   │        ▼
   │   чистые модули предметной области (без DOM, хранилища, сети и S)
   │     prism/scene · prism/experience · prism/assembler · chat/tree
   │     cards/model · cards/ccard · cards/formats/* · cards/validate · cards/import
   │     assist/assist · images/compose · images/compile · core/settings · core/util
   │        │
   │        ▼
   │   адаптеры: core/store (IndexedDB) · providers/openai · providers/perchance · providers/router
   │             images/backends (Perchance / A1111 / OpenAI images) · ui/files (браузерные файлы)
   │
   └─► ui/shell.js  порт интерфейса ctx.ui: модель представления, отрисовка областей,
                    поповеры, поиск, потоковая отрисовка, уведомления
                    └─► ui/views/*  чистые функции «модель → HTML»
```

Запрещённые направления: модули предметной области → интерфейс, `app.js`, хранилище или сеть; провайдеры → смысл Prism (сцена, опыт, карточки, дерево); хранилище → смысл Prism; сервис → DOM. Циклов нет: сервисы ссылаются друг на друга только через `ctx.svc`, по графу `chat ← exp, prism, images ← generation`.

## Владение

| Модуль | Владеет | Может зависеть от | Не должен зависеть от |
|---|---|---|---|
| `core/util` | id, экранирование, макросы, оценка токенов | — | всего остального |
| `core/store` | IndexedDB: хранилища, бэкап | — | смысла Prism, интерфейса |
| `core/settings` | значения по умолчанию, слияние, список и выбор модели, объём контекста, флаги картинок | — | DOM, хранилища, сети, S |
| `prism/scene` | протокол `[scene:]`, свёртка ветки, возраст настроения, описание для модели | util | DOM, хранилища, провайдеров, S |
| `prism/experience` | канон чата и ветки, видимость, миграция (чистая), отбор, формат | util | DOM, хранилища, провайдеров, S |
| `prism/assembler` | сборка контекста, строгий бюджет, порядок уступок | util, scene, experience | хранилища, генерации, дерева чата |
| `chat/tree` | дерево сообщений, путь, варианты | — | Prism, провайдеров, интерфейса |
| `cards/model` | каноническая карточка (CardDraft): поля, указания автора `{text, origin, enabled, reviewed}`, `activeText` (только включённые), приведение старых сохранённых | — | всего остального |
| `cards/ccard` | PNG-чанки `chara`/`ccv3`, экспорт канонической карточки в V2/V3 (в `system_prompt`/`post_history_instructions` — только включённые указания) | model | хранилища, интерфейса, разбора форматов |
| `cards/formats/detect` | определение формата по содержимому; неизвестный формат не адаптируется | formats/common | хранилища, интерфейса |
| `cards/formats/cc-v1`, `cc-v2`, `cc-v3`, `urv-v2` | адаптер формата → канонический черновик + заметки; исходник в `source` (только хранение); импортированные указания выключены | model, formats/common | хранилища, интерфейса, рантайма |
| `cards/validate` | ошибки (сохранить нельзя), предупреждения, сведения | model | хранилища, интерфейса |
| `cards/import` | конвейер: текст/PNG → JSON → формат → адаптер → черновик → проверка; ничего не сохраняет | ccard, formats, validate | хранилища, интерфейса |
| `assist/assist` | инструкция ассистента, контекст из карточки и чата | util | хранилища, провайдеров |
| `images/compose`, `images/compile` | промпт картинки, перевод (через переданную функцию) | — | хранилища, DOM |
| `images/backends` | транспорт генераторов картинок | — | смысла Prism |
| `providers/openai`, `perchance` | транспорт текстовых моделей | — | сцены, опыта, карточек, дерева |
| `providers/router` | выбор транспорта по виду провайдера | openai, perchance | смысла Prism |
| `chat/service` | жизненный цикл чата: загрузка, создание с приветствием, правка, варианты, удаление, ручные правки сцены, экспорт текста | tree, scene, util, store | DOM, провайдеров |
| `prism/service` | сборка Prism для текущего чата, предпросмотр | assembler, experience, settings, compose, chat/service | DOM, хранилища, провайдеров |
| `prism/experience-service` | загрузка, миграция, черновики, сохранение, привязка опыта | experience, scene, store, chat/service | DOM, провайдеров |
| `generation/service` | ход: предварительная проверка → узел или вариант → модель → разбор → сохранение → автокартинка | prism/service, chat/service, images/service, router, scene | DOM (только через ctx.ui) |
| `images/service` | рисование, загрузка картинок чата, списки A1111 | compose, compile, backends, router, chat/service | DOM (только через ctx.ui) |
| `cards/service` | импорт в два шага (`prepareImport` — без сохранения, `commitImport` — после проверки, включение указаний только по явному выбору), сохранение, удаление с каскадом, экспорт | import, model, ccard, store, ui/files | DOM (только через ctx.ui / files) |
| `assist/service` | разговоры ассистента, генерация | assist, router, tree, scene, store | DOM (только через ctx.ui) |
| `ui/files` | скачивание, чтение файлов, PNG портрета, буфер обмена | render | смысла Prism |
| `ui/views/*` | разметка экранов | render, scene, tree, openai (только PRESETS), experience (scopeOf), assist (STARTERS) | хранилища, сервисов, S напрямую (работают с моделью m) |
| `ui/shell` | модель представления, отрисовка областей, поповеры, поиск, потоковая отрисовка, уведомления, запоминание экрана | views, сервисы (только чтение), scene | правил предметной области |
| `ui/controllers/*` | чтение форм и DOM-событий, вызовы сервисов, подтверждения | сервисы, shell, views | правил предметной области |
| `ui/app` | состояние сессии, ctx, навигация, разбор событий, запуск | всё выше | правил предметной области |

## Состояние сессии `S`

Классификация полей (объект остаётся одним, поля описаны в `app.js`):

- **данные:** `settings`, `cards`, `chats`, `messages` (текущего чата), `experience` (персонажа), `assistList`;
- **навигация:** `view`, `cardId`, `chatId`, `assist`;
- **генерация (временное):** `gen`, `drawing`;
- **интерфейс:** `drawerOpen`, `tab`, `find`, `homeQuery`, `modal`, `editProviderId`, `pop`, `editingMsg`, `expDraft`;
- **кэш производного:** `lastPrism`, `imgUrls`, `imgLists`, `legacyExperience`.

Модули предметной области `S` не видят: им передаются нужные срезы (`EX.rank(records, ctx)`, `SC.fold(init, steps)`, `TR.path(index, leafId)`).

## Куда класть будущее

- **Новый формат карточки** — адаптер в `cards/formats/<формат>.js` (регистрируется через `PRP.cardFormats.register`), правило определения в `cards/formats/detect.js`, подключение в `index.html` между `formats/common.js` и `cards/import.js`. Рантайм читает только каноническую карточку; `source` во время работы не читается никогда.
- **Начало мира (FOUNDATION-B)** — правило сценария в `prism/assembler`, генерация первой сцены в `generation/service` (новый режим), кнопка в `ui/controllers/chat`.
- **Переписка (FOUNDATION-C/D)** — `js/messenger/{state,time,activity,initiative}.js` (чистые) и `messenger/service.js`; `app.js` и контроллеры только вызывают.
- **Мир, линзы, наложения** — `js/world/*`, **процедурные события** — `js/procedural/*`, **отношения** — `prism/relationship.js` (чистый) с подключением в `prism/service`.

## Review protocol

All PrismRP pull requests should be reviewed against:

`docs/PRISMRP_REVIEW_PROTOCOL.md`

The protocol defines protected invariants, architectural boundaries,
review severity, regression expectations, and final review verdict format.
