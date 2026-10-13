// Cover A, "The storybook": a classic picture-book cover. A stepped border round a banana-yellow
// board, the title stacked in three lines with a banana on each side of THE, and under it, in a
// white arch, the monkey on a small pile of books, writing in the open book on his lap with a quill.
//
// Everything drawn by hand is a plain array below, one character per art pixel: change a letter
// and you have changed a pixel. The code at the bottom only puts the pieces on the board.
//
//   .  nothing (in a piece: leave what is underneath)
//   y  banana yellow, the board      k  ink
//   w  white                         g  mid grey         e  dark grey
//   b  fur     d  dark fur           f  face, belly, hands and feet
//   r  red
// Two colours are not in the shared palette:
//   u  blue, the middle book         h  a lighter yellow, the rays behind him
//
// Scratch tools beside this file: a-check.mjs (is the data sound?) and a-crop.mjs (a part as a PNG).

const W = 120, H = 160;

const palette = {
  ".": null,
  y: "#ffd21f",
  h: "#ffdc4d",
  k: "#1d1d2b",
  w: "#ffffff",
  g: "#c2c3c7",
  e: "#5f5d6e",
  b: "#a8562e",
  d: "#6e3418",
  f: "#ffcfa3",
  r: "#e0304a",
  u: "#29adff",
};

// ---------------------------------------------------------------------------------------------
// The lettering. X is the body of a letter; the ink line round it and its thick foot are added
// by the code. 16 high, strokes 3 wide.

// prettier-ignore
const BIG = {
  I: [
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
    "XXX",
  ],
  N: [
    "XXXX....XXX",
    "XXXX....XXX",
    "XXXXX...XXX",
    "XXXXX...XXX",
    "XXXXXX..XXX",
    "XXXXXX..XXX",
    "XXXXXX..XXX",
    "XXX.XXX.XXX",
    "XXX.XXX.XXX",
    "XXX..XXXXXX",
    "XXX..XXXXXX",
    "XXX..XXXXXX",
    "XXX...XXXXX",
    "XXX...XXXXX",
    "XXX....XXXX",
    "XXX....XXXX",
  ],
  F: [
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXXXXXXX.",
    "XXXXXXXX.",
    "XXXXXXXX.",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXX......",
  ],
  T: [
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
  ],
  E: [
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXXXXXXX.",
    "XXXXXXXX.",
    "XXXXXXXX.",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXX......",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
  ],
  M: [
    "XXXX.....XXXX",
    "XXXX.....XXXX",
    "XXXXX...XXXXX",
    "XXXXX...XXXXX",
    "XXXXXX.XXXXXX",
    "XXXXXX.XXXXXX",
    "XXX.XXXXX.XXX",
    "XXX.XXXXX.XXX",
    "XXX..XXX..XXX",
    "XXX..XXX..XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
  ],
  O: [
    "..XXXXXXX..",
    ".XXXXXXXXX.",
    "XXXXXXXXXXX",
    "XXXX...XXXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXX...XXXX",
    "XXXXXXXXXXX",
    ".XXXXXXXXX.",
    "..XXXXXXX..",
  ],
  K: [
    "XXX.....XXX",
    "XXX....XXXX",
    "XXX...XXXX.",
    "XXX..XXXX..",
    "XXX..XXXX..",
    "XXX.XXXX...",
    "XXXXXXX....",
    "XXXXXX.....",
    "XXXXXXX....",
    "XXX.XXXX...",
    "XXX.XXXX...",
    "XXX..XXXX..",
    "XXX..XXXX..",
    "XXX...XXXX.",
    "XXX....XXXX",
    "XXX.....XXX",
  ],
  Y: [
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXX...XXXX",
    ".XXXX.XXXX.",
    "..XXXXXXX..",
    "...XXXXX...",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
  ],
};

