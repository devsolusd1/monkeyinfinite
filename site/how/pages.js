// The nine pages of the manual. Each one is a function that builds its demonstration once and gives
// back { enter, leave }: enter() is called every time the page comes on show, leave() when it goes.
// Everything shown is a made-up trade run through the real engine (story.js); the pages only draw.

import { digestOf } from "../core/grammar.js";
import { createBook, WORDS_PER_PAGE, shortKey } from "../core/book.js";
import { createSim } from "../core/sim.js";
import * as S from "./story.js";
import { h, fill, say, art, act, fmt, tiles, kindBar, kindMenu, wordMenu, strip, sentence, writeAll, kindName, kindLabel, plural, createClock } from "./parts.js";

const slots = (sec) => ({ demo: sec.querySelector(".demo"), acts: sec.querySelector(".acts"), small: sec.querySelector(".small") });
const fig = (n) => h("b", { class: "fig", text: typeof n === "number" ? fmt(n) : n });
const cap = (text) => h("p", { class: "cap", text });
const tag = (text = "made-up trade") => h("span", { class: "tag", text });
const inkOf = (trade) => (trade.side === "sell" ? "ink-sell" : "ink-buy");
// a wallet, a signature or a hash, shortened: a code, so it is set in the blocky face
const keyOf = (text, head = 6, tail = 6) => h("span", { class: "key", text: shortKey(text, head, tail) });
// Shown instead of the numbers when this page's reading of a fingerprint no longer matches the engine's.
const stale = () => h("p", { class: "stale", text: "The rule has changed and this page has not caught up yet. The book is right; trust the book." });

// ---------------------------------------------------------------------------------------------
// 1. One trade, one word: a trade comes in, he writes a word.

function trade(sec, ctx) {
  const { demo, acts } = slots(sec);
  const clock = createClock();
  const KEEP = 24; // words of the story kept on the little page
  const ticket = h("div", { class: "ticket" });
  const paper = h("div", { class: "paper" });
  const score = h("p", { class: "score" });
  demo.append(ticket, art("down", "flow"), paper, score);
  acts.append(act("Make a trade", () => make(), { main: true }));

  function draw(typed = false) {
    const items = ctx.story.items;
    const it = items[items.length - 1];
    if (!it) fill(ticket, h("span", { class: "cap", text: "No trade yet." }));
    else {
      const t = it.trade;
      fill(ticket, 
        tag(),
        h("span", { class: "cap" }, h("span", { class: `val ${inkOf(t)}`, text: t.side === "sell" ? "Sell" : "Buy" }), h("span", { class: "val", text: ` of ${t.sol} SOL` })),
        h("span", { class: "cap" }, "wallet ", keyOf(t.wallet, 4, 4)),
        h("span", { class: "cap" }, "signature ", keyOf(t.signature, 4, 4)),
      );
    }
    const letters = writeAll(paper, items.slice(-KEEP), { typed, cut: items.length > KEEP });
    fill(score, h("span", { text: `Trades ${items.length}` }), h("span", { text: `Words ${items.length}` }));
    letters.forEach((ch, i) => clock.later(90 + i * 75, () => { ch.classList.remove("h"); ch.classList.add("in"); ctx.monkey.stamp(); }));
  }

  function make() {
    clock.clear();
    ctx.story.next();
    draw(!ctx.still());
  }

  return {
    enter() {
      draw();
      if (!ctx.story.items.length) clock.later(ctx.still() ? 0 : 700, make); // nobody lands on an empty page
    },
    leave() { clock.clear(); },
  };
}

// ---------------------------------------------------------------------------------------------
// 2. The fingerprint: a signature and a block hash pressed into 32 numbers.

