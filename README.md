# Essayage de coiffes et capes Dofus

Fansite non officiel : on essaie des coiffes et des capes Dofus devant sa webcam. Tout tourne dans le navigateur (MediaPipe Face et Pose Landmarker auto-hébergés, rendu Canvas 2D), aucune image ne quitte l'appareil.

Vocabulaire : [CONTEXT.md](CONTEXT.md). Décisions : [docs/adr/](docs/adr/).

**Ce dépôt ne contient que le code.** Les images des coiffes, capes, ailes, épaulières et costumes (`public/coiffes/`, `public/capes/`…), le favicon, l'image de partage et les rendus des prototypes sont extraits du client Dofus d'Ankama ou dérivés de lui : ils ne sont pas redistribués ici. On les régénère depuis sa propre installation du jeu (voir [Catalogue](#catalogue-toutes-les-coiffes-et-capes-apparats-compris)). Dofus est une marque d'Ankama ; ce fansite n'est ni affilié à Ankama ni approuvé par Ankama.

## Démarrer

```bash
npm install
npm run setup:mediapipe   # copie le WASM et télécharge les modèles (visage, corps) dans public/mediapipe/
npm run dev
```

`npm test` lance les tests unitaires, `npm run build` produit `dist/`.

## Calibrer

Tout visiteur a le panneau « Ajuster la position » sous la webcam : ses Ajustements restent dans son navigateur (`localStorage`, clé `dofus-try-on.ajustements.v1`), par-dessus les Réglages livrés. Pour changer les Réglages livrés à tous :

1. Ouvrir la page avec `?calibration` (le panneau s'ouvre avec les outils d'export), activer la caméra, composer la tenue à régler.
2. Choisir la cible (Coiffe, Cape ou Ailes), puis, pour la Vue de face puis celle de 3/4 (tourner la tête pour y passer) : glisser sur l'image pour placer l'élément, molette pour l'échelle (ou les curseurs). L'outil règle toujours la Vue affichée ; « Figer l'image » met la vidéo en pause pour ajuster tranquillement. Une Vue non réglée reprend le Réglage de la Vue de face, et un Réglage vaut aussi pour la Vue en miroir.
3. « Exporter reglages.json » (Réglages livrés + Ajustements de ce navigateur), puis remplacer [src/data/reglages.json](src/data/reglages.json) et redéployer.



## Catalogue (toutes les coiffes et capes, apparats compris)

Les Vues sont rendues depuis les fichiers du client Dofus 3 (voir [ADR 0002](docs/adr/0002-vues-rendues-depuis-les-meshes-du-client.md) et [ADR 0003](docs/adr/0003-capes-suivi-epaules-et-segmentation.md)). Tout ce qui est extrait du client va dans `.extraction-cache/` (non versionné). AssetRipper tourne en `--headless --port 8765`, avec la version Unity du client renseignée (`DefaultVersion`).

1. **Skins** : `node tools/extraction/fetchskins-batch.mjs .extraction-cache/skinjson` récupère le `SkinAsset` de chaque skin (par lots de 300) ; les atlas vont dans `.extraction-cache/atlas/`, les icônes d'objets (bundle `Picto/Items/item_assets_2x`) dans `.extraction-cache/icons/`, la liste des objets (types 16, 246, 17, 247) dans `.extraction-cache/items.json`.
2. **Objet → skin** : le client ne contient pas ce lien. `tools/extraction/automatch.mjs` compare l'icône de chaque objet aux skins du bon genre (coiffe : parties `Chapeau`, `Bandeau`, `Masque` ; cape : `Cape`, `Sac` ; ailes, type 300 : `AileG`/`AileD`) et écrit [tools/extraction/matches.json](tools/extraction/matches.json) et [tools/extraction/matches-ailes.json](tools/extraction/matches-ailes.json) avec un score de confiance. Les ailes ont leur propre onglet et leur propre emplacement (`public/ailes/`, `src/data/ailes.json`) ; leurs deux ailes sont composées en une seule image par Vue. Épaulières (type 299, `EpauletteG`/`EpauletteD`, une partie par épaule) et pièces de costume au cou (type 199, `Cole`/`ColeUL`) : [tools/extraction/matches-epaul-costume.json](tools/extraction/matches-epaul-costume.json). Les costumes de torse (plastrons et haut des costumes complets : `Abdomen`, `Torse`, `Cou`, composés au build) ont été associés à la main, dans `skins`. Ceintures, chaussures et manches sont écartées.
   Objets vivants (type 113) : la table `LivingObjectSkinsMoodsDataRoot` du client donne, pour chaque objet, l'icône de chaque niveau ; chaque niveau d'un objet vivant de tête est comparé aux skins de coiffe sur sa propre icône ([tools/extraction/matches-vivants.json](tools/extraction/matches-vivants.json), clé `itemId:niveau` dans la config). Ceux qui remplacent toute la tête ou ne sont que des pièces recolorables sont écartés.
3. **Corrections** : [tools/extraction/catalogue.config.json](tools/extraction/catalogue.config.json) fixe les seuils de confiance, les correspondances vérifiées à la main (`skins`) et les objets exclus (`exclude`).
4. `npm run assets:catalogue` rend chaque skin une fois en WebP dans `public/coiffes/` et `public/capes/` (les skins déjà rendus sont sautés, `-- --force` pour tout refaire) et écrit `src/data/coiffes.json` et `src/data/capes.json`, avec les noms officiels FR/EN/ES/PT lus dans l'i18n du client.
5. **Rotation des coiffes** ([ADR 0004](docs/adr/0004-rotation-des-coiffes-par-images-rife.md)) : `node tools/extraction/rife-coiffes.mjs` génère, pour chaque Coiffe, 5 images intermédiaires RIFE par Calque entre sa Vue de face et sa Vue de 3/4 (`public/coiffes/<skin>/tour_*.webp`, `src/data/tours.json`).
   - Prérequis : le binaire [rife-ncnn-vulkan](https://github.com/nihui/rife-ncnn-vulkan) (release 20221029, `rife-ncnn-vulkan.exe` + le dossier de modèles `rife-v4.6/`) dans `.extraction-cache/rife/`, et un GPU Vulkan.
   - Durée : ~1 h 30 pour tout le catalogue. Le script reprend où il s'est arrêté ; `--only=<skins>` et `--force` pour en refaire.
   - Relecture : `node tools/extraction/tours-sheet.mjs` produit des planches dans `.extraction-cache/tours-review/`. Les coiffes ratées vont dans `exclude` de [tools/extraction/tours.config.json](tools/extraction/tours.config.json) (puis supprimer leur entrée de `tours.json`) : elles gardent le saut au Palier.

## Outils de dev

- `?source=<image>` (dev uniquement) remplace la webcam par une image fixe.
- `?yaw=<degrés>` (dev uniquement) impose le yaw de la tête, pour voir la Rotation d'une coiffe sur une image fixe.
- `?debug` (dev uniquement) affiche sur la vidéo les Repères, la Vue et l'image de Rotation de la coiffe (ou pourquoi elle n'en a pas).
- `/dev/harness.html?source=<image>` rend chaque coiffe et chaque cape sur une image fixe et enregistre les images dans `.dev-snapshots/` (pas besoin de webcam ni d'onglet visible). Options : `only=coiffes` ou `only=capes`, `nomask` (capes sans masque du corps), `debug`.

## Déploiement (Cloudflare Workers, assets statiques)

En ligne sur https://virtual-try-on-dofus.tom-girou.dev (configuration dans [wrangler.jsonc](wrangler.jsonc), en-têtes dans [public/_headers](public/_headers)).

```bash
npm run deploy
```

Télécharge les modèles MediaPipe si besoin, lance les tests, construit `dist/` et l'envoie avec Wrangler (connexion une fois avec `npx wrangler login`).
