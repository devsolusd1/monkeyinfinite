// The camera. The view scrolls by itself so the monkey stays on screen while he writes, the way
// a platform game follows its player. The moment the visitor scrolls, it lets go; it picks him
// up again when he is back in view and the visitor has stopped, or when asked to.

import { clamp } from "./util.js";

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

// focusY: where his feet are, in page coordinates. topEdge / bottomEdge: how much of the window
// the fixed strips cover. tall: how tall he is.
export function createCamera({ focusY, topEdge, bottomEdge, tall, still, ignore }) {
  let following = true;
  let resting = false; // set while a finished page is being read: nothing to follow
  let y = window.scrollY;
  let lastTouch = 0;

  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  // His line sits a little below the middle of the free part of the window.
  const wanted = () => {
    const free = window.innerHeight - topEdge() - bottomEdge();
    return Math.round(clamp(focusY() - topEdge() - free * 0.6, 0, maxScroll()));
  };

  // Where the monkey is on screen right now: "above", "below" or "in" view.
  function where() {
    const at = focusY() - window.scrollY;
    if (at - tall() * 0.5 < topEdge()) return "above";
    if (at > window.innerHeight - bottomEdge() - 4) return "below";
    return "in";
  }

  function letGo(event) {
    if (event.target instanceof Element && event.target.closest(ignore)) return;
    following = false;
    lastTouch = performance.now();
  }
  addEventListener("wheel", letGo, { passive: true });
  addEventListener("touchmove", letGo, { passive: true });
  addEventListener("keydown", (e) => { if (SCROLL_KEYS.has(e.key)) letGo(e); });
  addEventListener("pointerdown", (e) => { if (e.clientX >= document.documentElement.clientWidth) letGo(e); });

  function jump() {
    y = wanted();
    window.scrollTo(0, y);
  }

  function follow() {
    following = true;
    y = window.scrollY;
  }

  function frame(dt) {
    if (resting) return;
    if (!following) {
      if (performance.now() - lastTouch < 1500 || where() !== "in") return;
      follow();
    }
    const target = wanted();
    if (Math.abs(window.scrollY - y) > 3) y = window.scrollY; // the page moved under us (a resize, a shorter book)
    y = still() ? target : y + (target - y) * (1 - Math.exp(-dt / 130));
    if (Math.abs(target - y) < 0.5) y = target;
    if (Math.abs(window.scrollY - y) >= 1) window.scrollTo(0, Math.round(y));
  }

  return {
    frame, jump, follow, where,
    rest(on) { resting = on; if (!on) follow(); },
    get following() { return following && !resting; },
  };
}
