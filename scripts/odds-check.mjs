// Holds site/how/odds.js against the engine. Every trade here is made up; every word is written by
// the real step().
//   1. a rehearsal: whatever the engine writes, the module must call possible and read the same way
//   2. sentence openings, two trades each: how often 22 runs really came, against oddsOf
//   3. single trades from real points of a sentence (after a cry, after the subject, after "a",
//      "an" and "these", in a question, where a full stop may hide, at the word limit): every
//      word that can come next, and the full stop
//   4. sums that have to come out exactly: all first words make 1, all second words make the first
//   5. runs the grammar can never write come back with a reason
// Usage: node infinite-monkey/scripts/odds-check.mjs [openings, 2000000 unless told otherwise]

import { step, initialState, MAX_SENTENCE } from "../site/core/grammar.js";
import { LEX } from "../site/core/lexicon.js";
import { oddsOf, vocabulary, suggest, wordsOf } from "../site/how/odds.js";

const OPENINGS = Number(process.argv[2]) || 2_000_000;
const REHEARSAL = 200_000, TRIALS = 200_000;
const began = Date.now();

const fail = (msg) => { console.log(`  FAIL ${msg}`); process.exitCode = 1; };
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const fracOf = (r) => [BigInt(r.exact.num), BigInt(r.exact.den)];
const add = ([a, b], [c, d]) => { const n = a * d + c * b, m = b * d, g = gcd(n, m); return [n / g, m / g]; };
const same = (a, b) => a[0] * b[1] === b[0] * a[1];
const pct = (x, digits = 2) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
const says = (run) => `"${run.join(" ")}"`;
const last = (list) => list[list.length - 1];
const VOCAB = [...vocabulary()];
const allowedBy = (state) => step(state, "odds-check", "any trade").trace[0].options.map((o) => o.type);

// ---------------------------------------------------------------------------------------------
console.log(`1. A rehearsal of ${REHEARSAL.toLocaleString("en")} trades, read by the module word by word`);

// Real points of a sentence to ask from in part 3, taken from the engine as the rehearsal reaches them.
const WANTED = {
  'after "a"': (s) => s.art === "a",
  'after "an"': (s) => s.art === "an",
  'after "these" or "those"': (s) => s.num === "PL" && s.state.startsWith("DET"),
  "after an opening cry": (s) => s.state === "START2",
  "after the subject": (s) => s.state === "SUBJ" && !s.q,
  "where a full stop may hide": (s) => s.state === "DONE" && !s.q && s.len < MAX_SENTENCE,
  "in a question that could stop": (s) => s.state === "DONE" && s.q && s.len < MAX_SENTENCE,
  [`at the limit of ${MAX_SENTENCE} words`]: (s) => s.len >= MAX_SENTENCE && allowedBy(s).join() === "END",
};
const stands = {};
{
  const matches = (route, pick, stop) => route.kind === pick.type && route.total === pick.total && route.listSize === pick.listSize
    && route.weight === pick.options.find((o) => o.type === pick.type).weight
    && (stop ? route.stop && route.stop.total === stop.total && route.stop.weight === stop.options.find((o) => o.type === "END").weight : !route.stop);
  let state = initialState(), sentence = [], sentences = 0, longest = 0, hidden = 0, bad = 0;
  for (let i = 0; i < REHEARSAL || Object.keys(stands).length < Object.keys(WANTED).length; i++) {
    if (i >= REHEARSAL * 20) { fail(`the rehearsal never reached: ${Object.keys(WANTED).filter((k) => !stands[k]).join("; ")}`); break; }
    const r = step(state, `rehearsal trade ${i}`, `rehearsal block ${i}`);
    const word = last(r.events).word, pick = last(r.trace), stop = r.trace.length > 1 ? r.trace[0] : null;
    if (i < REHEARSAL) {
      // this one trade, asked from the very state the engine was in
      const o = oddsOf([word], { from: state });
      if (!o.possible || !o.steps[0].routes.some((route) => matches(route, pick, stop))) {
        if (bad++ < 5) fail(`trade ${i}: the engine wrote "${word}" as ${pick.type} from ${JSON.stringify(state)}, the module ${o.possible ? "reads it another way" : `says: ${o.why}`}`);
      }
      if (stop) {
        hidden++;
        // the sentence that just closed, asked from its start: possible, able to end, and every word read as the engine read it
        const run = sentence.map((x) => x.word), whole = oddsOf(run, { mustEnd: true });
        const off = whole.possible ? sentence.findIndex((x, j) => !whole.steps[j].routes.some((route) => route.leadsOn && matches(route, x.pick, null))) : 0;
        if (!whole.possible || off >= 0) { if (bad++ < 5) fail(`sentence ${says(run)}: ${whole.possible ? `word ${off + 1} is read another way` : whole.why}`); }
        sentences++; longest = Math.max(longest, run.length);
      }
    }
    if (stop) sentence = [];
    sentence.push({ word, pick });
    state = r.state;
    for (const name in WANTED) if (!stands[name] && WANTED[name](state)) stands[name] = { state, words: sentence.map((x) => x.word) };
  }
  if (bad > 5) fail(`${bad} disagreements in all`);
  console.log(`   ${REHEARSAL.toLocaleString("en")} words and ${sentences.toLocaleString("en")} whole sentences (the longest ${longest} words, ${hidden.toLocaleString("en")} full stops): ${bad ? `${bad} read differently` : "all possible, all read as the engine read them"}`);
}

