// Prix de départ des tokens Elysium (paire HYPE natif) pour une capitalisation visée.
// Usage : node scripts/elysium-start-tick.mjs <prix du HYPE en $> [capitalisation visée en $, défaut 4000]
const hype = Number(process.argv[2]);
const cap = Number(process.argv[3] ?? 4000);
if (!(hype > 0) || !(cap > 0)) { console.error("Usage: node scripts/elysium-start-tick.mjs <HYPE price in $> [target cap in $]"); process.exit(1); }
const SUPPLY = 1e9;
const tokensPerHype = SUPPLY / (cap / hype);
const tick = Math.round(Math.log(tokensPerHype) / Math.log(1.0001) / 60) * 60;
const realCapHype = SUPPLY / 1.0001 ** tick;
const maxFirst = (cap * 0.12) / hype; // ~10 % du supply (comme 480 USDC sur Arc)
console.log(`START_TICK=${tick}`);
console.log(`MAX_FIRST_BUY_WEI=${BigInt(Math.round(maxFirst * 1e6)) * 10n ** 12n}`);
console.log(`# départ ≈ ${realCapHype.toFixed(2)} HYPE ≈ $${(realCapHype * hype).toFixed(0)} de capitalisation, premier achat max ≈ ${maxFirst.toFixed(3)} HYPE`);
