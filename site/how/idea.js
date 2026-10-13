// The five pages of THE IDEA, the first part of the manual: why a monkey, before how a word is picked.
// Like the pages of the rule (pages.js), each is a function that builds its demonstration once and
// gives back { enter, leave }.
//
// Everything a page shows is worked out here, in the visitor's browser: the powers of 26 and the
// times by plain arithmetic, the cousin's letters by the browser's own dice or from a fingerprint,
// my words by the real engine (story.js), the chance of a sentence by odds.js. Two numbers are not
// worked out but quoted, and each is said to be rough where it is shown: the letters of Hamlet, and
// the length of the number of atoms.

import { createSim } from "../core/sim.js";
import { shortKey } from "../core/book.js";
import * as S from "./story.js";
import { oddsOf, vocabulary as hisWords, suggest, wordsOf } from "./odds.js";
import { h, fill, say, art, act, fmt, tiles, strip, writeAll, createClock, artPixel } from "./parts.js";

export const KEYS = 26;                 // the typewriter of the theorem, as counted here: the letters and nothing else
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const HAMLET_LETTERS = 130000;          // roughly, counting only the letters
const ATOM_DIGITS = 80;                 // the atoms of the universe we can see: a number of about 80 digits
const YEAR = 365.25 * 24 * 3600;        // seconds
const LIFE = 80;                        // years, for "lives of 80 years"

// demo: where a page draws. Its closing line (.aside) is written in index.html and stays last:
// put(...) sets a page's own pieces before it.
const slots = (sec) => {
  const demo = sec.querySelector(".demo"), aside = demo.querySelector(".aside");
  return { demo, acts: sec.querySelector(".acts"), put: (...kids) => (aside ? aside.before(...kids) : demo.append(...kids)) };
};
// A page with a box to type in: the box heads the demonstration and its answer comes right under it.
// ask(...) is the form around the box, result() the place the answer is drawn in.
const ask = (...kids) => { const form = h("form", { class: "ask", autocomplete: "off" }, ...kids); form.addEventListener("submit", (e) => e.preventDefault()); return form; };
const result = () => h("div", { class: "result" });
const cap = (text) => h("p", { class: "cap", text });
const tag = (text = "made-up trade") => h("span", { class: "tag", text });
const keyOf = (text, head = 6, tail = 6) => h("span", { class: "key", text: shortKey(text, head, tail) });
const times = (n) => (n === 1 ? "once" : n === 2 ? "twice" : `${fmt(n)} times`);

// ---------------------------------------------------------------------------------------------
// Numbers a person can say.

const commas = (digits) => String(digits).replace(/\B(?=(\d{3})+$)/g, ",");
const BIG = ["", "thousand", "million", "billion", "trillion", "quadrillion"];

// A size from its base-10 logarithm, to two figures: "59", "1,800", "45 million", "1.3 billion".
// null once it is past the quadrillions: then only its length in digits is said.
function sayable(log10) {
  if (!(log10 < 18)) return null;
  if (log10 < 2) { const v = 10 ** log10; return String(v < 9.95 ? Math.round(v * 10) / 10 : Math.round(v)); }
  let exp = Math.floor(log10), two = Math.round(10 ** (log10 - exp) * 10);   // its first two figures, 10 to 100
  if (two === 100) { two = 10; exp++; }
  if (exp >= 18) return null;
  if (exp < 6) return fmt(two * 10 ** (exp - 1));
  const tier = Math.floor(exp / 3), left = exp - 3 * tier;
  return `${left ? two * 10 ** (left - 1) : two / 10} ${BIG[tier]}`;
}

// How long so many seconds are, from the base-10 logarithm of the count: the time in the largest
// unit that fits, and the same in words a person feels.
function lasting(logSeconds) {
  const s = 10 ** logSeconds;
  const about = (n, unit) => `about ${fmt(Math.round(n))} ${unit}${Math.round(n) === 1 ? "" : "s"}`;
  if (s < 90) return { text: about(s, "second"), feel: "No time at all." };
  if (s < 90 * 60) return { text: about(s / 60, "minute"), feel: "A cup of tea." };
  if (s < 36 * 3600) return { text: about(s / 3600, "hour"), feel: "One long day at the typewriter." };
  if (s < 60 * 86400) return { text: about(s / 86400, "day"), feel: "Some weeks with no sleep." };
  if (s < 2 * YEAR) return { text: about(s / (YEAR / 12), "month"), feel: "Many months with no day off." };
  const logYears = logSeconds - Math.log10(YEAR), years = sayable(logYears);
  const text = years ? `about ${years} years` : `a number of years ${fmt(Math.floor(logYears) + 1)} digits long`;
  if (logYears < Math.log10(25)) return { text, feel: "Years out of one life." };
  if (logYears < 2) return { text, feel: "Most of a long life." };
  const lives = sayable(logYears - Math.log10(LIFE));
  return { text, feel: lives ? `That is ${lives} lives of ${LIFE} years, one after the other.` : "More lives than I have words for." };
}

