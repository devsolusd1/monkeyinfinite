// The book keeper. It reads the chain once for everybody: asks for the trades it has not seen, runs them
// through core/book.js, and keeps in the store what the two endpoints answer from. It only ever reads the
// chain: nothing here builds, signs or sends a transaction.
//
// What is kept for a token (names in store.js, keysFor):
//   book      { v, cursor, total, pages, page: { number, start, trades } }
//             the page being written and how far the chain has been read. One value, replaced whole, so
//             the cursor and the page can never disagree.
//   page:<n>  { number, start, trades, closing, firstSlot, lastSlot }    a finished page; never changes
//   watch     { where, lookedAt, checkedAt, behind }
//             where the token trades, when the chain last answered, and whether the book is known to be
//             far behind the chain
//   lock      held by the one caller who is reading the chain
//
// The order of writes in one step: the finished pages, then the book. Killed in between, the book still
// holds the old cursor, so the same trades are read again and the same pages written again: work is
// repeated, and no trade is skipped or written twice. A finished page is handed out only once the book
// counts it. On the way into a long catch-up (a late start, or hours with nobody calling) the watch is
// marked `behind` before the book moves, and cleared after it has arrived, so a book that is half way
// there is never answered as the current one.

import { createBook, firstPageStart } from "../site/core/book.js";
import { keysFor, StoreError } from "./store.js";

// The messages of this error are fixed and plain: they are safe to show and to log.
export class KeeperError extends Error {}

const blank = () => ({ v: 0, cursor: null, total: 0, pages: 0, page: { number: 1, start: firstPageStart(), trades: [] } });
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// A trade as it is kept: the seven fields, and `swap` (which swap of its transaction, from 1) when the
// chain says the transaction made several: each of them is a trade and writes a word. The signature, the
// block hash and the slot make the book, so a trade without them is refused; an amount or a time that is
// missing is not worth stopping the book for.
const nameOf = (t) => (t.swap ? `${t.signature}#${t.swap}` : t.signature);
function kept(t, last, now) {
  for (const f of ["signature", "blockhash", "wallet"]) if (typeof t?.[f] !== "string" || !t[f]) throw new KeeperError(`the chain gave a trade without its ${f}`);
  if (!Number.isSafeInteger(t.slot)) throw new KeeperError("the chain gave a trade without its slot");
  if (t.side !== "buy" && t.side !== "sell") throw new KeeperError("the chain gave a trade that is neither a buy nor a sell");
  if (last && t.slot < last.slot) throw new KeeperError("the chain gave trades out of order");
  return {
    signature: t.signature, blockhash: t.blockhash, slot: t.slot, wallet: t.wallet, side: t.side,
    sol: Number.isFinite(t.sol) ? t.sol : 0,
    time: Number.isFinite(t.time) && t.time > 0 ? t.time : (last?.time ?? now),
    ...(Number.isSafeInteger(t.swap) && t.swap > 0 && { swap: t.swap }),
  };
}

// One step: the trades of one answer from the chain, on top of the book as it was stored.
// Gives the book to store next and the pages that finished on the way ({ key: record }).
export function advance(book, trades, cursor, keys, now = Date.now()) {
  const writer = createBook({ resume: { state: book.page.start.state, wordCount: book.page.start.wordCount, pageNumber: book.page.number } });
  for (const t of book.page.trades) writer.push(t); // back to where the page stands
  let page = { number: book.page.number, start: book.page.start, trades: [...book.page.trades] };
  let onPage = new Set(page.trades.map(nameOf));
  let last = page.trades.at(-1) ?? null;
  const finished = {};
  let added = 0, repeated = 0;
  for (const raw of trades) {
    const trade = kept(raw, last, now);
    // The same trade handed over twice writes one word, not two.
    if (onPage.has(nameOf(trade))) { repeated++; continue; }
    const sealed = writer.push(trade).find((e) => e.kind === "page");
    if (sealed) {
      finished[keys.page(page.number)] = { number: page.number, start: page.start, trades: page.trades, closing: sealed.closing, firstSlot: sealed.firstSlot, lastSlot: sealed.lastSlot };
      page = { number: sealed.next.pageNumber, start: { state: sealed.next.state, wordCount: sealed.next.wordCount }, trades: [] };
      onPage = new Set();
    }
    page.trades.push(trade);
    onPage.add(nameOf(trade));
    last = trade;
    added++;
  }
  return { book: { v: book.v + 1, cursor: cursor ?? null, total: page.start.wordCount + page.trades.length, pages: page.number - 1, page }, finished, added, repeated };
}

