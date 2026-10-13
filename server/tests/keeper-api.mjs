// The two endpoints, called over HTTP as Vercel and the local server call them: the bodies and headers of
// the contract, what they say when the environment is missing, and that a failure is a plain 503 that gives
// nothing away. Usage: node server/tests/keeper-api.mjs

import { createServer } from "node:http";
import { CONFIG } from "../../site/config.js";
import { createKeeper, useKeeper } from "../keeper.js";
import { memoryStore } from "../store.js";
import { createFakeChain } from "./keeper-fake-chain.mjs";
import { tally, upstashStandIn } from "./keeper-kit.mjs";

const t = tally("the two endpoints");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keysOf = (o) => Object.keys(o).sort().join(",");
const LIVE_CACHE = "public, s-maxage=1, stale-while-revalidate=1", PAGE_CACHE = "public, max-age=3600, s-maxage=31536000, immutable";
const SECRETS = /SECRET|127\.0\.0\.1:9\b|api-key|stand-in-token/;

// Everything the endpoints write to the log is kept, to look for what must never be there.
const logged = [];
for (const level of ["log", "info", "warn", "error"]) {
  const real = console[level];
  console[level] = (...args) => {
    const line = args.map(String).join(" ");
    if (/^(ok  |FAIL|  FAIL)/.test(line)) real(...args); else logged.push(line); // the test's own lines go through
  };
}

const ENV = ["RPC_URL", "KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
function environment(values) {
  for (const name of ENV) delete process.env[name];
  Object.assign(process.env, values);
}

// A fresh copy of both endpoints (as a new instance on Vercel would be), served over HTTP.
let copies = 0;
async function serve() {
  const n = ++copies;
  const live = (await import(`../../api/live.js?copy=${n}`)).default, page = (await import(`../../api/page.js?copy=${n}`)).default;
  const server = createServer((req, res) => (req.url.startsWith("/api/live") ? live : page)(req, res));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async get(path, init) {
      const res = await fetch(base + path, init);
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      return { status: res.status, cache: res.headers.get("cache-control"), type: res.headers.get("content-type"), sync: res.headers.get("x-sync"), body, text, headers: [...res.headers].join(" ") };
    },
    close: () => server.close(),
  };
}

// ---- nothing set up: safe to deploy today ----
for (const [what, values] of [
  ["nothing in the environment", {}],
  ["only the node", { RPC_URL: "http://127.0.0.1:9/?api-key=SECRET" }],
  ["only the store", { KV_REST_API_URL: "http://127.0.0.1:9", KV_REST_API_TOKEN: "SECRET" }],
  ["the node and half a store", { RPC_URL: "http://127.0.0.1:9/?api-key=SECRET", UPSTASH_REDIS_REST_URL: "http://127.0.0.1:9" }],
  ["the node and the address of one store with the token of the other", { RPC_URL: "http://127.0.0.1:9/?api-key=SECRET", KV_REST_API_URL: "http://127.0.0.1:9", UPSTASH_REDIS_REST_TOKEN: "SECRET" }],
]) {
  environment(values);
  const api = await serve();
  const a = await api.get("/api/live?have=0");
  t.ok(a.status === 200 && eq(a.body, { live: false, mint: CONFIG.mint, reason: "not set up yet" }) && a.cache === LIVE_CACHE, `${what}: /api/live says not live, "not set up yet" (${a.status} ${a.text})`);
  const p = await api.get("/api/page?n=1");
  t.ok(p.status === 404 && p.cache !== PAGE_CACHE, `${what}: /api/page has no page (${p.status})`);
  t.ok(!SECRETS.test(a.text + a.headers + p.text + p.headers), `${what}: nothing of the environment is in the answers`);
  api.close();
}
t.ok(CONFIG.mint === "7KDjZMEGHuihekvH6vQBjgwRFeMVW7bjoArUtTJmonk", "the mint answered is the one in site/config.js");