function fingerprint(sec, ctx) {
  const { demo, acts } = slots(sec);
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const AT = 2; // the letter that "Change one letter" changes
  let changed = false;
  const pair = h("div", { class: "pair" });
  const grid = h("div", { class: "group" });
  const told = h("p", { class: "cap" });
  demo.append(h("p", { class: "strip" }, tag()), pair, art("down", "flow"), grid, told);
  const toggle = act("Change one letter", () => { changed = !changed; draw(true); });
  acts.append(toggle, act("Next trade", () => { changed = false; ctx.story.next(); draw(true); }));

  // a long key, shortened; one of its first letters can be lit
  function key(text, lit = -1) {
    const line = h("span", { class: "key keyline" });
    const head = text.length > 24 ? text.slice(0, 14) : text;
    [...head].forEach((c, i) => line.append(i === lit ? h("mark", { text: c }) : c));
    if (head !== text) line.append("…", text.slice(-6));
    return line;
  }

  function draw(moved = false) {
    const it = ctx.sample();
    const sig = it.trade.signature;
    const other = B58[(B58.indexOf(sig[AT]) + 1) % B58.length];
    const shownSig = changed ? sig.slice(0, AT) + other + sig.slice(AT + 1) : sig;
    const bytes = changed ? digestOf(shownSig, it.trade.blockhash) : it.bytes;
    const differs = (i) => bytes[i] !== it.bytes[i];
    fill(pair, 
      h("div", {}, h("span", { class: "cap", text: "Signature" }), key(shownSig, changed ? AT : -1)),
      h("div", {}, h("span", { class: "cap", text: "Block hash" }), key(it.trade.blockhash)),
    );
    fill(grid, h("span", { class: "cap", text: "Fingerprint" }), tiles(bytes, { on: changed ? differs : null, pop: moved && !ctx.still() }));
    const count = changed ? Array.from(bytes).filter((b, i) => differs(i)).length : 0;
    say(told, changed ? `One letter changed, and ${count} of the ${bytes.length} numbers are different.` : `Same signature, same block hash: always these ${bytes.length} numbers.`);
    toggle.lastChild.textContent = changed ? "Put it back" : "Change one letter";
    if (moved) ctx.monkey.stamp(4);
  }

  return { enter() { changed = false; draw(); }, leave() {} };
}

// ---------------------------------------------------------------------------------------------
// 3. The kind of word: the first four numbers land on a bar of shares.

function kind(sec, ctx) {
  const { demo, acts } = slots(sec);
  const clock = createClock();
  acts.append(act("Next trade", () => { ctx.story.next(); draw(true); }, { main: true }));

  function draw(moved = false) {
    clock.clear();
    const it = ctx.sample();
    const p = it.pick;
    demo.classList.remove("rolling", "landed");
    fill(demo, 
      strip(it, "kind"),
      it.ended ? cap("This trade first closed the sentence before, so its word is read from the second row of numbers. Page 6 shows why.") : null,
      p.rollOk ? h("div", { class: "group" },
        h("span", { class: "cap", text: `Fingerprint, numbers ${p.at + 1} to ${p.at + 8}` }),
        tiles(it.bytes, { from: p.at, to: p.at + 8, on: (i) => i < p.at + 4, off: (i) => i >= p.at + 4 })) : stale(),
      p.rollOk ? h("p", {}, "As one number: ", fig(p.big), h("br"), "Divided by ", fig(p.total), ", the shares added up, it leaves ", h("b", { class: "fig hide-rolling", text: fmt(p.roll) }), ".") : null,
      kindBar(p),
      kindMenu(p),
    );
    if (!moved || ctx.still()) return;
    demo.classList.add("rolling");
    ctx.monkey.think(620);
    clock.later(620, () => { demo.classList.remove("rolling"); demo.classList.add("landed"); ctx.monkey.joy(); });
  }

  return { enter() { draw(); }, leave() { clock.clear(); demo.classList.remove("rolling", "landed"); } };
}

// ---------------------------------------------------------------------------------------------
// 4. The word: the next four numbers count along the list of that kind.

