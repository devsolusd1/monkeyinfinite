// Infinite Monkey, the front page: an 8-bit book, and a monkey who is the cursor.
// This file only wires the parts together:
//   ui/feed.js    where trades come from (the rehearsal lives there, and only there)
//   core/book     trades in, words and pages out
//   ui/writer.js  the monkey puts the words on the page and turns it when it is full
//   ui/leaves.js  which pages of the book are on show, and the turning of a page
//   ui/card.js    which trade made him write a word (its transaction, its wallet), how it was picked
//   ui/links.js   the addresses the page links to: the explorer, the manual
//   ui/monkey.js  where he stands, walks and jumps; monkey/sprite.js is what he looks like

import { createBook } from "./core/book.js";
import { createFeed } from "./ui/feed.js";
import { createSheet } from "./ui/sheet.js";
import { createMonkey } from "./ui/monkey.js";
import { createWriter } from "./ui/writer.js";
import { createLeaves } from "./ui/leaves.js";
import { createCard } from "./ui/card.js";
import { createCamera } from "./ui/camera.js";
import { createSound } from "./ui/sound.js";
import { drawArt, tileUrl, ART } from "./ui/pixels.js";
import { artPixel } from "./ui/util.js";
import { keepNumbered } from "./ui/figures.js";
// The monkey himself, drawn by hand in monkey/sprite.js. (ui/sprite-standin.js is a crude
// stand-in with the same contract, kept for building the page without the real one.)
import { createMonkeySprite } from "./monkey/sprite.js";

const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
drawArt();
// the inside of the cover is papered with bananas, two to a tile of 28 art pixels
root.style.setProperty("--endpaper", tileUrl(ART.banana, { k: "#1d1d2b", y: "#ffd21f" }, 28, [[2, 3], [16, 17]]));

// "Keep still": the visitor asked their device for less motion. Words then appear whole,
// pages change without the turn and he stands on one frame.
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const still = () => calm.matches;

// ---- the two fixed strips: how much of the window they cover ----
const strips = { top: $("#top"), hud: $("#hud") };
const edge = { top: 0, hud: 0 };
function measureStrips() {
  edge.top = strips.top.offsetHeight;
  edge.hud = strips.hud.offsetHeight;
  root.style.setProperty("--top-h", `${edge.top}px`);
  root.style.setProperty("--hud-h", `${edge.hud}px`);
}
new ResizeObserver(measureStrips).observe(strips.top);
new ResizeObserver(measureStrips).observe(strips.hud);
measureStrips();

// ---- the rehearsal starts in the middle of the book, so nobody lands on an empty page ----
// (For looking at the end of a page without waiting for it: open the page with ?words=147.)
const book = createBook();
const feed = createFeed();
const wordsIn = Math.min(book.wordsPerPage, Number(new URLSearchParams(location.search).get("words")) || 60);
while (book.pages.length < 3 || book.current.words < wordsIn) book.push(feed.earlier());

// ---- the parts ----
const sound = createSound();
const sheet = createSheet($("#text"));
const recto = $("#recto");
const leaves = createLeaves({ root: $("#pages"), book, sound, still, onShow });
const monkey = createMonkey($("#monkey"), createMonkeySprite({ scale: artPixel() }), {
  still, pageWidth: leaves.pageWidth, onJump: () => sound.hop(),
});
const card = createCard($("#card"), { topEdge: () => edge.top, bottomEdge: () => edge.hud, rehearsal: feed.rehearsal });
keepNumbered($("#card"), $("#memo"), $("#verso-memo"), $("#banner"), document.querySelector(".plate"));
const camera = createCamera({
  focusY: () => recto.getBoundingClientRect().top + window.scrollY + monkey.at().y,
  topEdge: () => edge.top, bottomEdge: () => edge.hud, tall: () => monkey.height(), still,
  ignore: ".card",
});

// ---- the status: which page, and how many of its words are written ----
const hud = $("#hud"), prev = $("#prev"), next = $("#next"), back = $("#back"), banner = $("#banner");
const bar = $("#bar");
let written = 0;
function showCount(words = written) {
  written = words;
  // The bar is --bar art pixels long (style.css) and fills one whole pixel at a time.
  const length = parseFloat(getComputedStyle(bar).getPropertyValue("--bar")) || 60;
  $("#hud-count").textContent = `${words}/${book.wordsPerPage}`;
  bar.setAttribute("aria-label", `${words} of ${book.wordsPerPage} words`);
  bar.style.setProperty("--fill", Math.round((words / book.wordsPerPage) * length));
}
function showStatus() {
  const live = leaves.live;
  hud.dataset.mode = live ? "live" : "read";
  $("#hud-page").textContent = live ? `Page ${leaves.shown}` : `Page ${leaves.shown} of ${leaves.writing}`;
  prev.disabled = leaves.shown <= 1;
  next.disabled = live;
}

// The pages on show changed (a turn, a leaf back): the strips and the camera follow.
function onShow(changed = true) {
  if (changed) card.close();
  showStatus();
  camera.rest(!leaves.live);
  if (leaves.live) writer.reflow();
  else if (changed) window.scrollTo({ top: 0, behavior: still() ? "auto" : "smooth" }); // a finished page is read from its top
}

const writer = createWriter({
  sheet, monkey, leaves, sound, still,
  hooks: {
    wordDone: (word) => showCount(word.indexInPage),
    pageFull: (page) => showCount(page.words),
    pageDone: (page) => {
      card.close();
      $("#banner-text").textContent = `Page ${page.number} done`;
      banner.hidden = false;
    },
    newPage: () => showCount(0),
    turned: () => { banner.hidden = true; leaves.measure(); },
  },
});

leaves.measure();
showCount(book.current.words);
showStatus();
writer.restore(book.current);
history.scrollRestoration = "manual";
camera.jump();
feed.listen((trade) => writer.take(book.push(trade)));

// ---- one loop moves him, the camera and the open box ----
let before = performance.now();
function frame(now) {
  const dt = Math.min(64, now - before);
  before = now;
  monkey.frame(dt, now);
  camera.frame(dt);
  card.frame();
  // The way back to him: when a finished page is on show, or when the visitor scrolled him out of view.
  const lost = !leaves.live || (!camera.following && camera.where() !== "in");
  if (back.hidden === lost) back.hidden = !lost;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- leafing through the book ----
prev.addEventListener("click", () => leaves.back());
next.addEventListener("click", () => leaves.forward());
back.addEventListener("click", () => {
  if (leaves.live) camera.follow(); else leaves.toLive();
});
addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowLeft") leaves.back();
  if (e.key === "ArrowRight") leaves.forward();
});

// The text reflows when the window changes or the fonts arrive: the pages are measured again
// and he is put back at the end of his line.
function reflow() {
  monkey.rescale();
  leaves.measure();
  showCount();
  writer.reflow();
  if (camera.following) camera.jump();
}
addEventListener("resize", reflow);
document.fonts?.ready.then(reflow);
document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(reflow, 60); });
calm.addEventListener("change", () => { monkey.still(still()); reflow(); });

// ---- night, remembered on this device ----
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

// ---- sound, off until asked for ----
const soundButton = $("#sound");
soundButton.addEventListener("click", () => {
  soundButton.setAttribute("aria-pressed", String(sound.toggle()));
});
