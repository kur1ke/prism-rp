/* State photo continuity: source-scoped visible attire never becomes an
   invented full-body outfit or an unproven garment removal. */
"use strict";
const assert = require("node:assert/strict");
require("../js/prism/scene.js");
require("../js/chat/tree.js");
const T = require("../js/state/tracker.js");
const R = require("../js/state/resolver.js");
const INT = require("../js/state/interpreter.js");
require("../js/prism/modes.js");
const M = globalThis.PRP.prismModes;

const previousOutfit = ["белая блузка", "розовая юбка", "белые кружевные чулки", "светло-розовые слипоны"];
const nowVisible = ["белое кружевное белье", "белые кружевные чулки", "светло-розовые слипоны"];
const shot = "Фотография в зеркале. На ней белое кружевное белье, белые кружевные чулки и светло-розовые слипоны.";
const quote = "На ней белое кружевное белье, белые кружевные чулки и светло-розовые слипоны";
const initial = {
  schema: 1, kind: "initial-outfit",
  event: { actor: "char", field: "wear", action: "set", value: previousOutfit,
    certainty: "reported", evidence: "" }
};
function photo(id, shotText = shot, evidence = quote) {
  const text = "Подожди, я сделаю новое фото для тебя.";
  const event = { actor: "char", field: "wear", action: "add", value: nowVisible,
    certainty: "reported", evidence, evidenceType: "draw", visualScope: "current-self", drawIndex: 0 };
  return {
    id, chatId: "chat-1", role: "assistant", swipeIdx: 0,
    swipes: [{
      text, draws: [{ prompt: shotText, ratio: "1:1" }],
      stateEvents: [event],
      stateStatus: { status: "ok", sourceText: text, sourceDraw: shotText, sourceDrawIndex: 0 },
      sceneOps: [], stateCorrections: []
    }]
  };
}
function state(path) {
  const snap = T.fold({ mode: "messenger", path, initialWear: initial,
    charName: "Орихимэ", userName: "Пользователь" });
  return { state: snap, character: T.forCharacter(snap), latestPhotoWear: T.latestPhotoWear(path),
    latestAuthoredShot: T.latestAuthoredShot(path) };
}
function assertBase() {
  const origin = state([]);
  assert.deepEqual(origin.character.visualWear, previousOutfit);
  assert.equal(origin.latestPhotoWear, null);
  assert.equal(origin.state.actors.char.wearState.complete, true);
  console.log("PASS: initial complete outfit retained until later evidence");
}
function assertCurrentPhoto() {
  const first = photo("photo1"), t = state([first]);
  assert.deepEqual(t.latestPhotoWear.items, nowVisible);
  assert.equal(t.latestPhotoWear.messageId, "photo1");
  assert.deepEqual(t.character.visualWear.slice(0, 2), previousOutfit.slice(0, 2),
    "the photo cannot silently remove old layers");
  assert.deepEqual(t.state.actors.char.wearState.removed, []);
  const world = R.world({ visualWear: [], location: "дома" }, t);
  const text = M.messengerSections({ world, temporal: {}, conversation: {} }).place;
  assert.ok(text.includes("на последнем подтверждённом снимке"), text);
  assert.ok(text.includes("белое кружевное белье"), text);
  assert.ok(text.includes("ранее установленные вещи"), text);
  assert.ok(!text.includes("ПОЛНЫЙ перечень надетой сейчас одежды"),
    "the complete origin must not masquerade as the new shot");
  assert.equal(t.state.actors.char.wearState.removed.length, 0);
  console.log("PASS: recent verified photograph takes presentation priority without removal inference");
}
function assertSourceBound() {
  const first = photo("photo1");
  const alternate = JSON.parse(JSON.stringify(first));
  alternate.swipes.push({ text: "Другой свайп", draws: [], stateEvents: [], sceneOps: [] });
  alternate.swipeIdx = 1;
  assert.equal(T.latestPhotoWear([alternate]), null);
  const altered = photo("photo1", shot.replace("белое кружевное белье", "чёрное платье"));
  assert.equal(T.latestPhotoWear([altered]), null, "tampered evidence must not count");
  const statusChanged = photo("photo1");
  statusChanged.swipes[0].stateStatus.sourceDraw = "Другое фото";
  assert.equal(T.latestPhotoWear([statusChanged]), null);
  const corrected = photo("photo1");
  corrected.swipes[0].stateCorrections = [{ actor: "char", field: "wear",
    action: "set", value: ["синяя куртка"], certainty: "established", evidence: "" }];
  assert.equal(T.latestPhotoWear([corrected]), null, "manual correction wins");
  console.log("PASS: edited shot, alternate swipe and correction never inherit old photographed attire");
}
function assertNewerState() {
  const first = photo("photo1");
  const newer = { id: "m2", chatId: "chat-1", role: "assistant", swipeIdx: 0, swipes: [{
    text: "Я переоделась в синее платье.", sceneOps: [], draws: [],
    stateEvents: [{ actor: "char", field: "wear", action: "set",
      value: ["синее платье"], evidence: "переоделась в синее платье", certainty: "reported" }],
    stateCorrections: []
  }] };
  assert.equal(T.latestPhotoWear([first, newer]), null);
  const laterPhoto = photo("photo2");
  laterPhoto.swipes[0].stateEvents = [];
  laterPhoto.swipes[0].stateStatus.status = "no-changes";
  assert.equal(T.latestPhotoWear([first, laterPhoto]), null,
    "unverified newer shot must not reactivate a previous photograph");
  const user = { id: "u2", role: "user", swipeIdx: 0, swipes: [{
    text: "Я несу куртку.", stateEvents: [], sceneOps: []
  }] };
  assert.deepEqual(T.latestPhotoWear([first, user]).items, nowVisible);
  console.log("PASS: later wardrobe changes invalidate photo cue; unrelated conversation does not");
}
function assertUnverifiedDrawRemainsHistoryOnly() {
  const first = photo("photo-unverified");
  first.swipes[0].stateEvents = [];
  first.swipes[0].stateStatus.status = "partial";
  const before = state([]);
  const after = state([first]);
  assert.equal(after.latestPhotoWear, null, "zero events cannot establish a photographed wardrobe");
  assert.ok(after.latestAuthoredShot.text.includes("белое кружевное белье"));
  assert.deepEqual(after.character.visualWear, before.character.visualWear,
    "an unverified authored shot cannot rewrite initial physical state");
  const world = R.world({ visualWear: [] }, after);
  const txt = M.messengerSections({ world, conversation: {}, temporal: {} }).place;
  assert.ok(txt.includes("последний авторский [draw:]"), txt);
  assert.ok(txt.includes("не подтверждённая трекером"), txt);
  assert.ok(!txt.includes("ПОЛНЫЙ перечень надетой сейчас одежды"),
    "the last image must be distinguished from the historical origin outfit");
  const swapped = JSON.parse(JSON.stringify(first));
  swapped.swipes.push({ text: "другой ответ", draws: [], stateEvents: [], sceneOps: [] });
  swapped.swipeIdx = 1;
  assert.equal(T.latestAuthoredShot([swapped]), null, "a sibling swipe cannot leak its draw");
  const followed = { id: "normal", role: "user", swipeIdx: 0,
    swipes: [{ text: "Мне понравилось твоё фото", draws: [], sceneOps: [] }] };
  assert.equal(T.latestAuthoredShot([first, followed]).messageId, "photo-unverified");
  console.log("PASS: unverified author photo remains bounded, branch-scoped history, not canon");
}
assertBase();
assertCurrentPhoto();
assertSourceBound();
assertNewerState();
assertUnverifiedDrawRemainsHistoryOnly();
function assertInvalidFrameObjectsCannotInventWear() {
  const bad = Array.from({ length: 4 }, () => ({
    role: "onBody", evidence: "белое кружевное белье"
  }));
  const parsed = INT.parse(JSON.stringify({ events: [], frameObjects: bad, unresolved: [] }), {
    mode: "messenger", role: "assistant", text: "Фото", draw: shot,
    draws: [{ prompt: shot }], references: []
  });
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.events, []);
  assert.deepEqual(parsed.frameObjects, []);
  assert.equal(parsed.issues.length, 1, "four identical problems should be grouped in Debug");
  assert.ok(parsed.issues[0].includes("4 отклонено"), parsed.issues[0]);
  const withWear = INT.parse(JSON.stringify({ events: [{
    actor: "char", field: "wear", action: "add", value: nowVisible,
    certainty: "reported", evidence: quote, evidenceType: "draw", visualScope: "current-self"
  }], frameObjects: bad, unresolved: [] }), {
    mode: "messenger", role: "assistant", text: "Фото", draw: shot,
    draws: [{ prompt: shot }], references: []
  });
  assert.equal(withWear.events.length, 1, "invalid frame objects cannot delete an otherwise accepted wear event");
  assert.equal(withWear.frameObjects.length, 0);
  console.log("PASS: invalid frameObjects are reported once and never promoted into wear");
}
assertInvalidFrameObjectsCannotInventWear();
