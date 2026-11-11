# Rendre le travail finissable

## Le défaut

Le compteur de l'écran de mise à jour — « N lignes attendent une valeur » — **ne peut pas
atteindre zéro**. Ce n'est pas un défaut d'affichage : c'est une conséquence de la règle qui
calcule la fraîcheur, et elle n'a jamais été traitée.

`figureFrom` (`lib/domain/freshness.ts`) garde la date qu'une ligne avait déjà quand son chiffre
est **inchangé**. La règle est juste et bien argumentée : sans elle, un solde non touché depuis
mars ressortirait daté d'août, et le total paraîtrait mesuré alors qu'il est reporté. Le prix
n'avait pas été payé jusqu'ici : **une valeur inchangée ne peut pas être confirmée.**

Vérifié en lisant le code, le 5 septembre 2026 :

- `figureFrom` ne rend `takenOn` que si un des chiffres du propriétaire a bougé ;
- `saveSnapshot` (`lib/db/snapshots.ts`) applique cette règle à toutes les lignes du relevé ;
- `measureLine` (`lib/db/measure-line.ts`) se termine par un appel à `saveSnapshot` — donc le geste
  « mettre à jour cette ligne seule », sur la fiche, n'y échappe pas non plus.

La spec du 18 août annonçait pourtant que « retaper le même chiffre vaut confirmation » sur ce
geste-là. La phrase est au futur — « viendra ensuite » — et rien ne l'a implémentée. Elle décrivait
une intention, pas un état des lieux.

**La conséquence sur le patrimoine réel.** L'immobilier pèse 396 022 €, soit **60,2 %** du total
(`docs/reprise/patrimoine-numbers-2025-11-16.md`). Personne ne réévalue une résidence tous les
trimestres. Ces lignes repassent donc en « attend une valeur » tous les trois mois, à vie, et aucun
geste de l'application ne permet d'y répondre. Le travail d'entretien n'a pas de fin possible.

Second facteur, indépendant : un cours n'est « frais » que **le jour de sa récupération**
(`cachedPrice`, `lib/quotes/resolve.ts`), et la tâche automatique ne tourne que **le 1er du mois**
(`vercel.json`). Tout autre jour, chaque ligne cotée s'ouvre périmée et réclame quantité **et**
cours à la main.

## 1. L'horizon dépend du type de bien

`STALE_AFTER_MONTHS = 3` est aujourd'hui un seuil unique, appliqué du livret A à la maison. Il
devient une règle par mode de valorisation :

| Mode | Horizon | Raison |
|---|---|---|
| `balance` — un solde que je relève | **3 mois** | inchangé ; ces comptes se relisent souvent |
| `manual` — un chiffre que je pose | **6 mois** | deux fois par an suffit |
| `property` — un bien immobilier | **12 mois** | le rythme réel d'une réévaluation |
| `quoted` — un cours de bourse | *sans objet* | `stalenessOf` ignore déjà l'âge d'une ligne cotée : sa valeur est aussi fraîche que son cours |

Ces durées sont des **valeurs de départ**, au sens du `CLAUDE.md` : elles vivent dans
`lib/domain/settings.ts`, jamais en base. Les corriger plus tard corrigera rétroactivement toute
ligne dont personne n'a jamais tranché le sort. Elles ont été choisies par le propriétaire le
5 septembre 2026 ; ce ne sont donc pas des devinettes, et elles ne portent aucune marque « deviné ».

`stalenessOf` reçoit déjà le mode de la ligne. Le changement est local : le seuil se lit selon ce
mode au lieu d'être une constante. `awaitsValue` continue d'appeler `stalenessOf` plutôt que de
porter une seconde définition de « périmé » — deux définitions divergeraient le jour où un horizon
bouge.

## 2. Le geste « c'est toujours ça »

Une commande par ligne, qui inscrit la date du jour **sans changer le montant**.

**Elle n'apparaît que sur les lignes qui attendent réellement une valeur.** Celles du repli n'en ont
pas besoin, et l'écran ne peut pas s'offrir un élément de plus par ligne : deux tests e2e le tiennent
— une ligne de solde reste sous 100 px, et le relevé ne descend pas sous quatre lignes visibles sur
un téléphone (`e2e/smoke.spec.ts`).

**Aucune migration.** La colonne `figure_from` existe déjà sur `snapshot_lines`. Confirmer une
ligne, c'est écrire la date du relevé dans cette colonne pour cette ligne — ce que `saveSnapshot`
sait déjà faire. L'information « cette ligne a été confirmée » voyage donc dans le formulaire, à
côté des montants, et `figureFrom` reçoit un argument de plus : *le propriétaire a-t-il dit que ce
chiffre est encore le bon ?* Si oui, la date du jour, même à chiffre identique.

