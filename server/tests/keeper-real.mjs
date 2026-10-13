// The keeper on the real chain, reading only: the book of a token that already trades, kept in memory
// through the real server/chain.js, then checked against a second reading of the same trades that does
// not go through the keeper (another chain object, other batch sizes).
// Usage: node server/tests/keeper-real.mjs [mint] [seconds]
// The RPC node: see chain-node.mjs (RPC_URL, or the RPC_URL line of launch/.env; never printed).

import { createChain } from "../chain.js";
import { createKeeper } from "../keeper.js";
import { keysFor, memoryStore } from "../store.js";
import { rpcUrl, ownNode, pace } from "./chain-node.mjs";
import { differences, nameOf, tally } from "./keeper-kit.mjs";

// Created with a first buy inside the creating transaction, as $MONKEY will be (from chain-live.mjs).
const mint = process.argv[2] ?? "3hNDrh3RdBHgTuJ2cGS5E3ksLZu2DYaMXcCSVg4WLRBX";
const seconds = Number(process.argv[3] ?? 45);
const t = tally(`the keeper on the real chain (${ownNode ? "own node" : "public node"})`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const store = memoryStore();
const chain = createChain({ rpcUrl, ...pace });
const keeper = createKeeper({ store, chain, mint });
const began = Date.now();
let calls = 0, ran = 0, failed = 0, waiting = 0, last = null;
const reasons = new Set();
while (Date.now() - began < seconds * 1000) {
  calls++;
  try { if ((await keeper.sync()).ran) ran++; } catch (err) { failed++; reasons.add(err.constructor.name === "KeeperError" ? err.message : "something else"); }
  last = await keeper.live(0).catch(() => null);
  if (last?.live === false) waiting++;
  if (last?.live && ran >= 3) break; // level with the chain, and looked a few times since
  await sleep(1000);
}
const book = await store.get(keysFor(mint).book);
const took = Math.round((Date.now() - began) / 100) / 10;
t.ok(!!book && book.total > 0, `the keeper read trades of ${mint.slice(0, 8)}… (${book?.total ?? 0})`);
const how = last?.live ? `live: ${last.total} words, venue ${last.venue}` : last?.reason ?? "no answer";
// A long history, or a node that is slow today, is not caught up with in the time given: then the answer
// must be saying so. (The line at the end tells which it was.)
t.ok(last?.live === true || last?.reason === "catching up", `after ${seconds} s it answers "${how}"`);
if (failed) console.log(`  (${failed} looks failed: ${[...reasons].join(", ")})`);

if (book?.total) {
  // The second reading: the same number of trades, straight from another chain object.
  const second = createChain({ rpcUrl, ...pace });
  const where = await second.locate(mint);
  const trades = [];
  let cursor = null;
  for (let i = 0; i < 400 && trades.length < book.total; i++) {
    const got = await second.tradesSince(where, cursor, { limit: 37 });
    trades.push(...got.trades);
    cursor = got.cursor;
    if (!got.more && trades.length < book.total) await sleep(500);
  }
  const same = trades.slice(0, book.total);
  const diff = await differences(store, mint, same);
  t.ok(same.length === book.total && !diff.length, `the store holds exactly the chain's first ${book.total} trades, as one book of them reads (${diff.join("; ")})`);
  const first = same[0];
  console.log(`  first trade: ${first.side} of ${first.sol} SOL in slot ${first.slot}, ${new Date(first.time).toISOString()}; ${same.filter((x) => x.swap).length} trades are one of several swaps of their transaction; ${new Set(same.map(nameOf)).size} distinct`);
}
t.done(`${last?.live ? "level with the chain" : "NOT level yet"} after ${took} s (${how}); ${book?.total ?? 0} words, ${book?.pages ?? 0} finished pages, ${calls} calls in ${took} s (${ran} looked at the chain, ${waiting} answered not live, ${failed} failed), ${chain.stats.calls} RPC calls in ${chain.stats.requests} requests`);
process.exit(process.exitCode ?? 0);
