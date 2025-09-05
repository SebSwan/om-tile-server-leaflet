# Tile Server OM (Fastify)

Serveur Node Fastify qui lit des fichiers `.om` Open-Meteo et renvoie des tuiles PNG 256×256 pour Leaflet/XYZ.

## Démarrage

```bash
nvm use 20.19.4
npm install
npm run dev
# écoute par défaut: http://0.0.0.0:3000
```

## Route

```
GET /tile/:domain/:variable/last/:z/:x/:y
```

- `domain`: ex. `dwd_icon_d2`
- `variable`: ex. `temperature_2m`
- `z/x/y`: coordonnées de tuile XYZ

Exemple curl:

```bash
curl -s "http://localhost:3000/tile/dwd_icon_d2/temperature_2m/last/5/16/10" -o tile.png
```

## Variables d’environnement

- `OM_BASE_URL`: base HTTP pour construire l’URL `.om` (défaut: `https://map-tiles.open-meteo.com/data_spatial`).
- `OM_FILE_URL`: override complet de l’URL `.om`. Les query `variable`, `bounds`, `partial=false` sont forcées.
- `OM_FILE_PATH`: chemin local vers un fichier `.om` à lire en priorité (bypasse HTTP).
- `ENABLE_INTEGRATION=1`: active le test d’intégration réseau.
- `ENABLE_LOCAL=1`: active le test d’intégration local (utilise `tests/data/2025-09-04T0900.om`).

## Tests

```bash
npm test

# activer intégration réseau
ENABLE_INTEGRATION=1 \
OM_FILE_URL="https://map-tiles.open-meteo.com/data_spatial/dwd_icon_d2/2025/09/04/1800Z/2025-09-04T1800.om" \
npm test

# activer intégration locale
ENABLE_LOCAL=1 OM_FILE_PATH="$(pwd)/tests/data/2025-09-04T0900.om" npm test
```

## Implémentation

- Construction d’`omUrl`: `src/server/om-url.ts`
- Génération tuile: `src/server/tile-service.ts`
  - calcul des bounds → ranges, lecture partielle, interpolation, mapping couleur → PNG
- Route Fastify: `src/server/routes.ts` et initialisation `src/server/index.ts`
