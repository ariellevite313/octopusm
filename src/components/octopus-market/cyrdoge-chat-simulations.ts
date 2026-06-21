import { clawdTrustThresholdUsd, featuredTools, pricingPlans } from "@/components/octopus-market/octopus-market-data";

export type CyrDogeSimulationMetric = {
  label: string;
  value: string;
  delta?: string;
};

export type CyrDogeSimulation = {
  badge: string;
  title: string;
  summary: string;
  metrics: CyrDogeSimulationMetric[];
  bullets: string[];
  footer: string;
};

const annualPlan = pricingPlans.find((plan) => plan.name.toLowerCase().includes("annual"));
const monthlyPlan = pricingPlans.find((plan) => plan.name.toLowerCase().includes("monthly"));
const clawdTrustTool = featuredTools.find((tool) => tool.name === "ClawdTrust");

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function createFrenchSimulation(prompt: string): CyrDogeSimulation {
  const normalizedPrompt = prompt.toLowerCase();

  if (includesAny(normalizedPrompt, ["tweet", "post", "x ", "twitter", "réseau", "social"])) {
    return {
      badge: "Social push",
      title: "Campagne de visibilité préparée",
      summary:
        "Aido Agent prépare un angle de post plus clair pour attirer les bons utilisateurs vers la fiche Octopus Market.",
      metrics: [
        { label: "Angle", value: "Preuve + bénéfice" },
        { label: "CTA", value: "Voir la fiche" },
        { label: "Impact estimé", value: "+18%", delta: "engagement" },
      ],
      bullets: [
        "mettre la promesse en une ligne très concrète",
        "montrer un bénéfice visible dès les 3 premiers mots",
        "renvoyer vers la fiche ou le launch studio selon l’objectif",
      ],
      footer: "Mode simulation activé, prêt à transformer ça en message produit ou en fiche de listing.",
    };
  }

  if (includesAny(normalizedPrompt, ["shopify", "vente", "commandes", "revenu", "monétisation"])) {
    return {
      badge: "Revenue lens",
      title: "Analyse monétisation prête",
      summary:
        "Aido Agent relie le discours produit à la conversion, pour que la visibilité sur Octopus Market serve aussi la monétisation.",
      metrics: [
        { label: "Friction", value: "Basse" },
        { label: "Activation", value: "+12%", delta: "estimée" },
        { label: "Conversion path", value: "Plus court" },
      ],
      bullets: [
        "clarifier qui gagne quoi immédiatement",
        "mettre le badge et la preuve sociale avant le bouton",
        "raccourcir le chemin entre découverte et clic sortant",
      ],
      footer: "On ne va pas aboyer pour rien, le but reste du trafic qualifié qui mord côté conversion. 🐶",
    };
  }

  if (includesAny(normalizedPrompt, ["analyse", "stats", "visibilité", "audience", "growth", "croissance"])) {
    return {
      badge: "Visibility scan",
      title: "Analyse de visibilité terminée",
      summary:
        "Aido Agent repère les leviers qui donnent le plus d’impact concret sur Octopus Market: clarté, confiance, et prochain clic.",
      metrics: [
        { label: "Confiance", value: "+30%", delta: "badges" },
        { label: "Lisibilité", value: "Très bonne" },
        { label: "Prochain clic", value: "Visible" },
      ],
      bullets: [
        "renforcer la headline avec une promesse résultat",
        "mettre le bénéfice business avant la techno",
        "faire ressortir le CTA principal plus tôt dans la fiche",
      ],
      footer: "C’est le mode radar Aido Agent: simple, utile, et sans fumée de robot.",
    };
  }

  if (includesAny(normalizedPrompt, ["launch", "token", "mint", "bags", "solfair"])) {
    return {
      badge: "Launch mode",
      title: "Checklist de lancement prête",
      summary:
        "Aido Agent passe en mode launch et t’aide à verrouiller les infos avant l’envoi vers Bags.fm.",
      metrics: [
        { label: "Documents", value: "Whitepaper + logo" },
        { label: "Wallets", value: "Dev + lock" },
        { label: "Passerelle", value: "Bags.fm ready" },
      ],
      bullets: [
        "vérifier le nom, le symbole, et la description finale",
        "préparer les wallets développeur et lock wallet",
        `vérifier si le bonus holder $ClawdTrust au-dessus de ${clawdTrustThresholdUsd}$ s’applique`,
      ],
      footer: "Mode autonome activé pour éviter un lancement en freestyle poulpesque. 🐙",
    };
  }

  if (includesAny(normalizedPrompt, ["listing", "wallet", "solana", "payment", "paiement", "signature"])) {
    return {
      badge: "Listing flow",
      title: "Flux de listing prêt à lancer",
      summary:
        "Aido Agent prépare le chemin le plus simple entre la fiche, la signature du wallet Solana, et le prélèvement du listing.",
      metrics: [
        { label: "Plan rapide", value: monthlyPlan?.name ?? "Monthly" },
        { label: "Plan durable", value: annualPlan?.name ?? "Annual" },
        { label: "Discount", value: "-30%", delta: "$ClawdTrust" },
      ],
      bullets: [
        "valider le plan selon vitesse ou présence durable",
        "préparer le wallet Solana avant la signature",
        "ajouter le holder wallet si tu veux le discount",
      ],
      footer: "Le chemin est prêt: moins de friction, plus de chance d’activer ton listing rapidement.",
    };
  }

  if (includesAny(normalizedPrompt, ["clawdtrust", "prediction", "rug"])) {
    return {
      badge: "Featured agent",
      title: "ClawdTrust mis en avant",
      summary:
        "Aido Agent recentre le discours sur ce qui différencie vraiment ClawdTrust dans la catégorie Agent.",
      metrics: [
        { label: "Prix", value: clawdTrustTool?.price ?? "Free/month" },
        { label: "Users", value: clawdTrustTool?.users ?? "492 users" },
        { label: "Badge", value: "Gold verified" },
      ],
      bullets: [
        "prediction market sur Solana",
        "rug control sur Solana",
        "angle confiance plus fort que les cartes classiques",
      ],
      footer: "ClawdTrust reste la carte premium de la meute sur la plateforme.",
    };
  }

  return {
    badge: "Autonomous mode",
    title: "Réponse autonome prête",
    summary:
      "Aido Agent transforme ton message en plan d’action clair, avec un angle produit, une prochaine étape, et une sortie utile pour la plateforme.",
    metrics: [
      { label: "Compréhension", value: "Contextuelle" },
      { label: "Mémoire", value: "Persistante" },
      { label: "Style", value: "Aido Agent" },
    ],
    bullets: [
      "répondre plus librement, comme un copilote",
      "garder les infos importantes de l’utilisateur",
      "proposer la meilleure prochaine action sans attendre",
    ],
    footer: "Je te file la patte, boss: envoie-moi un objectif, un texte, ou une idée à structurer.",
  };
}

