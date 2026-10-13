// The two answers of the contract: live(have) for a browser at the tip, inside the page, on an older page,
// with nothing, and page(n); then a browser that only ever follows those answers must end up with the book.
// Usage: node server/tests/keeper-live.mjs

import { createBook, pageText, rebuildPage } from "../../site/core/book.js";
import { createKeeper } from "../keeper.js";
import { memoryStore } from "../store.js";
import { createFakeChain } from "./keeper-fake-chain.mjs";
import { catchUp, fakeClock, MINT, oneBook, seeded, tally } from "./keeper-kit.mjs";

const t = tally("live(have) and page(n)");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LIVE_KEYS = "live,mint,page,pages,reset,total,venue", PAGE_KEYS = "from,number,start,trades", RECORD_KEYS = "closing,firstSlot,lastSlot,number,start,trades";
const keysOf = (o) => Object.keys(o).sort().join(",");
let summary = "";

function setup({ words = 0, live = true } = {}) {
  const now = fakeClock();
  const store = memoryStore({ now });
  const chain = createFakeChain({ seed: "live", now, live });
  const keeper = createKeeper({ store, chain, mint: MINT, now });
  chain.add(words);
  return { now, store, chain, keeper };
}

// ---- before the token exists ----
{
  const { now, chain, keeper } = setup({ live: false });
  await keeper.sync();
  t.ok(eq(await keeper.live(0), { live: false, mint: MINT, reason: "not created yet" }), "before the token exists: not live, with the mint and a plain reason");
  t.ok((await keeper.page(1)) === null, "before the token exists there is no page 1");
  now.tick(1000);
  chain.launch();
  await keeper.sync();
  const a = await keeper.live(0);
  t.ok(a.live === true && a.total === 0 && a.pages === 0 && a.venue === "curve" && a.page.number === 1 && a.page.trades.length === 0 && a.reset === false, "created, no trade yet: live, an empty first page");
  now.tick(1000);
  chain.add(1); // the dev's first buy
  await keeper.sync();
  const b = await keeper.live(0);
  t.ok(b.total === 1 && b.page.trades.length === 1 && b.page.trades[0].signature === chain.trades[0].signature && b.page.from === 0 && b.reset === false, "trade number one is the first word of page 1");
}

// ---- two finished pages and sixty words of the third ----
{
  const { now, chain, keeper } = setup({ words: 360 });
  await catchUp(keeper, now);
  const tip = await keeper.live(360);
  t.ok(keysOf(tip) === LIVE_KEYS && keysOf(tip.page) === PAGE_KEYS, `a live answer has the contract's fields and no other (${keysOf(tip)})`);
  t.ok(tip.live && tip.mint === MINT && tip.venue === "curve" && tip.total === 360 && tip.pages === 2 && tip.page.number === 3 && tip.page.start.wordCount === 300, "totals: 360 words, 2 finished pages, writing page 3 from word 300");
  t.ok(tip.page.from === 60 && tip.page.trades.length === 0 && tip.reset === false, "at the tip (have 360): nothing new, from 60, no reset");

  const inside = await keeper.live(340);
  t.ok(inside.page.from === 40 && inside.reset === false && eq(inside.page.trades, chain.trades.slice(340, 360)), "inside the page (have 340): exactly the 20 trades after the browser's last word");
  const top = await keeper.live(300);
  t.ok(top.page.from === 0 && top.reset === false && eq(top.page.trades, chain.trades.slice(300, 360)), "at the top of the page (have 300): the whole page so far, no reset");
  for (const have of [299, 150, 1, 0]) {
    const old = await keeper.live(have);
    t.ok(old.reset === true && old.page.from === 0 && eq(old.page.trades, chain.trades.slice(300, 360)), `on an older page or with nothing (have ${have}): the whole page so far and reset`);
  }
  const beyond = await keeper.live(400);
  t.ok(beyond.reset === false && beyond.page.from === 100 && beyond.page.trades.length === 0, "ahead of the keeper (have 400): nothing, and no reset");
  for (const odd of [-5, 2.5, NaN, "12", null, undefined]) {
    const a = await keeper.live(odd);
    t.ok(a.reset === true && a.page.from === 0, `a have that is no count (${String(odd)}) is taken as nothing`);
  }
  for (const k of Object.keys(inside.page.trades[0])) t.ok(["signature", "blockhash", "slot", "wallet", "side", "sol", "time"].includes(k), `a trade has only the seven fields (${k})`);

  // The finished pages.
  const one = oneBook(chain.trades);
  for (const n of [1, 2]) {
    const record = await keeper.page(n);
    t.ok(record && keysOf(record) === RECORD_KEYS && record.trades.length === 150, `page ${n}: a record with the contract's fields and 150 trades`);
    t.ok(record && rebuildPage(record).text === one.pages[n - 1].text, `page ${n} reads as in one book`);
    t.ok(record && record.firstSlot === chain.trades[(n - 1) * 150].slot && record.lastSlot === chain.trades[n * 150 - 1].slot, `page ${n} has its first and last slot`);
  }
  for (const n of [3, 4, 0, -1, 1.5, NaN, "1"]) t.ok((await keeper.page(n)) === null, `page ${String(n)} is not a finished page`);
}

