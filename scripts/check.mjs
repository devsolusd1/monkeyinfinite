// One pass over the engine: the hash matches Node's, every trade writes exactly one word, the grammar
// never gets stuck, "a" and "an" agree with what follows, and a page fits in a memo.
// Usage: node infinite-monkey/scripts/check.mjs [path to another lexicon module]

import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { sha256, toHex } from "../site/core/sha256.js";
import { startsWithVowelSound } from "../site/core/grammar.js";
import { createBook, pageText } from "../site/core/book.js";
import { createSim } from "../site/core/sim.js";

let lexicon;
if (process.argv[2]) lexicon = (await import(pathToFileURL(process.argv[2]).href)).LEX;

const fail = (msg) => { console.error("FAIL", msg); process.exitCode = 1; };

for (let i = 0; i < 300; i++) {
  const b = randomBytes(i * 7 % 300);
  if (toHex(sha256(b)) !== createHash("sha256").update(b).digest("hex")) { fail(`sha256 differs at length ${b.length}`); break; }
}

if (lexicon) {
  const seen = new Map();
  for (const [type, list] of Object.entries(lexicon)) {
    if (!Array.isArray(list) || !list.length) fail(`${type} is empty`);
    if (new Set(list).size !== list.length) fail(`${type} has repeated words`);
    for (const w of list) if (!/^[A-Za-z' -]+$/.test(w)) fail(`${type} has an odd entry: ${JSON.stringify(w)}`);
    seen.set(type, list.length);
  }
  console.log("lexicon:", [...seen].map(([t, n]) => `${t} ${n}`).join(", "));
}

const book = createBook({ lexicon });
const sim = createSim({ seed: "check" });
const TRADES = 60_000;
let sentences = 0, longest = 0, run = 0, questions = 0;
for (let i = 0; i < TRADES; i++) {
  const events = book.push(sim.next());
  const words = events.filter((e) => e.kind === "word");
  if (words.length !== 1) { fail(`trade ${i} wrote ${words.length} words`); break; }
  if (events[events.length - 1].kind !== "word") { fail(`trade ${i}: the word is not the last event`); break; }
  for (const e of events) {
    if (e.kind === "punct") { sentences++; longest = Math.max(longest, run); run = 0; if (e.mark === "?") questions++; }
    if (e.kind === "word") run++;
  }
}
if (book.wordCount !== TRADES) fail(`wrote ${book.wordCount} words for ${TRADES} trades`);

let maxBytes = 0, badArticle = 0;
for (const p of book.pages) {
  maxBytes = Math.max(maxBytes, p.memo.bytes);
  if (p.words !== book.wordsPerPage) fail(`page ${p.number} has ${p.words} words`);
  const ws = p.items.filter((i) => i.kind === "word");
  ws.forEach((w, i) => {
    const nx = ws[i + 1];
    if (!nx) return;
    if ((w.word === "a" && startsWithVowelSound(nx.word)) || (w.word === "an" && !startsWithVowelSound(nx.word))) badArticle++;
  });
  if (/ ,|,,|  |[.?!] [a-z]|[.?!]\n\n[a-z]/.test(p.text)) fail(`page ${p.number} has odd spacing or a lower-case sentence start`);
}
if (badArticle) fail(`${badArticle} wrong a/an`);
if (maxBytes > 985) fail(`a page memo reached ${maxBytes} bytes (limit used: 985)`);

console.log(`trades ${TRADES}, pages ${book.pages.length}, sentences ${sentences} (${questions} questions), longest sentence ${longest} words, largest memo ${maxBytes} bytes`);
console.log("\n" + pageText(book.pages[3].items));
if (!process.exitCode) console.log("\nOK");
