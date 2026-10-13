// The monkey, as an 8-bit sprite. He is drawn by hand, one character per art pixel, on a 24 x 24
// grid, facing right, feet on the bottom row. Change a letter below and you have changed a pixel.
//
//   .  nothing                         k  ink: outline, eyes, mouth
//   b  fur                             d  dark fur: the shaded side of his far limbs
//   f  face, belly, hands and feet     y  banana
//   r  the inside of his mouth         z  the Zs of his sleep, painted in the text colour around him
//
// No imports and no knowledge of the page. createMonkeySprite({ scale }) gives back:
//   el            the <canvas>, FRAME.w * scale by FRAME.h * scale CSS pixels, hard pixels
//   set(pose)     start a looping pose: "idle" | "walk" | "think" | "push" | "sit" | "eat" | "sleep"
//   stamp()       one strike on a letter; hands alternate; back to "idle" 200 ms after the last one
//   jump(phase)   "up" | "air" | "land": shows that drawing (the page moves him); "land" ends in "idle"
//   joy()         a jump for joy on the spot, once, then "idle"; a promise that resolves at the end
//   face(dir)     "right" | "left" (mirrored; the Zs stay readable)
//   setScale(n)   whole number of CSS pixels per art pixel
//   still(on)     true holds him on the plain standing drawing
//   state         the pose he is in ("stamp", "jump" and "joy" too, while they last)
// Everything he does is drawn inside the canvas: the Zs and the banana are in the 24 x 24 frame.

export const FRAME = { w: 24, h: 24 };

export const PALETTE = {
  k: "#1d1d2b",
  b: "#a8562e",
  d: "#6e3418",
  f: "#ffcfa3",
  y: "#ffd21f",
  r: "#e0304a",
};

// Where his fist meets the line when he strikes a letter: the art pixel in the middle of the fist,
// counted from the top left of the frame while he faces right. Facing left it is FRAME.w - 1 - x.
export const STRIKE = { x: 20, y: 23 };

