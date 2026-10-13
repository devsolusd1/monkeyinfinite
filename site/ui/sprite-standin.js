// A stand-in for monkey/sprite.js, with the same contract, so the page can be built and looked at
// before the real sprite is drawn. A crude monkey on a 24 by 24 grid, his feet on the bottom row.
// The Zs of his sleep and his banana are drawn inside the frame (there is no el2).

export const FRAME = { w: 24, h: 24 };

const INK = { f: "#a8562e", d: "#6e3418", s: "#ffcfa3", k: "#1d1d2b", y: "#ffd21f", z: "#5f5d6e" };

// One frame is put together from a few choices (legs, arm, eyes...) instead of a bitmap per pose.
function draw(o) {
  const grid = new Array(FRAME.w * FRAME.h).fill(null);
  const box = (x, y, w, h, c) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i >= 0 && i < FRAME.w && j >= 0 && j < FRAME.h) grid[j * FRAME.w + i] = c;
    }
  };
  const b = o.drop || 0; // how far his body sinks: breathing, crouching, sitting

  // tail, behind him
  for (const [x, y] of [[8, 17], [7, 17], [6, 16], [5, 15], [5, 14], [5, 13], [6, 12]]) box(x, Math.min(22, y + b), 1, 1, "d");

  // legs and feet
  if (o.legs === "walkA") { box(8, 19, 2, 4, "f"); box(7, 23, 3, 1, "s"); box(14, 19, 2, 4, "f"); box(14, 23, 3, 1, "s"); }
  else if (o.legs === "walkB") { box(11, 19, 2, 4, "f"); box(11, 23, 3, 1, "s"); box(13, 19, 2, 2, "f"); box(13, 21, 3, 1, "s"); }
  else if (o.legs === "crouch") { box(8, 21, 2, 2, "f"); box(8, 23, 3, 1, "s"); box(14, 21, 2, 2, "f"); box(14, 23, 3, 1, "s"); }
  else if (o.legs === "air") { box(9, 19, 2, 2, "f"); box(9, 21, 3, 1, "s"); box(13, 19, 2, 2, "f"); box(14, 21, 3, 1, "s"); }
  else if (o.legs === "sit") { box(14, 21, 5, 3, "f"); box(19, 20, 1, 4, "s"); }
  else { box(9, 19, 2, 4, "f"); box(9, 23, 3, 1, "s"); box(13, 19, 2, 4, "f"); box(13, 23, 3, 1, "s"); }

  // the arm on the far side, when it shows
  if (o.arm === "up") { box(8, 10 + b, 1, 1, "d"); box(7, 9 + b, 1, 1, "d"); box(6, 8 + b, 1, 1, "d"); box(5, 6 + b, 2, 2, "s"); }
  if (o.arm === "hitB") { box(16, 12 + b, 2, 1, "d"); box(17, 13 + b, 2, 1, "d"); box(18, 14 + b, 2, 1, "d"); box(19, 15 + b, 2, 2, "s"); }

  // body and belly
  box(9, 11 + b, 7, 8, "f");
  box(12, 12 + b, 4, 6, "s");

  // head, ears, face
  box(9, 2 + b, 8, 9, "f"); box(8, 3 + b, 10, 7, "f");
  box(6, 5 + b, 2, 3, "f"); box(6, 6 + b, 1, 1, "s");
  box(18, 5 + b, 2, 3, "f"); box(19, 6 + b, 1, 1, "s");
  box(10, 5 + b, 7, 3, "s"); box(11, 8 + b, 7, 2, "s");
  const e = o.eyes === "up" ? 4 : 5;
  if (o.eyes === "closed") { box(11, 6 + b, 2, 1, "d"); box(14, 6 + b, 2, 1, "d"); }
  else if (o.eyes === "happy") { for (const x of [11, 14]) { box(x, 6 + b, 1, 1, "k"); box(x + 1, 5 + b, 1, 1, "k"); box(x + 2, 6 + b, 1, 1, "k"); } }
  else { box(12, e + b, 1, 2, "k"); box(15, e + b, 1, 2, "k"); }
  if (o.mouth === "open") box(13, 8 + b, 3, 2, "k"); else box(13, 9 + b, 3, 1, "d");

  // the arm on the near side
  if (o.arm === "hitA") { box(14, 13 + b, 2, 1, "d"); box(15, 14 + b, 2, 1, "d"); box(16, 15 + b, 2, 1, "d"); box(17, 16 + b, 2, 1, "d"); box(18, 17 + b, 2, 2, "s"); }
  else if (o.arm === "hitB") { box(14, 12 + b, 2, 1, "d"); box(16, 11 + b, 2, 1, "d"); box(18, 10 + b, 1, 1, "d"); box(19, 8 + b, 2, 2, "s"); }
  else if (o.arm === "up") { box(15, 11 + b, 1, 1, "d"); box(16, 10 + b, 1, 1, "d"); box(17, 9 + b, 1, 1, "d"); box(18, 8 + b, 1, 1, "d"); box(18, 6 + b, 2, 2, "s"); }
  else if (o.arm === "scratch") { box(14, 12 + b, 3, 1, "d"); box(17, 11 + b, 1, 1, "d"); box(18, 3 + b, 1, 8, "d"); box(15 + (o.j || 0), 1 + b, 3, 2, "s"); }
  else if (o.arm === "push") { box(14, 12 + b, 6, 2, "d"); box(20, 11 + b, 1, 4, "s"); }
  else if (o.arm === "eat") { box(13, 12 + b, 2, 2, "d"); box(15, 11 + b, 2, 1, "d"); box(17, 10 + b, 1, 1, "s"); box(18, 7 + b, 2, 3, "y"); box(19, 6 + b, 1, 1, "y"); }
  else if (o.arm === "hold") { box(13, 12 + b, 2, 3, "d"); box(14, 15 + b, 2, 1, "s"); box(16, 12 + b, 2, 3, "y"); box(17, 11 + b, 1, 1, "y"); }
  else { box(13, 12 + b, 2, 4, "d"); box(13, 16 + b, 2, 1, "s"); }

  // Zs, drifting up
  if (o.z === 1) { box(19, 4, 3, 1, "z"); box(20, 5, 1, 1, "z"); box(19, 6, 3, 1, "z"); }
  if (o.z === 2) { box(20, 0, 4, 1, "z"); box(22, 1, 1, 1, "z"); box(21, 2, 1, 1, "z"); box(20, 3, 4, 1, "z"); box(18, 6, 2, 1, "z"); }
  return grid;
}

