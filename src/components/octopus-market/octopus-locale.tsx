import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

type OctopusLocale = "en" | "fr";

type OctopusLocaleContextValue = {
  locale: OctopusLocale;
  setLocale: (locale: OctopusLocale) => void;
  tr: (englishText: string, frenchText: string) => string;
};

const OctopusLocaleContext = createContext<OctopusLocaleContextValue | null>(null);
const storageKey = "octopus-market-locale-v1";

const translationEntries: Array<[string, string]> = [
  ["Connect wallet", "Connecter le wallet"],
  ["Connecting wallet...", "Connexion du wallet..."],
  ["Disconnect", "Déconnecter"],
  ["Disconnect wallet", "Déconnecter le wallet"],
  ["Light mode", "Mode clair"],
  ["Dark mode", "Mode sombre"],
  ["Close", "Fermer"],
  ["User access", "Accès utilisateur"],
  ["Open your personal sections and dedicated platform windows from here.", "Ouvrez ici vos sections personnelles et les fenêtres dédiées de la plateforme."],
  ["Data Base", "Base de données"],
  ["Admin Control Center", "Centre de contrôle admin"],
  ["My Bets", "Mes paris"],
  ["My Winnings", "Mes gains"],
  ["Wallet Dashboard", "Tableau de bord wallet"],
  ["Prediction Market", "Marché de prédiction"],
  ["List My AI", "Lister mon IA"],
  ["AI Listing Price", "Prix du listing IA"],
  ["Launch Token", "Lancer un token"],
  ["Explore AI", "Explorer les IA"],
  ["Sports", "Sports"],
  ["Crypto", "Crypto"],
  ["Politics", "Politique"],
  ["Technology", "Technologie"],
  ["Technologie", "Technologie"],
  ["Cinema", "Cinéma"],
  ["Gaming", "Gaming"],
  ["Live date", "Date en direct"],
  ["SOL balance", "Solde SOL"],
  ["USDC balance", "Solde USDC"],
  ["Drag", "Glisser"],
  ["Loading...", "Chargement..."],
  ["Syncing...", "Synchronisation..."],
  ["Loading user page...", "Chargement de la page utilisateur..."],
  ["Loading prediction market...", "Chargement du marché de prédiction..."],
  ["Loading launch studio...", "Chargement du studio de lancement..."],
  ["Loading community AI...", "Chargement de la communauté IA..."],
  ["Loading reactions...", "Chargement des réactions..."],
  ["Loading database...", "Chargement de la base de données..."],
  ["Loading admin center...", "Chargement du centre admin..."],
  ["Loading Aido Agent...", "Chargement de Aido Agent..."],
  ["Back to top", "Retour en haut"],
  ["Aido Agent", "Aido Agent"],
  ["Floating assistant", "Assistant flottant"],
  ["Dedicated view", "Vue dédiée"],
  ["The prediction flow now opens only inside this dedicated window, separated from the main platform page.", "Le flux de prédiction s’ouvre maintenant uniquement dans cette fenêtre dédiée, séparée de la page principale."],
  ["The launch token flow now opens only inside this dedicated window, separate from the main platform page.", "Le flux de lancement de token s’ouvre maintenant uniquement dans cette fenêtre dédiée, séparée de la page principale."],
  ["The AI listing flow now opens only inside this dedicated window, separate from the main platform page.", "Le flux de listing IA s’ouvre maintenant uniquement dans cette fenêtre dédiée, séparée de la page principale."],
  ["Explore AI now opens only inside this dedicated window, separate from the main platform page.", "Explore AI s’ouvre maintenant uniquement dans cette fenêtre dédiée, séparée de la page principale."],
  ["No prediction market is open yet in this section. Select another section to see its live markets.", "Aucun marché de prédiction n’est encore ouvert dans cette section. Sélectionnez une autre section pour voir ses marchés en direct."],
  ["3 choices open", "3 choix ouverts"],
  ["2 choices open", "2 choix ouverts"],
  ["Place a bet", "Placer un pari"],
  ["Ready to become an AI reference?", "Prêt à devenir une référence IA ?"],
  ["Launch your presence on Octopus Market now.", "Lancez votre présence sur Octopus Market maintenant."],
  ["Launch Token, Prediction Market, AI listing, official platform references, and wallet validation all work together in one Octopus Market flow.", "Launch Token, Prediction Market, listing IA, références officielles de la plateforme, et validation du wallet fonctionnent ensemble dans un seul flux Octopus Market."],
  ["List my AI", "Lister mon IA"],
  ["Browse open markets", "Voir les marchés ouverts"],
  ["Key information", "Informations clés"],
  ["Important platform references are accessible at a glance.", "Les références importantes de la plateforme sont accessibles en un coup d’œil."],
  ["Website · octomarket.fun", "Site web · octomarket.fun"],
  ["X / Twitter · @octomarketfun", "X / Twitter · @octomarketfun"],
  ["Official token · $ClawdTrust on BagsApp", "Token officiel · $ClawdTrust sur BagsApp"],
  ["CA · DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS", "CA · DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS"],
  ["Copy", "Copier"],
  ["Copied", "Copié"],
  ["© 2026 Octopus Market · All rights reserved", "© 2026 Octopus Market · Tous droits réservés"],
  ["Designed to showcase, launch, and grow premium AI products on the market.", "Conçu pour présenter, lancer, et développer des produits IA premium sur le marché."],
  ["Prediction market sections", "Sections du marché de prédiction"],
  ["Wallet approval required", "Approbation du wallet requise"],
  ["Take positions by section inside Octopus Market", "Prenez position par section dans Octopus Market"],
  ["Choose a market section", "Choisissez une section de marché"],
  ["No live bets are open in this section yet. Add a new market from the admin panel and it will appear here automatically.", "Aucun pari en direct n’est encore ouvert dans cette section. Ajoutez un nouveau marché depuis le panneau admin et il apparaîtra ici automatiquement."],
  ["Confirm position", "Confirmer la position"],
  ["Connect & confirm", "Connecter et confirmer"],
  ["Live volume", "Volume en direct"],
  ["Net return", "Retour net"],
  ["Prediction wallet summary", "Résumé du wallet de prédiction"],
  ["Payment token", "Token de paiement"],
  ["Latest transfer request", "Dernière demande de transfert"],
  ["Payment made", "Paiement effectué"],
  ["History and claims moved to the wallet dashboard", "Historique et claims déplacés vers le tableau de bord wallet"],
  ["Owner resolution panel", "Panneau de résolution admin"],
  ["Admin wallet connected", "Wallet admin connecté"],
  ["Admin wallet required", "Wallet admin requis"],
  ["Add market", "Ajouter un marché"],
  ["Close", "Fermer"],
  ["Publish market", "Publier le marché"],
  ["Cancel", "Annuler"],
  ["Delete", "Supprimer"],
  ["Prototype status", "Statut du prototype"],
  ["Action required", "Action requise"],
  ["Prediction market updated", "Marché de prédiction mis à jour"],
  ["Launch studio", "Studio de lancement"],
  ["Launch token or list an AI from one guided workspace", "Lancer un token ou lister une IA depuis un espace guidé"],
  ["Launch Token", "Lancer un token"],
  ["Create token", "Créer un token"],
  ["Octopus Tokens", "Tokens Octopus"],
  ["Marketplace listing", "Listing marketplace"],
  ["Ready to publish your AI?", "Prêt à publier votre IA ?"],
  ["Start AI submission", "Commencer la soumission IA"],
  ["Connect wallet to unlock listing", "Connecter le wallet pour débloquer le listing"],
  ["AI listing submission", "Soumission de listing IA"],
  ["Submit a new AI for Octopus Market", "Soumettre une nouvelle IA pour Octopus Market"],
  ["Step 1 · AI details", "Étape 1 · Détails de l’IA"],
  ["Step 2 · Review listing", "Étape 2 · Vérifier le listing"],
  ["Step 2 · Pay with USDC", "Étape 2 · Payer en USDC"],
  ["Submit AI icon", "Soumettre l’icône de l’IA"],
  ["AI website URL", "URL du site web de l’IA"],
  ["AI details, maximum 500 words", "Détails de l’IA, maximum 500 mots"],
  ["AI social network URL", "URL du réseau social de l’IA"],
  ["Submit a PDF guide", "Soumettre un guide PDF"],
  ["Listing summary", "Résumé du listing"],
  ["Linked wallet", "Wallet lié"],
  ["Selected plan", "Plan sélectionné"],
  ["Payment", "Paiement"],
  ["Validation rules", "Règles de validation"],
  ["Submit free listing", "Soumettre un listing gratuit"],
  ["Pay with USDC", "Payer en USDC"],
  ["Payment validation in progress", "Validation du paiement en cours"],
  ["Listing workflow", "Flux du listing"],
  ["Open website", "Ouvrir le site web"],
  ["No results for this search", "Aucun résultat pour cette recherche"],
  ["Try another keyword or go back to the All tab.", "Essayez un autre mot-clé ou revenez à l’onglet Tous."],
  ["All", "Tous"],
  ["Agents", "Agents"],
  ["Images", "Images"],
  ["Finance", "Finance"],
  ["Code", "Code"],
  ["Search a tool, benefit, or category", "Rechercher un outil, un avantage, ou une catégorie"],
  ["Growing premium catalog", "Catalogue premium en croissance"],
  ["User area", "Espace utilisateur"],
  ["Back to home", "Retour à l’accueil"],
  ["Wallet dashboard", "Tableau de bord wallet"],
  ["My Token Launches", "Mes lancements de tokens"],
  ["Connect your wallet to open your dashboard", "Connectez votre wallet pour ouvrir votre tableau de bord"],
  ["Connect wallet", "Connecter le wallet"],
  ["No bets recorded yet.", "Aucun pari enregistré pour le moment."],
  ["No winnings are available yet.", "Aucun gain disponible pour le moment."],
  ["Claim", "Réclamer"],
  ["Claiming...", "Réclamation..."],
  ["Claimed", "Réclamé"],
  ["No AI submitted yet. Use the button above to start Step 1 and Step 2 of the listing flow.", "Aucune IA soumise pour le moment. Utilisez le bouton ci-dessus pour démarrer les étapes 1 et 2 du flux de listing."],
  ["No token launch recorded yet.", "Aucun lancement de token enregistré pour le moment."],
  ["Connect wallet to unlock Aido Agent", "Connecter le wallet pour débloquer Aido Agent"],
  ["Stored Q&A series", "Série de Q&R enregistrée"],
  ["Live chat preview", "Aperçu du chat en direct"],
  ["Platform-aware mode", "Mode conscient de la plateforme"],
  ["New chat", "Nouveau chat"],
  ["Send", "Envoyer"],
  ["What changed in this version", "Ce qui a changé dans cette version"],
  ["English", "Anglais"],
  ["French", "Français"],
  ["Language", "Langue"],
];