function word(sec, ctx) {
  const { demo, acts } = slots(sec);
  acts.append(act("Next trade", () => { ctx.story.next(); draw(true); }, { main: true }));
  const more = h("div", { class: "more" }, act("See my word lists", () => ctx.openLists(ctx.sample())));

  // Why the list is shorter than the whole list of its kind, when it is. Only said when story.js
  // rebuilt the very list the engine used (pick.list), since it is told from the same two facts.
  function narrowed(p) {
    if (!p.list) return null;
    const out = [];
    if (p.state.art && (p.type === "NOUN" || p.type === "ADJ")) out.push(`After “${p.state.art}” only ${p.state.art === "an" ? "vowel" : "consonant"} sounds stay on the list.`);
    if (p.type === "NOUN" && p.state.num === "SG") out.push("The article before wants one thing, so no plurals are on it.");
    if (p.type === "NOUN" && p.state.num === "PL") out.push("The article before wants many, so only plurals are on it.");
    return out.length ? cap(out.join(" ")) : null;
  }

  function draw(moved = false) {
    const it = ctx.sample();
    const p = it.pick;
    const name = kindName(p.type);
    demo.classList.remove("landed");
    fill(demo, 
      strip(it, "word"),
      p.placeOk ? h("div", { class: "group" },
        h("span", { class: "cap", text: `Fingerprint, numbers ${p.at + 1} to ${p.at + 8}` }),
        tiles(it.bytes, { from: p.at, to: p.at + 8, on: (i) => i >= p.at + 4, off: (i) => i < p.at + 4 })) : stale(),
      p.placeOk ? h("p", {}, "As one number: ", fig(p.big2), h("br"), "Divided by ", fig(p.listSize), `, the ${plural(name)} that fit here, it leaves `, fig(p.index), ".") : null,
      cap(p.index === 0 ? "Nothing is left over, so it is the first one on the list." : `So I pass ${fmt(p.index)} ${p.index === 1 ? name : plural(name)} and take the next one.`),
      wordMenu(p, { side: it.trade.side }),
      narrowed(p),
      more,
    );
    if (!moved || ctx.still()) return;
    void demo.offsetWidth; // so that the flash plays again on the next trade
    demo.classList.add("landed");
    ctx.monkey.stamp(Math.min(6, it.word.text.length));
  }

  return { enter() { draw(); }, leave() { demo.classList.remove("landed"); } };
}

// ---------------------------------------------------------------------------------------------
// 5. Three shapes of sentence, each word with its kind under it.

function shapes(sec, ctx) {
  const { demo, acts, small } = slots(sec);
  const NAMES = [["statement", "I say something"], ["question", "I ask"], ["command", "I give an order"]];
  let found = null, cries = [];
  let turn = 0;
  acts.append(act("Other examples", () => { turn++; draw(); ctx.monkey.think(520); }, { main: true }));
  const more = h("div", { class: "more" }, act("See what may follow what", () => ctx.openMap()));

  function gloss(s) {
    const texts = s.items.map((it) => it.word.text + (it.word.commaAfter ? "," : ""));
    s.items.forEach((it, i) => { if (it.word.commaBefore && i > 0) texts[i - 1] += ","; });
    texts[texts.length - 1] += s.mark;
    return h("div", { class: "gloss" }, s.items.map((it, i) => h("span", { class: "g" }, h("b", { text: texts[i] }), h("i", { text: kindName(it.word.type) }))));
  }

  const shape = (name, list) => (list.length ? h("div", { class: "shape" }, h("span", { class: "cap", text: name }), gloss(list[turn % list.length])) : null);

  function draw() {
    fill(demo, NAMES.map(([key, name]) => shape(name, found.plain[key])), shape("Any of the three, after a cry", cries), more);
  }

  return {
    enter() {
      if (!found) {
        found = S.findSentences();
        // the sentences that open with a cry, the three shapes taking turns
        const byShape = NAMES.map(([key]) => found.cry[key]);
        for (let i = 0; byShape.some((list) => list[i]); i++) for (const list of byShape) if (list[i]) cries.push(list[i]);
        // the small print about commas says what the engine was seen to do
        const before = found.commas.before.map((w) => `“${w}”`);
        const said = [];
        if (before.length) said.push(`before ${before.length > 1 ? `${before.slice(0, -1).join(", ")} and ${before[before.length - 1]}` : before[0]}`);
        if (found.commas.afterCry) said.push("after a cry");
        say(small, said.length ? `A comma goes ${said.join(", and ")}. Commas are not words.` : "");
      }
      draw();
    },
    leave() {},
  };
}

