import {
  aidoAgentAccessAreas,
  aidoAgentFaqs,
  clawdTrustThresholdUsd,
  contactItems,
  featuredTools,
  heroStats,
  officialTokenAddress,
  officialTokenName,
  predictionMarketFeeRate,
  predictionMarketTreasuryAddress,
  pricingPlans,
  solanaPaymentAddress,
  websiteUrl,
} from "@/components/octopus-market/octopus-market-data";
import { detectChatLanguage, type CyrDogeMessage } from "@/components/octopus-market/cyrdoge-chat-data";
import { type CyrDogeMemory } from "@/components/octopus-market/cyrdoge-memory";

type ChatLanguage = CyrDogeMessage["language"];
type Topic =
  | "greeting"
  | "visibility"
  | "pricing"
  | "listing"
  | "launch"
  | "prediction"
  | "clawdtrust"
  | "comparison"
  | "positioning"
  | "agent"
  | "general";

type ProductKind = "agent" | "image" | "finance" | "code" | "token" | "general";
type TaskType = "write" | "summarize" | "explain" | "brainstorm" | "analyze" | "plan" | "compare" | "general";

type ReplyContext = {
  memory: CyrDogeMemory;
  learnedFacts: string[];
};

type ConversationProfile = {
  input: string;
  language: ChatLanguage;
  topics: Topic[];
  taskTypes: TaskType[];
  productKind: ProductKind;
  mentionedTools: string[];
  recentUserMessages: string[];
  hasHistory: boolean;
  memory: CyrDogeMemory;
  learnedFacts: string[];
};

const annualPlan = pricingPlans.find((plan) => plan.name.toLowerCase().includes("annual"));
const monthlyPlan = pricingPlans.find((plan) => plan.name.toLowerCase().includes("monthly"));
const launchFlowStat = heroStats.find((stat) => stat.label.toLowerCase().includes("launch flows"));
const twitterReference = contactItems.find((item) => item.href?.includes("x.com"));
const toolCatalog = featuredTools.map((tool) => ({
  name: tool.name,
  normalizedName: tool.name.toLowerCase(),
  description: tool.description,
  price: tool.price,
  users: tool.users,
  verificationLabel: tool.verificationLabel,
}));

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function normalizeQuestionMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getRecentUserMessages(history: CyrDogeMessage[]) {
  return history
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => message.content.trim())
    .filter(Boolean);
}

function detectMentionedTools(text: string, history: CyrDogeMessage[]) {
  const corpus = [text, ...getRecentUserMessages(history)].join(" ").toLowerCase();

  return toolCatalog
    .filter((tool) => {
      const simplified = tool.normalizedName.replace(/[^a-z0-9]+/g, " ");
      const shortTokens = simplified.split(" ").filter((token) => token.length > 3);

      return (
        corpus.includes(tool.normalizedName) ||
        shortTokens.some((token) => corpus.includes(token)) ||
        (tool.name === "Claude 3.5 Sonnet" && corpus.includes("claude"))
      );
    })
    .map((tool) => tool.name);
}

function detectProductKind(text: string, history: CyrDogeMessage[]): ProductKind {
  const corpus = [text, ...getRecentUserMessages(history)].join(" ").toLowerCase();

  if (includesAny(corpus, ["agent", "assistant", "chatbot", "copilot", "support bot"])) {
    return "agent";
  }

  if (includesAny(corpus, ["image", "visual", "photo", "art", "design"])) {
    return "image";
  }

  if (includesAny(corpus, ["trading", "finance", "signal", "market", "portfolio"])) {
    return "finance";
  }

  if (includesAny(corpus, ["code", "developer", "dev", "software", "app", "saas"])) {
    return "code";
  }

  if (includesAny(corpus, ["token", "launch", "mint", "bags fm", "bags.fm", "solfair", "tokenization"])) {
    return "token";
  }

  return "general";
}

