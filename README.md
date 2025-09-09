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

## Endpoints utilitaires

- `GET /pool/test?n=8&ms=0`: envoie `n` tâches de sommeil au pool (diagnostic / warmup)
- `GET /pool/stats`: expose l’état du pool (workers, file d’attente, config)
- `GET /metrics/reset`: remet à zéro les métriques agrégées côté rendu tuile

## Variables d’environnement

- `OM_BASE_URL`: base HTTP pour construire l’URL `.om` (défaut: `https://map-tiles.open-meteo.com/data_spatial`).
- `OM_FILE_URL`: override complet de l’URL `.om`. Les query `variable`, `bounds`, `partial=false` sont forcées.
- `OM_FILE_PATH`: chemin local vers un fichier `.om` à lire en priorité (bypasse HTTP).
- `ENABLE_INTEGRATION=1`: active le test d’intégration réseau.
- `ENABLE_LOCAL=1`: active le test d’intégration local (utilise `tests/data/2025-09-04T0900.om`).

### Piscina (pool de workers)

- `PISCINA_MAX_THREADS`: nombre max de threads (défaut: nombre de CPU)
- `PISCINA_MIN_THREADS`: nombre min de threads (défaut: moitié de `MAX`)
- `PISCINA_CONCURRENCY`: nombre de tâches simultanées par worker (défaut: 1)
- `PISCINA_IDLE_TIMEOUT`: arrêt des threads inactifs en ms (défaut: 30000)
- `WARMUP_POOL`: `1` pour préchauffer le pool au démarrage (défaut: 1)
- `METRICS`: `0` pour désactiver les métriques agrégées pendant les benches

## Tests

```bash
npm test

# activer intégration réseau
ENABLE_INTEGRATION=1 \
OM_FILE_URL="https://map-tiles.open-meteo.com/data_spatial/dwd_icon_d2/2025/09/04/1800Z/2025-09-04T1800.om" \
npm test

# activer intégration locale
ENABLE_LOCAL=1 OM_FILE_PATH="$(pwd)/tests/data/2025-09-04T0900.om" npm test

# bench dédié piscine (isoler ce fichier uniquement)
ENABLE_BENCH=1 BENCH_CONCURRENCY=64 node --test --import tsx tests/server/bench.tiles.test.ts | cat
ou
ENABLE_BENCH=1 BENCH_CONCURRENCY=64 \
PISCINA_MAX_THREADS=$(nproc) PISCINA_MIN_THREADS=$(nproc) \
WARMUP_POOL=1 METRICS=0 \
node --test --import tsx tests/server/bench.tiles.test.ts | cat
```

## Implémentation

- Construction d’`omUrl`: `src/server/om-url.ts`
- Génération tuile: `src/server/tile-service.ts`
- calcul des bounds → ranges, lecture partielle, interpolation, mapping couleur → PNG
- Route Fastify: `src/server/routes.ts` et initialisation `src/server/index.ts`

## Docker

### Build

```bash
docker build -t tile-server-om:latest .
```

### Run

```bash
docker run -d --name tile-server-om --restart unless-stopped \
  -p 3000:3000 \
  tile-server-om:latest
```

- Optionnel: variables d’environnement

```bash
docker run -d --name tile-server-om --restart unless-stopped \
  -p 3000:3000 \
  -e OM_BASE_URL=https://map-tiles.open-meteo.com/data_spatial \
  -e LATEST_BASE_URL=https://openmeteo.s3.amazonaws.com/data_spatial \
  tile-server-om:latest
```

- Optionnel: données locales via volume

```bash
docker run -d --name tile-server-om --restart unless-stopped \
  -p 3000:3000 \
  -e OM_FILE_PATH=/data/2025-09-04T0900.om \
  -v $(pwd)/tests/data:/data:ro \
  tile-server-om:latest
```

- Vérification

```bash
curl -sS http://localhost:3000/pool/stats | jq .
```

### Docker Compose

```yaml
services:
  tile-server-om:
    image: tile-server-om:latest
    container_name: tile-server-om
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      OM_BASE_URL: https://map-tiles.open-meteo.com/data_spatial
      LATEST_BASE_URL: https://openmeteo.s3.amazonaws.com/data_spatial
    # volumes:
    #   - ./tests/data:/data:ro
```

Notes:
- L’image utilise Node 20 et un utilisateur non-root `node`.
- Le bundle ESM `dist/server/index.mjs` est utilisé pour éviter les soucis d’extensions.
- `piscina-worker.mjs` est présent dans `dist/server/` et accessible au runtime.
