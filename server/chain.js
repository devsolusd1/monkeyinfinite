// Reads the token's trades from Solana, in the exact order they landed. Reading only: nothing here can
// send a transaction. The token starts on a Meteora DBC curve and, once it graduates, trades in a Meteora
// DAMM v2 pool. A trade is one swap against the venue's two vaults: one swap, one word.
// No dependencies: fetch and node:crypto.

import { createHash } from "node:crypto";

export const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const DAMM_V2_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);

// Where things sit inside the accounts, read from the IDLs in @meteora-ag/dynamic-bonding-curve-sdk:
// the curve's VirtualPool, its PoolConfig, and the DAMM v2 Pool. `tag` is the account discriminator.
const CURVE = { tag: [213, 224, 5, 209, 98, 69, 119, 92], config: 72, mint: 136, tokenVault: 168, solVault: 200, migrated: 305 };
const CONFIG = { quoteMint: 8 };
const POOL = { tag: [241, 154, 109, 4, 17, 177, 109, 188], mintA: 168, mintB: 200, vaultA: 232, vaultB: 264 };

// The DAMM v2 configs a curve can graduate into (DAMM_V2_MIGRATION_FEE_ADDRESS in the SDK). The address of
// the pool depends on which one was used, so all of them are tried.
export const GRADUATION_CONFIGS = [
  "7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd", "2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k",
  "Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp", "2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq",
  "AkmQWebAwFvWk55wBoCr5D62C6VVDTzi84NJuD9H7cFD", "DbCRBj8McvPYHJG1ukj8RE15h2dCNUdTAESG49XpQ44u",
  "A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck",
];

// The first bytes of the curve's instruction that moves it into DAMM v2 (migration_damm_v2).
const MIGRATION = [156, 169, 230, 103, 53, 228, 80, 64];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---------------------------------------------------------------------------------------- addresses

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (; n > 0n; n /= 58n) out = B58[Number(n % 58n)] + out;
  for (const b of bytes) { if (b) break; out = "1" + out; }
  return out;
}

export function unbase58(text) {
  let n = 0n;
  for (const c of text) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("chain: not base58");
    n = n * 58n + BigInt(i);
  }
  const out = [];
  for (; n > 0n; n >>= 8n) out.push(Number(n & 255n));
  for (const c of text) { if (c !== "1") break; out.push(0); }
  return Uint8Array.from(out.reverse());
}

// Is this 32-byte value a point of ed25519? A program's own address must not be one.
const P = 2n ** 255n - 19n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
function power(base, e) {
  let r = 1n;
  for (base %= P; e > 0n; e >>= 1n) { if (e & 1n) r = (r * base) % P; base = (base * base) % P; }
  return r;
}
function onCurve(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 127 : bytes[i]);
  const y2 = (y * y) % P, u = (y2 - 1n + P) % P, v = (D * y2 + 1n) % P;
  const x2 = (u * power(v, P - 2n)) % P;
  return x2 === 0n || power(x2, (P - 1n) / 2n) === 1n;
}

// A program-derived address: the same search as PublicKey.findProgramAddressSync.
export function programAddress(seeds, program) {
  const tail = [unbase58(program), Buffer.from("ProgramDerivedAddress")];
  for (let bump = 255; bump >= 0; bump--) {
    const hash = createHash("sha256");
    for (const part of [...seeds, Uint8Array.of(bump), ...tail]) hash.update(part);
    const digest = hash.digest();
    if (!onCurve(digest)) return base58(digest);
  }
  throw new Error("chain: no address for these seeds");
}

// deriveDammV2PoolAddress and derive…TokenVaultAddress of the SDK, in plain code.
export function dammV2PoolAddress(config, mintA, mintB) {
  const a = unbase58(mintA), b = unbase58(mintB), aFirst = Buffer.compare(a, b) === 1;
  return programAddress([Buffer.from("pool"), unbase58(config), aFirst ? a : b, aFirst ? b : a], DAMM_V2_PROGRAM);
}
export const vaultAddress = (program, pool, mint) => programAddress([Buffer.from("token_vault"), unbase58(mint), unbase58(pool)], program);

// ------------------------------------------------------------------------------- one transaction

