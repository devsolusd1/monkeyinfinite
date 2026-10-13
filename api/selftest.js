// A one-off check that the store in the environment does what the keeper needs of it (the two
// scripts included), on scratch keys of its own. It says only which steps passed: no value, no address.

import { storeFromEnv } from "../server/store.js";

export default async function handler(req, res) {
  const steps = [];
  const say = (name, ok) => steps.push(`${ok ? "ok" : "FAILED"}: ${name}`);
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  try {
    const store = storeFromEnv();
    if (!store) { res.statusCode = 200; res.end(JSON.stringify({ store: false, node: !!process.env.RPC_URL?.trim() })); return; }
    const k = `selftest:${Date.now()}`;
    const token = await store.lock(`${k}:lock`, 5000);
    say("a lock is taken", !!token);
    say("a second taker is turned away", (await store.lock(`${k}:lock`, 5000)) === null);
    say("first write of the book and a page, together", (await store.swap(`${k}:book`, 0, { pages: 1 }, { [`${k}:page:1`]: { number: 1 } })) === true);
    say("a writer with an old version is refused", (await store.swap(`${k}:book`, 0, { pages: 99 })) === false);
    say("the next version is accepted", (await store.swap(`${k}:book`, 1, { pages: 2 }, { [`${k}:page:2`]: { number: 2 } })) === true);
    const [book, p1, p2, none] = await store.getMany([`${k}:book`, `${k}:page:1`, `${k}:page:2`, `${k}:nothing`]);
    say("what was written reads back", book?.pages === 2 && p1?.number === 1 && p2?.number === 2 && none === null);
    await store.set(`${k}:watch`, { at: 1 });
    say("a plain value reads back", (await store.get(`${k}:watch`))?.at === 1);
    await store.unlock(`${k}:lock`, token, 0);
    const again = await store.lock(`${k}:lock`, 1000);
    say("the lock opens for the next caller", !!again);
    await store.unlock(`${k}:lock`, again, 0);
    res.statusCode = 200;
    res.end(JSON.stringify({ store: true, node: !!process.env.RPC_URL?.trim(), steps }));
  } catch (err) {
    res.statusCode = 200;
    res.end(JSON.stringify({ store: true, steps, stopped: String(err?.message || "error").slice(0, 80) }));
  }
}
