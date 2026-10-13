// The store: the same checks on the memory store, on the Upstash store talking to a stand-in for Upstash's
// REST API on this machine, and, when the environment names a real Upstash database, on that one too.
// The stand-in checks what goes over the wire (the address, the token, the commands and their order) and
// answers as Redis would; the two small scripts are acted out in JavaScript there, so only the real
// database proves the scripts themselves. Usage: node server/tests/keeper-store.mjs

import { randomBytes } from "node:crypto";
import { keysFor, memoryStore, storeFromEnv, StoreError, upstashStore } from "../store.js";
import { tally, upstashStandIn } from "./keeper-kit.mjs";

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// The checks every store has to pass. `pass(ms)` lets that much time go by.
async function checks(t, store, label, pass, mint) {
  const k = keysFor(mint);
  const odd = { text: "naïve — “quoted” 🐒\n\ttab", n: -0.5, list: [1, null, { deep: true }], none: null };
  t.ok((await store.get(k.book)) === null, `${label}: a key never written reads as null`);
  await store.set(k.watch, odd);
  t.ok(eq(await store.get(k.watch), odd), `${label}: what is set is read back the same`);
  t.ok(eq(await store.getMany([k.book, k.watch, k.page(1)]), [null, odd, null]), `${label}: getMany answers in order, null for what is not there`);

  // swap: only from the version it was read at
  t.ok((await store.swap(k.book, 0, { v: 1, words: 3 }, { [k.page(1)]: { number: 1 }, [k.page(2)]: { number: 2 } })) === true, `${label}: the first swap, from version 0, goes through`);
  t.ok(eq(await store.getMany([k.book, k.page(1), k.page(2)]), [{ v: 1, words: 3 }, { number: 1 }, { number: 2 }]), `${label}: it wrote the value and the others`);
  t.ok((await store.swap(k.book, 0, { v: 1, words: 99 }, { [k.page(1)]: { number: "wrong" }, [k.page(3)]: { number: 3 } })) === false, `${label}: a second swap from version 0 is refused`);
  t.ok(eq(await store.getMany([k.book, k.page(1), k.page(3)]), [{ v: 1, words: 3 }, { number: 1 }, null]), `${label}: and a refused swap writes nothing at all, not even the others`);
  t.ok((await store.swap(k.book, 1, { v: 2, words: 4 })) === true && (await store.swap(k.book, 1, { v: 2, words: 5 })) === false && (await store.swap(k.book, 2, { v: 3, words: 6 })) === true, `${label}: each swap moves the version on by one`);
  t.ok(eq(await store.get(k.book), { v: 3, words: 6 }), `${label}: the last accepted value is the one kept`);
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => store.swap(k.book, 3, { v: 4, by: i })));
  t.ok(racers.filter(Boolean).length === 1, `${label}: of six swaps from the same version at once, one goes through (${racers.filter(Boolean).length})`);

  // lock
  const mine = await store.lock(k.lock, 400);
  t.ok(typeof mine === "string" && mine.length > 0, `${label}: a free lock is given, with a token`);
  t.ok((await store.lock(k.lock, 400)) === null, `${label}: a held lock is not given again`);
  await store.unlock(k.lock, "not-the-token", 0);
  t.ok((await store.lock(k.lock, 400)) === null, `${label}: somebody else's token does not open it`);
  await store.unlock(k.lock, mine, 0);
  const second = await store.lock(k.lock, 400);
  t.ok(typeof second === "string" && second !== mine, `${label}: given back, it can be taken again`);
  await store.unlock(k.lock, second, 150);
  t.ok((await store.lock(k.lock, 400)) === null, `${label}: given back but kept shut for 150 ms, it is still shut`);
  await pass(250);
  const third = await store.lock(k.lock, 120);
  t.ok(typeof third === "string", `${label}: and open after them`);
  await pass(220);
  const fourth = await store.lock(k.lock, 400);
  t.ok(typeof fourth === "string", `${label}: a lock never given back lets go by itself after its time`);
  await store.unlock(k.lock, third, 0); // the old holder, late
  t.ok((await store.lock(k.lock, 400)) === null, `${label}: a holder whose time ran out cannot open the next holder's lock`);
  await store.unlock(k.lock, fourth, 0);
  const many = await Promise.all(Array.from({ length: 6 }, () => store.lock(k.lock, 400)));
  t.ok(many.filter(Boolean).length === 1, `${label}: of six callers at once, one gets the lock (${many.filter(Boolean).length})`);
  await store.unlock(k.lock, many.find(Boolean), 0);
}

const t = tally("the store");

// ---- memory ----
{
  let clock = 1000;
  await checks(t, memoryStore({ now: () => clock }), "memory", async (ms) => { clock += ms; }, "memory-mint");
}

// ---- a stand-in for Upstash's REST API (in keeper-kit.mjs) ----
const { url, token: TOKEN, requests, close } = await upstashStandIn();

