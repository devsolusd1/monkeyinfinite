// The book, shut: its front cover, and the swing of the board when the book opens and closes.
// The cover is a drawing (cover/cover.js), painted one canvas pixel per art pixel and shown at the
// largest whole scale that fits between the two strips. The board swings the way a page turns,
// in a few chunky steps: it narrows towards the spine and, where the open book shows two pages,
// its inside comes down on the other side. Then the open book takes its place.

import { COVER } from "../cover/cover.js";
import { paintCover, coverProblems } from "../cover/paint.js";
import { snap, wait } from "./util.js";

const STEP_MS = 84; // one step of the swinging board: a board is heavier than a leaf
const SHADOW = 3; // art pixels of hard shadow to its right and under it (style.css draws it)
const AIR = 8; // CSS pixels kept free around the book

// How far the board has come over, as [side of the spine, share of its width].
const SWING_SPREAD = [["r", 0.74], ["r", 0.44], ["r", 0.14], ["l", 0.14], ["l", 0.44], ["l", 0.74]];
const SWING_SINGLE = [["r", 0.72], ["r", 0.42], ["r", 0.12]];

export function createClosedBook({ el, sound }) {
  const root = document.documentElement;
  const box = el.querySelector(".closed-book");
  const front = el.querySelector(".closed-front");
  const inside = el.querySelector(".closed-inside");
  let scale = 0; // CSS pixels to one art pixel of the cover
  let swinging = false;

  // A drawing with a row missing must not take the page down with it: say so, and show a plain board.
  const problems = coverProblems(COVER);
  if (problems.length) {
    console.warn(`cover/cover.js: ${problems.join("; ")}`);
    box.classList.add("plain");
  }

  // The board at rest, flat on the book.
  function flat() {
    delete box.dataset.swing;
    box.style.left = "";
    Object.assign(front.style, { left: "", top: "", width: `${COVER.w * scale}px`, height: `${COVER.h * scale}px` });
  }

  // The largest whole scale at which the cover and its shadow fit between the strips.
  function fit() {
    if (el.hidden || swinging) return;
    const s = Math.max(1, Math.floor(Math.min(
      (el.clientWidth - 2 * AIR) / (COVER.w + SHADOW),
      (el.clientHeight - 2 * AIR) / (COVER.h + SHADOW),
    )));
    if (s === scale) return;
    scale = s;
    el.style.setProperty("--cpx", `${s}px`);
    box.style.width = `${COVER.w * s}px`;
    box.style.height = `${COVER.h * s}px`;
    if (!problems.length) paintCover(front, COVER, s);
    flat();
  }
  // Its room changes with the window and with the height of the strips.
  new ResizeObserver(fit).observe(el);
  addEventListener("resize", fit);

  function show() {
    root.dataset.book = "closed"; // style.css hides the open book under it and stops the scrolling
    el.hidden = false;
    fit();
  }
  function hide() {
    el.hidden = true;
    delete root.dataset.book;
  }

  // One step of the swing: step j of the table.
  function pose(table, j) {
    const [side, share] = table[j];
    const wide = COVER.w * scale, tall = COVER.h * scale;
    const w = snap(wide * share, scale);
    const lift = Math.round((1 - share) * 4) * scale; // on its way over the board stands taller than the book
    box.dataset.swing = side;
    Object.assign((side === "r" ? front : inside).style, {
      left: `${side === "r" ? 0 : -w}px`, top: `${-lift}px`, width: `${w}px`, height: `${tall + 2 * lift}px`,
    });
    // An open book is two boards wide: where two pages show, the spine slides to the middle as the board comes over.
    box.style.left = table === SWING_SPREAD ? `${snap((wide / 2) * ((j + 1) / table.length), scale)}px` : "";
  }

  // The board swings open (dir 1) or shut (dir -1), a step at a time.
  async function swing(dir, spread) {
    // (a book that would not fit the window when open two boards wide swings like a single page)
    const table = spread && 2 * COVER.w * scale <= el.clientWidth ? SWING_SPREAD : SWING_SINGLE;
    swinging = true;
    for (let i = 0; i < table.length; i++) {
      pose(table, dir > 0 ? i : table.length - 1 - i);
      sound.flap();
      await wait(STEP_MS);
    }
    swinging = false;
    flat();
  }

  return {
    show, fit,
    // Open: the board swings away, then the open book takes its place. `spread`: the open book shows two pages.
    async open({ spread = false, swing: turn = true } = {}) {
      if (turn) await swing(1, spread);
      hide();
    },
    // Shut: the open book goes, and the board swings back over the pages.
    async shut({ spread = false, swing: turn = true } = {}) {
      show();
      if (turn) await swing(-1, spread);
      fit(); // the window may have changed while it swung
    },
    get scale() { return scale; },
  };
}
