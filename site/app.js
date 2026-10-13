// Infinite Monkey, the front page: an 8-bit book, and a monkey who is the cursor.
// This file only wires the parts together:
//   config.js     the token's address, where the backend answers, the way to X
//   ui/feed.js    where trades come from: the rehearsal, or the token's real trades (it alone knows which)
//   core/book     trades in, words and pages out
//   ui/writer.js  the monkey puts the words on the page and turns it when it is full
//   ui/leaves.js  which pages of the book are on show, and the turning of a page
//   ui/closed.js  the book shut: its front cover (the drawing is cover/cover.js) and the swing of the board
//   ui/card.js    which trade made him write a word (its transaction, its wallet), how it was picked
//   ui/token.js   the token's address: the tag in view, and the box it opens
//   ui/links.js   the addresses the page links to: the explorer, the manual
//   ui/monkey.js  where he stands, walks and jumps; monkey/sprite.js is what he looks like

import { CONFIG } from "./config.js";
import { createFeed } from "./ui/feed.js";
import { createSheet } from "./ui/sheet.js";
import { createMonkey } from "./ui/monkey.js";
import { createWriter } from "./ui/writer.js";
import { createLeaves } from "./ui/leaves.js";
import { createClosedBook } from "./ui/closed.js";
import { createCard } from "./ui/card.js";
import { createToken } from "./ui/token.js";
import { createCamera } from "./ui/camera.js";
import { createSound } from "./ui/sound.js";
import { drawArt, tileUrl, ART } from "./ui/pixels.js";
import { artPixel, el, wait } from "./ui/util.js";
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

// ---- which book is it? ----
// The feed asks the backend. No token yet (or nobody to ask): the rehearsal, which starts in the
// middle of a made-up book so nobody lands on an empty page. The token exists: the real book, on
// the page being written now. Until it knows (feed.ready, further down), the stage is empty.
const feed = createFeed();
let real = false; // the book on the page is the real one

// ---- what does not wait for the book: the way to X, the token's address, night, sound, the cover ----
$("#on-x").href = CONFIG.x;
const token = createToken({ chip: $("#ca-chip"), box: $("#ca-box"), exists: () => real || feed.tokenSeen });

// night, remembered on this device
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

// sound, off until asked for
const sound = createSound();
const soundButton = $("#sound");
soundButton.addEventListener("click", () => {
  soundButton.setAttribute("aria-pressed", String(sound.toggle()));
});

// The book starts shut when index.html says so: a first visit in this tab, or ?cover=1. Its cover
// is there at once; what is under it is found meanwhile.
const OPENS_AFTER = 1500; // how long a first visit looks at the cover before the book opens by itself
const QUIET_KEYS = new Set(["Tab", "Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Escape"]); // keys that open nothing
let opening = root.dataset.book === "closed"; // true until the book has opened for the first time
const front = createClosedBook({ el: $("#closed"), sound });
if (opening) front.show();

await feed.ready;
real = !feed.rehearsal;

// ---- the parts ----
const sheet = createSheet($("#text"));
const recto = $("#recto");
const leaves = createLeaves({ root: $("#pages"), shelf: feed.shelf, writing: feed.current.number, sound, still, onShow, front, onCover, closed: opening });
const monkey = createMonkey($("#monkey"), createMonkeySprite({ scale: artPixel() }), {
  still, pageWidth: leaves.pageWidth, onJump: () => sound.hop(),
});
const card = createCard($("#card"), { topEdge: () => edge.top, bottomEdge: () => edge.hud, rehearsal: () => feed.rehearsal });
keepNumbered($("#card"), $("#memo"), $("#verso-memo"), $("#banner"), document.querySelector(".plate"), $("#mode"), $("#ca-box"));
const camera = createCamera({
  focusY: () => recto.getBoundingClientRect().top + window.scrollY + monkey.at().y,
  topEdge: () => edge.top, bottomEdge: () => edge.hud, tall: () => monkey.height(), still,
  ignore: ".card",
});

