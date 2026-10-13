// chain.js against mainnet, reading only: real tokens, and for each stretch a second opinion that does not
// go through chain.js (every transaction of the stretch fetched and judged from its balances alone).
// Usage: node server/tests/chain-live.mjs [locate] [small] [first] [curve] [cross [again]] [recent] [tip] [cost]
//        (no word: all of them; about half an hour on a node that allows ten calls a second, and `cross`
//        alone twenty minutes the first time). The RPC node: see chain-node.mjs. With the public node only
//        `locate` and `small` are reasonable.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChain } from "../chain.js";
import { rpcUrl, ownNode, pace, ask, signaturesOf, transaction, byBalances, check, failures, direct } from "./chain-node.mjs";

const MONKEY = "7KDjZMEGHuihekvH6vQBjgwRFeMVW7bjoArUtTJmonk"; // reserved, not created yet
const A = { mint: "pH8X2DBCpgHAvhh96oGyZkafbvdUmsW843BCXFzLURE", curve: "2APyyQekX5BiDbsRKDJGDGb8yg37y2fDcD6cFmTb3Fh9" }; // still on its curve
const B = { mint: "GJaxyLPuZh5U2U4LgAVdGGC6KYRVXZp8t91P2vzaCHAM", pool: "DrrzhfxDQd6L6iPAyKwNUSkixTTtGn9w3EgBPxUUpYHz" }; // graduated; its pool has some 2.4 million signatures
// Two tokens created with a first buy inside the creating transaction (found by scanning the DBC program on 2026-10-13).
const F = { mint: "3hNDrh3RdBHgTuJ2cGS5E3ksLZu2DYaMXcCSVg4WLRBX", creating: "2WxdEoAXPmpYQXQ3oudYaYauqeDKxaSizS9i3iejsMj89mc3nKsyDrXixpgM5zx5ZDxJGpmb5tYQo1rkXQnSHGm8", buyer: "6oPTuP2VMUe7zqPtooyYPi677vNnpHPL3sLKxM3hnh9o", sol: 4 };
const G = { mint: "54JuiQLoxqFrxsMDK9qcGu2n7vXCW1YKt6GBuJWKkzbo", creating: "61CfCXKaHt9dY2GcuJwQUJrHFw6iHbJewtP4woxRYh3LqouzRSQ7JinmtgQdVfwnPcSgDX6LEbJMkJRaQk6zDhxh", buyer: "ANJbPV53qfbLga9qMoZsuAMaVAftGcHLbmkAw5BQAtiy", sol: 0.000090226 }; // and it graduated 77 slots later
const WSOL = "So11111111111111111111111111111111111111112";

const wanted = process.argv.slice(2);
const run = (name) => !wanted.length || wanted.includes(name);
const fresh = (more = {}) => createChain({ rpcUrl, ...pace, ...more });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const short = (s) => `${s.slice(0, 8)}…`;
const lamports = (t) => (t.side === "buy" ? 1n : -1n) * BigInt(Math.round(t.sol * 1e9));

// chain.js from a cursor until it has about `most` trades, runs dry, or passes `upTo`.
// -> trades (whole slots only), through: the last slot they cover in full.
async function read(chain, where, cursor, { most = Infinity, limit = 200, upTo = Infinity } = {}) {
  const trades = [];
  let calls = 0, more = true, through = upTo;
  while (more && trades.length < most && calls < 3000) {
    const got = await chain.tradesSince(where, cursor, { limit: Math.min(limit, most - trades.length) });
    trades.push(...got.trades);
    cursor = JSON.parse(JSON.stringify(got.cursor));
    more = got.more;
    calls++;
    if (trades.length && trades[trades.length - 1].slot > upTo) break;
  }
  if (more && trades.length && trades[trades.length - 1].slot <= upTo) through = trades[trades.length - 1].slot - 1; // cut by `most`: the last slot may be partial
  return { trades: trades.filter((t) => t.slot <= through), cursor, calls, more, through };
}

// The second opinion: every successful transaction among these signatures, judged from its balances.
async function opinion(entries, venue) {
  const out = [];
  for (const e of entries) if (!e.err) out.push({ signature: e.signature, tx: null, ...byBalances(await transaction(e.signature), venue) });
  return out.sort((a, b) => a.slot - b.slot || a.index - b.index);
}

