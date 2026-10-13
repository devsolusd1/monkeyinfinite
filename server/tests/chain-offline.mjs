// chain.js without the network: the addresses it derives, how it reads one transaction, and a made-up
// node with a made-up history (a curve that graduates into a pool) read in every awkward way: small pages,
// small limits, a cursor handed on after every call, a busy node, a node that says less.
// Usage: node server/tests/chain-offline.mjs

import { randomBytes, createHash } from "node:crypto";
import { base58, unbase58, createChain, dammV2PoolAddress, vaultAddress, swapsOf, DBC_PROGRAM, DAMM_V2_PROGRAM, GRADUATION_CONFIGS } from "../chain.js";
import { check, failures } from "./chain-node.mjs";

const WSOL = "So11111111111111111111111111111111111111112";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// ------------------------------------------------------------------ addresses, against the real chain

{
  const bytes = randomBytes(32);
  check("base58 there and back", Buffer.compare(unbase58(base58(bytes)), bytes) === 0 && base58(unbase58(WSOL)) === WSOL && unbase58("11111111111111111111111111111111").length === 32);
  // Real accounts on mainnet (read from the chain by chain-live.mjs): the vaults of two curves, and the pool one of them graduated into.
  const B = "GJaxyLPuZh5U2U4LgAVdGGC6KYRVXZp8t91P2vzaCHAM", curveB = "BQSgHPhmuePHhyGSsmuGPqgBVVYNo6iqepgRLk32ZkvY", poolB = "DrrzhfxDQd6L6iPAyKwNUSkixTTtGn9w3EgBPxUUpYHz";
  check("curve vaults derive as on chain",
    vaultAddress(DBC_PROGRAM, curveB, B) === "41SpGULvbY1gzqDa7Zr3FR34tZ3ARwBJV8f4qr3bSPyM" && vaultAddress(DBC_PROGRAM, curveB, WSOL) === "7hY1fXh5aHMjoezZTAXcRKMuxexC4PuBkejPoPCtZvmu" &&
    vaultAddress(DBC_PROGRAM, "2APyyQekX5BiDbsRKDJGDGb8yg37y2fDcD6cFmTb3Fh9", "pH8X2DBCpgHAvhh96oGyZkafbvdUmsW843BCXFzLURE") === "7tpVyhYCwc5t5PgxxJfTKwUZTnKCiHVnA7xnZMQhStvJ");
  const derived = GRADUATION_CONFIGS.map((c) => dammV2PoolAddress(c, B, WSOL));
  check("the graduated pool is one of the seven derived", derived.indexOf(poolB) === 3 && dammV2PoolAddress(GRADUATION_CONFIGS[3], WSOL, B) === poolB, `config ${derived.indexOf(poolB)}`);
  check("pool vaults derive as on chain", vaultAddress(DAMM_V2_PROGRAM, poolB, B) === "ErFT9BzAzxwSuL3zDvY7ggV4we3ut5q3ggbdaUkneJb3" && vaultAddress(DAMM_V2_PROGRAM, poolB, WSOL) === "9U8i82LEBkMU6t5RjnV7i6FYjsNr5Ejkqx3sgzyNTzgt");
}

// ------------------------------------------------------------------------------- a made-up history

const key = () => base58(randomBytes(32));
const MIGRATION = [156, 169, 230, 103, 53, 228, 80, 64], SWAP = [248, 198, 158, 145, 225, 117, 135, 200];
const data = (tag) => base58(Uint8Array.from([...tag, 1, 2, 3, 4]));