// ---------------------------------------------------------------------------------------------
console.log(`\n2. ${OPENINGS.toLocaleString("en")} sentence openings of two trades each, against oddsOf`);

const RUNS = [
  [["the"], "an article"],
  [["a"], 'the article "a"'],
  [["an"], 'the article "an"'],
  [["I"], "a pronoun"],
  [["shall"], "a question opens"],
  [["weep"], "a command of one word"],
  [["O"], "an opening cry"],
  [["behold"], "a cry or a command: two kinds, one word"],
  [["I", "shall"], "pronoun, helper verb"],
  [["shall", "I"], "question, pronoun"],
  [["will", "the"], "question, article"],
  [["an", "old"], '"an", adjective with a vowel'],
  [["an", "owl"], '"an", noun with a vowel'],
  [["an", "hour"], '"an", an "h" that is not heard'],
  [["a", "king"], '"a", noun with a consonant'],
  [["a", "unicorn"], '"a", a "u" that sounds "you"'],
  [["these", "kings"], "an article for many, a plural"],
  [["the", "grave"], "adjective or noun: two kinds"],
  [["O", "the"], "an opening cry, then an article"],
  [["behold", "the"], "cry or command, both lead on"],
  [["slay", "the"], "a command, then its object"],
  [["alas", "I"], "an opening cry, then a pronoun"],
];
const firstSeen = new Map();
{
  const start = initialState();
  const pairs = new Map(RUNS.filter(([run]) => run.length === 2).map(([run]) => [run.join("\n"), 0]));
  for (let i = 0; i < OPENINGS; i++) {
    const a = step(start, `opening ${i}`, "first trade");
    const w1 = last(a.events).word;
    firstSeen.set(w1, (firstSeen.get(w1) || 0) + 1);
    const b = step(a.state, `opening ${i}`, "second trade");
    const key = `${w1}\n${last(b.events).word}`, n = pairs.get(key);
    if (n !== undefined) pairs.set(key, n + 1);
  }
  let worst = null, widest = null, within2 = 0;
  console.log(`   ${"run".padEnd(15)}${"expected".padStart(10)}${"seen".padStart(9)}${"differs".padStart(10)}${"sampling error".padStart(16)}   covers`);
  for (const [run, covers] of RUNS) {
    const o = oddsOf(run);
    if (!o.possible) { fail(`${says(run)} came back impossible: ${o.why}`); continue; }
    const p = 10 ** o.log10, expected = OPENINGS * p;
    const seen = run.length === 1 ? firstSeen.get(run[0]) || 0 : pairs.get(run.join("\n"));
    const differs = seen / expected - 1, error = Math.sqrt((1 - p) / expected), z = differs / error;
    const row = { run, differs, error, z };
    if (!worst || Math.abs(z) > Math.abs(worst.z)) worst = row;
    if (!widest || Math.abs(differs) > Math.abs(widest.differs)) widest = row;
    if (Math.abs(z) <= 2) within2++;
    console.log(`   ${says(run).padEnd(15)}${expected.toFixed(1).padStart(10)}${String(seen).padStart(9)}${pct(differs).padStart(10)}${("±" + (error * 100).toFixed(2) + "%").padStart(16)}   ${covers}`);
    if (Math.abs(z) > 4) fail(`${says(run)} is ${z.toFixed(1)} sampling errors away from oddsOf`);
  }
  console.log(`   largest relative difference: ${pct(widest.differs)} on ${says(widest.run)}, whose sampling error is ±${(widest.error * 100).toFixed(2)}%`);
  console.log(`   furthest from oddsOf, counted in sampling errors: ${says(worst.run)} at ${worst.z.toFixed(2)}; ${within2} of ${RUNS.length} runs are within 2, and all must be within 4`);

  // every first word at once
  let chi2 = 0, kinds = 0;
  for (const w of VOCAB) {
    const o = oddsOf([w]), seen = firstSeen.get(w) || 0;
    if (!o.possible) { if (seen) fail(`"${w}" opened ${seen} sentences and the module says it cannot`); continue; }
    const expected = OPENINGS * 10 ** o.log10;
    chi2 += (seen - expected) ** 2 / expected; kinds++;
  }
  const z = (chi2 - (kinds - 1)) / Math.sqrt(2 * (kinds - 1));
  console.log(`   all ${kinds} words that can open a sentence, taken together: chi-square ${chi2.toFixed(1)} for ${kinds - 1} degrees of freedom (${z.toFixed(2)} sampling errors from what chance alone gives)`);
  if (z > 4) fail("the first words as a whole do not follow oddsOf");
}

