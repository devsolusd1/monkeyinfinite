// Small helpers shared by the page's modules.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const wait = (ms) => new Promise((done) => setTimeout(done, ms));

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// How many CSS pixels one art pixel is right now (3 on a desktop, 2 on a phone; style.css decides).
export const artPixel = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--px")) || 3;

// Round to whole art pixels, so things that move in steps land on the grid.
export const snap = (v, px) => Math.round(v / px) * px;
