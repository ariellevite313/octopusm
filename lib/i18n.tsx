"use client";

/**
 * Site-wide i18n — EN / FR
 *
 * Usage in any client component:
 *   import { useT } from "@/lib/i18n";
 *   const { t, lang, toggleLang } = useT();
 *   <p>{t.loading}</p>
 *   <button onClick={toggleLang}>{lang === "en" ? "FR" : "EN"}</button>
 *
 * Wrap the app once with <LangProvider> (done in providers/providers.tsx).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { es } from "./i18n-dicts/es";
import { pt } from "./i18n-dicts/pt";
import { zh } from "./i18n-dicts/zh";
import { ru } from "./i18n-dicts/ru";
import { ar } from "./i18n-dicts/ar";
import { tr as trTurkish } from "./i18n-dicts/tr";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Lang = "en" | "fr" | "es" | "pt" | "zh" | "ru" | "ar" | "tr";

/** Langues proposées (nom dans sa propre langue). */
export const LANGS: { code: Lang; label: string; short: string; rtl?: boolean }[] = [
  { code: "en", label: "English",   short: "EN" },
  { code: "fr", label: "Français",  short: "FR" },
  { code: "es", label: "Español",   short: "ES" },
  { code: "pt", label: "Português", short: "PT" },
  { code: "zh", label: "中文",       short: "中文" },
  { code: "ru", label: "Русский",   short: "RU" },
  { code: "ar", label: "العربية",   short: "AR", rtl: true },
  { code: "tr", label: "Türkçe",    short: "TR" },
];

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

export type Translations = {
  // ── Common ─────────────────────────────────────────────────────────────────
  loading: string;
  reading: string;
  claim: string;
  claimed: string;
  cancel: string;
  save: string;
  saving: string;
  delete: string;
  deleting: string;
  copyAddress: string;
  error: string;
  connect: string;
  disconnect: string;
  retry: string;
  available: string;
  collecting: string;
  claiming: string;
  preparing: string;
  signing: string;

  // ── Dashboard / Arc fees ───────────────────────────────────────────────────
  creatorFees: string;
  dividends: string;
  noArcTokens: string;
  noDividends: string;
  noCreatorFees: string;
  noFeesAccrued: string;
  unableToReadBalance: string;
  usdcClaimable: string;
  usdcAvailable: string;
  claimedViewExplorer: string;
  collectedViewArcscan: string;
  claimedViewArcscan: string;
  loadingDividends: string;
  loadingPositions: string;
  myArcPositions: string;
  connectMetamask: string;
  connectWallet: string;
  feeClaimed: string;
  claimFees: string;
  claimFeesMeteora: string;

  // ── Swap ───────────────────────────────────────────────────────────────────
  noLiquidity: string;
  swapConfirmed: string;
  swapConfirmedArc: string;
  transactionFailed: string;
  transactionCancelled: string;
  insufficientBalance: (sol: string) => string;
  walletNotAvailable: string;
  connectToSwap: string;
  curveUnknown: string;
  quoteExpired: string;
  highImpact: (pct: string) => string;
  swapping: string;
  enterAmount: string;
  buyAnyway: string;
  buyToken: (ticker: string) => string;
  poweredByJupiter: string;

  // ── Claim fees arc / wizard ────────────────────────────────────────────────
  metamaskRequired: string;
  connectMetamaskArc: string;
  switchWallet: string;
  graduated: string;
  collectLpFees: string;
  claimUsdcFees: string;
  lpFeesInfo: string;
  tradeReversed: string;
  metamaskNotFound: string;
  connectMetamaskFirst: string;

  // ── Wallet button ──────────────────────────────────────────────────────────
  myWallet: string;
  editProfile: string;
  username: string;
  displayName: string;
  twitterHandle: string;
  overview: string;
  octoBalance: string;
  twitter: string;
  createMarket: string;
  adminPanel: string;
  profileUpdated: string;
  avatarUpdated: string;
  betsPlaced: string;
  winRate: string;
  referral: string;
  copyLink: string;
  copiedLink: string;
  filleuls: string;
  octoEarned: string;
  nextTier: string;
  noTier: string;
  maxTier: string;

  // ── My tokens ──────────────────────────────────────────────────────────────
  deleteConfirm: (name: string) => string;
  serverError: string;
  relaunch: string;
  deletionFailed: string;
  deleted: (name: string) => string;
  failedToLoadTokens: string;
  noTokensYet: string;
  launchFirstToken: string;
  viewToken: string;
  completeLaunch: string;
  scheduledLaunch: (date: string) => string;
  unknownError: string;

  // ── Toast notifications ────────────────────────────────────────────────────
  connectWalletFirst: string;
  solanaWalletNotFound: string;
  wrongWalletCreator: (addr: string) => string;
  failedToBuildTx: string;
  claimedFromToken: (amount: string, name: string) => string;
  claimingProgress: (i: number, total: number, name: string) => string;
  allFeesClaimed: (claimed: number, total: number) => string;
  omeroEarned: (amount: string | number) => string;
  bannerUpdated: string;
  uploadFailed: string;
  caCopied: string;
  addedToWatchlist: string;
  removedFromWatchlist: string;
  watchlistUpdateFailed: string;
  unsupportedFormat: string;
  logoMaxSize: string;
  pdfMaxSize: string;
  metamaskNoSolana: string;
  invalidSolanaAddress: string;
  tokenCreated: string;
  arcRequiresMetamask: string;
  arcRequiresMetamaskInstall: string;
  deployingArcV2: string;
  txSent: (hash: string) => string;
  waitingConfirmation: string;
  tokenDeployedArc: string;
  tokenLaunched: string;
  tokenScheduled: string;
  tokenScheduledDate: string;
  txSentWaiting: (sig: string) => string;
  feeAlreadyPaid: string;
  walletNotFoundInstall: (name: string) => string;
  unlockWallet: string;
  wrongWalletEnding: (addr: string) => string;
  noSolanaWallet: string;
  unlockWalletRetry: string;
};

