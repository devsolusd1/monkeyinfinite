// Cover B, "the game box": the book's cover drawn like the front of an 8-bit cartridge box.
// The title in heavy block letters on one slab of ink, "THE" on a red tag above it, the monkey's
// head and shoulders filling the rest with a pencil in his teeth, and a burst of rays behind him.
//
// Everything a hand drew is a plain array below (the three alphabets and the monkey): one
// character per art pixel, so changing a letter changes a pixel. The code at the bottom only
// arranges those drawings on the board: rays, edge, title, monkey.

const W = 120, H = 160;

export const PALETTE = {
  ".": null,      // nothing (the cut corners of the board)
  y: "#ffd21f",   // banana yellow: the board, the pencil
  k: "#1d1d2b",   // ink
  w: "#ffffff",   // white: the letters, his teeth, the light in his eyes
  l: "#e9eaf0",   // light grey: the shine on the pencil's metal band
  g: "#c2c3c7",   // mid grey: the pencil's metal band
  b: "#a8562e",   // fur
  d: "#6e3418",   // dark fur: the shaded side of his head, under his chin
  f: "#ffcfa3",   // face, ears, belly, the pencil's wood
  r: "#e0304a",   // red: the eraser, the tag behind "THE"
  // The two colours this cover adds to the shared palette:
  p: "#ffe680",   // pale banana: every other ray
  n: "#f58fa0",   // pink: inside his ears, his cheeks
};

// ---------------------------------------------------------------------------------------------
// The lettering. X is the face of a letter; the ink round it and its shadow are added below.

// "THE": 8 tall, strokes of 2.
// prettier-ignore
const SMALL = {
  T: ["XXXXXX", "XXXXXX", "..XX..", "..XX..", "..XX..", "..XX..", "..XX..", "..XX.."],
  H: ["XX..XX", "XX..XX", "XX..XX", "XXXXXX", "XXXXXX", "XX..XX", "XX..XX", "XX..XX"],
  E: ["XXXXX", "XXXXX", "XX...", "XXXX.", "XXXX.", "XX...", "XXXXX", "XXXXX"],
};

// "INFINITE": 16 tall, stems of 4.
// prettier-ignore
const BIG = {
  I: [
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
    "XXXX",
  ],
  N: [
    "XXXXX....XXXX",
    "XXXXX....XXXX",
    "XXXXXX...XXXX",
    "XXXXXX...XXXX",
    "XXXXXXX..XXXX",
    "XXXXXXX..XXXX",
    "XXXXXXXX.XXXX",
    "XXXXXXXX.XXXX",
    "XXXX.XXXXXXXX",
    "XXXX.XXXXXXXX",
    "XXXX..XXXXXXX",
    "XXXX..XXXXXXX",
    "XXXX...XXXXXX",
    "XXXX...XXXXXX",
    "XXXX....XXXXX",
    "XXXX....XXXXX",
  ],
  F: [
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXX.......",
    "XXXX.......",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXX.......",
    "XXXX.......",
    "XXXX.......",
    "XXXX.......",
    "XXXX.......",
    "XXXX.......",
  ],
  T: [
    "XXXXXXXXXXXX",
    "XXXXXXXXXXXX",
    "XXXXXXXXXXXX",
    "XXXXXXXXXXXX",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
    "....XXXX....",
  ],
  E: [
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXX.......",
    "XXXX.......",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXX.......",
    "XXXX.......",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ],
};

