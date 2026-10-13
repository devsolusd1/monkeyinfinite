// One caller at a time, about once a second: two syncs at once do not both run, a dead holder's lock lets go
// by itself, and a caller that lost the lock without knowing cannot write over the book.
// Usage: node server/tests/keeper-lock.mjs

import { createKeeper } from "../keeper.js";
import { keysFor, memoryStore } from "../store.js";
import { createFakeChain } from "./keeper-fake-chain.mjs";
import { catchUp, differences, fakeClock, MINT, seeded, tally } from "./keeper-kit.mjs";

const t = tally("one caller at a time, once a second");
const noSleep = async () => {};

// ---- many instances asking at the same moment, round after round ----
{
  const now = fakeClock(), dice = seeded("lock");
  const store = memoryStore({ now });
  const chain = createFakeChain({ seed: "lock", now, delayMs: 3 }); // slow enough for callers to overlap
  const keepers = Array.from({ length: 8 }, () => createKeeper({ store, chain, mint: MINT, now, sleep: noSleep }));
  let rounds = 0, ran = 0, turnedAway = 0, most = 0;
  for (; rounds < 150; rounds++) {
    chain.add(dice(40));
    const results = await Promise.all(keepers.map((k) => k.sync()));
    const running = results.filter((r) => r.ran).length;
    most = Math.max(most, running);
    ran += running;
    turnedAway += results.filter((r) => !r.ran && r.why === "someone else is looking").length;
    now.tick(1000);
  }
  t.ok(most === 1 && ran === rounds, `of 8 callers at the same moment exactly one runs, every round (${ran} ran in ${rounds} rounds, never more than ${most} at once)`);
  t.ok(chain.stats.together === 1, `the chain never had two callers at once (most at once: ${chain.stats.together})`);
  t.ok(turnedAway === rounds * 7, `the other seven were turned away each time (${turnedAway})`);
  await catchUp(keepers[0], now);
  const diff = await differences(store, MINT, chain.trades);
  t.ok(!diff.length, `and the book is the chain's (${diff.join("; ")})`);
  var crowd = `${rounds} rounds of 8 callers at once: ${ran} ran, ${turnedAway} turned away, ${chain.trades.length} trades`;
}

// ---- one instance, several requests at once: they share one look ----
{
  const now = fakeClock();
  const chain = createFakeChain({ seed: "same", now, words: 40, delayMs: 3 });
  const keeper = createKeeper({ store: memoryStore({ now }), chain, mint: MINT, now });
  const results = await Promise.all(Array.from({ length: 6 }, () => keeper.sync()));
  t.ok(chain.stats.tradesSince === 1 && results.every((r) => r === results[0]), `six requests in one instance share one look at the chain (${chain.stats.tradesSince} call)`);
}

// ---- about once a second ----
{
  const now = fakeClock();
  const store = memoryStore({ now });
  const chain = createFakeChain({ seed: "pace", now, words: 10 });
  const keepers = Array.from({ length: 3 }, () => createKeeper({ store, chain, mint: MINT, now, sleep: noSleep }));
  let looks = 0;
  for (let ms = 0; ms < 20_000; ms += 50) { // 3 instances, each asked 20 times a second, for 20 seconds
    for (const k of keepers) if ((await k.sync()).ran) looks++;
    now.tick(50);
  }
  t.ok(looks >= 19 && looks <= 21, `1200 calls over 20 seconds looked at the chain ${looks} times`);
  var pace = `1200 calls in 20 s made ${looks} looks`;
}

// ---- the holder dies with the lock ----
{
  const now = fakeClock();
  let dead = false, died = false; // dies once, at its first write of the book, and writes nothing after
  const store = memoryStore({ now, before: (kind) => { if (kind === "swap" && !died) died = dead = true; if (dead) throw new Error("dead"); } });
  const chain = createFakeChain({ seed: "dies", now, words: 30 });
  const first = createKeeper({ store, chain, mint: MINT, now, sleep: noSleep });
  await first.sync().then(() => t.ok(false, "the first keeper should have died"), () => {});
  dead = false;
  const second = createKeeper({ store, chain, mint: MINT, now, sleep: noSleep });
  now.tick(5000);
  const early = await second.sync();
  t.ok(!early.ran && early.why === "someone else is looking", "5 s after the holder died its lock still holds");
  now.tick(5001);
  const late = await second.sync();
  t.ok(late.ran && late.added === 30, `after 10 s the lock has let go and the next caller reads the 30 trades (${late.added})`);
  t.ok(!(await differences(store, MINT, chain.trades)).length, "nothing lost, nothing twice");
}

// ---- a caller that lost the lock without knowing ----
// A is held up inside the chain for longer than its lock lasts; B takes over and writes; then A comes back
// and reads the same trades.
for (const guard of ["its own clock", "the store"]) {
  const now = fakeClock();
  const store = memoryStore({ now });
  const chain = createFakeChain({ seed: "stale", now, words: 100 });
  // With hardMs out of the way only the store's version check stands between A and the book.
  // A asks for 50 trades at a time: if it did write, it would put the book back to 50 words.
  const a = createKeeper({ store, chain, mint: MINT, now, sleep: noSleep, batch: 50, hardMs: guard === "the store" ? 1e9 : 4000 });
  const b = createKeeper({ store, chain, mint: MINT, now, sleep: noSleep });
  const release = chain.hold();
  const stuck = a.sync().then(() => "wrote", (err) => err.message);
  await new Promise((done) => setTimeout(done, 20)); // A is now waiting for the chain, lock in hand
  now.tick(11_000); // ... for longer than the lock lasts
  const viaB = await b.sync(); // B takes the lock over and writes
  release();
  const whatA = await stuck; // A comes back with the same trades in hand
  t.ok(viaB.ran && viaB.added === 100, `stopped by ${guard}: the second caller took over and wrote the 100 trades`);
  t.ok(whatA === (guard === "the store" ? "somebody else moved the book" : "the chain is slow"), `stopped by ${guard}: the first caller, back from its wait, wrote nothing ("${whatA}")`);
  const diff = await differences(store, MINT, chain.trades);
  t.ok(!diff.length, `stopped by ${guard}: the book has every trade once (${diff.join("; ")})`);
  const book = await store.get(keysFor(MINT).book);
  t.ok(book.v === 1 && book.total === 100, `stopped by ${guard}: the book was written once (version ${book.v})`);
}

t.done(`${crowd}; ${pace}`);