function detectTopics(text: string, history: CyrDogeMessage[]): Topic[] {
  const currentText = normalizeText(text);
  const recentContext = getRecentUserMessages(history).join(" ").toLowerCase();
  const corpus = `${currentText} ${recentContext}`;
  const topics = new Set<Topic>();

  if (!currentText) {
    topics.add("general");
  }

  if (includesAny(currentText, ["hello", "hi", "hey", "bonjour", "salut", "yo"])) {
    topics.add("greeting");
  }

  if (
    includesAny(corpus, [
      "visibility",
      "audience",
      "grow",
      "growth",
      "discover",
      "traffic",
      "users",
      "visibilité",
      "croissance",
      "impact",
      "conversion",
      "engagement",
    ])
  ) {
    topics.add("visibility");
  }

  if (includesAny(corpus, ["price", "pricing", "cost", "plan", "monthly", "annual", "free", "prix", "tarif"])) {
    topics.add("pricing");
  }

  if (includesAny(corpus, ["listing", "wallet", "payment", "signature", "payer", "paiement", "solana"])) {
    topics.add("listing");
  }

  if (includesAny(corpus, ["launch", "token", "mint", "solfair", "whitepaper", "bags.fm", "bags fm", "tokenization", "launch token"])) {
    topics.add("launch");
  }

  if (includesAny(corpus, ["prediction", "binary", "yes", "no", "escrow", "claim", "market resolution"])) {
    topics.add("prediction");
  }

  if (includesAny(corpus, ["clawdtrust", "prediction", "rug", "gold badge", "badge gold", "trust"])) {
    topics.add("clawdtrust");
  }

  if (includesAny(corpus, ["compare", "versus", "vs", "difference", "better", "comparer", "différence"])) {
    topics.add("comparison");
  }

  if (includesAny(corpus, ["position", "positioning", "message", "pitch", "describe", "headline", "angle", "promesse"])) {
    topics.add("positioning");
  }

  if (includesAny(corpus, ["agent", "assistant", "chatbot", "copilot"])) {
    topics.add("agent");
  }

  if (topics.size === 0) {
    topics.add("general");
  }

  return Array.from(topics);
}

function detectTaskTypes(text: string, history: CyrDogeMessage[]) {
  const corpus = [text, ...getRecentUserMessages(history)].join(" ").toLowerCase();
  const taskTypes = new Set<TaskType>();

  if (includesAny(corpus, ["write", "rewrite", "rédige", "écris", "copy", "headline", "bio", "pitch"])) {
    taskTypes.add("write");
  }

  if (includesAny(corpus, ["summarize", "résume", "summary", "recap", "récap"])) {
    taskTypes.add("summarize");
  }

  if (includesAny(corpus, ["explain", "explique", "what is", "what does", "pourquoi", "comment"])) {
    taskTypes.add("explain");
  }

  if (includesAny(corpus, ["brainstorm", "idea", "idée", "angles", "concept", "naming"])) {
    taskTypes.add("brainstorm");
  }

  if (includesAny(corpus, ["analyze", "analyse", "audit", "review", "stats", "performance"])) {
    taskTypes.add("analyze");
  }

  if (includesAny(corpus, ["plan", "roadmap", "steps", "checklist", "étapes", "planifie"])) {
    taskTypes.add("plan");
  }

  if (includesAny(corpus, ["compare", "versus", "vs", "difference", "comparer", "différence"])) {
    taskTypes.add("compare");
  }

  if (taskTypes.size === 0) {
    taskTypes.add("general");
  }

  return Array.from(taskTypes);
}

function buildProfile(input: string, history: CyrDogeMessage[], context: ReplyContext): ConversationProfile {
  const detectedLanguage = detectChatLanguage(input);
  const preferredLanguage = context.memory.preferences.languagePreference ?? "en";
  const language = detectedLanguage === "fr" ? "fr" : preferredLanguage === "fr" ? "fr" : "en";

  return {
    input,
    language,
    topics: detectTopics(input, history),
    taskTypes: detectTaskTypes(input, history),
    productKind: detectProductKind(input, history),
    mentionedTools: detectMentionedTools(input, history),
    recentUserMessages: getRecentUserMessages(history),
    hasHistory: history.some((message) => message.role === "user"),
    memory: context.memory,
    learnedFacts: context.learnedFacts,
  };
}

