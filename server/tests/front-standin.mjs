// A stand-in for the backend, for looking at the front end in live mode before the real one exists
// and without a token: it serves site/ as it is and answers /api/live and /api/page to the letter of
// the contract, from made-up trades that pretend to be real. It reads no chain and sends nothing.
// Usage: node server/tests/front-standin.mjs [--port 4610] [--start live|notlive|none] [--words 147] [--rate 1]
//
// While it runs, GET /__standin?... changes what it does (several at once is fine):
//   state=live | notlive | catching | none | down
//                                          live; "not created yet"; "catching up"; no API at all (404); every call fails (503)
//   rate=<trades a second>                 0 stops the trades
//   add=<n>                                n trades at once (a rush, or a jump of pages)
//   words=<n>                              start the book again with n words in it
//   slow=<ms>                              every API answer waits this long
//   slash=1 | 0                            as the public host does today: /api/live is sent on (308) to /api/live/
// It answers with where it stands.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createBook, firstPageStart, WORDS_PER_PAGE } from "../../site/core/book.js";
import { createSim } from "../../site/core/sim.js";

const root = resolve(fileURLToPath(new URL("../../site", import.meta.url)));
const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : fallback; };
const port = Number(arg("port", 4610));
const MINT = "7KDjZMEGHuihekvH6vQBjgwRFeMVW7bjoArUtTJmonk";

// ---- the made-up chain, and the book kept from it the way the keeper will keep it ----
let state = arg("start", "live"), rate = Number(arg("rate", 1)), slow = 0, slash = false;
let sim, book, records, page, total, clock = null;

// A trade as the real backend hands it over: the seven fields and nothing that says it is made up.
const plain = ({ signature, blockhash, slot, wallet, side, sol, time }) => ({ signature, blockhash, slot, wallet, side, sol, time });

function add() {
  const trade = plain(sim.next());
  for (const e of book.push(trade)) {
    if (e.kind !== "page") continue;
    records.set(e.number, { number: e.number, start: page.start, trades: page.trades, closing: e.closing, firstSlot: e.firstSlot, lastSlot: e.lastSlot });
    page = { number: e.number + 1, start: { state: e.next.state, wordCount: e.next.wordCount }, trades: [] };
  }
  page.trades.push(trade);
  total++;
}

function begin(words) {
  sim = createSim({ seed: `standin-${Date.now()}` });
  book = createBook();
  records = new Map();
  page = { number: 1, start: firstPageStart(), trades: [] };
  total = 0;
  for (let i = 0; i < words; i++) add();
}

function pace() {
  clearTimeout(clock);
  if (!(rate > 0)) return;
  clock = setTimeout(() => { if (state === "live") add(); pace(); }, (1000 / rate) * (0.4 + Math.random() * 1.2));
}

begin(Number(arg("words", 1 + 2 * WORDS_PER_PAGE + 60)));
pace();

// ---- the two addresses of the contract ----
function live(have) {
  if (state !== "live") return { live: false, mint: MINT, reason: state === "catching" ? "catching up" : "not created yet" };
  const ahead = have >= page.start.wordCount;
  const from = ahead ? have - page.start.wordCount : 0;
  return {
    live: true, mint: MINT, venue: total > 400 ? "pool" : "curve", total, pages: records.size,
    page: { number: page.number, start: page.start, from, trades: page.trades.slice(from) },
    reset: !ahead,
  };
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
};
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const json = (res, code, body, headers = {}) => res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...headers }).end(JSON.stringify(body));

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");

    if (url.pathname === "/__standin") {
      const q = url.searchParams;
      if (q.has("state")) state = q.get("state");
      if (q.has("slow")) slow = Number(q.get("slow")) || 0;
      if (q.has("slash")) slash = q.get("slash") === "1";
      if (q.has("words")) begin(Number(q.get("words")) || 0);
      if (q.has("add")) for (let i = 0; i < Number(q.get("add")); i++) add();
      if (q.has("rate")) { rate = Number(q.get("rate")) || 0; pace(); }
      json(res, 200, { state, rate, slow, slash, total, page: page.number, inPage: page.trades.length, finished: records.size }, { "cache-control": "no-store" });
      return;
    }

    let path = decodeURIComponent(url.pathname);
    if (slash && (path === "/api/live" || path === "/api/page")) {
      res.writeHead(308, { location: `${path}/${url.search}`, "cache-control": "public, max-age=0, must-revalidate" }).end();
      return;
    }
    if (slash && (path === "/api/live/" || path === "/api/page/")) path = path.slice(0, -1);

    if (path === "/api/live" || path === "/api/page") {
      if (slow) await wait(slow);
      if (state === "none") { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
      if (state === "down") { json(res, 503, { error: "down" }); return; }
      if (path === "/api/live") {
        json(res, 200, live(Math.max(0, Math.floor(Number(url.searchParams.get("have")) || 0))), { "cache-control": "public, s-maxage=1, stale-while-revalidate=1" });
        return;
      }
      const record = state === "live" ? records.get(Number(url.searchParams.get("n"))) : null;
      if (!record) { json(res, 404, { error: "no such finished page" }); return; }
      json(res, 200, record, { "cache-control": "public, max-age=3600, s-maxage=31536000, immutable" });
      return;
    }

    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end("no"); return; }
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      if (!path.endsWith("/")) { res.writeHead(302, { location: path + "/" }).end(); return; }
      file = join(file, "index.html");
      info = await stat(file).catch(() => null);
    }
    if (!info) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" }).end("error");
  }
}).listen(port, () => console.log(`front stand-in on http://localhost:${port} (state ${state}, ${total} words)`));