// "MONKEY": 20 tall, stems of 5.
// prettier-ignore
const HUGE = {
  M: [
    "XXXXXX....XXXXXX",
    "XXXXXX....XXXXXX",
    "XXXXXXX..XXXXXXX",
    "XXXXXXX..XXXXXXX",
    "XXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXX",
    "XXXXX.XXXX.XXXXX",
    "XXXXX.XXXX.XXXXX",
    "XXXXX..XX..XXXXX",
    "XXXXX..XX..XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
    "XXXXX......XXXXX",
  ],
  O: [
    "..XXXXXXXXX..",
    ".XXXXXXXXXXX.",
    "XXXXXXXXXXXXX",
    "XXXXXXXXXXXXX",
    "XXXXXXXXXXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXXXXXXXXXX",
    "XXXXXXXXXXXXX",
    "XXXXXXXXXXXXX",
    ".XXXXXXXXXXX.",
    "..XXXXXXXXX..",
  ],
  N: [
    "XXXXX....XXXXX",
    "XXXXX....XXXXX",
    "XXXXXX...XXXXX",
    "XXXXXX...XXXXX",
    "XXXXXXX..XXXXX",
    "XXXXXXX..XXXXX",
    "XXXXXXXX.XXXXX",
    "XXXXXXXX.XXXXX",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    "XXXXX.XXXXXXXX",
    "XXXXX.XXXXXXXX",
    "XXXXX..XXXXXXX",
    "XXXXX..XXXXXXX",
    "XXXXX...XXXXXX",
    "XXXXX...XXXXXX",
    "XXXXX....XXXXX",
    "XXXXX....XXXXX",
    "XXXXX....XXXXX",
    "XXXXX....XXXXX",
  ],
  K: [
    "XXXXX....XXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXX.",
    "XXXXX..XXXXX.",
    "XXXXX..XXXX..",
    "XXXXX.XXXXX..",
    "XXXXX.XXXX...",
    "XXXXXXXXXX...",
    "XXXXXXXXX....",
    "XXXXXXXXX....",
    "XXXXXXXXXX...",
    "XXXXXXXXXX...",
    "XXXXXXXXXXX..",
    "XXXXX.XXXXX..",
    "XXXXX..XXXXX.",
    "XXXXX..XXXXX.",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXX....XXXX",
    "XXXXX....XXXX",
  ],
  E: [
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXX......",
    "XXXXX......",
    "XXXXX......",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXXXXXXX..",
    "XXXXX......",
    "XXXXX......",
    "XXXXX......",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ],
  Y: [
    "XXXXX....XXXXX",
    "XXXXX....XXXXX",
    "XXXXX....XXXXX",
    ".XXXXX..XXXXX.",
    ".XXXXX..XXXXX.",
    "..XXXXXXXXXX..",
    "..XXXXXXXXXX..",
    "...XXXXXXXX...",
    "...XXXXXXXX...",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
    "....XXXXXX....",
  ],
};

// ---------------------------------------------------------------------------------------------
// The monkey: head and shoulders, the pencil across his grin. "." is nothing, so the rays show
// through around him. MONKEY_AT is where the top left corner of this drawing sits on the board.

