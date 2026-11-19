/**
 * Monnaie locale d'affichage des soldes. Les montants restent en USD partout ; seul l'affichage est converti.
 * Signes réels de chaque monnaie (Intl, symbole étroit), jamais d'emoji. Taux : open.er-api.com (gratuit), mis en cache côté serveur.
 */
export const FIAT: { code: string; name: string }[] = [
  { code: "USD", name: "US Dollar" }, { code: "EUR", name: "Euro" }, { code: "GBP", name: "British Pound" },
  { code: "XOF", name: "CFA Franc (West)" }, { code: "XAF", name: "CFA Franc (Central)" },
  { code: "NGN", name: "Nigerian Naira" }, { code: "GHS", name: "Ghanaian Cedi" }, { code: "KES", name: "Kenyan Shilling" },
  { code: "ZAR", name: "South African Rand" }, { code: "MAD", name: "Moroccan Dirham" }, { code: "EGP", name: "Egyptian Pound" },
  { code: "TND", name: "Tunisian Dinar" }, { code: "DZD", name: "Algerian Dinar" }, { code: "UGX", name: "Ugandan Shilling" },
  { code: "TZS", name: "Tanzanian Shilling" }, { code: "RWF", name: "Rwandan Franc" }, { code: "ETB", name: "Ethiopian Birr" },
  { code: "CAD", name: "Canadian Dollar" }, { code: "AUD", name: "Australian Dollar" }, { code: "CHF", name: "Swiss Franc" },
  { code: "BRL", name: "Brazilian Real" }, { code: "MXN", name: "Mexican Peso" }, { code: "ARS", name: "Argentine Peso" },
  { code: "COP", name: "Colombian Peso" }, { code: "CLP", name: "Chilean Peso" }, { code: "PEN", name: "Peruvian Sol" },
  { code: "INR", name: "Indian Rupee" }, { code: "PKR", name: "Pakistani Rupee" }, { code: "BDT", name: "Bangladeshi Taka" },
  { code: "JPY", name: "Japanese Yen" }, { code: "CNY", name: "Chinese Yuan" }, { code: "KRW", name: "South Korean Won" },
  { code: "IDR", name: "Indonesian Rupiah" }, { code: "PHP", name: "Philippine Peso" }, { code: "VND", name: "Vietnamese Dong" },
  { code: "THB", name: "Thai Baht" }, { code: "MYR", name: "Malaysian Ringgit" }, { code: "SGD", name: "Singapore Dollar" },
  { code: "TRY", name: "Turkish Lira" }, { code: "RUB", name: "Russian Ruble" }, { code: "UAH", name: "Ukrainian Hryvnia" },
  { code: "PLN", name: "Polish Zloty" }, { code: "AED", name: "UAE Dirham" }, { code: "SAR", name: "Saudi Riyal" },
  { code: "ILS", name: "Israeli Shekel" },
];
export const FIAT_CODES = FIAT.map((c) => c.code);
export const isFiat = (c: unknown): c is string => typeof c === "string" && FIAT_CODES.includes(c);

/** Pas de centimes pour les monnaies à très petite valeur unitaire */
const WHOLE = new Set(["XOF", "XAF", "JPY", "KRW", "VND", "IDR", "UGX", "TZS", "RWF", "CLP", "PKR", "COP"]);

/** Montant en USD → texte dans la monnaie choisie (rate = unités de la monnaie pour 1 USD). */
export function formatFiat(usd: number, code: string, rate: number): string {
  const v = usd * (code === "USD" ? 1 : rate);
  const frac = WHOLE.has(code) ? 0 : 2;
  if (code === "XOF" || code === "XAF") return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} F CFA`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol", minimumFractionDigits: frac, maximumFractionDigits: frac }).format(v);
  } catch {
    return `${v.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac })} ${code}`;
  }
}
