# Octopus Market — Next.js 15

Réécriture complète avec Next.js 15 (App Router) + Supabase + Tailwind v4.

## Démarrage

```bash
# 1. Copier et remplir les variables d'environnement
cp .env.local.example .env.local

# 2. Installer les dépendances
npm install

# 3. Lancer en développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Stack

- **Framework** : Next.js 15 (App Router)
- **Auth** : Supabase Auth (wallet ed25519)
- **DB** : Supabase PostgreSQL
- **Wallet** : @solana/wallet-adapter (Phantom, Solflare, Backpack…)
- **RPC Solana** : Helius
- **UI** : shadcn/ui + Tailwind v4
- **State serveur** : TanStack React Query
- **Formulaires** : React Hook Form + Zod

## Déploiement Hostinger

```bash
npm run build
npm start   # écoute sur le port défini par Hostinger
```
