// Serves infinite-monkey/site as it is: no build step. It also answers /api/live and /api/page by calling
// the very same handlers Vercel runs (api/live.js and api/page.js).
// Usage: node scripts/site.mjs [--port 4500] [--fake [--words 60] [--launch-in 20]] [--mint <address>]
//
//   no option          the endpoints answer from the environment, as on Vercel: "not set up yet" unless
//                      RPC_URL and an Upstash pair are set (then: the real chain and the real store)
//   --fake             made-up trades through the real keeper, kept in memory: the front end in live mode
//                      with no chain at all. A trade every second or two, and a first page already under way.
//       --words <n>      how many made-up trades have already happened (60; try 400 to start on page 3)
//       --launch-in <s>  the made-up token is only created after s seconds ("not created yet" until then)
//   --mint <address>   the real chain for that token (any token of a Meteora DBC curve), kept in memory.
//                      The node is RPC_URL from the environment or else from launch/.env; it is never
//                      printed. With neither, the public node, slowly. Nothing is ever sent to the chain.
//                      The page is handed a config.js with that address in it (the file is not touched),
//                      so the whole site can be tried on a token that already trades.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import live from "../api/live.js";
import page from "../api/page.js";
import { createKeeper, useKeeper } from "../server/keeper.js";
import { memoryStore, storeFromEnv } from "../server/store.js";
import { CONFIG } from "../site/config.js";

const root = resolve(fileURLToPath(new URL("../site", import.meta.url)));
const has = (name) => process.argv.includes(`--${name}`);
const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at > 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith("--") ? process.argv[at + 1] : fallback; };
const port = Number(arg("port", 4500));

// The node's address, without ever showing it: the environment first, then the RPC_URL line of launch/.env.
async function nodeAddress() {
  if (process.env.RPC_URL?.trim()) return process.env.RPC_URL.trim();
  try {
    const text = await readFile(new URL("../launch/.env", import.meta.url), "utf8");
    const line = /^\s*(?:export\s+)?RPC_URL\s*=\s*(.*?)\s*$/m.exec(text);
    return line ? line[1].replace(/^(["'])(.*)\1$/, "$2") || null : null;
  } catch {
    return null;
  }
}

// Which book the two endpoints answer from.
let api = "";
const mint = arg("mint", CONFIG.mint);
if (has("fake")) {
  const { createFakeChain } = await import("../server/tests/keeper-fake-chain.mjs");
  const wait = Number(arg("launch-in", 0));
  const chain = createFakeChain({ seed: `fake-${Date.now()}`, paced: true, words: Number(arg("words", 60)), live: !(wait > 0) });
  if (wait > 0) setTimeout(() => chain.launch(), wait * 1000);
  useKeeper(createKeeper({ store: memoryStore(), chain, mint }));
  api = `made-up trades${wait > 0 ? `, the token created in ${wait} s` : ""}; nothing is read from Solana`;
} else if (arg("mint", null)) {
  const { createChain } = await import("../server/chain.js");
  const rpcUrl = await nodeAddress();
  const chain = rpcUrl ? createChain({ rpcUrl }) : createChain({ rpcUrl: "https://api.mainnet-beta.solana.com", perSecond: 3, batch: 5 });
  useKeeper(createKeeper({ store: memoryStore(), chain, mint }));
  api = `the real trades of ${mint}, kept in memory, read from ${rpcUrl ? "the node of RPC_URL" : "the public node (slowly)"}`;
} else {
  api = storeFromEnv() && process.env.RPC_URL?.trim() ? "from the environment: the real chain and the real store" : "not set up (no RPC_URL and Upstash pair in the environment): the site stays in rehearsal";
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8",
};
const ENDPOINTS = { "/api/live": live, "/api/page": page };

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const endpoint = ENDPOINTS[path.replace(/\/$/, "")];
    if (endpoint) { await endpoint(req, res); return; }
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
    // With --mint the page is told the address of the token whose book is kept here.
    if (mint !== CONFIG.mint && path === "/config.js") { res.end((await readFile(file, "utf8")).split(CONFIG.mint).join(mint)); return; }
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" }).end("error");
  }
}).listen(port, () => console.log(`infinite monkey site on http://localhost:${port}\n/api/live and /api/page: ${api}`));
