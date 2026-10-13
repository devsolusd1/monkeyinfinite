// Words on a page. The same code lays out the page being written, where letters land one at a
// time, and a finished page that is only read.

import { el } from "./util.js";

// word span -> the word event it shows (the trade, the digest, the trace)
export const wordOf = new WeakMap();

const glyph = (char, hidden) => el("span", hidden ? "ch h" : "ch", char);

export function createSheet(textEl, { caret = true } = {}) {
  // A zero-size marker that always sits right after the last letter on show. Its place on the
  // page is where the monkey stands, so nothing here needs to know about fonts or line breaks.
  const probe = caret ? el("i", "probe") : null;
  let last = null; // the span of the last word
  let gap = false; // does the next word need a space before it?

  function clear() {
    textEl.textContent = "";
    last = null;
    gap = false;
    if (probe) textEl.append(probe);
  }

  // hidden: the letters take their room at once, so the line never reflows in the middle of a
  // word, but they stay invisible until reveal() shows them one by one.
  function addWord(word, hidden = false) {
    if (gap) textEl.append(" ");
    const span = el("span", `w ${word.trade.side === "sell" ? "sell" : "buy"}`);
    let letters = [];
    if (hidden) {
      letters = [...word.text].map((c) => glyph(c, true));
      if (word.commaAfter) letters.push(glyph(",", true));
      span.append(...letters);
    } else {
      span.textContent = word.text + (word.commaAfter ? "," : "");
    }
    wordOf.set(span, word);
    textEl.append(span);
    last = span;
    gap = true;
    if (probe) { if (hidden) span.prepend(probe); else span.append(probe); }
    return { span, letters };
  }

  // A comma or the mark that ends a sentence: it hugs the word before it.
  function addMark(mark, hidden = false) {
    const g = glyph(mark, hidden);
    if (last) last.append(g); else { textEl.append(g); gap = true; }
    if (probe && !hidden) g.after(probe);
    return g;
  }

  // A new paragraph, the way a book sets one: a new line that starts a little way in.
  function addBreak() {
    textEl.append(el("span", "br"), el("span", "indent"));
    gap = false;
  }

  function reveal(g, pop = true) {
    g.classList.remove("h");
    if (pop) g.classList.add("in");
    if (probe) g.after(probe);
  }

  // A whole run of book items at once (the page so far on load, or a finished page).
  function fill(items) {
    for (const it of items) {
      if (it.kind === "punct") { addMark(it.mark); if (it.paragraph) addBreak(); continue; }
      if (it.commaBefore) addMark(",");
      addWord(it);
    }
  }

  clear();
  return {
    clear, addWord, addMark, addBreak, reveal, fill,
    // Where the next letter goes, measured from the page: x at its left edge, y on the baseline.
    caret: () => ({ x: probe.offsetLeft, y: probe.offsetTop }),
  };
}
