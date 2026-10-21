# Prototype : personnage Dofus « VTuber » (tête, buste, bras)

Prototype jetable, hors de l'app (`src/` et `public/` intacts). Question : peut-on animer un personnage Dofus assis devant sa webcam (visage, buste et bras, pas de jambes) ? La tête et les expressions suivraient le Face Landmarker, le buste et les bras suivraient les épaules, coudes et poignets du Pose Landmarker. Et combien de travail ça représente ?

**Réponse courte : oui, et le client s'y prête bien.** Un personnage est un assemblage de pièces 2D. Chaque segment de bras est une pièce séparée dont l'origine est l'articulation : épaule, coude, poignet. On peut donc le faire tourner librement. Les « os » ne sont pas un squelette hiérarchique : ce sont des matrices absolues par image, façon Flash. On s'en sert seulement pour la pose de repos, et on refait la cinématique des bras nous-mêmes (deux angles par bras). Comptez **4 à 5 jours** pour une page de dev `dev/puppet.html` de niveau démo (détail en bas).

## À regarder (`out/`)

- [`rig.png`](out/rig.png) : pose de repos du buste, de face (direction 2) et de 3/4 (direction 1). Rouge = épaules, vert = coudes, bleu = poignets, orange = point d'attache de la tête, violet = bassin.
- [`poses_dir2.png`](out/poses_dir2.png) et [`poses_dir1.png`](out/poses_dir1.png) : le même personnage avec les bras reposés uniquement par rotation à l'épaule et au coude. Poses : repos, salut (avec inclinaison du buste et de la tête), bras croisés, mains sur le bureau, bras levés.
- [`expressions.png`](out/expressions.png) : la tête seule, avec 7 expressions en 3/4, puis les deux seules têtes qui existent de face.
- `pose_*.png`, `expr_*.png`, `idle_*.png` : les mêmes images, une par fichier.