// A long figure in the blocky face, free to break after any of its commas.
function bigFigure(text) {
  const b = h("b", { class: "fig big" });
  String(text).split(",").forEach((part, i, all) => b.append(i < all.length - 1 ? `${part},` : part, i < all.length - 1 ? document.createElement("wbr") : ""));
  return b;
}

// ---------------------------------------------------------------------------------------------
// My cousin, the monkey of the theorem: letters by chance, and a watch kept for real words.

// Letters by chance, each as likely as the next: the browser's own dice, and a byte that would
// make the first letters a hair likelier is thrown again.
function createDice() {
  const bytes = new Uint8Array(2048), fair = KEYS * Math.floor(256 / KEYS);
  let at = bytes.length;
  return function letter() {
    for (;;) {
      if (at >= bytes.length) {
        if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
        else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        at = 0;
      }
      const b = bytes[at++];
      if (b < fair) return ALPHABET[b % KEYS];
    }
  };
}

// What counts as a real word: any word of mine of three letters or more (shorter ones turn up all the time).
const MINE = hisWords();
const SPELLED = [...MINE].filter((w) => /^[a-z]{3,}$/.test(w));
// The same words spelled backwards, a letter a step: the quick way to ask "does a word end on this key?"
const ENDINGS = {};
for (const w of SPELLED) {
  let node = ENDINGS;
  for (let i = w.length - 1; i >= 0; i--) node = node[w[i]] ||= {};
  node.word = w;
}

function createTypist() {
  const KEPT = 240;   // letters still on the paper
  let text = "", finds = [], seen = new Set();
  const t = {
    keys: 0, words: 0, best: [],
    // One key. Gives back { word, end } when luck has just spelled a word (the longest that ends here).
    strike(letter) {
      t.keys++;
      text += letter;
      if (text.length > 2 * KEPT) text = text.slice(-KEPT);
      let node = ENDINGS, word = null;
      for (let i = text.length - 1; i >= 0 && (node = node[text[i]]); i--) if (node.word) word = node.word;
      if (!word) return null;
      t.words++;
      const find = { word, end: t.keys };
      finds.push(find);
      if (finds.length > 60) finds.shift();   // older ones have left the paper
      if (!seen.has(word)) {
        seen.add(word);
        t.best.push(find);
        t.best.sort((a, b) => b.word.length - a.word.length || a.end - b.end);
        t.best.length = Math.min(t.best.length, 4);
      }
      return find;
    },
    // The last n letters as they stand on the paper: runs of plain letters, and runs inside a word luck spelled.
    tail(n) {
      const shown = text.slice(-n), from = t.keys - shown.length;
      const lit = new Uint8Array(shown.length);
      for (const f of finds) for (let k = Math.max(from, f.end - f.word.length); k < f.end; k++) lit[k - from] = 1;
      const runs = [];
      for (let i = 0; i < shown.length;) {
        let j = i;
        while (j < shown.length && lit[j] === lit[i]) j++;
        runs.push({ text: shown.slice(i, j), lit: !!lit[i] });
        i = j;
      }
      return { runs, cut: t.keys > shown.length };
    },
  };
  return t;
}

// His letters, put on a paper. With typed: true the newest one is put down the way a struck letter is.
function putLetters(into, typist, { count = 200, typed = false, dots = false } = {}) {
  const { runs, cut } = typist.tail(count);
  into.replaceChildren();
  if (dots && cut) into.append("…");
  runs.forEach((run, i) => {
    let body = run.text, last = null;
    if (typed && i === runs.length - 1) { last = h("span", { class: "ch in" }); last.textContent = body.slice(-1); body = body.slice(0, -1); }
    if (!run.lit) { into.append(body); if (last) into.append(last); return; }
    const mark = document.createElement("mark");
    mark.append(body);
    if (last) mark.append(last);
    into.append(mark);
  });
  into.append(h("span", { class: "caret" }));
}

