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

// resume: begin at the top of a page from what was written down when the page before it was sealed,
// { state, wordCount, pageNumber } (the `next` of that page's event). The full stop that the first
// trade may bring belongs to the page before, so it is handed back marked `carried` and kept off this page.
export function createBook({ wordsPerPage = WORDS_PER_PAGE, lexicon, resume = null } = {}) {
  let state = resume ? { ...resume.state } : initialState();
  let wordCount = resume ? resume.wordCount : 0;
  const pages = [];
  let current = { number: resume ? resume.pageNumber : 1, items: [], words: 0, firstSlot: null, lastSlot: null };
  let carry = !!resume; // true until the first word after a resume

  // next: where the following page starts. closing: the mark that ended this page's last sentence,
  // when it came with the trade that sealed the page (it is already among the items).
  function seal(closedBy, next, closing) {
    const text = pageText(current.items);
    const previous = pages.length ? pages[pages.length - 1].memo.signature : null;
    const memoText = `page ${current.number}${previous ? ` after ${previous}` : ""}\n${text}`;
    const page = {
      kind: "page", number: current.number, items: current.items, words: current.words, text,
      firstSlot: current.firstSlot, lastSlot: current.lastSlot, closedBy,
      next: { ...next, pageNumber: current.number + 1 }, closing,
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
    const before = { state: { ...state }, wordCount };
    const r = step(state, trade.signature, trade.blockhash, lexicon);
    state = r.state;
    const out = [];
    const full = current.words >= wordsPerPage;
    let closing = null;
    for (const e of r.events) {
      if (e.kind === "punct") {
        if (carry && current.words === 0) { out.push({ ...e, page: current.number - 1, carried: true }); continue; }
        const p = { ...e, page: current.number };
        current.items.push(p);
        out.push(p);
        if (full) closing = { mark: e.mark, paragraph: e.paragraph };
        continue;
      }
      if (full) out.push(seal(current.items.findLast((i) => i.kind === "word").trade.wallet, before, closing));
      carry = false;
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
    // Where the book stands, enough to carry on from: the start of the page being written and what is on it.
    snapshot: () => ({ state: { ...state }, wordCount, pageNumber: current.number, wordsInPage: current.words }),
    wordsPerPage,
  };
}

// The record of a page: what has to be kept to show it again without the rest of the book.
//   { number, start: { state, wordCount }, trades: [...], closing: { mark, paragraph } | null }
// `start` of page 1 is { state: initialState(), wordCount: 0 }; of any other page, the `next` of the
// page event before it. `trades` are the trades of its words, in order; a page still being written
// has fewer than a full page and no closing.
export const firstPageStart = () => ({ state: initialState(), wordCount: 0 });

export function rebuildPage(record, { lexicon } = {}) {
  const book = createBook({ lexicon, resume: { state: record.start.state, wordCount: record.start.wordCount, pageNumber: record.number } });
  for (const trade of record.trades) book.push(trade);
  const page = book.current;
  if (record.closing) page.items.push({ kind: "punct", mark: record.closing.mark, paragraph: record.closing.paragraph, page: record.number });
  return { number: record.number, items: page.items, words: page.words, text: pageText(page.items), firstSlot: page.firstSlot, lastSlot: page.lastSlot };
}