const MONKEY_AT = { x: 12, y: 64 };
// prettier-ignore
const MONKEY = [
  "..................................kkkk.............................................................",
  ".................................kkkkkkk...........................................................",
  ".................................kkbbkkkkk.........................................................",
  ".................................kkbbbbkkkk....kkkk................................................",
  ".................................kkkbbbbbkkk..kkkkkk...............................................",
  "..................................kkbbbbbbkkkkkkbbkkk..............................................",
  "..................................kkkbbbbbbkkkkbbbbkk..............................................",
  "...................................kkkbbbbbbkkbbbbbkkk.............................................",
  "....................................kkkbbbbbbbbbbbbbkkk............................................",
  "....................................kkkbbbbbbbbbbbbbbkkk...........................................",
  "....................................kkbbbbbbbbbbbbbbbbkkkkkkkkkk...................................",
  ".................................kkkkkbbbbbbbbbbbbbbbbkkkkkkkkkkkkkk...............................",
  "..............................kkkkkkkkbbbbbbbbbbbbbbbbbbbbbbbbbkkkkkkkk............................",
  "............................kkkkkkbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkkkkkk..........................",
  "..........................kkkkkbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkkkkk........................",
  "........................kkkkkbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbdbdbbbbbbbbbkkkkk......................",
  ".......................kkkkbbbbbbbbbbbbbbbbbbbbbdbdbbbbbbbbbbdbbbbbbbbbbbbkkkk.....................",
  "......................kkkdbbbbbbbbbbbbbbbbbbbbbbbdbbbbbbbbbbbbbbbbbbbbbbbbbbkkk....................",
  ".....................kkkdbbbbbbbbbbbbbbbbbbbbbbbbbbbbbdbdbbbbbbbbbbbbbbbbbbbbkkk...................",
  "....................kkkdbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbdbbbbbbbbbbbbbbbbbbbbbbkkk..................",
  "...................kkkdbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkkk.................",
  "..................kkkdbbbbbbbbbbbbbbbfffffffbbbbbbbbbbbbbbbbbfffffffbbbbbbbbbbbbkkk................",
  ".................kkkddbbbbbbbbbbbbbfffffffffffbbbbbbbbbbbbbfffffffffffbbbbbbbbbbbkkk...............",
  "................kkkddbbbbbbbbbbbbfffffffffffffffbbbbbbbbbfffffffffffffffbbbbbbbbbbkkk..............",
  "................kkdddbbbbbbbbbbbfffffffffffffffffbbbbbbbfffffffffffffffffbbbbbbbbbbkk..............",
  ".......kkkkkkkkkkkdddbbbbbbbbbbfffffffffffffffffffbbbbbfffffffffffffffffffbbbbbbbbbkkkkkkkkkkk.....",
  ".....kkkkkkkkkkkkdddbbbbbbbbbbffffffffffkkkffffffffbbbffffffffkkkffffffffffbbbbbbbbbkkkkkkkkkkk....",
  "....kkkkfffffffkkdddbbbbbbbbbffffffffffkkkkkffffffffbffffffffkkkkkffffffffffbbbbbbbbkkfffffffkkk...",
  "...kkkffffffffkkkdddbbbbbbbbbfffffffffkwwwkkkfffffffbfffffffkwwwkkkfffffffffbbbbbbbbkkkfffffffkkk..",
  "..kkkfffffffffkkdddbbbbbbbbbffffffffffkwwwkkkfffffffffffffffkwwwkkkffffffffffbbbbbbbbkkffffffffkkk.",
  ".kkkffffffffffkkdddbbbbbbbbbffffffffffkwwwkkkfffffffffffffffkwwwkkkffffffffffbbbbbbbbkkfffffffffkk.",
  ".kkfffffnnnnnkkkdddbbbbbbbbbffffffffffkwwkkkkfffffffffffffffkwwkkkkffffffffffbbbbbbbbkkknnnnffffkkk",
  "kkkffffnnnnnnkkddddbbbbbbbbfffffffffffkkkkkkkfffffffffffffffkkkkkkkfffffffffffbbbbbbbbkknnnnnffffkk",
  "kkfffffnnnnnnkkddddbbbbbbbbfffffffffffkkkkkkkfffffffffffffffkkkkkkkfffffffffffbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbfffffffffffkkkkkkkfffffffffffffffkkkkkkkfffffffffffbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbfffffffffffkkkkkkkfffffffffffffffkkkkkkkfffffffffffbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbfffffffffffkkkkkkkfffffffffffffffkkkkkkkfffffffffffbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbfffffffffffkkkkkwkfffffffffffffffkkkkkwkfffffffffffbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbfffffffffffkkkkkkkfffffffffffffffkkkkkkkfffffffffffbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbbfffffffffffkkkkkfffffffffffffffffkkkkkfffffffffffbbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbbffffffffffffkkkfffffffffffffffffffkkkffffffffffffbbbbbbbbbkknnnnnnfffkk",
  "kkffffnnnnnnnkkddddbbbbbbbbbfffffffffffffffffffffffffffffffffffffffffffffffffbbbbbbbbbkknnnnnffffkk",
  "kkfffffnnnnnnkkddddbbbbbbbbbbfffffffffffffffffffffffffffffffffffffffffffffffbbbbbbbbbbkknnnnffffkkk",
  "kkkffffnnnnnnkkdddddbbbbbbbbbfffnnnnnnffffffffffffffffffffffffffffffffffnnnnbbbbbbbbbbkkffffffffkk.",
  ".kkfffffnnnnnkkdddddbbbbbbbbbbfnnnnnnnnfffffffffffkkffffkkfffffffffffffnnnnbbbbbbbbbbbkkfffffffkkk.",
  ".kkkfffffffffkkdddddbbbbbbbbbbbnnnnnnnnfffffffffffkkffffkkfffffffffffffnnnbbbbbbbbbbbbkkffffffkkk..",
  "..kkkffffffffkkkdddddbbbbbbbbbbbnknnnnffffffffffffffffffffffffffffffffffnknnbbbbbbbbbkkkfffffkkk...",
  "...kkkffffffffkkdddddbbbbbbbbbbbbkkkkkfffffffffffffffffffffffffffffffkkkkkffffbbbbbbbkkkkkkkkkk....",
  "....kkkkffffffkkdddddbbbbbbbbbbbkkwwwkkkkkkkkfffffffffffffffffkkkkkkkkwwwkkffffbbbbbbkkkkkkkkk.....",
  ".....kkkkkkkkkkkkdddddbbbbbbbbffkkwwwwwwwkkkkkkkkkkkkkkkkkkkkkkkkkwwwwwwwkkffffffbbbkkk............",
  ".......kkkkkkkkkkdddddbbbbbbbfffkkwwwwwwwkwwwwwkwwwwwkwwwwwkwwwwwkwwwwwwwkkfffffffbbkk.............",
  "...............kkddddddbbbbbffffkkwwwwwwwkwwwwwkwwwwwkwwwwwkwwwwwkwwwwwwwkkffffffffbkk.............",
  "...............kkkddddddbbbbffffkkwwwwwwwkwwwwwkwwwwwkwwwwwkwwwwwkwwwwwwwkkffffffffbkkk............",
  ".kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk......",
  "krrrrrkglgkpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppfffffkk....",
  "krrrrrkglgkyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyffffffkkk..",
  "krrrrrkglgkyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyfffffffkkk.",
  "krrrrrkglgkyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyffffffkkk..",
  "krrrrrkglgkyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyfffffkk....",
  ".kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk......",
  "..................kkdddddbffffffffffffkkkkwwkwwwwwkwwwwwkwwwwwkwwkkkkffffffffffffffffkk............",
  "..................kkddddddffffffffffffffkkkkkwwwwwkwwwwwkwwwwwkkkkkffffffffffffffffffkk............",
  "..................kkkdddddbfffffffffffffffkkkkkwwwkwwwwwkwwwkkkkkfffffffffffffffffffkkk............",
  "...................kkddddddffffffffffffffffffkkkkkkkkwkkkkkkkkffffffffffffffffffffffkk.............",
  "...................kkkddddddffffffffffffffffffffkkkkkkkkkkkffffffffffffffffffffffffkkk.............",
  "....................kkddddddfffffffffffffffffffffffffffffffffffffffffffffffffffffffkk..............",
  "....................kkkddddddfffffffffffffffffffffffffffffffffffffffffffffffffffffkkk..............",
  ".....................kkkddddddfffffffffffffffffffffffffffffffffffffffffffffffffffkkk...............",
  "......................kkkdddddddfffffffffffffffffffffffffffffffffffffffffffffffbkkk................",
  ".......................kkkdddddddfffffffffffffffffffffffffffffffffffffffffffffdkkk.................",
  ".......................kkkkddddddddfffffffffffffffffffffffffffffffffffffffffddkkk..................",
  ".....................kkkkkkkkdddddddddfffffffffffffffffffffffffffffffffffdddkkkk...................",
  "...................kkkkkddkkkkkddddddddddfffffffffffffffffffffffffffffddddkkkkkkkk.................",
  "..................kkkkddddddkkkkkkdddddddddddddfffffffffffffffffdddddddkkkkkkddkkkk................",
  "................kkkkbbddddddddkkkkkkkdddddddddddddddddddddddddddddddkkkkkkkddddddkkkk..............",
  "...............kkkkbbbbddddddddddkkkkkkkkkkdddddddddddddddddddkkkkkkkkkkddddddddbbkkkk.............",
  "..............kkkbbbbbbbddddddddddddkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkddddddddddbbbbbkkk............",
  ".............kkkbbbbbbbbbdddddddddddddddddkkkkkkkkkkkkkkkkkkkkkdddddddddddddddbbbbbbbkkk...........",
  "............kkkbbbbbbbbbbbbdddddddddddddddddddddfffffffffffdddddddddddddddddbbbbbbbbbbkkk..........",
  "...........kkkbbbbbbbbbbbbbbbddddddddddddddddfffffffffffffffffddddddddddddbbbbbbbbbbbbbkkk.........",
  "..........kkkbbbbbbbbbbbbbbbbbbbddddddddddfffffffffffffffffffffffddddddbbbbbbbbbbbbbbbbbkkk........",
  ".........kkkbbbbbbbbbbbbbbbbbbbbbbbddddddfffffffffffffffffffffffffddbbbbbbbbbbbbbbbbbbbbbkkk.......",
  "........kkkbbbbdbdbbbbbbbbbbbbbbbbbbbbbfffffffffffffffffffffffffffffbbbbbbbbbbbbbbbbbdbdbbkkk......",
  ".......kkkbbbbbbdbbbbbbbbbbbbbbbbbbbbbfffffffffffffffffffffffffffffffbbbbbbbbbbbbbbbbbdbbbbkkk.....",
  ".......kkbbbbbbbbbbbbbbbkkbbbbbbbbbbbfffffffffffffffffffffffffffffffffbbbbbbbbbkkbbbbbbbbbbbkk.....",
  "......kkkbbbbbbbbbbbbbbbkkbbbbbbbbbbfffffffffffffffffffffffffffffffffffbbbbbbbbkkbbbbbbbbbbbkkk....",
  "......kkbbbbbbbbbbbbbbbbkkbbbbbbbbbfffffffffffffffffffffffffffffffffffffbbbbbbbkkbbbbbbbbbbbbkk....",
  ".....kkkbbbbbbbbbbbbbbbkkbbbbbbbbbfffffffffffffffffffffffffffffffffffffffbbbbbbbkkbbbbbbbbbbbkkk...",
  ".....kkbbbdbdbbbbbbbbbbkkbbbbbbbbbfffffffffffffffffffffffffffffffffffffffbbbbbbbkkbbbbbbdbdbbbkk...",
  "....kkkbbbbdbbbbbbbbbbbkkbbbbbbbbfffffffffffffffffffffffffffffffffffffffffbbbbbbkkbbbbbbbdbbbbkkk..",
  "....kkbbbbbbbbbbbbbbbbkkbbbbbbbbfffffffffffffffffffffffffffffffffffffffffffbbbbbbkkbbbbbbbbbbbbkk..",
  "...kkkbbbbbbbbbbbbbbbbkkbbbbbbbbfffffffffffffffffffffffffffffffffffffffffffbbbbbbkkbbbbbbbbbbbbkkk.",
  "...kkbbbbbbbbbbbbbbbbbkkbbbbbbbfffffffffffffffffffffffffffffffffffffffffffffbbbbbkkbbbbbbbbbbbbbkk.",
];

