// The leaves of the book: which pages are on show, and the turning of a page.
// The right-hand page is the one being looked at (the page he is writing, or a finished one that
// was leafed back to); on a wide screen the left-hand page shows the one before it, and before
// page 1 the inside of the cover. A narrow screen shows one page at a time, so there the inside of
// the cover is a page of its own: page 0. Before that the book is shut and only its front cover
// shows (ui/closed.js draws it). A turn is drawn in a few chunky steps, never smoothly.
//
// The finished pages come from a shelf (ui/feed.js): shelf.get(n) is page n if it is at hand,
// shelf.want(n) asks for it, shelf.recent() is the last few at hand. The rehearsal has all its
// pages at hand; the real book keeps a few and fetches the others when they are leafed to.

import { createSheet } from "./sheet.js";
import { artPixel, clamp, el, snap, wait } from "./util.js";

const STEP_MS = 74; // one step of a turning page
const SLOW_MS = 350; // a page that has not come after this long says that it is on its way
const AGAIN_MS = 5000; // a page that did not come is asked for again after this long, while its leaf is on show

// How far the leaf has come over, as [side of the spine, share of a page's width].
const TURN_SPREAD = [["r", 0.74], ["r", 0.44], ["r", 0.14], ["l", 0.14], ["l", 0.44], ["l", 0.74]];
const TURN_SINGLE = [["r", 0.72], ["r", 0.42], ["r", 0.12]];

