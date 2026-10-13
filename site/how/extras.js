// One press away, for the curious: the word lists, and the map of what may follow what.
// Both are boxes over the page (a <dialog>), built the first time they are opened. The lists come
// straight from ../core/lexicon.js and the map from the engine's own grammar.

import * as S from "./story.js";
import { h, fill, art, fmt, kindName, kindLabel } from "./parts.js";

// Plain names for the lists of the vocabulary (the keys of LEX). A list that is not named here
// shows under its own key.
const LIST_NAMES = {
  DET_ANY: "articles, for one thing or many", DET_SG: "articles, for one thing", DET_PL: "articles, for many",
  ADJ: "adjectives", NOUN_SG: "nouns, one thing", NOUN_PL: "nouns, many",
  PRON_S: "pronouns that act", PRON_O: "pronouns that are acted on",
  V_PAST_T: "verbs with an object, past", V_PAST_I: "verbs on their own, past",
  V_BASE_T: "verbs with an object, plain", V_BASE_I: "verbs on their own, plain",
  MODAL: "helper verbs", QMODAL: "question words", INTERJ: "exclamations",
  PREP: "prepositions", ADV: "adverbs", CONJ: "joining words",
};

// Plain names for the places of the grammar (the keys of GRAMMAR). A place that is not named here
// is named after the kinds of word that lead to it.
const PLACE_NAMES = {
  START: "At the start of a sentence", START2: "After an opening cry", CLAUSE: "After a joining word",
  "DET:S": "After an article, in the subject", "ADJ:S": "After an adjective, in the subject", SUBJ: "After the subject",
  MODAL: "After a helper verb, or the subject of a question", Q_SUBJ: "After a question word",
  "DET:Q": "After an article, in a question", "ADJ:Q": "After an adjective, in a question",
  VT: "After a verb that takes an object", "DET:O": "After an article, in the object", "ADJ:O": "After an adjective, in the object",
  DONE: "After a complete sentence", DONE_ADV: "After a closing adverb", PREP: "After a preposition",
  "DET:P": "After an article that follows a preposition", "ADJ:P": "After an adjective that follows a preposition",
  DONE_P: "After a preposition and its noun",
};
function placeName(id) {
  if (PLACE_NAMES[id]) return PLACE_NAMES[id];
  const into = new Set();
  for (const options of Object.values(S.GRAMMAR)) for (const [type, , next] of options) if (next === id) into.add(kindName(type));
  return into.size ? `After ${[...into].join(" or ")}` : id;
}

function shell(dialog, title) {
  const close = h("button", { class: "btn icon", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, art("cross"));
  const body = h("div", { class: "box-body", tabindex: "-1" });
  fill(dialog, h("div", { class: "box-head" }, h("h2", { id: `${dialog.id}-title`, text: title }), close), body);
  // a press on the veil around the box closes it
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  return body;
}

// ---------------------------------------------------------------------------------------------
// The word lists, one at a time, with two arrows, the way a game picks an option.

function createLists(dialog) {
  let body = null, bar = null, at = 0, own = null;
  const keys = Object.keys(S.LEX);
  const voc = S.vocabulary();
  let joined = null;

  // What is on show: the very list a word came from (when the page asked with one), or list `at`.
  function entries() {
    const out = keys.map((key) => ({ key, name: LIST_NAMES[key] || key, words: S.LEX[key], lit: -1 }));
    if (own) out.unshift({ key: "own", name: `the ${kindName(own.type)} list “${own.word}” came from`, words: own.list, lit: own.index });
    return out;
  }

  function note(entry) {
    joined ??= S.joinedLists();
    if (entry.key === "own") return "This is the list as it stood for that word. The lit one is the word the trade landed on.";
    if (entry.key.startsWith("DET") && joined.articles) return "The three lists of articles are read as one, one after the other.";
    if (entry.key.startsWith("NOUN") && joined.nouns) return "When one thing or many would both fit, the two lists of nouns are read as one, this order.";
    return "";
  }

  function draw() {
    const all = entries();
    at = (at + all.length) % all.length;
    const e = all[at];
    const picker = h("div", { class: "picker" },
      h("button", { class: "btn arrow", type: "button", "aria-label": "The list before", onclick: () => { at--; draw(); } }, art("left")),
      h("div", { class: "picker-name", "aria-live": "polite" }, e.name, h("span", { class: "picker-sub", text: `list ${at + 1} of ${all.length}, ${fmt(e.words.length)} ${e.words.length === 1 ? "entry" : "entries"}` })),
      h("button", { class: "btn arrow", type: "button", "aria-label": "The list after", onclick: () => { at++; draw(); } }, art("right")));
    const words = h("ol", { class: "words" }, e.words.map((w, i) => h("li", {}, i === e.lit ? h("b", { class: "slot", text: w }) : w)));
    const said = note(e);
    const focused = document.activeElement?.getAttribute?.("aria-label");
    // the two arrows stay put over the list; the list scrolls under them
    fill(bar, picker);
    fill(body,
      h("p", { text: `${fmt(voc.entries)} entries in ${voc.lists} lists, fixed and public. The small number is the place on the list.${voc.twoWord.length ? ` A few entries are two words, like “${voc.twoWord[0]}”; each counts as one.` : ""}` }),
      said ? h("p", { class: "cap", text: said }) : null,
      words);
    // the arrows are drawn again on every press: keep the focus on the one that was pressed
    if (focused) picker.querySelector(`[aria-label="${focused}"]`)?.focus();
    body.scrollTop = 0;
    words.querySelector(".slot")?.scrollIntoView({ block: "center" });
  }

  function build() {
    body = shell(dialog, "My word lists");
    bar = h("div", { class: "box-bar" });
    body.before(bar);
    // the arrow keys leaf through the lists, as they leaf through the manual
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { at--; draw(); }
      if (e.key === "ArrowRight") { at++; draw(); }
    });
  }

  return function open(item) {
    if (!body) build();
    const pick = item?.pick;
    own = pick?.list ? pick : null;
    at = 0;
    if (!own && pick) at = Math.max(0, keys.findIndex((k) => k === pick.type || k.startsWith(pick.type === "DET" ? "DET" : pick.type === "NOUN" ? "NOUN" : "\0")));
    dialog.showModal(); // first, so that the list can be scrolled to the word
    draw();
  };
}