// ---------------------------------------------------------------------------------------------
// Putting it together.

const MIDDLE = 63;                 // the column the title and the monkey are centred on
const BURST = { x: 63, y: 106 };   // where the rays start: between his eyes
const RAYS = 24;                   // wedges in the burst, pale and yellow by turns
const HINGE = 7;                   // the groove where the board folds, next to the spine

const board = Array.from({ length: H }, () => Array(W).fill("y"));
const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) board[y][x] = c; };

// The burst of rays.
for (let y = 0; y < H; y++) {
  for (let x = HINGE + 1; x < W; x++) {
    const turn = Math.atan2(y + 0.5 - BURST.y, x + 0.5 - BURST.x) / (2 * Math.PI) + 1;
    if (Math.floor(turn * RAYS + 0.5) % 2) board[y][x] = "p";
  }
}

// The board's edge in ink, the hinge, and the stepped corners.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const fromEdge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (fromEdge < 3) board[y][x] = "k";
  }
  board[y][HINGE] = "k";
}
for (const [cx, cy] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) {
  const sx = cx ? -1 : 1, sy = cy ? -1 : 1;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) set(cx + dx * sx, cy + dy * sy, ".");   // cut
  set(cx + 3 * sx, cy + 3 * sy, "k");                                                       // filled
}

