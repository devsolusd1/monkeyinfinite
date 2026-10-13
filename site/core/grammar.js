// One trade writes one word. The trade's digest first picks a word type among the types allowed after
// the previous word, then a word of that type. When a sentence is complete the grammar may end it,
// and then the same trade opens the next sentence. No DOM here: this runs the same in Node.

import { LEX as DEFAULT_LEX, SOUNDS_LIKE_CONSONANT, SOUNDS_LIKE_VOWEL } from "./lexicon.js";
import { sha256Text, toHex } from "./sha256.js";

// state -> [type, weight, next state]. Three shapes: statement, question, command.
const OPEN = [["DET", 40, "DET:S"], ["PRON_S", 32, "SUBJ"], ["QMODAL", 13, "Q_SUBJ"], ["V_BASE_T", 6, "VT"], ["V_BASE_I", 3, "DONE"]];
export const GRAMMAR = {
  START: [...OPEN, ["INTERJ", 6, "START2"]],
  START2: OPEN,
  CLAUSE: [["DET", 55, "DET:S"], ["PRON_S", 45, "SUBJ"]],
  "DET:S": [["ADJ", 40, "ADJ:S"], ["NOUN", 60, "SUBJ"]],
  "ADJ:S": [["NOUN", 100, "SUBJ"]],
  SUBJ: [["V_PAST_T", 38, "VT"], ["V_PAST_I", 24, "DONE"], ["MODAL", 38, "MODAL"]],
  MODAL: [["V_BASE_T", 62, "VT"], ["V_BASE_I", 38, "DONE"]],
  Q_SUBJ: [["PRON_S", 55, "MODAL"], ["DET", 45, "DET:Q"]],
  "DET:Q": [["ADJ", 35, "ADJ:Q"], ["NOUN", 65, "MODAL"]],
  "ADJ:Q": [["NOUN", 100, "MODAL"]],
  VT: [["DET", 62, "DET:O"], ["PRON_O", 38, "DONE"]],
  "DET:O": [["ADJ", 40, "ADJ:O"], ["NOUN", 60, "DONE"]],
  "ADJ:O": [["NOUN", 100, "DONE"]],
  DONE: [["PREP", 28, "PREP"], ["ADV", 14, "DONE_ADV"], ["CONJ", 20, "CLAUSE"], ["END", 38, "START"]],
  DONE_ADV: [["CONJ", 30, "CLAUSE"], ["END", 70, "START"]],
  PREP: [["DET", 70, "DET:P"], ["PRON_O", 30, "DONE_P"]],
  "DET:P": [["ADJ", 35, "ADJ:P"], ["NOUN", 65, "DONE_P"]],
  "ADJ:P": [["NOUN", 100, "DONE_P"]],
  DONE_P: [["ADV", 15, "DONE_ADV"], ["CONJ", 25, "CLAUSE"], ["END", 60, "START"]],
};
const COMPLETE = new Set(["DONE", "DONE_ADV", "DONE_P"]);
const COMMA_BEFORE = new Set(["and", "but", "for", "yet"]);
export const MAX_SENTENCE = 20;

// Plain names for the word types, for anything shown to a visitor.
export const TYPE_NAMES = {
  DET: "article", ADJ: "adjective", NOUN: "noun", PRON_S: "pronoun", PRON_O: "pronoun",
  V_PAST_T: "verb", V_PAST_I: "verb", V_BASE_T: "verb", V_BASE_I: "verb", MODAL: "helper verb",
  QMODAL: "question word", INTERJ: "exclamation", PREP: "preposition", ADV: "adverb", CONJ: "joining word",
  END: "full stop",
};

const consonantSound = new Set(SOUNDS_LIKE_CONSONANT), vowelSound = new Set(SOUNDS_LIKE_VOWEL);
export const startsWithVowelSound = (w) => vowelSound.has(w) || (/^[aeiou]/i.test(w) && !consonantSound.has(w));

const u32 = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

export const initialState = () => ({ state: "START", num: "ANY", art: null, q: false, len: 0 });

// The digest of a trade: SHA-256 of "<transaction signature>:<hash of the block it landed in>".
export const digestOf = (signature, blockhash) => sha256Text(`${signature}:${blockhash}`);

function wordList(type, st, lex) {
  if (type === "DET") return [...lex.DET_ANY, ...lex.DET_SG, ...lex.DET_PL];
  let list = lex[type];
  if (type === "NOUN") list = st.num === "SG" ? lex.NOUN_SG : st.num === "PL" ? lex.NOUN_PL : [...lex.NOUN_SG, ...lex.NOUN_PL];
  if (st.art && (type === "NOUN" || type === "ADJ")) {
    const wantVowel = st.art === "an";
    list = list.filter((w) => startsWithVowelSound(w) === wantVowel);
  }
  return list;
}

// step(state, signature, blockhash) -> { events, state, digest, trace }
// events: at most one { kind: "punct", mark, paragraph } followed by exactly one
//         { kind: "word", word, text, type, commaBefore, commaAfter, sentenceStart }
// trace:  how the digest was read, one entry per choice made.
export function step(prev, signature, blockhash, lex = DEFAULT_LEX) {
  const d = digestOf(signature, blockhash);
  const events = [], trace = [];
  let st = { ...prev }, off = 0;
  for (;;) {
    let options = GRAMMAR[st.state];
    if (st.q) options = options.filter((o) => o[0] !== "CONJ");
    if (COMPLETE.has(st.state) && st.len >= MAX_SENTENCE) options = options.filter((o) => o[0] === "END");
    const total = options.reduce((s, o) => s + o[1], 0);
    const roll = u32(d, off) % total;
    let r = roll, chosen = options[0];
    for (const o of options) { if (r < o[1]) { chosen = o; break; } r -= o[1]; }
    const [type, , next] = chosen;
    const choice = { from: st.state, options: options.map(([t, w]) => ({ type: t, weight: w })), roll, total, type };

    if (type === "END") {
      const mark = st.q ? "?" : d[16] < 26 ? "!" : ".";
      events.push({ kind: "punct", mark, paragraph: d[17] < 36 });
      trace.push({ ...choice, mark });
      st = initialState();
      off = 8;
      continue;
    }

    const list = wordList(type, st, lex);
    const index = u32(d, off + 4) % list.length;
    const word = list[index];
    const sentenceStart = st.len === 0;
    let { num, art, q } = st;
    if (type === "DET") {
      num = lex.DET_SG.includes(word) ? "SG" : lex.DET_PL.includes(word) ? "PL" : "ANY";
      art = word === "a" || word === "an" ? word : null;
    } else if (type === "ADJ" || type === "NOUN") art = null;
    if (type === "NOUN") num = "ANY";
    if (type === "QMODAL") q = true;

    events.push({
      kind: "word", word, type, sentenceStart,
      text: sentenceStart ? word[0].toUpperCase() + word.slice(1) : word,
      commaBefore: type === "CONJ" && COMMA_BEFORE.has(word),
      commaAfter: type === "INTERJ",
    });
    trace.push({ ...choice, word, index, listSize: list.length });
    return { events, state: { state: next, num, art, q, len: st.len + 1 }, digest: toHex(d), trace };
  }
}
