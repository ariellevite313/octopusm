/**
 * cyrdoge-memory.ts — MIGRÉ VERS SUPABASE
 *
 * Remplace : localStorage (octopus-market-aido-agent-memory-v3)
 * Par : Supabase table ai_memory
 *
 * Toute la logique d'extraction NLP est conservée intacte.
 * Seules les fonctions de lecture/écriture utilisent Supabase.
 */

import {
  getAgentMemory,
  saveAgentMemory,
  clearAgentMemory,
} from "@/services/supabase/memory-service";

// ─── Types (inchangés) ────────────────────────────────────────────────────────

export type CyrDogeMemory = {
  user: {
    name: string | null;
    age: string | null;
    location: string | null;
    profession: string | null;
  };
  preferences: {
    languagePreference: "fr" | "en" | null;
    responseStyle: string | null;
    tonePreference: string | null;
    humorPreference: string | null;
  };
  projectsInProgress: string[];
  currentGoals: string[];
  importantInformation: string[];
  updatedAt: number;
};

export type CyrDogeMemoryUpdate = {
  memory: CyrDogeMemory;
  learnedFacts: string[];
};

/** @deprecated clé localStorage supprimée — conservé pour éviter les erreurs de compilation */
export const cyrDogeMemoryStorageKey = "octopus-market-aido-agent-memory-v3";

// ─── Mémoire vide par défaut ──────────────────────────────────────────────────

export function createEmptyCyrDogeMemory(): CyrDogeMemory {
  return {
    user: {
      name: null,
      age: null,
      location: null,
      profession: null,
    },
    preferences: {
      languagePreference: "en",
      responseStyle: "concise and helpful",
      tonePreference: "professional and friendly",
      humorPreference: "light humor",
    },
    projectsInProgress: [],
    currentGoals: [],
    importantInformation: [],
    updatedAt: Date.now(),
  };
}

// ─── Cache mémoire en RAM ─────────────────────────────────────────────────────

let cyrDogeMemoryCache: CyrDogeMemory | null = null;

// ─── Lecture / écriture Supabase ──────────────────────────────────────────────

/**
 * Lit la mémoire depuis le cache RAM (sync).
 * Retourne null si loadCyrDogeMemory() n'a pas encore été appelé.
 * Compatible avec useState(() => readStoredCyrDogeMemory() ?? createEmptyCyrDogeMemory())
 */
export function readStoredCyrDogeMemory(): CyrDogeMemory | null {
  return cyrDogeMemoryCache;
}

/**
 * Charge la mémoire depuis Supabase et la met en cache RAM.
 * À appeler dans un useEffect après connexion wallet.
 */
export async function loadCyrDogeMemory(walletAddress: string): Promise<CyrDogeMemory | null> {
  const memory = await getAgentMemory(walletAddress);
  if (!memory) return null;

  const result: CyrDogeMemory = {
    user: {
      name: memory.user.name,
      age: memory.user.age,
      location: memory.user.location,
      profession: memory.user.profession,
    },
    preferences: {
      languagePreference: memory.preferences.languagePreference,
      responseStyle: memory.preferences.responseStyle,
      tonePreference: memory.preferences.tonePreference,
      humorPreference: memory.preferences.humorPreference,
    },
    projectsInProgress: memory.projectsInProgress,
    currentGoals: memory.currentGoals,
    importantInformation: memory.importantInformation,
    updatedAt: memory.updatedAt,
  };
  cyrDogeMemoryCache = result;
  return result;
}

/**
 * Persiste la mémoire dans Supabase et met à jour le cache RAM.
 */
export async function writeStoredCyrDogeMemory(
  walletAddress: string,
  memory: CyrDogeMemory
): Promise<void> {
  cyrDogeMemoryCache = memory;
  await saveAgentMemory(walletAddress, {
    user: {
      name: memory.user.name,
      age: memory.user.age,
      location: memory.user.location,
      profession: memory.user.profession,
    },
    preferences: {
      languagePreference: memory.preferences.languagePreference,
      responseStyle: memory.preferences.responseStyle,
      tonePreference: memory.preferences.tonePreference,
      humorPreference: memory.preferences.humorPreference,
    },
    projectsInProgress: memory.projectsInProgress,
    currentGoals: memory.currentGoals,
    importantInformation: memory.importantInformation,
    updatedAt: memory.updatedAt,
  });
}

/**
 * Efface la mémoire de l'agent pour ce wallet.
 */
export async function clearStoredCyrDogeMemory(walletAddress: string): Promise<void> {
  await clearAgentMemory(walletAddress);
}

// ─── Logique d'extraction NLP (inchangée) ────────────────────────────────────