// A word set in one of the alphabets, as rows of X and ".".
function setWord(text, letters, gap) {
  const height = letters[text[0]].length;
  return Array.from({ length: height }, (_, r) => [...text].map((ch) => letters[ch][r]).join(".".repeat(gap)));
}

// Stamp a word, centred on MIDDLE: a line of ink all round every letter, the same shape pushed
// down and to the right `depth` times for the hard shadow, then the white faces on top.
// `foot` rows of solid ink under the word join it to the line below, so the title is one slab.
function stampWord(rows, top, depth, foot = 0) {
  const wide = rows[0].length, tall = rows.length;
  const left = MIDDLE - Math.floor(wide / 2);
  const on = (x, y) => y >= 0 && y < tall && rows[y][x] === "X";
  for (let y = -1; y <= tall; y++) {
    for (let x = -1; x <= wide; x++) {
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) near = true;
      if (!near) continue;
      for (let d = 0; d <= depth; d++) set(left + x + d, top + y + d, "k");
    }
  }
  for (let y = 0; y < foot; y++) for (let x = -1; x <= wide; x++) set(left + x, top + tall + y, "k");
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "X") set(left + x, top + y, "w"); });
}

// "THE" rides on a red tag on top of the slab.
function stampTag(rows, top) {
  const wide = rows[0].length, tall = rows.length;
  const left = MIDDLE - Math.floor(wide / 2);
  for (let y = -2; y <= tall + 1; y++) {
    for (let x = -3; x <= wide + 2; x++) {
      const corner = (x === -2 || x === wide + 1) && (y === -1 || y === tall);
      const edge = y === -2 || y === tall + 1 || x === -3 || x === wide + 2;
      set(left + x, top + y, edge || corner ? "k" : "r");
    }
  }
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "X") set(left + x, top + y, "w"); });
}

