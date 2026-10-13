// Things a dialogue box is made of, shared by the box of a word (ui/card.js) and the box of the
// token (ui/token.js): a line with a value that can be copied, and a link that leaves the site.

import { shortKey } from "../core/book.js";
import { pixelSvg, ART } from "./pixels.js";
import { el } from "./util.js";

const COPIED_MS = 1400; // how long "Copied" stays

// One line of a trade: what it is, the value cut short, and a control that copies the whole of it.
// When it has copied, "Copied" stands in the value's place for a moment, so the line never moves.
// whole: the value is shown in full, on as many lines as it takes, and needs no name beside it.
export function idRow(name, value, spoken, { whole = false } = {}) {
  const row = el("p", whole ? "id whole" : "id");
  const copy = el("button", "copy");
  copy.type = "button";
  copy.dataset.act = "copy";
  copy.dataset.copy = value;
  copy.setAttribute("aria-label", `Copy the ${spoken}`);
  copy.innerHTML = pixelSvg(ART.copy);
  const said = el("span", "said");
  said.setAttribute("role", "status");
  const shown = el("span", "id-value");
  const text = el("span", "short", whole ? null : shortKey(value, 6, 6));
  if (whole) { const half = Math.ceil(value.length / 2); text.append(value.slice(0, half), el("wbr"), value.slice(half)); } // too long for a line, it breaks in the middle
  shown.append(text, said);
  if (name) row.append(el("span", "id-name", name));
  row.append(shown, copy);
  return row;
}

// A link that leaves the site, in a new tab.
export function outLink(text, href) {
  const a = el("a", "go", text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.insertAdjacentHTML("beforeend", pixelSvg(ART.out));
  return a;
}

async function toClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* no clipboard here: the old way */ }
  const area = el("textarea");
  area.value = text;
  area.readOnly = true;
  area.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
  document.body.append(area);
  area.select();
  let done = false;
  try { done = document.execCommand("copy"); } catch (e) { /* not allowed either */ }
  area.remove();
  return done;
}

// What a box needs to work its copy controls: copy(button) copies what the control stands for and
// says so in its line for a moment; settle() takes that back at once (the box is being built anew).
export function createCopier() {
  let copied = null; // the copy control that is saying "Copied" just now

  function settle() {
    if (!copied) return;
    clearTimeout(copied.timer);
    copied.row.classList.remove("told");
    copied.row.querySelector(".said").textContent = "";
    copied.button.innerHTML = pixelSvg(ART.copy);
    copied = null;
  }

  async function copy(button) {
    const done = await toClipboard(button.dataset.copy);
    if (!button.isConnected) return;
    button.focus();
    settle();
    const row = button.closest(".id");
    row.classList.add("told");
    row.querySelector(".said").textContent = done ? "Copied" : "Not copied";
    button.innerHTML = pixelSvg(done ? ART.tick : ART.cross);
    copied = { row, button, timer: setTimeout(settle, COPIED_MS) };
  }

  return { copy, settle };
}