// ---------------------------------------------------------------------------------------------
console.log(`\n3. ${TRIALS.toLocaleString("en")} single trades from each of ${Object.keys(stands).length} real points of a sentence`);

for (const [name, { state, words }] of Object.entries(stands)) {
  const seen = new Map();
  let stops = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = step(state, `${name} ${i}`, "one trade");
    if (r.events.length > 1) stops++;
    const w = last(r.events).word;
    seen.set(w, (seen.get(w) || 0) + 1);
  }
  let sum = [0n, 1n], chi2 = 0, bins = 0, restSeen = 0, restExpected = 0, can = 0;
  for (const w of VOCAB) {
    const o = oddsOf([w], { from: state }), n = seen.get(w) || 0;
    if (!o.possible) { if (n) fail(`${name}: the engine wrote "${w}" ${n} times and the module says it cannot`); continue; }
    can++; sum = add(sum, fracOf(o));
    const expected = TRIALS * 10 ** o.log10;
    if (expected < 5) { restSeen += n; restExpected += expected; continue; }
    chi2 += (n - expected) ** 2 / expected; bins++;
  }
  if (restExpected > 0) { chi2 += (restSeen - restExpected) ** 2 / restExpected; bins++; }
  const exact = same(sum, [1n, 1n]);
  if (!exact) fail(`${name}: the chances of every next word add up to ${sum[0]}/${sum[1]}, not 1`);
  const z = bins > 1 ? (chi2 - (bins - 1)) / Math.sqrt(2 * (bins - 1)) : 0;
  if (z > 4) fail(`${name}: the next words do not follow oddsOf (chi-square ${chi2.toFixed(1)} for ${bins - 1})`);
  const end = oddsOf([], { from: state, mustEnd: true }), pStop = end.possible ? 10 ** end.log10 : 0;
  const zStop = pStop > 0 && pStop < 1 ? (stops - TRIALS * pStop) / Math.sqrt(TRIALS * pStop * (1 - pStop)) : stops === TRIALS * pStop ? 0 : Infinity;
  if (Math.abs(zStop) > 4) fail(`${name}: the full stop came ${stops} times, oddsOf gives ${(TRIALS * pStop).toFixed(1)}`);
  console.log(`   ${name}, as after ${says(words)}`);
  console.log(`      ${can} words can come next and their chances add up to ${exact ? "exactly 1" : "something else"}; chi-square ${chi2.toFixed(1)} for ${Math.max(0, bins - 1)} (${z.toFixed(2)} sampling errors)`);
  console.log(`      full stop first: expected ${(TRIALS * pStop).toFixed(1)}, seen ${stops}${pStop > 0 && pStop < 1 ? ` (${zStop.toFixed(2)} sampling errors)` : ""}`);
}

