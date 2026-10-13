// Where trades come from. This is the ONLY file that knows whether the trades are made up.
//
// On load it asks the backend (GET <api>/live?have=0) and plays one of two parts:
//   the rehearsal   made-up trades from core/sim.js, as before there was a token. It goes on asking
//                   now and then, and the moment the token exists the real book takes its place.
//   the real book   the token's trades. The backend reads the chain once for everybody; this file
//                   asks it for the trades after the last word it has, and never asks a Solana node.
// Either way the page gets the same things: the page being written, a shelf of finished pages, and
// from listen() on, the book's events for every new trade. A trade has this shape:
//   { signature, blockhash, slot, wallet, side: "buy" | "sell", sol, time }

import { createBook, rebuildPage, WORDS_PER_PAGE } from "../core/book.js";
import { createSim } from "../core/sim.js";
import { CONFIG } from "../config.js";

// The real book: how often the backend is asked for new trades.
const ASK_MS = 1500;            // while the tab is on show
const ASK_HIDDEN_MS = 10000;    // while it is not
const ASK_FAIL_MAX_MS = 12000;  // each failure doubles the wait, up to this
// The rehearsal: how often it asks whether the token exists yet.
const REHEARSAL_ASK_MS = 15000;
const NO_ANSWER_ASK_MS = 5000;    // sooner when the first question got no answer at all
const CATCHING_UP_ASK_MS = 2000;  // and when the token exists but the backend is still reading its trades
const NO_BACKEND_ASK_MS = 60000;  // seldom where there is no backend to ask (a plain file server)
// On load.
const FIRST_ANSWER_MS = 6000;      // how long the first answer may take before the rehearsal starts without it
const CATCHING_UP_WAIT_MS = 20000; // how long a backend that is catching up is waited for before the rehearsal starts after all
const PAGE_BEFORE_MS = 800;        // how long the page before the one being written is waited for, so the book appears whole
const ANSWER_MS = 8000; // how long any other answer may take
const CATCH_UP_MS = 3000; // ...but the page he was on, when he is one page behind: without it the new page is put down afresh
const KEEP = 12; // finished pages of the real book kept at hand; the others are fetched again when leafed to

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// One question to the backend: its answer, or { missing: true } where there is nothing at that
// address, or null when it did not answer (down, too slow, not JSON).
// (Some hosts send "/live" on to "/live/", or the other way round: the address it was sent on to
// is the one asked from then on, so that a question is one request and not two.)
let slash = "";
async function ask(path, ms = ANSWER_MS) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    const [name, query] = path.split("?");
    const res = await fetch(`${CONFIG.api}${name}${slash}?${query}`, { signal: stop.signal, headers: { accept: "application/json" } });
    if (res.redirected && res.url) slash = new URL(res.url).pathname.endsWith("/") ? "/" : "";
    if (res.status === 404) return { missing: true };
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// "Not live", but only because the backend is still reading the token's trades: the token exists.
const catchingUp = (a) => a?.live === false && a.reason === "catching up";
// How long the rehearsal waits before it asks again, by the answer it got.
const patience = (a) => (a?.missing ? NO_BACKEND_ASK_MS : catchingUp(a) ? CATCHING_UP_ASK_MS : REHEARSAL_ASK_MS);

// Is this an answer the real book can be written from? (Anything else, a "not live" among them,
// leaves things as they are.)
const isTrade = (t) => t && typeof t.signature === "string" && typeof t.blockhash === "string";
let warned = false;
function usable(a) {
  const p = a && a.live === true && a.page;
  if (!p || !Number.isInteger(p.number) || p.number < 1 || !Number.isInteger(p.from) || p.from < 0) return false;
  if (!p.start || !p.start.state || !Number.isInteger(p.start.wordCount) || !Array.isArray(p.trades) || !p.trades.every(isTrade)) return false;
  if (a.mint && a.mint !== CONFIG.mint) {
    if (!warned) console.warn("The backend keeps the book of another token than the one in config.js; staying in rehearsal.");
    warned = true;
    return false;
  }
  return true;
}