// ── Translations ───────────────────────────────────────────────────────────────

const en: Translations = {
  // Common
  loading: "Loading…",
  reading: "Reading…",
  claim: "Claim",
  claimed: "Claimed",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  delete: "Delete",
  deleting: "Deleting…",
  copyAddress: "Copy address",
  error: "Error",
  connect: "Connect wallet",
  disconnect: "Disconnect",
  retry: "Retry",
  available: "available",
  collecting: "Collecting…",
  claiming: "Claiming…",
  preparing: "Preparing…",
  signing: "Signing…",

  // Dashboard / Arc fees
  creatorFees: "Creator fees",
  dividends: "Dividends",
  noArcTokens: "No Arc V2 tokens launched yet.",
  noDividends: "No dividends available.",
  noCreatorFees: "No creator fees yet",
  noFeesAccrued: "No fees accrued yet",
  unableToReadBalance: "Unable to read balance",
  usdcClaimable: "USDC claimable",
  usdcAvailable: "USDC available",
  claimedViewExplorer: "Claimed · view on explorer",
  collectedViewArcscan: "Collected — View on ArcScan",
  claimedViewArcscan: "Claimed — View on ArcScan",
  loadingDividends: "Loading dividends…",
  loadingPositions: "Loading positions…",
  myArcPositions: "My Arc positions",
  connectMetamask: "Connect\nMetaMask",
  connectWallet: "Connect\nwallet",
  feeClaimed: "Fees claimed",
  claimFees: "Claim fees",
  claimFeesMeteora: "Claim fees on Meteora",

  // Swap
  noLiquidity: "No liquidity",
  swapConfirmed: "Swap confirmed — View on Solscan",
  swapConfirmedArc: "Confirmed — ArcScan",
  transactionFailed: "Transaction failed",
  transactionCancelled: "Transaction cancelled",
  insufficientBalance: (sol) => `Insufficient balance (${sol} SOL available)`,
  walletNotAvailable: "Wallet not available",
  connectToSwap: "Connect your wallet to swap",
  curveUnknown: "Curve address unknown",
  quoteExpired: "Quote expired — refreshing…",
  highImpact: (pct) => `⚠ High impact (${pct}%) — try a smaller amount.`,
  swapping: "Swapping…",
  enterAmount: "Enter an amount",
  buyAnyway: "Buy anyway",
  buyToken: (ticker) => `Buy $${ticker}`,
  poweredByJupiter: "Powered by Jupiter",

  // Claim fees arc / wizard
  metamaskRequired: "MetaMask required to claim fees",
  connectMetamaskArc: "Connect MetaMask to receive your creator USDC on Arc.",
  switchWallet: "Switch wallet",
  graduated: "Graduated · V4",
  collectLpFees: "Collect LP fees",
  claimUsdcFees: "Claim USDC fees",
  lpFeesInfo: "LP fees V4 : 30% creator · 70% treasury",
  tradeReversed: "1% of each trade is returned to you in native USDC",
  metamaskNotFound: "MetaMask not found — install it to claim fees",
  connectMetamaskFirst: "Connect MetaMask first",

  // Wallet button
  myWallet: "My wallet",
  editProfile: "Edit profile",
  username: "Username",
  displayName: "Display name",
  twitterHandle: "Twitter / X handle",
  overview: "Balances",
  octoBalance: "OMERO",
  twitter: "Twitter / X",
  createMarket: "Create a market",
  adminPanel: "Admin Panel",
  profileUpdated: "Profile updated",
  avatarUpdated: "Avatar updated",
  betsPlaced: "Predicts",
  winRate: "Win rate",
  referral: "Referral",
  copyLink: "Copy link",
  copiedLink: "Copied!",
  filleuls: "referrals",
  octoEarned: "OMERO earned",
  nextTier: "next tier",
  noTier: "No tier yet",
  maxTier: "Max tier reached",

  // My tokens
  deleteConfirm: (name) => `Delete "${name}"? This action is irreversible.`,
  serverError: "Server error",
  relaunch: "Re-launch",
  deletionFailed: "Deletion failed",
  deleted: (name) => `${name} deleted`,
  failedToLoadTokens: "Failed to load your tokens. Please refresh the page.",
  noTokensYet: "You haven't launched any tokens yet.",
  launchFirstToken: "Launch your first token",
  viewToken: "View token",
  completeLaunch: "Complete launch",
  scheduledLaunch: (date) => `Launches ${date}`,
  unknownError: "Unknown error",

  // Toast notifications
  connectWalletFirst: "Connect your wallet first",
  solanaWalletNotFound: "Solana wallet not found — connect Phantom, Solflare or Backpack",
  wrongWalletCreator: (addr) => `Wrong wallet — use the creator wallet …${addr}`,
  failedToBuildTx: "Failed to build transaction",
  claimedFromToken: (amount, name) => `${amount} claimed from ${name}`,
  claimingProgress: (i, total, name) => `Claiming ${i}/${total} — ${name}…`,
  allFeesClaimed: (claimed, total) => `All fees claimed (${claimed}/${total} tokens)`,
  omeroEarned: (amount) => `+${amount} OMERO earned!`,
  bannerUpdated: "Banner updated",
  uploadFailed: "Upload failed",
  caCopied: "CA copied!",
  addedToWatchlist: "Added to watchlist",
  removedFromWatchlist: "Removed from watchlist",
  watchlistUpdateFailed: "Failed to update watchlist",
  unsupportedFormat: "Unsupported format. Use PNG, JPG, WebP, or GIF",
  logoMaxSize: "Logo max 5 MB",
  pdfMaxSize: "PDF max 20 MB",
  metamaskNoSolana: "MetaMask does not support Solana. Connect Phantom, Solflare or Backpack to create a Solana token.",
  invalidSolanaAddress: "The connected address is not a valid Solana address. Reconnect a Solana wallet.",
  tokenCreated: "Token created! Redirecting to your launch page…",
  arcRequiresMetamask: "Arc requires MetaMask. In Phantom, go to Settings → Default wallet → Always ask, then reload and use MetaMask.",
  arcRequiresMetamaskInstall: "Arc requires MetaMask — please install it and set it as default EVM wallet.",
  deployingArcV2: "Deploying token on Arc V2…",
  txSent: (hash) => `Tx sent: ${hash}…`,
  waitingConfirmation: "Waiting for confirmation…",
  tokenDeployedArc: "Token deployed on Arc V2! Redirecting…",
  tokenLaunched: "Token launched successfully!",
  tokenScheduled: "Scheduled!",
  tokenScheduledDate: "Scheduled! Token will be tradeable at launch date.",
  txSentWaiting: (sig) => `Tx sent! ${sig}… — page will update shortly.`,
  feeAlreadyPaid: "Fee already paid — approving pool creation only.",
  walletNotFoundInstall: (name) => `${name} not found — please install it first`,
  unlockWallet: "Please unlock your wallet and try again",
  wrongWalletEnding: (addr) => `Wrong wallet. Connect the creator wallet ending in …${addr}`,
  noSolanaWallet: "No Solana wallet found. Install Phantom, Solflare, or Backpack.",
  unlockWalletRetry: "Please unlock your wallet and try again",
};

