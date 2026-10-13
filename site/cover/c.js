// Cover C: "He is the cursor".
// The title is set as three lines of text, left aligned, as if it had just been written, and the
// monkey stands at the end of the last word, on the baseline, with his fist down where the next
// letter goes: a red underscore, the cursor, and a little dust. Under the title the book runs on
// as rows of dashes that fade out down the board.
//
// Everything drawn by hand is a plain array below: change a character and you have changed a pixel.
//   LETTERS   the title's alphabet, 15 art pixels tall, strokes 3 thick ("#" is ink)
//   MONKEY    the monkey, 36 by 61, as he stands on the cover: facing LEFT, toward his words
//             (the drawings in monkey/sprite.js face right), feet and fist on the bottom row
//   DUST      what flies up where his fist lands
//   LINES     the rows of dashes: the colour of each row and the length of each word
// The code at the bottom only lays those out on the 120 by 160 board and exports the finished rows.

const W = 120, H = 160;

const PALETTE = {
  y: "#ffd21f", // the board: banana yellow
  k: "#1d1d2b", // ink
  b: "#a8562e", // fur
  d: "#6e3418", // dark fur
  f: "#ffcfa3", // face, belly, hands and feet
  w: "#ffffff", // page white: the light in his eyes, the dust
  r: "#e0304a", // red, the second ink
  o: "#8e7725", // ink half gone into the board  } the two colours this cover adds,
  g: "#c6a522", // ink almost gone into the board } for the lines that fade out
};

// prettier-ignore
const LETTERS = {
  T: [
    "#########",
    "#########",
    "#########",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
  ],
  H: [
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "#########",
    "#########",
    "#########",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
  ],
  E: [
    "#######",
    "#######",
    "#######",
    "###....",
    "###....",
    "###....",
    "######.",
    "######.",
    "######.",
    "###....",
    "###....",
    "###....",
    "#######",
    "#######",
    "#######",
  ],
  I: [
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
    "###",
  ],
  N: [
    "###...###",
    "###...###",
    "####..###",
    "####..###",
    "#####.###",
    "#####.###",
    "###.#.###",
    "###.#.###",
    "###.#.###",
    "###.#####",
    "###.#####",
    "###..####",
    "###..####",
    "###...###",
    "###...###",
  ],
  F: [
    "#######",
    "#######",
    "#######",
    "###....",
    "###....",
    "###....",
    "######.",
    "######.",
    "######.",
    "###....",
    "###....",
    "###....",
    "###....",
    "###....",
    "###....",
  ],
  M: [
    "###.....###",
    "####...####",
    "####...####",
    "#####.#####",
    "#####.#####",
    "###########",
    "###.###.###",
    "###.###.###",
    "###..#..###",
    "###..#..###",
    "###.....###",
    "###.....###",
    "###.....###",
    "###.....###",
    "###.....###",
  ],
  O: [
    "..#####..",
    ".#######.",
    "#########",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    "#########",
    ".#######.",
    "..#####..",
  ],
  K: [
    "###...###",
    "###...###",
    "###..###.",
    "###..###.",
    "###.###..",
    "###.###..",
    "######...",
    "######...",
    "######...",
    "###.###..",
    "###.###..",
    "###..###.",
    "###..###.",
    "###...###",
    "###...###",
  ],
  Y: [
    "###...###",
    "###...###",
    "###...###",
    "###...###",
    ".###.###.",
    ".###.###.",
    "..#####..",
    "..#####..",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
    "...###...",
  ],
};