**Jamais de confirmation groupée.** Pas de « tout confirmer », pas de « rien n'a changé ». Un geste
global fabriquerait, en un clic, exactement les données non confirmées que ce projet refuse — et il
les rendrait indiscernables des vraies.

**Sa forme : une case à cocher dans la rangée de la ligne**, jamais un bouton à part. Un bouton
agirait sur-le-champ, donc écrirait en base ligne par ligne, hors de l'enregistrement du relevé ;
une case se coche, se décoche, et part avec le formulaire comme les montants. C'est aussi la forme
la moins coûteuse en hauteur, et la hauteur est ce que surveillent les deux garde-fous ci-dessus.

**Si la ligne est confirmée *et* son montant modifié, le montant l'emporte** — sans conflit : un
chiffre qui bouge donne déjà la date du jour. La case ne peut donc que rattraper le cas où le
chiffre ne bouge pas, ce qui est précisément le trou qu'elle vient combler.

Le geste est aussi disponible sur la fiche d'une ligne, où il tient enfin la promesse du 18 août.

## 3. Les cours frais sans y penser

La tâche passe du **1er du mois** au **quotidien**, les jours de bourse.

Vérifié dans la documentation Vercel le 5 septembre 2026 : toutes les offres, **y compris
l'offre gratuite**, autorisent 100 tâches planifiées par projet ; l'offre gratuite impose seulement
un minimum d'une exécution par jour et une précision à l'heure près (±59 min). Une tâche quotidienne
y entre donc sans surcoût, et l'imprécision horaire est sans effet ici.

`cachedPrice` reste inchangé : un cours n'est frais que le jour de sa récupération. Ce n'est plus un
problème dès lors que la récupération a lieu tous les jours, et c'est la définition la plus honnête
— la tolérance de quelques jours envisagée en variante aurait fait passer pour frais un cours vieux
d'une semaine, qui peut être faux de plusieurs pourcents.

**Ce qui ne change pas** : ouvrir l'écran de mise à jour n'appelle toujours pas le réseau. La règle
est tenue par `snapshot-page.test.ts`, et elle existe pour qu'une correction de dix secondes ne paie
pas le coût d'une session entière. Le bouton « Rafraîchir les cours » reste, comme geste explicite.

## Écarté, et pourquoi

**Faire que retaper le même chiffre vaille confirmation**, sans rien ajouter à l'écran. C'était la
solution la plus élégante, et c'est celle que la spec du 18 août annonçait. Elle est refusée ici :
Entrée avance au champ suivant (`handleKeyDown`, `SnapshotForm.tsx`), donc parcourir la liste au
clavier confirmerait toutes les lignes d'un bout à l'autre. Ce serait le « tout confirmer » interdit,
déguisé en raccourci — et invisible.

**Un réglage d'horizon par ligne.** Trois horizons par type couvrent le besoin réel. Un réglage par
ligne demanderait une colonne, donc une migration, pour une décision que personne n'a demandé à
prendre.

**Réduire l'horizon des comptes en dessous de trois mois.** Non demandé.

## Ce que ça ne fait pas

- **Le rangement des écrans reste entier.** « Mettre à jour » et « Mes lignes » continueront
  d'afficher la même liste. C'est l'étape 3.
- **Aucune valeur existante n'est réécrite.** Les horizons changent la façon de *lire* les dates
  déjà en base, pas les dates elles-mêmes. Une ligne immobilière datée de mai cessera d'être périmée
  sans qu'on ait touché sa donnée — c'est exactement l'effet rétroactif recherché.
- **Rien n'est confirmé à la place du propriétaire.** Aucune ligne ne change d'état sans un geste
  de sa part ; seul le seuil auquel on la lui redemande bouge.

## Les tests qui tiennent ces règles

- L'horizon suit le mode : une ligne immobilière datée de six mois n'est **pas** périmée, une ligne
  de solde du même âge l'est.
- Une confirmation à chiffre identique pose la date du jour ; **sans** confirmation, un chiffre
  identique garde son ancienne date. Les deux moitiés comptent : la seconde protège la règle
  d'origine.
- La commande de confirmation n'existe pas sur les lignes du repli.
- Les deux garde-fous de densité existants continuent de passer, l'ajout d'une commande par ligne
  étant précisément ce qu'ils surveillent.
- La tâche planifiée est quotidienne dans `vercel.json`.

## Ce que ça ne casse pas

Aucune migration, donc aucun ordre à respecter entre base et déploiement : la contrainte
« migration avant déploiement » du `CLAUDE.md` ne s'applique pas à ce chantier.
