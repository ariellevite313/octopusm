/**
 * Source unique de vérité pour toutes les catégories de l'application.
 * slug  : valeur stockée en DB + utilisée dans les URLs (English ASCII, no accents)
 * label : nom affiché dans l'UI (French)
 */
export const CATEGORIES = [
  { slug: "crypto",      label: "Crypto"       },
  { slug: "politics",    label: "Politique"     },
  { slug: "sports",      label: "Sports"        },
  { slug: "esports",     label: "Esports"       },
  { slug: "iran",        label: "Iran"          },
  { slug: "finance",     label: "Finance"       },
  { slug: "africa",      label: "Afrique"       },
  { slug: "geopolitics", label: "Géopolitique"  },
  { slug: "tech",        label: "Tech"          },
  { slug: "culture",     label: "Culture"       },
  { slug: "economy",     label: "Économie"      },
  { slug: "palestine",   label: "Palestine"     },
  { slug: "weather",     label: "Météo"         },
  { slug: "mentions",    label: "Mentions"      },
  { slug: "elections",   label: "Élections"     },
  { slug: "art",         label: "Art"           },
  { slug: "cinema",      label: "Cinéma"        },
] as const;

export type CategorySlug = typeof CATEGORIES[number]["slug"];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

/** Slug → label FR. Retourne le slug lui-même si inconnu. */
export function getCategoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}
