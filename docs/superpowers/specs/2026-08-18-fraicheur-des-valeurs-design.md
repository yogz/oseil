# La fraîcheur des valeurs — le temps 2

## Pourquoi

L'écran de relevé pré-remplit chaque ligne avec la valeur du relevé précédent, et enregistre
**toutes** les lignes : celles dont le propriétaire a vérifié le chiffre comme celles qu'il a
laissées telles quelles. Une fois écrites, les deux sont indiscernables.

Conséquence : un solde inchangé depuis mars ressort daté d'août. Le total du patrimoine s'affiche
à l'euro près alors qu'une part inconnue de ce total repose sur des chiffres périmés. C'est un
zéro qui se lit comme une réponse — le défaut que ce dépôt refuse partout ailleurs.

La date existe déjà (`snapshots.taken_on`), mais elle est celle du relevé, pas celle du chiffre.
Ce qui manque tient en une phrase : **savoir, ligne par ligne, si cette date est vraie.**

## Ce que ce temps 2 produit, et pourquoi le temps 3 en dépend

Le temps 3 doit décider si la photo globale reste l'unité de stockage. Cette décision demande de
savoir quelle part du patrimoine, **en euros**, repose sur des valeurs non revues. L'application
ne conserve pas cette donnée aujourd'hui. Le temps 2 la produit ; le temps 3 se décide après,
avec les chiffres sous les yeux, pas avant.

## Le modèle de données

Une colonne additive sur `snapshot_lines` :

```
figure_from  date  NULL
```

**La date à laquelle le chiffre gouverné par le propriétaire a été posé pour la dernière fois.**

- Pour une ligne mesurée à ce relevé : égale au `taken_on` du relevé.
- Pour une ligne reportée : une date antérieure — celle du relevé où le chiffre a été posé.
- `NULL` : inconnu, jamais calculé. C'est l'état des lignes écrites avant ce temps 2 ; la reprise
  d'historique (voir plus bas) les remplit. Une vue qui rencontre `NULL` **le dit**, elle
  n'invente pas une fraîcheur.

Le choix d'une date pleine plutôt que d'un `NULL` porteur de sens est délibéré : dans ce dépôt
`NULL` veut dire « jamais décidé », et lui faire dire ici « mesurée aujourd'hui » — une
affirmation — abîmerait cette grammaire. Toute ligne calculée porte une vraie date.

## Ce qui compte comme « le chiffre du propriétaire »

Le marché bouge tout seul ; le propriétaire non. La comparaison ne porte donc que sur ce qu'il
saisit, et cela dépend du mode de valorisation :

| Mode | Le chiffre comparé |
|---|---|
| `quoted` | la **quantité** — le cours vient du marché |
| `balance`, `manual` | le **montant** |
| `property` | la **valeur brute** et la **dette** |

## La subtilité qui gouverne tout l'écran

**Une ligne cotée dont la quantité date de mars n'est pas périmée.** Son cours a été cherché ce
matin : sa valeur en euros est actuelle. La fraîcheur de ce cours est déjà dite par
`price_status`, qui existe depuis le début.

Ne sont donc comptées comme périmées que les lignes que **personne ne peut rafraîchir
automatiquement** — `balance`, `manual`, `property`. Pour celles-là, un chiffre non retouché est
un chiffre d'un autre mois portant la date d'aujourd'hui.

Confondre les deux ferait crier l'écran sur des lignes parfaitement à jour, et on cesserait de
le croire.

## L'horizon

Trois mois, en valeur de départ, dans `lib/domain/settings.ts` avec les autres. Aucune colonne,
aucun écran de réglage pour l'instant : c'est un `defaut` au sens du dépôt — le corriger là
corrige rétroactivement tout ce que personne n'a choisi. Un réglage véritable viendra si
l'usage montre que trois mois est le mauvais chiffre.

## Ce que les écrans disent

