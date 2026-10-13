// The box of one word, in the style of a game's dialogue box. Hovering a word (or pressing it
// once on a phone) says which trade made him write it: its transaction and its wallet. One press
// further says how it was picked, with a check that the visitor's own browser does.

import { explain } from "../core/book.js";
import { digestOf } from "../core/grammar.js";
import { toHex } from "../core/sha256.js";
import { wordOf } from "./sheet.js";
import { pixelSvg, ART } from "./pixels.js";
import { txUrl, walletUrl, EXPLORER_NAME, MANUAL } from "./links.js";
import { idRow, outLink, createCopier } from "./copy.js";
import { clamp, el } from "./util.js";

const shortHex = (hex) => `${hex.slice(0, 12)}…${hex.slice(-8)}`;

// An amount of SOL as it is read: a real trade can be any size, so three figures of it and no trailing zeros.
function solText(sol) {
  const n = Number(sol);
  if (!Number.isFinite(n) || n <= 0) return "";
  const text = n >= 1 ? n.toFixed(2) : n.toFixed(Math.min(9, 2 - Math.floor(Math.log10(n))));
  return text.replace(/\.?0+$/, "");
}

// The kinds of word that were allowed, as the visitor should read them: the grammar has several
// kinds of verb and pronoun that all read "verb" and "pronoun", so those are added together.
function kindsOf(step) {
  const share = new Map();
  for (const o of step.allowed) share.set(o.name, (share.get(o.name) || 0) + o.weight);
  return [...share].map(([name, weight]) => ({ name, percent: Math.round((weight / step.outOf) * 100), picked: name === step.pickedName }));
}