// ---- a page that is full but not turned yet, and the turn ----
{
  const { now, chain, keeper } = setup({ words: 150 });
  await catchUp(keeper, now);
  const full = await keeper.live(150);
  t.ok(full.total === 150 && full.pages === 0 && full.page.number === 1 && full.page.from === 150 && full.page.trades.length === 0, "150 words: page 1 is full but not finished (its last full stop may still come)");
  t.ok((await keeper.page(1)) === null, "a full page that has not been turned is not handed out as finished");
  chain.add(1);
  await catchUp(keeper, now);
  const turned = await keeper.live(150);
  t.ok(turned.pages === 1 && turned.page.number === 2 && turned.page.start.wordCount === 150 && turned.page.from === 0 && turned.reset === false && turned.page.trades.length === 1 && turned.page.trades[0].signature === chain.trades[150].signature, "the 151st trade turns the page: have 150 gets it as the first word of page 2, no reset");
  t.ok((await keeper.live(149)).reset === true, "one word short of the turn (have 149): reset");
  const record = await keeper.page(1);
  t.ok(record && rebuildPage(record).text === oneBook(chain.trades).pages[0].text, "page 1 is now finished and reads as in one book");
}

// ---- two instances: a browser whose words came from one asks the other, which looked a moment before ----
{
  const { now, store, chain, keeper } = setup({ words: 100 });
  const other = createKeeper({ store, chain, mint: MINT, now });
  await keeper.sync();
  now.tick(1000);
  t.ok((await other.live(0)).total === 100, "the second instance reads the store: 100 words");
  now.tick(100);
  chain.add(5);
  await keeper.sync();
  t.ok((await keeper.live(100)).page.trades.length === 5, "the first instance reads 5 more trades and hands them to a browser");
  now.tick(300);
  const a = await other.live(105);
  t.ok(a.total === 105 && a.page.from === 105 && a.page.trades.length === 0 && a.reset === false, `asked by that browser (have 105), the second instance reads the store again rather than say the book has ${a.total === 105 ? "fewer" : a.total} words`);
}

// ---- a transaction that swapped twice: two trades with one signature, two words ----
{
  const now = fakeClock();
  const chain = createFakeChain({ seed: "twice", now, doubles: 4 });
  const keeper = createKeeper({ store: memoryStore({ now }), chain, mint: MINT, now });
  chain.add(40);
  await catchUp(keeper, now);
  const a = await keeper.live(0);
  const pairs = a.page.trades.filter((x, i, all) => all[i + 1]?.signature === x.signature);
  t.ok(a.total === 40 && pairs.length >= 5 && pairs.every((x) => x.swap === 1), `both swaps of a transaction are kept (${pairs.length} such pairs among 40 trades), marked swap 1 and 2`);
  t.ok(a.page.trades.filter((x) => !("swap" in x)).every((x) => Object.keys(x).length === 7), "and every other trade has the seven fields only");
}

// ---- a browser that only follows the answers ----
// It keeps `have` and a book of its own; on reset it starts the page again from page.start. Trades come
// in rushes of up to several pages between its looks. What it shows must always be the true page.
{
  const { now, chain, keeper } = setup();
  const dice = seeded("browser");
  let have = 0, mine = null, looks = 0, resets = 0, fetched = 0;
  const one = createBook(); // one book of the chain, fed up to the browser's last word
  let fed = 0;
  for (let round = 0; round < 700; round++) {
    chain.add(dice(6) === 0 ? dice(500) : dice(9));
    await keeper.sync();
    now.tick(1000 + dice(1500));
    if (dice(3) === 0) continue; // the browser does not look every time
    const a = await keeper.live(have);
    looks++;
    if (!a.live) { t.ok(false, "the keeper stopped being live"); break; }
    if (a.reset || !mine) {
      if (a.reset) resets++;
      mine = createBook({ resume: { state: a.page.start.state, wordCount: a.page.start.wordCount, pageNumber: a.page.number } });
      have = a.page.start.wordCount;
    }
    if (a.page.from !== have - a.page.start.wordCount) { t.ok(false, `from is ${a.page.from} for have ${have}`); break; }
    for (const trade of a.page.trades) mine.push(trade);
    have += a.page.trades.length;
    // What the browser shows now, against one book of the chain up to the same word.
    while (fed < have) one.push(chain.trades[fed++]);
    if (mine.current.number !== one.current.number || pageText(mine.current.items) !== pageText(one.current.items)) { t.ok(false, `after ${have} words the browser's page differs from the book's`); break; }
    if (have !== a.total) { t.ok(false, `the browser has ${have} words, the keeper says ${a.total}`); break; }
    // Now and again it turns back to a finished page.
    if (a.pages && dice(4) === 0) {
      const n = 1 + dice(a.pages);
      const record = await keeper.page(n);
      fetched++;
      if (!record || rebuildPage(record).text !== one.pages[n - 1].text) { t.ok(false, `finished page ${n} differs`); break; }
    }
  }
  t.ok(looks > 300 && resets > 20, "a browser following the answers always showed the true page");
  summary = `a browser following only the answers: ${looks} looks, ${resets} resets, ${fetched} finished pages read back, ${have} words, always the true page`;
}

t.done(summary);
