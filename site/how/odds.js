// What is the chance that the monkey's next trades write a given run of words?
//
// The engine reads the fingerprint of a trade four numbers at a time, as one big number below 2^32.
// The first big number picks the kind of word (its remainder against the sum of the shares allowed at
// that point), the second the place in that kind's list (its remainder against the length of the list).
// When the first lands on the full stop, the same trade opens the next sentence with the third and the
// fourth. So, taking every fingerprint to be as likely as any other, the chance of a word is a count
// of big numbers out of 2^32, and the chance of a run is a sum over every way the grammar can write
// it: a word can belong to two kinds ("her", "grave", "for"), and a full stop can hide between two words.
// The sums are done in whole numbers (BigInt), so the smallest chance is as exact as the largest.
//
// Nothing here decides a word. The kinds allowed at a point, and their shares, are asked from step()
// itself. What this file repeats from ../core/grammar.js, because the engine does not export it, is:
// the list a kind is read from (listFor), the state a word leaves the sentence in (afterWord), and
// which numbers of the fingerprint make which pick (landing, moves). scripts/odds-check.mjs holds
// all three against the engine. No DOM here: this runs the same in Node.

import { GRAMMAR, TYPE_NAMES, MAX_SENTENCE, step, initialState, startsWithVowelSound } from "../core/grammar.js";
import { LEX } from "../core/lexicon.js";

// ---------------------------------------------------------------------------------------------
// The vocabulary.

const KIND_OF_LIST = (key) => (key.startsWith("DET_") ? "DET" : key.startsWith("NOUN_") ? "NOUN" : key);
const KINDS = new Map();   // word -> the kinds it can be
for (const [key, list] of Object.entries(LEX)) for (const w of list) {
  const kinds = KINDS.get(w) || [];
  if (!kinds.includes(KIND_OF_LIST(key))) kinds.push(KIND_OF_LIST(key));
  KINDS.set(w, kinds);
}
const SORTED = [...KINDS.keys()].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
const AS_WRITTEN = new Map(SORTED.map((w) => [w.toLowerCase(), w]));   // "i" -> "I", "o" -> "O"
const LONGEST_ENTRY = Math.max(...SORTED.map((w) => w.split(" ").length));

// A word the way the monkey writes it inside a sentence: lower case, except "I" and "O".
const tidy = (w) => { const t = String(w).trim().replace(/\s+/g, " ").toLowerCase(); return AS_WRITTEN.get(t) || t; };

// Every word the monkey has, as he writes it ("shall not" and "in vain" are one word each).
export function vocabulary() { return new Set(SORTED); }

