# La plus-value d’une ligne en devise compte le change

Demandé par Nicolas le 11 novembre 2026, après la revue des calculs, qui avait laissé cette limite écrite
(`2026-11-11-revue-des-calculs-profils.md`, « Limite connue »). Ce document la lève.

## Le problème

Une ligne en devise (des actions américaines en dollars) dit « a gagné 1 852 € depuis l’achat ». Oseil
connaît le prix moyen d’achat en dollars (recopié du courtier), pas le taux du jour de l’achat : il convertit
ce prix au taux d’aujourd’hui. Le gain affiché est le gain en dollars traduit en euros, sans l’effet du
change.

Exemple : achat à 180 $ quand 1 € = 1,20 $ (150 € payés), l’action vaut 230 $ et 1 € = 1,08 $ (213 €).
Vrai gain : 63 € par action. Oseil affiche aujourd’hui 46 €.

Ce qui est déjà juste et ne change pas : l’évolution du patrimoine (chaque relevé au taux de son jour) et
la part « les marchés et les intérêts » de l’Évolution, qui compte déjà l’effet du change.

## Ce qui change

**Le coût en euros d’une ligne en devise se retrouve dans l’historique des relevés**, sans rien demander :

- au premier relevé où la ligne apparaît : parts × prix moyen d’achat, converti au taux de ce relevé ;
- à chaque relevé suivant où des parts s’ajoutent : ce qui a été ajouté au coût en devise (parts × prix
  moyen, avant et après), converti au taux de ce relevé ;
- quand des parts sont vendues : le coût en euros baisse dans la même proportion que les parts ;
- quand le prix moyen change sans que les parts changent (une correction) : le coût en euros suit, au taux
  d’origine, comme si le prix avait toujours été celui-là.

C’est un **taux moyen d’achat**, tiré des taux que les relevés gardent déjà (`fx`). Pour une ligne saisie
longtemps après son achat, c’est le taux du jour de la saisie, pas de l’achat : une approximation, meilleure
qu’aujourd’hui, et corrigeable.

**Corrigeable** : la fiche de la ligne montre ce taux moyen d’achat (« 1 € = 1,20 $ ») et permet de le
remplacer par le vrai, lu sur le relevé du courtier. Remplacé, il vaut pour tout le coût de la ligne ; il
reste modifiable, et peut être remis à « calculé par Oseil ».

**La plus-value** affichée (détail d’une catégorie, fiche de la ligne) devient : valeur d’aujourd’hui en
euros − coût en euros. Elle peut dire la part du change : « a gagné 63 € depuis l’achat, dont 17 € grâce au
dollar » (à trancher par la relecture : utile, ou trop de chiffres).

## Objectifs

- Un gain en euros vrai pour une ligne en devise, sans saisie de plus.
- La possibilité de corriger le taux quand on le connaît.
- Rien ne change pour une ligne en euros, ni pour une ligne sans prix d’achat.

## Non-objectifs

- Pas de recherche du taux historique d’une date quelconque (pas de nouvelle source de données, pas de
  nouvel appel à la BCE).
- Pas de calcul fiscal (plus-value imposable, frais, méthode PEPS) : c’est un repère, pas une déclaration.

## Anti-objectifs

- Un taux inventé : sans relevé qui porte ce taux, on garde le calcul d’aujourd’hui et on le dit.
- Une plus-value qui change toute seule d’un jour à l’autre sans que rien n’ait bougé.
- Un nouveau chiffre envoyé en clair : le taux corrigé est un nombre de la ligne, dans le profil chiffré.

## Ce qui est enregistré

- Rien pour le calcul par l’historique : il lit les relevés existants.
- Le taux corrigé, s’il y en a un : un champ facultatif de la ligne (`purchaseRate`, « 1 € = x » dans la
  devise de la ligne), dans le profil, chiffré avec lui. Le fichier Excel gagne la colonne correspondante,
  facultative.

## Laissé au constructeur

- Les noms dans le code, l’emplacement exact du champ sur la fiche, le découpage des fonctions.

## Après la relecture (11 novembre 2026)

Quatre relecteurs (expérience, interface, textes, conseiller en gestion de patrimoine). Ce qui change :

- **Où** : la plus-value par ligne ne s’affiche que dans le détail de « Placements en bourse » (la fiche d’une
  ligne n’en a pas) : c’est là qu’elle devient juste. **Pas de « dont 17 € grâce au dollar »** : déconseillé
  par les quatre (trop de chiffres dans la liste) ; à reprendre sur planche si la fiche gagne un jour un gain.
- **La règle, précisée** (vérifiée par le conseiller sur achat, renfort, vente, division d’actions) :
  - une vente (moins de parts) réduit le coût en euros dans la même proportion que les parts ; c’est le prix
    moyen pondéré, la règle fiscale française pour les titres ;
  - un relevé où les parts baissent et le prix moyen change : d’abord la vente, puis la correction ;
  - une correction du prix moyen (parts inchangées ou en baisse) suit **au taux moyen de la ligne** (coût en
    euros ÷ coût en devise), pas au taux du jour ;
  - des parts comparées avec une tolérance, pour qu’un arrondi de fraction ne passe pas pour un achat.
- **Le prix moyen recopié déjà en euros** : beaucoup de courtiers français l’affichent change compris.
  Recopié comme des dollars, le gain serait faux de l’écart de change (déjà le cas aujourd’hui). La fiche
  propose donc « Mon prix moyen est en euros » : coché, le coût est exact, sans taux.
- **La fiche** : une rangée « Taux moyen d’achat » dans le bloc « Corriger », pour une ligne en parts, en
  devise, avec un prix d’achat (aucune rangée sinon). Sa valeur « 1 € = 1,20 $ » ; dessous, « calculé par Oseil
  d’après tes relevés », « ton chiffre » ou « prix moyen en euros ». Toucher la rangée ouvre un champ unique,
  la case « en euros », et, si un chiffre a été tapé, « Laisser Oseil le calculer ». L’aide dit que le taux
  calculé est celui du jour de chaque relevé : juste au jour de l’achat, approché pour une ligne saisie plus
  tard ; le relevé du courtier fait foi. Une valeur à l’envers (« 0,83 » pour 1,20) n’est pas devinée : un taux
  hors de 0,01 à 1 000 est refusé.
- **Hors dividendes et frais** : comme le prix moyen d’achat du courtier, le gain affiché les laisse de côté.

Non traités ici (chantiers à part) : la cotation en pence (Londres), un titre coté dans une autre devise que
celle du compte au-delà de la case « en euros ».

## Après la revue des écrans (11 novembre 2026)

Captures relues par un relecteur à part (interface, expérience, textes). Les mots retenus, sans « taux » :
la rangée s’appelle « Le dollar à l’achat » (« La livre… », « Le franc suisse… »), avec dessous « calculé par
Oseil », « ton chiffre » ou « prix moyen en euros », et la valeur « 1 € = 1,09  » à deux décimales («  »
comme partout ailleurs sur le site). Le formulaire porte ce titre, demande « Sur ton relevé de courtier, ton
prix moyen d’achat est en : » (« Dollars américains » / « Euros »), puis « Quand tu as acheté, 1 € valait
combien de dollars américains ? ». « Revenir au calcul d’Oseil » n’apparaît que sous la devise, pour un chiffre
tapé. Le choix sélectionné reste une pilule pleine, comme partout ailleurs sur le site.
