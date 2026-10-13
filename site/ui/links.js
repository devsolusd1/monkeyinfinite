// Addresses the page links to. To use another explorer, change it here and nowhere else.

const EXPLORER = "https://solscan.io";
export const EXPLORER_NAME = "Solscan";

export const txUrl = (signature) => `${EXPLORER}/tx/${encodeURIComponent(signature)}`;
export const walletUrl = (wallet) => `${EXPLORER}/account/${encodeURIComponent(wallet)}`;

// The token itself: on the explorer, on a chart, and at a place to trade it. (Shown only once the token exists.)
export const tokenUrl = (mint) => `${EXPLORER}/token/${encodeURIComponent(mint)}`;
export const chartUrl = (mint) => `https://dexscreener.com/solana/${encodeURIComponent(mint)}`;
export const tradeUrl = (mint) => `https://jup.ag/tokens/${encodeURIComponent(mint)}`;

// The manual has two parts: the idea (why a monkey), then the rule (how a word is picked, in full).
// A word's box says "The whole rule", so it lands on the first page of the rule. (index.html links to
// the manual too: the "?" opens it at its first page, the bookplate has a way to each part.)
export const MANUAL = "how/#rule";
