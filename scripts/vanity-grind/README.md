# Générateur d'adresses (PEPE…, CLT…, DoGE…)

Plus rapide que JavaScript. Utilise tous les cœurs du processeur et reprend là où il s'est arrêté.

```
cargo build --release
./target/release/grind PEPE 500 ./PEPE     # 500 adresses qui commencent par PEPE
./target/release/grind CLT 500 ./CLT
node ../import-vanity-keys.mjs --label PEPE ./PEPE/*.json
```

Durée sur 2 cœurs : CLT environ 3 minutes pour 500, PEPE environ 6 minutes par adresse
(le « P » en premier est rare sur Solana). Les fichiers contiennent des clés privées : les supprimer après l'import.
