// Utilisable partout (serveur et client). Aucune logique : sert de repère pour l'extraction des phrases.
import type { Lang } from "./i18n";

/** Marque une phrase anglaise écrite hors composant (tableaux, constantes) ; à afficher avec tr(). */
export const T = (s: string) => s;

/** Code de locale pour Intl / toLocale*String selon la langue choisie. */
export const LOCALES: Record<Lang, string> = {
  en: "en-US", fr: "fr-FR", es: "es-ES", pt: "pt-BR", zh: "zh-CN", ru: "ru-RU", ar: "ar", tr: "tr-TR",
};
