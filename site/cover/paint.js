// Paints a cover onto a canvas, one canvas pixel per art pixel, shown with hard edges at a whole scale.
// A cover is { w, h, palette, rows }: `rows` is h strings of w characters, and each character is a key
// of `palette` (a colour, or null for nothing).

export function paintCover(canvas, cover, scale = 4) {
  canvas.width = cover.w;
  canvas.height = cover.h;
  canvas.style.width = `${cover.w * scale}px`;
  canvas.style.height = `${cover.h * scale}px`;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, cover.w, cover.h);
  for (let y = 0; y < cover.h; y++) {
    const row = cover.rows[y];
    for (let x = 0; x < cover.w; x++) {
      const colour = cover.palette[row[x]];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

// What is wrong with a cover's data, as a list of plain sentences; empty when it is sound.
export function coverProblems(cover) {
  const out = [];
  if (!cover || !Array.isArray(cover.rows)) return ["no rows"];
  if (cover.rows.length !== cover.h) out.push(`${cover.rows.length} rows for a height of ${cover.h}`);
  cover.rows.forEach((row, y) => {
    if (row.length !== cover.w) out.push(`row ${y} is ${row.length} wide, not ${cover.w}`);
    for (const ch of row) if (!(ch in cover.palette)) { out.push(`row ${y} uses "${ch}", which is not in the palette`); break; }
  });
  return out.slice(0, 12);
}