// ---------------------------------------------------------------------------------------------
console.log("\n4. Sums that have to come out exactly");

function nextWords(run, options) {
  let sum = [0n, 1n], can = 0;
  for (const w of VOCAB) { const o = oddsOf([...run, w], options); if (o.possible) { can++; sum = add(sum, fracOf(o)); } }
  return { sum, can };
}
for (const plain of [false, true]) {
  const how = plain ? "shares by hand  " : "the engine's reading";
  const first = nextWords([], { plain });
  const ok = same(first.sum, [1n, 1n]);
  if (!ok) fail(`first words (${how.trim()}) add up to ${first.sum[0]}/${first.sum[1]}`);
  console.log(`   ${how}: the ${first.can} possible first words add up to ${ok ? "exactly 1" : `${first.sum[0]}/${first.sum[1]}`}`);
  const after = [["the"], ["a"], ["an"], ["these"], ["I"], ["shall"], ["O"], ["weep"], ["slay"], ["behold"], ["I", "wept"], ["shall", "I", "weep"], ["the", "grave"], ["I", "loved", "her"]];
  const lines = [];
  for (const run of after) {
    const base = oddsOf(run, { plain }), next = nextWords(run, { plain });
    const exact = base.possible && same(next.sum, fracOf(base));
    if (!exact) fail(`after ${says(run)} (${how.trim()}): the next words add up to ${next.sum[0]}/${next.sum[1]}, the run itself is ${base.exact.num}/${base.exact.den}`);
    lines.push(`${says(run)} ${next.can}${exact ? "" : " WRONG"}`);
  }
  console.log(`   ${how}: after each of these, the possible next words add up to exactly the chance of the run so far:\n      ${lines.join(", ")}`);
}
{
  // by hand, the full stop after "I wept" is 38 of 100
  const run = ["I", "wept"], open = fracOf(oddsOf(run, { plain: true })), closed = fracOf(oddsOf(run, { plain: true, mustEnd: true }));
  const ok = same([closed[0] * 100n, closed[1]], [open[0] * 38n, open[1]]);
  if (!ok) fail('mustEnd after "I wept" is not 38 in 100 of the run');
  console.log(`   by hand, "I wept" and then the full stop is ${ok ? "exactly 38 in 100 of" : "NOT 38 in 100 of"} "I wept"`);
}

// ---------------------------------------------------------------------------------------------
console.log("\n5. Runs the grammar can never write");