const translations = new Map(translationEntries);
const reverseTranslations = new Map(translationEntries.map(([englishText, frenchText]) => [frenchText, englishText]));

function translateExactText(text: string, locale: OctopusLocale) {
  if (locale === "fr") {
    return translations.get(text) ?? text;
  }

  return reverseTranslations.get(text) ?? text;
}

function replaceTrimmedText(text: string, locale: OctopusLocale) {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return text;
  }

  const translatedText = translateExactText(trimmedText, locale);

  if (translatedText === trimmedText) {
    return text;
  }

  const leadingWhitespace = text.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = text.match(/\s*$/)?.[0] ?? "";
  return `${leadingWhitespace}${translatedText}${trailingWhitespace}`;
}

function applyLocaleToTree(root: HTMLElement, locale: OctopusLocale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const currentNode = walker.currentNode;
    if (currentNode instanceof Text) {
      textNodes.push(currentNode);
    }
  }

  textNodes.forEach((node) => {
    const nextValue = replaceTrimmedText(node.nodeValue ?? "", locale);
    if (nextValue !== (node.nodeValue ?? "")) {
      node.nodeValue = nextValue;
    }
  });

  const elements = root.querySelectorAll<HTMLElement>("*");
  elements.forEach((element) => {
    ["placeholder", "title", "aria-label"].forEach((attributeName) => {
      const currentValue = element.getAttribute(attributeName);
      if (!currentValue) {
        return;
      }

      const nextValue = translateExactText(currentValue, locale);
      if (nextValue !== currentValue) {
        element.setAttribute(attributeName, nextValue);
      }
    });
  });
}