// make() must settle within ms, or the wait is given up (the call itself is left to finish alone).
function within(make, ms, why) {
  if (!(ms > 0)) return Promise.reject(new KeeperError(why));
  let timer;
  return Promise.race([
    Promise.resolve().then(make),
    new Promise((_, no) => { timer = setTimeout(() => no(new KeeperError(why)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// everyMs   the chain is looked at no more often than this
// lockMs    how long the lock holds if its holder dies
// budgetMs  after this long a sync asks for no further batch; the next call carries on
// hardMs    after this long a sync gives up waiting for the chain, and writes nothing more
// lookMs    how often to ask again where the token trades, until it has graduated (the chain finds the
//           pool by itself when it reads the migration; this is for saying "pool" and for a chain that does not)
// staleMs   with no look at the chain for this long, what is stored may be out of date: a token "not created"
//           is not answered from it, and a book found far behind is marked `behind` until it is level again
// lagMs     far behind: there is more to read and the last word kept is older than this
// batch     trades asked for at a time; most: about how many one sync takes
export function createKeeper({
  store, chain = null, mint, now = Date.now, sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  everyMs = 1000, lockMs = 10_000, budgetMs = 2500, hardMs = 4000, lookMs = 3000, lagMs = 60_000, staleMs = 20_000,
  batch = 200, most = 600, waitMs = 250, waits = 4,
}) {
  const keys = keysFor(mint);
  let seen = null; // what this instance last read from the store: { book, watch, at }
  let running = null; // the sync under way in this instance; callers arriving meanwhile share it
  let wanted = null; // the chain's answer about the trades after a cursor, on its way or come and not used yet

  async function look() {
    const at = now();
    const [book, watch] = await store.getMany([keys.book, keys.watch]);
    seen = { book: book ?? blank(), watch: watch ?? null, at };
    return seen;
  }
  const view = () => (seen && now() - seen.at < everyMs ? seen : look());
  const unheard = (watch) => !watch || now() - watch.checkedAt > staleMs;
  const lagging = (book) => { const last = book.page.trades.at(-1); return !last || now() - last.time > lagMs; };

  // Asks the chain for the trades after the cursor, once. A node can take longer over it than a look may
  // last; the look then gives up, but the question is not thrown away: the next look, standing at the same
  // cursor, waits for the same answer instead of asking again (and paying the node again).
  function tradesAfter(where, cursor, began) {
    const key = JSON.stringify([where, cursor]);
    if (wanted?.key !== key) {
      const mine = { key, came: null, answer: null };
      mine.answer = Promise.resolve()
        .then(() => chain.tradesSince(where, cursor, { limit: batch, deadline: Date.now() + budgetMs - (now() - began) }))
        .finally(() => { mine.came = now(); });
      mine.answer.catch(() => { if (wanted === mine) wanted = null; }); // a question that failed is asked again
      wanted = mine;
    }
    return wanted;
  }

  async function run() {
    const began = now();
    if (seen && began - seen.at < everyMs) return { ran: false, why: "just looked" };
    if (!chain) throw new KeeperError("no chain to read");
    const token = await store.lock(keys.lock, lockMs);
    if (!token) {
      // Somebody else is reading the chain. If nobody had for a while, what is stored may be far behind:
      // give them a moment to finish rather than answer with it.
      let s = await look();
      for (let i = 0; i < waits && unheard(s.watch); i++) { await sleep(waitMs); s = await look(); }
      return { ran: false, why: "someone else is looking" };
    }
    try {
      let { book, watch } = await look();
      watch ??= { where: null, lookedAt: 0, checkedAt: 0, behind: false };
      const left = () => hardMs - (now() - began);
      const ask = (make) => within(make, left(), "the chain is slow").catch((err) => {
        throw err instanceof KeeperError ? err : new KeeperError("the chain did not answer"); // its own words may hold the node's address
      });

      // Where the token trades. Asked until it exists, then now and again until it has left the curve.
      if (!watch.where?.live || (!watch.where.graduated && began - watch.lookedAt >= lookMs)) {
        const where = await ask(() => chain.locate(mint));
        // Once created, always created: a node that has lost sight of the token does not undo that.
        watch = { ...watch, where: where?.live ? where : (watch.where?.live ? watch.where : { live: false }), lookedAt: now() };
      }

      // Nobody had looked for a while, or ever: what is stored may be far behind the chain. Only then can
      // the book be marked `behind`. A keeper that looks every second and still lags (a rush of trades, a
      // slow node) goes on answering: its readers are following along, a little late.
      const idle = began - watch.checkedAt > staleMs;
      let added = 0, more = false;
      if (watch.where.live) {
        // The trades after the cursor, one answer at a time, each stored before the next is asked for.
        for (let turn = 0; turn < 50; turn++) {
          const question = tradesAfter(watch.where, book.cursor, began);
          const old = question.came !== null && question.came < began; // it had come before this look began
          const got = await ask(() => question.answer);
          // The answer is let go of once it is stored, or cannot be: until then it stays for the next look.
          const letGo = () => { if (wanted === question) wanted = null; };
          const refuse = (why) => { letGo(); return new KeeperError(why); };
          if (!got || !Array.isArray(got.trades)) throw refuse("the chain gave an answer that cannot be used");
          more = !!got.more;
          const moved = !same(got.cursor, book.cursor);
          if (got.trades.length && !moved) throw refuse("the chain gave trades without moving on"); // they would come again
          if (moved) {
            let step;
            try { step = advance(book, got.trades, got.cursor, keys, now()); } catch (err) { letGo(); throw err; }
            if (more && idle && lagging(step.book) && !watch.behind) {
              watch = { ...watch, behind: true };
              await store.set(keys.watch, watch);
            }
            if (left() <= 0) throw new KeeperError("the chain is slow"); // the lock may not be ours much longer
            if (!(await store.swap(keys.book, book.v, step.book, step.finished))) throw refuse("somebody else moved the book");
            book = step.book;
            added += step.added;
          }
          letGo();
          if (old && !more) continue; // "no more" was true when it came, not now: ask afresh
          if (!more || !moved || added >= most || now() - began >= budgetMs) break;
        }
      }
      watch = { ...watch, checkedAt: now(), behind: watch.behind && more && lagging(book) };
      await store.set(keys.watch, watch);
      seen = { book, watch, at: began };
      return { ran: true, added, more };
    } catch (err) {
      seen = null; // whatever was written is in the store; read it again before answering
      throw err;
    } finally {
      // Kept shut for the rest of the second, so that the chain is asked once a second at most.
      await store.unlock(keys.lock, token, everyMs - (now() - began)).catch(() => {});
    }
  }

  return {
    mint,
    // Looks at the chain if nobody has in the last second and nobody is right now. Settles within a few
    // seconds; throws a KeeperError (or the store's error) when the look failed.
    sync() { return (running ??= run().finally(() => { running = null; })); },

    // The chain's answer a look gave up waiting for, while it is still on its way (else null): for
    // letting it finish in peace.
    waiting() { return wanted && wanted.came === null ? wanted.answer.then(() => {}, () => {}) : null; },

    // The answer of GET /api/live?have=<n>, from the store only.
    async live(have = 0) {
      const has = Number.isSafeInteger(have) && have > 0 ? have : 0;
      let { book, watch, at } = await view();
      // A browser ahead of what this instance remembers got its words from another instance: read the
      // store again (a few times a second at most) rather than tell it that the book is shorter.
      if (has > book.total && now() - at >= everyMs / 4) ({ book, watch } = await look());
      if (!watch?.where?.live) {
        if (unheard(watch)) throw new KeeperError("the chain has not answered");
        return { live: false, mint, reason: "not created yet" };
      }
      if (watch.behind) return { live: false, mint, reason: "catching up" };
      const { number, start, trades } = book.page;
      const onThisPage = has >= start.wordCount;
      const from = onThisPage ? has - start.wordCount : 0;
      return {
        live: true, mint, venue: watch.where.graduated || book.cursor?.venue === "pool" ? "pool" : "curve", total: book.total, pages: book.pages,
        page: { number, start, from, trades: trades.slice(from) },
        reset: !onThisPage,
      };
    },

    // The answer of GET /api/page?n=<k>: the record of a finished page, or null.
    async page(n) {
      if (!Number.isSafeInteger(n) || n < 1) return null;
      const { book } = await view();
      return n <= book.pages ? store.get(keys.page(n)) : null; // written before the book counted it, so it is there
    },
  };
}

// ---- for the two endpoints ----

// The local server and the tests put a keeper of their own in the place of the one the endpoints would
// build from the environment.
let standIn = null;
export const useKeeper = (keeper) => { standIn = keeper; };
export const keeperInPlace = () => standIn;

// What may be said about a failure, in a response or in a log: one of the fixed messages of this folder,
// never the words of an error from outside (they can hold an address or a key).
export const reasonOf = (err) => (err instanceof KeeperError || err instanceof StoreError ? err.message : "something went wrong");

export function sendJson(res, status, body, cache, more = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  for (const [name, value] of Object.entries(more)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}