// prettier-ignore
export const FRAMES = {
  // idle: breathing. blink0 and blink1 are the same two drawings with his eyes shut.
  idle0: [
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    ".kkk....kkkkkkkk........",
    "kbbbk..kbbbbbbbk........",
    "kbkbk.kbbbbbbffbk.......",
    "kbkkk.kbbkbbffffk.......",
    "kbk...kbbkbbffffk.......",
    "kbbkk.kbbkbbffffk.......",
    ".kbbbbkffkbbbffbk.......",
    "..kkkkkffkbbbbbbk.......",
    ".......kkbbkdbkk........",
    "........kbbkdbk.........",
    "........kbbkkdbk........",
    "........kfffkfffk.......",
  ],
  idle1: [
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    ".kkk...kkkkkkkkk........",
    "kbbbk.kbbbbbbffbk.......",
    "kbkbk.kbbkbbffffk.......",
    "kbkkk.kbbkbbffffk.......",
    "kbbkk.kbbkbbffffk.......",
    ".kbbbbkffkbbbffbk.......",
    "..kkkkkffkbbbbbbk.......",
    ".......kkbbkdbkk........",
    "........kbbkdbk.........",
    "........kbbkkdbk........",
    "........kfffkfffk.......",
  ],
  blink0: [
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffffffffk......",
    "...kffkbbffffffffk......",
    "...kffkbbfkkffkkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    ".kkk....kkkkkkkk........",
    "kbbbk..kbbbbbbbk........",
    "kbkbk.kbbbbbbffbk.......",
    "kbkkk.kbbkbbffffk.......",
    "kbk...kbbkbbffffk.......",
    "kbbkk.kbbkbbffffk.......",
    ".kbbbbkffkbbbffbk.......",
    "..kkkkkffkbbbbbbk.......",
    ".......kkbbkdbkk........",
    "........kbbkdbk.........",
    "........kbbkkdbk........",
    "........kfffkfffk.......",
  ],
  blink1: [
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffffffffk......",
    "...kffkbbffffffffk......",
    "...kffkbbfkkffkkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    ".kkk...kkkkkkkkk........",
    "kbbbk.kbbbbbbffbk.......",
    "kbkbk.kbbkbbffffk.......",
    "kbkkk.kbbkbbffffk.......",
    "kbbkk.kbbkbbffffk.......",
    ".kbbbbkffkbbbffbk.......",
    "..kkkkkffkbbbbbbk.......",
    ".......kkbbkdbkk........",
    "........kbbkdbk.........",
    "........kbbkkdbk........",
    "........kfffkfffk.......",
  ],

  // walk: far foot back, passing, near foot back, passing. Also his run.
  walk0: [
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    ".kkk....kkkkkkkk........",
    "kbbbk..kbbbbbbbk........",
    "kbkbk.kbbbbbbffbk.......",
    "kbkkk.kbbkbbffffk.......",
    "kbk..kkbkbbbffffk.......",
    "kbbkkffbkbbbffffk.......",
    ".kbbkffkbbbbbffbk.......",
    "..kkkkkbbbbbbbbbk.......",
    "......kkdbkkbbkk........",
    ".....kdbkk..kkbbk.......",
    ".....kfffk...kfffk......",
  ],
  walk1: [
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    "........kkkkkkkk........",
    ".kkk...kbbbbbbbk........",
    "kbbbk.kbbbbbbffbk.......",
    "kbkbk.kbbkbbffffk.......",
    "kbkkk.kbbkbbffffk.......",
    "kbbkk.kbbkbbffffk.......",
    ".kbbbbkffkbbbffbk.......",
    "..kkkkkffkbbbbbbk.......",
    ".......kkkbbkdbk........",
    ".........kbbkdbk........",
    ".........kbbkfffk.......",
    ".........kfffkkk........",
  ],
  walk2: [
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    ".kkk....kkkkkkkk........",
    "kbbbk..kbbbbbbbk........",
    "kbkbk.kbbbbbbffbk.......",
    "kbkkk.kbbbbbbfffk.......",
    "kbk...kbbbkkbbbfkk......",
    "kbbkk.kbbbbbkkbbffk.....",
    ".kbbbbkbbbbbbfkkffk.....",
    "..kkkkkbbbbbbbbbkk......",
    "......kkbbkkdbkk........",
    ".....kbbkk..kkdbk.......",
    ".....kfffk...kfffk......",
  ],
  walk3: [
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    "........kkkkkkkk........",
    ".kkk...kbbbbbbbk........",
    "kbbbk.kbbbbbbffbk.......",
    "kbkbk.kbbkbbffffk.......",
    "kbkkk.kbbkbbffffk.......",
    "kbbkk.kbbkbbffffk.......",
    ".kbbbbkffkbbbffbk.......",
    "..kkkkkffkbbbbbbk.......",
    ".......kkbbkkdbk........",
    ".......kbbbkkdbk........",
    "......kfffk.kdbk........",
    ".......kkk..kfffk.......",
  ],

  // stamp: near fist down; then near fist up and far fist down.
  stamp0: [
    "........................",
    "........................",
    "........................",
    "...........kk...........",
    "..........kbbkkkk.......",
    "........kkbbbbbbbkk.....",
    ".......kbbbbbbbbbbbk....",
    ".......kbbbbffbbffbk....",
    ".....kkkbbbffkfffkfk....",
    ".....kffkbbffkfffkfk....",
    ".....kffkbbffkfffkfk....",
    ".....kkkbbfffffffffkk...",
    ".kkk...kbbffffffffkfk...",
    "kbbbk..kbbbffffkkkffk...",
    "kbkbk...kkbbffffffkk....",
    "kbkkk..kkkkkkkkkkk......",
    "kbk...kbbbbbbkbbbbk.....",
    "kbbkk.kbbbbbffkbbbk.....",
    ".kbbbbkbbbbbbffkbbbk....",
    "..kkkkkbbbbbbbbbkbbk....",
    ".......kkbbkdbkk.kbbkk..",
    "........kbbkdbk...kfffk.",
    "........kbbkkdbk..kfffk.",
    "........kfffkfffk.kfffk.",
  ],
  stamp1: [
    "........................",
    "........................",
    "..........kk............",
    ".........kbbkkkk........",
    ".......kkbbbbbbbkk......",
    "......kbbbbbbbbbbbk.....",
    "......kbbbbffbbffbk.....",
    "....kkkbbbffkfffkfk.....",
    "....kffkbbffkfffkfk.....",
    "....kffkbbffkfffkfk.....",
    "....kkkbbfffffffffkk....",
    "......kbbffffffffkfk....",
    "......kbbbffffkkkffk....",
    ".kkk...kkbbffffffkk.....",
    "kbbbk.kkkkkkkkkkk..kkk..",
    "kbkbk.kbbbbbbffbkkkfffk.",
    "kbkkk.kbbbbbfffkbbbfffk.",
    "kbbkk.kbbbbbfffkbbbfffk.",
    ".kbbbbkbbbbbbffbkkkkkk..",
    "..kkkkkbbbbbbbbbkdbk....",
    ".......kkbbkdbkk.kdbkk..",
    "........kbbkdbk...kfffk.",
    "........kbbkkdbk..kfffk.",
    "........kfffkfffk.kfffk.",
  ],

  // jump: the crouch before, the leap, the landing.
  jumpUp: [
    "........................",
    "........................",
    "........................",
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    ".kkk..kkbbffffffkk......",
    "kbbbk...kkkkkkkk........",
    "kbkbk..kbbbbbbbk........",
    "kbkkk.kbbkbbffffk.......",
    "kbbkk.kbbkbbbffbk.......",
    ".kbbbbkffkbbbbbbk.......",
    "..kkkkkffkbkddbk........",
    ".......kkbbkkdbk........",
    "........kfffkfffk.......",
  ],
  jumpAir: [
    "..........kk............",
    ".........kbbkkkk........",
    ".......kkbbbbbbbkk......",
    "......kbbbbbbbbbbbk.....",
    "......kbbbbffbbffbk.....",
    "....kkkbbbffkfffkfk.....",
    "....kffkbbffkfffkfk.....",
    "....kffkbbffkfffkfk.....",
    "....kkkbbfffffffffkk....",
    "......kbbffffffffkfk....",
    "......kbbbffffkkkffk....",
    ".......kkbbffffffkk.....",
    ".........kkkkkkkk.......",
    ".......kbbbbbbbk...kkk..",
    ".kk...kbbbbbbffbkkkfffk.",
    "kbbk..kbbbbbfffkbbbfffk.",
    "kkbbkkkbbbbbfffkbbbfffk.",
    "..kbbbkbbbbbffffkkkkkk..",
    "...kkbkbbbbbbffbk.......",
    ".....kkbbbbbbbbbk.......",
    "......kkbbkdbkkk........",
    ".....kbbkkdbkk..........",
    "....kfffkfffk...........",
    ".....kkk.kkk............",
  ],
  jumpLand: [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "..........kk............",
    ".........kbbkkkk........",
    ".......kkbbbbbbbkk......",
    "......kbbbbbbbbbbbk.....",
    "......kbbbbffbbffbk.....",
    "....kkkbbbffkfffkfk.....",
    "....kffkbbffkfffkfk.....",
    "....kffkbbffkfffkfk.....",
    "....kkkbbfffffffffkk....",
    ".kkk..kbbffffffffkfk....",
    "kbbbk.kbbbffffkkkffk....",
    "kbkbk..kkbbffffffkk.....",
    "kbkkk....kkkkkkkkk......",
    "kbk....kbbbbbbkbbbk.....",
    "kbbkk.kbbbbbfffkbbbk....",
    ".kbbbbkbbbbbbbbbkbbbk...",
    "..kkkkkkbbbkddbk.kfffk..",
    "........kbbkkdbk.kfffk..",
    "........kfffkfffkkfffk..",
  ],

  // think: scratching his head.
  think0: [
    "........................",
    "....kkk...kk............",
    "...kfffk.kbbkkkk........",
    "..kbfffkkbbbbbbbkk......",
    ".kbbkkkbbbbbbbbbbbk.....",
    ".kbbk.kbbbbffbbffbk.....",
    ".kbbkkkbbbffkfffkfk.....",
    ".kbbkffkbbffkfffkfk.....",
    ".kbbkffkbbffffffffk.....",
    ".kbbkkkbbfffffffffkk....",
    ".kbbbkkbbffffffffffk....",
    "..kbbbkbbbfffffkkffk....",
    "...kkbbkkbbffffffkk.....",
    ".....kkbbkkkkkkkk.......",
    "......kbbbbbbffbk.......",
    "kkk...kbbbbbffffk.......",
    "kbk...kbbbbbffffk.......",
    "kbkk..kbbbbbffffk.......",
    "kbbbkkkbbbbbbffbk.......",
    ".kkbbbkbbbbbbbbbk.......",
    "...kkkkkkbbkdbkk........",
    "........kbbkdbk.........",
    "........kbbkkdbk........",
    "........kfffkfffk.......",
  ],
  think1: [
    "....kkk.................",
    "...kfffk..kk............",
    "..kbfffk.kbbkkkk........",
    ".kbbkkkkkbbbbbbbkk......",
    ".kbbk.kbbbbbbbbbbbk.....",
    ".kbbk.kbbbbffbbffbk.....",
    ".kbbkkkbbbffkfffkfk.....",
    ".kbbkffkbbffkfffkfk.....",
    ".kbbkffkbbffffffffk.....",
    ".kbbkkkbbfffffffffkk....",
    ".kbbbkkbbffffffffffk....",
    "..kbbbkbbbfffffkkffk....",
    "...kkbbkkbbffffffkk.....",
    ".....kkbbkkkkkkkk.......",
    "......kbbbbbbffbk.......",
    "kkk...kbbbbbffffk.......",
    "kbk...kbbbbbffffk.......",
    "kbkk..kbbbbbffffk.......",
    "kbbbkkkbbbbbbffbk.......",
    ".kkbbbkbbbbbbbbbk.......",
    "...kkkkkkbbkdbkk........",
    "........kbbkdbk.........",
    "........kbbkkdbk........",
    "........kfffkfffk.......",
  ],

  // joy: crouch, then two drawings in the air that alternate.
  joy0: [
    "........................",
    "........................",
    "........................",
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffffffffk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbfkfkfkfkk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffkkkkkfk.....",
    ".....kbbbfffkrrrkfk.....",
    ".kkk..kkbbfffkkkkk......",
    "kbbbk...kkkkkkkk........",
    "kbkbk..kbbbbbbbk........",
    "kbkkk.kbbkbbffffk.......",
    "kbbkk.kbbkbbbffbk.......",
    ".kbbbbkffkbbbbbbk.......",
    "..kkkkkffkbkddbk........",
    ".......kkbbkkdbk........",
    "........kfffkfffk.......",
  ],
  joy1: [
    "..........kk............",
    ".........kbbkkkk........",
    ".......kkbbbbbbbkk......",
    "......kbbbbbbbbbbbk.....",
    "......kbbbbffbbffbk.....",
    "....kkkbbbffffffffk.....",
    "....kffkbbffkfffkfk.....",
    ".kk.kffkbbfkfkfkfkk.....",
    "kffkkkkbbfffffffffkk....",
    "kfffk.kbbffffkkkkkfk....",
    ".kbbbkkbbbfffkrrrkfk....",
    "..kbbbkkkbbfffkkkkk.....",
    "...kkbbbbkkkkkkkk...kkk.",
    ".....kkbbbbbffffkkkkfffk",
    "......kbbbbbffffkbbbfffk",
    "......kbbbbbffffkdddfffk",
    "....kkkbbbbbbffbkkkkkkk.",
    "...kbbkbbbbbbbbbk.......",
    "..kbbkkkkbbkkdbkk.......",
    ".kbbk.kbbkk..kkdbk......",
    ".kbk.kfffk....kfffk.....",
    ".kk...kkk......kkk......",
    "........................",
    "........................",
  ],
  joy2: [
    "..........kk............",
    ".........kbbkkkk........",
    ".......kkbbbbbbbkk......",
    "......kbbbbbbbbbbbk..kk.",
    "......kbbbbffbbffbk.kffk",
    "....kkkbbbffffffffk.kffk",
    "....kffkbbffkfffkfkkdbk.",
    "....kffkbbfkfkfkfkkkbk..",
    "....kkkbbfffffffffkkk...",
    "......kbbffffkkkkkfk....",
    "......kbbbfffkrrrkfk....",
    ".......kkbbfffkkkkk.....",
    ".kkk..kbbkkkkkkkk.......",
    "kfffkkkbbbbbffffk.......",
    "kfffbbbbbbbbffffk.......",
    "kfffbbbbbbbbffffk.......",
    ".kkkkkkbbbbbbffbk.......",
    "...kbbkbbbbbbbbbk.......",
    "..kbbkkkbbbkddbk........",
    ".kbbk...kbbkkdbk........",
    ".kbk....kfffkfffk.......",
    ".kk......kkk.kkk........",
    "........................",
    "........................",
  ],

  // push: shoving something to the right; his palms are on the right edge of the frame.
  push0: [
    "........................",
    "........................",
    "........................",
    "............kk..........",
    "...........kbbkkkk......",
    ".........kkbbbbbbbkk....",
    "........kbbbbbbbbbbbk...",
    "........kbbbbffbbffbk...",
    "......kkkbbbffffffffk...",
    "......kffkbbffffffffk...",
    "......kffkbbfkkffkkfk...",
    "......kkkbbfffffffffkk..",
    "........kbbffffffffffk..",
    "..kkk...kbbbfffkkkkffk..",
    ".kbbbk...kkbbffffffkk...",
    ".kbkbk.....kkkkkkkkkkkk.",
    ".kbkkk.....kbbbbbffbbffk",
    ".kbk......kbbbbbbffbbffk",
    ".kbbkk...kbbbbbbbfkkkffk",
    "..kbbbbbkbbbbbbbbk..kffk",
    "...kkkkkbbbbbbbkk....kk.",
    ".....kkbbbkkkddbk.......",
    "...kkbbkkk...kdbk.......",
    "...kfffk.....kfffk......",
  ],
  push1: [
    "........................",
    "........................",
    "........................",
    "............kk..........",
    "...........kbbkkkk......",
    ".........kkbbbbbbbkk....",
    "........kbbbbbbbbbbbk...",
    "........kbbbbffbbffbk...",
    "......kkkbbbffffffffk...",
    "......kffkbbffffffffk...",
    "......kffkbbfkkffkkfk...",
    "......kkkbbfffffffffkk..",
    "........kbbffffffffffk..",
    "........kbbbfffkkkkffk..",
    "..kkk....kkbbffffffkk...",
    ".kbbbk.....kkkkkkkkkkkk.",
    ".kbkbk.....kbbbbbffbbffk",
    ".kbkkk....kbbbbbbffbbffk",
    ".kbbkk...kbbbbbbbfkkkffk",
    "..kbbbbbkbbbbbbbbk..kffk",
    "...kkkkkbbbbbbbkk....kk.",
    ".....kkddbkkbbbk........",
    "...kkdbkk..kfffk........",
    "...kfffk....kkk.........",
  ],

  // sit: breathing.
  sit0: [
    "........................",
    "........................",
    "........................",
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    "........kkkkkkkk........",
    ".kkk...kbbbbbbbk........",
    "kbbbk.kbbkbbbffbk.......",
    "kbkbk.kbbbkkkfffk.......",
    "kbkkk.kbbbkffkffkkkk....",
    "kbk...kbbkkkkkkkkfffk...",
    "kbbkk.kbbbbbbbbbbfffk...",
    ".kbbbbkbbbbbbbbbbfffk...",
  ],
  sit1: [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffffffkfk.....",
    ".....kbbbffffkkkffk.....",
    "......kkbbffffffkk......",
    ".kkk...kkkkkkkkk........",
    "kbbbk.kbbkbbbffbk.......",
    "kbkbk.kbbbkkkfffk.......",
    "kbkkk.kbbbkffkffkkkk....",
    "kbk...kbbkkkkkkkkfffk...",
    "kbbkk.kbbbbbbbbbbfffk...",
    ".kbbbbkbbbbbbbbbbfffk...",
  ],

  // eat: the banana up, a bite, chewing.
  eat0: [
    "........................",
    "........................",
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk..dd..",
    ".....kbbbbffbbffbk.kyyk.",
    "...kkkbbbffkfffkfk..kyyk",
    "...kffkbbffkfffkfk..kyyk",
    "...kffkbbffkfffkfk..kyyk",
    "...kkkbbfffffffffkk.kyyk",
    ".....kbbffffffffkfkkyyk.",
    ".....kbbbffffkkkffkkyyk.",
    "......kkbbffffffkkkkyyk.",
    "........kkkkkkkkkkfffk..",
    ".......kbbbbbbbbbbfffk..",
    ".kkk..kbbbbbbbbbbbfffk..",
    "kbbbk.kbbbbbbffbkkkkk...",
    "kbkbk.kbbbbbffffk.......",
    "kbkkk.kbbbbbffffkkkk....",
    "kbk...kbbkkkkkkkkfffk...",
    "kbbkk.kbbbbbbbbbbfffk...",
    ".kbbbbkbbbbbbbbbbfffk...",
  ],
  eat1: [
    "........................",
    "........................",
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk......",
    ".....kbbbbffbbffbk......",
    "...kkkbbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kffkbbffkfffkfk......",
    "...kkkbbfffffffffkk.....",
    ".....kbbffffkkkkkkk.....",
    ".....kbbbfffkrryyyk.....",
    "......kkbbfffkkkyyykk...",
    "........kkkkkkkkkkyfffk.",
    ".......kbbbbbbbbbbkfffk.",
    ".kkk..kbbbbbbbbbbbbfffk.",
    "kbbbk.kbbbbbbffbkkkkkk..",
    "kbkbk.kbbbbbffffk.......",
    "kbkkk.kbbbbbffffkkkk....",
    "kbk...kbbkkkkkkkkfffk...",
    "kbbkk.kbbbbbbbbbbfffk...",
    ".kbbbbkbbbbbbbbbbfffk...",
  ],
  eat2: [
    "........................",
    "........................",
    "........................",
    ".........kk.............",
    "........kbbkkkk.........",
    "......kkbbbbbbbkk.......",
    ".....kbbbbbbbbbbbk..dd..",
    ".....kbbbbffbbffbk.kyyk.",
    "...kkkbbbffffffffk..kyyk",
    "...kffkbbffkfffkfk..kyyk",
    "...kffkbbfkfkfkfkk..kyyk",
    "...kkkbbfffffffffkk.kyyk",
    ".....kbbffffffffffkkyyk.",
    ".....kbbbfffffkkffkkyyk.",
    "......kkbbffffffkkkkyyk.",
    "........kkkkkkkkkkfffk..",
    ".......kbbbbbbbbbbfffk..",
    ".kkk..kbbbbbbbbbbbfffk..",
    "kbbbk.kbbbbbbffbkkkkk...",
    "kbkbk.kbbbbbffffk.......",
    "kbkkk.kbbbbbffffkkkk....",
    "kbk...kbbkkkkkkkkfffk...",
    "kbbkk.kbbbbbbbbbbfffk...",
    ".kbbbbkbbbbbbbbbbfffk...",
  ],

  // sleep: lying down; his side rises and the Zs drift.
  sleep0: [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "..............zzzz......",
    "................z.......",
    "...............z........",
    "..............zzzz......",
    "........................",
    "..............kk........",
    ".............kbbkkkk....",
    "...........kkbbbbbbbkk..",
    "..........kbbbbbbbbbbbk.",
    "....kkkkkkkbbbbffbbffbk.",
    "..kkbbbbkkkbbbffffffffk.",
    ".kbbbbbbkffkbbffffffffk.",
    ".kkkkbbbkffkbbfkkffkkfk.",
    "kbbbbkbbkkkbbfffffffffkk",
    "kbkkbkbbbbkbbffffffffffk",
    "kbkbbkbbbbkbbbffffkkfffk",
    "kbkkkkbbbbbkkbbffffffkk.",
    "kbbbbbbbbbbbbkkkkkkkkffk",
  ],
  sleep1: [
    "...................zzzzz",
    "......................z.",
    ".....................z..",
    "....................z...",
    "...................zzzzz",
    "..............zzzz......",
    "................z.......",
    "...............z........",
    "..............zzzz......",
    "........................",
    "........................",
    "..............kk........",
    ".............kbbkkkk....",
    "...........kkbbbbbbbkk..",
    "....kkkkkkkbbbbbbbbbbbk.",
    "..kkbbbbbbkbbbbffbbffbk.",
    ".kbbbbbbkkkbbbffffffffk.",
    ".kbbbbbbkffkbbffffffffk.",
    ".kkkkbbbkffkbbfkkffkkfk.",
    "kbbbbkbbkkkbbfffffffffkk",
    "kbkkbkbbbbkbbffffffffffk",
    "kbkbbkbbbbkbbbffffkkfffk",
    "kbkkkkbbbbbkkbbffffffkk.",
    "kbbbbbbbbbbbbkkkkkkkkffk",
  ],
};

