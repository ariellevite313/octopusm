# omdot.fun — Aido REST API v1

Read-only JSON API for the Aido Android app.  
Base URL: `https://omdot.fun/api/v1`  
Chain: Arc mainnet (Chain ID 5042), USDC natif 18 décimales.  
CORS: ouvert (`*`). Cache: 30 s. Rate limit: 60 req/min/IP.

---

## Endpoints

### `GET /v1/health`

```bash
curl https://omdot.fun/api/v1/health
```
```json
{ "ok": true, "version": "1.0.0", "ts": "2026-10-01T12:00:00.000Z" }
```

---

### `GET /v1/creators/{address}/summary`

Résumé des gains d'un créateur.

```bash
curl https://omdot.fun/api/v1/creators/0xf1173b875829293F7f02C20f177242a556f302fA/summary
```
```json
{
  "address":           "0xf1173b875829293f7f02c20f177242a556f302fa",
  "tokens":            2,
  "earned_total_usdc": "12.345678",
  "claimed_usdc":      "10.000000",
  "claimable_usdc":    "2.345678",
  "updated_at":        "2026-10-01T12:00:00.000Z"
}
```

Adresse inconnue → `200` avec zéros. Adresse invalide → `400`.  
`claimable_usdc` vient de `BondingCurveArcV2.creatorAccrued()` (on-chain, source de vérité).  
`claimed_usdc` vient de la DB `creator_fee_claims` (historique des claims).

---

### `GET /v1/creators/{address}/tokens`

Liste des tokens Arc du créateur avec détail par token.

```bash
curl https://omdot.fun/api/v1/creators/0xf1173b875829293F7f02C20f177242a556f302fA/tokens
```
```json
[
  {
    "token_address":  "0xAbCd…",
    "curve_address":  "0x1234…",
    "name":           "FooToken",
    "symbol":         "FOO",
    "image":          "https://cdn.omdot.fun/logo.png",
    "created_at":     "2026-09-21T10:00:00Z",
    "earned_usdc":    "5.123456",
    "claimed_usdc":   "3.000000",
    "claimable_usdc": "2.123456"
  }
]
```

- `token_address` : adresse du contrat OMToken (pour `claimDividend`)
- `curve_address` : adresse de la BondingCurveArcV2 (pour `claimCreatorFees`)
- `claimable_usdc` : chaîne décimale exacte (pas de flottant), 18 décimales en source

---

### `GET /v1/creators/{address}/claims?limit=50&cursor=…`

Historique paginé des claims, du plus récent au plus ancien.

```bash
# Première page
curl "https://omdot.fun/api/v1/creators/0xf1173b875829293F7f02C20f177242a556f302fA/claims?limit=20"

# Page suivante (utiliser next_cursor de la réponse précédente)
curl "https://omdot.fun/api/v1/creators/0xf1173b875829293F7f02C20f177242a556f302fA/claims?limit=20&cursor=2026-09-20T10:00:00Z"
```
```json
{
  "items": [
    {
      "tx_hash":       "0xabcd…",
      "token_address": "0x1234…",
      "amount_usdc":   "1.234567",
      "claim_type":    "creator",
      "timestamp":     "2026-09-21T12:00:00.000Z"
    }
  ],
  "next_cursor": "2026-09-20T08:00:00.000Z"
}
```

`next_cursor` est `null` s'il n'y a plus de pages.  
`claim_type` : `"creator"` (fees de création) ou `"dividend"` (dividendes holder).  
`limit` max : 100.

---

### `GET /v1/creators/{address}/claim-info`

Calldata prêt-à-l'emploi pour que l'app Aido signe et envoie la tx elle-même.  
**Aucune clé privée ne transite ici.**

#### Creator fees

