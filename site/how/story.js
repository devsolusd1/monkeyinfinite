// Made-up trades, run through the real engine, and the engine's answers read back for the manual.
// No DOM here. Nothing in this file decides a word: step() in ../core/grammar.js does. What this
// file adds is the reading of the fingerprint next to each answer (which numbers were used, and
// what they come to), and every such reading is checked against what the engine really did.

import { step, initialState, digestOf, GRAMMAR, TYPE_NAMES, MAX_SENTENCE, startsWithVowelSound } from "../core/grammar.js";
import { LEX } from "../core/lexicon.js";
import { createSim } from "../core/sim.js";

export { GRAMMAR, TYPE_NAMES, MAX_SENTENCE, LEX, initialState };

// Four numbers of the fingerprint read as one big number, the way the engine reads them.
export const bigOf = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

// The two thresholds of a full stop. They are typed here because the engine does not export them;
// selfCheck() below compares them with what the engine does and the pages hide them if they differ.
export const BANG_UNDER = 26;   // number 17 of the fingerprint under this: "!"
export const PARA_UNDER = 36;   // number 18 under this: a new paragraph

// The list a kind of word is picked from, at this point of a sentence. This repeats the engine's
// own narrowing (one thing or many, "a" or "an"), so read() only keeps it when it agrees with the
// engine on the length of the list and on the word that was picked.
function listFor(type, st) {
  if (type === "DET") return [...LEX.DET_ANY, ...LEX.DET_SG, ...LEX.DET_PL];
  let list = LEX[type];
  if (type === "NOUN") list = st.num === "SG" ? LEX.NOUN_SG : st.num === "PL" ? LEX.NOUN_PL : [...LEX.NOUN_SG, ...LEX.NOUN_PL];
  if (list && st.art && (type === "NOUN" || type === "ADJ")) {
    const wantVowel = st.art === "an";
    list = list.filter((w) => startsWithVowelSound(w) === wantVowel);
  }
  return list || null;
}

// One trade read at one point of a sentence.
//   picks   one entry per choice the engine made: { type, options, roll, total, at, big, rollOk, ... }
//           and, for the choice that gave the word, { word, index, listSize, big2, placeOk, list }
//   ended   the choice that landed on "full stop", when the trade first closed a sentence
//   pick    the choice that gave the word (always the last one)
export function read(before, signature, blockhash) {
  const r = step(before, signature, blockhash);
  const bytes = digestOf(signature, blockhash);
  let st = before;
  const picks = r.trace.map((t, i) => {
    const at = i * 8;
    const p = { ...t, at, state: st, big: bigOf(bytes, at) };
    p.rollOk = p.big % t.total === t.roll;
    if (t.word == null) { st = initialState(); return p; }
    p.big2 = bigOf(bytes, at + 4);
    p.placeOk = p.big2 % t.listSize === t.index;
    let list = null;
    try { list = listFor(t.type, st); } catch (e) { list = null; }
    p.list = list && list.length === t.listSize && list[t.index] === t.word ? list : null;
    return p;
  });
  const punct = r.events.find((e) => e.kind === "punct") || null;
  const word = r.events.find((e) => e.kind === "word");
  const sound = picks.every((p) => p.rollOk && (p.word == null || p.placeOk));
  return { before, state: r.state, bytes, hex: r.digest, picks, pick: picks[picks.length - 1], ended: picks.length > 1 ? picks[0] : null, punct, word, sound };
}

// A run of made-up trades: each one read where the one before left the sentence.
// An item is { trade, n, sofar: [items of this sentence written before it], closed: [the sentence
// this trade ended, if it ended one], ...read() }.
// cheap: the pages that only show words do not need a wallet or an amount, and any text will do as
// a signature; those stories skip the rehearsal's trade maker, which is the slow part.
export function createStory(seed, { cheap = false } = {}) {
  const sim = cheap ? null : createSim({ seed, startTime: 0 });
  let state = initialState();
  let sentence = [];
  const items = [];
  function next() {
    const n = items.length + 1;
    const trade = sim ? sim.next() : { signature: `${seed} trade ${n}`, blockhash: `${seed} block ${n}`, simulated: true };
    const res = read(state, trade.signature, trade.blockhash);
    const item = { trade, n, sofar: res.punct ? [] : sentence.slice(), closed: res.punct ? sentence.slice() : null, ...res };
    state = res.state;
    if (res.punct) sentence = [];
    sentence.push(item);
    items.push(item);
    return item;
  }
  return { next, items, get state() { return state; } };
}