function formatToolList(tools: string[]) {
  if (tools.length === 0) {
    return "";
  }

  if (tools.length === 1) {
    return tools[0];
  }

  if (tools.length === 2) {
    return `${tools[0]} and ${tools[1]}`;
  }

  return `${tools.slice(0, -1).join(", ")}, and ${tools[tools.length - 1]}`;
}

function formatToolListFr(tools: string[]) {
  if (tools.length === 0) {
    return "";
  }

  if (tools.length === 1) {
    return tools[0];
  }

  if (tools.length === 2) {
    return `${tools[0]} et ${tools[1]}`;
  }

  return `${tools.slice(0, -1).join(", ")}, et ${tools[tools.length - 1]}`;
}

function formatFactList(facts: string[]) {
  if (facts.length <= 1) {
    return facts[0] ?? "";
  }

  return `${facts.slice(0, -1).join(", ")}, and ${facts[facts.length - 1]}`;
}

function getFaqMatch(input: string) {
  const normalizedInput = normalizeQuestionMatch(input);

  return aidoAgentFaqs.find((faq) => {
    const normalizedQuestion = normalizeQuestionMatch(faq.question);
    return normalizedInput === normalizedQuestion || normalizedInput.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedInput);
  });
}

function createFaqReply(faqQuestion: string, faqAnswer: string, language: ChatLanguage) {
  const intro =
    language === "fr"
      ? `Bonne question 👌 Voici la réponse la plus directe sur Octopus Market pour: “${faqQuestion}”`
      : `Great question 👌 Here is the clearest Octopus Market answer for: “${faqQuestion}”`;

  const followUp =
    language === "fr"
      ? "Si tu veux, je peux aussi te guider ensuite vers la bonne zone de la plateforme: Launch Token, Prediction Market, ou List My AI."
      : "If you want, I can also guide you to the right platform area next: Launch Token, Prediction Market, or List My AI.";

  return `${intro}\n\n${faqAnswer}\n\n${followUp}`;
}

function getOpening(profile: ConversationProfile) {
  const nameSegment = profile.memory.user.name ? ` ${profile.memory.user.name}` : "";

  if (profile.language === "fr") {
    if (profile.hasHistory) {
      return `Hey${nameSegment} 👋 Je reprends le fil avec ta mémoire Aido Agent pour te répondre de façon plus naturelle, plus autonome, et plus utile.`;
    }

    return `Hey${nameSegment} 👋 Aido Agent est prêt. Je peux t’aider à comprendre, écrire, comparer, résumer, analyser, ou structurer tes idées sans partir en freestyle inutile.`;
  }

  if (profile.hasHistory) {
    return `Hey${nameSegment} 👋 I’m picking up the thread with your Aido Agent memory so I can answer in a more natural, autonomous, and useful way.`;
  }

  return `Hey${nameSegment} 👋 Aido Agent is on. I can help explain, write, compare, summarize, analyze, or structure your ideas without falling into robotic fluff.`;
}

function getLearnedFactsLine(profile: ConversationProfile) {
  if (profile.learnedFacts.length === 0) {
    return "";
  }

  if (profile.language === "fr") {
    return `Noté ✅ Je grave aussi dans ma mémoire Aido Agent-style: ${formatFactList(profile.learnedFacts)}.`;
  }

  return `Noted ✅ I’m locking this into my Aido Agent memory: ${formatFactList(profile.learnedFacts)}.`;
}

