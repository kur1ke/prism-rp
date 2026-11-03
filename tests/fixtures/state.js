"use strict";
// Typed state fixture shared by context/image tests. No narrative/protocol parser.
module.exports = function fixtureState(events = [], names = {char:"Химэ",user:"Лёня"}) {
 const T = globalThis.PRP.stateTracker;
 let state = T.empty(names);
 for (const e of events) state = T.apply(state,e,{role:"manual",mode:"rp"});
 return Object.assign(state,T.view(state));
};
