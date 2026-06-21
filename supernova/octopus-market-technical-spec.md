# Spécification technique améliorée — Plateforme Octopus

## 1. Objectif général

La plateforme Octopus permet aux utilisateurs de s’inscrire avec leur wallet Solana, de placer des paris avec frais automatiques, de lister leurs IA, et aux administrateurs de gérer la plateforme. La plateforme est responsive sur ordinateur, téléphone et tablette. Le bouton profil est supprimé. Les frais sont de 1 % sur chaque paiement de pari et 5 % sur les gains. Toutes les actions critiques comme les paiements, gains, et résolutions sont automatisées ou tracées pour éviter les fraudes et les litiges.

## 2. Exigences pour les utilisateurs

### 2.1 Inscription et données utilisateur

Le système enregistre pour chaque utilisateur :

- Pseudo unique
- Lien ou nom du profil X / Twitter
- Adresse du wallet Solana

### 2.2 Système de paris et prédictions

L’utilisateur peut placer un pari sur une prédiction active.

Avant le paiement, le système affiche clairement :

- Le montant du pari
- Les 1 % de frais de réservation
- Le montant total à payer
- Le montant net que l’utilisateur recevra en cas de gain, après 5 % de frais

Le paiement du pari suit les règles suivantes :

- L’utilisateur paie le montant total, pari plus 1 %, vers une adresse de paiement fournie par la plateforme ou via une transaction vérifiée on-chain
- Le système vérifie automatiquement la transaction sur la blockchain Solana, y compris le montant exact, le destinataire correct, et la signature valide avant d’enregistrer le pari
- Si la vérification échoue, le pari n’est pas validé

Chaque pari doit enregistrer :

- Date et heure
- Montant du pari
- Frais de 1 % calculés
- Montant total payé
- Adresse Solana utilisée
- Cote choisie
- Côté choisi

Comportements attendus :

- Le montant total parié sur chaque prédiction s’affiche en temps réel
- Quand un pari est gagné, le système calcule automatiquement le gain brut, prélève 5 % de frais, puis envoie 95 % au wallet de l’utilisateur via transaction Solana

### 2.3 List My AI et Explore AI

L’utilisateur peut lister son IA en remplissant le formulaire et en payant les frais de listing.

Le système enregistre :

- Toutes les informations du formulaire
- Le paiement associé

Pour chaque IA listée, le système enregistre :

- Les interactions, y compris likes, étoiles, commentaires, et signalements
- Le nombre de visiteurs basé sur les clics uniques sur le lien

L’utilisateur peut :

- Choisir les frais d’abonnement
- Ou mettre l’IA en gratuit au moment du listing

Le listing devient visible immédiatement dans Explore AI.

## 3. Exigences pour l’administration

### 3.1 Gestion des prédictions et résolution

L’administrateur peut :

- Créer des prédictions
- Enregistrer le type du marché, VS ou simple
- Enregistrer les noms et images des équipes
- Supprimer ou retirer une prédiction

Pour résoudre un pari :

- L’administrateur utilise un bouton Résoudre dans le panneau admin
- Le système enregistre qui a résolu la prédiction, à quelle date, et quel résultat a été choisi
- Cela crée automatiquement les entrées de gains dans la base de données pour les gagnants

### 3.2 Gestion des IA listées

L’administrateur peut :

- Supprimer ou retirer n’importe quelle IA listée
- Ajouter une IA sans payer
- Enregistrer ce listing et le rendre visible immédiatement

### 3.3 Historique des paiements et frais

L’administrateur voit l’historique complet de tous les paiements, y compris :

- Les 1 % de frais sur les paris
- Les 5 % de frais sur les gains

### 3.4 Gestion des utilisateurs

L’administrateur peut :

- Suspendre un utilisateur
- Empêcher un utilisateur suspendu de placer de nouveaux paris
- Empêcher un utilisateur suspendu de lister de nouvelles IA
- Laisser valables les paris déjà placés
- Laisser les gains passés réclamables
- Réactiver à tout moment un utilisateur suspendu

