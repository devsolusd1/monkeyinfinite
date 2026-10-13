// Infinite Monkey, the manual: a small pixel book that explains how each word of the book is picked.
// This file is the book itself (leafing, the address, the status, night) and the monkey who acts
// on every page. What the pages show is in pages.js; where their numbers come from is in story.js;
// the two boxes for the curious are in extras.js.

import { drawArt } from "../ui/pixels.js";
import { createMonkeySprite } from "../monkey/sprite.js";
import { digestOf } from "../core/grammar.js";
import * as S from "./story.js";
import { PAGES, WORDS_PER_PAGE } from "./pages.js";
import { createExtras } from "./extras.js";
import { h, say, numberText, fmt, clamp, wait, artPixel, createClock, drawOwn } from "./parts.js";

const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
drawArt();
drawOwn();

// "Keep still": the visitor asked their device for less motion. Pages then change without the
// turn, nothing is typed letter by letter and he stands on one drawing.
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const still = () => calm.matches;

// ---- the two fixed strips: how much of the window they cover ----
const strips = { top: $("#top"), hud: $("#hud") };
function measureStrips() {
  root.style.setProperty("--top-h", `${strips.top.offsetHeight}px`);
  root.style.setProperty("--hud-h", `${strips.hud.offsetHeight}px`);
}
new ResizeObserver(measureStrips).observe(strips.top);
new ResizeObserver(measureStrips).observe(strips.hud);
measureStrips();

// ---- numbers in the text come from the engine, not from this page ----
const voc = S.vocabulary();
const NUMBERS = { bytes: digestOf("", "").length, maxSentence: S.MAX_SENTENCE, perPage: WORDS_PER_PAGE };
for (const node of document.querySelectorAll("[data-n]")) if (NUMBERS[node.dataset.n] != null) node.textContent = fmt(NUMBERS[node.dataset.n]);
const FILL = {
  twoWords: voc.twoWord.length ? `A few entries in my lists are two words, like “${voc.twoWord[0]}”${voc.twoWord[1] ? ` and “${voc.twoWord[1]}”` : ""}. Each counts as one word.` : "",
  vocabulary: `${fmt(voc.entries)} entries in ${voc.lists} lists, sorted by kind. The lists are fixed and public.`,
};
for (const node of document.querySelectorAll("[data-fill]")) if (FILL[node.dataset.fill] != null) node.textContent = FILL[node.dataset.fill];
numberText($("#pages")); // figures in the blocky face, as on the front page

// ---- the monkey: one sprite, at home on the page that is on show ----
function createActor() {
  const sprite = createMonkeySprite({ scale: artPixel() });
  const clock = createClock();
  let quietSince = performance.now(), life = "idle";
  const stir = () => { quietSince = performance.now(); life = "idle"; };
  sprite.still(still());

  // Between presses he stands and breathes, then sits, eats, and at last sleeps, as in the book.
  const ROUND = [[4000, "sit"], [8400, "eat"], [11000, "sit"], [12400, "think"], [15000, "idle"]];
  setInterval(() => {
    if (still() || document.hidden || sprite.state === "stamp" || sprite.state === "joy") return;
    const quiet = performance.now() - quietSince;
    if (quiet < 5000) return;
    const want = quiet > 40000 ? "sleep" : ROUND.find(([until]) => (quiet - 5000) % 15000 < until)[1];
    if (want !== life) { life = want; sprite.set(want); }
  }, 400);

  return {
    home(slot) { clock.clear(); stir(); sprite.set("idle"); slot.append(sprite.el); },
    // n strikes, the hands alternating
    stamp(times = 1) { if (still()) return; stir(); for (let i = 0; i < times; i++) clock.later(i * 100, () => { stir(); sprite.stamp(); }); },
    think(ms = 600) { if (still()) return; stir(); sprite.set("think"); clock.later(ms, () => { if (sprite.state === "think") sprite.set("idle"); stir(); }); },
    joy() {
      if (still()) return;
      stir();
      const px = artPixel();
      // the sprite plays the pose; the hop off the ground is ours, in steps
      sprite.el.animate([0, -3, -5, -5, -3, 0].map((n) => ({ transform: `translateY(${n * px}px)` })), { duration: 420, easing: "step-end" });
      sprite.joy().then(stir);
    },
    pose(name) { if (still()) return; stir(); if (name !== "idle") quietSince = performance.now() + 6000; sprite.set(name); },
    rescale() { sprite.setScale(artPixel()); },
    still(on) { sprite.still(on); },
  };
}
const monkey = createActor();

// ---- what the pages share ----
const story = S.createStory("the manual"); // the made-up trades that pages 1 to 4 follow
const checks = { read: true, mark: true, paragraph: true, max: true, question: true };
const extras = createExtras();
const ctx = {
  story, monkey, still, checks,
  sample: () => story.items[story.items.length - 1] || story.next(), // the trade under the glass: the last one made
  openLists: extras.openLists,
  openMap: extras.openMap,
};

const sections = [...document.querySelectorAll(".page")];
const COUNT = sections.length;
const pages = sections.map((sec) => PAGES[sec.dataset.demo]?.(sec, ctx) || { enter() {}, leave() {} });
const titleOf = (n) => sections[n - 1].querySelector(".title").textContent;