function getMemoryRecallLine(profile: ConversationProfile) {
  const memoryFacts: string[] = [];

  if (profile.memory.user.profession) {
    memoryFacts.push(
      profile.language === "fr"
        ? `tu es ${profile.memory.user.profession}`
        : `you are ${profile.memory.user.profession}`
    );
  }

  if (profile.memory.user.location) {
    memoryFacts.push(
      profile.language === "fr"
        ? `tu es basé vers ${profile.memory.user.location}`
        : `you are based around ${profile.memory.user.location}`
    );
  }

  if (profile.memory.projectsInProgress[0]) {
    memoryFacts.push(
      profile.language === "fr"
        ? `tu bosses sur ${profile.memory.projectsInProgress[0]}`
        : `you’re working on ${profile.memory.projectsInProgress[0]}`
    );
  }

  if (profile.memory.currentGoals[0]) {
    memoryFacts.push(
      profile.language === "fr"
        ? `ton objectif du moment est ${profile.memory.currentGoals[0]}`
        : `your current goal is ${profile.memory.currentGoals[0]}`
    );
  }

  if (profile.memory.importantInformation[0]) {
    memoryFacts.push(
      profile.language === "fr"
        ? `tu m’as aussi dit que tu aimes ${profile.memory.importantInformation[0]}`
        : `you also told me you like ${profile.memory.importantInformation[0]}`
    );
  }

  if (memoryFacts.length === 0 || profile.learnedFacts.length > 0) {
    return "";
  }

  if (profile.language === "fr") {
    return `Comme tu me l’as déjà dit, je garde en tête que ${formatFactList(memoryFacts)}.`;
  }

  return `From what you told me before, I’m keeping in mind that ${formatFactList(memoryFacts)}.`;
}

function getProductAngle(profile: ConversationProfile) {
  const kindCopy = {
    fr: {
      agent: "Pour un agent IA, l’angle qui convertit le mieux reste très concret: ce qu’il automatise, ce qu’il sécurise, et quel temps ou risque il fait gagner.",
      image: "Pour un outil image, le bon angle reste la qualité du rendu, la vitesse de production, et la clarté du résultat final.",
      finance: "Pour un produit finance, il faut rassurer vite sur la lisibilité, la confiance, et la vitesse de décision.",
      code: "Pour un produit code, le message qui mord bien mélange gain de temps, qualité de livraison, et baisse de friction pour l’équipe.",
      token: "Pour un projet token, la différence se joue souvent sur la clarté du lancement, la confiance, et la préparation du dossier.",
      general: "Sur Octopus Market, le bon angle reste simple: qui gagne quoi, à quel moment, et pourquoi c’est crédible.",
    },
    en: {
      agent: "For an AI agent, the angle that converts best is very concrete: what it automates, what it secures, and what time or risk it saves.",
      image: "For an image tool, the winning angle stays visual quality, production speed, and a clear final output.",
      finance: "For a finance product, the key is fast reassurance around readability, trust, and speed of decision-making.",
      code: "For a code product, the message that bites best blends time saved, delivery quality, and less friction for the team.",
      token: "For a token project, the difference usually comes from launch clarity, trust, and how well the file is prepared.",
      general: "On Octopus Market, the right angle stays simple: who gets what benefit, when they get it, and why it feels credible.",
    },
  };

  return kindCopy[profile.language][profile.productKind];
}

function getClawdTrustBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return "ClawdTrust garde le positionnement le plus différenciant de la catégorie Agent ici: Free/month pour le moment, 492 users, badge gold, lien direct vers clawdtrust.com, et promesse nette autour du prediction market et du rug control sur Solana.";
  }

  return "ClawdTrust keeps the most differentiated angle in the Agent category here: Free/month for now, 492 users, a gold badge, a direct link to clawdtrust.com, and a clear promise around prediction markets and rug control on Solana.";
}

function getPredictionMarketBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return `Le binary prediction market est maintenant un flux clé d’Octopus Market: 6 sections thématiques, positions Yes ou No, connexion wallet requise, validation par signature Phantom, historique local des positions, puis fee automatique de ${predictionMarketFeeRate}% envoyé vers ${predictionMarketTreasuryAddress} au moment du claim.`;
  }

  return `The binary prediction market is now a core Octopus Market flow: 6 themed sections, Yes or No positions, wallet-required access, Phantom signature approval, local position history, then an automatic ${predictionMarketFeeRate}% claim fee routed to ${predictionMarketTreasuryAddress} at claim time.`;
}

