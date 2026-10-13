// Where trades come from. This is the ONLY file that knows the trades are made up.
//
// Today it plays the rehearsal from core/sim.js. To go live, keep the same three things and
// replace their insides with the real feed; every trade must have this shape:
//   { signature, blockhash, slot, wallet, side: "buy" | "sell", sol, time }

import { createSim } from "../core/sim.js";

export function createFeed({ seed = "rehearsal" } = {}) {
  const sim = createSim({ seed });
  // For watching a rush: open the page with ?speed=20 and the made-up trades come twenty times as fast.
  const speed = Math.min(200, Math.max(0.1, Number(new URLSearchParams(location.search).get("speed")) || 1));
  return {
    // True while nothing here is real. The page shows its "Rehearsal" line and its "made-up" tags from this.
    rehearsal: true,
    // One trade from the past, for filling the book before the visitor arrives.
    earlier: () => sim.next(),
    // Trades from now on, at their own pace. Returns a function that stops them.
    listen: (onTrade) => sim.run(onTrade, { speed }),
  };
}