const FRAMES = {
  stand: {}, breathe: { drop: 1 },
  walk1: { legs: "walkA" }, walk2: { legs: "walkB", drop: 1 },
  hitA: { arm: "hitA", drop: 1 }, hitB: { arm: "hitB" },
  crouch: { legs: "crouch", drop: 2 }, air: { legs: "air", arm: "up" },
  joy: { legs: "air", arm: "up", eyes: "happy", mouth: "open" },
  think1: { arm: "scratch", eyes: "up" }, think2: { arm: "scratch", eyes: "up", j: 1 },
  push1: { arm: "push", legs: "walkA" }, push2: { arm: "push", legs: "walkB", drop: 1 },
  sit: { legs: "sit", drop: 5 },
  eat1: { legs: "sit", drop: 5, arm: "eat", mouth: "open" }, eat2: { legs: "sit", drop: 5, arm: "hold" },
  sleep1: { legs: "sit", drop: 5, eyes: "closed", z: 1 }, sleep2: { legs: "sit", drop: 5, eyes: "closed", z: 2 },
};

// Looping poses: one name per tick of the frame timer.
const rep = (name, n) => Array(n).fill(name);
const LOOPS = {
  idle: [...rep("stand", 7), ...rep("breathe", 7)],
  walk: ["walk1", "stand", "walk2", "stand"],
  think: [...rep("think1", 2), ...rep("think2", 2)],
  push: [...rep("push1", 2), ...rep("push2", 2)],
  sit: ["sit"],
  eat: [...rep("eat1", 5), ...rep("eat2", 4), ...rep("eat1", 2), ...rep("eat2", 5)],
  sleep: [...rep("sleep1", 7), ...rep("sleep2", 7)],
};
const TICK = 100; // ten frames a second

