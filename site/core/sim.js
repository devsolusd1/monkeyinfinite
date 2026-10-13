// Rehearsal trades. Nothing here is real: wallets, signatures, block hashes and amounts are made up
// from a seed so that the page can be built and looked at before a token exists. The live feed that
// replaces this file hands over trades of the same shape:
//   { signature, blockhash, slot, wallet, side: "buy" | "sell", sol, time }

import { sha256Text, toBase58 } from "./sha256.js";

export function createSim({ seed = "rehearsal", wallets = 64, sellShare = 0.3, startTime = Date.now() } = {}) {
  let n = 0, slot = 371_000_000, clock = startTime;
  const bytes = (label) => sha256Text(`${seed}|${label}|${n}`);
  const unit = (label) => { const b = bytes(label); return (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0) / 0x100000000; };

  const pool = Array.from({ length: wallets }, (_, i) => toBase58(sha256Text(`${seed}|wallet|${i}`)));
  // A few wallets trade often, most trade rarely.
  const pickWallet = () => pool[Math.min(pool.length - 1, Math.floor(pool.length * unit("who") ** 2.2))];

  let mood = 0.5; // drifts between quiet and busy, so trades come in bursts
  function next() {
    n++;
    mood = Math.min(1, Math.max(0, mood + (unit("mood") - 0.5) * 0.25));
    const gap = 250 + (-Math.log(1 - unit("gap") * 0.999)) * (2600 - 2100 * mood); // milliseconds until this trade
    clock += gap;
    slot += Math.max(1, Math.round(gap / 400));
    const sig = new Uint8Array(64);
    sig.set(bytes("sig-a"), 0);
    sig.set(bytes("sig-b"), 32);
    return {
      signature: toBase58(sig),
      blockhash: toBase58(sha256Text(`${seed}|block|${slot}`)),
      slot,
      wallet: pickWallet(),
      side: unit("side") < sellShare ? "sell" : "buy",
      sol: Math.round(Math.exp(unit("size") * 4.4 - 3) * 1000) / 1000, // about 0.05 to 4 SOL, mostly small
      time: Math.round(clock),
      gap: Math.round(gap),
      simulated: true,
    };
  }

  // run(onTrade, { speed }) plays trades at their own pace; returns a function that stops it.
  function run(onTrade, { speed = 1 } = {}) {
    let timer, stopped = false;
    const tick = () => {
      if (stopped) return;
      const t = next();
      timer = setTimeout(() => { if (!stopped) { onTrade(t); tick(); } }, t.gap / speed);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }

  return { next, run, wallets: pool };
}