function getPlatformKnowledgeBlock(profile: ConversationProfile) {
  const launchFlowValue = launchFlowStat?.value ?? "3";
  const accessAreas = aidoAgentAccessAreas.join(", ");

  if (profile.language === "fr") {
    return `Côté plateforme, je suis branché sur les infos utiles d’Octopus Market: ${launchFlowValue} flux actifs, paiement listing via wallet Solana vers ${solanaPaymentAddress}, utilités verrouillées derrière la connexion wallet, ClawdTrust mis en avant dans Agent, référence X ${twitterReference?.label ?? "@xOctopusMarket"}, token officiel ${officialTokenName}, CA ${officialTokenAddress}, et site officiel ${websiteUrl}. Mes zones de contexte couvrent: ${accessAreas}.`;
  }

  return `On the platform side, I’m grounded in Octopus Market context: ${launchFlowValue} live flows, listing payment through a Solana wallet to ${solanaPaymentAddress}, utility access locked behind wallet connection, ClawdTrust featured in Agent, the X reference ${twitterReference?.label ?? "@xOctopusMarket"}, the official token ${officialTokenName}, its contract ${officialTokenAddress}, and the official website ${websiteUrl}. My access areas cover: ${accessAreas}.`;
}

function getPricingBlock(profile: ConversationProfile) {
  if (!annualPlan || !monthlyPlan) {
    return "";
  }

  if (profile.language === "fr") {
    return `Pour le listing, le plan ${monthlyPlan.name.toLowerCase()} reste le plus simple pour tester vite, alors que le ${annualPlan.name.toLowerCase()} devient plus rentable si tu veux une présence durable. Le paiement passe par signature wallet Solana, et la réduction holder s’active au-dessus de ${clawdTrustThresholdUsd}$ en $ClawdTrust.`;
  }

  return `For listing, the ${monthlyPlan.name.toLowerCase()} is the simplest way to test quickly, while the ${annualPlan.name.toLowerCase()} becomes more efficient if you want lasting visibility. Payment runs through a Solana wallet signature, and the holder discount unlocks above ${clawdTrustThresholdUsd}$ in $ClawdTrust.`;
}

function getVisibilityBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return "L’impact positif concret d’Octopus Market repose sur trois leviers: plus de visibilité immédiate, plus de confiance via les badges de vérification, et un chemin plus direct vers l’activation ou la monétisation.";
  }

  return "The concrete upside of Octopus Market sits on three levers: more immediate visibility, more trust through verification badges, and a more direct path to activation or monetization.";
}

function getLaunchBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return "Si tu touches au launch token, le Launch Token flow centralise déjà le nom, le symbole, la description, la mint address, le logo, le whitepaper, les wallets développeur, les liens X, Telegram, Discord, le fee preview, et la passerelle Bags.fm.";
  }

  return "If you’re working on token launch, the Launch Token flow already centralizes the name, symbol, description, mint address, logo, whitepaper, developer wallets, X, Telegram, Discord links, the fee preview, and the Bags.fm handoff.";
}