export function createMonkeySprite({ scale = 3 } = {}) {
  const el = document.createElement("canvas");
  el.width = FRAME.w;
  el.height = FRAME.h;
  el.style.imageRendering = "pixelated";
  el.style.display = "block";
  const ctx = el.getContext("2d");

  let pose = "idle";
  let dir = "right";
  let frozen = false;
  let tick = 0;
  let hand = 0;
  let stampUntil = 0;
  let blinkAt = 20;
  let run = 0; // a number that changes whenever a one-off (jump, joy) starts, so old timers give up

  function paint(name, extra) {
    const grid = draw({ ...FRAMES[name], ...extra });
    ctx.clearRect(0, 0, FRAME.w, FRAME.h);
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i]) continue;
      const x = i % FRAME.w, y = (i - x) / FRAME.w;
      ctx.fillStyle = INK[grid[i]];
      ctx.fillRect(dir === "left" ? FRAME.w - 1 - x : x, y, 1, 1);
    }
  }

  function loopFrame() {
    const loop = LOOPS[pose];
    if (!loop) return;
    const blink = (pose === "idle" || pose === "sit") && tick >= blinkAt && tick < blinkAt + 2;
    if (tick >= blinkAt + 2) blinkAt = tick + 18 + Math.floor(Math.random() * 30);
    paint(loop[tick % loop.length], blink ? { eyes: "closed" } : null);
  }

  setInterval(() => {
    if (frozen) return;
    tick++;
    if (pose === "stamp") { if (performance.now() > stampUntil) set("idle"); return; }
    loopFrame();
  }, TICK);

  function set(state) {
    if (!LOOPS[state]) return;
    run++;
    pose = state;
    tick = 0;
    blinkAt = 12 + Math.floor(Math.random() * 20);
    if (frozen) paint("stand"); else loopFrame();
  }

  const api = {
    el,
    set,
    get state() { return pose; },
    stamp() {
      if (frozen) return;
      run++;
      hand ^= 1;
      pose = "stamp";
      stampUntil = performance.now() + 200;
      paint(hand ? "hitA" : "hitB");
    },
    jump(phase) {
      if (frozen) return;
      const mine = ++run;
      pose = "jump";
      paint(phase === "air" ? "air" : "crouch");
      if (phase === "land") setTimeout(() => { if (run === mine) set("idle"); }, 120);
    },
    joy() {
      if (frozen) return Promise.resolve();
      const mine = ++run;
      pose = "joy";
      const frames = ["crouch", "joy", "joy", "joy", "crouch"];
      return new Promise((done) => {
        let i = 0;
        const next = () => {
          if (run !== mine) { done(); return; }
          if (i === frames.length) { set("idle"); done(); return; }
          paint(frames[i++]);
          setTimeout(next, TICK);
        };
        next();
      });
    },
    face(to) {
      if (to === dir) return;
      dir = to;
      if (frozen) paint("stand"); else if (LOOPS[pose]) loopFrame();
    },
    setScale(n) {
      scale = Math.max(1, Math.round(n));
      el.style.width = `${FRAME.w * scale}px`;
      el.style.height = `${FRAME.h * scale}px`;
    },
    still(on) {
      frozen = !!on;
      if (frozen) { run++; pose = "idle"; paint("stand"); }
    },
  };
  api.setScale(scale);
  paint("stand");
  return api;
}
