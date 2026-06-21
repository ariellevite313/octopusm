import { aidoAgentFaqs } from "@/components/octopus-market/octopus-market-data";

export type CyrDogeMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  language: "fr" | "en";
  createdAt: number;
};

export const cyrDogeStorageKey = "octopus-market-aido-agent-history-v7";

export const cyrDogeQuickPrompts = [
  "What is Octopus Market (OM)?",
  "How does wallet validation work before a launch or prediction action?",
  "What is the official token of the platform?",
  "Guide me through Launch Token, Prediction Market, and List My AI",
];

export const aidoAgentStarterFaqs = aidoAgentFaqs.slice(0, 10);

export function createWelcomeMessage(): CyrDogeMessage {
  return {
    id: "welcome-message",
    role: "assistant",
    language: "en",
    createdAt: Date.now(),
    content:
      "Hi, I’m Aido Agent. I’m the Octopus Market assistant, and I start in standard English by default. I can answer platform questions, explain Launch Token, Prediction Market, and AI listing flows, share official platform details, and guide users through wallet-validated actions. Connect your wallet to unlock the full utility layer, then ask a question or use one of the FAQ starters below.",
  };
}

export function readStoredCyrDogeMessages() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(cyrDogeStorageKey);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as CyrDogeMessage[];

    if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

export function detectChatLanguage(text: string): "fr" | "en" {
  const normalizedText = text.trim().toLowerCase();

  if (!normalizedText) {
    return "en";
  }

  const frenchSignals = [
    "bonjour",
    "salut",
    "je",
    "tu",
    "vous",
    "mon",
    "site",
    "prix",
    "gratuit",
    "marché",
    "plateforme",
    "lancement",
    "paiement",
    "français",
    "visibilité",
    "produit",
    "comment",
    "pourquoi",
    "avec",
    "est",
    "des",
    "les",
    "une",
    "que",
    "quoi",
    "peux",
    "faire",
    "besoin",
    "objectif",
    "projet",
    "aide",
    "compare",
    "écris",
    "résume",
    "explique",
  ];

  const englishSignals = [
    "hello",
    "hi",
    "my",
    "product",
    "pricing",
    "listing",
    "launch",
    "visibility",
    "growth",
    "market",
    "wallet",
    "english",
    "website",
    "help",
    "how",
    "what",
    "why",
    "free",
    "token",
    "compare",
    "positioning",
    "audience",
    "write",
    "summarize",
    "explain",
    "project",
    "goal",
  ];

  const frenchScore = frenchSignals.filter((signal) => normalizedText.includes(signal)).length;
  const englishScore = englishSignals.filter((signal) => normalizedText.includes(signal)).length;

  if (frenchScore > englishScore) {
    return "fr";
  }

  return "en";
}