// chain.js against the second opinion: nothing missing, nothing extra, same order, same sides and amounts.
function compare(label, mine, second) {
  const groups = new Map();
  for (const t of mine) (groups.get(t.signature) ?? groups.set(t.signature, []).get(t.signature)).push(t);
  let trades = 0, others = 0;
  const special = [], wrong = [];
  for (const o of second) {
    const g = groups.get(o.signature) ?? [];
    const net = g.reduce((sum, t) => sum + lamports(t), 0n);
    if (g.some((t) => t.wallet !== o.wallet || t.slot !== o.slot)) wrong.push(`${short(o.signature)} wallet or slot`);
    else if (g.length === 1 && g[0].side === o.side && g[0].sol === o.amount) trades++;
    else if (!g.length && !o.side) others++;
    else if (g.length && net === o.sol) special.push(`${short(o.signature)} balances: token ${o.token > 0n ? "+" : ""}${o.token}, SOL ${o.sol > 0n ? "+" : ""}${Number(o.sol) / 1e9} (${o.side ?? "not opposite"}); read as ${g.map((t) => `${t.side} ${t.sol}`).join(" then ")}`);
    else wrong.push(`${short(o.signature)} balances say ${o.side ?? "no trade"} ${o.amount}, chain.js says ${g.map((t) => `${t.side} ${t.sol}`).join(", ") || "nothing"}`);
  }
  const known = new Set(second.map((o) => o.signature));
  const extra = [...groups.keys()].filter((s) => !known.has(s));
  const order = second.filter((o) => groups.has(o.signature)).map((o) => o.signature);
  const mineOrder = mine.map((t) => t.signature).filter((s, i, all) => s !== all[i - 1]);
  const twice = mine.length - new Set(mine.map((t) => `${t.signature}:${t.swap ?? 1}`)).size;
  check(`${label}: nothing missing, nothing extra, sides and amounts as the balances say`, !wrong.length && !extra.length,
    `${mine.length} trades in ${groups.size} transactions; second opinion: ${second.length} successful transactions, ${trades} plain trades, ${others} not trades, ${special.length} read differently${wrong.length ? `; WRONG ${wrong.slice(0, 5).join(" | ")}` : ""}${extra.length ? `; EXTRA ${extra.slice(0, 5).map(short)}` : ""}`);
  for (const s of special.slice(0, 8)) console.log(`       read differently, same SOL through the vault: ${s}`);
  check(`${label}: same order (slot, then place in the block), none twice`, same(order, mineOrder) && !twice && mine.every((t, i) => !i || t.slot >= mine[i - 1].slot));
  return { special };
}

// The order inside a slot against the block itself, and the block's hash, for the slots with most trades.
async function blocksAgree(label, mine, most = 10) {
  const bySlot = new Map();
  for (const t of mine) (bySlot.get(t.slot) ?? bySlot.set(t.slot, []).get(t.slot)).push(t);
  const crowded = [...bySlot].filter(([, list]) => new Set(list.map((t) => t.signature)).size > 1).sort((a, b) => b[1].length - a[1].length).slice(0, most);
  const lone = [...bySlot].filter(([, list]) => list.length === 1).filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 6)) === 0).slice(0, 6);
  let good = 0, biggest = 0;
  const bad = [];
  for (const [slot, list] of [...crowded, ...lone]) {
    const block = await ask("getBlock", [slot, { commitment: "confirmed", transactionDetails: "signatures", rewards: false, maxSupportedTransactionVersion: 1 }]);
    const places = list.map((t) => block.signatures.indexOf(t.signature));
    const ok = places.every((p, i) => p >= 0 && (!i || p >= places[i - 1])) && list.every((t) => t.blockhash === block.blockhash) && list.every((t) => t.time === block.blockTime * 1000);
    ok ? good++ : bad.push(slot);
    biggest = Math.max(biggest, list.length);
  }
  check(`${label}: order inside a slot is the block's own, and the hash is the block's`, !bad.length && good > 0, `${crowded.length} slots with several trades (up to ${biggest} in one) and ${lone.length} with one, each against getBlock with signatures${bad.length ? `; BAD ${bad}` : ""}`);
}

const tokenAccount = async (address) => (await ask("getAccountInfo", [address, { commitment: "confirmed", encoding: "jsonParsed" }])).value?.data?.parsed?.info ?? null;
const venueOf = (where, name) => (name === "curve" ? { ...where.curve } : { ...where.pool });