// A typed text cut into his words: punctuation dropped, capitals undone, and the entries of two
// words ("shall not", "at last") put back together, since one trade writes them as one word.
export function wordsOf(text) {
  const bits = String(text).replace(/[.,!?;:"“”()…—–]+/g, " ").replace(/’/g, "'").split(/\s+/).filter(Boolean).map(tidy);
  const out = [];
  for (let i = 0; i < bits.length;) {
    let n = Math.min(LONGEST_ENTRY, bits.length - i);
    while (n > 1 && !KINDS.has(bits.slice(i, i + n).join(" "))) n--;
    out.push(bits.slice(i, i + n).join(" "));
    i += n;
  }
  return out;
}

// Words of his that start with these letters, in alphabetical order, for an input box.
// With { after: [words] } only the ones that may come next after that run are kept.
export function suggest(prefix, limit = 8, { after = null, from = "start" } = {}) {
  const p = String(prefix ?? "").replace(/\s+/g, " ").trimStart().toLowerCase();
  if (!p) return [];
  let pool = SORTED.filter((w) => w.toLowerCase().startsWith(p));
  if (after) {
    const walk = forward(runOf(after), startOf(from), true);
    if (walk.stuck) return [];
    const states = [...walk.live.values()].map((node) => node.st);
    pool = pool.filter((w) => states.some((st) => moves(st, w, true).length));
  }
  return pool.slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------------------------
// One point of a sentence: what the engine allows there, and what a word does to it.

const keyOf = (st) => `${st.state}|${st.num}|${st.art}|${st.q ? 1 : 0}|${st.len}`;

// The kinds allowed at this point with their shares, as the engine lists them: step() is asked with
// any trade at all, because the allowed kinds do not depend on the trade, only the pick does.
// lo is where a kind's share begins on the bar, next the place of the grammar a word of that kind leads to.
const asked = new Map();
function allowedAt(st) {
  const key = keyOf(st);
  let a = asked.get(key);
  if (!a) {
    const t = step(st, "odds", "any trade").trace[0];
    let lo = 0;
    const options = t.options.map(({ type, weight }) => {
      const o = { type, weight, lo, next: (GRAMMAR[st.state].find((g) => g[0] === type) || [])[2] };
      lo += weight;
      return o;
    });
    a = { options, total: t.total, kinds: t.options.map(({ type, weight }) => ({ type, name: TYPE_NAMES[type], weight })) };
    asked.set(key, a);
  }
  return a;
}

// The list a kind of word is picked from at this point (repeats wordList() of the engine): articles
// and nouns are read as their lists one after the other, a noun keeps to one thing or to many after
// an article that says so, and after "a" or "an" only the right sounds are left.
const lists = new Map();
function listFor(type, st) {
  const narrowed = type === "NOUN" || type === "ADJ";
  const key = `${type}|${type === "NOUN" ? st.num : ""}|${narrowed ? st.art : ""}`;
  let entry = lists.get(key);
  if (!entry) {
    let list = LEX[type];
    if (type === "DET") list = [...LEX.DET_ANY, ...LEX.DET_SG, ...LEX.DET_PL];
    if (type === "NOUN") list = st.num === "SG" ? LEX.NOUN_SG : st.num === "PL" ? LEX.NOUN_PL : [...LEX.NOUN_SG, ...LEX.NOUN_PL];
    if (st.art && narrowed) { const wantVowel = st.art === "an"; list = list.filter((w) => startsWithVowelSound(w) === wantVowel); }
    const places = new Map();
    (list || []).forEach((w, i) => { if (places.has(w)) places.get(w).push(i); else places.set(w, [i]); });
    entry = { size: (list || []).length, places };
    lists.set(key, entry);
  }
  return entry;
}

// The state of the sentence after a word (repeats the end of step() in the engine).
function afterWord(st, type, word, next) {
  let { num, art, q } = st;
  if (type === "DET") {
    num = LEX.DET_SG.includes(word) ? "SG" : LEX.DET_PL.includes(word) ? "PL" : "ANY";
    art = word === "a" || word === "an" ? word : null;
  } else if (type === "ADJ" || type === "NOUN") art = null;
  if (type === "NOUN") num = "ANY";
  if (type === "QMODAL") q = true;
  return { state: next, num, art, q, len: st.len + 1 };
}

// How many of the 2^32 big numbers leave a remainder from lo up to (not including) hi. 2^32 is not
// a multiple of 100, nor of the length of a list, so the first few remainders get one number more
// than the rest. `plain` forgets that: a kind gets its share and a word its one place in the list,
// which is the figure a visitor gets multiplying the shares by hand.
const TWO32 = 4294967296;
function landing(lo, hi, modulus, plain) {
  if (plain) return [BigInt(hi - lo), BigInt(modulus)];
  const each = Math.floor(TWO32 / modulus), more = TWO32 % modulus;
  return [BigInt((hi - lo) * each + Math.min(hi, more) - Math.min(lo, more)), BigInt(TWO32)];
}

// Every way one trade can write this word from this state: straight away, or after a full stop
// (then the kind and the place are read further along the fingerprint, from the start of a sentence).
// Each way carries its chance as a fraction num / den.
function moves(st, word, plain) {
  const out = [];
  const pick = (at, where, o, stop) => {
    const list = listFor(o.type, at), places = list.places.get(word);
    if (!places) return;
    const kind = landing(o.lo, o.lo + o.weight, where.total, plain);
    let num = kind[0], den = kind[1], hits = 0n;
    for (const i of places) hits += landing(i, i + 1, list.size, plain)[0];
    num *= hits; den *= landing(0, 1, list.size, plain)[1];
    if (stop) { num *= stop.chance[0]; den *= stop.chance[1]; }
    out.push({
      to: afterWord(at, o.type, word, o.next), num, den,
      type: o.type, weight: o.weight, total: where.total, kinds: where.kinds, listSize: list.size, copies: places.length,
      place: at.state, stop: stop && { weight: stop.weight, total: stop.total, kinds: stop.kinds },
    });
  };
  const here = allowedAt(st);
  for (const o of here.options) {
    if (o.type !== "END") { pick(st, here, o, null); continue; }
    const fresh = initialState(), opening = allowedAt(fresh);
    const stop = { weight: o.weight, total: here.total, kinds: here.kinds, chance: landing(o.lo, o.lo + o.weight, here.total, plain) };
    for (const o2 of opening.options) if (o2.type !== "END") pick(fresh, opening, o2, stop);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The sum over every path. `live` holds every state the sentence can be in after the words so far,
// each with the chance of having got there, as a whole number over one common denominator.

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => (a / gcd(a, b)) * b;

function forward(run, start, plain) {
  let live = new Map([[keyOf(start), { st: start, n: 1n }]]);
  const layers = [];
  let den = 1n, mass = 1n;   // the chance of the words so far is mass / den
  for (const word of run) {
    const found = [];
    for (const [key, node] of live) for (const m of moves(node.st, word, plain)) found.push({ ...m, fromKey: key, n: node.n });
    if (!found.length) return { layers, live, den, mass, stuck: true };
    const common = found.reduce((l, m) => lcm(l, m.den), 1n);
    const next = new Map();
    let total = 0n;
    for (const m of found) {
      m.flow = m.n * m.num * (common / m.den);
      m.toKey = keyOf(m.to);
      const node = next.get(m.toKey);
      if (node) node.n += m.flow; else next.set(m.toKey, { st: m.to, n: m.flow });
      total += m.flow;
    }
    layers.push({ word, found, total, before: mass, common });
    live = next; den *= common; mass = total;
  }
  return { layers, live, den, mass, stuck: false };
}

// ---------------------------------------------------------------------------------------------
// Numbers a page can show.

function log10Big(x) {
  const hex = x.toString(16), keep = 14;
  return hex.length <= keep ? Math.log10(Number(x)) : Math.log10(parseInt(hex.slice(0, keep), 16)) + (hex.length - keep) * Math.log10(16);
}

// "1 in N" for a chance of num / den: N to the nearest whole number with every digit when it is
// below 10^15 (one decimal is kept under 100: "37.5"), otherwise two digits and a power of ten.
function oneInText(num, den) {
  const tenths = (den * 20n + num) / (num * 2n);
  if (tenths < 1000n && tenths % 10n) return `${tenths / 10n}.${tenths % 10n}`;
  const digits = ((den * 2n + num) / (num * 2n)).toString();
  if (digits.length <= 15) return digits.replace(/\B(?=(\d{3})+$)/g, ",");
  let two = Math.round(Number(digits.slice(0, 4)) / 100), power = digits.length - 1;
  if (two === 100) { two = 10; power++; }
  return `${Math.floor(two / 10)}.${two % 10} x 10^${power}`;
}

function chanceOf(num, den) {
  const log10 = log10Big(num) - log10Big(den);
  return { chance: num === den ? 1 : 10 ** log10, log10, oneIn: oneInText(num, den) };
}

// One entry per word. A word can have been written in more than one way (routes); the way that
// carries most of its chance, among those the rest of the run can still follow, is laid flat on the entry.
function describe(layers, alive) {
  const steps = new Array(layers.length);
  for (let k = layers.length - 1; k >= 0; k--) {
    const L = layers[k], routes = new Map(), back = new Set();
    for (const m of L.found) {
      const on = alive.has(m.toKey);
      if (on) back.add(m.fromKey);
      const id = [m.stop ? `${m.stop.weight}/${m.stop.total}` : "", m.place, m.type, m.total, m.listSize].join("|");
      const r = routes.get(id);
      if (r) { r.flow += m.flow; r.leadsOn = r.leadsOn || on; continue; }
      routes.set(id, {
        kind: m.type, name: TYPE_NAMES[m.type], weight: m.weight, total: m.total, kinds: m.kinds,
        listSize: m.listSize, copies: m.copies, stop: m.stop, place: m.place, leadsOn: on, flow: m.flow,
      });
    }
    alive = back;
    const list = [...routes.values()]
      .sort((a, b) => (b.leadsOn - a.leadsOn) || (a.flow < b.flow ? 1 : a.flow > b.flow ? -1 : 0))
      .map(({ flow, ...r }) => ({ ...r, part: flow === L.total ? 1 : 10 ** (log10Big(flow) - log10Big(L.total)) }));
    const { part, leadsOn, ...main } = list[0];
    steps[k] = { word: L.word, ...main, ...chanceOf(L.total, L.before * L.common), routes: list };
  }
  return steps;
}

// ---------------------------------------------------------------------------------------------
// When the grammar can never write the run: which word breaks it, and what could stand there.

const FINER = {
  PRON_S: "pronoun that acts", PRON_O: "pronoun that is acted on",
  V_PAST_T: "verb in the past", V_PAST_I: "verb in the past", V_BASE_T: "verb in its plain form", V_BASE_I: "verb in its plain form",
};
const withArticle = (name) => (/^[aeiou]/.test(name) ? "an " : "a ") + name;
const spoken = (types) => [...new Set(types.map((t) => withArticle(FINER[t] || TYPE_NAMES[t] || t.toLowerCase())))];
const listed = (parts) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`);
const named = (types) => types.map((type) => ({ type, name: TYPE_NAMES[type] }));

function never(run, k, walk, fresh) {
  const word = k < run.length ? run[k] : null, before = k ? run[k - 1] : null;
  const states = [...walk.live.values()].map((node) => node.st);
  const direct = [], opening = [];
  let stop = false;
  for (const st of states) for (const o of allowedAt(st).options) {
    if (o.type === "END") stop = true; else if (!direct.includes(o.type)) direct.push(o.type);
  }
  if (stop) for (const o of allowedAt(initialState()).options) if (o.type !== "END") opening.push(o.type);
  const own = (word && KINDS.get(word)) || [];
  const opens = `opens with ${listed(spoken(opening))}`;
  const lead = !direct.length ? `${before ? `After “${before}” the` : "The"} sentence has to stop, and the next one ${opens}.`
    : (before ? `After “${before}” comes ` : fresh ? "A sentence opens with " : "Next comes ") + listed(spoken(direct))
      + (stop ? `, or else the full stop and a new sentence, which ${opens}.` : ".");
  const is = `“${word}” ${own.length > 1 ? "can be" : "is"} ${listed(spoken(own))}`;

  let cause = "kind", why = `${lead} ${is}.`;
  if (word === null) {
    cause = "end";
    why = before ? `The sentence cannot stop after “${before}”: it still needs ${listed(spoken(direct))}.` : "A sentence cannot stop before its first word.";
  } else if (!own.length) {
    cause = "unknown";
    why = `“${word}” is not one of the monkey's words. ${lead}`;
  } else if (own.some((t) => direct.includes(t))) {
    // the kind is welcome, the word is not in the list that is left: the sound, or one thing against many
    const art = (states.find((st) => st.art) || {}).art;
    const article = [run[k - 1], run[k - 2]].find((w) => w && (KINDS.get(w) || []).includes("DET"));
    if (art && startsWithVowelSound(word) !== (art === "an")) {
      cause = "sound";
      why = `After “${art}” the next word has to begin with a ${art === "an" ? "vowel" : "consonant"} sound, and “${word}” does not.`;
    } else {
      cause = "number";
      const many = states.some((st) => st.num === "PL");
      why = `${article ? `“${article}” is` : "The article before it is"} for ${many ? "many things" : "one thing"}, so the noun ${many ? "has to be a plural" : "cannot be a plural"}, and “${word}” is ${many ? "not" : "one"}.`;
    }
  } else if (own.includes("CONJ") && states.some((st) => st.q && GRAMMAR[st.state].some((g) => g[0] === "CONJ"))) {
    cause = "question";
    why = `A question takes no joining word, and “${word}” is one. ${lead}`;
  } else if (!direct.length && states.some((st) => st.len >= MAX_SENTENCE)) {
    cause = "length";
    why = `The sentence is ${Math.max(...states.map((st) => st.len))} words long and has to stop here. The next one ${opens}. ${is}.`;
  }
  return {
    possible: false, log10: -Infinity, oneIn: null, words: run,
    steps: describe(walk.layers, new Set(walk.live.keys())), why,
    broke: { index: k, word, cause, kinds: named(own), allowed: named(direct), stop, opening: named(opening) },
    end: null, exact: { num: "0", den: "1" },
  };
}

// ---------------------------------------------------------------------------------------------

function startOf(from) {
  if (from == null || from === "start") return initialState();
  if (typeof from === "object" && GRAMMAR[from.state]) return { state: from.state, num: from.num || "ANY", art: from.art || null, q: !!from.q, len: from.len | 0 };
  throw new TypeError('oddsOf: "from" is "start" or a state of the engine');
}
const runOf = (words) => (typeof words === "string" ? wordsOf(words) : Array.from(words || [], tidy)).filter(Boolean);

// oddsOf(words, { from, mustEnd, plain }) -> { possible, log10, oneIn, steps, why, ... }
//   words     the run, as an array of his words (a capital at the start is forgiven; "shall not" is
//             one word) or as a typed text, which is cut with wordsOf()
//   from      "start": the run begins a new sentence. Or a state of the engine, to ask from the
//             middle of one ({ state, num, art, q, len }, as step() returns it)
//   mustEnd   the sentence must also end right after the last word: the next roll lands on the full stop
//   plain     count a kind as its share and a word as one place in its list, forgetting the remainder
//             (see landing). The answer then differs by less than one part in a million per word.
//
//   possible  false when the grammar can never write this run. Then `why` says so in plain words,
//             and `broke` says it in pieces: { index, word, cause, kinds, allowed, stop, opening },
//             cause being "unknown", "kind", "sound", "number", "question", "length" or "end"
//   log10     the base-10 logarithm of the chance (-Infinity when impossible)
//   oneIn     "1 in N" as text: "37.5", "42,875", "3.2 x 10^41"
//   steps     one entry per word, in order:
//               word, kind, name            the word, and the kind it was read as ("DET", "article")
//               weight, total               the share of that kind at that point: weight in total
//               kinds                       every kind allowed at that point: [{ type, name, weight }]
//               listSize, copies            the length of the list, and how often the word is in it
//               stop                        null, or { weight, total, kinds } when a full stop came first
//               chance, log10, oneIn        the chance of this word here, given the words before it
//               routes                      every way the word can be written here, each with the fields
//                                           above (but the chance) and: part, its portion of the chance of
//                                           the word, and leadsOn, whether the rest of the run can follow it
//             The chances of the steps multiply to the chance of the run.
//   end       with mustEnd: { weight, total, chance, log10, oneIn } of the full stop after the last word
//   exact     the chance as a fraction in lowest terms, two strings of digits: { num, den }
//   words     the run as it was read
export function oddsOf(words, { from = "start", mustEnd = false, plain = false } = {}) {
  const run = runOf(words), start = startOf(from), fresh = from == null || from === "start";
  const walk = forward(run, start, plain);
  if (walk.stuck) return never(run, walk.layers.length, walk, fresh);

  let num = walk.mass, den = walk.den, alive = new Set(walk.live.keys()), end = null;
  if (mustEnd) {
    const stops = [];
    for (const [key, node] of walk.live) {
      const a = allowedAt(node.st), o = a.options.find((x) => x.type === "END");
      if (o) stops.push({ key, n: node.n, weight: o.weight, total: a.total, chance: landing(o.lo, o.lo + o.weight, a.total, plain) });
    }
    if (!stops.length) return never(run, run.length, walk, fresh);
    const common = stops.reduce((l, s) => lcm(l, s.chance[1]), 1n);
    let total = 0n;
    for (const s of stops) { s.flow = s.n * s.chance[0] * (common / s.chance[1]); total += s.flow; }
    const main = stops.reduce((a, b) => (b.flow > a.flow ? b : a));
    end = { weight: main.weight, total: main.total, ...chanceOf(total, num * common) };
    alive = new Set(stops.map((s) => s.key));
    num = total; den *= common;
  }
  const g = gcd(num, den);
  return {
    possible: true, log10: log10Big(num) - log10Big(den), oneIn: oneInText(num, den), words: run,
    steps: describe(walk.layers, alive), why: null, broke: null, end,
    exact: { num: String(num / g), den: String(den / g) },
  };
}
