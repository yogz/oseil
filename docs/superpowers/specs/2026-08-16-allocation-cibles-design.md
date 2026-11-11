# Les cibles d'allocation appartiennent à quelqu'un

**Date :** 16 août 2026
**Statut :** validé
**Complète :** `2026-08-13-suivi-patrimoine-design.md`, §3.4

---

> **Chiffres d'exemple.** Les montants de ce document proviennent du jeu de données fictif
> `data/opening-portfolio.example.json`. Les chiffres réels ne sont pas versionnés. Les ordres de
> grandeur et les proportions ont été conservés : le raisonnement reste lisible, les données ne
> sont plus celles de personne.

Refonte de l'onglet Allocation : sortir les cibles de la table des classes d'actif, piloter sur
cinq poches au lieu de douze classes, et faire de l'absence de cible un état légitime plutôt
qu'une erreur.

## 1. Le problème

### 1.1 Une cible que personne n'a choisie

La table des classes d'actif porte une colonne `target_bps`. Il y a donc **une seule ligne
« Actions Monde » pour toute la base**, et une seule cible avec elle. Une cible n'appartient à
personne : ni à un profil, ni à un utilisateur.

Les douze valeurs qu'elle contient aujourd'hui n'ont été validées par personne. Le plan
d'implémentation du 13/08/2026 exigeait `targetBps: 0` avec ce commentaire : *« les cibles sont
saisies par le propriétaire après la reprise »*. La spécification était plus explicite encore, au
§3.4 : *« Cette décision appartient au propriétaire ; l'outil ne propose aucune allocation. »*

Elles ont malgré tout été écrites, dans un commit intitulé « wip: opening portfolio migration ».
**Trois d'entre elles reproduisaient la détention constatée au moment où elles ont été posées** —
une cible égale à l'existant produit un écart nul, donc invisible. Elle ne pilote rien : elle
certifie le statu quo.

### 1.2 Les poches actions se recouvrent

La grille prévoit quatre lignes actions : Monde 29,5 %, Europe 10 %, US 9 %, Émergents 4 %.