// Does this page still read the fingerprint the way the engine does? A long rehearsal is run in
// the background, a slice at a time, and compared; done({ read, mark, paragraph, question, max }) gets the verdict.
export function selfCheck(done, { trades = 3000, slice = 250 } = {}) {
  const story = createStory("manual-check", { cheap: true });
  const ok = { read: true, mark: true, paragraph: true, question: true, max: true };
  let n = 0;
  (function run() {
    for (let i = 0; i < slice && n < trades; i++, n++) {
      const it = story.next();
      if (!it.sound) ok.read = false;
      // two things the pages say in words: a question takes no joining word, and a sentence that
      // is long enough and could stop is offered nothing but the full stop
      const kinds = it.picks[0].options.map((o) => o.type);
      if (it.before.q && kinds.includes("CONJ")) ok.question = false;
      if (it.before.len >= MAX_SENTENCE && kinds.includes("END") && kinds.length > 1) ok.max = false;
      if (!it.punct) continue;
      if (it.punct.mark !== "?" && (it.punct.mark === "!") !== (it.bytes[16] < BANG_UNDER)) ok.mark = false;
      if (it.punct.paragraph !== (it.bytes[17] < PARA_UNDER)) ok.paragraph = false;
    }
    if (n < trades) setTimeout(run, 0); else done(ok);
  })();
}

// The shape of a sentence, told from the kind of its first word (after an opening cry, the second).
const SHAPE_OF = { DET: "statement", PRON_S: "statement", QMODAL: "question", V_BASE_T: "command", V_BASE_I: "command" };
export function shapeOf(items) {
  const cry = items[0]?.word.type === "INTERJ";
  const lead = items[cry ? 1 : 0];
  return { cry, shape: lead ? SHAPE_OF[lead.word.type] || null : null };
}

// Whole sentences from a rehearsal, sorted by shape, for the page that shows the three shapes.
// plain[shape] opens straight away, cry[shape] opens with a cry. commas: the words the engine put
// a comma before, and whether it put one after a cry.
export function findSentences({ seed = "manual-shapes", trades = 2400, min = 3, max = 6, each = 6 } = {}) {
  const story = createStory(seed, { cheap: true });
  const mk = () => ({ statement: [], question: [], command: [] });
  const found = { plain: mk(), cry: mk(), commas: { before: [], afterCry: false } };
  for (let i = 0; i < trades; i++) {
    const it = story.next();
    if (it.word.commaBefore && !found.commas.before.includes(it.word.word)) found.commas.before.push(it.word.word);
    if (it.word.commaAfter && it.word.type === "INTERJ") found.commas.afterCry = true;
    if (!it.closed || it.closed.length < min || it.closed.length > max) continue;
    const { cry, shape } = shapeOf(it.closed);
    if (!shape) continue;
    const list = (cry ? found.cry : found.plain)[shape];
    if (list.length < each) list.push({ items: it.closed, mark: it.punct.mark, shape, cry });
  }
  // the shortest first: the first examples a visitor sees are the plainest
  for (const group of [found.plain, found.cry]) for (const key in group) group[key].sort((a, b) => a.items.length - b.items.length);
  return found;
}

// Places in a sentence, for "try it": real states of the engine, reached with made-up trades, each
// with the words that led there. `want` maps a name to a test on (state, words so far).
export function findStands(want, { seed = "manual-stands", trades = 4000 } = {}) {
  const story = createStory(seed, { cheap: true });
  const found = {};
  let left = Object.keys(want).length;
  for (let i = 0; i < trades && left; i++) {
    const it = story.next();
    const words = [...it.sofar, it];
    for (const name in want) {
      if (found[name] || !want[name](it.state, words)) continue;
      found[name] = { state: it.state, words };
      left--;
    }
  }
  return found;
}

// The kinds of word allowed at a point of a sentence, as the engine lists them. step() is asked
// with any trade at all: the allowed kinds do not depend on the trade, only the pick does.
export function allowedAt(state) {
  const t = step(state, "any", "trade").trace[0];
  return { options: t.options, total: t.total };
}

// Walk the grammar: the state the engine is in after a word of this kind. Found by trying made-up
// trades until one lands on the kind, so the next state is the engine's own and none of it is typed here.
export function after(state, type, { seed = "manual-walk", tries = 20000 } = {}) {
  if (type === "END") return initialState();
  for (let i = 0; i < tries; i++) {
    const r = step(state, `${seed}|${i}`, type);
    if (r.trace[0].type === type) return r.state;
  }
  return null;
}

// How many entries the lists hold, and how many different spellings that is.
export function vocabulary() {
  const all = Object.values(LEX).flat();
  return { entries: all.length, spellings: new Set(all).size, lists: Object.keys(LEX).length, twoWord: all.filter((w) => w.includes(" ")) };
}

// Articles sit in three lists and nouns in two. Are they read as one list, one after the other, as
// listFor() above assumes? Two made-up picks are checked against the engine: an article, and a noun
// after an article that leaves the number open.
export function joinedLists() {
  const out = { articles: false, nouns: false };
  const start = initialState();
  for (let i = 0; i < 400 && !(out.articles && out.nouns); i++) {
    const a = read(start, `joined ${i}`, "articles");
    if (a.pick.type !== "DET") continue;
    if (a.pick.list) out.articles = true;
    if (a.state.num !== "ANY" || a.state.art) continue;
    for (let j = 0; j < 40 && !out.nouns; j++) {
      const b = read(a.state, `joined ${i} ${j}`, "nouns");
      if (b.pick.type === "NOUN" && b.pick.list && b.pick.listSize === LEX.NOUN_SG.length + LEX.NOUN_PL.length) out.nouns = true;
    }
  }
  return out;
}
