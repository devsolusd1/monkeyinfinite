// What the keeper's tests share: a clock that only moves when told, a seeded dice, the yes/no line, and
// the one comparison that matters: what is in the store against ONE book fed the same trades in one go.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createBook, firstPageStart, pageText, rebuildPage, WORDS_PER_PAGE } from "../../site/core/book.js";
import { sha256Text } from "../../site/core/sha256.js";
import { keysFor } from "../store.js";

export const MINT = "TestMint11111111111111111111111111111111111";

export function fakeClock(start = 1_760_000_000_000) {
  let t = start;
  const now = () => t;
  now.tick = (ms) => { t += ms; return t; };
  return now;
}

// dice(n) -> a whole number from 0 to n - 1, the same run after run for the same seed.
export function seeded(seed) {
  let i = 0;
  return (n) => { const d = sha256Text(`${seed}|${i++}`); return (((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0) % n; };
}

export function tally(title) {
  let passed = 0, failed = 0;
  return {
    ok(cond, what) {
      if (cond) { passed++; return true; }
      failed++;
      process.exitCode = 1;
      console.error(`  FAIL ${what}`);
      return false;
    },
    done(line = "") {
      console.log(`${failed ? "FAIL" : "ok  "} ${title}: ${passed} checks passed${failed ? `, ${failed} FAILED` : ""}${line ? `. ${line}` : ""}`);
    },
    get failed() { return failed; },
  };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// What tells one trade from any other: its signature, and which swap of the transaction when it made several.
export const nameOf = (t) => (t.swap ? `${t.signature}#${t.swap}` : t.signature);
const wordsOf = (items) => items.filter((i) => i.kind === "word");

// One book fed all the trades in one go: what the store has to agree with.
export function oneBook(trades) {
  const book = createBook();
  for (const t of trades) book.push(t);
  return book;
}

// Everything kept for `mint` against one continuous book of `trades`. Returns the list of what differs
// (empty: nothing does). Finished pages are compared as scripts/check.mjs does: rebuilt from their record
// alone, they must read the same, word for word, with the same numbers and the same digests.
// uncounted: true lets the record of the next page be there already (a step killed after writing it and
// before the book counted it); whether such a page is handed out is checked elsewhere.
export async function differences(store, mint, trades, { uncounted = false } = {}) {
  const keys = keysFor(mint), one = oneBook(trades), out = [];
  const book = await store.get(keys.book);
  if (!book) return trades.length ? ["there is no book in the store"] : [];
  if (book.total !== trades.length) out.push(`total is ${book.total}, the chain has ${trades.length}`);
  if (book.pages !== one.pages.length) out.push(`${book.pages} finished pages, one book has ${one.pages.length}`);

  const order = []; // every signature kept, in the order kept
  let start = firstPageStart();
  for (const p of one.pages) {
    const record = await store.get(keys.page(p.number));
    if (!record) { out.push(`page ${p.number} is not in the store`); start = { state: p.next.state, wordCount: p.next.wordCount }; continue; }
    order.push(...record.trades.map(nameOf));
    if (record.number !== p.number) out.push(`page ${p.number} is recorded as ${record.number}`);
    if (record.trades.length !== WORDS_PER_PAGE) out.push(`page ${p.number} has ${record.trades.length} trades`);
    if (!eq(record.start, start)) out.push(`page ${p.number} starts somewhere else`);
    if (!eq(record.closing, p.closing)) out.push(`page ${p.number} closes differently`);
    if (record.firstSlot !== p.firstSlot || record.lastSlot !== p.lastSlot) out.push(`page ${p.number} has other slots`);
    const again = rebuildPage(record);
    if (again.text !== p.text) out.push(`page ${p.number} reads differently`);
    const a = wordsOf(again.items), b = wordsOf(p.items);
    if (a.length !== b.length || a.some((w, i) => w.index !== b[i].index || w.digest !== b[i].digest || w.text !== b[i].text)) out.push(`page ${p.number}: its words are not the same words`);
    start = { state: p.next.state, wordCount: p.next.wordCount };
  }
  if (!uncounted && (await store.get(keys.page(one.pages.length + 1)))) out.push(`page ${one.pages.length + 1} is in the store but is not finished`);

  // The page being written.
  order.push(...book.page.trades.map(nameOf));
  if (book.page.number !== one.current.number) out.push(`writing page ${book.page.number}, one book is on ${one.current.number}`);
  if (!eq(book.page.start, start)) out.push("the page being written starts somewhere else");
  const open = rebuildPage({ number: book.page.number, start: book.page.start, trades: book.page.trades, closing: null });
  if (open.text !== pageText(one.current.items)) out.push("the page being written reads differently");

  // Nothing skipped, nothing twice, nothing out of place.
  const chain = trades.map(nameOf);
  if (!eq(order, chain)) {
    const at = order.findIndex((s, i) => s !== chain[i]);
    out.push(`the trades kept are not the chain's: ${order.length} kept, ${chain.length} on chain, first difference at ${at < 0 ? Math.min(order.length, chain.length) : at}`);
  }
  if (new Set(order).size !== order.length) out.push("a trade is kept twice");
  return out;
}

// Calls sync, moving the clock on a second each time, until the chain has nothing more. Returns how many
// calls it took.
export async function catchUp(keeper, now, { limit = 10_000, stepMs = 1000 } = {}) {
  for (let calls = 1; calls <= limit; calls++) {
    const r = await keeper.sync();
    now.tick(stepMs);
    if (r.ran && !r.more) return calls;
  }
  throw new Error("never caught up");
}

// A stand-in for Upstash's REST API on this machine: POST /pipeline with a Bearer token, a list of commands
// in, a list of { result } or { error } out, as Upstash answers. It knows the few commands the store uses.
// The store's two scripts are acted out in JavaScript here: it does not run Lua.
export async function upstashStandIn() {
  const TOKEN = "stand-in-token-" + randomBytes(6).toString("hex");
  const requests = []; // { method, path, auth, type, commands }
  const redis = new Map(); // key -> { value, until }
  const live = (key) => { const e = redis.get(key); if (e && e.until && e.until <= Date.now()) { redis.delete(key); return null; } return e ?? null; };
  function command([name, ...a]) {
    switch (String(name).toUpperCase()) {
      case "GET": return live(a[0])?.value ?? null;
      case "MGET": return a.map((key) => live(key)?.value ?? null);
      case "SET": {
        const flags = a.slice(2).map((x) => String(x).toUpperCase());
        if (flags.includes("NX") && live(a[0])) return null;
        const px = flags.indexOf("PX");
        redis.set(a[0], { value: String(a[1]), until: px >= 0 ? Date.now() + Number(a[2 + px + 1]) : 0 });
        return "OK";
      }
      case "DEL": return a.filter((key) => redis.delete(key)).length;
      case "EVAL": {
        const [script, count, ...rest] = a;
        const KEYS = rest.slice(0, Number(count)), ARGV = rest.slice(Number(count));
        if (script.includes("INCR")) { // the swap script, acted out
          if ((live(KEYS[0])?.value ?? "0") !== ARGV[0]) return 0;
          for (let i = 2; i < KEYS.length; i++) redis.set(KEYS[i], { value: ARGV[i], until: 0 });
          redis.set(KEYS[1], { value: ARGV[1], until: 0 });
          redis.set(KEYS[0], { value: String(Number(live(KEYS[0])?.value ?? "0") + 1), until: 0 });
          return 1;
        }
        if (script.includes("PEXPIRE")) { // the unlock script, acted out
          const e = live(KEYS[0]);
          if (!e || e.value !== ARGV[0]) return 0;
          if (Number(ARGV[1]) > 0) { e.until = Date.now() + Number(ARGV[1]); return 1; }
          redis.delete(KEYS[0]);
          return 1;
        }
        throw new Error("ERR unknown script");
      }
      default: throw new Error(`ERR unknown command '${name}'`);
    }
  }
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const auth = req.headers.authorization ?? "";
      let commands = null;
      try { commands = JSON.parse(body); } catch {}
      requests.push({ method: req.method, path: req.url, auth, type: req.headers["content-type"], commands });
      res.setHeader("content-type", "application/json");
      if (auth !== `Bearer ${TOKEN}`) { res.statusCode = 401; res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      if (req.url !== "/pipeline" || !Array.isArray(commands)) { res.statusCode = 400; res.end(JSON.stringify({ error: "ERR bad request" })); return; }
      res.end(JSON.stringify(commands.map((c) => { try { return { result: command(c) }; } catch (err) { return { error: err.message }; } })));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${server.address().port}`, token: TOKEN, requests, close: () => server.close() };
}