function getComparisonBlock(profile: ConversationProfile) {
  const tools = profile.mentionedTools.slice(0, 2);

  if (tools.length === 0) {
    if (profile.language === "fr") {
      return "Si tu veux une vraie comparaison utile, donne-moi juste deux noms, et je te dirai lequel est plus fort pour la confiance, la visibilité, ou la conversion sur Octopus Market.";
    }

    return "If you want a genuinely useful comparison, just give me two names, and I’ll tell you which one is stronger for trust, visibility, or conversion on Octopus Market.";
  }

  const comparedTools = toolCatalog.filter((tool) => tools.includes(tool.name));

  if (profile.language === "fr") {
    return `Comparaison rapide entre ${formatToolListFr(tools)}:
• ${comparedTools[0]?.name ?? tools[0]} se démarque surtout par ${comparedTools[0]?.description.toLowerCase() ?? "sa proposition de valeur"}.
• ${comparedTools[1]?.name ?? tools[1]} brille davantage par ${comparedTools[1]?.description.toLowerCase() ?? "son positionnement"}.
• Si ton objectif est la confiance et la différenciation dans Agent, ClawdTrust garde un angle plus unique grâce à son badge gold et à son focus Solana.`;
  }

  return `Quick comparison between ${formatToolList(tools)}:
• ${comparedTools[0]?.name ?? tools[0]} stands out mainly for ${comparedTools[0]?.description.toLowerCase() ?? "its core value proposition"}.
• ${comparedTools[1]?.name ?? tools[1]} is more differentiated around ${comparedTools[1]?.description.toLowerCase() ?? "its positioning"}.
• If your goal is trust and differentiation inside Agent, ClawdTrust keeps the more unique angle thanks to the gold badge and its Solana focus.`;
}

function getPositioningBlock(profile: ConversationProfile) {
  const referencedTools = profile.mentionedTools.length > 0 ? profile.mentionedTools : [];

  if (profile.language === "fr") {
    if (referencedTools.length > 0) {
      return `Pour ${formatToolListFr(referencedTools)}, je pousserais un message court, concret, et orienté résultat. Pas de blabla de robot: bénéfice clair, preuve rapide, puis appel à l’action visible.`;
    }

    return "Je te conseille un positionnement en trois couches: la promesse en une ligne, la preuve concrète, puis l’action à faire ensuite. C’est souvent là que ça mord bien. 🐶";
  }

  if (referencedTools.length > 0) {
    return `For ${formatToolList(referencedTools)}, I would push a short, concrete, outcome-led message. No robotic fluff: clear benefit, quick proof, then a visible call to action.`;
  }

  return "I’d recommend a three-layer positioning structure: one-line promise, concrete proof, then the next action to take. That usually bites in the right way. 🐶";
}

function getWritingBlock(profile: ConversationProfile) {
  const subject = profile.mentionedTools[0] ?? (profile.memory.projectsInProgress[0] ? profile.memory.projectsInProgress[0] : "your product");

  if (profile.language === "fr") {
    const frenchSubject = profile.mentionedTools[0] ?? (profile.memory.projectsInProgress[0] ? profile.memory.projectsInProgress[0] : "ton produit");
    return `Si tu veux un texte plus fort pour ${frenchSubject}, je partirais sur cette structure:
• promesse: une phrase ultra claire sur le résultat,
• preuve: pourquoi c’est crédible maintenant,
• appel à l’action: quoi faire ensuite sans hésiter.
Je peux aussi te le rédiger directement si tu me donnes le ton souhaité.`;
  }

  return `If you want stronger copy for ${subject}, I’d start with this structure:
• promise: one very clear outcome-led sentence,
• proof: why it feels credible right now,
• call to action: what to do next without hesitation.
I can also write it directly if you give me the tone you want.`;
}

function getSummaryBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return "Version courte de ce que je capte: tu veux une réponse plus autonome, plus utile, et ancrée dans ton contexte plutôt qu’un simple chatbot à réponses fixes.";
  }

  return "Short version of what I’m reading: you want a more autonomous, more useful reply style that adapts to your context instead of acting like a fixed-path chatbot.";
}

function getExplanationBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return "En version simple: Aido Agent doit comprendre ton intention, réutiliser ta mémoire, te répondre clairement, puis te proposer la meilleure suite au lieu d’attendre passivement la prochaine consigne.";
  }

  return "In simple terms: Aido Agent should understand your intent, reuse memory, answer clearly, and then propose the best next step instead of passively waiting for another command.";
}

function getBrainstormBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return `Trois pistes rapides que je vois tout de suite:
1. angle résultat: parler d’impact concret avant la techno,
2. angle confiance: mettre en avant badge, preuve, et clarté,
3. angle activation: rendre la prochaine action évidente dès le premier écran.`;
  }

  return `Three quick angles I see right away:
1. outcome angle: talk about concrete impact before the tech,
2. trust angle: lead with badge, proof, and clarity,
3. activation angle: make the next action obvious from the first screen.`;
}