// prettier-ignore
const MONKEY = [
  "....................kk..............",
  "................kk.kbbk.............",
  "...............kbbkbbbk.............",
  "..........kkkkkkbbbbbbkkk...........",
  ".......kkbbbbbbbbbbbbbbbbkk.........",
  ".....kkbbbbbbbbbbbbbbbbbbbbkk.......",
  "....kbbbbbbbbbbbbbbbbbbbbbbbdk......",
  "...kbbbbbbbbbbbbbbbbbbbbbbbbddk.....",
  "..kbbbbbbbbbbbbbbbbbbbbbbbbbddk.....",
  "..kbfffffbbbbbfffffbbbbbbbbbbddk....",
  ".kffffffffbbfffffffffbbbbbbbbddk....",
  ".kffffffffffffffffffffbbbbbbbddk....",
  ".kfffffffffffffffffffffbbbbbbdkkkk..",
  ".kfffkkkfffffffkkkfffffbbbbbbkffffk.",
  ".kfffwkkfffffffwkkfffffbbbbbkffffffk",
  ".kfffkkkfffffffkkkfffffbbbbbkffbbffk",
  ".kfffkkkfffffffkkkfffffbbbbbkffffbfk",
  ".kfffkkkfffffffkkkfffffbbbbbkffffbfk",
  ".kfffkkkfffffffkkkfffffbbbbbkfffbffk",
  ".kfffkkkfffffffkkkfffffbbbbbkffffffk",
  "kfffffffffffffffffffffffbbbbbkffffk.",
  "kffffffffffffffffffffffffbbbbdkkkk..",
  "kfffffffffffffffffffffffffbbbddk....",
  "kfffkkffffffffffffffffffffbbbddk....",
  "kfffkkffffffffffffffffffffbbbddk....",
  "kfffkkkkkkkkkkkffffffffffbbbbddk....",
  "kffffkrrrrrrrkffffffffffbbbbddk.....",
  ".kffffkrrrrrkffffffffffbbbbddk......",
  "..kffffkkkkkfffffffffbbbbbddk.......",
  "...kkfffffffffffffffbbbdddkk........",
  ".....kkkkkkkkkkkkkkkkkkkkk..........",
  ".........kkkkkkkbbbbbbk.............",
  ".........kbbbbbkbbbbbbdk............",
  ".........kbbbbdkbbbbbbddk....kkkk...",
  ".........kbbbbdkbbbbbbddk...kbbbbk..",
  "........kbbbbdkffffbbbddk..kbbkkbbk.",
  "........kbbbbdkfffffbbddk.kbbk..kbbk",
  "........kbbbbdkffffffbddk.kbbk..kbbk",
  ".......kbbbbdkfffffffbddk..kbbk.kbbk",
  ".......kbbbbdkfffffffbddk...kk..kbbk",
  ".......kbbbbdkfffffffbddk.......kbbk",
  "......kbbbbdkffffffffbbddk......kbbk",
  "......kbbbbdkffffffffbbddk.....kbbk.",
  ".....kbbbbdkfffffffffbbddk.....kbbk.",
  ".....kbbbbdkfffffffffbbddk....kbbk..",
  ".....kbbbbdkfffffffffbbbddk.kkbbbk..",
  "....kbbbbdkfffffffffbbbbddkkbbbbk...",
  "....kbbbbdkfffffffffbbbbbbbbbbkk....",
  "...kbbbbdkfffffffffbbbbbbbbbkk......",
  "...kbbbbdkbfffffffbbbbbbddkk........",
  "..kbbbbbdkbbbbbbbbbbbbbbddk.........",
  "..kkkkkkkkkkkkkdddddkbbbbbk.........",
  ".kffffffffk...kdddddkbbbbbk.........",
  ".kffffffffk...kdddddkbbbbbk.........",
  ".kffffffffk...kdddddkbbbbbk.........",
  ".kfkkfffffk...kdddddkbbbbbk.........",
  ".kffffffffk..kkkdddkkbbbbbk.........",
  ".kffffffffk..kffffkfffffffk.........",
  ".kffkffkffk..kffffkfffffffk.........",
  ".kffkffkffk..kffffkfffffffk.........",
  "..kkkkkkkk...kkkkkkkkkkkkkk.........",
];

// What flies up where his fist lands, between the last letter and the fist.
// prettier-ignore
const DUST = [
  "....w.",
  "......",
  "..w...",
  ".....w",
  ".w....",
  "...ww.",
  "ww.ww.",
  "ww....",
];

