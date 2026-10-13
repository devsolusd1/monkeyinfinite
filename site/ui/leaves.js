// The leaves of the book: which pages are on show, and the turning of a page.
// The right-hand page is the one being looked at (the page he is writing, or a finished one that
// was leafed back to); on a wide screen the left-hand page shows the one before it, and before
// page 1 the inside of the cover. A turn is drawn in a few chunky steps, never smoothly.

import { createSheet } from "./sheet.js";
import { artPixel, clamp, snap, wait } from "./util.js";

const STEP_MS = 74; // one step of a turning page

// How far the leaf has come over, as [side of the spine, share of a page's width].
const TURN_SPREAD = [["r", 0.74], ["r", 0.44], ["r", 0.14], ["l", 0.14], ["l", 0.44], ["l", 0.74]];
const TURN_SINGLE = [["r", 0.72], ["r", 0.42], ["r", 0.12]];

export function createLeaves({ root, book, sound, still, onShow }) {
  const $ = (selector) => root.querySelector(selector);
  const verso = $("#verso"), recto = $("#recto"), leaf = $("#flip");
  const liveEl = $("#sheet"), readEl = $("#read"), monkeyEl = $("#monkey");
  const versoSheet = createSheet($("#verso-text"), { caret: false });
  const readSheet = createSheet($("#read-text"), { caret: false });
  const ruler = createSheet($("#measure-text"), { caret: false });

  let writing = book.current.number; // the page the monkey is on, as far as the page on screen has got
  let shown = writing; // the page on the right
  let onVerso = null; // which page is drawn on the left now
  let busy = false;

  function memoLine(page) {
    const link = page.memo.previous ? `linked to page ${page.number - 1}` : "the first link of the chain";
    // In the rehearsal nothing is sent, so the line must not say that it was.
    return page.memo.simulated
      ? `Goes to Solana as one memo: ${page.memo.bytes} bytes, ${link}. Rehearsal: nothing is sent.`
      : `Sent to Solana as one memo: ${page.memo.bytes} bytes, ${link}.`;
  }

  // The left-hand page: a finished page, or (n = 0) the inside of the cover.
  function drawVerso(n) {
    if (onVerso === n) return;
    onVerso = n;
    verso.classList.toggle("cover", n === 0);
    versoSheet.clear();
    if (n === 0) return;
    const page = book.pages[n - 1];
    versoSheet.fill(page.items);
    $("#verso-folio").textContent = n;
    $("#verso-memo").textContent = memoLine(page);
  }

  // The right-hand page: the one he is writing (his own sheet, with him on it) or a finished one.
  function drawRecto(n) {
    const live = n === writing;
    liveEl.hidden = !live;
    monkeyEl.hidden = !live;
    readEl.hidden = live;
    recto.classList.toggle("finished", !live);
    $("#folio").textContent = n;
    readSheet.clear();
    if (live) { $("#memo").textContent = ""; return; }
    const page = book.pages[n - 1];
    readSheet.fill(page.items);
    $("#memo").textContent = memoLine(page);
  }

  // One turn of a leaf: forward (dir 1) it comes off the right-hand page and lands on the left.
  async function flip(dir, { atStart, atEnd, onStep } = {}) {
    const px = artPixel();
    const spread = verso.offsetWidth > 0;
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

  // Leaf to page n (asked for by the visitor).
  async function show(n, { turn = true } = {}) {
    n = clamp(n, 1, writing);
    if (busy || n === shown) return;
    const land = () => { shown = n; drawVerso(n - 1); drawRecto(n); onShow(); };
    if (!turn || still() || document.hidden) { land(); return; }
    busy = true;
    root.classList.add("leafing"); // he stays out of sight until the leaf has landed
    if (n > shown) await flip(1, { atStart: () => { shown = n; drawRecto(n); onShow(); }, atEnd: () => drawVerso(n - 1) });
    else await flip(-1, { atStart: () => drawVerso(n - 1), atEnd: () => { shown = n; drawRecto(n); onShow(); } });
    root.classList.remove("leafing");
    busy = false;
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

  // Every page of a book is the same size: as many lines as the longest of the last few pages.
  function measure() {
    const box = $("#measure-text");
    const line = parseFloat(getComputedStyle(box).lineHeight) || 40;
    let tallest = 0;
    for (const page of book.pages.slice(-3)) {
      ruler.clear();
      ruler.fill(page.items);
      tallest = Math.max(tallest, box.offsetHeight);
    }
    ruler.clear();
    if (tallest) root.style.setProperty("--rows", Math.ceil(tallest / line));
  }

  drawVerso(shown - 1);
  drawRecto(shown);

  return {
    show, sealed, turnLive, measure,
    back: () => show(shown - 1),
    forward: () => show(shown + 1),
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
    get busy() { return busy; },
  };
}
