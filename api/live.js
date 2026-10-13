// GET /api/live?have=<n>: the book as it stands, for a browser that already has n words.
// Calling this is what makes the keeper look at the chain; there is no other clock.

import { CONFIG } from "../site/config.js";
import { createChain } from "../server/chain.js";
import { createKeeper, keeperInPlace, reasonOf, sendJson } from "../server/keeper.js";
import { storeFromEnv } from "../server/store.js";

const CACHE = "public, s-maxage=1, stale-while-revalidate=1";
const LIMIT_MS = 5500; // the keeper gives up by itself before this (4 s for the chain); the browser waits 6 s for its first answer

let own; // this instance's keeper, built on the first call; null while the environment is not all there
function keeper() {
  const other = keeperInPlace();
  if (other) return other;
  if (own === undefined) {
    const store = storeFromEnv(), rpcUrl = process.env.RPC_URL?.trim();
    own = store && rpcUrl ? createKeeper({ store, chain: createChain({ rpcUrl }), mint: CONFIG.mint }) : null;
  }
  return own;
}

// When Vercel is what runs this: asks it to let something finish after the answer has gone out, instead of
// freezing it halfway. (What @vercel/functions' waitUntil does, without the package.)
function letFinish(promise) {
  try { if (promise) globalThis[Symbol.for("@vercel/request-context")]?.get?.()?.waitUntil?.(promise); } catch {}
}

// Waits for the look at the chain, but not for ever.
function looked(k) {
  let timer;
  const late = new Promise((done) => { timer = setTimeout(() => done("slow"), LIMIT_MS); });
  const done = k.sync().then((r) => (r.ran ? "ran" : "skipped"), (err) => { console.error("live: the look at the chain failed:", reasonOf(err)); return "failed"; });
  return Promise.race([done, late]).then((how) => {
    clearTimeout(timer);
    letFinish(how === "slow" ? done : k.waiting?.()); // the look itself, or the answer from the chain it gave up waiting for
    return how;
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { sendJson(res, 405, { error: "GET only" }, "no-store"); return; }
    const k = keeper();
    if (!k) { sendJson(res, 200, { live: false, mint: CONFIG.mint, reason: "not set up yet" }, CACHE); return; }
    const have = Number(new URL(req.url, "http://x").searchParams.get("have"));
    const how = await looked(k);
    // A look that failed does not unwrite the book: what is stored is still answered. Only when nothing
    // true can be said (the store is away, or nobody knows whether the token exists) is it a 503.
    sendJson(res, 200, await k.live(Number.isSafeInteger(have) ? have : 0), CACHE, { "X-Sync": how });
  } catch (err) {
    sendJson(res, 503, { error: reasonOf(err) }, "no-store");
  }
}
