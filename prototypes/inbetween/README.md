# Prototype : vues intermédiaires entre les directions Dofus

Prototype jetable, hors de l'app. Question posée : peut-on « inventer » les angles entre face (direction 2, 0°), 3/4 (direction 1, 45°) et profil (direction 0, 90°) pour que la coiffe suive le yaw de la tête sans à-coup ?

Trois coiffes : **2893** (chapeau troué), **5070** (capuche à oreilles lumineuses), **4068** (bandeau noué).

## À regarder

- [`sheet.png`](sheet.png) : planche contact, yaw de 0° à 90° par pas de 7,5°, une ligne par méthode et par coiffe.
- [`compare.webp`](compare.webp) (ou [`compare.gif`](compare.gif)) : balayage animé 0° → 90° → 0° (1,5° toutes les 40 ms), les méthodes empilées.
- `anim-A.webp`, `anim-B.webp`, `anim-B2.webp`, `anim-C.webp` : la même animation, une méthode à la fois.

Les calques arrière et avant sont aplatis l'un sur l'autre, sans tête entre les deux, sur fond gris.

## Méthodes et résultat visuel

**A. Palier (comportement actuel).** La vue la plus proche, avec les seuils de `choisirVue` (face sous 15°, hystérésis 3°) et un palier profil ajouté à 67,5° pour couvrir le balayage (en prod il n'y a pas de profil, ADR 0001). Dans l'animation, un fondu croisé de 90 ms (`CROSSFADE_MS`) à chaque changement. *Résultat :* chaque vue est nette et fidèle, mais la coiffe saute d'une pose à l'autre et reste figée entre deux sauts. Le fondu de 90 ms adoucit à peine le saut.

**B. Fondu + étirement de la boîte englobante.** Les deux vues voisines, chacune étirée (échelle + décalage sur x et y) pour que sa boîte englobante passe continûment de celle de l'une à celle de l'autre, puis fondu entre les deux (smoothstep sur t ∈ [0,3 ; 0,7]). *Résultat :* les boîtes des trois vues sont presque les mêmes, donc l'étirement ne fait presque rien et l'effet est en gros un fondu lent. Aux transitions (22,5° et 67,5°), on voit un « fantôme » à double exposition : deux cœurs sur 2893, deux paires d'oreilles sur 5070. C'est plus doux que A mais moins propre, et rien ne semble tourner.

**B2. Variante, étirement ligne par ligne.** Comme B, mais chaque ligne de pixels est étirée séparément pour que le contour lui-même se déforme. *Résultat :* pas mieux que B pour 2893 et 5070, et le bandeau 4068 se déchire en bandes horizontales (ses lignes n'ont pas de bord gauche/droit cohérent d'une vue à l'autre). À écarter.

**C. Interpolation IA (RIFE v4.6).** [rife-ncnn-vulkan](https://github.com/nihui/rife-ncnn-vulkan) 20221029, binaire Windows prébuilt sur Vulkan : pas de Python sur la machine, et il tourne sur la RTX 2060 (~2 s par paire de vues pour 31 images). RIFE ne gère pas l'alpha, donc la couleur (étalée au-delà des bords, sinon frange noire) et l'alpha sont interpolés en deux passes séparées. 31 images par segment (face→3/4 et 3/4→profil). *Résultat :* nettement le meilleur entre face et 3/4 sur 5070 et 4068. Les oreilles et la spirale de 5070 glissent vraiment vers leur place en 3/4, et le nœud du bandeau tourne. Sur 2893, la face→3/4 tient à peu près : le trou « pousse » de côté, avec une légère trace sombre au bord. En revanche, 3/4→profil casse sur 2893 (une tache grise/sombre informe à 52–67°, le trou passe d'intérieur brun à transparent), avec une petite frange sombre sur 4068 vers 52°. RIFE est fait pour des mouvements de quelques pixels entre images vidéo, et l'écart 45° → 90° est trop grand dès que la topologie change (trou qui s'ouvre, face qui disparaît).

## Coût dans le navigateur

| Méthode | Par image | Assets |
|---|---|---|
| A | 1 `drawImage` par calque | 2 vues par coiffe (aujourd'hui) |
| B | 2 `drawImage` transformés + `globalAlpha` par calque, négligeable. Boîtes englobantes à précalculer (4 nombres par vue) | ceux d'aujourd'hui + la vue profil si on la réintroduit |
| B2 | ~1 `drawImage` d'une ligne de 1 px par ligne de pixels, soit ~250 × 2 vues × 2 calques ≈ 1000 appels par image, faisable mais pas gratuit. Bords de lignes à précalculer | idem B |
| C | 1 `drawImage` par calque (+ fondu entre deux pas voisins si on veut) | **images précalculées par coiffe et par pas d'angle** : face→profil par pas de 7,5° = 10 images en plus ; 3,75° = 22 images. Mesuré (webp q90, calques aplatis) : 2893 +144 KB (pas de 7,5°) / +315 KB (3,75°) contre 35 KB servis aujourd'hui ; 5070 +140 / +310 KB contre 42 KB ; 4068 +86 / +189 KB contre 17 KB. Soit **×4 à ×9** par coiffe. Sur les 840 coiffes du catalogue (~43 MB dans `public/coiffes`) : environ +100 MB à 7,5°, +220 MB à 3,75°, à **doubler** dès qu'on interpole le calque avant et le calque arrière séparément (indispensable pour garder la tête entre les deux) |

C demande aussi un pipeline d'extraction GPU hors ligne (4 passes RIFE de ~2 s par coiffe et par calque — couleur et alpha × 2 segments — soit ~4 h pour le catalogue, ~2 h pour face→3/4 seul) et un tri à l'œil : les ratés comme 2893 en 3/4→profil ne se détectent pas tout seuls.

## Recommandation

1. **Ne pas livrer B ni B2.** Le fantôme du fondu se voit plus que le saut actuel, et l'étirement ne donne pas d'impression de rotation : les silhouettes des vues Dofus ont presque la même boîte.
2. **C est la seule méthode qui donne vraiment l'illusion d'une rotation**, et seulement sur **face ↔ 3/4**. Comme l'app n'utilise plus le profil (ADR 0001), c'est justement le segment utile. Si on veut aller plus loin : un essai limité à face→3/4, avec RIFE par calque (avant et arrière séparés), 4 à 6 pas intermédiaires (pas de 7,5–11°), sur une vingtaine de coiffes, relu à l'œil avant de juger. Coût : ×3 à ×5 sur les assets coiffe. C'est un asset dérivé généré par IA à partir des rendus du client : à garder hors du site public tant que tu n'as pas tranché.
3. Sinon, **garder A** : c'est propre et cela ne coûte rien. On peut toutefois envisager un fondu un peu plus long (150–200 ms) pour amortir le saut, à tester dans l'app.

## Tester en direct (webcam)

Page de dev [`dev/inbetween.html`](../../dev/inbetween.html), jamais incluse dans le build (comme `dev/harness.html`) : `npm run dev`, puis ouvrir `http://localhost:5173/dev/inbetween.html` et cliquer « Démarrer la caméra ».

- **A / C** (boutons ou Espace) : paliers actuels contre images RIFE entre face et 3/4. Les calques avant et arrière sont interpolés séparément (`live.mjs`), et l'arrière reste caché derrière la tête comme dans l'app.
- **Yaw où la vue 3/4 est atteinte** : C passe de la face à la 3/4 entre 0° et cette valeur (35° par défaut), puis reste sur la 3/4. Pas de profil.
- **Yaw manuel** : un curseur remplace le yaw mesuré, pour balayer sans bouger la tête.
- `?source=<image>` filme une image fixe au lieu de la webcam, et `?timer` fait tourner la boucle sans `requestAnimationFrame`.

Placement : le Réglage par défaut des coiffes (ces trois skins n'ont pas de Réglage calibré), interpolé entre face et 3/4 pour C.

## Reproduire

```bash
# depuis prototypes/inbetween/ ; les vues 0/1/2 sont rendues par tools/extraction/render.mjs dans views/<skin>/
node rife.mjs <chemin>/rife-ncnn-vulkan.exe   # méthode C → rife/<skin>/<21|10>/{rgb,alpha}/
node build.mjs                                # sheet.png, anim-*.webp, compare.webp/.gif (~2 min)
node size.mjs                                 # coût en assets de C
node live.mjs <chemin>/rife-ncnn-vulkan.exe   # images par calque pour dev/inbetween.html → live/
```

Le binaire RIFE (~430 MB) a été téléchargé dans le scratchpad de la session, pas dans le repo.
