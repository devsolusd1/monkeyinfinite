// Addresses the page links to. To use another explorer, change it here and nowhere else.

const EXPLORER = "https://solscan.io";
export const EXPLORER_NAME = "Solscan";

export const txUrl = (signature) => `${EXPLORER}/tx/${encodeURIComponent(signature)}`;
export const walletUrl = (wallet) => `${EXPLORER}/account/${encodeURIComponent(wallet)}`;

// The manual has two parts: the idea (why a monkey), then the rule (how a word is picked, in full).
// A word's box says "The whole rule", so it lands on the first page of the rule. (index.html links to
// the manual too: the "?" opens it at its first page, the bookplate has a way to each part.)
export const MANUAL = "how/#rule";