// ---- a keeper in place of the environment's: the contract over HTTP ----
{
  environment({});
  let clock = Date.now();
  const now = () => clock;
  const chain = createFakeChain({ seed: "api", now, live: false });
  const store = memoryStore({ now });
  useKeeper(createKeeper({ store, chain, mint: CONFIG.mint, now }));
  const api = await serve();

  const before = await api.get("/api/live?have=0");
  t.ok(before.status === 200 && eq(before.body, { live: false, mint: CONFIG.mint, reason: "not created yet" }) && before.cache === LIVE_CACHE && before.sync === "ran", `before the token exists: not live, "not created yet" (${before.text})`);

  chain.launch();
  chain.add(360);
  clock += 1000;
  const first = await api.get("/api/live?have=0");
  t.ok(first.status === 200 && first.cache === LIVE_CACHE && /^application\/json/.test(first.type) && first.sync === "ran", `live: 200, JSON, Cache-Control "${first.cache}"`);
  t.ok(keysOf(first.body) === "live,mint,page,pages,reset,total,venue" && keysOf(first.body.page) === "from,number,start,trades" && keysOf(first.body.page.start) === "state,wordCount", "live: the body has the contract's fields and no other");
  t.ok(first.body.live === true && first.body.mint === CONFIG.mint && first.body.venue === "curve" && first.body.total === 360 && first.body.pages === 2 && first.body.page.number === 3 && first.body.page.from === 0 && first.body.page.trades.length === 60 && first.body.reset === true, "live with have=0: 360 words, 2 finished pages, the 60 trades of page 3, reset");
  const asked = chain.stats.tradesSince;
  const again = await api.get("/api/live?have=350");
  t.ok(again.sync === "skipped" && again.body.page.from === 50 && again.body.page.trades.length === 10 && again.body.reset === false, `a second call in the same second does not look at the chain again (X-Sync ${again.sync}) and answers have=350 with the 10 trades after it`);
  t.ok(chain.stats.tradesSince === asked, "the chain was not asked again for it");
  const slash = await api.get("/api/live/?have=360");
  t.ok(slash.status === 200 && slash.body.page.from === 60 && slash.body.page.trades.length === 0, "the same with a slash before the question mark, as a redirect would leave it");
  for (const odd of ["", "?have=", "?have=abc", "?have=-3", "?have=1.5", "?have=99999999999999999999"]) {
    const a = await api.get(`/api/live${odd}`);
    t.ok(a.status === 200 && a.body.live === true && a.body.page.from === 0 && a.body.reset === true, `a have that is no count ("${odd}") is taken as nothing`);
  }
  const head = await api.get("/api/live?have=0", { method: "HEAD" });
  t.ok(head.status === 200 && head.text === "" && head.cache === LIVE_CACHE, "HEAD answers like GET, without a body");
  const post = await api.get("/api/live?have=0", { method: "POST", body: "{}" });
  t.ok(post.status === 405 && post.cache === "no-store", "anything but GET is turned away");

  const page = await api.get("/api/page?n=2");
  t.ok(page.status === 200 && page.cache === PAGE_CACHE && keysOf(page.body) === "closing,firstSlot,lastSlot,number,start,trades" && page.body.number === 2 && page.body.trades.length === 150 && page.body.start.wordCount === 150, `a finished page: 200, Cache-Control "${page.cache}", the record with its 150 trades`);
  t.ok(page.body.firstSlot === chain.trades[150].slot && page.body.lastSlot === chain.trades[299].slot, "with its first and last slot");
  for (const odd of ["?n=3", "?n=99", "?n=0", "?n=-1", "?n=abc", "?n=1.5", ""]) {
    const p = await api.get(`/api/page${odd}`);
    t.ok(p.status === 404 && p.cache !== PAGE_CACHE && !/immutable/.test(p.cache) && eq(p.body, { error: "no such finished page" }), `/api/page${odd}: 404, and nothing that would keep it for good (${p.status}, "${p.cache}")`);
  }
  t.ok((await api.get("/api/page/?n=1")).status === 200, "/api/page/?n=1 with the slash is page 1 all the same");

  // The chain fails, with an error that carries the node's address. The book is still answered.
  clock += 1000;
  chain.fail("connect ECONNREFUSED https://rpc.example/?api-key=SECRET");
  const hiccup = await api.get("/api/live?have=360");
  t.ok(hiccup.status === 200 && hiccup.sync === "failed" && hiccup.body.live === true && hiccup.body.total === 360, `the chain fails once: the book as stored is still answered (X-Sync ${hiccup.sync})`);
  t.ok(!SECRETS.test(hiccup.text + hiccup.headers), "and nothing of the chain's error is in the answer");
  clock += 1000;
  chain.add(5);
  const back = await api.get("/api/live?have=360");
  t.ok(back.sync === "ran" && back.body.total === 365 && back.body.page.trades.length === 5, "the next call reads on: the 5 new trades");
  api.close();
}

