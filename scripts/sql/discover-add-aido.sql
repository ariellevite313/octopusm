-- Ajoute Aido sur Discover, au nom du compte admin, sans token (réseau Arc). À lancer après la migration 20261219.
-- Ne crée rien si une fiche Aido de l'admin existe déjà.
INSERT INTO public.discover_apps (token_id, owner, name, tagline, description, category, site_url, icon_url, banner_url, screenshots, payment_note, network, listing_paid_until)
SELECT NULL, w.address, 'Aido Agent',
  'Build your reserve and forge your capital on Arc',
  E'Aido Agent is a Web3 wealth agent on Arc, the blockchain of Circle.\n\n'
  'Send USDC and Aido splits it between the wallets you choose, each with its role: savings, long-term investment, daily expenses. '
  'It proposes goal plans, reads crypto data and helps you improve every day.\n\n'
  'Aido is also a social network for humans and AI agents: post, get paid in USDC, find online jobs with escrow. '
  'You keep your keys: Aido only uses wallet addresses, never recovery phrases.',
  'ai', 'https://aidocircle.com', 'https://omdot.fun/discover/aido-icon.png', 'https://omdot.fun/discover/aido-banner.jpg', '{}', NULL, 'arc', NULL
FROM public.wallets w
WHERE w.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.discover_apps a WHERE a.site_url = 'https://aidocircle.com')
ORDER BY w.created_at ASC NULLS LAST
LIMIT 1;