// The small line, THE: 10 high, strokes 2 wide, plain ink.
// prettier-ignore
const SMALL = {
  T: [
    "XXXXXXXX",
    "XXXXXXXX",
    "...XX...",
    "...XX...",
    "...XX...",
    "...XX...",
    "...XX...",
    "...XX...",
    "...XX...",
    "...XX...",
  ],
  H: [
    "XX....XX",
    "XX....XX",
    "XX....XX",
    "XX....XX",
    "XXXXXXXX",
    "XXXXXXXX",
    "XX....XX",
    "XX....XX",
    "XX....XX",
    "XX....XX",
  ],
  E: [
    "XXXXXXX",
    "XXXXXXX",
    "XX.....",
    "XX.....",
    "XXXXXX.",
    "XXXXXX.",
    "XX.....",
    "XX.....",
    "XXXXXXX",
    "XXXXXXX",
  ],
};

// ---------------------------------------------------------------------------------------------
// The monkey, in pieces. He faces right, as he does on the page.

// His head: the tuft, the ear at the back, the two-lobed face, tall eyes, the smile, and the tip
// of his tongue out (he is concentrating).
// prettier-ignore
const HEAD = [
  "................kk....................",
  "...............kbbk.kk................",
  "...............kbbbkbbk...............",
  "............kkkkbbbbbbbkkkkkk.........",
  "..........kkbbbbbbbbbbbbbbbbbkk.......",
  "........kkdbbbbbbbbbbbbbbbbbbbbkk.....",
  ".......kdbbbbbbbbbbbbbbbbbbbbbbbbk....",
  "......kdbbbbbbbbbbbbbbbbbbbbbbbbbbk...",
  "......kddbbbbbbbbbfffffbbbbbfffffbk...",
  "......kddbbbbbbbffffffffbbbbffffffk...",
  "......kddbbbbbbffffffffffbbfffffffk...",
  "......kddbbbbbffffffffffffffffffffk...",
  ".kkkkkkddbbbbbfffffkkkfffffffkkkffk...",
  "kfffffkddbbbbbfffffkwkfffffffkwkffk...",
  "kffddfkddbbbbbfffffkwkfffffffkwkffk...",
  "kfdfffkddbbbbbfffffkkkfffffffkkkffk...",
  "kfdfffkddbbbbbfffffkkkfffffffkkkffk...",
  "kfdfffkddbbbbbfffffkkkfffffffkkkffk...",
  "kffddfkddbbbbbfffffkkkfffffffkkkffk...",
  "kfffffkddbbbffffffffffffffffffffffkk..",
  ".kkkkkkddbbbffffffffffffffffffffffffk.",
  "......kddbbbffffffffffffffffffffkffffk",
  "......kddbbbffffffffffffffffffffkffffk",
  "......kddbbbffffffffffkffffffffkfffffk",
  "......kddbbbbffffffffffkkkkkkkkffffffk",
  ".......kdbbbbbfffffffffffffkrrkffffkk.",
  "........kkdbbbbbffffffffffffkkfffkk...",
  "..........kkdbbbbffffffffffffffkk.....",
  "............kkkkkkkkkkkkkkkkkkk.......",
];