// writing: the number of the page the monkey is on, as far as the page on screen has got.
export function createLeaves({ root, shelf, writing, sound, still, onShow, front, onCover, closed = false }) {
  const $ = (selector) => root.querySelector(selector);
  const verso = $("#verso"), recto = $("#recto"), leaf = $("#flip");
  const liveEl = $("#sheet"), readEl = $("#read"), monkeyEl = $("#monkey");
  const ruler = createSheet($("#measure-text"), { caret: false });
  // The two places a finished page is read: on the left, and on the right in place of the page
  // being written. (wants: the page a place is waiting for, when that one is not at hand.)
  const left = { sheet: createSheet($("#verso-text"), { caret: false }), text: $("#verso-text"), line: $("#verso-memo"), wants: 0, timer: 0 };
  const right = { sheet: createSheet($("#read-text"), { caret: false }), text: $("#read-text"), line: $("#memo"), wants: 0, timer: 0 };

  let shown = writing; // the page on the right
  let onVerso = null; // which page is drawn on the left now
  let busy = false;
  let swinging = false; // the cover board is on its way open or shut

  // Two pages on show, or one? Asked of the layout, so the width at which it changes is in style.css only.
  const wide = () => recto.offsetWidth * 1.5 < root.clientWidth;
  // The first thing to leaf back to: page 1 with the inside of the cover beside it, or the inside of the cover alone.
  const first = () => (wide() ? 1 : 0);

  // The small line under the folio of a finished page. (Sending each page to Solana as a memo is
  // planned and not built: nothing here may say that a page was sent.)
  const pageLine = (page) => `Page ${page.number}. ${page.words} words.`;

  // A finished page in one of its two places (n = 0: nothing). One that is not at hand is asked
  // for: its leaf shows at once, empty, says so quietly if the answer is slow, and is filled when
  // the page has come (landed, below).
  function put(side, n) {
    clearTimeout(side.timer);
    side.wants = 0;
    side.sheet.clear();
    side.line.textContent = "";
    if (!n) return;
    const page = shelf.get(n);
    if (page) { side.sheet.fill(page.items); side.line.textContent = pageLine(page); return; }
    side.wants = n;
    const waiting = (text) => { side.sheet.clear(); side.text.append(el("span", "wait", text)); };
    side.timer = setTimeout(() => waiting(`Finding page ${n}`), SLOW_MS);
    shelf.want(n).catch(() => {
      if (side.wants !== n) return;
      clearTimeout(side.timer);
      waiting(`Page ${n} has not come. Asking again`);
      side.timer = setTimeout(() => { if (side.wants === n) put(side, n); }, AGAIN_MS);
    });
  }

  // A page that was asked for has come: fill the leaf that waits for it, and measure the pages by it.
  function landed(page) {
    for (const side of [left, right]) if (side.wants === page.number) put(side, page.number);
    measure();
    onShow(false);
  }
  shelf.onPage = landed;

  // The left-hand page: a finished page, or (n = 0) the inside of the cover.
  function drawVerso(n) {
    if (onVerso === n) return;
    onVerso = n;
    verso.classList.toggle("cover", n === 0);
    put(left, n);
    if (n) $("#verso-folio").textContent = n;
  }

  // The right-hand page: the one he is writing (his own sheet, with him on it) or a finished one.
  function drawRecto(n) {
    const live = n === writing;
    liveEl.hidden = !live;
    monkeyEl.hidden = !live;
    readEl.hidden = live;
    recto.classList.toggle("finished", !live);
    $("#folio").textContent = n;
    put(right, live ? 0 : n);
  }

  // One turn of a leaf: forward (dir 1) it comes off the right-hand page and lands on the left.
  async function flip(dir, { atStart, atEnd, onStep } = {}) {
    const px = artPixel();
    const spread = wide();
    const x0 = recto.offsetLeft, y0 = recto.offsetTop, width = recto.offsetWidth, height = recto.offsetHeight;
    const steps = [...(spread ? TURN_SPREAD : TURN_SINGLE)];
    if (dir < 0) steps.reverse();
    leaf.hidden = false;
    for (let i = 0; i < steps.length; i++) {
      const [side, share] = steps[i];
      const w = snap(width * share, px);
      const lift = Math.round((1 - share) * 4) * px; // a leaf on its way over stands taller than the page
      leaf.dataset.side = side;
      Object.assign(leaf.style, { left: `${side === "r" ? x0 : x0 - w}px`, top: `${y0 - lift}px`, width: `${w}px`, height: `${height + 2 * lift}px` });
      if (i === 0) atStart?.();
      onStep?.(side, w);
      sound.flap();
      await wait(STEP_MS);
    }
    leaf.hidden = true;
    atEnd?.();
  }

  // Leaf to page n (asked for by the visitor). On a narrow screen n = 0 is the inside of the cover.
  async function show(n, { turn = true } = {}) {
    n = clamp(n, first(), writing);
    if (busy || closed || swinging || n === shown) return;
    const left = () => drawVerso(Math.max(0, n - 1));
    const right = () => { shown = n; root.classList.toggle("plate", n === 0); if (n) drawRecto(n); onShow(); };
    if (!turn || still() || document.hidden) { left(); right(); return; }
    busy = true;
    root.classList.add("leafing"); // he stays out of sight until the leaf has landed
    if (n > shown) await flip(1, { atStart: right, atEnd: left });
    else await flip(-1, { atStart: left, atEnd: right });
    root.classList.remove("leafing");
    busy = false;
  }

  // ---- the book shut ----
  // Shutting it keeps its place: it opens again on the pages it was shut on. Nothing under the
  // cover waits for it: he goes on writing, and is found at it when the book opens.
  async function close({ swing = true } = {}) {
    if (closed || swinging) return;
    closed = swinging = true;
    onCover();
    await front.shut({ spread: wide(), swing: swing && !still() && !document.hidden });
    swinging = false;
  }
  async function open({ swing = true } = {}) {
    if (!closed || swinging) return;
    swinging = true;
    await front.open({ spread: wide(), swing: swing && !still() && !document.hidden });
    closed = swinging = false;
    onCover();
  }

  // The window changed. A wide screen has no page 0: the inside of the cover shows beside page 1.
  function resized() {
    front.fit();
    if (shown !== 0 || !wide()) return;
    shown = 1;
    root.classList.remove("plate");
    drawVerso(0);
    drawRecto(1);
    onShow();
  }

  // The page he was writing is finished and nobody watches a turn (the visitor is leafing
  // through older pages, the tab is hidden, or motion is off): just move on.
  function sealed(page) {
    const wasLive = shown === writing;
    writing = page.number + 1;
    if (wasLive) { shown = writing; drawVerso(page.number); drawRecto(shown); }
    onShow(wasLive); // false: the pages on show did not change, only how many there are
  }

  // The same, with the turn on show. fresh() is called under the leaf, once it hides the page.
  // (The writer holds the lock for the whole of its page-end scene, so nobody leafs meanwhile.)
  function turnLive(page, { fresh, onStep }) {
    return flip(1, {
      atStart: () => { writing = shown = page.number + 1; fresh(); drawRecto(shown); onShow(); },
      atEnd: () => drawVerso(page.number),
      onStep,
    });
  }

  // The book was put down afresh (ui/writer.js: restart): another page is being written now, with
  // another shelf perhaps. Someone reading a finished page stays on it if the new book has it;
  // fresh: everybody is brought to the page being written (the real book has taken the rehearsal's place).
  function reset({ writing: n, shelf: other = shelf, fresh = false }) {
    const wasLive = shown === writing;
    if (other !== shelf) { shelf.onPage = null; shelf = other; shelf.onPage = landed; }
    writing = n;
    if (fresh || wasLive || shown > writing) shown = writing;
    onVerso = null;
    root.classList.toggle("plate", shown === 0);
    drawVerso(Math.max(0, shown - 1));
    drawRecto(shown || 1);
    onShow();
  }

  // Every page of a book is the same size: as many lines as the longest of the last few pages at hand.
  function measure() {
    const box = $("#measure-text");
    const line = parseFloat(getComputedStyle(box).lineHeight) || 40;
    let tallest = 0;
    for (const page of shelf.recent()) {
      ruler.clear();
      ruler.fill(page.items);
      tallest = Math.max(tallest, box.offsetHeight);
    }
    ruler.clear();
    if (tallest) root.style.setProperty("--rows", Math.ceil(tallest / line));
  }

  drawVerso(shown - 1);
  drawRecto(shown);
  if (closed) front.show();

  return {
    show, sealed, turnLive, measure, open, close, resized, reset,
    // Leafing back past the first page shuts the book; leafing forward from the cover opens it.
    back: () => (shown <= first() ? close() : show(shown - 1)),
    forward: () => (closed ? open() : show(shown + 1)),
    toLive: () => show(writing),
    lock(on) { busy = on; },
    // The foot of the right-hand page, where he runs to turn it: measured like the caret is.
    floor() {
      const px = artPixel();
      return { y: recto.clientHeight - 2 * px, left: 12 * px, right: recto.clientWidth - 9 * px };
    },
    pageWidth: () => recto.clientWidth,
    get shown() { return shown; },
    get writing() { return writing; },
    get live() { return shown === writing; },
    get closed() { return closed; },
    get atFirst() { return shown <= first(); },
    get busy() { return busy; },
  };
}
