// Optional sound, off until the visitor presses the speaker. Everything is a square wave made
// with WebAudio, the way an old console did it: a blip for each letter, a hop when he jumps to
// the next line, a flap for a turning page and a tiny jingle when a page is finished.

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98 };
const KEYS = [NOTE.A5, NOTE.C6, NOTE.B5, NOTE.D6, NOTE.A5, NOTE.E6, NOTE.C6, NOTE.B5]; // the letters walk through these

export function createSound() {
  let ctx = null;
  let on = false;
  let lastKey = 0;
  let key = 0;

  function ready() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  // One square note. `to` bends it (a jump goes up, a page flap goes down); `at` delays it.
  function blip({ freq, to = freq, ms, gain = 0.05, at = 0 }) {
    const t = ctx.currentTime + at / 1000, len = ms / 1000;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.linearRampToValueAtTime(to, t + len);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.setValueAtTime(gain, t + len * 0.7);
    amp.gain.linearRampToValueAtTime(0, t + len);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len + 0.01);
  }

  const audible = () => on && !document.hidden;

  const api = {
    get on() { return on; },
    toggle() {
      on = !on && ready();
      if (on) blip({ freq: NOTE.E6, ms: 60 });
      return on;
    },
    key() {
      if (!audible()) return;
      const now = performance.now();
      if (now - lastKey < 28) return; // when he is catching up, not every letter needs its own blip
      lastKey = now;
      blip({ freq: KEYS[key++ % KEYS.length], ms: 28, gain: 0.035 });
    },
    hop() { if (audible()) blip({ freq: 330, to: 660, ms: 90, gain: 0.04 }); },
    flap() { if (audible()) blip({ freq: 196, to: 131, ms: 46, gain: 0.05 }); },
    jingle() {
      if (!audible()) return;
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6].forEach((freq, i) => blip({ freq, ms: i === 5 ? 220 : 80, at: i * 85, gain: 0.05 }));
    },
  };
  return api;
}