Mais l'indice MSCI World est composé à **72,03 % d'actions américaines** au 31 juillet 2026
([factsheet MSCI](https://www.msci.com/documents/10199/255599/msci-world-index.pdf)). Appliquée
au périmètre pilotable du jeu d'exemple, 241 552 €, la grille produit donc :

| | Ce qu'elle affiche | Ce qu'elle produit |
|---|---|---|
| États-Unis | 9 % → 21 740 € | **73 068 €, soit 30,2 % du pilotable** |
| Europe | 10 % → 24 155 € | ~35 300 € |
| Japon | absent | ~4 100 € |

La ligne « Actions US 9 % » se trompe d'un facteur 3,4. Un écran qui afficherait « Actions US : à
renforcer » ferait acheter de l'américain à quelqu'un qui en détient déjà plus de trois fois le
chiffre annoncé.

Ce défaut ne dépend d'aucun portefeuille : il tient à la composition de l'indice. **Quatre lignes
qui se recouvrent sont ininterprétables**, quelles que soient les valeurs qu'on y met, et quel que
soit celui qui les regarde.

### 1.3 Une granularité qui ne sert à rien

Sur le jeu d'exemple, quatre classes pèsent moins de 3 % du périmètre pilotable. Une poche à 1,2 %
qui double ou s'effondre déplace le patrimoine de moins de 1 %. Elle coûte du suivi, des frais et
de l'attention pour un effet indétectable.

### 1.4 Ne pas avoir décidé n'est pas une panne

Le calcul refuse aujourd'hui tout jeu de cibles dont la somme n'est pas 10 000 points de base.
C'est juste. Mais la page traite ce refus comme une erreur et affiche un message rouge :
*« Les cibles ne totalisent pas 100 % du périmètre pilotable. »*

Or l'état « je n'ai pas encore décidé » est légitime, et c'est celui dans lequel se trouvera tout
nouvel arrivant. Le confondre avec une base corrompue est une faute de conception.

### 1.5 Aucun écran pour saisir une cible

Il n'en existe aucun. Modifier une cible demande aujourd'hui de passer par le code ou par une
migration.

## 2. Les décisions structurantes

### 2.1 Une cible appartient à un profil, pas à une classe d'actif

C'est la correction du défaut de fond. Les cibles quittent la table des classes d'actif et
deviennent leur propre objet : **un profil d'allocation porte un jeu de cibles**. Un seul profil
est actif à la fois.

Cette forme n'a pas d'utilité immédiate — il n'y aura qu'un profil — mais elle est le prix d'entrée
de deux chantiers déjà identifiés : les portefeuilles de référence en lecture seule, et le
multi-utilisateurs. La poser maintenant évite une seconde migration plus tard.

### 2.2 On décrit en douze classes, on pilote sur cinq poches

Le modèle actuel confond deux métiers. Une classe d'actif sert à **décrire** ce qu'on détient ; une
poche sert à **porter une cible**. Les deux ne demandent pas la même finesse.

Les douze classes restent inchangées. Cinq poches s'intercalent au-dessus. Chaque classe pilotable
appartient à exactement une poche.

| Poche | Classes rattachées | Part sur le jeu d'exemple |
|---|---|---|
| **Sécurité EUR** | Liquidités, Monétaire EUR | 54 349 € — 22,5 % |
| **Sécurité en devises** | Monétaire en devises | 38 050 € — 15,8 % |
| **Obligations & dette** | Obligations, Dette privée / crowdfunding | 12 196 € — 5,0 % |
| **Actions** | Actions Europe, US, Monde, Émergents | 66 957 € — 27,7 % |
| **Actifs réels & non coté** | Immobilier locatif, Matières premières / or, Private equity | 70 000 € — 29,0 % |

La résidence principale n'est pas pilotable et n'appartient à aucune poche.

Ce découpage règle les deux défauts d'un coup : les quatre lignes actions fusionnent en une seule
poche, ce qui supprime le recouvrement ; et aucune poche ne pèse moins de 5 %.

**Le monétaire en devises garde sa propre poche.** C'est un choix délibéré. Un solde libellé en
devise étrangère est présenté comme de la sécurité alors que les dépenses sont en euros : sur le
jeu d'exemple, une baisse de 10 % des devises concernées coûterait 3 805 €. Fondre cette poche dans
la sécurité enterrerait la question. Lui donner une ligne oblige à lui fixer une cible, donc à
décider si ce pari de change est voulu.

### 2.3 Les poches vivent dans le code, les cibles en base

Une poche est une décision de produit, pas une donnée personnelle : personne ne va inventer la
sienne. Les cinq poches et le rattachement des classes sont donc déclarés dans un module du
domaine, pas dans une table.

Ce que ça évite : une table, un script de remplissage, et une migration à chaque fois qu'une classe
change de poche. Ce que ça coûte : ajouter une classe d'actif demandera de lui assigner une poche
dans le code — ce qui est déjà le cas pour toute création de classe.

Les cibles, elles, sont les données de l'utilisateur et vont en base.

Si le multi-utilisateurs exige un jour des poches sur mesure, ce sera un changement à faire à ce
moment-là.

### 2.4 L'absence de cible est un état, pas une erreur

Trois états, distincts, et l'écran les traite différemment :

| État | Ce que la page affiche |
|---|---|
| **Aucun profil actif** | La répartition réelle par poche, aucun écart, le formulaire de saisie |
| **Profil actif et cohérent** | Les écarts sur les cinq poches |
| **Profil actif incohérent** | Le message d'erreur existant |

Le troisième état est inatteignable par l'interface, puisque l'enregistrement refuse une somme
différente de 100 %. Le garde-fou reste en lecture, comme filet, au cas où la base serait modifiée
directement.

### 2.5 La saisie refuse toute seule

Le formulaire vit sur l'onglet Allocation, sous la répartition : c'est là qu'on a besoin de voir sa
situation réelle pendant qu'on pose ses cibles.

Le total s'affiche pendant la saisie. **L'enregistrement est refusé tant que la somme ne fait pas
exactement 100 %**, et la validation est refaite côté serveur — un garde-fou qui ne tient que dans
le navigateur ne garde rien.

C'est la déclinaison d'un principe du projet : préférer un mécanisme qui refuse tout seul à une
validation humaine qui ne peut pas être exercée sérieusement.

## 3. Le modèle de données

### 3.1 Supprimé

La colonne `target_bps` de la table des classes d'actif. C'est l'emplacement fautif : une valeur
globale pour une donnée qui appartient à quelqu'un.

Les douze cibles y disparaissent avec elle. **La migration ne crée aucun profil.** Le point de
départ est une page vierge, comme le plan d'origine le prévoyait.

### 3.2 Créé — les profils d'allocation

Un identifiant, un libellé, un drapeau d'activité, une date de création.

Contrainte : **au plus un profil actif à la fois**, garantie par un index unique partiel sur le
drapeau d'activité plutôt que par du code applicatif.

### 3.3 Créé — les cibles

Un profil, une poche, une valeur en points de base. Unicité sur le couple profil + poche, pour
qu'une poche ne puisse pas recevoir deux cibles dans le même profil. Suppression en cascade avec
le profil.

La poche est stockée comme un identifiant texte. Elle ne référence pas de table, puisque les poches
vivent dans le code ; la couche d'écriture vérifie que toute cible enregistrée désigne une poche
connue, et la lecture ignore une poche devenue inconnue plutôt que de faire tomber la page.

### 3.4 Inchangé

Les douze classes d'actif, leur drapeau pilotable, leur ordre d'affichage. Les actifs, les relevés,
les lignes de relevé, les mouvements.

## 4. Le domaine

### 4.1 Les poches

Un nouveau module déclare les cinq poches — identifiant, libellé, ordre — et le rattachement de
chaque classe d'actif à sa poche.

Deux invariants, tenus par des tests :

- **Exhaustivité** : toute classe pilotable appartient à une poche
- **Unicité** : aucune classe n'appartient à deux poches

Ces tests échouent si quelqu'un ajoute une classe d'actif sans lui donner de poche. C'est
intentionnel : le rattachement n'est pas facultatif.

### 4.2 Le calcul des écarts

Le calcul travaille désormais sur les poches. Il agrège les lignes valorisées par poche via leur
classe, applique la cible au périmètre pilotable, et trie du plus gros écart absolu au plus petit.

Il conserve ses garde-fous : une cible doit être un entier entre 0 et 10 000 points de base,
aucune poche ne peut recevoir deux cibles, et la somme doit faire exactement 10 000.

Il gagne une distinction qu'il n'a pas : **l'absence de cibles rend un état, pas une exception.**
Un jeu de cibles vide n'est pas un jeu de cibles invalide.

### 4.3 L'enregistrement

Une fonction pure valide la saisie : elle vérifie que les valeurs désignent des poches connues,
qu'elles sont des pourcentages entre 0 et 100, que les cinq poches sont couvertes, et que la somme
fait 100 %. Elle rend soit les cibles converties en points de base, soit un message d'erreur en
français.

L'action serveur reste mince : elle appelle cette fonction, et n'écrit que si elle accepte. Chaque
refus est ainsi couvert par un test plutôt que par un clic.

En cas d'acceptation, elle écrit dans le profil actif. S'il n'en existe aucun, elle en crée un,
libellé « Mon allocation », et l'active. Après un enregistrement réussi, il existe donc toujours
exactement un profil actif portant cinq cibles dont la somme fait 10 000.

Une deuxième saisie remplace les cibles du profil actif ; elle n'en crée pas un second.

## 5. L'écran

La page reste un composant serveur. Elle lit le dernier relevé, ses lignes valorisées, le profil
actif et ses cibles.

**Le dessin actuel est conservé** : la graduation partagée entre toutes les poches, où la barre
marque ce qui est détenu et le repère marque la cible. Il est bon, il rend les poches comparables
entre elles et pas seulement à leur propre cible.

Ce qui change :

- Cinq lignes au lieu de douze
- Un état vide qui invite à définir ses cibles au lieu d'un message d'erreur
- Un formulaire de cinq champs sous la répartition
- Le total du périmètre pilotable continue de porter son nombre de poches, comme aujourd'hui

Le détail par classe d'actif n'est pas affiché ici : il existe déjà sur l'onglet Lignes. Le
reconstruire reviendrait à recréer l'écran à douze lignes qu'on cherche à supprimer.

## 6. Ce qui est hors périmètre

Ces sujets sont identifiés, documentés, et volontairement écartés de ce chantier.

**Les portefeuilles de référence publics.** Permanent Portfolio, 60/40, Three-fund des Bogleheads,
chargés en lecture seule pour comparer et copier. C'est la réponse à « je ne sais pas quoi mettre »,
et c'est ce qui met le produit du bon côté de la ligne réglementaire — un repère générique, daté et
sourcé n'est pas une recommandation personnalisée. Mais chacun demande d'être choisi, sourcé et
assorti de ses limites : tous sont américains et datés. Le modèle de données posé ici les accueille
sans migration supplémentaire.

**La gestion de plusieurs profils à l'écran.** La table les permet, l'interface n'en expose qu'un.

**Le multi-utilisateurs.** Le modèle ne s'y oppose plus, mais l'authentification reste mono-compte :
il n'existe aucune table d'utilisateurs, le jeton de session identifie un unique `owner`, et la date
d'un relevé est unique pour toute la base. C'est un chantier à part entière.

**Une ligne « où mettre le prochain euro ».** Quand une poche est massivement au-dessus de sa cible,
il ne s'agit pas d'un prochain euro mais d'un déplacement de plusieurs dizaines de milliers d'euros.
La poche la plus sous-dotée figure déjà en tête de la liste triée : une ligne supplémentaire ne
ferait que répéter la première.

**L'exposition géographique par transparence des fonds.** Elle expliquerait le recouvrement décrit
au §1.2, mais elle suppose de récupérer et de tenir à jour la composition interne de chaque fonds —
coûteux, fragile, et sans effet sur une décision tant qu'aucune cible n'existe. Le découpage en
poches règle le problème par la structure plutôt que par la mesure.

## 7. La vérification

Tests écrits avant le code.

**Les poches** — le rattachement est exhaustif et sans doublon ; les cinq poches sont connues et
ordonnées.

**Le calcul** — l'agrégation par poche est juste ; une somme différente de 100 % est refusée ; une
cible hors bornes est refusée ; une poche en double est refusée ; un jeu vide rend un état distinct
et non une exception ; le tri par écart absolu décroissant tient.

**L'enregistrement** — refuse une somme différente de 100 %, une valeur hors bornes, une poche
inconnue, un jeu incomplet ; accepte un jeu valide et remplace les cibles précédentes sans créer un
second profil.

**La page** — le formulaire rend un champ par poche, additionne pendant la frappe, et refuse la
soumission tant que le total n'est pas 100 %.

**La migration** — couverte par le test de migrations existant, qui rejoue la suite complète et
écrit dans les deux nouvelles tables.

Le garde-fou design (`check:design`) tourne déjà avant les tests et avant le build. Il continue de
s'appliquer.

La suite complète est exécutée et sa sortie collée avant toute annonce de fin.

## 8. Les fichiers touchés

| Fichier | Nature |
|---|---|
| `lib/domain/aggregate.ts` | Expose `roundToCents`, aujourd'hui dupliqué dans plusieurs modules |
| `lib/domain/buckets.ts` | Nouveau — les cinq poches, le rattachement, la répartition |
| `lib/domain/targets.ts` | Le calcul passe des classes aux poches ; la validation de saisie apparaît |
| `lib/db/schema.ts` | Suppression de la colonne de cible, deux tables ajoutées |
| `drizzle/0002_*.sql` | Migration générée |
| `lib/db/allocation.ts` | Nouveau — lecture du profil actif et de ses cibles, écriture |
| `app/(app)/allocation/page.tsx` | Cinq poches, état vide, formulaire |
| `app/(app)/allocation/TargetsForm.tsx` | Nouveau — la saisie |
| `app/(app)/allocation/actions.ts` | Nouveau — l'action d'enregistrement |
| `scripts/seed-reference.ts` | Retrait de la cible des classes d'actif |