// ---------------------------------------------------------------------------------------------
// 1. A monkey and for ever: he hits letters by chance, and now and then luck spells a word.

function keys(sec, ctx) {
  const { acts, put } = slots(sec);
  const clock = createClock();
  const typist = createTypist(), dice = createDice();
  const SPEEDS = [[1, 140], [50, 50], [5000, 50], [50000, 50]];   // keys at a go, and the milliseconds between two goes
  let speed = 0, beat = 0;

  const letters = h("div", { class: "letters" });
  const paper = h("div", { class: "paper keys", role: "img", "aria-label": "Letters struck by pure chance. The words that luck has spelled are lit." }, h("div", { class: "window" }, letters));
  const score = h("p", { class: "score" });
  const pace = h("p", { class: "cap" });
  const best = h("ol", { class: "menu" });
  put(
    cap(`My cousin at his typewriter: ${KEYS} keys, each as likely as the next.`),
    paper, score, pace,
    h("div", { class: "group" }, h("span", { class: "cap", text: "The longest words luck has spelled so far (a word is one of mine, of three letters or more)" }), best));

  const faster = act("Faster", () => { speed = (speed + 1) % SPEEDS.length; drawPace(); ctx.monkey.stamp(2); }, { main: true });
  // for a visitor who asked for less motion nothing runs by itself: the keys come in lots, at a press
  const thousand = act("A thousand keys", () => lot(1000), { main: true });
  const million = act("A million keys", () => lot(1000000));
  acts.append(faster, thousand, million);

  function drawPace() {
    const [per, ms] = SPEEDS[speed];
    say(pace, ctx.still() ? "He strikes when you press." : `He strikes about ${fmt(Math.round((per * 1000) / ms))} keys a second.`);
    faster.lastChild.textContent = speed < SPEEDS.length - 1 ? "Faster" : "Slow down";
  }

  function drawCount() {
    fill(score, h("span", { text: `Keys ${fmt(typist.keys)}` }), h("span", { text: `Words ${fmt(typist.words)}` }));
    fill(best, typist.best.length
      ? typist.best.map((f, i) => h("li", { class: i ? "row" : "row picked" },
        h("span", { class: "cur" }, i ? null : art("pick")),
        h("span", { class: "name", text: f.word }),
        h("span", { class: "lead" }),
        h("span", { class: "at", text: "key" }),
        h("b", { class: "fig", text: fmt(f.end) })))
      : h("li", { class: "row" }, h("span", { class: "cur" }), h("span", { class: "gone", text: "None yet. Give him time." })));
  }

  function draw(typed = false) {
    putLetters(letters, typist, { typed });
    drawCount();
    drawPace();
  }

  function tick() {
    if (document.hidden) { clock.later(600, tick); return; }
    const [per, ms] = SPEEDS[speed];
    const slow = per === 1;
    let found = null;
    for (let i = 0; i < per; i++) found = typist.strike(dice()) || found;
    if (slow || beat++ % 3 === 0) putLetters(letters, typist, { typed: slow });   // at speed the paper is redrawn a few times a second, no more
    drawCount();
    if (slow && found) { ctx.monkey.joy(); clock.later(1000, tick); return; }       // a word: he stops to enjoy it
    ctx.monkey.stamp();
    clock.later(ms, tick);
  }

  // So many keys at one press, in slices, so that the page stays awake.
  function lot(n) {
    clock.clear();
    (function slice(left) {
      for (let i = Math.min(left, 100000); i > 0; i--) typist.strike(dice());
      draw();
      if (left > 100000) clock.later(0, () => slice(left - 100000));
    })(n);
  }

  return {
    enter() {
      clock.clear();
      const still = ctx.still();
      faster.hidden = still;
      thousand.hidden = million.hidden = !still;
      if (!typist.keys) lot(still ? 200 : 40);   // nobody lands on an empty paper
      draw();
      if (!still) clock.later(500, tick);
    },
    leave() { clock.clear(); },
  };
}

// ---------------------------------------------------------------------------------------------
// 2. How long is for ever: a word of the visitor's, the chance of it in one go, and how long that is.

