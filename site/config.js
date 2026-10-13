// What the front end has to know about the world outside it. One place for these.
// (The manual shows the address too, as plain text: how/index.html, the page "Nobody picks".)

export const CONFIG = {
  // The token whose trades write the book. The address is final, also before the token is created.
  mint: "Xbb671P3AXYZBkuAL147vmffnSUuoFxawCHhiXkmonk",
  ticker: "$MONKEY",
  // Where the backend answers: <api>/live and <api>/page. The browser never asks a Solana node itself.
  api: "/api",
  x: "https://x.com/infmonkeyfun",
};