// His body, sitting: the back, the belly, the near leg hanging down over the books.
// prettier-ignore
const BODY = [
  "....kkkkkkkkkkkkkkkk............................",
  "...kbbbbbbbbbffffffbk...........................",
  "...kdbbbbbbbffffffffbk..........................",
  "..kdbbbbbbbbfffffffffk..........................",
  "..kdbbbbbbbbffffffffffk.........................",
  ".kdbbbbbbbbbffffffffffk.........................",
  ".kdbbbbbbbbbffffffffffk.........................",
  ".kdbbbbbbbbbffffffffffk.........................",
  "kdbbbbbbbbbbffffffffffk.........................",
  "kdbbbbbbbbbbffffffffffk.........................",
  "kdbbbbbbbbbbffffffffffk.........................",
  "kdbbbbbbbbbbffffffffffk.........................",
  "kdbbbbbbbbbbffffffffffk.........................",
  "kdbbbbbbbbbbffffffffffk.........................",
  "kdbbbbbbbbbbbfffffffffk.........................",
  "kdbbbbbbbbbbbbffffffffk.........................",
  "kdbbbbbbbbbbbbbffffffbk.........................",
  "kdbbbbbbbbbbbkkkkkkkkkkkkkkkkkkkkkkkk...........",
  "kdbbbbbbbbbbkbbbbbbbbbbbbbbbbbbbbbbbbkk.........",
  "kdbbbbbbbbbkbbbbbbbbbbbbbbbbbbbbbbbbbbbk........",
  "kdbbbbbbbbbkbbbbbbbbbbbbbbbbbbbbbbbbbbbk........",
  "kdbbbbbbbbbkbbbbbbbbbbbbbbbbbbbbbbbbbbbk........",
  "kdbbbbbbbbbkbbbbbbbbbbbbbbbbbbbbbbbbbbbk........",
  ".kbbbbbbbbbbddddddddddddddddddddbbbbbbbk........",
  "..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkbbbbbbk........",
  "................................kdbbbbbk........",
  "................................kdbbbbbk........",
  "................................kdbbbbbk........",
  "................................kdbbbbbk........",
  "................................kdbbbbbk........",
  "................................kdbbbbbk........",
  "................................kdbbbbbk........",
  "................................kffffffkkk......",
  "................................kfffffffffkk....",
  "................................kfffffffffffk...",
  "................................kfffffffffffk...",
  ".................................kkkkkkkkkkk....",
];

// His far leg, swung forward: he is kicking his feet.
// prettier-ignore
const FARLEG = [
  "..kkkkk.....kk..",
  "..kdddddkk.kffk.",
  "..kdddddddkkffk.",
  "..kdddddddddfffk",
  "...kkdddddddfffk",
  ".....kkdddddfffk",
  ".......kkkkfffk.",
  "...........kkk..",
];

// His tail: up his back and round into a curl.
// prettier-ignore
const TAIL = [
  "...kkkkkkk......",
  "..kbbbbbbbk.....",
  ".kdbbbbbbbbk....",
  "kdbbkkkkkbbbk...",
  "kdbbk...kbbbk...",
  "kdbbk.kkbbbbk...",
  "kdbbk.kbbbbk....",
  "kdbbk..kkkk.....",
  "kdbbk...........",
  "kdbbk...........",
  "kdbbk...........",
  "kdbbk...........",
  "kdbbbk..........",
  "kdbbbk..........",
  ".kdbbbk.........",
  ".kddbbbkk.......",
  "..kddbbbbkkkkkkk",
  "...kkddbbbbbbbbb",
  ".....kkddddddddd",
  ".......kkkkkkkkk",
];

// The near arm, reaching over the book, and the fist that holds the quill.
// prettier-ignore
const ARM = [
  "bbbbkkkk.........................kkkkk.",
  "bbbbbbbbkkkk........kkkkkkkkkkkkkfffffk",
  "bbbbbbbbbbbbkkkkkkkkbbbbbbbbbbbbkfffkkk",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkfffffk",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkfffkkk",
  "kbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkfffffk",
  ".kkkbbbbbbbbbbbbbbbbbbbbbbkkkkkkkkkkkk.",
  "....kkkkkkkkkkkkkkkkkkkkkk.............",
];

// The quill: a white feather, its nib down on the page.
// prettier-ignore
const QUILL = [
  "..........kkk.",
  ".........kwgwk",
  ".......kkwwgwk",
  "......kwwwgwwk",
  ".....kwwwwgwwk",
  ".....kwwwwgwwk",
  "....kwwwwgwwk.",
  "....kwwwwgwwk.",
  "...kkwwwgwwk..",
  "...kwwwwgwwk..",
  "...kwwwwgwwk..",
  "..kwwwwgwwk...",
  "..kwwwwgwkk...",
  "..kkwwgwwk....",
  "...kwwgwk.....",
  "....kwgk......",
  "....kgk.......",
  "....kgk.......",
  "....kgk.......",
  "...kgk........",
  "...kgk........",
  "..kgk.........",
  "..kgk.........",
  "..kk..........",
  ".kk...........",
  ".kk...........",
  ".k............",
  ".k............",
  "k.............",
];

