# Vues rendues depuis les meshes du client plutôt qu'assemblées à la main

Dans Dofus 3, chaque Skin de coiffe est un `SkinAsset` (Unity) : des morceaux maillés, nommés par direction (`Chapeau_<dir>` pour le Calque avant, `ChapeauB_<dir>` pour le Calque arrière), dont les sommets sont exprimés autour du point d'attache de la tête, avec un atlas de textures. Un script rend chaque Vue en PNG directement depuis ces données. On abandonne donc l'assemblage manuel des morceaux prévu au départ.

On y gagne des Vues fidèles au pixel près, les 5 directions natives (face, 3/4 face, profil, 3/4 dos, dos ; les autres en miroir), le Calque arrière fourni par le jeu et un point d'ancrage commun à toutes les Vues d'un skin. Le Réglage reste cependant propre à chaque Vue : à l'essai, un Réglage unique par skin ne tombait pas juste en 3/4. En contrepartie, le pipeline dépend du format interne du client (structure `SkinAsset`, matrices des symboles en convention Flash, transposées et avec l'axe Y inversé), qui peut changer à une mise à jour.

Le client ne contient pas la correspondance Coiffe → Skin de coiffe : c'est le serveur qui envoie l'apparence. On la retrouve en comparant l'icône de l'objet aux atlas, puis on la vérifie à l'œil et on la fige dans les données du projet.
