// Thousands of trades through sync in uneven batches must give exactly the pages one continuous book gives.
// Usage: node server/tests/keeper-book.mjs

import { createKeeper } from "../keeper.js";
import { keysFor, memoryStore } from "../store.js";
import { createFakeChain } from "./keeper-fake-chain.mjs";
import { catchUp, differences, fakeClock, MINT, seeded, tally } from "./keeper-kit.mjs";

const t = tally("uneven batches against one book");
let trades = 0, pages = 0, syncs = 0, answers = 0, smallest = Infinity, largest = 0;

// Trades arrive in uneven amounts between looks, and the chain hands them over in uneven answers.
async function run({ seed, total, batch, most, arrive, chunkOf, graduateAt = null, overlap = false, doubles = 0 }) {
  const now = fakeClock(), dice = seeded(seed);
  const store = memoryStore({ now });
  const chain = createFakeChain({ seed, now, overlap, doubles, chunk: chunkOf ? (limit) => chunkOf(limit, dice) : null });
  const keeper = createKeeper({ store, chain, mint: MINT, now, batch, most });
  let graduated = false;
  while (chain.trades.length < total) {
    chain.add(Math.min(total - chain.trades.length, arrive(dice)));
    if (graduateAt && !graduated && chain.trades.length >= graduateAt) { chain.graduate(); graduated = true; }
    await keeper.sync();
    syncs++;
    now.tick(1000 + dice(900));
    // At any moment what is stored is a true beginning of the book.
    if (dice(40) === 0) {
      const book = await store.get(keysFor(MINT).book);
      const diff = await differences(store, MINT, chain.trades.slice(0, book?.total ?? 0));
      t.ok(!diff.length, `${seed}: half way, the store agrees with one book of the same trades (${diff[0]})`);
    }
  }
  syncs += await catchUp(keeper, now);
  const diff = await differences(store, MINT, chain.trades);
  t.ok(!diff.length, `${seed}: ${total} trades, batch ${batch}: ${diff.join("; ")}`);
  // The comparison itself must not be blind: one trade less, or two in the other order, has to show.
  const fewer = chain.trades.filter((_, i) => i !== 200), turned = chain.trades.slice();
  [turned[300], turned[301]] = [turned[301], turned[300]];
  t.ok((await differences(store, MINT, fewer)).length > 0 && (await differences(store, MINT, turned)).length > 0, `${seed}: the comparison notices a missing trade and a swapped pair`);
  const live = await keeper.live(0);
  t.ok(live.live && live.total === total, `${seed}: live says ${live.total} words of ${total}`);
  if (graduateAt) t.ok(live.venue === "pool", `${seed}: the venue is the pool after graduation (${live.venue})`);
  const book = await store.get(keysFor(MINT).book);
  trades += total; pages += book.pages; answers += chain.stats.tradesSince;
  for (const s of chain.stats.sizes) { smallest = Math.min(smallest, s); largest = Math.max(largest, s); }
}

// The chain hands over anything from nothing to the limit; trades come a few at a time or in rushes.
await run({ seed: "a", total: 7321, batch: 200, most: 600, arrive: (d) => (d(5) === 0 ? d(900) : d(12)), chunkOf: (limit, d) => d(limit + 1) });
// One trade at a time: every page turn falls between two answers.
await run({ seed: "b", total: 1203, batch: 1, most: 5, arrive: (d) => d(7), chunkOf: null });
// Exactly a page at a time, and exactly a page and one.
await run({ seed: "c", total: 3000, batch: 150, most: 150, arrive: (d) => d(600), chunkOf: null });
await run({ seed: "d", total: 3001, batch: 151, most: 302, arrive: (d) => d(600), chunkOf: null });
// Rushes far larger than one look takes, so that the keeper is always carrying on from the call before.
await run({ seed: "e", total: 9000, batch: 200, most: 600, arrive: (d) => 1500 + d(1500), chunkOf: (limit, d) => 1 + d(limit) });
// The token graduates on the way: the trades of the pool are only found after looking again.
await run({ seed: "f", total: 2500, batch: 200, most: 600, arrive: (d) => d(60), chunkOf: (limit, d) => d(limit + 1), graduateAt: 1100 });
// A careless chain that hands the last trade over again with every answer: one word, not two.
await run({ seed: "g", total: 2000, batch: 64, most: 600, arrive: (d) => d(90), chunkOf: (limit, d) => 1 + d(limit), overlap: true });
// Transactions that swap twice: two trades with one signature, two words. With answers of any size the two
// often fall into different answers, and now and again on either side of a page turn.
await run({ seed: "h", total: 4000, batch: 37, most: 600, arrive: (d) => d(120), chunkOf: (limit, d) => 1 + d(limit), doubles: 7 });
// The same with the careless chain: a trade handed over twice is dropped, the second swap of a transaction is not.
await run({ seed: "i", total: 2500, batch: 50, most: 600, arrive: (d) => d(120), chunkOf: (limit, d) => 1 + d(limit), doubles: 5, overlap: true });

t.done(`${trades} trades, ${pages} finished pages, ${syncs} syncs, ${answers} answers from the chain of ${smallest} to ${largest} trades`);