// ---------------------------------------------------------------------------------------------
// What may follow what: a walk through the grammar, one kind of word at a time, and under it the
// whole map. The kinds on offer and the place each leads to are asked of the engine (story.js).

function createMap(dialog) {
  let body = null, state = S.initialState(), trail = [];
  const walk = h("div", { class: "walk" });

  const menuOf = (options, onPick) => h("ol", { class: "menu" }, options.map((o) => h("li", {},
    h("button", { class: "step-to", type: "button", onclick: () => onPick(o.type) },
      h("span", { class: "cur" }, art("pick")), h("span", { text: kindLabel(o.type) }), h("span", { class: "lead" }), h("b", { class: "fig", text: String(o.weight) })))));

  function drawWalk(focus = false) {
    const { options } = S.allowedAt(state);
    const ended = trail[trail.length - 1] === "END";
    fill(walk, 
      h("div", { class: "crumbs" }, trail.length
        ? trail.map((t) => h("span", { class: t === "END" ? "crumb end" : "crumb", text: kindName(t) }))
        : h("span", { class: "cap", text: "Press a kind of word and I show what may come after it." })),
      h("p", { text: ended ? "The sentence is closed. The next one starts with:" : `${placeName(state.state)}:` }),
      menuOf(options, (type) => {
        const next = S.after(state, type);
        if (!next) return;
        if (ended) trail = [];
        trail.push(type);
        state = next;
        drawWalk(true);
      }),
      trail.length ? h("div", {}, h("button", { class: "act", type: "button", onclick: () => { state = S.initialState(); trail = []; drawWalk(true); } }, art("pick"), h("span", { text: "Start again" }))) : null,
    );
    if (focus) walk.querySelector(".step-to")?.focus();
  }

  function atlas() {
    const rows = Object.entries(S.GRAMMAR).map(([id, options]) => h("div", { class: "atlas-row" },
      h("span", { class: "cap", text: placeName(id) }),
      h("div", { class: "pills" }, options.map(([type, weight]) => h("span", { class: "pill" }, kindLabel(type), h("b", { class: "fig", text: String(weight) }))))));
    return h("div", { class: "atlas" }, rows);
  }

  return function open() {
    if (!body) {
      body = shell(dialog, "What may follow what");
      body.append(
        walk,
        h("h3", { text: "The whole map" }),
        h("p", { class: "cap", text: `Each place in a sentence, and the kinds of word that may come next with their shares. In a question the joining word is left out, and after ${S.MAX_SENTENCE} words only the full stop is left.` }),
        atlas());
    }
    state = S.initialState();
    trail = [];
    drawWalk();
    dialog.showModal();
  };
}

export function createExtras() {
  return {
    openLists: createLists(document.getElementById("box-lists")),
    openMap: createMap(document.getElementById("box-map")),
  };
}