// What one transaction did to a venue: its swaps, in the order they ran.
//   venue: { program, tokenVault, solVault } and, for the curve, `pool` (to notice its migration).
//   -> { index, wallet, time, swaps: [{ side, lamports }], migration: null | [accounts of the migration] }
// A swap is one call of the venue's program whose own token transfers move the two vaults in opposite
// directions: token vault down is a buy, up is a sell; lamports is what the SOL vault gained or lost in
// that call. So the buy inside the creating transaction counts (the mint into the vault belongs to the
// call that creates the pool, the buy to the call after it), and a transaction with two swaps gives two.
// Liquidity in or out, fee claims and the migration move the vaults the same way, or only one: no trade.
export function swapsOf(tx, venue) {
  const message = tx.transaction.message, meta = tx.meta;
  const keys = message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const out = { index: tx.transactionIndex ?? null, wallet: keys[0], time: (tx.blockTime ?? 0) * 1000, swaps: [], migration: null };
  if (!meta || meta.err) return out;

  // Every instruction in the order it ran, with how deep in the calls it was.
  const inner = new Map((meta.innerInstructions ?? []).map((group) => [group.index, group.instructions]));
  const ran = [];
  let depthsKnown = Array.isArray(meta.innerInstructions);
  message.instructions.forEach((ix, i) => {
    ran.push({ ix, depth: 1 });
    for (const sub of inner.get(i) ?? []) {
      if (!(sub.stackHeight >= 2)) depthsKnown = false;
      ran.push({ ix: sub, depth: sub.stackHeight ?? 2 });
    }
  });

  for (const { ix } of ran) {
    if (venue.pool && ix.programId === DBC_PROGRAM && typeof ix.data === "string" && ix.accounts?.includes(venue.pool)) {
      const data = unbase58(ix.data);
      if (MIGRATION.every((b, i) => data[i] === b)) out.migration = ix.accounts;
    }
  }

  const swap = (token, sol) =>
    token < 0n && sol > 0n ? { side: "buy", lamports: sol } : token > 0n && sol < 0n ? { side: "sell", lamports: -sol } : null;

  if (depthsKnown) {
    for (let i = 0; i < ran.length; i++) {
      if (ran[i].ix.programId !== venue.program) continue;
      let token = 0n, sol = 0n;
      for (let j = i + 1; j < ran.length && ran[j].depth > ran[i].depth; j++) {
        if (ran[j].depth !== ran[i].depth + 1) continue;
        const { programId, parsed } = ran[j].ix;
        if (!TOKEN_PROGRAMS.has(programId) || (parsed?.type !== "transfer" && parsed?.type !== "transferChecked")) continue;
        const amount = BigInt(parsed.info.amount ?? parsed.info.tokenAmount.amount);
        if (parsed.info.destination === venue.tokenVault) token += amount;
        if (parsed.info.source === venue.tokenVault) token -= amount;
        if (parsed.info.destination === venue.solVault) sol += amount;
        if (parsed.info.source === venue.solVault) sol -= amount;
      }
      const s = swap(token, sol);
      if (s) out.swaps.push(s);
    }
    return out;
  }

  // A node that does not say how deep each call was: fall back on the balances before and after.
  const change = (vault) => {
    const at = keys.indexOf(vault);
    const amount = (list) => BigInt((list ?? []).find((b) => b.accountIndex === at)?.uiTokenAmount.amount ?? 0);
    return at < 0 ? 0n : amount(meta.postTokenBalances) - amount(meta.preTokenBalances);
  };
  const s = swap(change(venue.tokenVault), change(venue.solVault));
  if (s) out.swaps.push(s);
  return out;
}

// --------------------------------------------------------------------------------------- the node

// Codes that asking again will not cure: a bad request, or a node that does not keep history.
const HOPELESS = new Set([-32600, -32601, -32602, -32700, -32010, -32011]);

async function lanes(items, width, work) {
  let next = 0, broken = false;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length && !broken) {
      try { await work(items[next++]); } catch (e) { broken = true; throw e; }
    }
  }));
}