// ---------------------------------------------------------------------------------------------
// 6. The full stop: one trade read in four places.

function stop(sec, ctx) {
  const { demo, acts, small } = slots(sec);
  const clock = createClock();
  const tale = S.createStory("endings-1", { cheap: true });
  let it = null;
  const SHORT = 7; // the sentence that ends has to fit on a line or two
  const nextEnding = () => { do { it = tale.next(); } while (!it.punct || it.closed.length > SHORT); };
  acts.append(act("Another ending", () => { nextEnding(); draw(true); }, { main: true }));

  // One reading: the numbers, an arrow, what they come to; under it the rule in a few words.
  const went = (numbers, outcome) => h("span", { class: "went" }, numbers, art("right", "to"), h("b", { text: outcome }));
  const read = (lines, why, { before = null, after = null } = {}) => h("li", { class: "read" },
    before, h("div", { class: "read-line" }, lines), after, why ? cap(why) : null);

  function draw(moved = false) {
    clock.clear();
    const b = it.bytes, e = it.ended, p = it.pick, mark = it.punct.mark;
    // The two thresholds are typed in story.js: they are only said when they hold for this very
    // trade and held all through the long check that runs when the manual opens.
    const markOk = ctx.checks.mark && (mark === "?" || (mark === "!") === (b[16] < S.BANG_UNDER));
    const paraOk = ctx.checks.paragraph && it.punct.paragraph === (b[17] < S.PARA_UNDER);
    const line = h("span", { class: "sofar" }, sentence(it.closed), h("b", { class: "slot", text: mark }), " ", h("b", { class: "slot", text: it.word.text }));
    const asked = mark === "?";
    const said = [];
    if (asked) said.push("It began as a question, so “?”.");
    else if (markOk) said.push(`Number 17: under ${S.BANG_UNDER} means “!”.`);
    if (paraOk) said.push(`Number 18: under ${S.PARA_UNDER} means a new paragraph.`);
    const again = p.rollOk && p.placeOk;
    const rows = [
      read(went(e.rollOk ? tiles(b, { from: 0, to: 4, few: true }) : null, "full stop"),
        e.rollOk ? `Numbers 1 to 4 leave ${fmt(e.roll)} of ${fmt(e.total)}: its share of the bar.` : null, { after: kindBar(e) }),
      read([
        went(!asked && markOk ? tiles(b, { from: 16, to: 17, few: true }) : null, `“${mark}”`),
        went(paraOk ? tiles(b, { from: 17, to: 18, few: true }) : null, it.punct.paragraph ? "new paragraph" : "same paragraph"),
      ], said.join(" ")),
      read(went(null, `${kindName(p.type)}: ${it.word.text}`), again ? "Numbers 9 to 16 pick the next kind and word, as before." : null,
        { before: again ? tiles(b, { from: 8, to: 16 }) : null }),
    ];
    const list = h("ol", { class: "reads" }, rows);
    fill(demo, h("p", { class: "strip" }, tag(), line), it.sound ? null : stale(), list);
    if (!moved || ctx.still()) return;
    list.classList.add("stepping");
    rows.forEach((row, i) => {
      row.classList.add("todo");
      clock.later(120 + i * 420, () => { row.classList.remove("todo"); ctx.monkey.stamp(2); });
    });
  }

  return {
    enter() {
      if (!it) nextEnding();
      // said once the long check has agreed (how.js calls this page again when it has)
      say(small, ctx.checks.mark && ctx.checks.paragraph
        ? `A question ends with “?”. Otherwise I write “!” about one time in ${Math.round(256 / S.BANG_UNDER)}, and start a new paragraph about one time in ${Math.round(256 / S.PARA_UNDER)}.`
        : "");
      draw();
    },
    leave() { clock.clear(); },
  };
}