stampTag(setWord("THE", SMALL, 2), 7);
stampWord(setWord("INFINITE", BIG, 3), 17, 2, 4);
stampWord(setWord("MONKEY", HUGE, 3), 37, 3);

// Tidy the slab, so the title reads as white letters on one block of ink. First the slits: a
// run of board up to three pixels wide with ink on both sides of it is inked over. Then the
// pockets: board walled in by ink on every side is inked over too.
const TITLE = { x0: HINGE + 1, y0: 3, x1: W - 4, y1: 62 };
const solid = (x, y) => board[y][x] !== "y" && board[y][x] !== "p";   // anything that is not bare board

function inkSlits(most) {
  const { x0, y0, x1, y1 } = TITLE;
  const fill = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (solid(x, y)) continue;
      let a = x, b = x;
      while (a > x0 && !solid(a - 1, y)) a--;
      while (b < x1 && !solid(b + 1, y)) b++;
      if (a > x0 && b < x1 && b - a < most) fill.push([x, y]);
    }
  }
  for (const [x, y] of fill) board[y][x] = "k";
}

function inkPockets() {
  const { x0, y0, x1, y1 } = TITLE;
  const seen = new Set();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (solid(x, y) || seen.has(y * W + x)) continue;
      const pocket = [], todo = [[x, y]];
      let open = false;
      seen.add(y * W + x);
      while (todo.length) {
        const [cx, cy] = todo.pop();
        pocket.push([cx, cy]);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) { open = true; continue; }
          if (solid(nx, ny) || seen.has(ny * W + nx)) continue;
          seen.add(ny * W + nx);
          todo.push([nx, ny]);
        }
      }
      if (!open) for (const [px, py] of pocket) board[py][px] = "k";
    }
  }
}

inkSlits(3);
inkPockets();

// The monkey.
MONKEY.forEach((row, y) => {
  for (let x = 0; x < row.length; x++) if (row[x] !== ".") set(MONKEY_AT.x + x, MONKEY_AT.y + y, row[x]);
});

export const COVER = { w: W, h: H, palette: PALETTE, rows: board.map((row) => row.join("")) };
