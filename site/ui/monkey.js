// The monkey on the page. He is the cursor: the lines of text are his platforms, he stands at the
// end of the one being written, and this module walks him, jumps him and keeps him alive between
// trades. What he LOOKS like is the sprite's business (see the sprite contract); this file only
// says where his feet are and which pose is on.

import { clamp, lerp, wait, artPixel } from "./util.js";

// Art pixels from the spot of the next letter to the middle of his feet. His heel is 4 pixels
// left of that middle and his halo is 1: at 5 he stands right after the last letter and hides
// none of the line he is writing. (His fist then lands a little ahead of the letter it puts down.)
const LEAD = 5;
// Between words he takes a step more, so that not even his tail hangs over the last letter,
// whether he stands, sits or lies down to sleep (his frame is 12 pixels to each side, plus the halo).
const REST = 13;
const OVERHANG = 5; // art pixels of his frame that may stick out past the edge of the page
const HALF = 12; // half his frame, in art pixels

// What he does while nobody trades, by how long it has been quiet (milliseconds).
const SIT_AFTER = 2600;
const SLEEP_AFTER = 26000;
const ROUND = [[3200, "sit"], [7600, "eat"], [10000, "sit"], [11200, "think"], [14000, "idle"]];

export function createMonkey(root, sprite, { still, pageWidth, onJump }) {
  const body = root.querySelector(".monkey-body");
  const says = root.querySelector(".monkey-says");
  body.append(sprite.el);
  if (sprite.el2) { sprite.el2.classList.add("monkey-extra"); body.append(sprite.el2); }

  let px = artPixel();
  const pos = { x: 0, y: 0 }; // the middle of his feet, measured from the page
  const goal = { x: 0, y: 0 };
  let leap = null; // a jump in progress
  let pace = 0; // a run at a steady speed (pixels a millisecond), or 0 when he just keeps up with the text
  let arrived = null; // called when a run has reached its end
  let walking = false;
  let held = false; // something else is moving him (the page he pushes)
  let reacting = 0; // one-off poses in progress: the idle life waits for them
  let stampUntil = 0;
  let quietSince = performance.now();
  let lifePose = null;
  let nagged = false;
  let sayTimer = 0;

  const render = () => { root.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`; };

  // Something happened: the quiet starts again.
  function stir() {
    quietSince = performance.now();
    lifePose = null;
    nagged = false;
  }

  // Where he stands at a caret: just past it, and never off the edge of the page.
  const standAt = (caret, lead = LEAD) => ({ x: Math.min(caret.x + lead * px, pageWidth() - (HALF - OVERHANG) * px), y: caret.y });

  // Be there now, no travelling.
  function put(p) {
    if (leap) { const l = leap; leap = null; l.done(); }
    if (arrived) { const a = arrived; arrived = null; pace = 0; a(); }
    pos.x = goal.x = p.x;
    pos.y = goal.y = p.y;
    render();
  }

  // A jump along an arc, like in any platform game. The promise resolves when he has landed.
  function jumpTo(p, { ms, height } = {}) {
    if (still() || document.hidden) { put(p); return Promise.resolve(); }
    if (leap) { leap.x1 = p.x; leap.y1 = p.y; return Promise.race([leap.landed, wait(leap.ms + 500)]); }
    const dx = p.x - pos.x, dy = p.y - pos.y;
    const dist = Math.hypot(dx, dy);
    let done;
    const landed = new Promise((r) => (done = r));
    leap = {
      x0: pos.x, y0: pos.y, x1: p.x, y1: p.y, t: 0, phase: "up", done, landed,
      ms: ms ?? clamp(210 + dist * 0.42, 280, 720),
      height: height ?? clamp(dist * 0.07, 7 * px, 16 * px),
    };
    goal.x = p.x;
    goal.y = p.y;
    stir();
    if (Math.abs(dx) > 6 * px) sprite.face(dx < 0 ? "left" : "right");
    sprite.jump("up");
    onJump?.();
    return Promise.race([landed, wait(leap.ms + 500)]); // if no frames are drawn (a covered window), the writing still goes on
  }

  // Go to where the next letter will be. Along a line he just walks after it; to another line
  // he jumps, and the promise resolves when he has landed. rest: the word is done, step clear of it.
  function goTo(caret, { jump = false, rest = false } = {}) {
    const p = standAt(caret, rest ? REST : LEAD);
    if (still() || document.hidden) { put(p); return Promise.resolve(); }
    if (leap) return jumpTo(p);
    if (!jump && Math.abs(p.y - pos.y) < 4) {
      // He never steps back for a letter: where he rested a little ahead, the text catches up with him.
      const ahead = goal.x - p.x;
      if (!(ahead > 0 && ahead <= (REST - LEAD) * px + 1)) goal.x = p.x;
      goal.y = p.y;
      return Promise.resolve();
    }
    return jumpTo(p);
  }

  // A run along the ground he is on, at a steady speed. Resolves when he is there.
  function runTo(x, speed = 0.46) {
    if (still() || document.hidden) { put({ x, y: pos.y }); return Promise.resolve(); }
    const far = Math.abs(x - pos.x);
    goal.x = x;
    goal.y = pos.y;
    pace = speed;
    stir();
    return Promise.race([new Promise((r) => (arrived = r)), wait(far / speed + 500)]);
  }

  function strike() {
    sprite.stamp();
    stampUntil = performance.now() + 260;
    if (walking) walking = false;
    stir();
  }

  // A pose that ends by itself: "think" over a question mark, for one.
  async function react(name, ms) {
    if (still()) return;
    reacting++;
    stir();
    sprite.set(name);
    await wait(ms);
    if (sprite.state === name) sprite.set("idle");
    reacting--;
    stir();
  }

  async function joy() {
    if (still()) return;
    reacting++;
    stir();
    // The sprite plays the pose; the hop off the line is ours, in steps.
    body.animate(
      [0, -3, -5, -5, -3, 0].map((n) => ({ transform: `translateY(${n * px}px)` })),
      { duration: 420, easing: "step-end" },
    );
    await sprite.joy();
    reacting--;
    stir();
  }

  // Pressed by the visitor: a jump for joy and a word. He only ever says that he does not choose.
  const REPLIES = ["I only write.", "Not my words.", "Ask the trades.", "Trade, and I write."];
  let reply = 0;
  sprite.el.addEventListener("click", () => {
    if (still() || leap || held || reacting || pace) return;
    say(REPLIES[reply++ % REPLIES.length]);
    joy();
  });

  function say(text, ms = 1900) {
    if (still()) return;
    says.textContent = text;
    says.classList.toggle("mirrored", pos.x > pageWidth() * 0.5); // near the edge of the page the bubble opens the other way
    says.hidden = false;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { says.hidden = true; }, ms);
  }

  // Alive between trades: he stands and breathes, then sits, eats, scratches, and at last sleeps.
  function life(now) {
    if (still() || held || leap || pace || walking || reacting || now < stampUntil + 200) return;
    const quiet = now - quietSince;
    let want = "idle";
    if (quiet > SLEEP_AFTER) want = "sleep";
    else if (quiet > SIT_AFTER) {
      const t = (quiet - SIT_AFTER) % ROUND[ROUND.length - 1][0];
      want = ROUND.find(([until]) => t < until)[1];
    }
    if (want !== lifePose) { lifePose = want; sprite.set(want); }
    if (!nagged && quiet > 9000) { nagged = true; say("Waiting for a trade."); }
  }

  // Called once per frame by the page.
  function frame(dt, now) {
    if (leap) {
      leap.t = Math.min(1, leap.t + dt / leap.ms);
      const t = leap.t;
      pos.x = lerp(leap.x0, leap.x1, t);
      pos.y = lerp(leap.y0, leap.y1, t) - leap.height * 4 * t * (1 - t);
      if (leap.phase === "up" && t > 0.12) { leap.phase = "air"; sprite.jump("air"); }
      if (t === 1) {
        const l = leap;
        leap = null;
        sprite.face("right");
        sprite.jump("land");
        stir();
        l.done();
      }
    } else if (!held) {
      const d = goal.x - pos.x;
      pos.y = goal.y;
      if (Math.abs(d) > 0.5) {
        const speed = pace || Math.max(0.3, Math.abs(d) / 70); // keeping up: the further behind, the faster
        pos.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
        // A stretch with no letter to strike (a space, a word put down whole, a run): he walks it.
        if (!walking && !reacting && now > stampUntil && (pace || Math.abs(d) > 3 * px)) {
          walking = true;
          sprite.face(d < 0 ? "left" : "right");
          sprite.set("walk");
          lifePose = null;
        }
      } else {
        pos.x = goal.x;
        if (walking) {
          walking = false;
          sprite.face("right");
          if (sprite.state === "walk") sprite.set("idle");
          stir();
        }
        if (arrived) { const a = arrived; arrived = null; pace = 0; a(); }
      }
    }
    render();
    life(now);
  }

  function rescale() {
    px = artPixel();
    sprite.setScale(px);
  }
  rescale();
  sprite.still(still());

  return {
    goTo, jumpTo, runTo, put, strike, react, joy, say, frame, rescale,
    snapTo: (caret) => put(standAt(caret, REST)),
    face: (dir) => sprite.face(dir),
    // A looping pose set from outside ("push" at the page corner); the idle life leaves it alone while he is held.
    pose: (name) => { lifePose = null; sprite.set(name); },
    hold: (on) => { held = on; if (!on) stir(); },
    still: (on) => sprite.still(on),
    at: () => ({ x: pos.x, y: pos.y }),
    height: () => 24 * px,
    get busy() { return !!leap || held || !!pace; },
  };
}