export function OctopusLocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<OctopusLocale>(() => {
    if (typeof window === "undefined") {
      return "en";
    }

    const storedValue = window.localStorage.getItem(storageKey);
    return storedValue === "fr" ? "fr" : "en";
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isApplyingRef = useRef(false);

  const setLocale = useCallback((nextLocale: OctopusLocale) => {
    setLocaleState(nextLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, nextLocale);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.lang = locale === "fr" ? "fr" : "en";
  }, [locale]);

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement || typeof MutationObserver === "undefined") {
      return;
    }

    const applyNow = () => {
      if (!rootRef.current) {
        return;
      }

      isApplyingRef.current = true;
      applyLocaleToTree(rootRef.current, locale);
      window.setTimeout(() => {
        isApplyingRef.current = false;
      }, 0);
    };

    applyNow();

    const observer = new MutationObserver(() => {
      if (isApplyingRef.current) {
        return;
      }

      applyNow();
    });

    observer.observe(rootElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"],
    });

    return () => {
      observer.disconnect();
    };
  }, [locale]);

  const contextValue = useMemo<OctopusLocaleContextValue>(
    () => ({
      locale,
      setLocale,
      tr: (englishText, frenchText) => (locale === "fr" ? frenchText : englishText),
    }),
    [locale, setLocale]
  );

  return (
    <OctopusLocaleContext.Provider value={contextValue}>
      <div ref={rootRef} data-octopus-locale-root>
        {children}
      </div>
    </OctopusLocaleContext.Provider>
  );
}

export function useOctopusLocale() {
  const contextValue = useContext(OctopusLocaleContext);

  if (!contextValue) {
    throw new Error("useOctopusLocale must be used inside OctopusLocaleProvider");
  }

  return contextValue;
}