{
  const store = upstashStore({ url: url + "/", token: TOKEN });
  await checks(t, store, "upstash client", wait, "standin-mint");

  // What went over the wire.
  t.ok(requests.length > 30 && requests.every((r) => r.method === "POST" && r.path === "/pipeline" && r.auth === `Bearer ${TOKEN}` && r.type === "application/json"), `upstash client: every one of ${requests.length} requests is a POST to /pipeline with the token as a Bearer`);
  t.ok(requests.every((r) => Array.isArray(r.commands) && r.commands.every((c) => Array.isArray(c) && c.every((x) => typeof x === "string"))), "upstash client: every body is a list of commands, every part of a command a string");
  const k = keysFor("wire");
  requests.length = 0;
  const token = await store.lock(k.lock, 10_000);
  await store.unlock(k.lock, token, 730.4);
  await store.swap(k.book, 7, { v: 8 }, { [k.page(4)]: { number: 4 }, [k.page(5)]: { number: 5 } });
  await store.getMany([k.book, k.watch]);
  const [lock, unlock, swap, mget] = requests.map((r) => r.commands[0]);
  t.ok(eq(lock, ["SET", k.lock, token, "NX", "PX", "10000"]), "upstash client: the lock is SET key token NX PX ms");
  t.ok(unlock[0] === "EVAL" && eq(unlock.slice(2), ["1", k.lock, token, "731"]), "upstash client: the unlock is one script with the lock, our token and the time to stay shut");
  t.ok(swap[0] === "EVAL" && eq(swap.slice(2), ["4", `${k.book}:v`, k.book, k.page(4), k.page(5), "7", '{"v":8}', '{"number":4}', '{"number":5}']), "upstash client: the swap is one script: the version, the value and the others as keys, then the version expected and the values, in the same order");
  t.ok(eq(mget, ["MGET", k.book, k.watch]), "upstash client: getMany is one MGET");
  t.ok(k.book.includes("{wire}") && k.lock.includes("{wire}") && k.page(4).includes("{wire}"), "every key of a token carries its mint in braces");

  // Failures say nothing of the address or the token.
  const secretUrl = "http://127.0.0.1:9/SECRET-PATH", secretToken = "SECRET-TOKEN";
  const said = async (make) => { try { await make(); return "no error"; } catch (err) { return err instanceof StoreError ? err.message : `not a StoreError: ${err.message}`; } };
  const down = await said(() => upstashStore({ url: secretUrl, token: secretToken, timeoutMs: 800 }).get("x"));
  t.ok(down === "the store did not answer", `a store that cannot be reached: "${down}"`);
  const refused = await said(() => upstashStore({ url, token: secretToken }).get("x"));
  t.ok(refused === "the store answered 401", `a wrong token: "${refused}"`);
  const badCommand = await said(() => upstashStore({ url, token: TOKEN, fetch: (a, init) => fetch(a, { ...init, body: JSON.stringify([["NOPE"]]) }) }).get("x"));
  t.ok(badCommand === "the store refused a command", `a command Redis refuses: "${badCommand}"`);
  const slow = await said(() => upstashStore({ url, token: TOKEN, timeoutMs: 60, fetch: (a, init) => new Promise((_, no) => init.signal.addEventListener("abort", () => no(init.signal.reason))) }).get("x"));
  t.ok(slow === "the store did not answer", `a store that takes too long: "${slow}"`);
  t.ok(![down, refused, badCommand, slow].some((m) => /SECRET|127\.0\.0\.1|stand-in-token/.test(m)), "none of these messages holds the address or the token");
}
close();

// ---- which store the environment names ----
{
  const none = storeFromEnv({});
  const half = storeFromEnv({ KV_REST_API_URL: "https://x.example" });
  const crossed = storeFromEnv({ KV_REST_API_URL: "https://x.example", UPSTASH_REDIS_REST_TOKEN: "t" });
  const blank = storeFromEnv({ KV_REST_API_URL: "  ", KV_REST_API_TOKEN: "t" });
  const kv = storeFromEnv({ KV_REST_API_URL: "https://x.example", KV_REST_API_TOKEN: "t" });
  const up = storeFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.example", UPSTASH_REDIS_REST_TOKEN: "t" });
  t.ok(none === null && half === null && crossed === null && blank === null, "no store without a full pair: nothing, an address alone, an address of one pair with the token of the other, a blank");
  t.ok(kv && typeof kv.swap === "function" && up && typeof up.swap === "function", "a store for either pair: KV_REST_API_* or UPSTASH_REDIS_REST_*");
}

// ---- the real one, when the environment names it ----
let real = "no Upstash database in the environment: the two scripts have not run inside a real Redis";
{
  const store = storeFromEnv();
  if (store) {
    const mint = `selftest-${randomBytes(6).toString("hex")}`;
    const before = t.failed;
    try {
      await checks(t, store, "real upstash", wait, mint);
      real = t.failed === before ? "the real Upstash database passed the same checks, scripts included" : "the real Upstash database FAILED some checks";
    } catch (err) {
      t.ok(false, `real upstash: ${err instanceof StoreError ? err.message : "something went wrong"}`);
      real = "the real Upstash database could not be checked";
    }
    // The test's own keys are overwritten with a marker that goes away by itself in a minute.
    const k = keysFor(mint);
    const address = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL).trim().replace(/\/+$/, "");
    const bearer = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN).trim();
    await fetch(`${address}/pipeline`, {
      method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify([k.book, `${k.book}:v`, k.watch, k.lock, k.page(1), k.page(2), k.page(3)].map((key) => ["SET", key, "done", "PX", "60000"])),
    }).catch(() => {});
  }
}

t.done(real);