function long(sec, ctx) {
  const { acts, put } = slots(sec);
  const MAX = 16;
  const SAMPLES = ["banana", "ape", "king", "monkey", "bananas", "typewriter"];
  let turn = 0;
  const input = h("input", { id: "long-word", type: "text", maxlength: String(MAX + 8), spellcheck: "false", autocapitalize: "off", autocorrect: "off", autocomplete: "off", enterkeyhint: "done" });
  input.value = SAMPLES[0];
  const note = h("p", { class: "cap", "aria-live": "polite" });
  const demo = result();
  put(ask(h("label", { class: "field" }, h("span", { class: "cap", text: "A short word, letters only" }), input), note), demo);
  input.addEventListener("input", () => { draw(); ctx.monkey.stamp(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });   // on a phone "done" puts the keyboard away
  acts.append(act("Another word", () => { input.value = SAMPLES[++turn % SAMPLES.length]; draw(); ctx.monkey.think(420); }));
  addEventListener("resize", () => { if (!sec.hidden) draw(); });   // one line below counts in windows

  // How long the numbers are, a pixel a digit; the last bar is far too long for any page.
  const bar = (digits, off = false) => h("span", { class: off ? "dbar off" : "dbar", style: `--d:${digits}` });
  const size = (text, digits, off) => h("div", { class: "size" }, h("span", { text }), bar(digits, off));

  function draw() {
    const raw = input.value.trim();
    const lettersOnly = raw.toLowerCase().replace(/[^a-z]/g, ""), word = lettersOnly.slice(0, MAX);
    say(note, raw && !word ? `His typewriter has letters only, ${KEYS} of them.`
      : lettersOnly.length > MAX ? `That is long, even for for ever. I kept the first ${MAX} letters: “${word}”.`
        : word !== raw ? `His typewriter has only the ${KEYS} letters: no capitals, no space bar. I read “${word}”.` : "");
    if (!word) { fill(demo, cap("Type a word, or press “Another word” for one of mine.")); return; }

    const n = word.length;
    const ways = BigInt(KEYS) ** BigInt(n);                    // every way n keys can fall: the word is one of them
    const logWays = n * Math.log10(KEYS);
    const time = lasting(logWays + Math.log10(n));             // that many goes of n keys each, a key a second
    const missed = Math.exp(Number(ways) * Math.log1p(-1 / Number(ways)));   // the chance that so many goes all miss
    const digits = String(ways).length;
    const hamlet = Math.round((Math.floor(HAMLET_LETTERS * Math.log10(KEYS)) + 1) / 1000) * 1000;   // the letters are a rough count, so the digits are rounded
    const windows = Math.round((hamlet * artPixel()) / Math.max(1, innerWidth));

    fill(demo,
      h("p", { text: `One go is ${n} ${n === 1 ? "key" : "keys"}. The chance that it comes out “${word}”:` }),
      h("p", { class: "outcome figure" }, "1 in", bigFigure(commas(ways))),
      cap(n === 1 ? `One key, and ${KEYS} ways it can fall.` : `That is ${Array(n).fill(KEYS).join(" × ")}.`),
      h("p", { text: `At a key a second, that many goes take ${time.text}.` }),
      cap(`${time.feel} And luck owes him nothing: after all those goes, the chance that he still has no “${word}” is about ${Math.round(missed * 100)}%.`),
      h("div", { class: "group sizes" },
        h("span", { class: "cap", text: "How long the numbers are, at one pixel a digit" }),
        size(`“${word}”: ${digits} ${digits === 1 ? "digit" : "digits"}`, digits),
        size(`The atoms of the universe we can see: about ${ATOM_DIGITS} digits`, ATOM_DIGITS),
        size(`Hamlet in one go: 1 in a number about ${fmt(hamlet)} digits long`, hamlet, true),
        cap(`The last bar does not fit. Drawn whole it would be ${fmt(windows)} of these windows wide.`)));
  }

  return { enter() { draw(); }, leave() {} };
}

// ---------------------------------------------------------------------------------------------
// 3. I went to school: the same made-up trades, read as a letter by him and as a word by me.

function school(sec, ctx) {
  const { acts, put } = slots(sec);
  const clock = createClock();
  const tale = S.createStory("the idea: at school", { cheap: true });
  const cousin = createTypist();
  const FIRST = 14;   // trades made by the time the page has been looked at: a few are there on arrival, the rest come in
  const READY = 5;
  const KEEP = 20;    // words, and letters, kept on the two papers
  const fair = KEYS * Math.floor(256 / KEYS);
  // His letter: the last number of the fingerprint, which my own word never reads. (A number that
  // would make the first letters a hair likelier is passed over for the one before it.)
  const letterOf = (bytes) => { for (let i = bytes.length - 1; i >= 18; i--) if (bytes[i] < fair) return ALPHABET[bytes[i] % KEYS]; return ALPHABET[bytes[bytes.length - 1] % KEYS]; };

  const his = h("div", { class: "paper keys loose", role: "img" });
  const mine = h("div", { class: "paper" });
  const told = h("p", { class: "cap" });
  put(
    h("p", { class: "strip" }, tag("made-up trades"), h("span", { class: "sofar", text: "The same trades for both of us: a letter for him, a word for me." })),
    h("div", { class: "duo" },
      h("span", { class: "cap", text: "My cousin" }), his,
      h("span", { class: "cap", text: "Me" }), mine),
    told,
    h("div", { class: "more" }, act("See what may follow what", () => ctx.openMap())));
  acts.append(
    act("Make a trade", () => { clock.clear(); trade(!ctx.still()); }, { main: true }),
    act("Ten more", () => feed(10, 150)));

  function draw(typed = false) {
    const items = tale.items, n = items.length;
    putLetters(his, cousin, { count: KEEP, typed, dots: true });
    his.setAttribute("aria-label", `His letters: ${cousin.tail(KEEP).runs.map((r) => r.text).join("")}`);
    const letters = writeAll(mine, items.slice(-KEEP), { typed, cut: n > KEEP });
    for (const ch of letters) { ch.classList.remove("h"); ch.classList.add("in"); }   // my word lands whole
    const ended = items.filter((it) => it.punct).length;
    say(told, !n ? "No trade yet." : `${fmt(n)} ${n === 1 ? "trade" : "trades"}. He has ${fmt(n)} ${n === 1 ? "letter" : "letters"} and ${cousin.words ? `${times(cousin.words)} luck spelled him a word` : "no word"}. I have ${fmt(n)} ${n === 1 ? "word" : "words"}${ended ? ` and ${fmt(ended)} whole ${ended === 1 ? "sentence" : "sentences"}` : ""}.`);
  }

  function trade(typed) {
    const it = tale.next();
    cousin.strike(letterOf(it.bytes));
    draw(typed);
    if (typed) ctx.monkey.stamp(3);
  }

  function feed(n, ms) {
    clock.clear();
    if (ctx.still()) { for (let i = 0; i < n; i++) trade(false); return; }
    (function next(left) { trade(true); if (left > 1) clock.later(ms, () => next(left - 1)); })(n);
  }

  return {
    enter() {
      if (tale.items.length) { draw(); return; }
      for (let i = 0; i < READY; i++) trade(false);   // nobody lands on two empty papers
      if (ctx.still()) feed(FIRST - READY, 0); else clock.later(700, () => feed(FIRST - READY, 320));
    },
    leave() {
      clock.clear();
      while (tale.items.length < FIRST) trade(false);   // left half way through the first run: it is finished out of sight
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 4. Where my luck comes from: the same trade always gives the same word; another block, another word.

function luck(sec, ctx) {
  const { acts, put } = slots(sec);
  const demo = result();
  put(demo);
  const sim = createSim({ seed: "the idea: luck", startTime: 0 });
  const IFS = 3;   // other blocks kept on show
  let stand = null, trade = null, mine = null, struck = 1, same = 1, others = [];
  acts.append(
    act("Strike it again", () => again(), { main: true }),
    act("Another block", () => other()));
  const more = h("div", { class: "more" }, act("Another trade", () => { fresh(); draw(true); ctx.monkey.stamp(4); }));

  // The sentence stands after its article, so that the word to come is a noun or an adjective: more to see than "the".
  function start() {
    const found = S.findStands({ article: (s, w) => s.state === "DET:S" && !s.art && s.num === "ANY" && w.length === 1 }, { seed: "stands-6" });
    stand = found.article || { state: S.initialState(), words: [] };
    fresh();
  }

  function fresh() {
    trade = sim.next();
    mine = S.read(stand.state, trade.signature, trade.blockhash);
    struck = same = 1;
    others = [];
  }

  // The engine is asked again, from nothing: the same two texts in, and the word that comes out is compared.
  function again() {
    const r = S.read(stand.state, trade.signature, trade.blockhash);
    struck++;
    if (r.hex === mine.hex && r.word.text === mine.word.text) same++;
    draw(true);
    ctx.monkey.stamp(4);
  }

  // The same signature, had the trade landed in some other block.
  function other() {
    const blockhash = sim.next().blockhash;
    others.unshift({ blockhash, word: S.read(stand.state, trade.signature, blockhash).word.text });
    others.length = Math.min(others.length, IFS);
    draw();
    ctx.monkey.think(520);
  }

  const row = (blockhash, word, real) => h("li", { class: real ? "row picked" : "row" },
    h("span", { class: "cur" }, real ? art("pick") : null),
    h("span", { class: "name" }, real ? "its block " : "block ", keyOf(blockhash, 4, 4)),
    h("span", { class: "lead" }),
    h("span", { text: word }));

  function draw(moved = false) {
    const p = mine.pick;
    const item = { ...mine, trade, sofar: mine.punct ? [] : stand.words, closed: mine.punct ? stand.words : null };
    fill(demo,
      h("p", { class: "strip" }, tag()),
      h("div", { class: "pair" },
        h("div", {}, h("span", { class: "cap", text: "Signature" }), h("span", { class: "key keyline", text: shortKey(trade.signature, 12, 6) })),
        h("div", {}, h("span", { class: "cap", text: "Hash of the block it landed in" }), h("span", { class: "key keyline", text: shortKey(trade.blockhash, 12, 6) }))),
      art("down", "flow"),
      h("div", { class: "group" }, h("span", { class: "cap", text: "Its fingerprint: the key I hit" }),
        tiles(mine.bytes, { on: (i) => i >= p.at && i < p.at + 8, pop: moved && !ctx.still() })),
      art("down", "flow"),
      strip(item, "word", { tag: null }),
      h("p", { class: "cap", "aria-live": "polite", text: struck === 1 ? `Struck once: “${mine.word.text}”.` : same === struck ? `Struck ${times(struck)}: “${mine.word.text}” ${times(same)}.` : `Struck ${times(struck)}, and “${mine.word.text}” only ${times(same)}: something is wrong with this page. Trust the book.` }),
      h("div", { class: "group" },
        h("span", { class: "cap", text: others.length ? "The same trade, had it landed in another block" : "Press “Another block”: the same trade, landed somewhere else" }),
        h("ol", { class: "menu" }, row(trade.blockhash, mine.word.text, true), others.map((o) => row(o.blockhash, o.word, false)))),
      more);
  }

  return {
    enter() { if (!stand) start(); draw(); },
    leave() {},
  };
}

// ---------------------------------------------------------------------------------------------
// 5. What are the odds: a sentence built from my words, and the chance that my next trades write it.

// The lists a kind of word is read from, for the words offered at a press.
const LISTS = { DET: ["DET_ANY", "DET_SG", "DET_PL"], NOUN: ["NOUN_SG", "NOUN_PL"] };
const CLOSED = /[.!?]["”’)]*\s*$/;                 // the visitor closed the sentence
const TYPING = /[^\s.,!?;:…"“”()—–]$/;             // the last word is still being typed

// The same reason odds.js gives, said by me: it speaks of "the monkey's words".
const mineSaid = (why) => String(why || "").replace("the monkey's words", "my words");
const LEADS = {
  unknown: "That word is not mine.", kind: "I cannot put that word there.", sound: "My ear says no.",
  number: "One thing or many: the two have to agree.", question: "A question of mine never runs on.",
  length: "That sentence is too long for me.", end: "I cannot stop there.",
};

function odds(sec, ctx) {
  const { demo: page, acts, put } = slots(sec);
  // lines to start from: three I can write, and the most famous one of all, which I cannot
  const LINES = ["Alas, the king shall not sleep.", "The monkey typed a sonnet.", "Shall I peel a banana?", "To be or not to be"];
  let turn = 0, could = true;
  const box = h("textarea", { id: "odds-line", rows: "2", maxlength: "160", spellcheck: "false", autocapitalize: "off", autocorrect: "off" });
  box.value = LINES[0];
  const hint = h("p", { class: "cap", "aria-live": "polite" });
  const chips = h("div", { class: "chips" });
  const demo = result();
  put(ask(h("label", { class: "field words" }, h("span", { class: "cap", text: "A sentence in my words" }), box), hint, chips), demo);
  page.append(h("div", { class: "more" }, act("On to the rule", () => ctx.go("rule"))));   // after his last line: the way on
  const fit = () => { box.style.height = "auto"; box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`; };   // the box is as tall as its text
  const all = (moved = false) => { fit(); draw(moved, offer()); };
  box.addEventListener("input", () => { all(true); ctx.monkey.stamp(); });
  addEventListener("resize", () => { if (!sec.hidden) fit(); });
  acts.append(
    act("Another line", () => { box.value = LINES[++turn % LINES.length]; all(true); ctx.monkey.stamp(4); }),
    act("Start again", () => { box.value = ""; all(); box.focus(); }));

  // What a run leaves open: asked of odds.js with a word that is nobody's, so that it answers with
  // the kinds that may come next. null when the run itself cannot be written.
  function opening(before) {
    const probe = oddsOf([...before, "?"], { plain: true });
    return probe.broke.index === before.length ? probe : null;
  }

  // A few of my words that may come next after a run: one of each kind allowed there, then a second.
  function examples(before, broke, limit = 8) {
    const kinds = [...new Set([...broke.allowed, ...(broke.stop ? broke.opening : [])].map((k) => k.type))];
    const pools = kinds.map((type) => (LISTS[type] || [type]).flatMap((key) => S.LEX[key] || []));
    const fits = (w) => oddsOf([...before, w], { plain: true }).possible;
    const at = pools.map((pool) => (before.length * 3) % Math.max(1, pool.length)), out = [];
    for (let round = 0; round < 3 && out.length < limit; round++) {
      pools.forEach((pool, k) => {
        for (let tries = 0; pool.length && tries < 40 && out.length < limit; tries++) {
          const w = pool[at[k]++ % pool.length];
          if (w && !out.includes(w) && fits(w)) { out.push(w); return; }
        }
      });
    }
    return out;
  }

  // A press on a word: it takes the place of the letters being typed, or goes on the end.
  function take(word, drop) {
    let text = box.value;
    if (word === ".") text = `${text.replace(/[\s,;:]+$/, "")}.`;
    else {
      if (drop) text = text.replace(drop === 2 ? /\S+\s+\S+$/ : /\S+$/, "");
      text = `${text}${text && !/\s$/.test(text) ? " " : ""}${word} `;
    }
    box.value = text.slice(0, 160);
    all(true);
    ctx.monkey.stamp(2);
  }

  // Under the box: my words that begin like the one being typed, or a few that may come next.
  // list holds [word, how many typed words it takes the place of].
  function offer() {
    const text = box.value;
    const typing = TYPING.test(text), cut = typing ? text.search(/\S+$/) : text.length;
    const typed = typing ? text.slice(cut).replace(/^[^a-zA-Z]+/, "") : "", begin = typed.toLowerCase();
    const before = wordsOf(text.slice(0, cut)), open = opening(before);
    let said = "", list = [], waiting = false;
    const canClose = (run) => run.length > 0 && oddsOf(run, { plain: true, mustEnd: true }).possible;
    // what may come after a run: the reason odds.js gives ("After “king” comes a verb in the past or a
    // helper verb."), a few words of those kinds, and the full stop where the sentence could close
    const next = (run, o) => {
      said = o.why.slice(o.why.indexOf(". ") + 2).replace(/( a new sentence), which opens with .*$/, "$1.");   // how a sentence opens is said at its start
      list = examples(run, o.broke).map((w) => [w, 0]);
      if (canClose(run)) list.push([".", 0]);
    };
    if (CLOSED.test(text)) said = "The sentence is closed. Rub out the full stop to go on.";
    else if (!open) said = "";   // the run is already broken: the page says where
    else if (!typed) next(before, open);
    else {
      const run = wordsOf(text), last = run[run.length - 1];
      const whole = oddsOf(run, { plain: true }).possible;   // the last word is a whole word of mine, and it stands well there
      // an entry of two words ("shall not", "at last") is typed as two: the word before may be its first half
      const two = before.length ? suggest(`${before[before.length - 1]} ${typed}`, 3, { after: before.slice(0, -1) }) : [];
      const one = suggest(typed, 8, { after: before });
      list = [...two.map((w) => [w, 2]), ...one.map((w) => [w, 1])].filter(([w]) => !(whole && w === last)).slice(0, 8);
      if (whole && !list.length) next(run, opening(run));
      else if (list.length) {
        said = `My words that begin “${begin}” and can stand here:`;
        waiting = !MINE.has(last);   // half a word, and words of mine that could finish it: the page waits for the rest
        if (whole && canClose(run)) list.push([".", 0]);
      } else {
        said = `${suggest(typed, 1).length ? `None of my words that begin “${begin}” can stand here.` : `I have no word that begins “${begin}”.`} These can:`;
        list = examples(before, open.broke).map((w) => [w, 1]);
      }
    }
    say(hint, said);
    // the full stop is offered by name: a dot alone is too small to see, or to press
    fill(chips, list.map(([w, drop]) => h("button", { class: w === "." ? "chip stop" : "chip", type: "button", onclick: () => take(w, drop) }, h("span", { text: w === "." ? "full stop" : w }))));
    return { waiting, before, typed: begin };
  }

  // One word of the run: what it is, the chance of it there, and how that chance is made.
  const row = (word, how, oneIn) => h("li", { class: oneIn ? "odd" : "odd no" },
    h("span", { class: "name", text: word }), h("span", { class: "lead" }),
    oneIn ? h("span", { class: "one" }, "1 in ", h("b", { class: "fig", text: oneIn })) : h("span", { class: "one" }, art("cross")),
    h("span", { class: "cap how", text: how }));
  function made(s) {
    const place = s.copies > 1 ? `${fmt(s.copies)} of ${fmt(s.listSize)}` : `one of ${fmt(s.listSize)}`;
    return `${s.stop ? `a full stop first (${s.stop.weight} in ${s.stop.total}), then ` : ""}${s.name}: ${s.weight} in ${s.total}, then ${place}${s.routes.length > 1 ? `. The likeliest of ${s.routes.length} ways` : ""}`;
  }

  function draw(moved = false, { waiting = false, before = [], typed = "" } = {}) {
    const text = box.value, closes = !waiting && CLOSED.test(text);
    const r = waiting ? oddsOf(before, { plain: true }) : oddsOf(text, { plain: true, mustEnd: closes });
    const n = r.words.length;
    if (moved && could && !r.possible && n) ctx.monkey.think(700);
    could = r.possible || !n;
    const wait = waiting ? cap(`I am waiting for the rest of “${typed}”.${n ? " Without it:" : ""}`) : null;
    if (!n) { fill(demo, wait || cap("Write a word or two, or press one of mine under the box.")); return; }

    const rows = r.steps.map((s) => row(s.word, made(s), s.oneIn));

    if (!r.possible) {
      const b = r.broke, at = r.words.slice(0, b.index);
      // what could stand there instead; when it is the last word that fails, the words under the box already say
      const instead = b.word == null || b.index < r.words.length - 1 ? examples(at, b, 4) : [];
      rows.push(row(b.word ?? "full stop", b.cause === "unknown" ? "not one of my words" : b.cause === "end" ? "the sentence is not whole yet" : "cannot stand here", null));
      fill(demo,
        h("div", { class: "cannot" },
          h("p", { text: `${LEADS[b.cause] || LEADS.kind} ${mineSaid(r.why)}` }),
          instead.length ? cap(`There I could write, say: ${instead.join(", ")}.`) : null),
        h("p", { text: "So the chance is none. This is a line I can never write, however long you trade." }),
        h("div", { class: "group" }, h("span", { class: "cap", text: "Word by word" }), h("ol", { class: "menu" }, rows)));
      return;
    }

    if (closes) rows.push(row("full stop", `${r.end.weight} in ${r.end.total}, and the sentence closes`, r.end.oneIn));
    const power = r.oneIn.match(/^([\d.]+) x 10\^(\d+)$/);            // past fifteen digits odds.js gives two figures and a power of ten
    const named = power ? null : sayable(-r.log10);
    const time = lasting(-r.log10 + Math.log10(n));                    // that many tries of n trades each, a trade a second
    fill(demo,
      wait,
      h("p", { text: `The chance that my next ${n === 1 ? "trade writes" : `${fmt(n)} trades write`} exactly this${closes ? ", full stop and all" : ""}:` }),
      h("p", { class: "outcome figure" }, "1 in", power ? h("b", { class: "fig big", text: `a number ${Number(power[2]) + 1} digits long` }) : bigFigure(r.oneIn)),
      power ? cap(`It begins ${power[1].replace(".", "")} and goes on for ${Number(power[2]) - 1} digits more.`)
        : -r.log10 >= 6 && named ? cap(`About ${named}.`) : null,
      h("p", { text: `At a trade a second, that many tries${n === 1 ? "" : ` of ${fmt(n)} trades`} take ${time.text}.` }),
      cap(time.feel),
      h("div", { class: "group" }, h("span", { class: "cap", text: "Word by word" }), h("ol", { class: "menu" }, rows)));
  }

  return { enter() { all(); }, leave() {} };
}

export const IDEA = { keys, long, school, luck, odds };