Personnage : skin de corps **11** (corps féminin, sans doute Féca femme vu la convention 10/11 de Dofus 2) + skin de tête **2012** (une tête féminine ; je n'ai pas cherché la classe exacte) + rig **`bones_assets_bone_1-static`** (rig humanoïde générique). J'ai associé le corps et la tête à l'œil : la table qui relie classe, sexe, visage et skin n'a pas été cherchée. Les couleurs du joueur (`PALETTE` dans `scripts/puppet.mjs`) sont inventées.

## Ce qu'on a trouvé

### Les skins d'un personnage

Un personnage, c'est **deux skins** :

- **Corps** (ex. 10 = homme, 11 = femme) : toutes les pièces du corps, dans chaque direction (`_0` profil, `_1` 3/4 face, `_2` face, `_5` 3/4 dos, `_6` dos ; 3, 4, 7 sont surtout des variantes de mains).
  - Buste : `Torse_d`, `Thorax_d`, `Abdomen_d`, `Cou_d`, `Bassin_d`, `Ceinture_d`, `Jupe_d`, `Cole_d`…
  - Bras, **en trois pièces séparées par côté** (`D` = droit du personnage, `G` = gauche) :
    - `EpauleD_d` = haut du bras, origine à l'**épaule** ;
    - `BrasD_d` = avant-bras, origine au **coude** ;
    - `MainD<NN>_d` = main, origine au **poignet**. Il y a ~80 formes de main (`MainD00` poing, `MainGBonjour`, `MainSpock_g`, `MainPierre`…), mais presque toutes en 1/3/5/7 : de face il n'y a que `MainD00_2`, `MainD10_2` et `MainG00_2`.
  - Jambes : `Cuisse`, `Jambe`, `Pied` (on les saute).
  - Le skin 11 contient aussi des pièces de tête (Crane, cheveux, visage_*), mais pas l'assemblage `Tete_d`.
- **Tête** (les ~660 skins qui ont `visage_base`, ex. 2012–2043) :
  - l'assemblage `Tete_<d>` (natte, oreilles, crâne, visage, pattes, cheveux, plus les emplacements vides `Chapeau_d`, `Masque_d`, `Bandeau_d`… où viennent les coiffes) ;
  - des variantes `Tete<N>_1` qui changent seulement le visage.

  Attention : `Patte_d/g` ce sont les **pattes (favoris)**, pas les mains.

Format des pièces : comme pour les coiffes, le maillage est en y vers le haut, et les matrices sont de type Flash (transposer, puis retourner y).

- Chaque entrée de display list a un champ `entries` : le nombre de descendants **aplatis** qui la suivent. Une liste contient donc déjà ses enfants, avec des transformations composées.
- Les chunks d'une pièce (`skinChunks`) sont déjà cuits dans l'espace de la pièce. Il suffit de les dessiner dans l'ordre avec la matrice de la pièce.
- Un chunk prend l'emplacement de couleur du `ColorGray_<n>_…` qui l'englobe : 1 = peau, 2 = cheveux, 3–6 = vêtements. Il est gris pour que le jeu le teinte (ici, une simple multiplication).

### Les bundles Bones

Fichiers : `Characters/Bones/`, 8 879 bundles.

- `bones_assets_bone_1-*` est le rig humanoïde. Il y a `-static`, `-combat`, `-movement`, `-metier`, `-static-explo`, `-combat-armes`, plus `bone_1-<n>-static|combat` avec n = 1…20, sûrement un par classe.
- Les `animemote*` sont les émotes.
- Les autres `bone_<id>` sont les monstres et les familiers.

J'ai extrait `bone_1-static`. Il contient :

- un MonoBehaviour **rig** : `exposedNodeNames` (204 noms : `EpauleD_2`, `Tete_2`, `Tete10_1`…), `defaultFrameRate` 30, `maxNodeCount` 109, la liste des `animations` (nom → TextAsset) et 14 petits sprites (ombre) ;
- **39 TextAssets binaires**, un par animation et direction (`AnimStatiqueExplo0_2`, `AnimStatiqueCombat0_1`, `AnimMarche_to_AnimStatiqueExplo0_5`…).

**Piège de l'extraction.** `/Assets/Text` et `/Assets/Json` d'AssetRipper abîment le binaire (les octets ≥ 0x80 deviennent U+FFFD), et `/Assets/Binary` renvoie un fichier vide. Il faut passer par `POST /Export/PrimaryContent`, qui écrit des `.bytes` intacts. `scripts/fetchbones.mjs` fait les deux.

**Format d'une animation** (little endian, `scripts/bonesanim.mjs`) :

```
u16 frameCount  u16 maxEntries  u16 ?  u16 ?      (48, 40, 0, 19 pour l'idle)
u32 frameOffset[frameCount]
frame = suite d'entrées jusqu'à l'offset suivant
entrée = u16 profondeur (= ordre de dessin)  u16 flags  i16 (-1)  u16 nodeId  u16 sous-image  u16 0
         si flags & 0x10 : 6 × f32 [a b tx c d ty]
         flags 0x20 seul : inchangé depuis l'image précédente
```

- `nodeId` est un index dans `exposedNodeNames`, et ce nom est **le nom de la pièce de skin** à dessiner.
- La matrice est **absolue**, déjà en y vers le haut, dans des unités = 3 × unités de skin. Origine : les pieds. Le buste est vers y ≈ 80–125.
- **Il n'y a pas de hiérarchie d'os** : chaque image donne la place finale de chaque pièce, dans l'ordre de dessin.
- On retrouve l'**épaule, le coude et le poignet** dans les translations de `Epaule*`, `Bras*` et `Main*`, puisque chaque pièce a son origine sur l'articulation. Longueurs de face : haut du bras ≈ 25,5 unités, avant-bras ≈ 22,5.
- **Directions** : une animation par direction (suffixe `_0` `_1` `_2` `_5` `_6`). Les directions 3, 4 et 7 sont sans doute ces mêmes animations en miroir ; pas vérifié.
- **Expressions** : une animation choisit l'expression en nommant un autre nœud de tête. Elle place `Tete14_1` (visage_IdleCombat) au lieu de `Tete_1`, et le renderer prend `Tete14_1` dans le skin de tête. L'idle d'exploration utilise `Tete_1`/`Tete_2` ; l'idle de combat utilise `Tete14_1`.

Variantes `Tete<N>_1` du skin de tête 2012 :

| Nœud | visage | Nœud | visage |
|---|---|---|---|
| `Tete_1` | base | `Tete8_1` | peur |
| `Tete2_1` | course (bouche ouverte) | `Tete9_1` | sourire |
| `Tete3_1` | énervé | `Tete10_1` | **clignement** |
| `Tete4_1` | furieux | `Tete11_1` | blessé |
| `Tete5_1` | touché | `Tete12_1` | KO |
| `Tete6_1` | mdr | `Tete13_1` | vise |
| `Tete7_1` | moqueur (langue) | `Tete14_1` | idle combat |

**Limite importante : les expressions n'existent qu'en 3/4 (direction 1).** De face (direction 2), toutes les têtes ont seulement `visage_base_2` et `visage_course_2` (plus `visage_ivre_2` pour 32 d'entre elles). De face, il n'y a ni clignement ni sourire.

### Ce que montrent les rendus

Le rendu (`scripts/puppet.mjs`) compose le corps et la tête sur l'image 0 de `AnimStatiqueExplo0_<d>`, puis les poses réécrivent seulement les matrices des pièces de bras.

- Les rotations à l'épaule et au coude marchent dans les deux directions, sans déformer les pièces. À grand angle (bras levé), le haut arrondi de `Epaule` déborde un peu sur le buste. C'est visible mais acceptable.
- **Ordre de dessin.** Au repos de face, les bras sont dessinés *derrière* le buste. Dès qu'un bras passe devant le corps, il faut le passer devant. En 3/4, le bras gauche (le plus éloigné) reste derrière, sauf s'il croise le corps.
- L'inclinaison du buste (rotation autour du bassin) et de la tête (rotation autour du cou) sont de simples rotations, sans artefact visible.
- La main reste un poing, tourné avec l'avant-bras. Pour une main ouverte (salut), il faudrait changer de pièce, et de face il n'y en a pas.

## Comment chaque partie serait pilotée

On choisit l'effet **miroir**, comme l'app actuelle : le bras droit du joueur (landmarks Pose 12-14-16) pilote le bras **G** du personnage, qui est à droite de l'écran. Le bras gauche (11-13-15) pilote le bras **D**. Tous les angles se calculent dans l'image miroir, avec y retourné.

- **Haut du bras** : angle épaule → coude (12→14, 11→13). **Avant-bras** : angle coude → poignet (14→16, 13→15). La main suit l'avant-bras. C'est exactement `poseArm(nodes, side, upperDeg, foreDeg)` dans `scripts/poses.mjs`. On prend seulement les angles, pas les longueurs, donc les proportions du joueur n'ont pas d'importance. La profondeur (bras tendu vers la caméra) ne peut pas se représenter : le bras garde toute sa longueur.
- **Buste** : l'inclinaison est l'angle de la ligne d'épaules 11–12, appliqué autour du bassin. La position et l'échelle du personnage se calent sur le milieu et la largeur des épaules : de face, l'écart entre les épaules du rig fait ≈ 28 unités.
- **Tête** :
  - position = Repère de tête, que l'app calcule déjà (posé sur le nœud `Tete_d`) ;
  - roulis = celui du visage, en rotation autour du cou ;
  - lacet = choix de la direction, comme `choisirVue` aujourd'hui : face (2), 3/4 (1) ou 3/4 miroir ;
  - pas de tangage (2D).
- **Expressions** : il faut activer `outputFaceBlendshapes` dans `faceTracker.ts` (aujourd'hui à `false`). Ensuite, des seuils avec hystérésis :

  | Blendshapes | Expression | Nœud |
  |---|---|---|
  | `eyeBlinkLeft/Right` > 0,5 | clignement | `Tete10_1` |
  | `mouthSmileLeft/Right` | sourire | `Tete9_1` |
  | sourire + `jawOpen` | mdr | `Tete6_1` |
  | `jawOpen` + `browInnerUp` / `eyeWide` | peur | `Tete8_1` |
  | `browDown` | énervé | `Tete3_1` |
  | `tongueOut` | moqueur | `Tete7_1` |

  Comme ces têtes n'existent qu'en 3/4, je propose de **garder le personnage en 3/4 par défaut** (miroir selon le côté où le joueur tourne la tête). La vue de face serait réservée à « regarder droit dans la caméra », avec seulement `jawOpen` → `Tete2_2` (bouche ouverte) pour la parole.

## Coudes ou poignets hors champ (fréquent assis)

Assis près de la webcam, les coudes et les mains sortent souvent du cadre par le bas. MediaPipe renvoie quand même des points extrapolés, avec une `visibility` basse : il ne faut pas les croire. Règle proposée, par bras :

1. Épaule, coude et poignet visibles (visibility > ~0,6 et dans l'image) : on pilote les deux angles.
2. Coude visible, poignet non : on pilote le haut du bras. L'avant-bras garde son angle de repos *relatif* au haut du bras.
3. **Poignet visible, coude non** : c'est le cas le plus courant assis près de la webcam (main levée, coude sous le cadre). Le premier essai réel de l'utilisateur l'a montré : le bras restait au repos alors que la main était levée. On résout le coude par **IK à deux os** :
   - le vecteur épaule → poignet du joueur, en largeurs d'épaules, est reporté sur le rig (largeur d'épaules du rig de face) ;
   - on garde les longueurs de bras du personnage ;
   - des deux coudes possibles, on prend celui qui est le plus proche du coude que Pose devine hors champ. Cette estimation est trop grossière pour placer le coude, mais suffit pour savoir de quel côté il plie. Sans elle, on prend le coude le plus bas.

     Le premier choix, « vers l'extérieur du corps », donnait un coude levé à côté de la tête avec l'avant-bras pendant, dès que la main était juste au-dessus de l'épaule (capture de l'utilisateur) ;
   - si la main est trop loin, le bras pointe droit vers elle.

   Implémenté dans `dev/puppet.ts` (`solveElbow`), et vérifié avec la démo (5e séquence, coude hors champ : main juste au-dessus de l'épaule pendant 2 s, puis levée à côté de la tête). Pas encore avec la vraie webcam.
4. Ni coude ni poignet : retour en douceur (≈ 300 ms) vers une pose de repos de « joueur assis », soit bras le long du corps (idle), soit mains sur le bureau (pose `desk`), au choix de l'utilisateur.

Les épaules sur le bord bas de l'image sont acceptées tant qu'elles ne sont pas loin hors cadre : Pose les place bien à partir du reste du corps, et sans elles aucun bras ne pouvait être suivi.

Dans tous les cas, on lisse les angles (filtre One Euro ou amortissement), on borne les angles plausibles par articulation pour éviter le coude cassé à l'envers, et on ajoute une hystérésis sur l'ordre de dessin (bras devant ou derrière le buste) pour qu'il ne clignote pas.

## Estimation pour une page de dev (type `dev/inbetween.html`)

| Étape | Effort |
|---|---|
| Script d'export : corps + tête → une PNG par pièce et par direction avec son pivot (variante de `tools/extraction/render.mjs`), plus la pose de repos de chaque direction en JSON (matrices de l'image 0). Teinte des emplacements ColorGray faite à l'export, ou au runtime via un canvas par emplacement | 1 j |
| Marionnette en TS : cinématique des bras (`poseArm`), inclinaison, roulis de tête, choix de direction, ordre de dessin, rendu Canvas 2D (`setTransform` + `drawImage`, une trentaine de pièces, coût négligeable) | 1 j |
| Branchement du suivi : `BodyTracker` existe déjà (Pose lite + segmentation), face avec blendshapes, mapping miroir, lissage, repli quand c'est hors champ | 1–1,5 j |
| Expressions : seuils, hystérésis, clignement | 0,5 j |
| Réglages : cadrage assis, échelle, fond, essais en vrai | 1 j |
| **Total** | **≈ 4,5–5 j** |

En option : choisir la classe et le sexe, et les couleurs du joueur (+1–2 j). Il faut retrouver la table classe/sexe/visage → skins dans les données du client (pas cherché), ou l'établir à la main.

Risques connus :

- pas d'expressions de face ;
- mains de face limitées au poing ;
- 2D pure : pas de profondeur des bras, et le lacet saute entre directions (ce qu'a montré `prototypes/inbetween/` ; RIFE ne se transpose pas facilement à un personnage articulé).

## Page de dev : `dev/puppet.html` (faite)

`npm run dev`, puis `/dev/puppet.html`. Comme `dev/inbetween.html`, elle n'est jamais buildée. Elle lit ses pièces dans `prototypes/character/live/`, produit par `node scripts/export-live.mjs` : 64 PNG teintées, ≈ 1 Mo, plus `puppet.json` avec la pose de repos des directions 1 et 2.

- **Boutons** :
  - « Démarrer la caméra » (ou `?source=<image>` pour filmer une photo) ;
  - « Démo sans caméra » (`?demo`), une chorégraphie scriptée ;
  - affichage « VTuber » (fond uni, webcam en incrustation avec le squelette) ou « Sur la vidéo » (le personnage posé sur les épaules du joueur) ;
  - direction auto / 3/4 / face ;
  - pose de repos quand les bras sortent du cadre : le long du corps, ou sur le bureau.
- **Pilotage** : celui décrit plus haut, implémenté. Le Face Landmarker (avec blendshapes) et le Pose Landmarker lite sont créés dans la page, donc `src/` est inchangé. Le bras dont l'épaule est à gauche de l'écran pilote le bras du personnage à gauche de l'écran. Quand le personnage est en 3/4 miroir, les angles deviennent 180° − θ.
- **Vérifié dans le navigateur** :
  - la démo (salut en 3/4 avec sourire, bras croisés de face) ;
  - `dev/fixtures/portrait-tall.jpg` : les bras croisés sont reproduits, le sourire est détecté et montré en 3/4 (de face il retombe sur la tête de base, comme prévu) ;
  - la même photo coupée au-dessus des coudes : les deux bras passent en « hors champ → repos » ;
  - le mode « Sur la vidéo ».

  **Pas encore essayé avec une vraie webcam en mouvement** : réglage du lissage, seuils de blendshapes, stabilité de la visibilité des coudes.
- **Défauts connus** :
  - en 3/4, bras croisés, le bras éloigné passe devant le buste en entier, ce qui donne un rendu un peu confus ;
  - les mains restent des poings ;
  - les couleurs sont fixées à l'export.

## Rotation avec RIFE : la tête oui, le corps non

`node scripts/rife-turn.mjs <rife-ncnn-vulkan.exe>` interpole, de face (direction 2) vers 3/4 (direction 1), chaque pièce que les deux poses de repos ont en commun. Il y en a 14 : `Tete`, `Cou`, `Torse`, `Thorax`, `Abdomen`, `Ceinture`, `Bassin`, `Jupe`, et `Epaule`, `Bras` et `Main00` des deux côtés.

Même recette que `prototypes/inbetween/live.mjs` :

- chaque paire de dessins est alignée sur l'origine de la pièce (son articulation) ;
- la couleur et l'alpha sont interpolés en deux passes séparées ;
- les deux images d'extrémité restent les rendus exacts du jeu.

En plus, l'alpha des images intermédiaires est resserré (smoothstep entre 0,3 et 0,7) pour limiter les bords à moitié transparents. Résultat : 14 × 31 images dans `live/turn/<Pièce>/`, 1,4 Mo en tout.

Dans `dev/puppet.html`, le réglage « Rotation » propose trois modes :

- **A · paliers** : le corps et la tête sautent ensemble de face à 3/4 à 15° (`choisirVue`, comme l'app).
- **C · tête RIFE, corps en paliers (par défaut)** : la tête suit le yaw à travers ses 31 images (3/4 atteint au réglage « tête à », 35° par défaut). Le corps reste un des deux dessins exacts du jeu et passe en 3/4 au réglage « corps à » (25° par défaut, plus 3° d'hystérésis). La tête mène donc le mouvement. Les deux regardent du même côté, en miroir pour un yaw négatif ; le buste de face, presque symétrique, supporte le miroir.
- **CC · tout en RIFE** : en plus de la tête, chaque pièce du corps prend son image RIFE, et la pose de repos est un mélange des deux directions :
  - les matrices des pièces communes sont interpolées linéairement ;
  - les deux ceintures propres à une seule direction basculent à mi-chemin ;
  - l'ordre de dessin bascule aussi à mi-chemin.

  Gardé seulement pour comparer.

La touche Espace bascule entre A et C. « Yaw manuel » fixe l'angle, et `?demo=turn` fait un balayage lent avec le visage neutre.

### Ce qu'on voit

- **Tête (C)** : le visage tourne vraiment ; les yeux, la frange et la mâchoire glissent vers le 3/4. Une tête qui tourne sur un buste encore de face, c'est le geste naturel d'un VTuber (`out/turn_live_C.png` : 0, 10, 20, 24, 27, 35 et −23°).
  - Seul défaut visible : la queue de cheval, qui n'existe pas de face, apparaît en tache sombre floue vers 6–10°.
  - Le mouvement est concentré au début (l'image 12/30 ressemble déjà beaucoup au 3/4). Une courbe yaw → image non linéaire pourrait l'étaler.
- **Corps (CC) : à écarter** (`out/turn_live_AC.png`, et une capture de l'utilisateur à −23°). Le buste devient une masse floue aux contours sombres : le haut perd sa forme, avec des stries sur les bords et un double contour épaule/buste. Le même échec qu'avec la coiffe trouée du prototype inbetween :
  - entre face et 3/4, le buste change de topologie (le dos et un côté apparaissent, une bretelle passe derrière) ;
  - les pièces voisines sont interpolées chacune de leur côté, donc leurs bords ne se suivent plus.

  Resserrer l'alpha et faire basculer les ceintures a enlevé les halos, mais pas la bouillie.
- **Expressions** : pas d'images RIFE. Avec une expression active, la tête repasse au palier : la tête de face tant que t < 0,5, sinon la tête 3/4 avec l'expression.

**Conclusion** : RIFE seulement pour la tête (31 images de la tête neutre, 351 Ko) ; le corps reste sur les deux dessins exacts du jeu, en paliers.

Pour adoucir quand même le passage du corps, les pistes qui ne touchent pas aux dessins :

- un fondu court sur le saut ;
- interpoler seulement les **positions** des pièces entre les deux poses, chacune gardant son dessin exact jusqu'au basculement.

Vérifié seulement avec le yaw manuel, la démo `?demo=turn` et la photo de test, pas avec une vraie webcam.

## Fichiers

- `scripts/fetchbones.mjs` : extrait un bundle Bones (rig JSON + `.bytes` des animations) dans `.extraction-cache/bones/` (non versionné).
- `scripts/bonesanim.mjs` : décodeur des animations. `node bonesanim.mjs <anim.bytes> <rig.json>` affiche l'image 0.
- `scripts/puppet.mjs` : chargement des skins et du rig, aplatissement des display lists, teinte, rasterisation.
- `scripts/export-live.mjs` : produit `live/` pour `dev/puppet.html`.
- `scripts/rife-turn.mjs` : images RIFE face → 3/4 de chaque pièce commune (`live/turn/`), à lancer après `export-live.mjs` (qui efface `live/`). Le RIFE prébuilt est celui du prototype inbetween (voir sa note).
- `scripts/poses.mjs` : produit tout `out/`. `node poses.mjs [skinCorps=11] [skinTête=2012]`.

Reproduire :

1. AssetRipper headless sur le port 8765.
2. `node scripts/fetchbones.mjs bones_assets_bone_1-static ../../.extraction-cache/bones/bone_1-static`
3. `node scripts/poses.mjs` depuis `scripts/`.

Les PNG de `out/` et `live/` sont dérivés des fichiers du client Ankama. Ils restent ici, hors de `public/` et du site, jusqu'à décision de l'utilisateur.