// ---- the status: which page, and how many of its words are written ----
const hud = $("#hud"), prev = $("#prev"), next = $("#next"), back = $("#back"), banner = $("#banner"), title = $("#title");
const bar = $("#bar");
let written = 0;
function showCount(words = written) {
  written = words;
  // The bar is --bar art pixels long (style.css) and fills one whole pixel at a time.
  const length = parseFloat(getComputedStyle(bar).getPropertyValue("--bar")) || 60;
  $("#hud-count").textContent = `${words}/${feed.wordsPerPage}`;
  bar.setAttribute("aria-label", `${words} of ${feed.wordsPerPage} words`);
  bar.style.setProperty("--fill", Math.round((words / feed.wordsPerPage) * length));
}
function showStatus() {
  const shut = leaves.closed;
  const live = leaves.live && !shut;
  hud.dataset.mode = live ? "live" : "read";
  // Before page 1 there are no numbers: the cover, and (a page of its own on a narrow screen) its inside.
  $("#hud-page").textContent = shut ? "Cover"
    : leaves.shown === 0 ? "Inside cover"
    : live ? `Page ${leaves.shown}` : `Page ${leaves.shown} of ${leaves.writing}`;
  prev.disabled = shut;
  next.disabled = live;
  // the arrows and the name say what they do at the two ends of the book
  prev.setAttribute("aria-label", !shut && leaves.atFirst ? "Shut the book" : "The page before");
  next.setAttribute("aria-label", shut ? "Open the book" : "The page after");
  title.setAttribute("aria-label", shut ? "Infinite Monkey: open the book" : "Infinite Monkey: show the cover");
}

// ---- the small line of the status: which book this is ----
// A rehearsal says that its trades are made up. The real book says "Live" and how many words it
// has, as far as he has written them; while the backend has no news of the chain, it says that it waits.
const modeLine = $("#mode");
let total = feed.wordCount; // the number of the last word he has put down
let heard = true; // the backend is answering
function showMode() {
  root.dataset.feed = real ? "live" : "rehearsal";
  token.refresh();
  if (!real) { modeLine.textContent = "Rehearsal: these trades are made up."; return; }
  const said = el("span", "live-said");
  if (heard) said.append(`${total.toLocaleString("en-US")} ${total === 1 ? "word" : "words"}`, el("span", "long", " so far"));
  else said.append("Waiting for the chain.");
  modeLine.replaceChildren(el("b", heard ? "live" : "live out", "Live"), said);
}
function showTotal(words) {
  if (words === total) return;
  total = words;
  if (real && heard) showMode();
}

// The pages on show changed (a turn, a leaf back): the strips and the camera follow.
function onShow(changed = true) {
  if (changed) card.close();
  showStatus();
  camera.rest(leaves.closed || !leaves.live);
  if (leaves.live) writer.reflow();
  else if (changed) window.scrollTo({ top: 0, behavior: still() ? "auto" : "smooth" }); // a finished page is read from its top
}

// The book was shut or opened. Under the cover the camera rests; when the book opens on the page
// he is writing, the view is put on him at once, so he is found at it.
function onCover() {
  card.close();
  showStatus();
  camera.rest(leaves.closed || !leaves.live);
  if (!leaves.closed) { opening = false; if (leaves.live) camera.jump(); }
}

// The book is put down afresh, between two of the writer's events (put() lays the new page on his
// sheet). Either he had fallen more than a page behind, and the page simply changes; or the token
// was created while the visitor watched the rehearsal: then the made-up book shuts, and opens
// again as the real one, on the page being written. No made-up word is left anywhere.
async function startAgain(e, put) {
  const first = !real && !e.rehearsal;
  while (leaves.busy) await wait(40); // a leaf the visitor turned lands first
  const shuts = first && !leaves.closed;
  if (shuts) await leaves.close();
  put();
  real = !e.rehearsal;
  total = e.total;
  heard = true;
  card.close();
  banner.hidden = true;
  leaves.reset({ writing: e.current.number, shelf: e.shelf, fresh: first });
  leaves.measure();
  showCount(e.current.words);
  showMode();
  showStatus();
  if (leaves.live) monkey.snapTo(sheet.caret());
  if (shuts) {
    if (!still()) await wait(700);
    await leaves.open();
  } else if (leaves.live && !leaves.closed && camera.following) camera.jump();
}