function getAnalysisBlock(profile: ConversationProfile) {
  const currentGoal = profile.memory.currentGoals[0];

  if (profile.language === "fr") {
    return currentGoal
      ? `Mon analyse rapide en tenant compte de ton objectif actuel (${currentGoal}): tu gagneras surtout en clarté si tu simplifies la promesse, puis en conversion si tu remontes la preuve sociale et le CTA.`
      : "Mon analyse rapide: tu gagneras surtout en clarté si tu simplifies la promesse, puis en conversion si tu remontes la preuve sociale et le CTA.";
  }

  return currentGoal
    ? `My quick analysis, based on your current goal (${currentGoal}): you’ll gain most by simplifying the promise first, then increasing conversion by surfacing social proof and the CTA.`
    : "My quick analysis: you’ll gain most by simplifying the promise first, then increasing conversion by surfacing social proof and the CTA.";
}

function getPlanningBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return `Plan simple en 3 temps:
1. clarifier l’objectif,
2. transformer ça en message visible ou en setup concret,
3. lancer la prochaine action sur la plateforme sans attendre.`;
  }

  return `Simple three-step plan:
1. clarify the goal,
2. turn it into visible messaging or concrete setup,
3. launch the next action on the platform without waiting.`;
}

function getGeneralAutonomyBlock(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return "Je peux maintenant répondre plus librement comme un mini copilote: expliquer, reformuler, structurer, analyser, comparer, ou proposer des idées, tout en gardant ta mémoire utilisateur active.";
  }

  return "I can now answer more freely like a mini copilot: explain, rewrite, structure, analyze, compare, or suggest ideas while keeping your user memory active.";
}

function getActionPlan(profile: ConversationProfile) {
  const firstStep = profile.memory.currentGoals[0]
    ? profile.language === "fr"
      ? `rester aligné avec ton objectif actuel: ${profile.memory.currentGoals[0]}`
      : `stay aligned with your current goal: ${profile.memory.currentGoals[0]}`
    : profile.language === "fr"
      ? "clarifier la promesse produit en une phrase"
      : "tighten the product promise into one sentence";

  if (profile.language === "fr") {
    return `Voici la meilleure suite que je te recommande:
1. ${firstStep},
2. choisir l’angle entre Launch Token, Prediction Market, ou List My AI,
3. transformer ça en message visible, preuve claire, et prochaine action simple.`;
  }

  return `Here’s the next move I’d recommend:
1. ${firstStep},
2. choose the angle between Launch Token, Prediction Market, or List My AI,
3. turn that into visible copy, clear proof, and a simple next action.`;
}

function getProactiveQuestion(profile: ConversationProfile) {
  if (profile.taskTypes.includes("write")) {
    return profile.language === "fr"
      ? "Tu veux que je te rédige ça maintenant en version courte, premium, ou plus agressive côté conversion ?"
      : "Do you want me to draft that now in a short, premium, or more conversion-focused version?";
  }

  if (profile.topics.includes("launch")) {
    return profile.language === "fr"
      ? "Tu veux que je t’aide maintenant à structurer ton launch token, ou plutôt à préparer le message visible sur la fiche ?"
      : "Do you want me to help structure your token launch next, or prepare the public-facing listing message first?";
  }

  if (profile.topics.includes("listing") || profile.topics.includes("pricing")) {
    return profile.language === "fr"
      ? "Tu veux que je t’aide à choisir le bon plan, à préparer le paiement wallet Solana, ou à rédiger la fiche qui convertit le mieux ?"
      : "Do you want help choosing the right plan, preparing the Solana wallet payment, or writing the listing copy that converts best?";
  }

  if (profile.topics.includes("clawdtrust") || profile.topics.includes("comparison")) {
    return profile.language === "fr"
      ? "Tu veux une comparaison frontale avec un autre agent, ou tu préfères que je t’aide à mieux mettre en avant l’angle unique de ClawdTrust ?"
      : "Do you want a head-to-head comparison with another agent, or would you rather have me sharpen ClawdTrust’s unique angle first?";
  }

  return profile.language === "fr"
    ? "Balance-moi juste ton objectif, un texte à retravailler, ou une question sur la plateforme, et je prends le relais."
    : "Send me your goal, a draft to improve, or a platform question, and I’ll take it from there.";
}