// ---- leafing ----
const pagesEl = $("#pages"), leaf = $("#flip"), prev = $("#prev"), next = $("#next"), pips = $("#pips");
const spread = matchMedia("(min-width: 1040px)");
const STEP_MS = 74; // one step of a turning page, as on the front page
// How far the leaf has come over, as [side of the spine, share of a page's width].
const TURN_SPREAD = [["r", 0.74], ["r", 0.44], ["r", 0.14], ["l", 0.14], ["l", 0.44], ["l", 0.74]];
const TURN_SINGLE = [["r", 0.72], ["r", 0.42], ["r", 0.12]];
const snap = (v, px) => Math.round(v / px) * px;

const fromHash = () => { const n = parseInt(location.hash.slice(1), 10); return Number.isFinite(n) ? clamp(n, 1, COUNT) : 1; };
let shown = fromHash();
let busy = false;

for (let n = 1; n <= COUNT; n++) {
  pips.append(h("button", { class: "pip", type: "button", "aria-label": `Page ${n}: ${titleOf(n)}`, onclick: () => show(n) }, h("i")));
}

function status() {
  say($("#hud-page"), `Page ${shown} of ${COUNT}`);
  prev.disabled = shown <= 1;
  next.disabled = shown >= COUNT;
  [...pips.children].forEach((pip, i) => pip.setAttribute("aria-current", String(i + 1 === shown)));
  document.title = `${titleOf(shown)} · The manual · Infinite Monkey`;
  if (location.hash !== `#${shown}`) history.replaceState(null, "", `#${shown}`);
}

function arrive() {
  monkey.home(sections[shown - 1].querySelector(".actor"));
  pages[shown - 1].enter();
  status();
}

// One turn of a leaf, in a few chunky steps. On the open book the page on top keeps its left half
// until the leaf has landed on it, the way the front page turns; a single page is simply uncovered.
async function flip(dir, from, to) {
  const px = artPixel();
  const open = spread.matches;
  const width = open ? pagesEl.clientWidth / 2 : pagesEl.clientWidth;
  const x0 = open ? width : 0, height = pagesEl.clientHeight;
  const steps = [...(open ? TURN_SPREAD : TURN_SINGLE)];
  if (dir < 0) steps.reverse();
  const top = dir > 0 ? from : to;
  if (open) {
    to.hidden = false;
    top.style.clipPath = "inset(0 50% 0 0)";
    top.style.zIndex = "1";
  } else if (dir > 0) { from.hidden = true; to.hidden = false; }
  leaf.hidden = false;
  for (const [side, share] of steps) {
    const w = snap(width * share, px);
    const lift = Math.round((1 - share) * 4) * px; // a leaf on its way over stands taller than the page
    leaf.dataset.side = side;
    Object.assign(leaf.style, { left: `${side === "r" ? x0 : x0 - w}px`, top: `${-lift}px`, width: `${w}px`, height: `${height + 2 * lift}px` });
    await wait(STEP_MS);
  }
  leaf.hidden = true;
  top.style.clipPath = "";
  top.style.zIndex = "";
  from.hidden = true;
  to.hidden = false;
}

async function show(n, { turn = true } = {}) {
  n = clamp(n, 1, COUNT);
  if (busy || n === shown) return;
  const from = sections[shown - 1], to = sections[n - 1];
  const dir = n > shown ? 1 : -1;
  pages[shown - 1].leave();
  busy = true;
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "auto" }); // a page is read from its top
  if (turn && !still() && !document.hidden) await flip(dir, from, to);
  else { from.hidden = true; to.hidden = false; }
  shown = n;
  busy = false;
  arrive();
}

sections.forEach((sec, i) => { sec.hidden = i + 1 !== shown; });
arrive();

prev.addEventListener("click", () => show(shown - 1));
next.addEventListener("click", () => show(shown + 1));
addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector("dialog[open]")) return;
  const at = e.target;
  if (at instanceof HTMLElement && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))) return; // arrows belong to the text being typed
  if (e.key === "ArrowLeft") show(shown - 1);
  if (e.key === "ArrowRight") show(shown + 1);
});
addEventListener("hashchange", () => show(fromHash(), { turn: false }));

addEventListener("resize", () => monkey.rescale());
calm.addEventListener("change", () => monkey.still(still()));

// ---- the long check: does this manual still read a fingerprint the way the engine does? ----
// It runs in the background. What fails is taken off the pages rather than left there wrong.
S.selfCheck((ok) => {
  Object.assign(checks, ok);
  for (const node of document.querySelectorAll("[data-holds]")) if (checks[node.dataset.holds] === false) node.hidden = true;
  if (!busy && (!ok.mark || !ok.paragraph || !ok.read)) pages[shown - 1].enter();
});

// ---- night, remembered on this device: the same choice as on the front page ----
const night = $("#night");
function setNight(on) {
  if (on) root.dataset.theme = "night"; else delete root.dataset.theme;
  night.setAttribute("aria-pressed", String(on));
  night.setAttribute("aria-label", on ? "Day mode" : "Night mode");
}
setNight(root.dataset.theme === "night");
night.addEventListener("click", () => {
  const on = root.dataset.theme !== "night";
  setNight(on);
  try { localStorage.setItem("infinite-monkey-night", on ? "1" : "0"); } catch (e) { /* private mode: the choice lasts until the tab closes */ }
});
