// Addresses the page links to. To use another explorer, change it here and nowhere else.

const EXPLORER = "https://solscan.io";
export const EXPLORER_NAME = "Solscan";

export const txUrl = (signature) => `${EXPLORER}/tx/${encodeURIComponent(signature)}`;
export const walletUrl = (wallet) => `${EXPLORER}/account/${encodeURIComponent(wallet)}`;

// The manual: how a word is picked, in full. (index.html links to it too: the "?" and the bookplate.)
export const MANUAL = "how/";