// ---------------------------------------------------------------------------------------------
// The player. Everything below turns the drawings above into a living <canvas>.

// Looping poses: which drawings, and how long each one stays up (ms; a list gives one per drawing).
const LOOPS = {
  idle: { frames: ["idle0", "idle1"], ms: 560 },
  walk: { frames: ["walk0", "walk1", "walk2", "walk3"], ms: 100 },
  think: { frames: ["think0", "think1"], ms: 170 },
  push: { frames: ["push0", "push1"], ms: 170 },
  sit: { frames: ["sit0", "sit1"], ms: 700 },
  eat: { frames: ["eat0", "eat1", "eat2", "eat0", "eat2", "eat0"], ms: [520, 260, 200, 200, 200, 200] },
  sleep: { frames: ["sleep0", "sleep1"], ms: 950 },
};

// Played once.
const JOY = [["joy0", 90], ["joy1", 130], ["joy2", 130], ["joy1", 130], ["joy2", 130], ["joy0", 90]];
const JUMP = { up: "jumpUp", air: "jumpAir", land: "jumpLand" };

const STAMP_HOLD = 200; // ms he keeps the struck pose after the last stamp()
const STAMP_STEP = 85; // the hands never alternate faster than this, however often stamp() is called
const LAND_HOLD = 150;
const BLINK = 120;