function world(seed = 1) {
  let s = seed;
  const rnd = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
  const mint = key(), config = key(), curve = { pool: key(), tokenVault: key(), solVault: key(), config };
  const pool = { address: dammV2PoolAddress(GRADUATION_CONFIGS[rnd(7)], mint, WSOL), tokenVault: key(), solVault: key() };
  const accounts = new Map(), txs = new Map(), blocks = new Map(), byAddress = new Map(), truth = [];
  const account = (owner, size, fill) => { const d = Buffer.alloc(size); fill(d); return { owner, data: [d.toString("base64"), "base64"] }; };
  const put = (d, at, address) => Buffer.from(unbase58(address)).copy(d, at);
  const curveAccount = (migrated) => account(DBC_PROGRAM, 424, (d) => {
    Buffer.from([213, 224, 5, 209, 98, 69, 119, 92]).copy(d); put(d, 72, config); put(d, 136, mint); put(d, 168, curve.tokenVault); put(d, 200, curve.solVault); d[305] = migrated ? 1 : 0;
  });
  accounts.set(config, account(DBC_PROGRAM, 1048, (d) => put(d, 8, WSOL)));

  const transfer = (source, destination, amount, depth, checked = true) => ({
    program: "spl-token", programId: TOKEN, stackHeight: depth,
    parsed: checked ? { type: "transferChecked", info: { source, destination, mint: "x", tokenAmount: { amount: String(amount) } } } : { type: "transfer", info: { source, destination, amount: String(amount) } },
  });
  const call = (programId, accounts, tag, depth) => ({ programId, accounts, data: data(tag), stackHeight: depth });
  const legs = (venue, side, lamports, depth, user = key()) => {
    const tokens = 1000 + rnd(1e6), referral = rnd(3) ? [] : [transfer(venue.solVault, key(), Math.floor(lamports / 50), depth)];
    return side === "buy"
      ? [transfer(user, venue.solVault, lamports + (referral.length ? Math.floor(lamports / 50) : 0), depth), transfer(venue.tokenVault, user, tokens, depth, !!rnd(2)), ...referral]
      : [transfer(user, venue.tokenVault, tokens, depth), transfer(venue.solVault, user, lamports - (referral.length ? Math.floor(lamports / 50) : 0), depth), ...referral];
  };

  // A transaction of one kind, as the node would show it, and the trades it should give.
  function make(kind, venue, program, address) {
    const wallet = key(), top = [], inner = [], swaps = [];
    const swapCall = (depth) => call(program, [address, venue.tokenVault, venue.solVault], SWAP, depth);
    const one = (side) => { const lamports = 1e6 + rnd(5e9); swaps.push({ side, sol: lamports / 1e9 }); return lamports; };
    const side = () => (rnd(2) ? "buy" : "sell");
    if (kind === "swap") { const sd = side(); top.push(swapCall(1)); inner.push({ index: 0, instructions: legs(venue, sd, one(sd), 2) }); }
    if (kind === "routed") { // through a router, with another program's transfers around it
      const sd = side();
      top.push({ programId: "ComputeBudget111111111111111111111111111111", accounts: [], data: "3" }, call(key(), [address], [9, 9, 9, 9, 9, 9, 9, 9], 1));
      inner.push({ index: 1, instructions: [transfer(key(), key(), 5, 2), swapCall(2), ...legs(venue, sd, one(sd), 3), call(program, [key()], [1, 1, 1, 1, 1, 1, 1, 1], 3), transfer(key(), key(), 7, 2)] });
    }
    if (kind === "create") { // the pool is made, the supply minted into its vault, and the first buy follows
      top.push(call(program, [address, venue.tokenVault, venue.solVault], [140, 85, 215, 176, 102, 54, 104, 79], 1), swapCall(1));
      inner.push({ index: 0, instructions: [{ program: "spl-token", programId: TOKEN, stackHeight: 2, parsed: { type: "mintTo", info: { account: venue.tokenVault, amount: "1000000000000000" } } }] });
      inner.push({ index: 1, instructions: legs(venue, "buy", one("buy"), 2) });
    }
    if (kind === "double") { // a buy and a sell in one transaction, the second through a router
      top.push(swapCall(1), call(key(), [address], [9, 9, 9, 9, 9, 9, 9, 9], 1));
      inner.push({ index: 0, instructions: legs(venue, "buy", one("buy"), 2) }, { index: 1, instructions: [swapCall(2), ...legs(venue, "sell", one("sell"), 3)] });
    }
    if (kind === "claim") { top.push(swapCall(1)); inner.push({ index: 0, instructions: [transfer(venue.solVault, key(), 12345, 2)] }); }
    if (kind === "liquidity") { top.push(swapCall(1)); inner.push({ index: 0, instructions: [transfer(key(), venue.tokenVault, 500, 2), transfer(key(), venue.solVault, 700, 2)] }); }
    if (kind === "gift") { top.push({ program: "spl-token", programId: TOKEN, parsed: { type: "transfer", info: { source: key(), destination: venue.tokenVault, amount: "5" } } }, call(key(), [address], [3, 3, 3, 3, 3, 3, 3, 3], 1)); }
    if (kind === "spam") top.push(call(key(), [address], [7, 7, 7, 7, 7, 7, 7, 7], 1));
    if (kind === "failed") { top.push(swapCall(1)); }
    if (kind === "migration") {
      top.push(call(DBC_PROGRAM, [curve.pool, key(), config, key(), pool.address, pool.tokenVault, pool.solVault, curve.tokenVault, curve.solVault], MIGRATION, 1));
      inner.push({ index: 0, instructions: [call(DAMM_V2_PROGRAM, [pool.address], [95, 180, 10, 172, 84, 174, 232, 40], 2), transfer(curve.tokenVault, pool.tokenVault, 999, 3), transfer(curve.solVault, pool.solVault, 888, 3)] });
    }
    return { wallet, swaps: kind === "failed" ? [] : swaps, err: kind === "failed" ? { InstructionError: [0, "Custom"] } : null, message: { accountKeys: [{ pubkey: wallet }, { pubkey: address }], instructions: top }, inner };
  }

  let slot = 1000, tip = 0;
  function block(entries) { // entries: [kind, venueName]; they land in this order in one block, among strangers
    slot += 1 + rnd(3);
    const hash = base58(createHash("sha256").update(`block ${seed} ${slot}`).digest()), signatures = [];
    const strangers = () => { for (let i = rnd(4); i > 0; i--) signatures.push(base58(randomBytes(64))); };
    for (const [kind, where] of entries) {
      strangers();
      const venue = where === "curve" ? curve : pool, address = where === "curve" ? curve.pool : pool.address;
      const made = make(kind, venue, where === "curve" ? DBC_PROGRAM : DAMM_V2_PROGRAM, address);
      const signature = base58(randomBytes(64)), time = 1700000000 + slot;
      const tx = { slot, blockTime: time, transactionIndex: signatures.length, meta: { err: made.err, innerInstructions: made.inner, preTokenBalances: [], postTokenBalances: [] }, transaction: { signatures: [signature], message: made.message } };
      signatures.push(signature);
      txs.set(signature, tx);
      for (const a of kind === "migration" ? [curve.pool, pool.address] : [address]) (byAddress.get(a) ?? byAddress.set(a, []).get(a)).push({ signature, slot, err: made.err, blockTime: time });
      made.swaps.forEach((sw, k) => truth.push({ signature, blockhash: hash, slot, wallet: made.wallet, side: sw.side, sol: sw.sol, time: time * 1000, ...(made.swaps.length > 1 && { swap: k + 1 }) }));
      if (kind === "migration") { accounts.set(curve.pool, curveAccount(true)); accounts.set(pool.address, account(DAMM_V2_PROGRAM, 1112, (d) => { Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]).copy(d); put(d, 168, mint); put(d, 200, WSOL); put(d, 232, pool.tokenVault); put(d, 264, pool.solVault); })); }
    }
    strangers();
    blocks.set(slot, { blockhash: hash, blockTime: 1700000000 + slot, signatures });
    tip = slot;
  }

  // The node. Options change how it behaves: no transaction index, no batches, busy now and then, slow to learn signatures.
  const node = { index: true, batches: true, busyEvery: 0, forgetful: false, shuffled: false, calls: 0, notYet: 0 };
  function answer({ method, params }) {
    node.calls++;
    const [a, b = {}] = params ?? [];
    if (method === "getSlot") return { result: tip };
    if (method === "getMultipleAccounts") return { result: { value: a.map((address) => accounts.get(address) ?? null) } };
    if (method === "getProgramAccounts") {
      const hit = [...accounts].filter(([, acc]) => acc.owner === a && b.filters.every((f) => Buffer.from(acc.data[0], "base64").subarray(f.memcmp.offset, f.memcmp.offset + unbase58(f.memcmp.bytes).length).equals(Buffer.from(unbase58(f.memcmp.bytes)))));
      return { result: hit.map(([pubkey, acc]) => ({ pubkey, account: acc })) };
    }
    if (method === "getSignaturesForAddress") {
      const all = [...(byAddress.get(a) ?? [])].reverse(); // newest first; inside a slot, last in the block first
      if (node.shuffled) all.sort((x, y) => y.slot - x.slot || (x.signature < y.signature ? -1 : 1)); // or in an order of its own
      let from = 0, to = all.length;
      if (b.before) { const i = all.findIndex((e) => e.signature === b.before); from = i < 0 ? 0 : i + 1; }
      if (b.until && !node.forgetful) { const i = all.findIndex((e) => e.signature === b.until); if (i >= 0) to = i; }
      return { result: all.slice(from, Math.min(to, from + (b.limit ?? 1000))) };
    }
    if (method === "getTransaction") {
      if (node.notYet > 0 && node.notYet--) return { result: null };
      const tx = txs.get(a);
      if (!tx) return { result: null };
      if (b.encoding !== "jsonParsed" || !(b.maxSupportedTransactionVersion >= 1)) return { error: { code: -32015, message: 'Transaction version (1) is not supported by the requesting client. Please try the request again with the following configuration parameter: "maxSupportedTransactionVersion": 1' } };
      return { result: node.index ? tx : { ...tx, transactionIndex: undefined } };
    }
    if (method === "getBlock") {
      const blk = blocks.get(a);
      if (!blk) return { error: { code: -32009, message: "Slot was skipped" } };
      if (b.transactionDetails === "full" || b.transactionDetails === undefined) throw new Error("a whole block was asked for");
      return { result: { blockhash: blk.blockhash, blockTime: blk.blockTime, ...(b.transactionDetails === "signatures" && { signatures: blk.signatures }) } };
    }
    return { error: { code: -32601, message: "Method not found" } };
  }
  let requests = 0;
  async function fetch(url, init) {
    requests++;
    const reply = (status, body) => ({ status, ok: status < 400, headers: { get: () => "0" }, json: async () => body });
    if (node.busyEvery && requests % node.busyEvery === 0) return reply(429, null);
    const body = JSON.parse(init.body);
    if (Array.isArray(body)) return node.batches ? reply(200, body.map((c) => ({ id: c.id, jsonrpc: "2.0", ...answer(c) })).reverse()) : reply(403, { error: { code: -32403, message: "no batches at https://secret.example/key" } });
    return reply(200, { id: body.id, jsonrpc: "2.0", ...answer(body) });
  }

  return { mint, curve, pool, accounts, curveAccount, block, truth, node, fetch, rnd, setTip: (t) => (tip = t), get tip() { return tip; }, get slot() { return slot; } };
}