// The book runs on: one string per row of dashes. The first character is the colour of the row
// (k ink, then o and g as it fades), the numbers are the length of each word in art pixels, and
// an "r" after a length makes that word red.
const LINES = [
  "k 9 4 11 6 3 8r 12 5 7 4",
  "k 5 10r 3 7 12 4 9 6 8 3 6",
  "o 12 6 4 9 3 11 7 5 10 4",
  "o 7 3 9 12 5 4 8 6 11 3",
  "g 10 5 8 3 12 6 4 9 7",
  "g 6 11 4 7 3 9 12",
  "g 9 4 12 6",
];

// ---------------------------------------------------------------------------------------------
// The layout. Nothing below is a drawing.

const LEFT = 9;        // the left edge of every line of text
const TOP = 24;        // the top of the first line of the title
const CAP = 15;        // the height of a letter
const LEADING = 20;    // from one line of the title to the next
const SPACE = 2;       // between two letters

const grid = Array.from({ length: H }, () => Array(W).fill("y"));
const put = (x, y, c) => { if (c !== "." && x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = c; };
// Lays a drawing down with its top left corner at x0, y0; `as` paints every pixel of it one colour.
const stamp = (art, x0, y0, as = null) => {
  art.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) put(x0 + dx, y0 + dy, row[dx] === "." ? "." : as ?? row[dx]);
  });
};

// One thin ink frame; each corner steps in by a notch.
const FRAME = 3, NOTCH = 3, RIGHT = W - 1 - FRAME, BOTTOM = H - 1 - FRAME;
for (let x = FRAME + NOTCH; x <= RIGHT - NOTCH; x++) { put(x, FRAME, "k"); put(x, BOTTOM, "k"); }
for (let y = FRAME + NOTCH; y <= BOTTOM - NOTCH; y++) { put(FRAME, y, "k"); put(RIGHT, y, "k"); }
for (const [cx, sx] of [[FRAME, 1], [RIGHT, -1]]) {
  for (const [cy, sy] of [[FRAME, 1], [BOTTOM, -1]]) {
    for (let i = 0; i <= NOTCH; i++) { put(cx + sx * NOTCH, cy + sy * i, "k"); put(cx + sx * i, cy + sy * NOTCH, "k"); }
  }
}

// The title. write() gives back the x just after the last letter.
function write(word, x, y) {
  for (const ch of word) {
    stamp(LETTERS[ch], x, y, "k");
    x += LETTERS[ch][0].length + SPACE;
  }
  return x - SPACE;
}
write("THE", LEFT, TOP);
write("INFINITE", LEFT, TOP + LEADING);
const end = write("MONKEY", LEFT, TOP + 2 * LEADING);
const baseline = TOP + 2 * LEADING + CAP - 1; // the bottom row of the last line

// The monkey, right after the last letter, feet on the baseline.
const monkeyX = end + 3;
stamp(MONKEY, monkeyX, baseline - MONKEY.length + 1);

// Where his fist lands: the cursor, a red underscore as thick as the letters' strokes and just
// under the baseline, and a little dust. (His fist is the 10 columns that start 1 in from his
// left edge.)
for (let x = monkeyX + 1; x < monkeyX + 11; x++) for (let y = baseline + 2; y < baseline + 5; y++) put(x, y, "r");
stamp(DUST, end - 3, baseline - DUST.length + 1);

// The rows of dashes, fading out toward the bottom.
LINES.forEach((line, n) => {
  const [tone, ...words] = line.split(" ");
  const y = baseline + 14 + n * 8;
  let x = LEFT;
  for (const word of words) {
    const len = parseInt(word, 10);
    const c = word.endsWith("r") ? "r" : tone;
    for (let i = 0; i < len; i++) { put(x + i, y, c); put(x + i, y + 1, c); }
    x += len + 3;
  }
});

export const COVER = { w: W, h: H, palette: PALETTE, rows: grid.map((row) => row.join("")) };
