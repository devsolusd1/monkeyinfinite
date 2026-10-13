// The writer: takes the book's events and has the monkey put them on the page, letter by letter.
// It also runs the big moment, the end of a page: a jump for joy, a run to the corner, and he
// pushes the page over.

import { wait } from "./util.js";

const FEW = 4; // more words than this waiting and he stops writing letter by letter until he has caught up

export function createWriter({ sheet, monkey, leaves, sound, still, hooks }) {
  const queue = [];
  let wake = null;

  const waiting = () => queue.reduce((n, e) => n + (e.kind === "word" ? 1 : 0), 0);
  // No time, or nobody looking: words go down whole.
  const hurry = () => still() || document.hidden || !leaves.live || waiting() > FEW;
  // Milliseconds between letters: 30 to 60 when he is on time, less the further behind he is.
  const beat = () => Math.max(7, (30 + Math.random() * 30) / (1 + waiting() * 0.85));

  // After putting something down whole: be at the end of the text.
  function settle() {
    if (!leaves.live) return; // his page is not on show; he is put back when it is
    if (still() || document.hidden) monkey.snapTo(sheet.caret());
    else monkey.goTo(sheet.caret(), { rest: true });
  }

  // ---- one word ----
  async function word(e) {
    if (e.commaBefore) await mark(",", false);
    if (hurry()) {
      sheet.addWord(e);
      settle();
      hooks.wordDone(e);
      return;
    }
    const { letters } = sheet.addWord(e, true);
    await monkey.goTo(sheet.caret()); // a step over the space, or a jump down to the next line
    await wait(beat() * 0.5);
    for (let i = 0; i < letters.length; i++) {
      if (hurry()) {
        for (const g of letters.slice(i)) sheet.reveal(g, false);
        settle();
        break;
      }
      sheet.reveal(letters[i]);
      monkey.strike();
      sound.key();
      monkey.goTo(sheet.caret(), { rest: i === letters.length - 1 }); // after the last letter, a step clear of the word
      await wait(beat());
    }
    hooks.wordDone(e);
  }

  // ---- a comma, or the mark that ends a sentence ----
  async function mark(text, paragraph) {
    if (hurry()) {
      sheet.addMark(text);
      if (paragraph) sheet.addBreak();
      settle();
      return;
    }
    const g = sheet.addMark(text, true);
    await monkey.goTo(sheet.caret()); // the mark can push its word onto the next line
    sheet.reveal(g);
    monkey.strike();
    sound.key();
    monkey.goTo(sheet.caret(), { rest: true });
    await wait(beat() * 1.5);
    if (paragraph) sheet.addBreak();
    if (waiting() > 2) return; // no time for feelings
    if (text === "?") await monkey.react("think", 820);
    else if (text === "!") await monkey.joy();
  }

  // ---- a page is full ----
  function fresh(number) {
    sheet.clear();
    hooks.newPage(number);
  }

  async function turn(page) {
    hooks.pageFull(page);
    if (hurry()) {
      leaves.sealed(page);
      fresh(page.number + 1);
      settle();
      return;
    }
    leaves.lock(true);
    hooks.pageDone(page);
    sound.jingle();
    await monkey.joy();
    await wait(260);

    // Down to the foot of the page, and a run to its corner.
    const floor = leaves.floor();
    await monkey.jumpTo({ x: Math.min(monkey.at().x, floor.right), y: floor.y });
    await monkey.runTo(floor.right);
    monkey.hold(true);
    monkey.face("left");
    monkey.pose("push");
    await wait(220);

    // He pushes the page over, a step at a time; past the spine it falls by itself.
    const reach = 11 * (monkey.height() / 24); // from the middle of his feet to his outstretched hands
    await leaves.turnLive(page, {
      fresh: () => fresh(page.number + 1),
      onStep: (side, width) => {
        if (side === "r") monkey.put({ x: Math.max(floor.left, width + reach), y: floor.y });
        else { monkey.face("right"); monkey.pose("idle"); }
      },
    });
    monkey.hold(false);
    hooks.turned(page);

    // The fresh page: one big jump up to its first line.
    monkey.face("right");
    monkey.pose("idle");
    await wait(120);
    await monkey.goTo(sheet.caret(), { jump: true });
    leaves.lock(false);
  }

  // ---- the loop ----
  async function run() {
    for (;;) {
      if (!queue.length) await new Promise((r) => (wake = r));
      const e = queue.shift();
      if (!e) continue;
      try {
        if (e.kind === "punct") await mark(e.mark, e.paragraph);
        else if (e.kind === "page") await turn(e);
        else await word(e);
      } catch (err) {
        console.error(err);
        leaves.lock(false);
        monkey.hold(false);
      }
    }
  }
  run();

  return {
    // Events from book.push(trade), in order.
    take(events) {
      queue.push(...events);
      if (wake) { const go = wake; wake = null; go(); }
    },
    // The page so far, put down at once (on load).
    restore(current) {
      sheet.clear();
      sheet.fill(current.items);
      monkey.snapTo(sheet.caret());
    },
    // The text reflowed (a resize, the fonts arriving) or his page came back on show: stand at the end of it again.
    reflow() { if (leaves.live && !monkey.busy) monkey.snapTo(sheet.caret()); },
  };
}