function createEnglishSimulation(prompt: string): CyrDogeSimulation {
  const normalizedPrompt = prompt.toLowerCase();

  if (includesAny(normalizedPrompt, ["tweet", "post", "x ", "twitter", "social"])) {
    return {
      badge: "Social push",
      title: "Visibility campaign prepared",
      summary: "Aido Agent is shaping a cleaner social angle to drive the right users toward the Octopus Market listing.",
      metrics: [
        { label: "Angle", value: "Proof + benefit" },
        { label: "CTA", value: "View listing" },
        { label: "Estimated lift", value: "+18%", delta: "engagement" },
      ],
      bullets: [
        "lead with one concrete promise",
        "show the outcome in the first few words",
        "send users to the listing or launch studio based on intent",
      ],
      footer: "Simulation mode is on, ready to turn this into sharper product copy.",
    };
  }

  if (includesAny(normalizedPrompt, ["shopify", "orders", "sales", "revenue", "monetization"])) {
    return {
      badge: "Revenue lens",
      title: "Monetization review ready",
      summary: "Aido Agent is connecting the product message to conversion so Octopus Market visibility also supports revenue.",
      metrics: [
        { label: "Friction", value: "Low" },
        { label: "Activation", value: "+12%", delta: "estimated" },
        { label: "Conversion path", value: "Shorter" },
      ],
      bullets: [
        "clarify who gets what value immediately",
        "show trust signals before the main button",
        "shorten the path from discovery to outbound click",
      ],
      footer: "No barking for nothing here, the goal is qualified attention that converts. 🐶",
    };
  }

  if (includesAny(normalizedPrompt, ["analyze", "stats", "visibility", "audience", "growth"])) {
    return {
      badge: "Visibility scan",
      title: "Visibility analysis completed",
      summary:
        "Aido Agent highlights the levers that create the most concrete upside on Octopus Market: clarity, trust, and the next click.",
      metrics: [
        { label: "Trust", value: "+30%", delta: "badges" },
        { label: "Readability", value: "Strong" },
        { label: "Next click", value: "Visible" },
      ],
      bullets: [
        "tighten the headline around an outcome",
        "put the business benefit ahead of the tech",
        "surface the main CTA earlier on the listing",
      ],
      footer: "This is Aido Agent radar mode: simple, useful, and without robot fog.",
    };
  }

  if (includesAny(normalizedPrompt, ["launch", "token", "mint", "bags", "solfair"])) {
    return {
      badge: "Launch mode",
      title: "Launch checklist prepared",
      summary: "Aido Agent is in launch mode and helps lock the right information before the Bags.fm handoff.",
      metrics: [
        { label: "Documents", value: "Whitepaper + logo" },
        { label: "Wallets", value: "Dev + lock" },
        { label: "Handoff", value: "Bags.fm ready" },
      ],
      bullets: [
        "confirm the final name, ticker, and description",
        "prepare both developer wallets and the lock wallet",
        `check whether the $ClawdTrust holder bonus above ${clawdTrustThresholdUsd}$ applies`,
      ],
      footer: "Autonomous mode is on to stop the launch turning into an octopus-style freestyle. 🐙",
    };
  }

  if (includesAny(normalizedPrompt, ["listing", "wallet", "solana", "payment", "signature"])) {
    return {
      badge: "Listing flow",
      title: "Listing flow prepared",
      summary: "Aido Agent is setting up the shortest path between listing copy, Solana wallet signature, and the automatic listing charge.",
      metrics: [
        { label: "Fast plan", value: monthlyPlan?.name ?? "Monthly" },
        { label: "Long play", value: annualPlan?.name ?? "Annual" },
        { label: "Discount", value: "-30%", delta: "$ClawdTrust" },
      ],
      bullets: [
        "pick the plan based on testing speed or durable presence",
        "prepare the Solana wallet before signing",
        "add the holder wallet if you want the discount applied",
      ],
      footer: "The path is ready: less friction, better odds of activating the listing fast.",
    };
  }

  if (includesAny(normalizedPrompt, ["clawdtrust", "prediction", "rug"])) {
    return {
      badge: "Featured agent",
      title: "ClawdTrust spotlight prepared",
      summary: "Aido Agent is focusing the story on what truly differentiates ClawdTrust inside the Agent category.",
      metrics: [
        { label: "Price", value: clawdTrustTool?.price ?? "Free/month" },
        { label: "Users", value: clawdTrustTool?.users ?? "492 users" },
        { label: "Badge", value: "Gold verified" },
      ],
      bullets: [
        "prediction market agent on Solana",
        "rug control on Solana",
        "stronger trust angle than a standard agent card",
      ],
      footer: "ClawdTrust stays the premium card in the pack on this platform.",
    };
  }

  return {
    badge: "Autonomous mode",
    title: "Autonomous response prepared",
    summary:
      "Aido Agent turns your message into a clearer plan with product angle, useful next step, and a practical output for the platform.",
    metrics: [
      { label: "Understanding", value: "Contextual" },
      { label: "Memory", value: "Persistent" },
      { label: "Style", value: "Aido Agent" },
    ],
    bullets: [
      "reply more freely like a copilot",
      "keep important user details in memory",
      "propose the best next action without waiting",
    ],
    footer: "Send me a goal, a draft, or an idea to structure, and I’ll run with it.",
  };
}

export function createCyrDogeSimulation(prompt: string, language: "fr" | "en") {
  return language === "fr" ? createFrenchSimulation(prompt) : createEnglishSimulation(prompt);
}
