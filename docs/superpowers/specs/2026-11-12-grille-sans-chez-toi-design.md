# Ta grille, sans chez toi

Décidé par Nicolas le 12 novembre 2026, sur planches (1B, 2B, 3B, 4A), après trois avis (gestionnaire de
patrimoine, parcours, interface). Ce document fait foi.

## Pourquoi

Pour un propriétaire, « Chez toi » prend souvent 60 à 70 carrés : ce qu’il pilote tient dans le reste. Les
gestionnaires de patrimoine présentent le total (la vérité de ce qu’on possède), mais raisonnent la
répartition hors résidence principale. Oseil le fait déjà pour les objectifs et les Repères ; seules la
grille, le total et l’évolution comptaient encore la maison.

## Ce qui est décidé

- **Un réglage d’affichage**, dans Réglages › Affichage, sous « En euros / En % » : « Ta grille », pilules
  « Tout compter » / « Sans chez toi », une phrase dessous (« Ta maison, ta résidence secondaire et leurs
  crédits. Tes objectifs ne changent pas. »). Par défaut « Tout compter » : rien ne change pour personne tant
  qu’on ne choisit pas. Il n’apparaît que si la personne a quelque chose dans « Chez toi ». Avec seulement
  « Chez toi », « Sans chez toi » ne laisserait rien : la pilule est grisée.
- **Ce qui sort** : toute la poche « Chez toi » (principale, secondaire) et les crédits qui la financent. Le
  locatif reste. Un crédit qui ne finance pas la maison reste.
- **La grille est recalculée** (1B) : 100 carrés sur ce qui reste ; « Un carré vaut … » suit, et sa valeur au
  premier relevé aussi.
- **Le total le dit** (2B) : au-dessus du montant, « À toi, hors chez toi » ; dessous, en petit, l’autre
  total : « 400 000 € en comptant chez toi ».
- **Le choix se trouve** (3B) dans les Réglages, et par un lien « Voir ma grille sans chez toi › » dans le
  détail de l’Immobilier.
- **La rangée Immobilier** (4A) de Mon argent ne garde que le locatif ; sans locatif, elle disparaît.
- **L’évolution suit** le même choix sur toute sa durée.
- **Le détail de l’Immobilier suit la grille** (décidé par Nicolas le 12 novembre 2026, après la relecture) : le
  locatif avec sa part de la grille sans maison ; la maison listée dessous, « Hors de ta grille », avec son
  montant et sa fiche. Sans locatif : « Chez toi est hors de ta grille, comme tu l’as choisi. »
- **Le choix est fait une fois**, sur le dernier relevé, puis appliqué à tous les relevés : un relevé laissé entier
  parmi les autres inventerait un gain ou une perte. Si ce qui reste hors chez toi n’est pas positif, « Sans chez
  toi » est grisé et ne s’applique pas.
- **Ne change pas** : les objectifs (déjà hors chez toi), les Repères, les pages de l’exemple (toujours « Tout
  compter »).
- **Rien de nouveau ne part en clair** : le choix vit dans le document des réglages, chiffré
  (`Settings.withoutHome`, écrit seulement quand il vaut `true`).

## Laissé au constructeur

Les écrans de fin de mise à jour et du premier lancement gardent la grille complète (choix de Claude, à
signaler) ; les mots non cités ici.