const NEVER = [
  [["the", "wept"], {}, "kind", 1],
  [["banana"], {}, "kind", 0],
  ["to be or not to be", {}, "kind", 0],
  [["an", "king"], {}, "sound", 1],
  [["a", "owl"], {}, "sound", 1],
  [["these", "king"], {}, "number", 1],
  [["this", "old", "kings"], {}, "number", 2],
  [["shall", "I", "weep", "and"], {}, "question", 3],
  [["xylophone"], {}, "unknown", 0],
  [["the", "king"], { mustEnd: true }, "end", 2],
];
const limit = stands[`at the limit of ${MAX_SENTENCE} words`];
if (limit) NEVER.push([["and"], { from: limit.state }, "length", 0]);
for (const [run, options, cause, index] of NEVER) {
  const o = oddsOf(run, options);
  const shown = typeof run === "string" ? `"${run}"` : says(run);
  const ok = o.possible === false && typeof o.why === "string" && o.why.length > 20 && o.log10 === -Infinity && o.oneIn === null
    && o.broke.cause === cause && o.broke.index === index && (o.broke.word === null || o.why.includes(o.broke.word));
  if (!ok) fail(`${shown} should be impossible for the reason "${cause}" at word ${index + 1}: got ${JSON.stringify({ possible: o.possible, why: o.why, broke: o.broke && { cause: o.broke.cause, index: o.broke.index } })}`);
  console.log(`   ${shown}${options.mustEnd ? " and a full stop" : ""}${options.from ? ` (after ${limit.words.length} words)` : ""}: ${o.why}`);
}

// ---------------------------------------------------------------------------------------------
console.log("\n6. The helpers, the two readings (the engine's remainders, or shares multiplied by hand), and three runs worked out");
{
  const all = new Set(Object.values(LEX).flat());
  const voc = vocabulary();
  if (voc.size !== all.size || [...all].some((w) => !voc.has(w))) fail(`vocabulary() has ${voc.size} words, the lists hold ${all.size}`);
  const cut = wordsOf("O, the King shall not weep — at last!");
  if (cut.join("|") !== "O|the|king|shall not|weep|at last") fail(`wordsOf cut the text as ${JSON.stringify(cut)}`);
  const s = suggest("ban", 3), next = suggest("k", 50, { after: ["these"] });
  if (s.join() !== "banana,bananas,banish") fail(`suggest("ban", 3) gave ${s}`);
  if (!next.includes("kings") || next.includes("king") || next.some((w) => !oddsOf(["these", w]).possible)) fail(`suggest("k", 50, { after: ["these"] }) gave ${next}`);
  console.log(`   vocabulary() ${voc.size} words; suggest("ban", 3) ${JSON.stringify(s)}; suggest("k", 4, { after: ["these"] }) ${JSON.stringify(next.slice(0, 4))}`);
  console.log(`   wordsOf("O, the King shall not weep — at last!") ${JSON.stringify(cut)}`);

  let gap = 0;
  const probes = [...RUNS.map(([run]) => run), ["the", "king", "loved", "a", "banana"], wordsOf("the mad king shall not forgive him because he slew a monkey in vain")];
  for (const run of probes) gap = Math.max(gap, Math.abs(10 ** (oddsOf(run).log10 - oddsOf(run, { plain: true }).log10) - 1) / run.length);
  console.log(`   the engine's reading against shares multiplied by hand: at most ${(gap * 1e9).toFixed(1)} parts in a billion per word, over ${probes.length} runs`);
  if (gap > 1e-6) fail("the two readings are further apart than one part in a million per word");

  for (const [run, options] of [[["the", "king", "loved", "a", "banana"], {}], [["the", "king", "loved", "a", "banana"], { mustEnd: true }], [wordsOf("the mad king shall not forgive him because he slew a monkey in vain"), { mustEnd: true }]]) {
    const o = oddsOf(run, options);
    console.log(`   ${says(run)}${options.mustEnd ? " and a full stop" : ""}: 1 in ${o.oneIn} (log10 ${o.log10.toFixed(4)}); with { plain: true }, 1 in ${oddsOf(run, { ...options, plain: true }).oneIn}`);
    if (run.length === 5 && !options.mustEnd) for (const t of o.steps) console.log(`      ${t.word.padEnd(7)} ${t.name.padEnd(8)} ${String(t.weight).padStart(2)} in ${t.total}, one of ${String(t.listSize).padStart(3)}: 1 in ${t.oneIn}`);
  }
}

console.log(`\n${process.exitCode ? "FAILED" : "OK"} in ${((Date.now() - began) / 1000).toFixed(1)} s`);
