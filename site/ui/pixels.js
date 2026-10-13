// Small pixel drawings for the interface, as inline SVG made of whole squares.
// A drawing is rows of characters: "." is empty, any other character paints one art pixel with
// the class "p-<character>" (style.css gives those their colours: k ink, y banana, w paper, g grey).

export function pixelSvg(rows, className = "") {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let rects = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x];
      let run = 1;
      while (row[x + run] === c) run++;
      if (c !== ".") rects += `<rect class="p-${c}" x="${x}" y="${y}" width="${run}" height="1"/>`;
      x += run;
    }
  });
  return `<svg class="px ${className}" style="--w:${w};--h:${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
}

export const ART = {
  moon: [
    "....kkkk..",
    "..kkkk....",
    ".kkkk.....",
    ".kkk......",
    "kkkk......",
    "kkkk......",
    "kkkkk....k",
    ".kkkkkkkkk",
    ".kkkkkkkk.",
    "...kkkkk..",
  ],
  sun: [
    "....kk....",
    ".k..kk..k.",
    "..........",
    "...kkkk...",
    "kk.kkkk.kk",
    "kk.kkkk.kk",
    "...kkkk...",
    "..........",
    ".k..kk..k.",
    "....kk....",
  ],
  soundOff: [
    "....k.....",
    "...kk.....",
    "kkkkk.k..k",
    "kkkkk.k..k",
    "kkkkk..kk.",
    "kkkkk..kk.",
    "kkkkk.k..k",
    "kkkkk.k..k",
    "...kk.....",
    "....k.....",
  ],
  soundOn: [
    "....k.....",
    "...kk...k.",
    "kkkkk....k",
    "kkkkk.k..k",
    "kkkkk..k.k",
    "kkkkk..k.k",
    "kkkkk.k..k",
    "kkkkk....k",
    "...kk...k.",
    "....k.....",
  ],
  help: [
    "..kkkkkk..",
    ".kkkkkkkk.",
    ".kk....kk.",
    ".......kk.",
    ".....kkkk.",
    "....kkkk..",
    "....kk....",
    "..........",
    "....kk....",
    "....kk....",
  ],
  // the mark of X: one broad stroke, one thin one across it
  x: [
    "kkk......k",
    ".kkk....k.",
    "..kkk..k..",
    "..kkk.k...",
    "...kkk....",
    "....kkk...",
    "...k.kkk..",
    "..k..kkk..",
    ".k....kkk.",
    "k......kkk",
  ],
  left: [
    "....k",
    "...kk",
    "..kkk",
    ".kkkk",
    "kkkkk",
    ".kkkk",
    "..kkk",
    "...kk",
    "....k",
  ],
  right: [
    "k....",
    "kk...",
    "kkk..",
    "kkkk.",
    "kkkkk",
    "kkkk.",
    "kkk..",
    "kk...",
    "k....",
  ],
  // two arrows: all the way to where he is writing
  toEnd: [
    "k...k....",
    "kk..kk...",
    "kkk.kkk..",
    "kkkkkkkk.",
    "kkk.kkk..",
    "kk..kk...",
    "k...k....",
  ],
  tick: [
    "......k",
    ".....kk",
    "k...kk.",
    "kk.kk..",
    ".kkk...",
    "..k....",
  ],
  cross: [
    "k...k",
    "kk.kk",
    ".kkk.",
    "kk.kk",
    "k...k",
  ],
  // two sheets, one over the other: copy
  copy: [
    "..kkkkkk",
    "..k....k",
    "kkkkkk.k",
    "k....k.k",
    "k....k.k",
    "k....k.k",
    "k....kkk",
    "k....k..",
    "kkkkkk..",
  ],
  // an arrow out of the page: opens somewhere else
  out: [
    "..kkkkk",
    ".....kk",
    "....k.k",
    "...k..k",
    "..k...k",
    ".k.....",
    "k......",
  ],
  // the cursor of a game menu
  pick: [
    "k..",
    "kk.",
    "kkk",
    "kk.",
    "k..",
  ],
  banana: [
    "........kk",
    ".......kyk",
    ".......kyk",
    "......kyyk",
    ".....kyyyk",
    "k...kyyyk.",
    "kkkkyyyyk.",
    ".kyyyyyk..",
    "..kkkkk...",
  ],
};

// A drawing as a repeating tile for a CSS background: a square of `size` art pixels with the
// drawing at each of `spots`; `colors` says what each character paints (there are no classes in there).
export function tileUrl(rows, colors, size, spots = [[0, 0]]) {
  let rects = "";
  for (const [ox, oy] of spots) {
    rows.forEach((row, y) => {
      [...row].forEach((c, x) => { if (colors[c]) rects += `<rect x="${x + ox}" y="${y + oy}" width="1" height="1" fill="${colors[c]}"/>`; });
    });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Put the drawings into the page: every element with data-art="name" gets its SVG.
export function drawArt(root = document) {
  for (const node of root.querySelectorAll("[data-art]")) {
    const rows = ART[node.dataset.art];
    if (rows) node.innerHTML = pixelSvg(rows);
  }
}