function getClosing(profile: ConversationProfile) {
  if (profile.language === "fr") {
    return "Je suis prêt pour la suite, boss. Donne-moi ton contexte, ton brouillon, ou ta question, et je te répondrai comme un Aido Agent qui a de la mémoire et du mordant. 🐾";
  }

  return "I’m ready for the next step. Give me your context, draft, or question, and I’ll answer like an Aido Agent with memory and bite. 🐾";
}

export function createAssistantReply(input: string, history: CyrDogeMessage[], context: ReplyContext): CyrDogeMessage {
  const faqMatch = getFaqMatch(input);
  const faqLanguage = detectChatLanguage(input);

  if (faqMatch) {
    return {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      language: faqLanguage,
      content: createFaqReply(faqMatch.question, faqMatch.answer, faqLanguage),
      createdAt: Date.now(),
    };
  }

  const profile = buildProfile(input, history, context);
  const blocks = [getOpening(profile)];

  const learnedFactsLine = getLearnedFactsLine(profile);
  if (learnedFactsLine) {
    blocks.push(learnedFactsLine);
  }

  const memoryRecallLine = getMemoryRecallLine(profile);
  if (memoryRecallLine) {
    blocks.push(memoryRecallLine);
  }

  if (profile.taskTypes.includes("summarize")) {
    blocks.push(getSummaryBlock(profile));
  }

  if (profile.taskTypes.includes("explain")) {
    blocks.push(getExplanationBlock(profile));
  }

  if (profile.taskTypes.includes("brainstorm")) {
    blocks.push(getBrainstormBlock(profile));
  }

  if (profile.taskTypes.includes("analyze")) {
    blocks.push(getAnalysisBlock(profile));
  }

  if (profile.taskTypes.includes("plan")) {
    blocks.push(getPlanningBlock(profile));
  }

  if (profile.taskTypes.includes("write")) {
    blocks.push(getWritingBlock(profile));
  }

  if (profile.taskTypes.includes("compare") || profile.topics.includes("comparison")) {
    blocks.push(getComparisonBlock(profile));
  }

  if (profile.topics.includes("clawdtrust")) {
    blocks.push(getClawdTrustBlock(profile));
  }

  if (profile.topics.includes("pricing") || profile.topics.includes("listing")) {
    blocks.push(getPricingBlock(profile));
  }

  if (profile.topics.includes("visibility") || profile.topics.includes("positioning") || profile.topics.includes("agent")) {
    blocks.push(getVisibilityBlock(profile));
    blocks.push(getProductAngle(profile));
    blocks.push(getPositioningBlock(profile));
  }

  if (profile.topics.includes("launch")) {
    blocks.push(getLaunchBlock(profile));
  }

  if (profile.topics.includes("prediction")) {
    blocks.push(getPredictionMarketBlock(profile));
  }

  if (
    profile.topics.includes("general") ||
    profile.topics.includes("listing") ||
    profile.topics.includes("launch") ||
    profile.topics.includes("prediction") ||
    profile.topics.includes("clawdtrust")
  ) {
    blocks.push(getPlatformKnowledgeBlock(profile));
  }

  if (profile.topics.includes("general") || profile.taskTypes.includes("general") || blocks.length <= 3) {
    blocks.push(getGeneralAutonomyBlock(profile));
  }

  blocks.push(getActionPlan(profile));
  blocks.push(getProactiveQuestion(profile));
  blocks.push(getClosing(profile));

  const content = blocks.filter(Boolean).join("\n\n");

  return {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    language: profile.language,
    content,
    createdAt: Date.now(),
  };
}
