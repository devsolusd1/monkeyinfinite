// Serves infinite-monkey/site as it is: no build step. Usage: node infinite-monkey/scripts/site.mjs [--port 4500]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../site", import.meta.url)));
const at = process.argv.indexOf("--port");
const port = at > 0 ? Number(process.argv[at + 1]) : 4500;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
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
    res.writeHead(500, { "content-type": "text/plain" }).end(String(err));
  }
}).listen(port, () => console.log(`infinite monkey site on http://localhost:${port}`));