function normalizeCapturedValue(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.,!?;:]+$/g, "").trim();
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function addUniqueValue(values: string[], value: string) {
  const normalizedValue = normalizeCapturedValue(value);
  if (!normalizedValue) return values;
  const alreadyExists = values.some(
    (existingValue) => existingValue.toLowerCase() === normalizedValue.toLowerCase()
  );
  if (alreadyExists) return values;
  return [normalizedValue, ...values].slice(0, 6);
}

function findFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeCapturedValue(match[1]);
  }
  return null;
}

function extractName(text: string) {
  const value = findFirstMatch(text, [
    /(?:je m['']appelle|mon nom est)\s+([a-zà-ÿ][a-zà-ÿ' -]{1,40})/i,
    /(?:my name is)\s+([a-z][a-z' -]{1,40})/i,
  ]);
  return value ? toTitleCase(value) : null;
}

function extractAge(text: string) {
  return findFirstMatch(text, [
    /(?:j'ai)\s+(\d{1,3})\s+ans/i,
    /(?:i am|i'm)\s+(\d{1,3})\s+years? old/i,
  ]);
}

function extractLocation(text: string) {
  return findFirstMatch(text, [
    /(?:j'habite à|je vis à|je suis basé à|je suis en)\s+([^.!?\n]{2,60})/i,
    /(?:i live in|i'm based in|i am based in)\s+([^.!?\n]{2,60})/i,
  ]);
}

function extractProfession(text: string) {
  return findFirstMatch(text, [
    /(?:je suis)\s+(?:un|une)\s+([^.!?\n]{2,60})/i,
    /(?:i am|i'm)\s+(?:a|an)\s+([^.!?\n]{2,60})/i,
  ]);
}

function extractLanguagePreference(text: string) {
  const normalizedText = text.toLowerCase();
  if (/(réponds?|parle|écris|reste).*(français)|always.*french|answer.*in french|reply.*in french/i.test(normalizedText)) {
    return "fr" as const;
  }
  if (/(réponds?|parle|écris).*(anglais)|answer.*in english|reply.*in english/i.test(normalizedText)) {
    return "en" as const;
  }
  return null;
}

function extractResponseStyle(text: string) {
  if (/(court|bref|simple|direct|concis|short|brief|simple|direct)/i.test(text)) return "concise and direct";
  if (/(détaillé|long|approfondi|detail|detailed|long-form)/i.test(text)) return "detailed";
  return null;
}

function extractTonePreference(text: string) {
  if (/(amical|chaleureux|friendly|warm|décontracté|casual)/i.test(text)) return "friendly and warm";
  if (/(pro|professionnel|professional)/i.test(text)) return "professional";
  return null;
}

function extractHumorPreference(text: string) {
  if (/(humour|humor|drôle|funny|taquin|playful)/i.test(text)) return "light humor";
  return null;
}

function extractProject(text: string) {
  return findFirstMatch(text, [
    /(?:je travaille sur|je construis|je lance|mon projet est|je développe)\s+([^.!?\n]{4,90})/i,
    /(?:i'm building|i am building|i'm launching|we are launching|my project is|i'm working on|i am working on)\s+([^.!?\n]{4,90})/i,
  ]);
}

function extractGoal(text: string) {
  return findFirstMatch(text, [
    /(?:mon objectif est|je veux|j'aimerais|j'ai besoin de|je cherche à)\s+([^.!?\n]{4,110})/i,
    /(?:my goal is|i want to|i need to|i'm trying to|i am trying to|i want)\s+([^.!?\n]{4,110})/i,
  ]);
}

function extractImportantPreference(text: string) {
  return findFirstMatch(text, [
    /(?:j'aime|j'adore|je préfère|j'ai besoin de)\s+([^.!?\n]{4,90})/i,
    /(?:i like|i love|i prefer|i need)\s+([^.!?\n]{4,90})/i,
  ]);
}

function updateField(currentValue: string | null, nextValue: string | null) {
  if (!nextValue) return currentValue;
  if (currentValue?.toLowerCase() === nextValue.toLowerCase()) return currentValue;
  return nextValue;
}

// ─── Mise à jour de la mémoire ────────────────────────────────────────────────

export function updateCyrDogeMemory(
  memory: CyrDogeMemory,
  input: string
): CyrDogeMemoryUpdate {
  const nextMemory: CyrDogeMemory = {
    ...memory,
    user: { ...memory.user },
    preferences: { ...memory.preferences },
    projectsInProgress: [...memory.projectsInProgress],
    currentGoals: [...memory.currentGoals],
    importantInformation: [...memory.importantInformation],
    updatedAt: Date.now(),
  };
  const learnedFacts: string[] = [];

  const name = extractName(input);
  const age = extractAge(input);
  const location = extractLocation(input);
  const profession = extractProfession(input);
  const languagePreference = extractLanguagePreference(input);
  const responseStyle = extractResponseStyle(input);
  const tonePreference = extractTonePreference(input);
  const humorPreference = extractHumorPreference(input);
  const project = extractProject(input);
  const goal = extractGoal(input);
  const importantPreference = extractImportantPreference(input);

  const nextName = updateField(nextMemory.user.name, name);
  if (nextName !== nextMemory.user.name && nextName) { nextMemory.user.name = nextName; learnedFacts.push(`name: ${nextName}`); }

  const nextAge = updateField(nextMemory.user.age, age);
  if (nextAge !== nextMemory.user.age && nextAge) { nextMemory.user.age = nextAge; learnedFacts.push(`age: ${nextAge}`); }

  const nextLocation = updateField(nextMemory.user.location, location);
  if (nextLocation !== nextMemory.user.location && nextLocation) { nextMemory.user.location = nextLocation; learnedFacts.push(`location: ${nextLocation}`); }

  const nextProfession = updateField(nextMemory.user.profession, profession);
  if (nextProfession !== nextMemory.user.profession && nextProfession) { nextMemory.user.profession = nextProfession; learnedFacts.push(`profession: ${nextProfession}`); }

  const nextLanguagePreference = languagePreference ?? nextMemory.preferences.languagePreference;
  if (nextLanguagePreference !== nextMemory.preferences.languagePreference && nextLanguagePreference) {
    nextMemory.preferences.languagePreference = nextLanguagePreference;
    learnedFacts.push(`language: ${nextLanguagePreference === "fr" ? "French" : "English"}`);
  }

  const nextResponseStyle = updateField(nextMemory.preferences.responseStyle, responseStyle);
  if (nextResponseStyle !== nextMemory.preferences.responseStyle && nextResponseStyle) { nextMemory.preferences.responseStyle = nextResponseStyle; learnedFacts.push(`reply style: ${nextResponseStyle}`); }

  const nextTonePreference = updateField(nextMemory.preferences.tonePreference, tonePreference);
  if (nextTonePreference !== nextMemory.preferences.tonePreference && nextTonePreference) { nextMemory.preferences.tonePreference = nextTonePreference; learnedFacts.push(`tone: ${nextTonePreference}`); }

  const nextHumorPreference = updateField(nextMemory.preferences.humorPreference, humorPreference);
  if (nextHumorPreference !== nextMemory.preferences.humorPreference && nextHumorPreference) { nextMemory.preferences.humorPreference = nextHumorPreference; learnedFacts.push(`humor: ${nextHumorPreference}`); }

  if (project) {
    const nextProjects = addUniqueValue(nextMemory.projectsInProgress, project);
    if (nextProjects.length !== nextMemory.projectsInProgress.length) { nextMemory.projectsInProgress = nextProjects; learnedFacts.push(`project: ${project}`); }
  }

  if (goal) {
    const nextGoals = addUniqueValue(nextMemory.currentGoals, goal);
    if (nextGoals.length !== nextMemory.currentGoals.length) { nextMemory.currentGoals = nextGoals; learnedFacts.push(`goal: ${goal}`); }
  }

  if (importantPreference) {
    const nextImportantInformation = addUniqueValue(nextMemory.importantInformation, importantPreference);
    if (nextImportantInformation.length !== nextMemory.importantInformation.length) { nextMemory.importantInformation = nextImportantInformation; learnedFacts.push(`important: ${importantPreference}`); }
  }

  return { memory: nextMemory, learnedFacts };
}

// ─── Utilitaires (inchangés) ──────────────────────────────────────────────────

export function countKnownMemoryItems(memory: CyrDogeMemory) {
  return [
    memory.user.name, memory.user.age, memory.user.location, memory.user.profession,
    memory.preferences.languagePreference, memory.preferences.responseStyle,
    memory.preferences.tonePreference, memory.preferences.humorPreference,
    ...memory.projectsInProgress, ...memory.currentGoals, ...memory.importantInformation,
  ].filter(Boolean).length;
}

export function getCyrDogeMemoryHighlights(memory: CyrDogeMemory, language: "fr" | "en") {
  const highlights: string[] = [];
  if (memory.user.name) highlights.push(language === "fr" ? `Nom: ${memory.user.name}` : `Name: ${memory.user.name}`);
  if (memory.projectsInProgress[0]) highlights.push(language === "fr" ? `Projet: ${memory.projectsInProgress[0]}` : `Project: ${memory.projectsInProgress[0]}`);
  if (memory.currentGoals[0]) highlights.push(language === "fr" ? `Objectif: ${memory.currentGoals[0]}` : `Goal: ${memory.currentGoals[0]}`);
  if (memory.preferences.languagePreference) highlights.push(language === "fr" ? `Langue: ${memory.preferences.languagePreference === "fr" ? "Français" : "Anglais"}` : `Language: ${memory.preferences.languagePreference === "fr" ? "French" : "English"}`);
  if (memory.importantInformation[0]) highlights.push(language === "fr" ? `Aime: ${memory.importantInformation[0]}` : `Likes: ${memory.importantInformation[0]}`);
  return highlights.slice(0, 5);
}