// ---------------------------------------------------------------------------------------------
// 7. The page: 150 words, closed by the next trade, one memo naming the one before.

function memo(sec, ctx) {
  const { demo, acts } = slots(sec);
  const clock = createClock();
  const LINES = 7; // bars of text on the little drawing of a full page
  let book = null, sim = null, picked = 0, filling = false;
  const chain = h("div", { class: "chain" });
  const meter = h("div", { class: "meter-line" });
  const box = h("div", { class: "memo-box" });
  demo.append(chain, meter, box);
  const fillButton = act("Fill the page", () => fillPage(), { main: true });
  acts.append(fillButton);

  function start() {
    book = createBook();
    sim = createSim({ seed: "manual-pages", startTime: 0 });
    while (book.pages.length < 2 || book.current.words < 61) book.push(sim.next());
    picked = book.pages[book.pages.length - 1].number;
  }

  // a little drawing of a page; a closed one can be pressed to read its memo
  function leaflet(page, closed) {
    const rows = closed ? LINES : Math.max(1, Math.round((page.words / book.wordsPerPage) * LINES));
    return h("button", {
      class: "leaflet", type: "button", disabled: !closed, "aria-pressed": closed ? String(page.number === picked) : null,
      onclick: closed ? () => { picked = page.number; draw(); ctx.monkey.stamp(2); } : null,
    },
      h("span", { class: "sheetlet" }, h("i", { style: `--rows:${rows}` })),
      h("span", { text: `Page ${page.number}` }),
      h("span", { class: "cap", text: closed ? "closed" : "being written" }));
  }
  const names = () => h("span", { class: "names" }, art("left"), h("span", { text: "names" }));

  function drawMeter() {
    const cur = book.current, bar = h("span", { class: "bar", role: "img", "aria-label": `${cur.words} of ${book.wordsPerPage} words` }, h("i"));
    fill(meter, h("span", { text: `Page ${cur.number}` }), bar, h("b", { class: "fig", text: `${cur.words}/${book.wordsPerPage}` }));
    // the bar is --bar art pixels long (how.css) and fills one whole pixel at a time
    const length = parseFloat(getComputedStyle(bar).getPropertyValue("--bar")) || 50;
    bar.style.setProperty("--fill", Math.round((cur.words / book.wordsPerPage) * length));
  }

  function draw() {
    const closed = book.pages.slice(-2);
    fill(chain, leaflet(closed[0], true), names(), leaflet(closed[1], true), names(), leaflet(book.current, false));
    drawMeter();
    const page = book.pages[picked - 1];
    // A memo is one line that names the page and the memo before it, then the text of the page.
    const cut = page.memo.text.indexOf("\n");
    const first = page.memo.text.slice(0, cut).split(" ").flatMap((w) => [" ", w.length > 20 ? keyOf(w) : w]);
    const text = page.memo.text.slice(cut + 1).replace(/\s+/g, " ");
    fill(box, 
      h("p", {}, tag(page.memo.simulated ? "made-up memo" : "memo"), ...first),
      h("p", { text: `${text.slice(0, 64).trimEnd()}…` }),
      cap(`${fmt(page.words)} words, ${fmt(page.memo.bytes)} bytes, one memo.${page.memo.simulated ? " Nothing was sent." : ""}`),
    );
  }

  // Trades until the page he is on is closed by the one after its last word.
  function fillPage() {
    if (filling) return;
    const step = () => { for (const e of book.push(sim.next())) if (e.kind === "page") return e; return null; };
    const done = (page) => { filling = false; fillButton.disabled = false; picked = page.number; draw(); ctx.monkey.joy(); };
    if (ctx.still()) { let page; do { page = step(); } while (!page); done(page); return; }
    filling = true;
    fillButton.disabled = true;
    (function tick() {
      let page = null;
      for (let i = 0; i < 4 && !page; i++) page = step();
      if (page) { done(page); return; }
      drawMeter();
      ctx.monkey.stamp();
      clock.later(45, tick);
    })();
  }

  return {
    enter() { if (!book) start(); draw(); },
    leave() { clock.clear(); filling = false; fillButton.disabled = false; },
  };
}

