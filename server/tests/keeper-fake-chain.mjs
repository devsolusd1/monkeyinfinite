// A made-up chain with the interface of server/chain.js, for the keeper's tests and for the local server's
// --fake. Nothing here is real, nothing is read from Solana and nothing is sent anywhere.
//
//   createFakeChain({ seed, now, live, words, paced, chunk, delayMs, overlap })
//     now      the clock (the tests pass their own)
//     live     false: the token is not created until launch() is called
//     words    how many trades have already happened when it starts
//     paced    true: after those, a new trade lands every second or two by the clock (for --fake)
//     chunk    (limit) -> how many trades to hand over this time, to make uneven answers
//     delayMs  every call takes this long (real time), so that two callers can be caught together
//     overlap  true: hands the last trade over again at the head of every answer, as a careless chain would
//     doubles  one transaction in this many swaps twice: two trades with one signature, marked swap 1 and 2,
//              as server/chain.js hands them over
//     spy      async (name), called at the start of every call: for looking at the store while a sync is under way

import { createSim } from "../../site/core/sim.js";

const plain = ({ signature, blockhash, slot, wallet, side, sol }, time) => ({ signature, blockhash, slot, wallet, side, sol, time });

export function createFakeChain({ seed = "fake", now = Date.now, live = true, words = 0, paced = false, chunk = null, delayMs = 0, overlap = false, doubles = 0, spy = null } = {}) {
  const sim = createSim({ seed, startTime: 0 });
  const trades = []; // everything that has happened on this chain, in order
  let created = live, curveEnds = Infinity, failures = [], gate = null, inFlight = 0;
  const stats = { locate: 0, tradesSince: 0, together: 0, sizes: [] };

  // The trades that exist before anybody looks: the last of them a moment ago, the others before it at
  // the pace of the made-up market.
  const first = Array.from({ length: words }, () => sim.next());
  const shift = now() - 400 - (first.at(-1)?.time ?? 0); // made-up time 0 is this far from the clock's
  for (const t of first) trades.push(plain(t, t.time + shift));
  let ahead = paced ? sim.next() : null; // the next trade, not landed yet

  // How many trades have landed by now.
  function landed() {
    while (ahead && ahead.time + shift <= now()) { trades.push(plain(ahead, ahead.time + shift)); ahead = sim.next(); }
    return trades.length;
  }

  async function call(name) {
    stats[name]++;
    inFlight++;
    stats.together = Math.max(stats.together, inFlight);
    try {
      if (spy) await spy(name);
      if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
      if (gate) { const wait = gate; gate = null; await wait; }
      if (failures.length) throw new Error(failures.shift());
    } finally {
      inFlight--;
    }
  }

  return {
    // ---- the interface of server/chain.js ----
    async locate() {
      await call("locate");
      if (!created) return { live: false };
      const graduated = curveEnds !== Infinity;
      return { live: true, curve: { address: "FakeCurve1111111111111111111111111111111111" }, graduated, pool: graduated ? "FakePoo11111111111111111111111111111111111" : null };
    },
    async tradesSince(where, cursor, { limit = 100 } = {}) {
      await call("tradesSince");
      // A caller who has not heard of the graduation only gets the trades of the curve.
      const end = where?.graduated ? landed() : Math.min(landed(), curveEnds);
      const from = Math.min(cursor?.n ?? 0, end);
      const upto = Math.min(end, from + Math.max(0, Math.min(limit, chunk ? chunk(limit) : limit)));
      const out = trades.slice(from, upto);
      if (overlap && from > 0 && out.length) out.unshift(trades[from - 1]);
      stats.sizes.push(upto - from);
      return { trades: out, cursor: { n: upto, after: upto ? trades[upto - 1].signature : null }, more: upto < end };
    },

    // ---- for the tests ----
    trades,
    stats,
    launch() { created = true; },
    // n more trades, the last of them now and the others `every` ms apart before it.
    add(n, { every = 0 } = {}) {
      for (let i = 0; i < n; i++) {
        const t = plain(sim.next(), now() - (n - 1 - i) * every);
        if (doubles && i + 1 < n && (trades.length + 1) % doubles === 0) { trades.push({ ...t, swap: 1 }, { ...t, side: t.side === "buy" ? "sell" : "buy", swap: 2 }); i++; } else trades.push(t);
      }
      return trades.length;
    },
    // Everything so far happened on the curve; what comes after happens in the pool.
    graduate() { curveEnds = trades.length; },
    // The next calls fail with these words (one each).
    fail(...messages) { failures.push(...messages); },
    // The next call (only that one) waits until the returned function is called.
    hold() { let open; gate = new Promise((done) => { open = done; }); return open; },
  };
}
