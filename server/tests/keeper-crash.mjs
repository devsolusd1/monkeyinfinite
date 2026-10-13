// Killed between any two writes, the keeper loses nothing and doubles nothing.
// One story is played again and again: 700 trades from long ago to catch up with, then three small
// arrivals with a page turn among them, then two hours with nobody calling and 400 trades to catch up
// with. Each time the keeper is stopped at a different write:
//   death   the process is gone from that write on (nothing after it is written, the lock is left held),
//           and a new process carries on once the lock has let go
//   error   that one write fails and the same process carries on
//   lost    the write lands but its answer never comes back
// After every single call the store must hold a true beginning of the book, and at the end all of it.
// Usage: node server/tests/keeper-crash.mjs

import { firstPageStart } from "../../site/core/book.js";
import { createKeeper } from "../keeper.js";
import { keysFor, memoryStore } from "../store.js";
import { createFakeChain } from "./keeper-fake-chain.mjs";
import { differences, fakeClock, MINT, oneBook, seeded, tally } from "./keeper-kit.mjs";

const t = tally("killed at every write");
const keys = keysFor(MINT);
const OLD = 700, ARRIVALS = [20, 25, 15, 400]; // the 400 come after two hours in which nobody called
const sigs = (trades) => trades.map((x) => x.signature).join();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The story's chain is the same every time it is played, so one book of all of it is made once: the
// record every finished page must be equal to, and where every page starts.
let truth = null;
function truthOf(trades) {
  const starts = [null, firstPageStart()], records = [null];
  for (const p of oneBook(trades).pages) {
    const first = starts[p.number].wordCount;
    records[p.number] = { number: p.number, start: starts[p.number], trades: trades.slice(first, first + 150), closing: p.closing, firstSlot: p.firstSlot, lastSlot: p.lastSlot };
    starts[p.number + 1] = { state: p.next.state, wordCount: p.next.wordCount };
  }
  return { starts, records };
}

// killAt: the numbers of the writes at which to stop (counted over the whole story); lostAt: the numbers of
// the store calls whose answer is lost.
async function play({ killAt = new Set(), mode = "death", lostAt = new Set() } = {}) {
  const now = fakeClock();
  let writes = 0, calls = 0, dead = false, deaths = 0, problems = [];
  const kinds = [];
  const inner = memoryStore({
    now,
    before(kind) {
      if (dead) throw new Error("dead");
      writes++;
      kinds.push(kind);
      if (!killAt.has(writes)) return;
      if (mode === "death") { dead = true; deaths++; }
      throw new Error("killed");
    },
  });
  const lossy = (name) => async (...args) => {
    const answer = await inner[name](...args);
    if (lostAt.has(++calls)) throw new Error("the answer was lost");
    return answer;
  };
  const store = { get: inner.get, getMany: inner.getMany, set: lossy("set"), swap: lossy("swap"), lock: lossy("lock"), unlock: lossy("unlock") };

  const chain = createFakeChain({ seed: "crash", now });
  chain.add(OLD, { every: 9000 });
  now.tick(3_600_000); // the keeper starts an hour after the last of them
  const settled = new Set([OLD]); // the totals at which the book is level with the chain
  const make = () => createKeeper({ store, chain, mint: MINT, now, batch: 97, most: 200, sleep: async () => {} });
  chain.add(ARRIVALS.reduce((a, b) => a + b));
  truth ??= truthOf(chain.trades);
  const later = chain.trades.splice(OLD); // these have not landed yet
  let keeper = make();

  // What anybody may see at this moment.
  async function inspect() {
    const book = await inner.get(keys.book);
    const total = book?.total ?? 0, pages = book?.pages ?? 0;
    if (book) {
      // Every page the book counts is the true page; the page being written starts where it should and
      // holds exactly the chain's trades from there to the last word kept.
      for (let n = 1; n <= pages; n++) if (!eq(await inner.get(keys.page(n)), truth.records[n])) problems.push(`with ${total} words stored, page ${n} is not the true page`);
      if (pages !== book.page.number - 1 || total !== book.page.start.wordCount + book.page.trades.length) problems.push(`with ${total} words stored, the counts do not add up`);
      if (!eq(book.page.start, truth.starts[book.page.number])) problems.push(`with ${total} words stored, page ${book.page.number} starts somewhere else`);
      if (sigs(book.page.trades) !== sigs(chain.trades.slice(book.page.start.wordCount, total))) problems.push(`with ${total} words stored, the page being written does not hold the chain's trades`);
    }
    const reader = createKeeper({ store: inner, mint: MINT, now });
    if (await reader.page(pages + 1)) problems.push(`page ${pages + 1} is handed out before the book counts it`);
    if (pages && !(await reader.page(pages))) problems.push(`page ${pages} is counted but cannot be read`);
    const a = await reader.live(0).catch(() => null); // no answer at all is fine: nobody is told anything false
    if (a?.live) {
      if (!settled.has(a.total)) problems.push(`a book of ${a.total} words was answered as the current one`);
      if (sigs(a.page.trades) !== sigs(chain.trades.slice(a.page.start.wordCount, a.total))) problems.push("the page answered is not the chain's");
    }
  }

  // Calls sync until the book is level with the chain, restarting the process when it has died.
  async function level() {
    for (let i = 0; i < 300; i++) {
      const r = await keeper.sync().catch(() => null);
      await inspect();
      if (dead) { dead = false; keeper = make(); now.tick(10_001); } else now.tick(1000);
      if (r?.ran && !r.more) return;
    }
    problems.push("the keeper never got level with the chain again");
  }

  await level();
  for (const n of ARRIVALS) {
    if (n > 100) now.tick(2 * 3_600_000);
    chain.trades.push(...later.splice(0, n));
    settled.add(chain.trades.length);
    await level();
  }
  problems.push(...(await differences(inner, MINT, chain.trades)));
  const end = await createKeeper({ store: inner, mint: MINT, now }).live(0).catch(() => null);
  if (!end?.live || end.total !== chain.trades.length) problems.push(`at the end live says ${end?.live ? end.total : "not live"}`);
  return { problems, writes, calls, kinds, deaths, trades: chain.trades.length, pages: end?.pages };
}

