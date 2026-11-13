/** Message à signer pour prouver qu'un wallet EVM relié est à la personne (partagé client / serveur). */
export const refMessage = (chain: string, token: string, nonce: string) => `OMdotfun: show my bag\nNetwork: ${chain}\nToken: ${token.toLowerCase()}\nNonce: ${nonce}`;