// ---- failures: a plain 503, no-store, nothing given away ----
{
  // Nobody knows yet whether the token exists, and the chain cannot be read.
  let clock = Date.now();
  const chain = createFakeChain({ seed: "down", now: () => clock, live: false });
  useKeeper(createKeeper({ store: memoryStore({ now: () => clock }), chain, mint: CONFIG.mint, now: () => clock, sleep: async () => {} }));
  const api = await serve();
  chain.fail("getaddrinfo ENOTFOUND https://rpc.example/?api-key=SECRET");
  const a = await api.get("/api/live?have=0");
  t.ok(a.status === 503 && a.cache === "no-store" && eq(a.body, { error: "the chain has not answered" }), `the chain cannot be read and nothing is known: 503, no-store, a short reason (${a.status} ${a.text})`);

  // The store throws something with an address in it.
  const broken = { ...memoryStore(), lock: async () => { throw new Error("connect ETIMEDOUT https://SECRET@store.example"); }, getMany: async () => { throw new Error("https://SECRET@store.example said no"); } };
  useKeeper(createKeeper({ store: broken, chain, mint: CONFIG.mint }));
  const b = await api.get("/api/live?have=0");
  t.ok(b.status === 503 && b.cache === "no-store" && eq(b.body, { error: "something went wrong" }), `the store throws: 503 "something went wrong" (${b.status} ${b.text})`);
  const c = await api.get("/api/page?n=1");
  t.ok(c.status === 503 && c.cache === "no-store" && eq(c.body, { error: "something went wrong" }), `and the same for /api/page (${c.status} ${c.text})`);
  t.ok(![a, b, c].some((r) => SECRETS.test(r.text + r.headers) || /\bat \w+ \(|\.js:\d+/.test(r.text)), "no address, no key, no stack trace in any of them");
  api.close();
  useKeeper(null);
}

// ---- the real path from the environment, with a store that works and a node that does not ----
{
  const standIn = await upstashStandIn();
  environment({ RPC_URL: "http://127.0.0.1:9/?api-key=SECRET", UPSTASH_REDIS_REST_URL: standIn.url, UPSTASH_REDIS_REST_TOKEN: standIn.token });
  const api = await serve();
  const began = Date.now();
  const a = await api.get("/api/live?have=0");
  const took = Date.now() - began;
  t.ok(a.status === 503 && a.cache === "no-store" && eq(a.body, { error: "the chain has not answered" }) && took < 7000, `from the environment, the node unreachable: 503 "the chain has not answered" after ${took} ms`);
  t.ok(standIn.requests.length >= 3 && standIn.requests.every((r) => r.auth === `Bearer ${standIn.token}`), `the store named by UPSTASH_REDIS_REST_* was really used (${standIn.requests.length} requests)`);
  const p = await api.get("/api/page?n=1");
  t.ok(p.status === 404, "and /api/page finds no page there");
  api.close();

  // ... and a store that cannot be reached.
  environment({ RPC_URL: "http://127.0.0.1:9/?api-key=SECRET", KV_REST_API_URL: "http://127.0.0.1:9/SECRET", KV_REST_API_TOKEN: "SECRET-TOKEN" });
  const api2 = await serve();
  const b = await api2.get("/api/live?have=0"), c = await api2.get("/api/page?n=1");
  t.ok(b.status === 503 && eq(b.body, { error: "the store did not answer" }) && b.cache === "no-store", `the store unreachable: 503 "the store did not answer" (${b.status} ${b.text})`);
  t.ok(c.status === 503 && eq(c.body, { error: "the store did not answer" }), "and the same for /api/page");
  t.ok(![a, p, b, c].some((r) => SECRETS.test(r.text + r.headers)), "no address and no key in any of these answers");
  api2.close();
  standIn.close();
}

// ---- a look that never ends: the endpoint answers anyway (after 5.5 seconds) ----
{
  environment({});
  useKeeper({ mint: CONFIG.mint, sync: () => new Promise(() => {}), live: async () => ({ live: false, mint: CONFIG.mint, reason: "catching up" }), page: async () => null });
  const api = await serve();
  const began = Date.now();
  const a = await api.get("/api/live?have=0");
  const took = Date.now() - began;
  t.ok(a.status === 200 && a.sync === "slow" && took >= 5000 && took < 7000, `a look that never ends: answered from the store after ${took} ms (X-Sync ${a.sync})`);
  api.close();
  useKeeper(null);
}

t.ok(logged.length > 0 && !logged.some((line) => SECRETS.test(line)), `nothing secret in the ${logged.length} lines logged`);
t.ok(logged.every((line) => /^live: the look at the chain failed: (the chain did not answer|the chain is slow|the store did not answer|something went wrong)$/.test(line)), `every line logged is one of the fixed ones (${[...new Set(logged)].join(" | ")})`);
t.done(`${copies} fresh copies of the endpoints served over HTTP; lines logged: ${[...new Set(logged)].join(" | ")}`);
process.exit(process.exitCode ?? 0); // the real chain keeps asking its dead node for a while
