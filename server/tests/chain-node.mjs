// Which RPC node the chain tests talk to, and a plain way to ask it things without going through chain.js
// (the tests check chain.js against what the node says directly).
// The address is taken from RPC_URL, or from the RPC_URL line of launch/.env when that file is there,
// or else the public node. It is never printed, and no error text from the node is printed either.

import { readFileSync } from "node:fs";

const PUBLIC = "https://api.mainnet-beta.solana.com";

function find() {
  if (process.env.PUBLIC_RPC) return PUBLIC;
  if (/^https?:\/\//.test(process.env.RPC_URL ?? "")) return process.env.RPC_URL;
  try {
    const line = readFileSync(new URL("../../launch/.env", import.meta.url), "utf8").split(/\r?\n/).find((l) => /^\s*RPC_URL\s*=/.test(l));
    const value = line?.replace(/^\s*RPC_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
    if (/^https?:\/\//.test(value ?? "")) return value;
  } catch { /* no such file: the public node */ }
  return PUBLIC;
}

export const rpcUrl = find();
export const ownNode = rpcUrl !== PUBLIC;
// chain.js is left at its own pace on the project's node (that is what is being tried); the public node
// allows about 4 calls a second in all.
export const pace = ownNode ? { patience: 90000 } : { perSecond: 3, batch: 3, patience: 120000 };
const askPerSecond = ownNode ? 9 : 3;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let id = 0, last = 0;
export const direct = { calls: 0 };

// One call, straight to the node, paced and patient.
export async function ask(method, params = []) {
  for (let turn = 0; turn < 40; turn++) {
    const gap = 1000 / askPerSecond - (Date.now() - last);
    if (gap > 0) await sleep(gap);
    last = Date.now();
    direct.calls++;
    let res, json;
    try {
      res = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
    } catch { await sleep(400 * (turn + 1)); continue; }
    if (res.status === 429 || res.status >= 500) { await sleep(Math.min(5000, 1000 + 250 * turn)); continue; }
    try { json = await res.json(); } catch { await sleep(400); continue; }
    if (json.error) {
      if ([-32004, -32014, -32016, -32005].includes(json.error.code)) { await sleep(400 * (turn + 1)); continue; }
      throw new Error(`${method} failed with code ${json.error.code}`);
    }
    return json.result;
  }
  throw new Error(`${method} did not come`);
}

// Every signature of an address, oldest first: [{ signature, slot, err, blockTime }]. Only those after `until`
// and before `before` when given; `most`: stop after about that many, keeping the newest.
export async function signaturesOf(address, { until = null, before = null, most = Infinity } = {}) {
  const out = [];
  while (out.length < most) {
    const page = await ask("getSignaturesForAddress", [address, { commitment: "confirmed", limit: 1000, ...(before && { before }), ...(until && { until }) }]);
    out.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  return out.reverse();
}

export const transaction = (signature) => ask("getTransaction", [signature, { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }]);

// The second opinion on one transaction, from the balances alone: how the two vaults stood before and after.
// -> null when it failed, otherwise { token, sol } (changes, as BigInt) and side/sol when they moved in opposite directions.
export function byBalances(tx, venue) {
  if (!tx?.meta || tx.meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey ?? k);
  const change = (vault) => {
    const at = keys.indexOf(vault);
    const amount = (list) => BigInt(list.find((b) => b.accountIndex === at)?.uiTokenAmount.amount ?? 0);
    return at < 0 ? 0n : amount(tx.meta.postTokenBalances) - amount(tx.meta.preTokenBalances);
  };
  const token = change(venue.tokenVault), sol = change(venue.solVault);
  const side = token < 0n && sol > 0n ? "buy" : token > 0n && sol < 0n ? "sell" : null;
  return { token, sol, side, amount: Number(sol < 0n ? -sol : sol) / 1e9, index: tx.transactionIndex ?? null, slot: tx.slot, wallet: keys[0] };
}

let failed = 0;
export function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  return ok;
}
export const failures = () => failed;