const fr: Translations = {
  // Common
  loading: "Chargement…",
  reading: "Lecture…",
  claim: "Réclamer",
  claimed: "Réclamé",
  cancel: "Annuler",
  save: "Sauvegarder",
  saving: "Sauvegarde…",
  delete: "Supprimer",
  deleting: "Suppression…",
  copyAddress: "Copier l'adresse",
  error: "Erreur",
  connect: "Connecter le wallet",
  disconnect: "Déconnecter",
  retry: "Réessayer",
  available: "disponible",
  collecting: "Collecte…",
  claiming: "Réclamation…",
  preparing: "Préparation…",
  signing: "Signature…",

  // Dashboard / Arc fees
  creatorFees: "Frais créateur",
  dividends: "Dividendes",
  noArcTokens: "Aucun token Arc V2 lancé pour l'instant.",
  noDividends: "Aucun dividende disponible.",
  noCreatorFees: "Pas encore de frais créateur",
  noFeesAccrued: "Aucun frais accumulé",
  unableToReadBalance: "Impossible de lire le solde",
  usdcClaimable: "USDC réclamable",
  usdcAvailable: "USDC disponibles",
  claimedViewExplorer: "Réclamé · voir sur l'explorateur",
  collectedViewArcscan: "Collecté — Voir sur ArcScan",
  claimedViewArcscan: "Réclamé — Voir sur ArcScan",
  loadingDividends: "Chargement des dividendes…",
  loadingPositions: "Chargement des positions…",
  myArcPositions: "Mes positions Arc",
  connectMetamask: "Connecter\nMetaMask",
  connectWallet: "Connecter\nle wallet",
  feeClaimed: "Frais réclamés",
  claimFees: "Réclamer les frais",
  claimFeesMeteora: "Réclamer les frais sur Meteora",

  // Swap
  noLiquidity: "Pas de liquidité",
  swapConfirmed: "Swap confirmé — Voir sur Solscan",
  swapConfirmedArc: "Confirmé — ArcScan",
  transactionFailed: "Échec de la transaction",
  transactionCancelled: "Transaction annulée",
  insufficientBalance: (sol) => `Solde insuffisant (${sol} SOL disponible)`,
  walletNotAvailable: "Wallet non disponible",
  connectToSwap: "Connecte ton wallet pour swapper",
  curveUnknown: "Adresse de la courbe inconnue",
  quoteExpired: "Quote expirée — actualisation…",
  highImpact: (pct) => `⚠ Impact élevé (${pct}%) — essaie un montant plus petit.`,
  swapping: "Swap en cours…",
  enterAmount: "Entrer un montant",
  buyAnyway: "Acheter quand même",
  buyToken: (ticker) => `Acheter $${ticker}`,
  poweredByJupiter: "Propulsé par Jupiter",

  // Claim fees arc / wizard
  metamaskRequired: "MetaMask requis pour réclamer les fees",
  connectMetamaskArc: "Connecte MetaMask pour recevoir tes USDC créateur sur Arc.",
  switchWallet: "Changer de wallet",
  graduated: "Graduée · V4",
  collectLpFees: "Collecter les frais LP",
  claimUsdcFees: "Réclamer les frais USDC",
  lpFeesInfo: "Frais LP V4 : 30% créateur · 70% trésorerie",
  tradeReversed: "1% de chaque trade t'est reversé en USDC natif",
  metamaskNotFound: "MetaMask introuvable — installe-le pour réclamer les frais",
  connectMetamaskFirst: "Connecte MetaMask d'abord",

  // Wallet button
  myWallet: "Mon portefeuille",
  editProfile: "Modifier le profil",
  username: "Nom d'utilisateur",
  displayName: "Nom affiché",
  twitterHandle: "Pseudo Twitter / X",
  overview: "Soldes",
  octoBalance: "OMERO",
  twitter: "Twitter / X",
  createMarket: "Créer un marché",
  adminPanel: "Panel Admin",
  profileUpdated: "Profil mis à jour",
  avatarUpdated: "Avatar mis à jour",
  betsPlaced: "Prédictions",
  winRate: "Taux de victoire",
  referral: "Parrainage",
  copyLink: "Copier le lien",
  copiedLink: "Copié !",
  filleuls: "filleuls",
  octoEarned: "OMERO gagnés",
  nextTier: "tier suivant",
  noTier: "Pas encore de tier",
  maxTier: "Tier maximum atteint",

  // My tokens
  deleteConfirm: (name) => `Supprimer "${name}" ? Cette action est irréversible.`,
  serverError: "Erreur serveur",
  relaunch: "Re-lancer",
  deletionFailed: "Erreur lors de la suppression",
  deleted: (name) => `${name} supprimé`,
  failedToLoadTokens: "Impossible de charger vos tokens. Veuillez rafraîchir la page.",
  noTokensYet: "Vous n'avez pas encore lancé de tokens.",
  launchFirstToken: "Lancer votre premier token",
  viewToken: "Voir le token",
  completeLaunch: "Terminer le lancement",
  scheduledLaunch: (date) => `Lance le ${date}`,
  unknownError: "Erreur inconnue",

  // Toast notifications
  connectWalletFirst: "Connecte ton wallet d'abord",
  solanaWalletNotFound: "Wallet Solana introuvable — connecte Phantom, Solflare ou Backpack",
  wrongWalletCreator: (addr) => `Mauvais wallet — utilise le wallet créateur …${addr}`,
  failedToBuildTx: "Échec de la construction de la transaction",
  claimedFromToken: (amount, name) => `${amount} réclamé depuis ${name}`,
  claimingProgress: (i, total, name) => `Réclamation ${i}/${total} — ${name}…`,
  allFeesClaimed: (claimed, total) => `Tous les frais réclamés (${claimed}/${total} tokens)`,
  omeroEarned: (amount) => `+${amount} OMERO gagnés !`,
  bannerUpdated: "Bannière mise à jour",
  uploadFailed: "Téléchargement échoué",
  caCopied: "CA copié !",
  addedToWatchlist: "Ajouté à la liste de suivi",
  removedFromWatchlist: "Retiré de la liste de suivi",
  watchlistUpdateFailed: "Échec de la mise à jour de la liste de suivi",
  unsupportedFormat: "Format non supporté. Utilise PNG, JPG, WebP ou GIF",
  logoMaxSize: "Logo max 5 Mo",
  pdfMaxSize: "PDF max 20 Mo",
  metamaskNoSolana: "MetaMask ne supporte pas Solana. Connecte Phantom, Solflare ou Backpack pour créer un token Solana.",
  invalidSolanaAddress: "L'adresse connectée n'est pas une adresse Solana valide. Reconnecte un wallet Solana.",
  tokenCreated: "Token créé ! Redirection vers ta page de lancement…",
  arcRequiresMetamask: "Arc nécessite MetaMask. Dans Phantom, va dans Paramètres → Wallet par défaut → Toujours demander, puis recharge et utilise MetaMask.",
  arcRequiresMetamaskInstall: "Arc nécessite MetaMask — installe-le et définis-le comme wallet EVM par défaut.",
  deployingArcV2: "Déploiement du token sur Arc V2…",
  txSent: (hash) => `Tx envoyée : ${hash}…`,
  waitingConfirmation: "En attente de confirmation…",
  tokenDeployedArc: "Token déployé sur Arc V2 ! Redirection…",
  tokenLaunched: "Token lancé avec succès !",
  tokenScheduled: "Planifié !",
  tokenScheduledDate: "Planifié ! Le token sera échangeable à la date de lancement.",
  txSentWaiting: (sig) => `Tx envoyée ! ${sig}… — la page se mettra à jour prochainement.`,
  feeAlreadyPaid: "Frais déjà payés — approbation de la création du pool uniquement.",
  walletNotFoundInstall: (name) => `${name} introuvable — installe-le d'abord`,
  unlockWallet: "Déverrouille ton wallet et réessaie",
  wrongWalletEnding: (addr) => `Mauvais wallet. Connecte le wallet créateur se terminant par …${addr}`,
  noSolanaWallet: "Aucun wallet Solana trouvé. Installe Phantom, Solflare ou Backpack.",
  unlockWalletRetry: "Déverrouille ton wallet et réessaie",
};

