# Tests de Migration MapLibre → Leaflet

Ce dossier contient les tests TypeScript pour valider la migration de MapLibre vers Leaflet.

## Tests Disponibles

### `leaflet-migration.test.ts`
Test complet d'intégration qui valide :
- ✅ Chargement dynamique de Leaflet (gestion SSR)
- ✅ Création de cartes avec options personnalisées
- ✅ Contrôles Leaflet personnalisés
- ✅ Couche OMaps personnalisée
- ✅ Intégration complète carte + couche
- ✅ Gestion d'erreurs
- ✅ Types TypeScript

### `tile-coordinates.test.ts`
Test spécifique pour l'affichage des tuiles qui valide :
- ✅ Création de canvas avec bonnes dimensions
- ✅ Dégradé coloré (bleu → orange)
- ✅ Affichage des coordonnées z/x/y
- ✅ Gestion des différents niveaux de zoom
- ✅ Callback `done()` après délai
- ✅ Création de tuiles distinctes

## Commandes de Test

```bash
# Tous les tests
npm test

# Tests spécifiques Leaflet
npm run test:leaflet

# Mode watch pour développement
npm run test:watch

# Tests unitaires seulement
npm run test:unit
```

## Structure des Tests

```
src/lib/tests/
├── leaflet-migration.test.ts    # Tests d'intégration
├── tile-coordinates.test.ts     # Tests des tuiles
└── README.md                    # Cette documentation
```

## Fonctionnalités Testées

### 🗺️ **Carte Leaflet**
- Initialisation avec options par défaut
- Centrage sur la Suisse (47.3769, 8.5417)
- Couche de base OpenStreetMap
- Contrôles de navigation

### 🎛️ **Contrôles Personnalisés**
- Bouton Variables (drawer)
- Bouton Time Selector
- Position topright
- Événements de clic

### 🌡️ **Couche OMaps**
- Extension de `L.GridLayer`
- Options configurables (omUrl, domain, variable, opacity)
- Méthode `updateOptions()` avec redraw
- Tuiles de test avec dégradé

### 🎨 **Tuiles de Test**
- Canvas 256x256 pixels
- Dégradé bleu → orange avec transparence
- Texte avec coordonnées z/x/y
- Rendu asynchrone avec callback

### 🔧 **Gestion SSR**
- Import dynamique de Leaflet
- Détection environnement navigateur
- Erreurs appropriées côté serveur

## Objectifs de Validation

1. **Fonctionnalité** : Toutes les fonctions Leaflet marchent
2. **Performance** : Pas de régression vs MapLibre
3. **Compatibilité** : Types TypeScript corrects
4. **Robustesse** : Gestion d'erreurs appropriée
5. **Migration** : MapLibre complètement supprimé

## Prochaines Étapes

Les tests actuels valident la base Leaflet. Les prochaines phases ajouteront :
- Tests du pipeline worker
- Tests des données météo réelles
- Tests de performance des tuiles
- Tests d'intégration complète avec OMaps protocol