// The drawings with Zs in them.
const DREAMS = new Set(Object.keys(FRAMES).filter((name) => FRAMES[name].some((row) => row.includes("z"))));

// A Z is a letter: when he turns round it changes side but must not read backwards. This gives,
// for every "z" pixel of a drawing, the column it goes to in the mirrored picture.
const turned = new WeakMap();
function turnedZs(rows) {
  if (turned.has(rows)) return turned.get(rows);
  const to = new Map();
  const seen = new Set();
  for (let y = 0; y < FRAME.h; y++) {
    for (let x = 0; x < FRAME.w; x++) {
      if (rows[y][x] !== "z" || seen.has(y * FRAME.w + x)) continue;
      const letter = [];
      const todo = [[x, y]];
      seen.add(y * FRAME.w + x);
      let left = x, right = x;
      while (todo.length) {
        const [cx, cy] = todo.pop();
        letter.push([cx, cy]);
        left = Math.min(left, cx);
        right = Math.max(right, cx);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (ny < 0 || ny >= FRAME.h || rows[ny][nx] !== "z" || seen.has(ny * FRAME.w + nx)) continue;
            seen.add(ny * FRAME.w + nx);
            todo.push([nx, ny]);
          }
        }
      }
      for (const [cx, cy] of letter) to.set(cy * FRAME.w + cx, FRAME.w - 1 - right + (cx - left));
    }
  }
  turned.set(rows, to);
  return to;
}

