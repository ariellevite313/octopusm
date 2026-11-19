/**
 * Frais de création d'un marché de prédiction (pool) : 1 USDC (Solana et Arc) ou 500 000 CLT (= 1 $ au taux d'OM, 500 000 CLT pour 1 USDC).
 * La moitié part directement dans le pool : une mise de départ de la maison sur une option tirée au hasard, pour qu'il y ait déjà quelque chose à gagner.
 */
export const POOL_CREATION_FEE_USDC = 1;
export const POOL_CREATION_FEE_CLT  = 500_000;
/** Mise de départ versée dans le pool à la création (moitié des frais) */
export const POOL_SEED_USDC = 0.5;
export const POOL_SEED_CLT  = 250_000;
