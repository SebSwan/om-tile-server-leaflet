### Bug Fixes

- add badges ([f8943f9](https://github.com/open-meteo/maps/commit/f8943f997ce1f2268a01fef03ae25a286e540633))

## [0.0.2](https://github.com/SebSwan/om-tile-server-leaflet/compare/maps-v0.0.1...maps-v0.0.2) (2025-09-10)


### Features

* add kma ([c017ada](https://github.com/SebSwan/om-tile-server-leaflet/commit/c017ada7d40f12db9c7e4137fee0966da84553de))
* add support for convective cloud color scales ([d19381d](https://github.com/SebSwan/om-tile-server-leaflet/commit/d19381d4f6c8a5a2ed2bcc9aea50b7a589a10062))
* add zoom control ([f5a25db](https://github.com/SebSwan/om-tile-server-leaflet/commit/f5a25db5b15082a2b5357f592568550261bb8423))
* ajout d'un composant SimpleWeatherPopup pour afficher les informations météo au clic sur la carte, et intégration de la logique de conversion de couleur en valeur météo dans +page.svelte ([976da92](https://github.com/SebSwan/om-tile-server-leaflet/commit/976da92ead43acd33527b081a7e59ba855ee1574))
* ajout d'un Dockerfile pour la construction et l'exécution de l'application Node.js, ainsi qu'un fichier .dockerignore pour exclure les fichiers non nécessaires lors de la création de l'image Docker. ([10e59f1](https://github.com/SebSwan/om-tile-server-leaflet/commit/10e59f1bd3fcab018339566495f58a79f102da53))
* ajout d'un endpoint de healthcheck pour le serveur, permettant de vérifier l'état de l'application via la route '/up'. ([6a2b9d8](https://github.com/SebSwan/om-tile-server-leaflet/commit/6a2b9d808cb9593d78062e448e0098f75f40a127))
* ajout d'un gestionnaire de concurrence pour les workers, permettant de limiter le nombre de tâches simultanées à 4, et mise à jour de la fonction generateTileWithWorker pour utiliser ce gestionnaire ([6c99599](https://github.com/SebSwan/om-tile-server-leaflet/commit/6c99599217f7ef9c5530f0a838810e624ab4f05a))
* ajout d'un nouveau test de performance pour le traitement des tuiles dans le serveur, incluant une fonction de limitation de concurrence et des mesures de temps pour l'analyse des réponses. ([a4c39ba](https://github.com/SebSwan/om-tile-server-leaflet/commit/a4c39ba0f967b71bd40520f5a915725d94979184))
* ajout d'un nouvel endpoint pour obtenir une valeur interpolée à des coordonnées lat/lon spécifiques, avec gestion des erreurs et validation des paramètres. ([e3a1a4f](https://github.com/SebSwan/om-tile-server-leaflet/commit/e3a1a4f6b74e362f184e9fc90087208c92f6e981))
* ajout de la configuration des variables d'environnement pour le serveur de tuiles, intégration de dotenv pour la gestion des configurations, et mise à jour des tests pour utiliser ces variables. ([6e70eeb](https://github.com/SebSwan/om-tile-server-leaflet/commit/6e70eeb3988ed4cda45c0abc5f42673fe6afd649))
* ajout de la déduplication et d'un mécanisme de retry pour l'initialisation des fichiers OM dans la fonction initOMFileForLeafletDedup, amélioration de la logique de chargement des données ([6792110](https://github.com/SebSwan/om-tile-server-leaflet/commit/67921107f399d68524dd4fac905b3cb72a03ecb9))
* ajout de la fonction de calcul de l'intensité du vent à partir des composantes U/V et mise à jour de la logique de chargement des données dans initOMFileForLeaflet ([6d8bb7f](https://github.com/SebSwan/om-tile-server-leaflet/commit/6d8bb7f5d53f335799ab7e72e70a30b068679884))
* ajout de la génération de tuiles flèches avec un overlay transparent dans Leaflet, intégration de la logique de traitement des composantes U/V et mise à jour de la gestion des workers pour le rendu des flèches ([c6c864b](https://github.com/SebSwan/om-tile-server-leaflet/commit/c6c864b304f0fb3d165ae7996f329803bff9fa3c))
* ajout de la gestion CORS avec @fastify/cors, création de nouvelles routes pour latest.json et amélioration des logs, ainsi que l'implémentation de la résolution d'URL pour les données OM ([e6da64c](https://github.com/SebSwan/om-tile-server-leaflet/commit/e6da64cde1e4e3d80764d520198786412540eaa0))
* ajout de la gestion des flèches de vent sur les tuiles, avec mise en cache des valeurs de vent et amélioration de l'opacité en fonction des conditions météorologiques ([53c6a81](https://github.com/SebSwan/om-tile-server-leaflet/commit/53c6a81b9664c1bae52553e923ebd1aa5e03c8bc))
* ajout de la gestion des tailles de tableau RGBA, mise à jour des logs pour inclure la taille en octets et amélioration de la typage des tableaux dans le worker ([df614ca](https://github.com/SebSwan/om-tile-server-leaflet/commit/df614cae244017afbdc19520656f85ab523e1f68))
* ajout de la gestion du statut des données dans le composant SimpleTimeSlider, amélioration des messages d'erreur et mise à jour de la logique de récupération des URL de données météo avec fallback ([8bb5f44](https://github.com/SebSwan/om-tile-server-leaflet/commit/8bb5f4415bd2fa1497094c542db20588d78da979))
* ajout de nouveaux fichiers utilitaires pour la gestion des projections, des interpolations, des domaines et des échelles de couleur, ainsi que la création d'un serveur Fastify pour la gestion des requêtes de tuiles ([93f0343](https://github.com/SebSwan/om-tile-server-leaflet/commit/93f0343d4068175956f9ce984c4d618f8e678b0e))
* ajout de nouvelles variables de vent et mise à jour de la logique de sélection dans variable-selection.svelte, ainsi que nettoyage de code dans +page.svelte ([06ecf4a](https://github.com/SebSwan/om-tile-server-leaflet/commit/06ecf4a422806be31b22e3dd5c5c036f67971742))
* ajout du mot de passe du registre Kamal dans le fichier .env pour la configuration de l'environnement ([c94b21d](https://github.com/SebSwan/om-tile-server-leaflet/commit/c94b21dc312faefd1493e4ed5cda2e45ea1dde70))
* amélioration de la gestion des tuiles flèches avec limitation de concurrence, ajustement du timeout du worker, et ajout de la couche de flèches dans la carte Leaflet ([44d987b](https://github.com/SebSwan/om-tile-server-leaflet/commit/44d987b3a7821e1da3687a967369f6cadae9504d))
* colorscales for some basic variables ([b9f61df](https://github.com/SebSwan/om-tile-server-leaflet/commit/b9f61dfa9c02abe92a7c4a93e23e125894b68bef))
* Fade in out new styles only when loaded ([455c3f8](https://github.com/SebSwan/om-tile-server-leaflet/commit/455c3f85ae8565230e4b6922d5f23bcce5a23c09))
* Implement some form of units ([e5bb951](https://github.com/SebSwan/om-tile-server-leaflet/commit/e5bb951f66f5590eb2b55e9f954ab8dc48ffd259))
* implémentation de l'algorithme de dessin de lignes anti-aliasées pour améliorer l'affichage des flèches de vent, avec ajustements de la fonction de mélange des pixels pour gérer la transparence correctement ([9bb65c0](https://github.com/SebSwan/om-tile-server-leaflet/commit/9bb65c0710b18aa80fc0d05cc0516b3c0157d198))
* improved timeslider ([2c8bea8](https://github.com/SebSwan/om-tile-server-leaflet/commit/2c8bea84e36c3be5713f638c33aeaaaa9e51edcb))
* intégration de Piscina pour la gestion des threads dans le pool de travailleurs, ajout de nouveaux endpoints pour les statistiques et le réinitialisation des métriques, mise à jour de la documentation et amélioration des tests de performance. ([195b06d](https://github.com/SebSwan/om-tile-server-leaflet/commit/195b06dfa039cb82673ae34d2963849cd28575bc))
* Make protocol available on npm ([2734a5b](https://github.com/SebSwan/om-tile-server-leaflet/commit/2734a5bf2a869b8b0f4c3402c035d911591ae4d1))
* move tilegeneration to worker ([12c5bde](https://github.com/SebSwan/om-tile-server-leaflet/commit/12c5bdee8429c99d9d01d61a80315d2fd6693e0c))
* Tansfer to sveltekit ([39ede36](https://github.com/SebSwan/om-tile-server-leaflet/commit/39ede368d50d077a8651e11715ea5229692f92b1))


### Bug Fixes

* Add all available variables per domain ([f6d9432](https://github.com/SebSwan/om-tile-server-leaflet/commit/f6d9432e0b6aed846603f1cedea84e2bfb82ba85))
* add badges ([cc24c5b](https://github.com/SebSwan/om-tile-server-leaflet/commit/cc24c5bcad3cdbaac5ab24f80a581510679acc95))
* add keyword ([8aca2e3](https://github.com/SebSwan/om-tile-server-leaflet/commit/8aca2e3025d6e2e5abe94901ce5fcae59a4f7e7b))
* ajout du serveur Docker dans la configuration du registre d'images dans deploy.yml ([0d26480](https://github.com/SebSwan/om-tile-server-leaflet/commit/0d26480e105a14d8ade84a4d244d637fba77e1e6))
* ajustement de la disposition des dropdowns dans +page.svelte pour passer d'une flex-col à une flex-row ([414bc11](https://github.com/SebSwan/om-tile-server-leaflet/commit/414bc11d164db9dada80eb437c8d80111079416e))
* ajustement des calculs de position des pointes des flèches de vent pour une représentation fidèle à l'ancien worker, en modifiant les formules de coordonnées pour une meilleure précision ([993286c](https://github.com/SebSwan/om-tile-server-leaflet/commit/993286ca2085717889116ce6e05749e7fa387470))
* correction du chemin d'importation pour les types Domain et DomainGroups dans le fichier domains.ts et ajout d'une directive [@ts-nocheck](https://github.com/ts-nocheck) pour désactiver la vérification TypeScript. ([b76f3f5](https://github.com/SebSwan/om-tile-server-leaflet/commit/b76f3f552271adc8af558f43c3172315d414b83f))
* disable etag validation ([95c8de9](https://github.com/SebSwan/om-tile-server-leaflet/commit/95c8de96d151cef5a5eb6613e60cf625d6829d0d))
* finalize package build for dist ([9360d3c](https://github.com/SebSwan/om-tile-server-leaflet/commit/9360d3c2b9baa583b01f6d56d79b517ae1442ac5))
* mise à jour du fichier .gitignore pour inclure les fichiers .env et ajustement de la lecture du mot de passe du registre Kamal dans le fichier .kamal/secrets pour utiliser une commande d'extraction depuis .env. ([c021605](https://github.com/SebSwan/om-tile-server-leaflet/commit/c0216053d3c862c1ea384428e6f53f422a2ba251))
* mise à jour du fichier .gitignore pour inclure les fichiers .kamal/secrets et .kamal/dockerhub_token, afin d'assurer leur gestion appropriée dans le projet. ([44a7fdf](https://github.com/SebSwan/om-tile-server-leaflet/commit/44a7fdfb8717ac1d28413e82246563e043eb5eba))
* precipitation and rain color scale ([a82f51e](https://github.com/SebSwan/om-tile-server-leaflet/commit/a82f51e9a5c4bb714a875d9eefb04c98f340ef5f))
* Publish command ([3c643a7](https://github.com/SebSwan/om-tile-server-leaflet/commit/3c643a76a3e1c146a626ca7c5799a02832546f5e))
* release please env secret ([5266302](https://github.com/SebSwan/om-tile-server-leaflet/commit/52663023cc5ce5f6aaf2535b1daab07475893bf4))
* update style.css ([eb0d764](https://github.com/SebSwan/om-tile-server-leaflet/commit/eb0d764acf1ae89e927c8fd2565225091788e957))

## [0.0.2](https://github.com/open-meteo/maps/compare/omaps-v0.0.1...omaps-v0.0.2) (2025-06-07)

### Features

- Make protocol available on npm ([f1e4666](https://github.com/open-meteo/maps/commit/f1e4666230d5496d9af6637470f350452d6d350f))
- move tilegeneration to worker ([dc40f3a](https://github.com/open-meteo/maps/commit/dc40f3aa7618e27aa37ae79fabcd7773d0a65080))
