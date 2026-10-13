// The pieces the pages of the manual are built from: the tiles of a fingerprint, the bar of shares,
// the game menus, the sentence with its slot. Each one draws what the engine answered (see story.js);
// none of them works anything out about a word on its own.

import { pixelSvg, ART } from "../ui/pixels.js";
import { TYPE_NAMES } from "./story.js";

// ---- small helpers ----

// Figures are set in the blocky face: in the text face a 5 reads as an S. Every run of digits in a
// text is wrapped so that style can do it; what is already in the blocky face is left alone.
const BLOCKY = /(^|\s)(num|fig|tile|step-n|key)(\s|$)/;
const BLOCKY_PLACES = ".num, .fig, .tile, .folio, .step-n, .key, textarea, input";
const DIGITS = /\d[\d,.:/]*\d|\d/g;

export function numbered(text) {
  text = String(text);
  if (!/\d/.test(text)) return [text];
  const out = [];
  let last = 0;
  for (const m of text.matchAll(DIGITS)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const span = document.createElement("span");
    span.className = "num";
    span.textContent = m[0];
    out.push(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The same for text that is already in the page.
export function numberText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!/\d/.test(node.nodeValue) || node.parentElement.closest(BLOCKY_PLACES)) continue;
    node.replaceWith(...numbered(node.nodeValue));
  }
}

export function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  const blocky = BLOCKY.test(props?.class || "");
  const put = (text) => (blocky ? node.append(text) : node.append(...numbered(text)));
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") put(value);
    else if (key === "style") node.style.cssText = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    if (typeof kid === "string") put(kid); else node.append(kid);
  }
  return node;
}

// Put a text in a node in place of what it holds.
export function say(node, text) {
  node.replaceChildren(...numbered(text));
  return node;
}

// Put these children in a node in place of what it holds; null and false are skipped.
export function fill(node, ...kids) {
  node.replaceChildren(...kids.flat().filter((kid) => kid != null && kid !== false));
  return node;
}

export const fmt = (n) => Number(n).toLocaleString("en-US");
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const wait = (ms) => new Promise((done) => setTimeout(done, ms));
export const artPixel = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--px")) || 3;

// Timers that belong to a page: all of them are dropped when the page is left.
export function createClock() {
  const ids = new Set();
  return {
    later(ms, fn) { const id = setTimeout(() => { ids.delete(id); fn(); }, ms); ids.add(id); return id; },
    clear() { ids.forEach(clearTimeout); ids.clear(); },
  };
}

// ---- pixel drawings: the front page's, and a few of the manual's own ----

export const DRAW = {
  ...ART,
  down: [
    "kkkkkkkkk",
    ".kkkkkkk.",
    "..kkkkk..",
    "...kkk...",
    "....k....",
  ],
  book: [
    ".kkkk.kkkk.",
    "kwwwwkwwwwk",
    "kwkkwkwkkwk",
    "kwwwwkwwwwk",
    "kwkkwkwkkwk",
    "kwwwwkwwwwk",
    "kkkkkkkkkkk",
    ".kkkkkkkkk.",
  ],
  what: [
    ".kkk.",
    "k...k",
    "....k",
    "..kk.",
    "..k..",
    ".....",
    "..k..",
  ],
  dots: [
    "k.k.k",
  ],
};

export const art = (name, className = "") => { const i = h("i", { class: `art ${className}`.trim() }); i.innerHTML = pixelSvg(DRAW[name]); return i; };

export function drawOwn(root = document) {
  for (const node of root.querySelectorAll("[data-draw]")) if (DRAW[node.dataset.draw]) node.innerHTML = pixelSvg(DRAW[node.dataset.draw]);
}

// A choice in a game menu: a little arrow, then the words.
export function act(text, onClick, { main = false } = {}) {
  return h("button", { class: main ? "act main" : "act", type: "button", onclick: onClick }, art("pick"), h("span", { text }));
}

// ---- the kinds of word, in plain words ----

// The engine has two sorts of verb that both read "verb"; where both are on offer the visitor has to
// be able to tell them apart.
const KIND_NOTE = { V_PAST_T: "with an object", V_BASE_T: "with an object", V_PAST_I: "on its own", V_BASE_I: "on its own" };
export const kindName = (type) => TYPE_NAMES[type] || String(type).toLowerCase();
export const kindLabel = (type) => (KIND_NOTE[type] ? `${kindName(type)}, ${KIND_NOTE[type]}` : kindName(type));
export const plural = (name) => `${name}s`;

// ---- the fingerprint ----

// Tiles for the numbers from..to of a fingerprint; on(i) lights one up, off(i) greys it.
export function tiles(bytes, { from = 0, to = bytes.length, on, off, pop = false, few = false } = {}) {
  const shown = Array.from(bytes.slice(from, to));
  const box = h("span", {
    class: `tiles${few ? " few" : ""}${pop ? " pop" : ""}`, role: "img", style: few ? `--n:${shown.length}` : null,
    "aria-label": `${shown.length === 1 ? "Number" : "Numbers"} ${from + 1}${shown.length > 1 ? ` to ${to}` : ""} of the fingerprint: ${shown.join(", ")}`,
  });
  shown.forEach((b, k) => {
    const i = from + k;
    box.append(h("span", { class: `tile${on?.(i) ? " on" : ""}${off?.(i) ? " off" : ""}`, style: pop ? `--i:${k}` : null, text: String(b) }));
  });
  return box;
}