// The open book on his lap: two lines written on the left page, the right page still to fill.
// prettier-ignore
const LAPBOOK = [
  "...kkkkkkkkk.....kkkkkkkkk...",
  "..kwwwwwwwwwkk.kkwwwwwwwwwk..",
  "..kwwwwwwwwwwwkwwwwwwwwwwwk..",
  ".kwwgggggggwwwkwwwwwwwwwwwwk.",
  ".kwwwwwwwwwwwwkwwwwwwwwwwwwk.",
  "kwwwggggggggwwkwwwwwwwwwwwwwk",
  "kwwwwwwwwwwwwwkwwwwwwwwwwwwwk",
  "kkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
  "krrrrrrrrrrrrrrrrrrrrrrrrrrrk",
  ".kkkkkkkkkkkkkkkkkkkkkkkkkkk.",
];

// The pile he sits on: three books.
// prettier-ignore
const PILE = [
  ".......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..",
  "......krrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrk.",
  "......krrrkwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwk..",
  "......krrrkgggggggggggggggggggggggggggggwk..",
  "......krrrkwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwk..",
  "......krrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrk.",
  ".kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.",
  "kuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuk",
  ".kwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwkuuuuuuuk",
  ".kwggggggggggggggggggggggggggggggggkuuuuuuuk",
  ".kwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwkuuuuuuuk",
  "kuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuk",
  ".kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.",
  "....kyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyk....",
  "....kyyykwwwwwwwwwwwwwwwwwwwwwwwwwwwwwk.....",
  "....kyyykggggggggggggggggggggggggggggwk.....",
  "....kyyykwwwwwwwwwwwwwwwwwwwwwwwwwwwwwk.....",
  "....kyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyk....",
  ".....kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.....",
];

// A banana for each side of THE (the right one is this one turned round).
// prettier-ignore
const BANANA = [
  ".kk................",
  "kddk...............",
  ".kyk............kk.",
  ".kyyk..........kdk.",
  ".kyyykk.....kkkyyk.",
  ".kywyyykkkkkyyyyyk.",
  "..kywyyyyyyyyyyyk..",
  "..kyywwyyyyyyyyk...",
  "...kkyywwyyyyykk...",
  ".....kkyyyyykk.....",
  ".......kkkkk.......",
];

// The inkwell on the floor.
// prettier-ignore
const INKWELL = [
  "...kkk...",
  "..kgggk..",
  "..kkkkk..",
  ".keeeeek.",
  "keweeeeek",
  "keweeeeek",
  "keeeeeeek",
  "keeeeeeek",
  ".kkkkkkk.",
];

// A star for the corners.
// prettier-ignore
const STAR = [
  "....k....",
  "...kwk...",
  "...kwk...",
  ".kkwwwkk.",
  "kwwwwwwwk",
  ".kkwwwkk.",
  "...kwk...",
  "...kwk...",
  "....k....",
];

// ---------------------------------------------------------------------------------------------
// Putting it together.

const grid = Array.from({ length: H }, () => Array(W).fill("."));
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = c; };

// A piece goes down with its top left corner at x, y; "." leaves what is underneath.
function stamp(rows, x, y) {
  rows.forEach((row, j) => [...row].forEach((c, i) => { if (c !== ".") set(x + i, y + j, c); }));
}

// A shape with stepped corners: a rectangle whose corners are cut in `n` stairs of `s` pixels.
const stepped = (x0, y0, x1, y1, s, n) => (x, y) => {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y);
  return Math.floor(dx / s) + Math.floor(dy / s) >= n;
};
const fill = (inside, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) set(x, y, c); };
// The edge of a shape, `t` pixels thick, on the inside.
const edge = (inside, t) => (x, y) => {
  if (!inside(x, y)) return false;
  for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) if (!inside(x + dx, y + dy)) return true;
  return false;
};

// A line of lettering: the letters side by side, `gap` pixels apart, as rows of X and ".".
function letters(font, text, gap) {
  const h = font[text[0]].length;
  const rows = Array.from({ length: h }, () => "");
  [...text].forEach((ch, n) => {
    font[ch].forEach((row, j) => { rows[j] += (n ? ".".repeat(gap) : "") + row; });
  });
  return rows;
}

