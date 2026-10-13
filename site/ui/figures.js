// Figures are set in the blocky face: in the text face a 5 reads as an S. Every run of digits in
// the places handed over is wrapped in a .num span, now and whenever their text changes.
// Addresses and hashes are left alone here: style.css sets them whole in the blocky face.

const DIGITS = /\d[\d,.:/]*\d|\d/g;
const LEAVE = ".num, .id-value, .hex";

function numbered(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(DIGITS)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const span = document.createElement("span");
    span.className = "num";
    span.textContent = m[0];
    out.push(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function numberText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!/\d/.test(node.nodeValue) || node.parentElement.closest(LEAVE)) continue;
    node.replaceWith(...numbered(node.nodeValue));
  }
}

export function keepNumbered(...roots) {
  for (const root of roots) {
    if (!root) continue;
    numberText(root);
    new MutationObserver(() => numberText(root)).observe(root, { childList: true, characterData: true, subtree: true });
  }
}
