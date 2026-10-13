// GET /api/page?n=<k>: a finished page, from its record. It never changes, so it may be kept for good.

import { CONFIG } from "../site/config.js";
import { createKeeper, keeperInPlace, reasonOf, sendJson } from "../server/keeper.js";
import { storeFromEnv } from "../server/store.js";

const CACHE = "public, max-age=3600, s-maxage=31536000, immutable";

let own; // this instance's keeper: it only reads the store, so it is given no chain
function keeper() {
  const other = keeperInPlace();
  if (other) return other;
  if (own === undefined) {
    const store = storeFromEnv();
    // Not set up means not set up for both endpoints: the same condition as in live.js.
    own = store && process.env.RPC_URL?.trim() ? createKeeper({ store, mint: CONFIG.mint }) : null;
  }
  return own;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { sendJson(res, 405, { error: "GET only" }, "no-store"); return; }
    const n = Number(new URL(req.url, "http://x").searchParams.get("n"));
    const record = Number.isSafeInteger(n) ? await keeper()?.page(n) : null;
    if (!record) { sendJson(res, 404, { error: "no such finished page" }, "public, max-age=0, s-maxage=1"); return; }
    sendJson(res, 200, record, CACHE);
  } catch (err) {
    sendJson(res, 503, { error: reasonOf(err) }, "no-store");
  }
}