## 4. Modèle de base de données amélioré

### Table users

- id
- pseudo
- twitter_profile
- solana_wallet_address
- status, actif ou suspendu
- created_at

### Table predictions

- id
- title
- description
- type, VS ou simple
- team1_name
- team1_image
- team2_name
- team2_image
- status
- resolved_by, admin id
- resolved_at
- result
- created_at

### Table bets

- id
- user_id
- prediction_id
- amount
- platform_fee_bet, 1 %
- total_paid
- chosen_side
- odds
- payment_tx_signature
- payment_status
- created_at

### Table winnings

- id
- bet_id
- user_id
- gross_winnings
- platform_fee_win, 5 %
- net_winnings
- tx_signature_sent
- status
- created_at

### Table ai_listings

- id
- user_id
- title
- description
- link
- subscription_fee
- status
- visitor_count
- created_at

### Table ai_interactions

- id
- ai_listing_id
- user_id
- type
- value
- created_at

### Table transactions

- id
- user_id
- type, bet, win, ai_listing
- amount
- platform_fee
- tx_signature
- status
- created_at

### Table admin_logs

- id
- admin_id
- action, create_prediction, resolve_prediction, remove_ai, suspend_user, etc.
- target_id
- details
- created_at

## 5. Exigences d’interface utilisateur et responsive

- La plateforme est entièrement responsive sur ordinateur, téléphone et tablette
- Le bouton profil est supprimé
- L’utilisateur accède à ses données via des liens clairs dans la navigation
- Les sections disponibles sont Mes Paris, Mes Gains, Mes IA Listées, et Tableau de bord Wallet
- Ces sections s’ouvrent après connexion du wallet
- Les frais de 1 % et 5 % sont affichés clairement avant toute confirmation de pari ou de listing

## 6. Règles techniques et solutions aux failles

### Vérification des paiements

Le système vérifie obligatoirement la transaction on-chain avant d’enregistrer un pari :

- Montant
- Destinataire
- Signature

Aucune confiance n’est accordée à la seule signature fournie par l’utilisateur.

### Résolution des paris

- Seul l’administrateur peut résoudre via le panneau admin
- Chaque résolution est tracée dans admin_logs et predictions

### Collecte des frais

- Les 1 % sont ajoutés au montant payé par l’utilisateur
- Les 5 % sont prélevés automatiquement sur les gains avant envoi
- Les frais sont enregistrés dans transactions

### Mises à jour en temps réel

- Les montants pariés et les compteurs de visiteurs se mettent à jour automatiquement
- La mise à jour temps réel peut utiliser Supabase Realtime ou WebSockets

### Protection contre les abus

- Limiter le nombre de likes et de signalements par utilisateur et par heure
- Le compteur de visiteurs compte uniquement les clics uniques

### Traçabilité admin

- Toutes les actions importantes de l’administrateur sont enregistrées dans admin_logs

### Gestion des utilisateurs suspendus

- Les utilisateurs suspendus conservent l’accès à leurs gains passés
- Ils ne peuvent plus interagir avec la plateforme sur les actions restreintes

## 7. Points supplémentaires à implémenter

- Afficher clairement les frais avant chaque action de paiement
- Permettre à l’utilisateur de voir l’historique de ses paris et de ses gains dans son tableau de bord wallet
- Ajouter une limite de temps pour résoudre les prédictions, par exemple 48 heures après la fin de l’événement
- Prévoir un système de remboursement ou de contestation simple pour les cas exceptionnels

## 8. Résultat attendu

Cette version corrigée est plus sécurisée, plus traçable, et prête pour le développement. Les principales failles, notamment la vérification des paiements, la résolution des paris, la traçabilité des frais, et l’accès utilisateur après suppression du bouton profil, sont traitées directement dans cette spécification.