```bash
# Claim vers le wallet créateur lui-même
curl "https://omdot.fun/api/v1/creators/0xf1173b875829293F7f02C20f177242a556f302fA/claim-info?token=0x1234…"

# Claim vers un vault Aido (redirection des fees)
curl "https://omdot.fun/api/v1/creators/0xf1173b875829293F7f02C20f177242a556f302fA/claim-info?token=0x1234…&recipient=0xVAULT…"
```
```json
{
  "contract":       "0x1234…",
  "function":       "claimCreatorFees(address)",
  "args":           ["0xf1173b875829293f7f02c20f177242a556f302fa"],
  "calldata":       "0xd6ae6e440000000000000000000000f1173b875829293f7f02c20f177242a556f302fa",
  "chain_id":       5042,
  "value":          "0",
  "claimable_usdc": "2.345678",
  "recipient":      "0xf1173b875829293f7f02c20f177242a556f302fa",
  "note":           "USDC is sent to `recipient`. Pass your vault address to redirect fees to Aido."
}
```

#### Dividendes holder

```bash
curl "https://omdot.fun/api/v1/creators/0xWALLET…/claim-info?type=dividend&token=0xOMTOKEN…"
```
```json
{
  "contract":       "0xOMTOKEN…",
  "function":       "claimDividend()",
  "args":           [],
  "calldata":       "0xf0fc6bca",
  "chain_id":       5042,
  "value":          "0",
  "claimable_usdc": "0.001234",
  "note":           "Dividend is always sent to msg.sender — vault redirection is not possible for dividends."
}
```

**Comment l'app Aido envoie la tx :**
```javascript
// Pseudo-code Android (ethers.js / web3j)
const tx = {
  to:       claimInfo.contract,
  data:     claimInfo.calldata,
  value:    "0x0",
  chainId:  claimInfo.chain_id,   // 5042
};
const signedTx = wallet.signTransaction(tx);
const txHash   = await provider.sendRawTransaction(signedTx);
```

---

## Réponses d'erreur

| Code | Cas |
|------|-----|
| 200  | Adresse inconnue → zéros |
| 400  | Adresse invalide (pas `0x` + 40 hex) |
| 404  | Token non trouvé ou n'appartient pas au créateur |
| 429  | Rate limit dépassé (60 req/min/IP) |
| 500  | Erreur interne |

---

## Architecture technique

```
Aido App (Android)
    │
    ▼ GET /api/v1/creators/{addr}/…
omdot.fun Next.js (VPS)
    ├── Supabase DB ← claimed history (creator_fee_claims)
    └── Arc RPC (rpc.mainnet.arc.io) ← claimable amounts (on-chain)
```

- **Source de vérité** des montants claimables : on-chain via `eth_call` (pas d'estimation)
- **Source de vérité** de l'historique : DB Supabase `creator_fee_claims`
- **Pas de clé privée** : l'API fournit le calldata, l'app signe elle-même
- **Vault redirection** : possible pour creator fees (`claimCreatorFees(to)`) ; pas possible pour dividendes (`claimDividend()` envoie toujours à `msg.sender`)

---

## Tests sur adresses réelles

```bash
# Test 1 — Treasury omdot.fun (adresse connue)
ADDR=0xf1173b875829293F7f02C20f177242a556f302fA
BASE=https://omdot.fun/api/v1

curl $BASE/v1/health
curl $BASE/creators/$ADDR/summary
curl $BASE/creators/$ADDR/tokens
curl "$BASE/creators/$ADDR/claims?limit=5"

# Test 2 — Adresse inconnue → doit retourner 200 avec zéros
curl $BASE/creators/0x0000000000000000000000000000000000000001/summary

# Test 3 — Adresse invalide → doit retourner 400
curl $BASE/creators/not-an-address/summary

# Test 4 — claim-info creator fees (remplacer par une vraie curve)
curl "$BASE/creators/$ADDR/claim-info?token=0xCURVE_ADDRESS"

# Test 5 — claim-info dividend
curl "$BASE/creators/0xHOLDER/claim-info?type=dividend&token=0xOMTOKEN_ADDRESS"

# Test 6 — claim-info avec vault Aido
curl "$BASE/creators/$ADDR/claim-info?token=0xCURVE&recipient=0xVAULT"
```

---

## Déploiement

```bash
# Sur le VPS, depuis ~/octopus-market-next
npm run build && pm2 restart all
```

Les routes sont dans `app/api/v1/` — aucune config supplémentaire requise.