// Big lettering: white body, an ink line all round, and an ink foot `foot` pixels deep.
function bigLine(text, y, foot = 2) {
  const rows = letters(BIG, text, 3);
  const w = rows[0].length, h = rows.length;
  const x0 = Math.floor((W - w) / 2);
  const body = (i, j) => j >= 0 && j < h && i >= 0 && i < w && rows[j][i] === "X";
  const line = (i, j) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (body(i + a, j + b)) return true; return false; };
  for (let j = -1; j <= h + foot; j++) {
    for (let i = -1; i <= w; i++) {
      if (body(i, j)) set(x0 + i, y + j, "w");
      else if (line(i, j)) set(x0 + i, y + j, "k");
      else { for (let f = 1; f <= foot; f++) if (line(i, j - f)) { set(x0 + i, y + j, "k"); break; } }
    }
  }
}

// Small lettering: plain ink. Gives back where the line starts and ends.
function smallLine(text, y) {
  const rows = letters(SMALL, text, 2);
  const x0 = Math.floor((W - rows[0].length) / 2);
  stamp(rows.map((r) => r.replaceAll("X", "k")), x0, y);
  return { x0, x1: x0 + rows[0].length - 1 };
}

// The board, its ink edge and the frame line inside it.
const board = stepped(0, 0, W - 1, H - 1, 2, 2);
fill(board, "y");
fill(edge(board, 2), "k");
const frame = stepped(6, 6, W - 7, H - 7, 3, 2);
fill(edge(frame, 1), "k");

// The white arch he sits in: a half circle of radius R round CX, CY, then straight down to FLOOR.
const CX = 60, CY = 106, R = 38, FLOOR = 147;
const arch = (x, y) => {
  if (y > FLOOR + 1) return false;
  if (y >= CY) return Math.abs(x + 0.5 - CX) <= R;
  return (x + 0.5 - CX) ** 2 + (y + 0.5 - CY) ** 2 <= R * R;
};

// Rays of a lighter yellow inside the frame, fanning out from the middle of the arch.
const RAYS = 16;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!frame(x, y) || grid[y][x] !== "y") continue;
    const turn = Math.atan2(y + 0.5 - CY, x + 0.5 - CX) / (2 * Math.PI) + 0.25;
    if (Math.floor(turn * RAYS + 0.5) % 2 === 0) set(x, y, "h");
  }
}

// The title, with a banana on each side of THE.
const flip = (rows) => rows.map((row) => [...row].reverse().join(""));
const the = smallLine("THE", 10);
bigLine("INFINITE", 24);
bigLine("MONKEY", 45);
stamp(BANANA, the.x0 - 7 - BANANA[0].length, 9);
stamp(flip(BANANA), the.x1 + 8, 9);

// The arch, white with an ink edge.
fill(arch, "w");
fill(edge(arch, 2), "k");

// A star in each corner round the arch.
stamp(STAR, 13, 71);
stamp(STAR, W - 22, 71);
stamp(STAR, 10, 138);
stamp(STAR, W - 19, 138);

// The monkey and his books. gx, gy is the top left of the whole group.
const gx = 18, gy = 75;
stamp(TAIL, gx + 10, gy + 33);
stamp(PILE, gx + 11, gy + 53);
stamp(INKWELL, gx + 66, gy + 63);
stamp(FARLEG, gx + 57, gy + 50);
stamp(BODY, gx + 22, gy + 28);
stamp(LAPBOOK, gx + 41, gy + 39);
stamp(QUILL, gx + 57, gy + 14);
stamp(ARM, gx + 26, gy + 30);
stamp(HEAD, gx + 14, gy);

// The pieces, for a-check.mjs. The drawing itself is COVER.
export const ART = { BIG, SMALL, HEAD, BODY, FARLEG, TAIL, ARM, QUILL, LAPBOOK, PILE, BANANA, INKWELL, STAR };
export const COVER = { w: W, h: H, palette, rows: grid.map((row) => row.join("")) };