const writer = createWriter({
  sheet, monkey, leaves, sound, still,
  hooks: {
    wordDone: (word) => { showCount(word.indexInPage); showTotal(word.index); },
    pageFull: (page) => showCount(page.words),
    pageDone: (page) => {
      card.close();
      $("#banner-text").textContent = `Page ${page.number} done`;
      banner.hidden = false;
    },
    newPage: () => showCount(0),
    turned: () => { banner.hidden = true; leaves.measure(); },
    restart: startAgain,
  },
});

leaves.measure();
showCount(feed.current.words);
showMode();
showStatus();
writer.restore(feed.current);
history.scrollRestoration = "manual";
camera.jump();
camera.rest(leaves.closed || !leaves.live);
feed.listen({
  events: (events) => writer.take(events),
  restart: (e) => writer.restart(e),
  health: (ok) => { heard = ok; if (real) showMode(); },
});

// ---- one loop moves him, the camera and the open box ----
let before = performance.now();
function frame(now) {
  const dt = Math.min(64, now - before);
  before = now;
  monkey.frame(dt, now);
  camera.frame(dt);
  card.frame();
  // The way back to him: when a finished page is on show, or when the visitor scrolled him out of view.
  // (Never over the cover: there is nothing to go back to until the book is open.)
  const lost = !leaves.closed && (!leaves.live || (!camera.following && camera.where() !== "in"));
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
  if (leaves.closed) {
    // The right arrow opens a shut book, and so do Enter and the space bar; while it is opening by
    // itself any key does. A key pressed on a control is the control's (the cover is one: a button).
    const control = e.target instanceof Element && e.target.closest("a, button");
    const press = e.key === "Enter" || e.key === " " || (opening && !QUIET_KEYS.has(e.key));
    if (e.key === "ArrowRight" || (press && !control)) leaves.open();
    return;
  }
  if (e.key === "ArrowLeft") leaves.back();
  if (e.key === "ArrowRight") leaves.forward();
});

// ---- the cover ----
// The name in the top strip shuts the book and shows its cover (and opens it again from there).
title.addEventListener("click", () => { if (leaves.closed) leaves.open(); else leaves.close(); });
// A press anywhere on a shut book opens it. The controls in the strips keep to their own job, and
// so does the box of the token's address.
document.addEventListener("click", (e) => {
  if (!leaves.closed) return;
  const control = e.target instanceof Element ? e.target.closest("a, button, .ca-box") : null;
  if (!control || control.id === "closed") leaves.open();
});
// A first visit finds the book shut. It opens by itself after a moment, counted from when the
// page is on screen, and is not shown shut again in this tab (leafing back still reaches the cover).
if (opening) {
  try { sessionStorage.setItem("infinite-monkey-cover", "1"); } catch (e) { /* no storage: it starts shut on every load */ }
  const soon = () => {
    if (document.hidden) { document.addEventListener("visibilitychange", soon, { once: true }); return; }
    setTimeout(() => { if (opening) leaves.open(); }, OPENS_AFTER);
  };
  soon();
}

// The text reflows when the window changes or the fonts arrive: the pages are measured again
// and he is put back at the end of his line.
function reflow() {
  monkey.rescale();
  leaves.resized();
  leaves.measure();
  showCount();
  writer.reflow();
  if (camera.following) camera.jump();
}
addEventListener("resize", reflow);
document.fonts?.ready.then(reflow);
document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(reflow, 60); });
calm.addEventListener("change", () => { monkey.still(still()); reflow(); });
