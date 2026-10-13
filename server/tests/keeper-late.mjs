// A late start: the keeper begins hours after launch, or wakes after hours with nobody calling. It must
// catch up over several bounded calls and never answer a half-built book as the current one.
// Usage: node server/tests/keeper-late.mjs

import { createKeeper } from "../keeper.js";
import { memoryStore } from "../store.js";
import { createFakeChain } from "./keeper-fake-chain.mjs";
import { differences, fakeClock, MINT, seeded, tally } from "./keeper-kit.mjs";

const t = tally("a late start catches up");
const LAG = 60_000;
let late = "", idle = "", rush = "";

// An answer is honest when it is not live, or when its last word is the chain's last (or one of the
// totals at which the book was level), or at most a minute old.
function honest(a, chain, now, level = []) {
  if (!a.live) return true;
  if (a.total === chain.trades.length || level.includes(a.total)) return true;
  const last = chain.trades[a.total - 1];
  return !!last && now() - last.time <= LAG;
}

// ---- five hours and 20,000 trades late, with trades still coming ----
{
  const now = fakeClock(), dice = seeded("late");
  const store = memoryStore({ now });
  let seenWhile = 0, wrong = 0;
  const reader = createKeeper({ store, mint: MINT, now, everyMs: 0 }); // another instance, only answering
  const chain = createFakeChain({
    seed: "late", now,
    spy: async () => { const a = await reader.live(0).catch(() => ({ live: false })); seenWhile++; if (!honest(a, chain, now)) wrong++; },
  });
  chain.add(20_000, { every: 900 });
  const keeper = createKeeper({ store, chain, mint: MINT, now });
  let calls = 0, waiting = 0, largest = 0, mostAnswers = 0, first = null, reasons = new Set();
  while (calls < 500) {
    const before = chain.stats.tradesSince;
    const r = await keeper.sync();
    calls++;
    largest = Math.max(largest, r.added);
    mostAnswers = Math.max(mostAnswers, chain.stats.tradesSince - before);
    const a = await keeper.live(0);
    first ??= a;
    if (!honest(a, chain, now)) wrong++;
    if (a.live && a.total === chain.trades.length) break;
    if (!a.live) { waiting++; reasons.add(a.reason); }
    now.tick(1000);
    chain.add(dice(3)); // the market does not wait
  }
  t.ok(first && first.live === false && first.reason === "catching up" && first.mint === MINT, "the very first answer of a late start is not live");
  t.ok(reasons.size === 1 && reasons.has("catching up"), `while behind, the reason is always "catching up" (${[...reasons]})`);
  t.ok(wrong === 0, `no answer, during or between the looks, gave a half-built book as the current one (${wrong} did, of ${calls + seenWhile})`);
  t.ok(calls > 10 && calls < 60, `it took ${calls} calls`);
  t.ok(largest <= 800 && mostAnswers <= 4, `no call took more than a few hundred trades (the most: ${largest} trades in ${mostAnswers} answers from the chain)`);
  const diff = await differences(store, MINT, chain.trades);
  t.ok(!diff.length, `the book is the chain's (${diff.join("; ")})`);
  late = `${chain.trades.length} trades caught up in ${calls} calls (${waiting} of them answered "catching up", the largest took ${largest} trades), with ${seenWhile} looks from another instance while it ran`;
}

// ---- level, then nobody calls for two hours while 3,000 trades happen ----
{
  const now = fakeClock();
  const store = memoryStore({ now });
  let wrong = 0, seenWhile = 0, old = 0, catching = 0;
  const reader = createKeeper({ store, mint: MINT, now, everyMs: 0 });
  const chain = createFakeChain({
    seed: "idle", now, delayMs: 2,
    spy: async () => {
      const a = await reader.live(500).catch(() => ({ live: false }));
      seenWhile++;
      if (a.live && a.total === 500) old++; else if (!a.live) catching++;
      if (!honest(a, chain, now, [500])) wrong++;
    },
  });
  chain.add(500, { every: 1500 });
  const keeper = createKeeper({ store, chain, mint: MINT, now });
  const other = createKeeper({ store, chain, mint: MINT, now, waitMs: 5 }); // a second instance with a visitor of its own
  await keeper.sync();
  t.ok((await keeper.live(0)).total === 500, "level with the chain at 500 words");
  now.tick(2 * 3_600_000);
  chain.add(3000, { every: 2400 });

  // Two visitors arrive at the same moment, on two instances. One gets the lock; the other must not
  // answer with the two-hour-old book as if it were the current one.
  const [mine, theirs] = await Promise.all([keeper.sync(), other.sync()]);
  t.ok(mine.ran && !theirs.ran, "one of the two looks, the other is turned away");
  const fromOther = await other.live(500);
  t.ok(fromOther.live === false && fromOther.reason === "catching up", `the one turned away waits for the look and answers "catching up", not the old book (${fromOther.live ? `live with ${fromOther.total}` : fromOther.reason})`);
  let calls = 1;
  for (; calls < 100; calls++) {
    const a = await keeper.live(500);
    if (!honest(a, chain, now, [500])) wrong++;
    if (a.live && a.total === chain.trades.length) break;
    now.tick(1000);
    await keeper.sync();
  }
  t.ok(wrong === 0, `no answer gave a half-built book as the current one (${wrong} did, of ${calls + seenWhile})`);
  t.ok(old >= 1 && catching >= 1, `seen from another instance while the looks ran: the old level book before the first write (${old}), then "catching up" (${catching}), never a book half way`);
  const diff = await differences(store, MINT, chain.trades);
  t.ok(!diff.length, `the book is the chain's (${diff.join("; ")})`);
  idle = `after two idle hours 3000 trades caught up in ${calls} calls`;
}

