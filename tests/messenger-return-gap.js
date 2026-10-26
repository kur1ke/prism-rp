"use strict";
/* Long absence is measured between the last assistant message and the
   returning user's first new message, never from "now - new message".
   No hidden canon, mock clocks only; full Perchance model NOT RUN. */
const assert = require("node:assert/strict");
require("../js/chat/branch.js");
require("../js/messenger/time.js");
require("../js/messenger/environment.js");
const C = require("../js/messenger/conversation.js");
require("../js/prism/data.js");
const M = require("../js/prism/modes.js");
const at = (hh, mm) => Date.parse("2026-10-26T"+hh+":"+mm+":00Z");
function message(id, role, clock, text="Текст") {
  return { id, role, swipeIdx: 0, swipes: [{
    text, messengerAt: clock == null ? undefined : { at: new Date(clock).toISOString(), timeZone:"UTC" }
  }] };
}
const first = message("u1","user",at("08","12"),"Обещают доставить за час.");
const last = message("a1","assistant",at("08","14"),"Хорошо, будем ждать!");
const returned = message("u2","user",at("18","06"),"Я вернулся! Как ты тут?");
const path=[first,last,returned];
const view=C.derive(path,{now:at("18","06")+1000});
assert.equal(view.elapsedSinceLastMessage,"меньше минуты",
  "last-message elapsed is not the missed interval");
assert.ok(view.returnGap,"must recover prior 08:14 -> 18:06 gap");
assert.equal(view.returnGap.elapsedMs,(9*60+52)*60000);
assert.equal(view.returnGap.elapsedWords,"9 ч 52 мин");
assert.equal(view.returnGap.fromMessageId,"a1");
assert.equal(view.returnGap.returnMessageId,"u2");
const parts=M.messengerSections({world:{},conversation:view,temporal:{
  now:at("18","06")+1000,timeZone:"UTC",timeMode:"live"
}});
assert.match(parts.time,/ПАУЗА ДО ВОЗВРАЩЕНИЯ/);
assert.match(parts.time,/9 ч 52 мин/);
assert.match(parts.time,/08:14/);
assert.match(parts.time,/18:06/);
assert.match(parts.time,/не доказательство бездействия/);
assert.match(M.TEMPLATES.messenger.frame,/самостоятельно жить и принимать решения/);
console.log("PASS: return gap survives newly received 18:06 user message");
const next=message("u3","user",at("18","08"),"Кстати, как ты?");
const burst=C.derive(path.concat([next]),{now:at("18","08")});
assert.equal(burst.returnGap.returnMessageId,"u2",
  "consecutive user messages form one return, not multiple gaps");
const nextAssistant=message("a2","assistant",at("18","09"),"Привет!");
assert.equal(C.derive(path.concat([nextAssistant]),{now:at("18","09")}).returnGap,null,
  "the catch-up instruction must not repeat forever after an actual reply");
assert.equal(C.derive([first,last],{now:at("18","06")}).returnGap,null,
  "no user return, no return-gap instruction");
console.log("PASS: gap is one-shot for current user burst");
const otherSwipe=JSON.parse(JSON.stringify(returned));
otherSwipe.swipes.push({text:"Новый свайп без времени"});
otherSwipe.swipeIdx=1;
assert.equal(C.derive([first,last,otherSwipe],{now:at("18","06")}).returnGap,null);
const missing=JSON.parse(JSON.stringify(last));
delete missing.swipes[0].messengerAt;
assert.equal(C.derive([first,missing,returned],{now:at("18","06")}).returnGap,null);
const timeTravel=message("back","user",at("07","40"),"Я снова здесь");
assert.equal(C.derive([first,last,timeTravel],{now:at("18","06")}).returnGap,null);
assert.equal(C.derive(path,{now:at("07","50")}).returnGap,null,
  "a time jump in the future relative to the chosen manual clock cannot be used");
assert.equal(C.derive([first,message("a-short","assistant",at("17","50")),returned],{now:at("18","06")}).returnGap,null);
console.log("PASS: swipe, missing timestamps, time travel and short interval fail closed");
