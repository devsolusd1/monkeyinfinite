// The book: trades in, words and pages out. A page holds a fixed number of words; when it is full it is
// sealed on the next trade (so that the full stop of its last sentence, if one comes, stays on it) and
// its text is what would be sent to Solana as one memo.

import { initialState, step, TYPE_NAMES } from "./grammar.js";
import { sha256Text, toBase58, utf8 } from "./sha256.js";

export const WORDS_PER_PAGE = 150;

// The page as plain text, exactly as it goes into the memo.
export function pageText(items) {
  let out = "";
  for (const it of items) {
    if (it.kind === "punct") { out += it.mark + (it.paragraph ? "\n\n" : ""); continue; }
    if (it.commaBefore) out += ",";
    if (out && !out.endsWith("\n")) out += " ";
    out += it.text + (it.commaAfter ? "," : "");
  }
  return out;
}

// A steady colour for a wallet: the same wallet always writes in the same hue (0 to 359).
export function hueOf(wallet) {
  const d = sha256Text(wallet);
  return ((d[0] << 8) | d[1]) % 360;
}

export const shortKey = (key, head = 4, tail = 4) => (key.length <= head + tail + 1 ? key : `${key.slice(0, head)}…${key.slice(-tail)}`);

// How one word came to be, in plain steps a visitor can follow and redo.
export function explain(word) {
  return {
    input: `${word.trade.signature}:${word.trade.blockhash}`,
    digest: word.digest,
    steps: word.trace.map((t) => ({
      after: t.from,
      allowed: t.options.map((o) => ({ type: o.type, name: TYPE_NAMES[o.type], weight: o.weight })),
      roll: t.roll, outOf: t.total,
      picked: t.type, pickedName: TYPE_NAMES[t.type],
      word: t.word, position: t.index, listSize: t.listSize, mark: t.mark,
    })),
  };
}

export function createBook({ wordsPerPage = WORDS_PER_PAGE, lexicon } = {}) {
  let state = initialState();
  let wordCount = 0;
  const pages = [];
  let current = { number: 1, items: [], words: 0, firstSlot: null, lastSlot: null };

  function seal(closedBy) {
    const text = pageText(current.items);
    const previous = pages.length ? pages[pages.length - 1].memo.signature : null;
    const memoText = `page ${current.number}${previous ? ` after ${previous}` : ""}\n${text}`;
    const page = {
      kind: "page", number: current.number, items: current.items, words: current.words, text,
      firstSlot: current.firstSlot, lastSlot: current.lastSlot, closedBy,
      // In the rehearsal nothing is sent: the signature below is made up from the text so that pages can link.
      memo: { text: memoText, bytes: utf8(memoText).length, previous, signature: toBase58(sha256Text(memoText)), simulated: true },
    };
    pages.push(page);
    current = { number: page.number + 1, items: [], words: 0, firstSlot: null, lastSlot: null };
    return page;
  }

  // push(trade) -> events in the order they happen:
  //   { kind: "punct", mark, paragraph, page }            the sentence before ended
  //   { kind: "page", number, text, words, memo, ... }     the page before was sealed
  //   { kind: "word", text, word, type, typeName, index, page, indexInPage, sentenceStart,
  //     commaBefore, commaAfter, trade, digest, trace }    always exactly one, last
  function push(trade) {
    const r = step(state, trade.signature, trade.blockhash, lexicon);
    state = r.state;
    const out = [];
    const full = current.words >= wordsPerPage;
    for (const e of r.events) {
      if (e.kind === "punct") {
        const p = { ...e, page: current.number };
        current.items.push(p);
        out.push(p);
        continue;
      }
      if (full) out.push(seal(current.items.findLast((i) => i.kind === "word").trade.wallet));
      wordCount++;
      const w = {
        ...e, typeName: TYPE_NAMES[e.type], index: wordCount, page: current.number, indexInPage: current.words + 1,
        trade, digest: r.digest, trace: r.trace,
      };
      current.items.push(w);
      current.words++;
      current.firstSlot ??= trade.slot;
      current.lastSlot = trade.slot;
      out.push(w);
    }
    return out;
  }

  return {
    push,
    get pages() { return pages; },
    get current() { return current; },
    get wordCount() { return wordCount; },
    wordsPerPage,
  };
}