// ---- there from the first trade, then a rush the keeper cannot keep up with ----
// It looks every second and falls minutes behind. Its readers are following along: it must go on
// answering, a little late, and not go dark at the busiest moment.
{
  const now = fakeClock();
  const store = memoryStore({ now });
  const chain = createFakeChain({ seed: "rush", now });
  const keeper = createKeeper({ store, chain, mint: MINT, now, batch: 20, most: 20 }); // a slow node: 20 trades a look
  chain.add(1);
  await keeper.sync();
  now.tick(1000);
  let dark = 0, backwards = 0, worstLag = 0, had = 1;
  for (let second = 0; second < 1000; second++) {
    if (second < 240) chain.add(60); // four minutes at 60 trades a second
    await keeper.sync();
    const a = await keeper.live(had);
    if (!a.live) dark++;
    else {
      if (a.total < had) backwards++;
      had = a.total;
      if (second < 240) worstLag = Math.max(worstLag, now() - chain.trades[a.total - 1].time);
    }
    now.tick(1000);
    if (a.live && second >= 240 && a.total === chain.trades.length) break;
  }
  t.ok(dark === 0 && backwards === 0, `in a rush it cannot keep up with, the keeper never stopped answering (${dark} answers not live) and never went backwards`);
  t.ok(worstLag > 120_000, `though it fell ${Math.round(worstLag / 1000)} s behind on the way`);
  t.ok(had === chain.trades.length && !(await differences(store, MINT, chain.trades)).length, `and ended with all ${chain.trades.length} trades, as one book reads them`);
  rush = `a rush of ${chain.trades.length} trades at three times what the keeper could take: never dark, ${Math.round(worstLag / 1000)} s behind at worst`;
}

// ---- every look is bounded in time (the real clock) ----
{
  // A slow chain: the look stops asking after its budget and says there is more.
  const store = memoryStore();
  const chain = createFakeChain({ seed: "slow", words: 5000, delayMs: 40 });
  const keeper = createKeeper({ store, chain, mint: MINT, batch: 10, most: 100_000, budgetMs: 200 });
  const began = Date.now();
  const r = await keeper.sync();
  const took = Date.now() - began;
  t.ok(r.ran && r.more && took < 600 && r.added < 200, `a slow chain: the look stopped after ${took} ms with ${r.added} trades and more to come`);
  t.ok(!(await differences(store, MINT, chain.trades.slice(0, r.added))).length, "what it had time for is a true beginning of the book");

  // A chain that never answers: the look gives up, lets go of the lock, and the next one can run.
  const stuck = createFakeChain({ seed: "stuck", words: 20 });
  const lonely = createKeeper({ store: memoryStore(), chain: stuck, mint: MINT, hardMs: 150, everyMs: 50 });
  const release = stuck.hold();
  const t0 = Date.now();
  const why = await lonely.sync().then(() => "ran", (err) => err.message);
  const gaveUp = Date.now() - t0;
  t.ok(why === "the chain is slow" && gaveUp < 500, `a chain that does not answer: given up after ${gaveUp} ms ("${why}")`);
  release();
  await new Promise((done) => setTimeout(done, 80));
  const again = await lonely.sync();
  t.ok(again.ran && again.added === 20, "and the next look runs and reads the 20 trades");
}

// ---- a node that takes longer over one answer than a look may last (the real clock) ----
// The question is asked once; the looks that come meanwhile wait for the same answer, and the one that is
// there when it comes writes it.
{
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  const store = memoryStore();
  const chain = createFakeChain({ seed: "long", words: 30 });
  const keeper = createKeeper({ store, chain, mint: MINT, hardMs: 120, everyMs: 30, lookMs: 1e9 });
  await keeper.sync();
  chain.add(25);
  await pause(40);
  const release = chain.hold(); // the next question to the chain gets no answer for now
  const asked = chain.stats.tradesSince, outcomes = [];
  for (let i = 0; i < 3; i++) {
    outcomes.push(await keeper.sync().then(() => "ran", (err) => err.message));
    await pause(40);
  }
  t.ok(outcomes.every((o) => o === "the chain is slow") && chain.stats.tradesSince === asked + 1, `three looks gave up waiting (${outcomes.join(", ")}), and the chain was asked once, not three times (${chain.stats.tradesSince - asked})`);
  t.ok(keeper.waiting() !== null && (await keeper.live(0)).total === 30, "meanwhile the book as stored is still answered, and the answer on its way is known");
  release();
  await pause(40);
  const r = await keeper.sync();
  t.ok(r.ran && r.added === 25 && keeper.waiting() === null, `the answer came: the next look wrote its 25 trades (${r.added})`);
  t.ok(chain.stats.tradesSince === asked + 2, "and asked once more, since an answer that had been lying there says nothing about now");
  t.ok(!(await differences(store, MINT, chain.trades)).length, "nothing lost, nothing twice");
}

t.done(`${late}; ${idle}; ${rush}`);