// The story with nobody stopping it: how many writes there are to be stopped at.
const calm = await play();
t.ok(!calm.problems.length, `undisturbed: ${calm.problems.join("; ")}`);
const count = (k) => calm.kinds.filter((x) => x === k).length;
const W = calm.writes, C = calm.calls;

let runs = 0;
async function expectFine(options, what) {
  const r = await play(options);
  runs++;
  t.ok(!r.problems.length, `${what}: ${r.problems.slice(0, 3).join("; ")}`);
  return r;
}

for (let k = 1; k <= W; k++) await expectFine({ killAt: new Set([k]), mode: "death" }, `death at write ${k} (${calm.kinds[k - 1]})`);
for (let k = 1; k <= W; k++) await expectFine({ killAt: new Set([k]), mode: "error" }, `error at write ${k} (${calm.kinds[k - 1]})`);
for (let c = 1; c <= C; c++) await expectFine({ lostAt: new Set([c]) }, `lost answer of store call ${c}`);
// Dying again while picking up after a death.
for (let k = 1; k <= W; k++) for (const gap of [1, 2, 3, 5]) await expectFine({ killAt: new Set([k, k + gap]), mode: "death" }, `death at writes ${k} and ${k + gap}`);
// And any mix: a few deaths, errors and lost answers anywhere in the story.
const dice = seeded("mix");
let mixedDeaths = 0;
for (let i = 0; i < 400; i++) {
  const killAt = new Set(Array.from({ length: 1 + dice(5) }, () => 1 + dice(W + 30)));
  const lostAt = new Set(Array.from({ length: dice(3) }, () => 1 + dice(C + 10)));
  const mode = dice(3) ? "death" : "error";
  mixedDeaths += (await expectFine({ killAt, lostAt, mode }, `mix ${i} (${mode} at ${[...killAt]}, lost ${[...lostAt]})`)).deaths;
}

t.done(`the story has ${calm.trades} trades, ${calm.pages} finished pages and ${W} writes (${count("lock")} locks, ${count("set")} notes of the watch, ${count("other")} page records, ${count("swap")} writes of the book, ${count("unlock")} unlocks); it was played ${runs} more times: stopped dead at each of the ${W} writes, an error at each, the answer lost at each of ${C} store calls, two deaths ${W * 4} ways, and 400 mixes (${mixedDeaths} deaths)`);