// JSON-RPC over fetch: a few calls per request, a steady pace, and patience with a busy node (429, 5xx,
// "not available yet"). On 429 it waits as told and goes slower for a while. No error ever carries the
// node's address.
function createRpc({ rpcUrl, fetch: send = globalThis.fetch, perSecond, batch, patience }) {
  const stats = { calls: 0, requests: 0, again: 0, busy: 0, methods: {} };
  let rate = perSecond, ceiling = perSecond, tokens = perSecond, stamp = Date.now(), batches = batch > 1, id = 0, version = 1;
  const hush = (text) => String(text ?? "").split(rpcUrl).join("…").replace(/\w+:\/\/\S+/g, "…").slice(0, 140);

  // The pace: `rate` calls a second, never more than a second's worth at once.
  async function take(n) {
    for (;;) {
      const now = Date.now(), need = Math.min(n, Math.max(1, Math.floor(rate)));
      if (now > stamp) { tokens = Math.min(rate, tokens + ((now - stamp) / 1000) * rate); stamp = now; }
      if (tokens >= need) { tokens -= need; return; }
      await sleep(Math.max(stamp - now, 0) + Math.ceil(((need - tokens) / rate) * 1000) + 2);
    }
  }

  // After an answer: a little faster again, and the ceiling creeps back to what was asked for.
  const faster = () => { ceiling = Math.min(perSecond, ceiling + 0.02); rate = Math.min(ceiling, rate + 0.3); };

  // One request. The answers come back in the order of the calls; null: nothing usable, ask again.
  async function post(calls) {
    await take(calls.length);
    stats.requests++;
    stats.calls += calls.length;
    for (const c of calls) stats.methods[c.method] = (stats.methods[c.method] ?? 0) + 1;
    const body = calls.map((c) => ({ jsonrpc: "2.0", id: c.id, method: c.method, params: typeof c.params === "function" ? c.params() : c.params }));
    let res, json;
    try {
      res = await send(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.length > 1 ? body : body[0]) });
    } catch { return null; } // nothing of the error is kept: it could carry the address
    if (res.status === 429) { // too fast for this node: wait as long as it says, then go slower
      stats.busy++;
      ceiling = Math.max(2, rate * 0.9); // what was just too fast is not tried again for a while
      rate = Math.max(2, rate * 0.7);
      tokens = 0;
      stamp = Math.max(stamp, Date.now() + Math.min(10, Math.max(1, Number(res.headers?.get?.("retry-after")) || 1)) * 1000);
      return null;
    }
    if (res.status >= 500) return null;
    try { json = await res.json(); } catch { json = null; }
    if (calls.length > 1) {
      if (!Array.isArray(json)) { batches = false; return null; } // this node takes one call at a time
      const byId = new Map(json.map((a) => [a?.id, a]));
      faster();
      return calls.map((c) => byId.get(c.id) ?? null);
    }
    if (res.status === 401 || res.status === 403) throw new Error(`rpc: the node refused the request (${res.status})`);
    const answer = Array.isArray(json) ? json[0] : json;
    if (!answer || (!("result" in answer) && !answer.error)) {
      if (res.status >= 400) throw new Error(`rpc: the node refused the request (${res.status})`);
      return null;
    }
    faster();
    return [answer];
  }

  // Calls: { method, params (or a function giving them), must: true when a null answer means "not yet" }.
  // Gives up when nothing at all has come for `patience` milliseconds.
  async function many(list) {
    const out = new Array(list.length);
    let todo = list.map((c, i) => ({ ...c, i, id: ++id })), heard = Date.now();
    for (let turn = 0; todo.length; turn++) {
      if (turn) {
        if (Date.now() - heard > patience) throw new Error(`rpc: ${todo[0].method} did not come in time`);
        stats.again++;
        await sleep(Math.min(1600, 100 * 2 ** Math.min(turn, 5)));
      }
      const size = batches ? Math.max(1, Math.min(batch, Math.floor(rate / 2))) : 1;
      const chunks = [];
      for (let k = 0; k < todo.length; k += size) chunks.push(todo.slice(k, k + size));
      const later = [];
      await lanes(chunks, 4, async (chunk) => {
        const answers = await post(chunk);
        chunk.forEach((c, k) => {
          const a = answers?.[k];
          if (!a) return later.push(c);
          if (a.error) {
            if (a.error.code === -32015 && version < 16) { // a newer kind of transaction than was asked for
              version = Math.max(version + 1, Number(/maxSupportedTransactionVersion\D+(\d+)/.exec(a.error.message)?.[1]) || 0);
              return later.push(c);
            }
            if (HOPELESS.has(a.error.code)) throw new Error(`rpc: ${c.method} failed (${a.error.code}) ${hush(a.error.message)}`);
            return later.push(c);
          }
          if (a.result == null && c.must) return later.push(c); // listed, but this node does not serve it yet
          out[c.i] = a.result;
        });
      });
      if (later.length < todo.length) { heard = Date.now(); turn = 0; }
      todo = later.sort((a, b) => a.i - b.i);
    }
    return out;
  }

  return { many, one: async (method, params) => (await many([{ method, params }]))[0], stats, get version() { return version; }, get rate() { return rate; } };
}