// ---------------------------------------------------------------------------------------------
// 8. Nobody picks: who knows what, and when.

function nobody(sec, ctx) {
  const { demo, acts } = slots(sec);
  const clock = createClock();
  const tale = S.createStory("manual-signing");
  let it = null, stage = 3;
  const list = h("ol", { class: "steps" });
  demo.append(h("p", { class: "strip" }, tag()), list);
  acts.append(act("Sign a made-up trade", () => { it = tale.next(); run(); }, { main: true }));

  const fact = (icon, name, value, unknown = false) => h("span", { class: unknown ? "fact unknown" : "fact" }, art(icon), `${name} `, typeof value === "string" ? h("span", { class: "val", text: value }) : value);
  const step = (n, title, ...facts) => h("li", { class: n > stage ? "step todo" : "step" }, h("span", { class: "step-n", text: String(n) }), h("div", { class: "step-body" }, h("span", { text: title }), ...facts));

  function draw() {
    const t = it.trade;
    fill(list, 
      step(1, "You sign the trade.",
        fact("tick", "signature", keyOf(t.signature, 4, 4)),
        fact("what", "block hash", "not made yet", true)),
      step(2, "A block takes it in.",
        fact("tick", "block hash", keyOf(t.blockhash, 4, 4))),
      step(3, "Only now is there a fingerprint, and I write.",
        h("span", { class: "fact" }, art("tick"), "the word ", h("b", { class: `slot ${inkOf(t)}`, text: it.word.text }))),
    );
  }

  function run() {
    clock.clear();
    if (ctx.still()) { stage = 3; draw(); return; }
    stage = 1;
    draw();
    ctx.monkey.pose("sit");
    clock.later(1500, () => { stage = 2; draw(); ctx.monkey.pose("idle"); });
    clock.later(2500, () => { stage = 3; draw(); ctx.monkey.stamp(4); });
  }

  return {
    enter() { if (!it) { it = tale.next(); run(); } else { stage = 3; draw(); } },
    leave() { clock.clear(); stage = 3; },
  };
}

// ---------------------------------------------------------------------------------------------
// 9. Try it: any text as signature and block hash, a place in a sentence, and what comes out.