export function createFeed({ seed = "rehearsal" } = {}) {
  let rehearsing = true; // true while nothing here is real
  let book = null; // the book being written (in the real one: only from the top of its current page)
  let shelf = null; // its finished pages
  let hooks = null; // what listen() was given
  let stopRehearsal = null;
  let lastSignature = null; // of the last trade written
  let timer = 0, asking = false, askedAt = 0, firstWait = REHEARSAL_ASK_MS;
  let fails = 0;
  let tokenSeen = false; // the backend has said, one way or another, that the token exists

  // GET <api>/live?have=<n>: the trades after my n-th word (0: the page being written, whole).
  async function live(have, ms) {
    const a = await ask(`/live?have=${have}`, ms);
    if (usable(a) || catchingUp(a)) tokenSeen = true;
    return a;
  }

  // The page being written as it stands now, for putting down at once. (A copy: the book goes on.)
  const current = () => ({ number: book.current.number, items: book.current.items.slice(), words: book.current.words });

  // ---- the rehearsal ----
  // It starts in the middle of the book, so nobody lands on an empty page. Two tools for looking at
  // it: ?words=147 opens near the end of a page, ?speed=20 makes the made-up trades come twenty
  // times as fast. (Neither does anything to the real book.)
  function rehearse() {
    const query = new URLSearchParams(location.search);
    const speed = Math.min(200, Math.max(0.1, Number(query.get("speed")) || 1));
    const sim = createSim({ seed });
    const made = createBook();
    const wordsIn = Math.min(made.wordsPerPage, Number(query.get("words")) || 60);
    while (made.pages.length < 3 || made.current.words < wordsIn) made.push(sim.next());
    book = made;
    // every page of the rehearsal is in memory
    shelf = {
      get: (n) => made.pages[n - 1] || null,
      want: (n) => (made.pages[n - 1] ? Promise.resolve(made.pages[n - 1]) : Promise.reject(new Error("no such page"))),
      recent: () => made.pages.slice(-3),
      onPage: null,
    };
    return () => sim.run((trade) => hooks.events(made.push(trade)), { speed });
  }
  let play = null; // starts the made-up trades; returns what stops them

  // ---- the real book: its finished pages ----
  // Only a few are kept here. A page is fetched (GET <api>/page?n=) when it is leafed to and shown
  // again from its record alone; the ones that are finished while the visitor watches are kept as they come.
  const kept = new Map(); // number -> page, the one used last at the end
  const fetching = new Map(); // number -> promise of the page

  function keep(page) {
    kept.delete(page.number);
    kept.set(page.number, page);
    while (kept.size > KEEP) kept.delete(kept.keys().next().value);
    return page;
  }

  // The record of finished page n: { number, start, trades (150), closing, firstSlot, lastSlot }, or null.
  // It is asked for up to three times; once: one try and a short wait, for when there is another way.
  async function record(n, { once = false } = {}) {
    for (const pause of once ? [0] : [0, 1200, 3000]) {
      if (pause) await wait(pause);
      const r = await ask(`/page?n=${n}`, once ? CATCH_UP_MS : ANSWER_MS);
      if (r && r.number === n && r.start && Array.isArray(r.trades) && r.trades.every(isTrade)) return r;
    }
    return null;
  }

  const real = {
    get(n) {
      const page = kept.get(n);
      return page ? keep(page) : null;
    },
    want(n) {
      if (kept.has(n)) return Promise.resolve(keep(kept.get(n)));
      if (!fetching.has(n)) {
        fetching.set(n, record(n).then((r) => {
          fetching.delete(n);
          if (!r) throw new Error(`page ${n} did not come`);
          const page = keep(rebuildPage(r));
          try { real.onPage?.(page); } catch (err) { console.error(err); }
          return page;
        }, (err) => { fetching.delete(n); throw err; }));
      }
      return fetching.get(n);
    },
    recent: () => [...kept.values()].sort((a, b) => a.number - b.number).slice(-3),
    onPage: null, // set by whoever shows the pages: called when a fetched page has come
  };

  // ---- the real book: the page being written ----
  // Begin at the top of the page the backend is on, and write what is on it so far.
  function seat(page) {
    book = createBook({ resume: { state: page.start.state, wordCount: page.start.wordCount, pageNumber: page.number } });
    lastSignature = null;
    for (const trade of page.trades) { book.push(trade); lastSignature = trade.signature; }
    shelf = real;
    // the page before is wanted soon: it lies on the left of an open book, and the pages are measured by it
    if (page.number > 1) real.want(page.number - 1).catch(() => {});
  }

  // One more trade: the book's events for it, as they go to the writer.
  function take(trade) {
    const events = book.push(trade).filter((e) => !e.carried);
    lastSignature = trade.signature;
    const page = events.find((e) => e.kind === "page");
    if (page) {
      keep({ number: page.number, items: page.items, words: page.words, firstSlot: page.firstSlot, lastSlot: page.lastSlot });
      // A tab left open must not hold the whole book: carry on in one that begins at the top of the new page.
      book = createBook({ resume: page.next });
      book.push(trade);
    }
    return events;
  }
  const write = (trades) => { for (const trade of trades) hooks.events(take(trade)); };

  // The backend is exactly one page ahead: fetch the page I was on, write the words I was missing,
  // then the new page so far. Its first trade closes the old page, so the page turns as usual.
  async function catchUp(a) {
    const n = book.current.number, mine = book.current.words;
    const r = await record(n, { once: true }); // if it does not come, the new page is simply put down afresh
    if (!r || r.trades.length !== book.wordsPerPage || mine > r.trades.length) return false;
    if (mine && r.trades[mine - 1].signature !== lastSignature) return false; // not the page I was writing
    write(r.trades.slice(mine));
    if (book.wordCount !== a.page.start.wordCount) return false;
    write(a.page.trades);
    return true;
  }

  // Put the book down afresh from a whole answer (one asked with have=0, or one that said reset).
  function again(a, { first = false } = {}) {
    seat(a.page);
    hooks.restart({ current: current(), total: book.wordCount, shelf, rehearsal: false, first });
  }

  // Ask for the trades after my last word and write them. A trade is never written twice and never
  // skipped: the answer says where its first trade stands, and that has to be right after my last word.
  // Returns whether the backend answered.
  async function more() {
    const had = book.wordCount;
    const a = await live(had);
    if (!usable(a)) return false; // down, or it says "not live" now: what is written stays, and it is asked again
    const p = a.page, mine = book.current;
    // In step: its trades begin right after my last word, on the page I am writing or, when mine is full, at the top of the next.
    const samePage = p.number === mine.number && p.start.wordCount === had - mine.words;
    const nextPage = p.number === mine.number + 1 && p.start.wordCount === had && mine.words >= book.wordsPerPage;
    if (!a.reset && p.start.wordCount + p.from === had && (samePage || nextPage) && !(a.total < had)) {
      write(p.trades);
      return true;
    }
    if (a.reset && p.from === 0 && p.number === book.current.number + 1 && await catchUp(a)) return true;
    // More than a page behind, or the counts disagree: the page being written, whole, from a fresh answer.
    const whole = a.reset && p.from === 0 ? a : await live(0);
    if (!usable(whole) || whole.page.from !== 0) return false;
    if (!a.reset) kept.clear(); // the backend's book is not the one these pages came from
    again(whole);
    return true;
  }

  // The rehearsal asks whether the token exists yet. Returns how long to wait before asking again.
  async function exists() {
    const a = await live(0);
    if (!usable(a) || a.page.from !== 0) return patience(a);
    stopRehearsal?.();
    stopRehearsal = null;
    rehearsing = false;
    kept.clear();
    again(a, { first: true }); // no made-up word is left on the page: the writer puts the real one down in its place
    return ASK_MS;
  }

  // ---- the clock: one question at a time ----
  async function turn() {
    if (asking) return;
    asking = true;
    clearTimeout(timer);
    askedAt = performance.now();
    let next = REHEARSAL_ASK_MS;
    try {
      if (rehearsing) next = await exists();
      else if (await more()) {
        if (fails >= 2) hooks.health(true);
        fails = 0;
        next = document.hidden ? ASK_HIDDEN_MS : ASK_MS;
      } else {
        if (++fails === 2) hooks.health(false);
        next = Math.min(ASK_FAIL_MAX_MS, Math.max(document.hidden ? ASK_HIDDEN_MS : 0, ASK_MS * 2 ** fails));
      }
    } catch (err) {
      console.error(err);
      next = ASK_FAIL_MAX_MS;
    }
    asking = false;
    timer = setTimeout(turn, next);
  }
  // The tab is looked at again, or the network is back: ask now (not more often than it would anyway).
  function soon() {
    if (!hooks || asking || document.hidden) return;
    clearTimeout(timer);
    timer = setTimeout(turn, Math.max(0, (rehearsing ? NO_ANSWER_ASK_MS : ASK_MS) - (performance.now() - askedAt)));
  }
  document.addEventListener("visibilitychange", soon);
  addEventListener("online", soon);

  // ---- the first question decides which part is played ----
  const ready = (async () => {
    let first = await live(0, FIRST_ANSWER_MS);
    // The token exists and the backend is still reading its trades: the real book is a moment
    // away, so it is waited for (a while) rather than shown a rehearsal that would be swept away.
    for (const until = performance.now() + CATCHING_UP_WAIT_MS; catchingUp(first) && performance.now() < until;) {
      await wait(CATCHING_UP_ASK_MS);
      first = await live(0, FIRST_ANSWER_MS);
    }
    if (usable(first) && first.page.from === 0) {
      rehearsing = false;
      seat(first.page);
      firstWait = ASK_MS;
      // (seat has asked for the page before: it lies on the left of an open book, and the pages are measured by it)
      if (first.page.number > 1) await Promise.race([real.want(first.page.number - 1).catch(() => {}), wait(PAGE_BEFORE_MS)]);
    } else {
      play = rehearse();
      firstWait = first ? patience(first) : NO_ANSWER_ASK_MS;
    }
  })();

  return {
    // Resolves when it is known which book this is and its page so far is at hand. Nothing below is to be used before.
    ready,
    // True while nothing here is real. The page shows its "Rehearsal" line and its "made-up" tags from this.
    get rehearsal() { return rehearsing; },
    // True once the backend has said that the token exists (it can say so a moment before it hands over the book).
    get tokenSeen() { return tokenSeen; },
    // The page being written, for putting down at once: { number, items, words }.
    get current() { return current(); },
    // How many words the whole book has.
    get wordCount() { return book.wordCount; },
    wordsPerPage: WORDS_PER_PAGE,
    // The finished pages: get(n) is page n if it is at hand, want(n) promises it, recent() is the last few at hand.
    get shelf() { return shelf; },
    // From now on:
    //   events(list)   the book's events for one new trade, in order (they go to the writer)
    //   restart(e)     the book is put down afresh from e.current, with e.shelf for its finished pages:
    //                  the real book took the rehearsal's place (e.first), or it had fallen more than a page behind
    //   health(ok)     the backend of the real book stopped answering, or answers again
    listen({ events, restart, health = () => {} }) {
      hooks = { events, restart, health };
      if (play) stopRehearsal = play();
      askedAt = performance.now();
      timer = setTimeout(turn, firstWait);
    },
  };
}