// -------------------------------------------------------------------------------------- the chain

const ROUND = 40; // transactions read in one go

const remember = (map, key, value, most) => {
  map.set(key, value);
  if (map.size > most) map.delete(map.keys().next().value);
  return value;
};

// createChain({ rpcUrl, fetch? }) -> { locate, tradesSince, blockhashOf, stats }
//   settle     how many slots behind the tip a slot must be before its trades are given out
//   perSecond  the most calls a second the node is asked; it goes slower by itself when the node says 429.
//              9 suits a plan of ten requests a second; with a larger plan, say so here or in RPC_PER_SECOND
//   batch      the most calls in one request; patience: how long a silent node is waited for
//   page, pages  signatures per listing call, and how many listing calls one tradesSince may make
export function createChain({
  rpcUrl, fetch, settle = 2, perSecond = Number(process.env.RPC_PER_SECOND) || 9, batch = 10, patience = 20000, page = 1000, pages = 6,
} = {}) {
  if (!rpcUrl) throw new Error("chain: no RPC node given");
  const rpc = createRpc({ rpcUrl, fetch, perSecond, batch, patience });
  const commitment = "confirmed";
  const curveOf = new Map(), whereOf = new Map(), quoteOf = new Map(); // mint -> curve; curve -> where, once it has its pool; config -> quote mint
  const blocks = new Map(), orders = new Map(), read = new Map(); // slot -> { blockhash, time }; slot -> place of each signature; vault:signature -> swapsOf

  const bytesOf = (account) => Buffer.from(account.data[0], "base64");
  const keyAt = (data, at) => base58(data.subarray(at, at + 32));
  const tagged = (data, tag) => tag.every((b, i) => data[i] === b);
  const accounts = async (list) => (await rpc.one("getMultipleAccounts", [list, { commitment, encoding: "base64" }])).value;

  // locate(mint) -> { live: false } | { live: true, curve: { pool, tokenVault, solVault, config }, graduated, pool: null | { address, tokenVault, solVault } }
  // The curve is found by the mint alone: the one VirtualPool of the DBC program whose base mint it is.
  async function locate(mint) {
    let curve = curveOf.get(mint);
    if (!curve) {
      if (!(await accounts([mint]))[0]) return { live: false }; // not created yet: the cheap answer
      const found = await rpc.one("getProgramAccounts", [DBC_PROGRAM, {
        commitment, encoding: "base64", dataSlice: { offset: 0, length: 0 },
        filters: [{ memcmp: { offset: 0, bytes: base58(CURVE.tag) } }, { memcmp: { offset: CURVE.mint, bytes: mint } }],
      }]);
      if (!found.length) return { live: false };
      curve = found.map((a) => a.pubkey).sort()[0];
      curveOf.set(mint, curve);
    }
    return describe(curve);
  }

  // What stands at a curve's address now. `hints`: addresses among which the pool may be (the accounts of
  // the migration, when tradesSince has just read it); with them the pool is looked for whatever the flag says.
  async function describe(curvePool, hints = null) {
    if (whereOf.has(curvePool)) return whereOf.get(curvePool);
    const [account] = await accounts([curvePool]);
    if (!account || account.owner !== DBC_PROGRAM) return { live: false };
    const data = bytesOf(account);
    if (!tagged(data, CURVE.tag)) return { live: false };
    const curve = { pool: curvePool, tokenVault: keyAt(data, CURVE.tokenVault), solVault: keyAt(data, CURVE.solVault), config: keyAt(data, CURVE.config) };
    const graduated = data[CURVE.migrated] === 1;
    const pool = graduated || hints ? await poolOf(keyAt(data, CURVE.mint), curve.config, hints ?? []) : null;
    const where = { live: true, curve, graduated: graduated || !!pool, pool };
    return pool ? remember(whereOf, curvePool, where, 50) : where;
  }

  // The DAMM v2 pool the curve graduated into: derived for each config it could have used, then read to
  // make sure it is a pool of these two mints. Its vaults are taken from the pool itself.
  async function poolOf(mint, config, hints) {
    let quote = quoteOf.get(config);
    if (!quote) {
      const [account] = await accounts([config]);
      if (!account) return null;
      quote = remember(quoteOf, config, keyAt(bytesOf(account), CONFIG.quoteMint), 50);
    }
    const tries = [...new Set([...hints, ...GRADUATION_CONFIGS.map((c) => dammV2PoolAddress(c, mint, quote))])];
    const got = await accounts(tries);
    for (let i = 0; i < tries.length; i++) {
      if (got[i]?.owner !== DAMM_V2_PROGRAM) continue;
      const data = bytesOf(got[i]);
      if (!tagged(data, POOL.tag)) continue;
      const a = keyAt(data, POOL.mintA), b = keyAt(data, POOL.mintB);
      if (a === mint && b === quote) return { address: tries[i], tokenVault: keyAt(data, POOL.vaultA), solVault: keyAt(data, POOL.vaultB) };
      if (a === quote && b === mint) return { address: tries[i], tokenVault: keyAt(data, POOL.vaultB), solVault: keyAt(data, POOL.vaultA) };
    }
    return null;
  }

  // Asks once for what is not kept yet and keeps the promises, so that a reader cut short is not paid for
  // twice and two readers of the same thing share one request. What failed is not kept.
  async function kept(map, keys, most, ask, make) {
    const mine = new Map(keys.map((k) => [k, map.get(k)]));
    const want = keys.filter((k) => !mine.get(k));
    if (want.length) {
      const asked = ask(want);
      want.forEach((k, i) => {
        const one = asked.then((got) => make(got[i], k));
        one.catch(() => { if (map.get(k) === one) map.delete(k); });
        mine.set(k, remember(map, k, one, most));
      });
    }
    const got = await Promise.all(keys.map((k) => mine.get(k)));
    return new Map(keys.map((k, i) => [k, got[i]]));
  }

  // The block of a slot: its hash (the hash of the block itself, not the recent blockhash a transaction
  // carries) and its time; with `order`, the signatures in the order the block holds them. Never its transactions.
  const block = (order) => (slots) => rpc.many(slots.map((slot) => ({
    method: "getBlock", must: true,
    params: () => [slot, { commitment, transactionDetails: order ? "signatures" : "none", rewards: false, maxSupportedTransactionVersion: rpc.version }],
  })));
  const blocksOf = (slots) => kept(blocks, [...new Set(slots)], 4000, block(false), (b) => ({ blockhash: b.blockhash, time: (b.blockTime ?? 0) * 1000 }));
  const ordersOf = (slots) => kept(orders, [...new Set(slots)], 200, block(true), (b) => new Map(b.signatures.map((signature, i) => [signature, i])));
  const blockhashOf = async (slot) => (await blocksOf([slot])).get(slot).blockhash;

  // What each of these transactions did to the venue.
  async function transactions(venue, signatures) {
    const got = await kept(read, signatures.map((s) => `${venue.tokenVault}:${s}`), 6000,
      (keys) => rpc.many(keys.map((k) => ({
        method: "getTransaction", must: true,
        params: () => [k.slice(k.indexOf(":") + 1), { commitment, encoding: "jsonParsed", maxSupportedTransactionVersion: rpc.version }],
      }))),
      (tx, k) => ({ signature: k.slice(k.indexOf(":") + 1), ...swapsOf(tx, venue) }));
    return new Map(signatures.map((s) => [s, got.get(`${venue.tokenVault}:${s}`)]));
  }

  // One listing call: signatures of an address, newest first, between two known ones.
  const list = (address, { until, before }) =>
    rpc.one("getSignaturesForAddress", [address, { commitment, limit: page, ...(before && { before }), ...(until && { until }) }]);

  const start = (venue) => ({ v: 1, venue, slot: 0, anchor: null, part: null, rungs: [] });

  // Reads one venue on from the cursor (which it changes) and gives at most `room` trades.
  //
  // The node only lists signatures newest first, so the way up from the cursor is this: list what lies
  // between the cursor's anchor and the tip; when that does not fit in one page, keep the page's last
  // signature as a rung and list below it, and so on down. The rungs stay in the cursor, so the walk
  // down is paid once however many calls it takes, and the trades are then read rung by rung upwards.
  // A slot is given out only when all of it is in hand: its transactions are put in the block's own
  // order, never the listing's, and the anchor always rests on the last signature of a finished slot.
  async function readVenue(venue, cur, room, deadline) {
    const out = [], rungs = cur.rungs, floor = cur.slot;
    const window = []; // what has been listed, oldest first: { sig, slot, ok }
    let at = 0, passed = 0, top = false, tip = 0, calls = pages, looked = 0, held = false, late = false, crossed = null;
    const look = Math.max(room * 3, 100); // how many transactions one call may read, trades or not

    async function load() {
      const below = passed ? rungs[passed - 1] : null, above = rungs[passed] ?? null;
      const got = await list(venue.address, { until: below ? below[0] : cur.anchor, before: above?.[0] });
      calls--;
      if (above && got.length && got[0].slot > above[1]) throw new Error("chain: the node lost its place in the signatures");
      // The lower edge is cut here too: a node that has not seen that signature yet would not stop at it.
      let n = 0;
      while (n < got.length && (below ? got[n].signature !== below[0] && got[n].slot >= below[1] : got[n].slot > floor)) {
        if (n && got[n].slot > got[n - 1].slot) throw new Error("chain: signatures out of order");
        n++;
      }
      if (n === got.length && got.length >= page) { // more than a page in between: one more rung, then below it
        const last = got[got.length - 1];
        rungs.splice(passed, 0, [last.signature, last.slot, last.err ? 0 : 1]);
        return;
      }
      for (let i = n - 1; i >= 0; i--) window.push({ sig: got[i].signature, slot: got[i].slot, ok: !got[i].err });
      if (above) { window.push({ sig: above[0], slot: above[1], ok: !!above[2] }); passed++; return; }
      // The top of the listing. Where the node stands is asked only when something is waiting, and after the
      // listing, so a quiet look costs one call; it tells which of the freshest slots have had time to settle.
      top = true;
      if (at < window.length) tip = await rpc.one("getSlot", [{ commitment }]);
    }

    // The pool a migration created, read from the chain; null while this node cannot show it yet.
    async function poolAfter(tx) {
      const where = await describe(venue.address, tx.migration);
      return where.pool && tx.migration.includes(where.pool.address) ? where.pool : null;
    }

    // Gives out the next whole slots among window[at .. end), as many as it takes to fill the room.
    async function give(end) {
      // No more transactions at a time than can be read before the deadline, at two calls each (but always some).
      const fits = deadline === Infinity ? ROUND : Math.max(looked ? 0 : 1, Math.floor(((deadline - Date.now()) / 2000) * rpc.rate));
      if (!fits) { late = true; return; }
      const need = Math.min(room + (cur.part?.given ?? 0), Math.max(1, look - looked), ROUND, fits);
      let stop = at, count = 0;
      while (stop < end && count < need) {
        for (const slot = window[stop].slot; stop < end && window[stop].slot === slot; stop++) if (window[stop].ok) count++;
      }
      looked += count;
      const did = await transactions(venue, window.slice(at, stop).filter((e) => e.ok).map((e) => e.sig));
      const slots = [];
      for (const e of window.slice(at, stop)) {
        let s = slots[slots.length - 1];
        if (s?.slot !== e.slot) slots.push((s = { slot: e.slot, size: 0, txs: [] }));
        s.size++;
        s.last = e.sig;
        const tx = e.ok && did.get(e.sig);
        if (tx && (tx.swaps.length || tx.migration)) s.txs.push(tx);
      }
      // A node that does not say where in its block a transaction stood: the block's list of signatures says it.
      const placeOf = await ordersOf(slots.filter((s) => s.txs.length > 1 && s.txs.some((tx) => tx.index == null)).map((s) => s.slot));
      const blockOf = await blocksOf(slots.filter((s) => s.txs.some((tx) => tx.swaps.length)).map((s) => s.slot));

      for (const s of slots) {
        const block = blockOf.get(s.slot);
        if (s.txs.length > 1) { // the block's own order
          const place = placeOf.get(s.slot);
          const position = (tx) => (place ? place.get(tx.signature) : tx.index);
          if (s.txs.some((tx) => position(tx) == null)) throw new Error("chain: a transaction is not in its block");
          s.txs.sort((a, b) => position(a) - position(b));
        }
        const trades = [];
        let moved = null;
        for (const tx of s.txs) {
          tx.swaps.forEach((swap, k) => trades.push({
            signature: tx.signature, blockhash: block.blockhash, slot: s.slot, wallet: tx.wallet, side: swap.side,
            sol: Number(swap.lamports) / 1e9, time: tx.time || block.time,
            ...(tx.swaps.length > 1 && { swap: k + 1 }), // which swap of its transaction, when there are several
          }));
          if (tx.migration) moved = tx;
        }
        const pool = moved && (await poolAfter(moved));
        if (moved && !pool) { held = true; return; } // wait at the door until the pool can be read
        if (cur.part && cur.part.slot !== s.slot) cur.part = null;
        const skip = cur.part?.given ?? 0;
        if (room <= 0 && trades.length > skip) return;
        const some = trades.slice(skip, skip + room);
        out.push(...some);
        room -= some.length;
        if (skip + some.length < trades.length) { cur.part = { slot: s.slot, given: skip + some.length }; return; }
        cur.part = null;
        cur.slot = s.slot;
        cur.anchor = s.last;
        at += s.size;
        if (moved) { crossed = { slot: s.slot, pool }; return; }
      }
    }

    let more = false;
    for (;;) {
      // Slots below the next rung are whole; at the tip, slots the node has had time to finish.
      const bound = top ? tip - settle : passed ? rungs[passed - 1][1] - 1 : -1;
      let end = at;
      while (end < window.length && window[end].slot <= bound) end++;
      if (end === at && top) break; // all given: what is left, if anything, is too fresh
      if (room <= 0 || looked >= look || Date.now() > deadline || (end === at && calls <= 0)) { more = true; break; }
      if (end === at) { await load(); continue; }
      const before = at, part = cur.part?.given;
      await give(end);
      if (crossed || held) break;
      if (late || (at === before && cur.part?.given === part)) { more = true; break; } // out of time, or nothing moved: the next call carries on
    }
    cur.rungs = rungs.filter((r) => r[1] > cur.slot);
    return { trades: out, more, crossed };
  }

  // tradesSince(where, cursor, { limit }) -> { trades, cursor, more }
  //   where: what locate returned. cursor: null the first time (from the token's very first trade), then
  //   whatever came back. more: there is more to read right now; false: wait for new trades.
  //   Trades come by slot, then by position inside the block; the curve's first, then the pool's.
  //   The cursor is plain data: { v, venue: "curve" | "pool", slot, anchor, part, rungs } and, once the
  //   curve's migration has been read, pool (taken from the chain at that moment) and from (its slot).
  //   deadline: a time (Date.now() based) after which no new reading is started.
  async function tradesSince(where, cursor = null, { limit = 200, deadline = Infinity } = {}) {
    let cur = cursor ? structuredClone(cursor) : start("curve");
    const trades = [];
    if (!where?.live || limit <= 0) return { trades, cursor: cur, more: false };
    for (;;) {
      let venue;
      if (cur.venue === "curve") venue = { ...where.curve, address: where.curve.pool, program: DBC_PROGRAM };
      else {
        cur.pool ??= where.pool ?? (await describe(where.curve.pool)).pool ?? null;
        if (!cur.pool) return { trades, cursor: cur, more: false };
        venue = { ...cur.pool, program: DAMM_V2_PROGRAM };
      }
      const got = await readVenue(venue, cur, limit - trades.length, deadline);
      for (const t of got.trades) trades.push(t);
      if (!got.crossed) return { trades, cursor: cur, more: got.more };
      cur = { ...start("pool"), pool: got.crossed.pool, from: got.crossed.slot }; // the curve is over: on to the pool
      if (trades.length >= limit || Date.now() > deadline) return { trades, cursor: cur, more: true };
    }
  }

  return { locate, tradesSince, blockhashOf, stats: rpc.stats };
}
