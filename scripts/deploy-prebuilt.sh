#!/usr/bin/env bash
# Déploiement sans build sur le serveur : récupère le code, attend le build fait par GitHub pour ce commit,
# remplace .next et redémarre pm2.  Usage : bash scripts/deploy-prebuilt.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="ariellevite313/octopusm"
URL="https://github.com/$REPO/releases/download/build-latest/next-build.tgz"

git pull --ff-only origin main
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -qE '^package(-lock)?\.json$'; then npm ci; fi
SHA=$(git rev-parse HEAD)
echo "Commit à déployer : $SHA"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for i in $(seq 1 40); do
  curl -fsSL -o "$TMP/next-build.tgz" "$URL" && tar -xzf "$TMP/next-build.tgz" -C "$TMP" .next/OM_COMMIT 2>/dev/null || true
  BUILT=$(cat "$TMP/.next/OM_COMMIT" 2>/dev/null || echo none)
  [ "$BUILT" = "$SHA" ] && break
  echo "Build GitHub pas encore prêt pour ce commit (dernier : ${BUILT:0:7}), nouvel essai dans 30 s ($i/40)"
  sleep 30
done
[ "$BUILT" = "$SHA" ] || { echo "Le build de ce commit n'est pas disponible. Regarde l'onglet Actions sur GitHub."; exit 1; }

rm -rf "$TMP/.next" && mkdir -p "$TMP/out"
tar -xzf "$TMP/next-build.tgz" -C "$TMP/out"
rm -rf .next.old
[ -d .next ] && mv .next .next.old
mv "$TMP/out/.next" .next
pm2 restart octopus --update-env
rm -rf .next.old
echo "Déployé : $SHA"