// Do it all again, here: hash the trade, then read the same numbers off the fresh hash.
// (The book reads four bytes for the kind of word and the next four for its place in the list;
// when the trade first ended a sentence, the word is read from the next eight bytes.)
function recompute(word) {
  const bytes = digestOf(word.trade.signature, word.trade.blockhash);
  const hex = toHex(bytes);
  const u32 = (at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  const sameNumbers = explain(word).steps.every((s, i) =>
    u32(i * 8) % s.outOf === s.roll && (s.mark != null || u32(i * 8 + 4) % s.listSize === s.position));
  return { hex, sameHash: hex === word.digest, sameNumbers };
}

// A choice in a game menu: a little arrow, then the words.
function choice(text, act) {
  const b = el("button", "choice");
  b.type = "button";
  b.dataset.act = act;
  b.innerHTML = pixelSvg(ART.pick);
  b.append(el("span", null, text));
  return b;
}

// rehearsal(): true while the feed plays made-up trades (asked each time: the real book can take the
// rehearsal's place while the page is open).
export function createCard(root, { topEdge, bottomEdge, rehearsal }) {
  let anchor = null; // the word span the box belongs to
  let level = 0; // 1: who made him write it. 2: how it was picked.
  let pinned = false; // a hovered box leaves with the pointer; a pinned one stays
  const { copy, settle } = createCopier();

  // A trade only counts as real when the feed says the rehearsal is over and the trade itself
  // does not say it was made up. Only a real one gets a link to the explorer.
  const madeUp = (trade) => rehearsal() || trade.simulated === true;

  function who(word) {
    const trade = word.trade;
    const box = el("div", "card-who");
    const p = el("p");
    const sol = solText(trade.sol);
    p.append("A ", el("b", null, trade.side === "sell" ? "sell" : "buy"));
    if (sol) p.append(" of ", el("b", null, `${sol} SOL`));
    p.append(" made me write it.");
    box.append(p, idRow("Tx", trade.signature, "transaction signature"), idRow("Wallet", trade.wallet, "wallet address"));
    if (!madeUp(trade)) {
      const links = el("p", "card-links");
      links.append(outLink(`See it on ${EXPLORER_NAME}`, txUrl(trade.signature)), outLink("See the wallet", walletUrl(trade.wallet)));
      box.append(links);
    }
    return box;
  }

  function how(word) {
    const box = el("div", "card-how");
    const steps = explain(word).steps;
    const pick = steps[steps.length - 1];
    const ended = steps.find((s) => s.mark != null);

    box.append(el("p", "soft", "Kinds of word allowed here"));
    const kinds = el("div", "kinds");
    for (const k of kindsOf(pick)) {
      const tile = el("span", k.picked ? "kind picked" : "kind", k.name);
      tile.append(el("i", null, `${k.percent}%`));
      kinds.append(tile);
    }
    box.append(kinds);

    const line = el("p");
    line.append("The roll landed on ", el("b", null, pick.pickedName), ", then on place ", el("b", null, String(pick.position + 1)), ` of ${pick.listSize} in my ${pick.pickedName} list: `, el("b", null, pick.word), ".");
    box.append(line);
    if (ended) box.append(el("p", "soft", `Before that, the same roll closed the last sentence with “${ended.mark}”`));
    // what the roll is read from, with the way to the manual at the end of the sentence
    const read = el("p", "soft", "The roll is read from the trade’s fingerprint: a hash of its signature and its block. ");
    const rule = el("a", "go", "The whole rule");
    rule.href = MANUAL;
    read.append(rule);
    box.append(read, idRow("Block", word.trade.blockhash, "block hash"));
    box.append(choice("Check it", "check"), el("div", "proof"));
    return box;
  }

  function prove() {
    const word = wordOf.get(anchor);
    const { hex, sameHash, sameNumbers } = recompute(word);
    const pick = explain(word).steps.at(-1);
    const proof = root.querySelector(".proof");
    const row = (ok, text) => { const p = el("p", ok ? "ok" : "bad"); p.innerHTML = pixelSvg(ok ? ART.tick : ART.cross); p.append(el("span", null, text)); return p; };
    proof.replaceChildren(
      el("p", "soft", "Fingerprint, worked out by your browser just now:"),
      el("p", "hex", shortHex(hex)),
      row(sameHash, sameHash ? "The same one I wrote from." : "Not the one I wrote from."),
      row(sameNumbers, sameNumbers ? `Its numbers give ${pick.pickedName}, place ${pick.position + 1}: ${pick.word}.` : "Its numbers give a different word."),
    );
    root.querySelector('[data-act="check"]').hidden = true;
    root.scrollTop = root.scrollHeight; // on a short screen the box scrolls inside: the check comes into view
  }

  function build() {
    const word = wordOf.get(anchor);
    const head = el("div", "card-head");
    head.append(el("span", `card-word ${word.trade.side === "sell" ? "sell" : "buy"}`, word.text));
    if (madeUp(word.trade)) head.append(el("span", "tag", "made-up trade"));
    settle(); // a line that says "Copied" goes with the old box
    root.replaceChildren(head, who(word));
    if (level === 2) root.append(how(word));
    else if (pinned) root.append(choice("How was it picked?", "how"));
    else root.append(el("p", "card-hint", "Press the word to see how it was picked."));
    root.classList.toggle("pinned", pinned);
    root.scrollTop = 0;
  }

  function show(span, toLevel, pin) {
    if (anchor && anchor !== span) anchor.classList.remove("on");
    anchor = span;
    level = toLevel;
    pinned = pin;
    anchor.classList.add("on");
    build();
    root.hidden = false;
    place();
  }

  function close() {
    if (!anchor) return;
    anchor.classList.remove("on");
    anchor = null;
    level = 0;
    pinned = false;
    root.hidden = true;
  }

  // Keep the box next to its word; the page may be scrolling under it.
  function place() {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    if (!anchor.isConnected || r.width === 0) { close(); return; }
    const w = root.offsetWidth, h = root.offsetHeight, edge = 8, gap = 12;
    const wide = document.documentElement.clientWidth;
    const top = topEdge() + 8, bottom = window.innerHeight - bottomEdge() - 10;
    let x = clamp(r.left + r.width / 2 - w / 2, edge, wide - w - edge);
    let y = r.bottom + gap;
    if (y + h > bottom) {
      if (r.top - gap - h >= top) y = r.top - gap - h; // over the word
      else if (r.right + gap + w <= wide - edge) { x = r.right + gap; y = r.top - 3 * gap; } // no room over or under: beside it
      else if (r.left - gap - w >= edge) { x = r.left - gap - w; y = r.top - 3 * gap; }
    }
    root.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(top, Math.min(y, bottom - h)))}px)`;
  }

  const wordAt = (target) => {
    const span = target instanceof Element ? target.closest(".w") : null;
    return span && wordOf.has(span) ? span : null;
  };

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || pinned) return;
    const span = wordAt(e.target);
    if (span && span !== anchor) show(span, 1, false);
  });
  document.addEventListener("pointerout", (e) => {
    if (pinned || !anchor || wordAt(e.target) !== anchor) return;
    if (!(e.relatedTarget instanceof Node && anchor.contains(e.relatedTarget))) close();
  });
  document.addEventListener("click", (e) => {
    if (root.contains(e.target)) {
      const pressed = e.target.closest("[data-act]");
      const act = pressed?.dataset.act;
      if (act === "how") show(anchor, 2, true);
      if (act === "check") { prove(); place(); }
      if (act === "copy") copy(pressed);
      return;
    }
    const span = wordAt(e.target);
    if (!span) { close(); return; }
    if (span !== anchor) show(span, 1, true);
    else if (level === 1) show(span, 2, true);
    else close();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  return { close, frame: place, get open() { return !!anchor; } };
}