// Paint one drawing on a 2D context, one art pixel per canvas pixel. `ink` colours the "z" pixels.
export function paint(ctx, rows, { flip = false, ink = PALETTE.k } = {}) {
  ctx.clearRect(0, 0, FRAME.w, FRAME.h);
  for (let y = 0; y < FRAME.h; y++) {
    const row = rows[y];
    for (let x = 0; x < FRAME.w; x++) {
      const c = row[x];
      if (c === ".") continue;
      let px = flip ? FRAME.w - 1 - x : x;
      if (c === "z") {
        if (flip) px = turnedZs(rows).get(y * FRAME.w + x);
        ctx.fillStyle = ink;
      } else {
        ctx.fillStyle = PALETTE[c];
      }
      ctx.fillRect(px, y, 1, 1);
    }
  }
}

export function createMonkeySprite({ scale = 3 } = {}) {
  const el = document.createElement("canvas");
  el.width = FRAME.w;
  el.height = FRAME.h;
  el.setAttribute("aria-hidden", "true");
  el.style.display = "block";
  el.style.imageRendering = "crisp-edges";
  el.style.imageRendering = "pixelated";
  const ctx = el.getContext("2d");

  let pose = "idle"; // what `state` says
  let shown = "idle0"; // the drawing on the canvas
  let step = 0; // where he is in a loop
  let flip = false;
  let frozen = false;
  let blinking = false;
  let hand = 1; // the hand that struck last
  let struckAt = 0;
  let frameTimer = 0;
  let blinkTimer = 0;
  let endJoy = null;

  // The Zs take the text colour around him (the CSS `color` the canvas inherits), so they are
  // dark on the white page and light on the night page with nothing to wire up.
  function ink() {
    return (el.isConnected && getComputedStyle(el).color) || PALETTE.k;
  }

  function draw(name) {
    shown = name;
    let rows = FRAMES[name];
    if (blinking && name.startsWith("idle")) rows = FRAMES["blink" + name.slice(4)];
    paint(ctx, rows, { flip, ink: DREAMS.has(name) ? ink() : undefined });
  }

  function stop() {
    clearTimeout(frameTimer);
    clearTimeout(blinkTimer);
    blinking = false;
    if (endJoy) {
      const done = endJoy;
      endJoy = null;
      done();
    }
  }

  function tick() {
    const loop = LOOPS[pose];
    const n = step++ % loop.frames.length;
    draw(loop.frames[n]);
    frameTimer = setTimeout(tick, Array.isArray(loop.ms) ? loop.ms[n] : loop.ms);
  }

  function blinkLater() {
    blinkTimer = setTimeout(() => {
      blinking = true;
      draw(shown);
      blinkTimer = setTimeout(() => {
        blinking = false;
        draw(shown);
        blinkLater();
      }, BLINK);
    }, 1800 + Math.random() * 3600);
  }

  function start(name) {
    stop();
    pose = name;
    step = 0;
    if (frozen) return draw("idle0");
    tick();
    if (name === "idle") blinkLater();
  }

  // Start a looping pose. Asking for the pose he is already in does not restart it.
  function set(name) {
    if (!LOOPS[name] || name === pose) return;
    start(name);
  }

  // One strike on a letter. Call it as often as letters land: the hands alternate at their own
  // pace, and he straightens up by himself a moment after the last one.
  function stamp() {
    if (frozen) return;
    const now = performance.now();
    if (pose !== "stamp") {
      stop();
      pose = "stamp";
      struckAt = 0;
    }
    if (now - struckAt >= STAMP_STEP) {
      hand ^= 1;
      struckAt = now;
      draw("stamp" + hand);
    }
    clearTimeout(frameTimer);
    frameTimer = setTimeout(() => start("idle"), STAMP_HOLD);
  }

  // The page moves the element; he only shows the right drawing: "up" (crouch), "air", "land".
  function jump(phase) {
    if (!JUMP[phase]) return;
    stop();
    pose = "jump";
    if (frozen) return;
    draw(JUMP[phase]);
    if (phase === "land") frameTimer = setTimeout(() => start("idle"), LAND_HOLD);
  }

  // A jump for joy, on the spot. The promise resolves when it is over, or cut short.
  function joy() {
    stop();
    if (frozen) {
      pose = "idle";
      return Promise.resolve();
    }
    pose = "joy";
    return new Promise((resolve) => {
      endJoy = resolve;
      let n = 0;
      (function next() {
        if (n === JOY.length) return start("idle"); // start() settles the promise
        draw(JOY[n][0]);
        frameTimer = setTimeout(next, JOY[n++][1]);
      })();
    });
  }

  function face(dir) {
    const left = dir === "left";
    if (left === flip) return;
    flip = left;
    draw(shown);
  }

  function setScale(n) {
    scale = Math.max(1, Math.round(n) || 1);
    el.style.width = FRAME.w * scale + "px";
    el.style.height = FRAME.h * scale + "px";
  }

  // For visitors who asked for less motion: he stands still until told otherwise.
  function still(on) {
    on = !!on;
    if (on === frozen) return;
    frozen = on;
    start(LOOPS[pose] ? pose : "idle");
  }

  setScale(scale);
  start("idle");

  return {
    el,
    set,
    stamp,
    jump,
    joy,
    face,
    setScale,
    still,
    get state() { return pose; },
    // Not in the contract, handy all the same:
    get facing() { return flip ? "left" : "right"; },
    destroy() { stop(); }, // stops his timers when the page throws him away
  };
}
