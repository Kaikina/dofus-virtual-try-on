# Dofus Virtual Try-On

Page web publique (fansite gratuit) permettant d'essayer virtuellement des coiffes et des capes Dofus via la webcam.

## Language

**Emplacement**:
Une place d'équipement essayable : Coiffe (sur la tête), Cape et Ailes (dans le dos), Épaulières (sur les épaules) et Costume (au cou et sur le torse). Chaque emplacement est facultatif.
_Avoid_: slot, case

**Tenue**:
La combinaison choisie pour l'Essayage : au plus un objet par Emplacement, au moins un objet en tout.
_Avoid_: outfit, look, set

**Cape**:
L'objet Dofus équipable dans l'emplacement Cape (type 17 dans les données du jeu). Elle est portée dans le dos : vue de face, elle passe derrière le corps.
_Avoid_: manteau, cloak

**Épaulières**:
L'objet Dofus « Épaulière » (type 299). Ses deux parties se posent chacune sur une épaule réelle : la partie gauche du personnage sur l'épaule de droite à l'écran, comme un personnage qui nous fait face.
_Avoid_: épaulettes, shoulder pads

**Costume**:
Dans ce projet, une pièce de costume (type 199) portée au cou (écharpe, col, collier) ou sur le torse (plastron, armure). D'un costume complet, on n'essaie que le torse : bras et jambes demanderaient le squelette du personnage et sortent souvent du cadre de la webcam. Les ceintures et chaussures ne sont pas essayables.
_Avoid_: tenue (qui désigne toute la combinaison essayée), déguisement

**Ailes**:
L'objet Dofus « Ailes » (type 300), porté dans le dos dans son propre Emplacement. Ses deux ailes sont composées en un seul dessin par Vue : ouvertes des deux côtés de face, tournées vers l'arrière de 3/4.
_Avoid_: wings, aile

**Skin de cape**:
Le visuel porté par le personnage pour une Cape. Le jeu le dessine en deux morceaux accrochés à deux os (le haut aux épaules, le bas plus bas dans le dos) ; dans l'Essayage, chaque Vue les réunit en un seul dessin accroché aux épaules.
_Avoid_: sprite, texture

**Repère d'épaules**:
Le point du corps réel sur lequel on pose une Cape ou des Ailes : à hauteur des épaules, sous l'axe de la tête (le milieu des épaules seulement si le visage n'est pas visible). Il reste droit, comme sur un personnage Dofus. La largeur d'épaules sert d'échelle, comme la largeur du visage pour une Coiffe.
_Avoid_: torse, buste