// ── Context ────────────────────────────────────────────────────────────────────

type Vars = Record<string, string | number>;

type LangContextValue = {
  lang: Lang;
  t: Translations;
  /** Traduit une phrase écrite en anglais (clé = texte anglais). {nom} = variable. Repli : l'anglais. */
  tr: (text: string, vars?: Vars) => string;
  toggleLang: () => void;
  setLang: (l: Lang) => void;
};

function fill(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

const LangContext = createContext<LangContextValue>({
  lang: "en",
  t: en,
  tr: (text, vars) => fill(text, vars),
  toggleLang: () => {},
  setLang: () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────────

function applyLang(l: Lang) {
  const meta = LANGS.find((x) => x.code === l);
  document.documentElement.lang = l;
  document.documentElement.dir = meta?.rtl ? "rtl" : "ltr";
}

export function LangProvider({ children }: { children: ReactNode }) {
  // Même rendu côté serveur et au premier rendu client ; la langue réelle est lue juste après.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let l: Lang = "en";
    try {
      const saved = localStorage.getItem("octo-lang");
      if (isLang(saved)) l = saved;
      else {
        const nav = (navigator.languages?.[0] ?? navigator.language ?? "en").slice(0, 2).toLowerCase();
        if (isLang(nav)) l = nav;
      }
    } catch { /* ignore */ }
    setLangState(l);
    applyLang(l);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    try { localStorage.setItem("octo-lang", l); } catch { /* ignore */ }
    applyLang(l);
  }

  function toggleLang() {
    setLang(lang === "en" ? "fr" : "en");
  }

  // Les clés non traduites retombent sur l'anglais
  const t = useMemo<Translations>(() => {
    const dict: Partial<Translations> =
      lang === "fr" ? fr : lang === "es" ? es : lang === "pt" ? pt : lang === "zh" ? zh : lang === "ru" ? ru : lang === "ar" ? ar : lang === "tr" ? trTurkish : en;
    return { ...en, ...dict };
  }, [lang]);

  // Phrases (clé = texte anglais) : chargées à la demande pour la langue choisie
  const [phrases, setPhrases] = useState<Record<string, string>>({});
  useEffect(() => {
    if (lang === "en") { setPhrases({}); return; }
    let live = true;
    import(`./i18n-phrases/${lang}`)
      .then((m) => { if (live) setPhrases(m.default ?? {}); })
      .catch(() => { if (live) setPhrases({}); });
    return () => { live = false; };
  }, [lang]);

  const tr = useCallback(
    (text: string, vars?: Vars) => fill(phrases[text] ?? text, vars),
    [phrases],
  );

  const value: LangContextValue = { lang, t, tr, toggleLang, setLang };

  return (
    <LangContext.Provider value={value}>
      <DocTitle />
      {children}
    </LangContext.Provider>
  );
}

/** Traduit le titre de l'onglet (défini côté serveur en anglais) selon la langue choisie. */
function DocTitle() {
  const { lang, tr } = useT();
  const orig = useRef("");
  const last = useRef("");
  useEffect(() => {
    const SUFFIX = " - OMdotfun";
    const apply = () => {
      if (document.title !== last.current) orig.current = document.title;
      const cur = orig.current;
      if (!cur) return;
      const hasSuffix = cur.endsWith(SUFFIX);
      const base = hasSuffix ? cur.slice(0, -SUFFIX.length) : cur;
      let out = tr(base);
      if (out === base) {
        const m = base.match(/^(.+?) ([—|]) (.+)$/);
        if (m) out = `${tr(m[1])} ${m[2]} ${m[3]}`;
      }
      const next = hasSuffix ? out + SUFFIX : out;
      last.current = next;
      if (document.title !== next) document.title = next;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => obs.disconnect();
  }, [lang, tr]);
  return null;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useT() {
  return useContext(LangContext);
}

/** Texte traduit pour du JSX rendu côté serveur : <Tr>Launch date</Tr> */
export function Tr({ children, vars }: { children: string; vars?: Vars }) {
  const { tr } = useT();
  return <>{tr(children, vars)}</>;
}

/**
 * Texte riche : <b>gras</b>, <br/> et [lien](/chemin) dans une phrase traduite.
 * Ex. : <Rich>{tr("Pay <b>2 USDC</b> or see the [FAQ](/faq).")}</Rich>
 */
export function Rich({ children, linkClass = "text-violet-600 dark:text-violet-400 underline underline-offset-2" }: { children: string; linkClass?: string }) {
  const out: ReactNode[] = [];
  const re = /<b>(.*?)<\/b>|<br\s*\/?>|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(children))) {
    if (m.index > last) out.push(children.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>);
    else if (m[2] !== undefined) {
      const ext = /^https?:/.test(m[3]);
      out.push(<a key={i++} href={m[3]} className={linkClass} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{m[2]}</a>);
    } else out.push(<br key={i++} />);
    last = m.index + m[0].length;
  }
  if (last < children.length) out.push(children.slice(last));
  return <>{out}</>;
}