console.log(`node: ${ownNode ? "the project's own (address not shown), chain.js at its own pace" : `public mainnet, ${pace.perSecond} calls a second at most`}\n`);
const began = Date.now();

// --------------------------------------------------------------------------------------------- locate
if (run("locate")) {
  const chain = fresh();
  const a = await chain.locate(A.mint), first = chain.stats.calls;
  check("locate, token on its curve: live, not graduated, the right curve", a.live && !a.graduated && a.pool === null && a.curve.pool === A.curve, JSON.stringify(a.curve));
  const av = [await tokenAccount(a.curve.tokenVault), await tokenAccount(a.curve.solVault)];
  check("its vaults hold the token and wrapped SOL", av[0]?.mint === A.mint && av[1]?.mint === WSOL && av[0].owner === av[1].owner);
  await chain.locate(A.mint);
  console.log(`       calls: ${first} the first time (mint, getProgramAccounts, curve), ${chain.stats.calls - first} each time after`);

  const before = chain.stats.calls;
  const b = await chain.locate(B.mint), cost = chain.stats.calls - before;
  check("locate, graduated token: graduated, and the pool is the DAMM v2 pool", b.live && b.graduated && b.pool?.address === B.pool, JSON.stringify(b.pool));
  const bv = [await tokenAccount(b.pool.tokenVault), await tokenAccount(b.pool.solVault)];
  check("the pool's vaults hold the token and wrapped SOL, under the DAMM v2 authority", bv[0]?.mint === B.mint && bv[1]?.mint === WSOL && bv[0].owner === "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC" && bv[1].owner === bv[0].owner);
  const mid = chain.stats.calls;
  await chain.locate(B.mint);
  console.log(`       calls: ${cost} the first time, ${chain.stats.calls - mid} after (a graduated token never changes again)`);

  const m = await chain.locate(MONKEY), one = chain.stats.calls;
  await chain.locate(MONKEY);
  check("locate, $MONKEY today: not live", same(m, { live: false }), `${chain.stats.calls - one} call each time it is asked`);
  check("locate, a mint that is no DBC token (USDC): not live", same(await chain.locate("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), { live: false }));
  check("tradesSince on a token that is not live: nothing", same((await chain.tradesSince(m, null)).trades, []));
}

// -------------------------------------------------------------------- the small curve, start to end
if (run("small")) {
  const where = await fresh().locate(A.mint);
  const entries = await signaturesOf(A.curve);
  const mine = await read(fresh(), where, null);
  console.log(`\ncurve ${short(A.mint)}: ${entries.length} signatures`);
  compare("small curve", mine.trades, await opinion(entries, venueOf(where, "curve")));
  await blocksAgree("small curve", mine.trades);
  const again = await read(fresh(), where, null), pieces = await read(fresh(), where, null, { limit: 2 });
  check("small curve: the same list twice, and two at a time with the cursor", same(again.trades, mine.trades) && same(pieces.trades, mine.trades) && same(pieces.cursor, mine.cursor), `${pieces.calls} calls`);
}

// ------------------------------------------------- the first buy inside the creating transaction
if (run("first")) {
  for (const T of [F, G]) {
    const chain = fresh(), where = await chain.locate(T.mint);
    const got = await chain.tradesSince(where, null, { limit: 5 }), t = got.trades[0];
    const tx = await transaction(T.creating), bal = byBalances(tx, venueOf(where, "curve"));
    console.log(`\ntoken ${short(T.mint)}: created with a first buy; balances of the creating transaction: token vault ${bal.token > 0n ? "+" : ""}${bal.token}, SOL vault +${Number(bal.sol) / 1e9} (both up: by balances alone, not a trade)`);
    const pre = tx.meta.preTokenBalances.length;
    check("the creating transaction has no balances before, and its buy is trade number one", pre === 0 && bal.side === null && t?.signature === T.creating && t.side === "buy" && t.sol === T.sol && t.wallet === T.buyer && t.slot === tx.slot && t.sol === Number(bal.sol) / 1e9,
      `${t?.side} ${t?.sol} SOL by ${short(t?.wallet ?? "")} in slot ${t?.slot}`);
    const block = await ask("getBlock", [t.slot, { commitment: "confirmed", transactionDetails: "none", rewards: false, maxSupportedTransactionVersion: 1 }]);
    check("its blockhash is the hash of the block it landed in, not the one it carried", t.blockhash === block.blockhash && t.blockhash !== tx.transaction.message.recentBlockhash && t.blockhash === (await chain.blockhashOf(t.slot)));
  }
  // The second one graduated within a minute: its whole life, curve then pool, against the second opinion.
  const where = await fresh().locate(G.mint), tip = await ask("getSlot", [{ commitment: "confirmed" }]), upTo = tip - 60;
  const curve = (await signaturesOf(where.curve.pool)).filter((e) => e.slot <= upTo), pool = (await signaturesOf(where.pool.address)).filter((e) => e.slot <= upTo);
  const mine = await read(fresh(), where, null, { upTo });
  const moved = mine.trades.findIndex((t, i) => i && mine.cursor.from && t.slot >= mine.cursor.from && pool.some((e) => e.signature === t.signature));
  console.log(`\ntoken ${short(G.mint)}, whole life: ${curve.length} signatures on the curve, ${pool.length} on the pool; migration in slot ${mine.cursor.from}`);
  check("its cursor crossed to the pool the chain shows", mine.cursor.venue === "pool" && mine.cursor.pool.address === where.pool.address && same(mine.cursor.pool, where.pool));
  compare("whole life, curve part", mine.trades.slice(0, moved < 0 ? mine.trades.length : moved), await opinion(curve, venueOf(where, "curve")));
  compare("whole life, pool part", moved < 0 ? [] : mine.trades.slice(moved), await opinion(pool, venueOf(where, "pool")));
  await blocksAgree("whole life", mine.trades);
  const stale = { live: true, curve: where.curve, graduated: false, pool: null };
  const blind = await read(fresh(), stale, null, { upTo, limit: 3 });
  check("the same list, three at a time, from a `where` taken before it graduated", same(blind.trades, mine.trades), `${blind.calls} calls`);
}

// ----------------------------------------------------- the graduated token's curve, start to end
const DOOR = { migration: 438907613, lastCurveTrade: 438907472 }; // where the curve of B ends: checked by `curve`, used by `cross`
if (run("curve")) {
  const where = await fresh().locate(B.mint), chain = fresh();
  const entries = await signaturesOf(where.curve.pool);
  const t0 = Date.now(), callsBefore = chain.stats.calls;
  let cursor = null, trades = [], calls = 0;
  for (;;) { // until the cursor leaves the curve
    const got = await chain.tradesSince(where, cursor, { limit: 200 });
    calls++;
    if (got.cursor.venue === "pool") { // the call may already have gone on into the pool: keep the curve's part, and the cursor as it stood at the door
      trades.push(...got.trades.filter((t) => t.slot <= got.cursor.from && entries.some((e) => e.signature === t.signature)));
      cursor = { v: 1, venue: "pool", slot: 0, anchor: null, part: null, rungs: [], pool: got.cursor.pool, from: got.cursor.from };
      break;
    }
    trades.push(...got.trades); cursor = got.cursor;
    if (!got.more) break;
  }
  console.log(`\ncurve of ${short(B.mint)}: ${entries.length} signatures (${entries.filter((e) => e.err).length} failed), ${trades.length} trades read in ${calls} calls of tradesSince, ${chain.stats.calls - callsBefore} RPC calls, ${Math.round((Date.now() - t0) / 100) / 10} s`);
  {
    const second = await opinion(entries, venueOf(where, "curve"));
    compare("graduated token's curve", trades, second);
    await blocksAgree("graduated token's curve", trades);
    const migration = second.find((o) => o.token < 0n && o.sol < 0n && o.token < -(10n ** 15n));
    check("the curve ends at its migration: cursor on the pool, taken from the chain", cursor.venue === "pool" && cursor.from === migration?.slot && cursor.from === DOOR.migration && trades.at(-1).slot === DOOR.lastCurveTrade && cursor.pool.address === B.pool && same(cursor.pool, where.pool), `migration in slot ${cursor.from}; last curve trade in slot ${trades.at(-1).slot}`);
    const twice = await read(fresh(), where, null, { most: 120 }), halves = await read(fresh(), where, null, { most: 120, limit: 60 }), bits = await read(fresh(), where, null, { most: 120, limit: 13 });
    const first = trades.slice(0, twice.trades.length);
    check("first 120 curve trades: the same list twice, in two halves, and thirteen at a time", first.length > 90 && same(twice.trades, first) && same(halves.trades, first) && same(bits.trades, first), `${first.length} trades; ${halves.calls} and ${bits.calls} calls`);
  }
}

// ------------------------------------------------------------------- the crossing into the pool
if (run("cross")) {
  const where = await fresh().locate(B.mint);
  const cursor = { v: 1, venue: "pool", slot: 0, anchor: null, part: null, rungs: [], pool: where.pool, from: DOOR.migration }; // as the curve leaves it
  // chain.js has to find the pool's oldest signatures by itself: the node lists newest first, so it walks down
  // the whole history once, leaving a rung at every page, then reads upwards from the bottom.
  // That walk is some 2,400 listing calls for this pool (twenty minutes): the ladder it leaves is kept in the
  // temp folder, and a later run starts from it, as a keeper would from its store. `again` walks afresh.
  const kept = join(tmpdir(), `monkey-chain-ladder-${B.pool.slice(0, 8)}.json`);
  const stored = !wanted.includes("again") && existsSync(kept) ? JSON.parse(readFileSync(kept, "utf8")) : null;
  const chain = fresh({ pages: 90 }), t0 = Date.now();
  let cur = stored ?? JSON.parse(JSON.stringify(cursor)), ladder = cur, trades = [], calls = 0, deepest = 0, biggest = 0;
  while (trades.length < 200 && calls < 400) {
    const got = await chain.tradesSince(where, cur, { limit: 100 });
    calls++;
    deepest = Math.max(deepest, got.cursor.rungs.length);
    biggest = Math.max(biggest, JSON.stringify(got.cursor).length);
    cur = JSON.parse(JSON.stringify(got.cursor));
    if (!trades.length && !got.trades.length) ladder = cur; // the ladder, just before the first trade is read
    trades.push(...got.trades);
    if (!got.more) break;
  }
  writeFileSync(kept, JSON.stringify(ladder));
  console.log(`\npool of ${short(B.mint)} from its first signature${stored ? " (from a ladder kept by an earlier run)" : ""}: ${deepest} rungs at the deepest (one for each thousand signatures above), cursor ${Math.round(biggest / 1024)} KB at its largest; ${calls} calls of tradesSince, ${chain.stats.methods.getSignaturesForAddress} listing calls, ${Math.round((Date.now() - t0) / 1000)} s`);
  const through = trades.at(-1).slot - 1, mine = trades.filter((t) => t.slot <= through);
  // The second opinion asks the node itself for everything below the last trade chain.js gave: the bottom of the history.
  const old = (await signaturesOf(B.pool, { before: trades.at(-1).signature })).filter((e) => e.slot <= through);
  console.log(`       second opinion: ${old.length} signatures from the pool's first (slot ${old[0].slot}) to slot ${through}`);
  check("the pool's first signature is the curve's migration, and its first trade comes after the curve's last", old[0].slot === DOOR.migration && mine[0].slot >= DOOR.migration && mine[0].slot > DOOR.lastCurveTrade,
    `last curve trade in slot ${DOOR.lastCurveTrade}, migration ${DOOR.migration}, first pool trade ${mine[0].slot}`);
  compare("crossing, the pool's first trades", mine, await opinion(old, venueOf(where, "pool")));
  await blocksAgree("crossing, the pool's first trades", mine);
  const cold = await read(fresh({ pages: 3 }), where, ladder, { most: 70, limit: 17 });
  check("from the stored ladder on a cold start, seventeen at a time: the same list", cold.trades.length > 40 && same(cold.trades, mine.slice(0, cold.trades.length)), `${cold.trades.length} trades in ${cold.calls} calls`);
}

// A cursor placed by hand on a recent signature of the pool: everything in later slots is still to come.
async function recentStretch(back) {
  const where = await fresh().locate(B.mint), tip = await ask("getSlot", [{ commitment: "confirmed" }]);
  const newest = await signaturesOf(B.pool, { most: Math.ceil(back / 1000) * 1000 });
  const startAt = newest[Math.max(0, newest.length - back)];
  const cursor = { v: 1, venue: "pool", slot: startAt.slot, anchor: startAt.signature, part: null, rungs: [] };
  return { where, cursor, upTo: tip - 80, entries: newest.filter((e) => e.slot > startAt.slot && e.slot <= tip - 80) };
}

// -------------------------------------------------------------- recent pool trades, on their own
if (run("recent")) {
  const { where, cursor, upTo, entries } = await recentStretch(1400);
  const mine = await read(fresh(), where, cursor, { most: 350, upTo });
  const stretch = entries.filter((e) => e.slot <= mine.through);
  console.log(`\npool of ${short(B.mint)}, recent: ${stretch.length} signatures (${stretch.filter((e) => e.err).length} failed) in slots ${cursor.slot + 1} to ${mine.through}`);
  compare("recent pool trades", mine.trades, await opinion(stretch, venueOf(where, "pool")));
  await blocksAgree("recent pool trades", mine.trades);
  const n = Math.min(100, mine.trades.length);
  const twice = await read(fresh(), where, cursor, { most: n }), halves = await read(fresh(), where, cursor, { most: n, limit: Math.ceil(n / 2) }), bits = await read(fresh(), where, cursor, { most: n, limit: 11 });
  const first = mine.trades.slice(0, twice.trades.length);
  check("recent pool trades: the same list twice, in two halves, and eleven at a time", first.length > 70 && same(twice.trades, first) && same(halves.trades, first) && same(bits.trades, first), `${first.length} trades; ${halves.calls} and ${bits.calls} calls`);
}

// ------------------------------------------------------------------------------ living at the tip
if (run("tip")) {
  // A token trading right now, read once a second as the keeper would: the curve that shows up most in the
  // DBC program's latest swaps (the base mint is the eighth account of its swap), or else a test token.
  const DBC = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN", seen = new Map();
  for (const e of (await ask("getSignaturesForAddress", [DBC, { commitment: "confirmed", limit: 200 }])).filter((x) => !x.err).slice(0, 40)) {
    const tx = await transaction(e.signature);
    for (const ix of [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions ?? []).flatMap((g) => g.instructions)]) {
      if (ix.programId === DBC && ix.accounts?.length >= 15) seen.set(ix.accounts[7], (seen.get(ix.accounts[7]) ?? 0) + 1);
    }
  }
  const hot = [...seen].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([mint]) => mint);
  const tip = await ask("getSlot", [{ commitment: "confirmed" }]), spots = [];
  for (const mint of [...hot, F.mint, G.mint, B.mint]) {
    const there = await fresh().locate(mint);
    if (!there.live || (there.graduated && !there.pool)) continue;
    const where = there, venue = where.graduated ? "pool" : "curve", address = where.graduated ? where.pool.address : where.curve.pool;
    const page = await ask("getSignaturesForAddress", [address, { commitment: "confirmed", limit: 200 }]);
    spots.push({ mint, where, venue, address, page, busy: page.filter((e) => e.slot > tip - 750 && !e.err).length });
  }
  const spot = spots.sort((a, b) => b.busy - a.busy)[0];
  const fresher = await ask("getSignaturesForAddress", [spot.address, { commitment: "confirmed", limit: 50 }]), now = await ask("getSlot", [{ commitment: "confirmed" }]);
  const startAt = fresher.find((e) => e.slot < now - 3) ?? fresher.at(-1); // start a second or two behind the tip
  let cursor = { v: 1, venue: spot.venue, slot: startAt.slot, anchor: startAt.signature, part: null, rungs: [] };
  const chain = fresh(), trades = [], waits = [], until = Date.now() + 45000, callsBefore = chain.stats.calls;
  let polls = 0, longest = 0;
  while (Date.now() < until) {
    const t = Date.now(), got = await chain.tradesSince(spot.where, cursor, { limit: 200, deadline: Date.now() + 2500 });
    polls++;
    longest = Math.max(longest, Date.now() - t);
    for (const tr of got.trades) waits.push((Date.now() - tr.time) / 1000);
    trades.push(...got.trades); cursor = got.cursor;
    await new Promise((done) => setTimeout(done, Math.max(0, 1000 - (Date.now() - t))));
  }
  const spent = chain.stats.calls - callsBefore;
  await new Promise((done) => setTimeout(done, 4000));
  const entries = (await signaturesOf(spot.address, { until: startAt.signature })).filter((e) => e.slot > startAt.slot && e.slot <= cursor.slot);
  console.log(`\nat the tip, token ${short(spot.mint)} on its ${spot.venue} (${spot.busy} successful transactions in the last five minutes): ${polls} looks in 45 s (the longest ${(longest / 1000).toFixed(1)} s), ${trades.length} trades, ${spent} RPC calls, the node said "too fast" ${chain.stats.busy} times`);
  if (waits.length) console.log(`       a trade was given out ${Math.min(...waits).toFixed(1)} to ${Math.max(...waits).toFixed(1)} s after its block's time (median ${waits.sort((a, b) => a - b)[waits.length >> 1].toFixed(1)} s), looking once a second with 2.5 s allowed each time`);
  compare("at the tip", trades, await opinion(entries, venueOf(spot.where, spot.venue)));
  if (trades.length) await blocksAgree("at the tip", trades, 5);
}

// ------------------------------------------------------------------- what a burst of trades costs
if (run("cost")) {
  const snap = (chain) => JSON.parse(JSON.stringify(chain.stats));
  const show = (label, chain, before, ms, n) => {
    const methods = Object.fromEntries(Object.entries(chain.stats.methods).map(([k, v]) => [k, v - (before.methods[k] ?? 0)]).filter(([, v]) => v));
    console.log(`       ${label}: ${n} trades, ${chain.stats.calls - before.calls} RPC calls in ${chain.stats.requests - before.requests} requests, ${(ms / 1000).toFixed(1)} s  ${JSON.stringify(methods)}`);
  };
  console.log("\nwhat one call of tradesSince costs, on a chain object with nothing in memory:");
  { // a launch: the first 100 trades of a curve, many to a slot
    const where = await fresh().locate(B.mint), chain = fresh(), before = snap(chain), t = Date.now();
    const got = await chain.tradesSince(where, null, { limit: 100 });
    show(`the first 100 trades of a curve (${new Set(got.trades.map((x) => x.slot)).size} slots)`, chain, before, Date.now() - t, got.trades.length);
    check("cost: 100 trades came", got.trades.length === 100);
  }
  { // a busy pool later on: 100 trades among failed transactions and bots
    const { where, cursor } = await recentStretch(700), chain = fresh(), before = snap(chain), t = Date.now();
    const got = await chain.tradesSince(where, cursor, { limit: 100 });
    show(`100 trades of a pool in its second month (${new Set(got.trades.map((x) => x.slot)).size} slots)`, chain, before, Date.now() - t, got.trades.length);
  }
  { // the keeper's way: 200 asked for, two and a half seconds allowed, again and again from a curve's first trade
    const where = await fresh().locate(B.mint), chain = fresh(), before = snap(chain), t = Date.now(), sizes = [], times = [];
    let cursor = null;
    for (let i = 0; i < 6; i++) {
      const t1 = Date.now(), got = await chain.tradesSince(where, cursor, { limit: 200, deadline: Date.now() + 2500 });
      sizes.push(got.trades.length); times.push(((Date.now() - t1) / 1000).toFixed(1)); cursor = got.cursor;
    }
    const n = sizes.reduce((a, b) => a + b, 0), secs = (Date.now() - t) / 1000;
    show(`six calls with a deadline 2.5 s away (trades ${sizes.join(", ")}; seconds ${times.join(", ")})`, chain, before, Date.now() - t, n);
    console.log(`       that is ${(n / secs).toFixed(1)} trades a second while catching up; the node said "too fast" ${chain.stats.busy} times`);
    check("cost: every call with a deadline came back within four seconds, with trades", times.every((x) => Number(x) < 4) && sizes.every((x) => x > 0));
  }
  { // a quiet look: a cursor at the newest signature there is
    const { where, cursor } = await recentStretch(1), chain = fresh();
    const first = await chain.tradesSince(where, cursor, { limit: 200 });
    const idle = snap(chain), t2 = Date.now(), got = await chain.tradesSince(where, first.cursor, { limit: 200 });
    show("a look with nothing new", chain, idle, Date.now() - t2, got.trades.length);
  }
}

console.log(`\n${failures() ? `${failures()} check(s) FAILED` : "all checks passed"}; ${Math.round((Date.now() - began) / 1000)} s; ${direct.calls} calls for the second opinion`);
process.exit(failures() ? 1 : 0);