**Coiffe**:
L'objet Dofus équipable dans l'emplacement tête (nom, identifiant d'item). Plusieurs Coiffes peuvent partager le même Skin de coiffe.
_Avoid_: chapeau, casque, item

**Skin de coiffe**:
Le visuel porté sur la tête du personnage, identifié côté client par un identifiant graphique. C'est ce qui est affiché dans l'essayage.
_Avoid_: sprite, gfx, texture

**Vue**:
Un dessin d'un Skin de coiffe ou de cape selon une orientation donnée : de face ou de 3/4. La Vue de 3/4 sert en miroir pour l'autre côté. Il n'y a pas de Vue de profil : le suivi du visage décroche avant que la tête soit de profil.
_Avoid_: angle, frame

**Palier**:
Plage d'angle de rotation horizontale de la tête (yaw) associée à une Vue. Quand la tête franchit la limite d'un palier, la Vue affichée change.
_Avoid_: seuil, step

**Rotation**:
Pour une Coiffe : les images intermédiaires entre sa Vue de face et sa Vue de 3/4, générées hors ligne par IA (RIFE). La coiffe les parcourt au fil du yaw au lieu de sauter d'une Vue à l'autre au Palier. Une Coiffe dont la Rotation est ratée en est privée et garde le saut.
_Avoid_: tour, interpolation, in-between

**Calque**:
Une Vue se compose de deux Calques : le Calque avant, toujours visible, et le Calque arrière, qui regroupe les morceaux censés passer derrière la tête : il est caché derrière toute la tête (le visage et le crâne au-dessus, jusqu'au sommet) et ne dépasse qu'autour.
_Avoid_: layer, couche

**Point d'ancrage**:
Le point où le jeu attache la coiffe à la tête du personnage. Il est commun à toutes les Vues d'un même Skin de coiffe et vient se poser sur le Repère de tête.
_Avoid_: pivot, offset

**Repère de tête**:
Le point du visage réel sur lequel on pose le Point d'ancrage : sur l'axe central de la tête, à hauteur du haut du front. Il reste centré sur le crâne quand la tête tourne, contrairement au front lui-même. Quand la tête est vue d'en haut (menton baissé, ou webcam placée au-dessus du visage), le visage paraît plus court et le haut du crâne plus grand : la Coiffe remonte d'autant.
_Avoid_: front, forehead

**Réglage**:
Le décalage du Point d'ancrage par rapport au Repère de tête et le facteur d'échelle (par rapport à la largeur du visage réel) d'une Vue, fixés par Calibration. Une Vue pas encore réglée reprend le Réglage de la Vue de face.
_Avoid_: config, params

**Calibration**:
Ajustement à l'œil du Réglage d'une Vue sur son propre visage. Tout visiteur peut le faire (« Ajuster la position ») quand un objet tombe mal : son Ajustement ne vaut que pour lui. En développement, les Réglages ainsi trouvés sont exportés et deviennent ceux livrés à tous.
_Avoid_: setup, tuning

**Ajustement**:
Le Réglage qu'un visiteur a fixé lui-même pour une Vue. Il est gardé dans son navigateur, jamais partagé, et passe devant le Réglage livré pour cette Vue seulement.
_Avoid_: override, préférence

**Essayage**:
Session en direct où un Skin de coiffe est superposé au visage suivi par la webcam.
_Avoid_: try-on, preview

**Photo**:
Image figée de l'Essayage (webcam + Skin de coiffe composés, en miroir) enregistrée par l'utilisateur.
_Avoid_: capture, screenshot, snapshot

## Relationships

- Une **Coiffe** a exactement un **Skin de coiffe** ; un **Skin de coiffe** peut appartenir à plusieurs **Coiffes**
- Un **Skin de coiffe** possède une ou plusieurs **Vues**
- Chaque **Palier** affiche exactement une **Vue** (éventuellement en miroir)
- Une **Coiffe** qui a une **Rotation** ne passe pas par les **Paliers** : elle va de sa **Vue** de face à sa **Vue** de 3/4 en suivant le yaw, sauf pendant un **Ajustement** (et 1,5 s après), qui montre la **Vue** réglée telle quelle
- Chaque **Calque** a sa propre **Rotation** ; un **Calque** qu'une seule **Vue** possède n'en a pas et bascule à mi-chemin
- Une **Vue** a un **Calque** avant et un **Calque** arrière (éventuellement vide)
- Un **Skin de coiffe** a un **Point d'ancrage**, commun à toutes ses **Vues**
- Chaque **Vue** a son propre **Réglage**, valable aussi pour sa version en miroir
- Une **Tenue** occupe un, deux ou trois **Emplacements** : par exemple Coiffe seule, Cape et Ailes, ou les trois
- Les **Ailes** se portent sous la **Cape** : dessinées derrière elle, toutes deux derrière le corps
- La **Vue** d'une **Coiffe**, d'une **Cape** ou des **Ailes** suit la rotation de la tête, comme un personnage Dofus qui se tourne d'un bloc ; **Cape** et **Ailes** ne suivent la rotation des épaules que si le visage n'est pas visible
- Une **Photo** est prise pendant un **Essayage** et fige la **Vue** de chaque élément de la **Tenue**

## Example dialogue

> **Dev:** "Quand l'utilisateur tourne franchement la tête à gauche, on affiche quelle vue ?"
> **Domain expert:** "La Vue de 3/4 du Skin de coiffe, en miroir : au-delà du Palier de face, c'est toujours le 3/4. La Photo prise à ce moment-là contient cette Vue."

## Flagged ambiguities

- « coiffe » désignait à la fois l'objet et son visuel. Résolu : **Coiffe** = l'objet, **Skin de coiffe** = le visuel.
- Les données du jeu nomment le type d'objet « Chapeau » (type 16). Dans ce projet, on dit **Coiffe**, le nom que l'interface du jeu montre aux joueurs.
- Les apparats de coiffe (type 246, objets cosmétiques comme la Tignasse de Goultard) se portent aussi sur la tête : dans ce projet, ce sont des **Coiffes** comme les autres.
- Un objet vivant (type 113) change d'apparence à chaque niveau. Chaque apparence d'un objet vivant de tête est une **Coiffe** à part, nommée par son niveau comme le font les joueurs (« Chapeau Rolivan 1 »).
- Les apparats de cape (type 247, dont les sacs à dos) se portent dans le dos : dans ce projet, ce sont des **Capes**. Les Ailes (type 300) ont leur propre Emplacement et se portent avec ou sans Cape.