// A curve born with a first buy, traded, graduated, then a pool traded: about `size` blocks on each side.
function story(seed, size) {
  const w = world(seed), kinds = ["swap", "swap", "swap", "routed", "double", "claim", "liquidity", "gift", "spam", "failed", "failed"];
  const some = (where) => Array.from({ length: 1 + (w.rnd(5) ? w.rnd(2) : w.rnd(9)) }, () => [kinds[w.rnd(kinds.length)], where]);
  w.accounts.set(w.mint, { owner: TOKEN, data: ["", "base64"] });
  w.accounts.set(w.curve.pool, w.curveAccount(false));
  w.block([["create", "curve"], ["swap", "curve"]]);
  for (let i = 0; i < size; i++) w.block(some("curve"));
  w.block([["swap", "curve"], ["migration", "curve"], ["swap", "pool"], ["double", "pool"]]); // the last curve trade, the move, and the pool's first trades, all in one block
  for (let i = 0; i < size; i++) w.block(some("pool"));
  w.block([["claim", "curve"], ["swap", "pool"]]); // the curve's address is still touched afterwards
  w.setTip(w.slot + 10);
  return w;
}

const quiet = { perSecond: 100000, batch: 10, patience: 4000 };
async function readAll(chain, where, limit, cursor = null, most = 100000) {
  const trades = [];
  let calls = 0, more = true;
  while (more && calls < most) {
    const got = await chain.tradesSince(where, cursor, { limit });
    if (got.trades.length > limit) throw new Error("more trades than the limit");
    trades.push(...got.trades);
    cursor = JSON.parse(JSON.stringify(got.cursor)); // as the keeper stores it
    more = got.more;
    calls++;
  }
  return { trades, cursor, calls };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --------------------------------------------------------------------- one transaction, read by hand

{
  const w = world(7);
  w.accounts.set(w.curve.pool, w.curveAccount(false));
  w.block([["create", "curve"], ["double", "curve"], ["liquidity", "curve"], ["claim", "curve"], ["gift", "curve"], ["failed", "curve"], ["migration", "curve"]]);
  const chain = createChain({ rpcUrl: "http://node.invalid/key", fetch: w.fetch, ...quiet, settle: 0 });
  const where = await chain.locate(w.mint).catch(() => null);
  check("a mint with no account is not live", where && where.live === false);
  const venue = { ...w.curve, program: DBC_PROGRAM };
  const got = await readAll(createChain({ rpcUrl: "http://node.invalid/key", fetch: w.fetch, ...quiet, settle: 0 }), { live: true, curve: w.curve, graduated: false, pool: null }, 50);
  check("creating transaction: its buy is the first trade", got.trades[0]?.side === "buy" && got.trades[0].signature === w.truth[0].signature && got.trades[0].sol === w.truth[0].sol);
  check("two swaps in one transaction: two trades, in the order they ran", got.trades[1]?.swap === 1 && got.trades[2]?.swap === 2 && got.trades[1].signature === got.trades[2].signature && got.trades[1].side === "buy" && got.trades[2].side === "sell");
  check("liquidity, a fee claim, a gift to the vault, a failed swap and the migration are not trades", got.trades.length === 3 && same(got.trades, w.truth));
  check("the migration moves the cursor to the pool it created", got.cursor.venue === "pool" && got.cursor.pool.address === w.pool.address && got.cursor.pool.tokenVault === w.pool.tokenVault && got.cursor.pool.solVault === w.pool.solVault);
  // The same transaction read from balances alone, as a node that does not give call depths would force.
  const flat = (tx) => ({ ...tx, meta: { ...tx.meta, innerInstructions: tx.meta.innerInstructions.map((g) => ({ ...g, instructions: g.instructions.map(({ stackHeight, ...ix }) => ix) })) } });
  const plain = { slot: 1, blockTime: 5, meta: { err: null, innerInstructions: [{ index: 0, instructions: [{ programId: TOKEN, parsed: { type: "transfer", info: { source: "u", destination: venue.solVault, amount: "70" } } }] }],
    preTokenBalances: [{ accountIndex: 1, uiTokenAmount: { amount: "1000" } }, { accountIndex: 2, uiTokenAmount: { amount: "10" } }], postTokenBalances: [{ accountIndex: 1, uiTokenAmount: { amount: "900" } }, { accountIndex: 2, uiTokenAmount: { amount: "80" } }] },
    transaction: { message: { accountKeys: ["payer", venue.tokenVault, venue.solVault], instructions: [{ programId: DBC_PROGRAM, accounts: [], data: "1" }] } } };
  const r = swapsOf(flat(plain), venue);
  check("without call depths, the balances decide", r.swaps.length === 1 && r.swaps[0].side === "buy" && r.swaps[0].lamports === 70n && r.wallet === "payer" && r.time === 5000);
}

// ------------------------------------------------------------ the whole story, read in awkward ways

for (const seed of [11, 12, 13]) {
  const w = story(seed, 60 + seed), make = (more = {}) => createChain({ rpcUrl: "http://node.invalid/key", fetch: w.fetch, ...quiet, ...more });
  const where = await make().locate(w.mint);
  check(`story ${seed}: located, graduated, pool found by derivation`, where.live && where.graduated && same(where.curve, w.curve) && same(where.pool, w.pool));
  const whole = await readAll(make(), where, 100000);
  check(`story ${seed}: every trade, in order, none twice`, same(whole.trades, w.truth), `${whole.trades.length} of ${w.truth.length} trades; ${new Set(w.truth.map((t) => t.slot)).size} slots; first is the creating buy: ${whole.trades[0]?.signature === w.truth[0].signature}`);
  check(`story ${seed}: order is slot, then place in the block`, whole.trades.every((t, i) => !i || t.slot >= whole.trades[i - 1].slot));
  const stale = { live: true, curve: w.curve, graduated: false, pool: null }; // a `where` from before the graduation
  for (const [name, options, limit, place] of [
    ["one trade a call", {}, 1, where], ["seven a call", {}, 7, where], ["pages of 5 signatures, 3 trades a call", { page: 5, pages: 3 }, 3, where],
    ["pages of 9, 2 listing calls a call", { page: 9, pages: 2 }, 200, where], ["a where from before the graduation", {}, 50, stale],
    ["a node without transaction indexes", { node: { index: false } }, 11, where], ["a node that takes no batches", { node: { batches: false } }, 40, where],
    ["a node busy one request in four", { node: { busyEvery: 4 }, patience: 60000 }, 60, where], ["a node that forgets where to stop", { node: { forgetful: true }, page: 30 }, 13, where],
    ["a node that lists each slot in an order of its own", { node: { shuffled: true }, page: 6 }, 4, where],
  ]) {
    Object.assign(w.node, { index: true, batches: true, busyEvery: 0, forgetful: false, shuffled: false }, options.node);
    const { node, ...rest } = options;
    const got = await readAll(make(rest), place, limit);
    check(`story ${seed}: the same list with ${name}`, same(got.trades, w.truth), `${got.calls} calls`);
  }
  Object.assign(w.node, { index: true, batches: true, busyEvery: 0, forgetful: false, shuffled: false });

  // A new chain object at every call (a cold start each time), the cursor alone carrying on.
  let cursor = null, list = [], more = true, turns = 0;
  while (more && turns++ < 5000) {
    const got = await make({ page: 12, pages: 2 }).tradesSince(where, cursor, { limit: 5 });
    list.push(...got.trades); cursor = got.cursor; more = got.more;
  }
  check(`story ${seed}: the same list from cold starts`, same(list, w.truth), `${turns} calls`);

  // The tip: nothing from the freshest slots until they have settled, and nothing lost when they have.
  w.setTip(w.slot + 1);
  const early = await readAll(make({ settle: 2 }), where, 500);
  const late = w.truth.filter((t) => t.slot > w.slot - 1);
  check(`story ${seed}: the last slot waits for the tip to move on`, late.length > 0 && same(early.trades, w.truth.slice(0, w.truth.length - late.length)) && early.cursor.slot < w.slot);
  w.setTip(w.slot + 2);
  const rest = await readAll(make({ settle: 2 }), where, 500, early.cursor);
  check(`story ${seed}: then it comes, once`, same(rest.trades, late));
  const again = await make().tradesSince(where, rest.cursor);
  check(`story ${seed}: nothing new, same cursor back`, again.trades.length === 0 && !again.more && same(again.cursor, rest.cursor));
  w.setTip(w.slot + 10);
}

// A transaction the node lists but does not serve yet is waited for, not skipped.
{
  const w = story(21, 8);
  w.node.notYet = 3;
  const chain = createChain({ rpcUrl: "http://node.invalid/key", fetch: w.fetch, ...quiet });
  const got = await readAll(chain, await chain.locate(w.mint), 200);
  check("a transaction not served yet is waited for", same(got.trades, w.truth) && chain.stats.again > 0);
}

// Nothing of the node's address in an error.
{
  const secret = "https://rpc.example/?api-key=SECRET123";
  const refuse = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ error: { code: -32602, message: `bad params for ${secret} and https://other.example/x` } }) });
  const broken = async () => { throw new Error(`connect failed ${secret}`); };
  let texts = [];
  for (const fetch of [refuse, broken]) {
    try { await createChain({ rpcUrl: secret, fetch, patience: 300 }).locate("So11111111111111111111111111111111111111112"); texts.push("no error"); } catch (e) { texts.push(String(e.message) + String(e.stack) + String(e.cause ?? "")); }
  }
  check("errors never carry the node's address", texts.every((t) => t !== "no error" && !t.includes("SECRET123") && !t.includes("example")), texts.map((t) => t.split("\n")[0]).join(" | "));
}

console.log(failures() ? `\n${failures()} check(s) failed` : "\nall offline checks passed");
process.exit(failures() ? 1 : 0);
