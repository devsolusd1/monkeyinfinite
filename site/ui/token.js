// The token's address. A small tag that is always in view ("CA" and the address cut short) opens a
// box in the style of the word's box: the whole address, a control that copies it, and
//   before the token exists   one plain line saying so. No link is shown: there is nothing to link to.
//   once it exists            the ways out: the token on the explorer, a chart, a place to trade it.
// The address itself is the same before and after; it comes from config.js. Whether the token
// exists is asked of the page each time the box is built (exists()): only the backend knows.

import { shortKey } from "../core/book.js";
import { CONFIG } from "../config.js";
import { idRow, outLink, createCopier } from "./copy.js";
import { tokenUrl, chartUrl, tradeUrl, EXPLORER_NAME } from "./links.js";
import { el } from "./util.js";

export function createToken({ chip, box, exists }) {
  const mint = CONFIG.mint;
  const short = shortKey(mint, 4, 4);
  const { copy, settle } = createCopier();
  let builtAs = null; // what exists() answered when the box was last built

  chip.querySelector(".ca-short").textContent = short;
  chip.setAttribute("aria-label", `The token’s address, ${short}: show it whole`);

  function build() {
    const live = builtAs = !!exists();
    const head = el("div", "card-head");
    head.append(el("span", "card-word", CONFIG.ticker));
    const who = el("div", "card-who");
    who.append(el("p", "soft", `The token whose trades I ${live ? "write" : "will write"} from. Its address:`), idRow(null, mint, "token’s address", { whole: true }));
    if (live) {
      const links = el("p", "card-links");
      links.append(outLink(EXPLORER_NAME, tokenUrl(mint)), outLink("Chart", chartUrl(mint)), outLink("Trade", tradeUrl(mint)));
      who.append(links);
    } else {
      who.append(el("p", "ca-note", "The token is not created yet. This address is already final."));
    }
    settle(); // a line that says "Copied" goes with the old box
    box.replaceChildren(head, who);
  }

  function open() {
    build();
    box.hidden = false;
    chip.setAttribute("aria-expanded", "true");
  }
  function close() {
    if (box.hidden) return;
    box.hidden = true;
    chip.setAttribute("aria-expanded", "false");
  }

  chip.addEventListener("click", () => { if (box.hidden) open(); else close(); });
  box.addEventListener("click", (e) => {
    const pressed = e.target instanceof Element ? e.target.closest('[data-act="copy"]') : null;
    if (pressed) copy(pressed);
  });
  // A press anywhere else puts the box away, and so does Escape (the tag gets the focus back).
  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Node) || chip.contains(e.target) || box.contains(e.target)) return;
    close();
  });
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || box.hidden) return;
    if (box.contains(document.activeElement)) chip.focus();
    close();
  });

  return {
    close,
    // What exists() answers may have changed (the token was created): an open box says so at once.
    // (Only then is it built anew: somebody may be pressing something in it.)
    refresh() { if (!box.hidden && !!exists() !== builtAs) build(); },
    get open() { return !box.hidden; },
  };
}