**La fiche d'une ligne.** Sous « Ce qu'elle vaut », la phrase gagne son âge réel :
*« 7 039 € au relevé du 14 août — chiffre inchangé depuis le 12 mars, il y a 5 mois »*. Une ligne
mesurée au dernier relevé ne dit rien de plus qu'aujourd'hui. Une ligne dont le `figure_from` est
`NULL` dit *« fraîcheur inconnue »*, jamais « à jour ».

**L'accueil.** Une phrase, avec son compte de lignes, dans la grammaire du marquage du deviné :
*« 61 780 € — 9,9 % — reposent sur des valeurs non revues depuis plus de 3 mois, sur 4 lignes. »*
Zéro ligne concernée : la phrase disparaît, elle ne s'affiche pas à zéro. **C'est le chiffre que
le temps 3 attend.**

**Le relevé.** Rien de neuf dans ce temps 2. Marquer pendant la saisie ce qu'on vient de vérifier
demanderait un geste de plus à chaque relevé ; la comparaison mécanique donne la même réponse
sans rien demander.

## Ce que la comparaison mécanique ne sait pas, et qu'il faut assumer

Si le propriétaire consulte sa banque, constate le même solde et ne retape rien, la ligne sera
comptée « non revue ». C'est **faux dans le sens prudent** : l'écran sous-estime la fraîcheur, il
ne la surestime jamais. Un tableau de bord qui se trompe doit se tromper de ce côté-là.

Le remède n'est pas une case « j'ai vérifié » de plus à chaque relevé — c'est le geste « mettre à
jour cette ligne seule », que ce même modèle rend possible et qui viendra ensuite : retaper le
même chiffre y vaut confirmation.

## La reprise d'historique

Les lignes déjà en base n'ont pas de `figure_from`. On ne le devine pas : **on le calcule**, en
parcourant les relevés dans l'ordre et en appliquant la même comparaison. Toute la donnée
nécessaire est là.

Un script dédié, relançable sans dommage : il recalcule et réécrit, donc le passer deux fois
donne le même résultat. Le premier relevé de l'histoire n'a pas de prédécesseur — ses lignes sont
mesurées à leur date, par définition.

## Ce qui refuse

- `figure_from` postérieur au `taken_on` de son relevé : impossible par construction, un test le
  vérifie sur la fonction pure.
- Une vue qui afficherait un âge sans compter les lignes concernées : le test du marquage lit
  déjà le source des vues pour ça, et la même règle s'applique ici.

## Les tests

- **La fonction pure** `figureFrom(previous, next, previousDate)` : chiffre changé → la date du
  relevé courant ; inchangé → la date portée par la ligne précédente ; pas de précédent → la date
  du relevé courant. Un cas par mode de valorisation.
- **L'agrégat** : les lignes cotées ne comptent jamais comme périmées, même très anciennes ; une
  ligne `NULL` ne compte ni comme fraîche ni comme périmée, elle est dite inconnue.
- **Zéro ligne périmée** → la phrase n'existe pas, et surtout pas « 0 € périmés », qui se lirait
  comme une réponse rassurante.
- **La reprise d'historique**, sur une base PGlite montée avec trois relevés successifs : elle
  donne les dates attendues, et la relancer ne change rien.

## L'ordre d'exécution, qui n'est pas négociable

La colonne est **ajoutée**, donc la migration passe avant le déploiement : le code déployé
demande toutes les colonnes déclarées, y compris celle-là. Dans cet ordre, sans exception —
migration sur la base réelle, vérification de ce que la base contient vraiment, reprise
d'historique, puis fusion.

## Le temps 3, pour mémoire

Il ne peut pas être fait dans la foulée. Il demande les chiffres que ce temps 2 commence à
produire, et il n'y en aura de significatifs qu'après quelques relevés. Ce qui est livré ici,
c'est **la mesure** ; la décision vient après, quand elle aura de quoi se prendre.