// ---- the kind of word: a bar of shares, the roll on it, and the same as a menu ----

export function kindBar(pick) {
  const track = h("div", { class: "kbar-track" });
  let start = 0;
  for (const o of pick.options) {
    const picked = o.type === pick.type;
    const seg = h("span", { class: picked ? "kbar-seg picked" : "kbar-seg", style: `--w:${o.weight}` });
    if (picked) {
      const inside = pick.roll >= start && pick.roll < start + o.weight ? (pick.roll - start + 0.5) / o.weight : 0.5;
      seg.append(h("span", { class: "kbar-mark", style: `--at:${inside.toFixed(4)}` }, h("b", { class: "fig", text: String(pick.roll) }), art("down")));
    }
    start += o.weight;
    track.append(seg);
  }
  return h("div", { class: "kbar", role: "img", "aria-label": `A bar of ${pick.total} places shared between the kinds of word. Place ${pick.roll} is in the share of: ${kindLabel(pick.type)}.` },
    track, h("div", { class: "kbar-ends" }, h("span", { text: "0" }), h("span", { text: String(pick.total) })));
}

export function kindMenu(pick) {
  const list = h("ol", { class: "menu" });
  for (const o of pick.options) {
    const picked = o.type === pick.type;
    list.append(h("li", { class: picked ? "row picked" : "row" },
      h("span", { class: "cur" }, picked ? art("pick") : null),
      h("span", { class: "name", text: kindLabel(o.type) }),
      h("span", { class: "lead" }),
      h("b", { class: "fig", text: String(o.weight) })));
  }
  return list;
}

// ---- the word: its place in the list, with its neighbours ----

export function wordMenu(pick, { around = 2, side = "buy" } = {}) {
  const list = h("ol", { class: "menu" });
  const words = pick.list;
  const first = words ? Math.max(0, pick.index - around) : pick.index;
  const last = words ? Math.min(words.length - 1, pick.index + around) : pick.index;
  const more = () => h("li", { class: "row more", "aria-hidden": "true" }, h("span", { class: "cur" }), h("span", { class: "fig place" }), art("dots"));
  if (first > 0) list.append(more());
  for (let i = first; i <= last; i++) {
    const picked = i === pick.index;
    list.append(h("li", { class: `row${picked ? " picked" : ""}${picked && side === "sell" ? " sell" : ""}` },
      h("span", { class: "cur" }, picked ? art("pick") : null),
      h("span", { class: "fig place", text: String(i + 1) }),
      h("span", { class: "name", text: words ? words[i] : pick.word })));
  }
  if (last < pick.listSize - 1) list.append(more());
  return list;
}

// ---- words on paper ----

const inkOf = (item) => (item.trade?.side === "sell" ? "ink-sell" : "ink-buy");

// One word of the story, with its comma if it has one. Returns the span of the word itself.
function putWord(into, item, { lead = true, inks = true, letters = null } = {}) {
  const w = item.word;
  if (w.commaBefore) into.append(",");
  if (lead) into.append(" ");
  const span = h("span", { class: inks ? inkOf(item) : null });
  if (letters) for (const c of w.text) { const ch = h("span", { class: "ch h", text: c }); letters.push(ch); span.append(ch); }
  else span.textContent = w.text;
  into.append(span);
  if (w.commaAfter) into.append(",");
  return span;
}

// A sentence, or a piece of one, from the items of a story.
export function sentence(items, { inks = true } = {}) {
  const span = h("span", {});
  items.forEach((it, i) => putWord(span, it, { lead: i > 0, inks }));
  return span;
}

// The sentence so far and the place the trade's word goes: mode "kind" leaves the place open and
// names the kind that was picked, "word" fills it.
export function strip(item, mode, { tag = "made-up trade" } = {}) {
  const line = h("span", { class: "sofar" });
  if (item.closed) {
    const gone = sentence(item.closed, { inks: false });
    gone.className = "gone";
    gone.append(item.punct.mark);
    line.append(gone, " ");
  } else if (item.sofar.length) {
    line.append(sentence(item.sofar));
    if (item.word.commaBefore) line.append(",");
    line.append(" ");
  } else line.append(h("span", { class: "gone", text: "A new sentence: " }));
  line.append(mode === "kind"
    ? h("b", { class: "slot blank", text: kindName(item.pick.type) })
    : h("b", { class: `slot ${inkOf(item)}`, text: item.word.text }));
  if (mode !== "kind" && item.word.commaAfter) line.append(",");
  return h("p", { class: "strip" }, tag ? h("span", { class: "tag", text: tag }) : null, line);
}

// The running text of a story, as the book would set it. With typed: true the last word is put
// down hidden, letter by letter, and its letters are handed back to be shown one at a time.
export function writeAll(into, items, { typed = false, cut = false } = {}) {
  into.replaceChildren();
  const letters = [];
  if (cut) into.append("… ");
  items.forEach((it, i) => {
    let lead = i > 0;
    if (it.punct && i > 0) {
      into.append(it.punct.mark);
      if (it.punct.paragraph) { into.append(h("span", { class: "br" }), h("span", { class: "indent" })); lead = false; }
    }
    putWord(into, it, { lead, letters: typed && i === items.length - 1 ? letters : null });
  });
  into.append(h("span", { class: "caret" }));
  return letters;
}