function lab(sec, ctx) {
  const { demo, acts } = slots(sec);
  const form = sec.querySelector(".lab");
  const pairs = createSim({ seed: "manual-lab", startTime: 0 });
  // Where the sentence stands, in plain words; each is a real state of the engine, found by story.js.
  const WANT = {
    article: ["After an article", (s, w) => s.state === "DET:S" && !s.art && s.num === "ANY" && w.length === 1],
    an: ["After “an”", (s, w) => s.state === "DET:S" && s.art === "an" && w.length === 1],
    subject: ["After the subject", (s, w) => s.state === "SUBJ" && !s.q && w.length >= 2 && w.length <= 3],
    verb: ["After a verb that takes an object", (s, w) => s.state === "VT" && !s.q && w.length >= 2 && w.length <= 4],
    done: ["After a complete sentence", (s, w) => s.state === "DONE" && !s.q && w.length >= 2 && w.length <= 4],
  };
  let stands = null, chosen = 0;
  const box = (id) => h("textarea", { id, rows: "2", spellcheck: "false", autocapitalize: "off", autocorrect: "off" });
  const sig = box("lab-sig"), hash = box("lab-hash");
  const options = h("div", {});
  const outcome = h("p", { class: "outcome", "aria-live": "polite" });
  // the pair in the boxes is labelled made-up for as long as it is the one this page put there
  const madeUp = tag("made-up pair");
  let given = null;
  form.append(
    h("label", { class: "field" }, h("span", { class: "cap field-name" }, "Signature", madeUp), sig),
    h("label", { class: "field" }, h("span", { class: "cap", text: "Block hash" }), hash),
    outcome,
    h("fieldset", { class: "stand" }, h("legend", { class: "cap", text: "Where the sentence stands" }), options),
  );
  form.addEventListener("submit", (e) => e.preventDefault());
  // a box is as tall as the text in it
  const fit = () => { for (const f of [sig, hash]) { f.style.height = "auto"; f.style.height = `${f.scrollHeight + f.offsetHeight - f.clientHeight}px`; } };
  for (const field of [sig, hash]) field.addEventListener("input", () => { fit(); draw(); ctx.monkey.stamp(); });
  addEventListener("resize", () => { if (stands && !sec.hidden) fit(); });
  acts.append(act("Another made-up pair", () => { fresh(); draw(); ctx.monkey.stamp(4); }));

  function fresh() {
    given = pairs.next();
    sig.value = given.signature;
    hash.value = given.blockhash;
    fit();
  }

  function build() {
    const found = S.findStands(Object.fromEntries(Object.entries(WANT).map(([id, [, test]]) => [id, test])), { seed: "stands-6" });
    stands = [{ name: "At the start of a sentence", state: S.initialState(), words: [] }];
    for (const [id, [name]] of Object.entries(WANT)) if (found[id]) stands.push({ name, ...found[id] });
    stands.forEach((s, i) => {
      const input = h("input", { type: "radio", name: "stand", value: String(i) });
      input.checked = i === chosen;
      const label = h("label", { class: i === chosen ? "opt picked" : "opt" }, input, h("span", { class: "cur" }, art("pick")), h("span", { text: s.name }));
      input.addEventListener("change", () => {
        chosen = i;
        [...options.children].forEach((node, k) => node.classList.toggle("picked", k === i));
        draw();
        ctx.monkey.think(420);
      });
      options.append(label);
    });
    fresh();
  }

  function draw() {
    const st = stands[chosen];
    const r = S.read(st.state, sig.value, hash.value);
    const item = { ...r, trade: {}, sofar: r.punct ? [] : st.words, closed: r.punct ? st.words : null };
    const p = r.pick, e = r.ended;
    const used = (i) => (i >= p.at && i < p.at + 8) || (e && (i < 4 || i === 17 || (i === 16 && r.punct.mark !== "?")));
    fill(demo, 
      strip(item, "word", { tag: null }),
      h("div", { class: "group" }, h("span", { class: "cap", text: "Fingerprint" }), tiles(r.bytes, { on: used })),
      r.sound ? null : stale(),
      e ? cap(`The roll first landed on full stop: the sentence closes with “${r.punct.mark}”${r.punct.paragraph ? " and a new paragraph starts" : ""}. The word is then read from numbers 9 to 16.`) : null,
      p.rollOk ? h("p", {}, `Numbers ${p.at + 1} to ${p.at + 4} make `, fig(p.big), ". Divided by ", fig(p.total), " it leaves ", fig(p.roll), ": ", kindLabel(p.type), ".") : null,
      kindBar(p),
      p.placeOk ? h("p", {}, `Numbers ${p.at + 5} to ${p.at + 8} make `, fig(p.big2), ". Divided by ", fig(p.listSize), ` ${p.listSize === 1 ? kindName(p.type) : plural(kindName(p.type))} it leaves `, fig(p.index), ": place ", fig(p.index + 1), ".") : null,
    );
    fill(outcome, "I write", h("b", { text: r.word.text }));
    madeUp.hidden = !(given && sig.value === given.signature && hash.value === given.blockhash);
  }

  return {
    enter() { if (!stands) build(); fit(); draw(); },
    leave() {},
  };
}

export const PAGES = { trade, fingerprint, kind, word, shapes, stop, memo, nobody, lab };
export { WORDS_PER_PAGE };
