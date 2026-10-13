// A tiny key-value store for the keeper: Upstash Redis over REST in production, memory on this machine.
// Values are anything JSON can hold. Both makers give the same six things:
//
//   get(key) -> value | null
//   getMany(keys) -> [value | null, ...]      read together, as they stood at one moment
//   set(key, value)
//   swap(key, version, value, others = {}) -> true | false
//       Replaces the value under `key` only if it is still at `version` (0: never written), and moves the
//       version on by one. `others` ({ key: value }) are written with it, before it. false: somebody else
//       wrote in between, and nothing at all was written.
//   lock(key, ms) -> token | null             null while somebody holds it; it lets go by itself after ms
//   unlock(key, token, keepMs = 0)            only if it is still ours; keepMs leaves it shut that much longer
//
// No error from here carries an address or a token: the messages are the fixed ones below.

import { randomUUID } from "node:crypto";

export class StoreError extends Error {}

// Everything kept for one token sits under its own name. The braces keep one token's keys together
// on a Redis that spreads keys over several machines.
export function keysFor(mint) {
  const p = `monkey:{${mint}}:`;
  return { book: `${p}book`, watch: `${p}watch`, lock: `${p}lock`, page: (n) => `${p}page:${n}` };
}

const versionKey = (key) => `${key}:v`;

// ---- memory ----
// `before(kind, key)` is called before every single write ("lock", "unlock", "set", "other", "swap"): the
// tests throw from it to kill the keeper between two writes. swap writes its `others` one at a time on
// purpose, as a store that could be cut off halfway would.
export function memoryStore({ now = Date.now, before = () => {} } = {}) {
  const values = new Map(); // key -> JSON text, so that nothing is shared with the caller
  const versions = new Map();
  const locks = new Map(); // key -> { token, until }
  let made = 0;
  const read = (key) => (values.has(key) ? JSON.parse(values.get(key)) : null);
  const held = (key) => { const l = locks.get(key); return l && l.until > now() ? l : null; };
  return {
    async get(key) { return read(key); },
    async getMany(keys) { return keys.map(read); },
    async set(key, value) { before("set", key); values.set(key, JSON.stringify(value)); },
    async swap(key, version, value, others = {}) {
      if ((versions.get(key) ?? 0) !== version) return false;
      for (const [k, v] of Object.entries(others)) { before("other", k); values.set(k, JSON.stringify(v)); }
      before("swap", key);
      values.set(key, JSON.stringify(value));
      versions.set(key, version + 1);
      return true;
    },
    async lock(key, ms) {
      if (held(key)) return null;
      before("lock", key);
      const token = `memory-${++made}`;
      locks.set(key, { token, until: now() + ms });
      return token;
    },
    async unlock(key, token, keepMs = 0) {
      const l = held(key);
      if (!l || l.token !== token) return;
      before("unlock", key);
      if (keepMs > 0) l.until = now() + keepMs; else locks.delete(key);
    },
    // For looking inside from a test.
    keys: () => [...values.keys()],
  };
}

// ---- Upstash Redis, over its REST API ----
// Both scripts run inside Redis in one go, so nothing can come between their steps.
// KEYS: the version, the value, then the others. ARGV: the version expected, the value, then the others.
const SWAP = `
if (redis.call('GET', KEYS[1]) or '0') ~= ARGV[1] then return 0 end
for i = 3, #KEYS do redis.call('SET', KEYS[i], ARGV[i]) end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('INCR', KEYS[1])
return 1`;
// KEYS: the lock. ARGV: our token, how long to keep it shut (0: open it now).
const UNLOCK = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if tonumber(ARGV[2]) > 0 then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return redis.call('DEL', KEYS[1])`;

export function upstashStore({ url, token, fetch = globalThis.fetch, timeoutMs = 2500 }) {
  const address = `${String(url).trim().replace(/\/+$/, "")}/pipeline`;
  const headers = { authorization: `Bearer ${String(token).trim()}`, "content-type": "application/json" };

  // One request, the commands in order; the answers in the same order.
  async function run(commands) {
    let res;
    try {
      res = await fetch(address, { method: "POST", headers, body: JSON.stringify(commands), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new StoreError("the store did not answer");
    }
    if (!res.ok) throw new StoreError(`the store answered ${res.status}`);
    const answers = await res.json().catch(() => null);
    if (!Array.isArray(answers) || answers.length !== commands.length) throw new StoreError("the store answered something else");
    return answers.map((a) => {
      if (!a || "error" in a) throw new StoreError("the store refused a command");
      return a.result;
    });
  }
  const parse = (text) => {
    if (text == null) return null;
    try { return JSON.parse(text); } catch { throw new StoreError("the store holds something that is not ours"); }
  };

  return {
    async get(key) { return parse((await run([["GET", key]]))[0]); },
    async getMany(keys) { return keys.length ? (await run([["MGET", ...keys]]))[0].map(parse) : []; },
    async set(key, value) { await run([["SET", key, JSON.stringify(value)]]); },
    async swap(key, version, value, others = {}) {
      const more = Object.entries(others);
      const keys = [versionKey(key), key, ...more.map(([k]) => k)];
      const args = [String(version), JSON.stringify(value), ...more.map(([, v]) => JSON.stringify(v))];
      return (await run([["EVAL", SWAP, String(keys.length), ...keys, ...args]]))[0] === 1;
    },
    async lock(key, ms) {
      const token = randomUUID();
      return (await run([["SET", key, token, "NX", "PX", String(Math.ceil(ms))]]))[0] === "OK" ? token : null;
    },
    async unlock(key, token, keepMs = 0) { await run([["EVAL", UNLOCK, "1", key, token, String(Math.max(0, Math.ceil(keepMs)))]]); },
  };
}

// The Upstash store when the environment names one, else null. Vercel's own integration calls the pair
// KV_REST_API_*, Upstash's calls it UPSTASH_REDIS_REST_*.
export function storeFromEnv(env = process.env) {
  for (const [u, t] of [["KV_REST_API_URL", "KV_REST_API_TOKEN"], ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]]) {
    const url = env[u]?.trim(), token = env[t]?.trim();
    if (url && token) return upstashStore({ url, token });
  }
  return null;
}
