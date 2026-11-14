# À compléter

Décidé avec Nicolas le 12 novembre 2026, sur planches (rangées 5 et 6 de « Planches Réglages »,
https://claude.ai/artifact/6EU7f8vw6aZYasm8ShE17x). Ce document fait foi pour cette fonction.

## Pourquoi

Les repères d’Oseil (ce qu’on récupère vite, la performance depuis l’achat, « D’où ça vient ») sont aussi justes
que les réponses de la personne. Aujourd’hui, les trous sont éparpillés (« 1 ligne sans prix » au fond de la page
Bourse) ou invisibles (un crédit relié à aucun logement ne se signale nulle part). La personne ne sait pas ce
qu’une minute de sa part améliorerait. Le but : **montrer ce qui vaut la peine d’être complété, au bon moment,
sans en faire une corvée.**

## Ce qui est décidé (par Nicolas)

- **Deux étages** : une liste complète quelque part, et des rappels là où le trou se voit, y compris pendant la
  mise à jour (« un peu des deux »).
- **La liste vit en bas de Repères**, dans un bloc « À compléter » (planche 5B) : les **trois** trous les plus
  utiles, chacun sur une rangée « › » avec ce qu’il apporte, puis « Voir les N autres » qui déplie le reste sur place.
- **Les rappels au bon endroit** (planche 6) : une ligne sur la page de la catégorie concernée
  (« Ajoute leur prix d’achat pour les compter › ») ; pendant la mise à jour, sous la ligne concernée, une
  proposition légère (« Tu as son prix d’achat sous les yeux ? Ajouter ») qu’on peut ignorer.
- Proposé par Claude et accepté par Nicolas :
  - on peut répondre **« Je ne sais pas »** (ou « pas concerné ») et le trou quitte la liste : sinon elle ne
    pourrait jamais se vider ;
  - **quand tout est complété, le bloc disparaît** : pas de score, pas de pourcentage, pas de badge ;
  - **le ton complice** : chaque trou dit ce qu’il apporte, jamais un reproche (mémoire « Ton complice ») ;
  - les plus gros montants d’abord.

## Les trous (première version)

Vérifié dans le code le 12 novembre 2026 (inventaire des fichiers ci-dessous). Chaque trou : ce qui le révèle,
ce qu’il apporte, où le remplir.

1. **Un titre sans prix d’achat.** Seulement dans « Placements en bourse », la seule catégorie qui montre un gain
   depuis l’achat (`tellsGain`, `lib/screens/category-detail.ts:303`), et jugé sur l’entrée du **dernier état**,
   exactement comme ce fichier le fait déjà pour « hors N lignes » (`snapshot.entries.find`, l. 309-327 ; un coût nul
   compte comme manquant). Apporte : « pour savoir ce que tes placements ont vraiment rapporté ». Se remplit sur la
   fiche de la ligne (`/ligne/[id]`, `FiguresEdit`) ou pendant la mise à jour (`UnitsRow`).
2. **Un titre qui ne suit pas son cours.** Exactement les lignes que `/titres` liste sans symbole : `kind === 'units'`,
   ouvertes, d’un compte où `canFollowPrice` est vrai, sans `quoteSymbol` (`titleRows`, `lib/screens/titles.ts:25-42`).
   Apporte : « pour qu’il se mette à jour tout seul ». Se remplit sur `/titres` ou la fiche de la ligne.
3. **Une ligne jamais rangée.** Ce que `rangingView` (`lib/screens/ranging.ts:24-52`) considère comme jamais rangé :
   `group` absent, **ou** un `group` qui n’appartient pas à la catégorie de la ligne (l. 33-37). Une ligne rangée en
   « Je ne sais pas » (`group: 'unknown'`) a déjà répondu et n’est pas un trou. Apporte : « pour voir où ta bourse
   est placée dans le monde » (ou par type, hors bourse). Se remplit sur `/categorie/[id]/ranger`.
4. **Une épargne salariale sans date de déblocage.** `Account.unlockOn` absent sur un compte `employee-savings` —
   seul type qui en porte une (`setUnlockYear`, `lib/correct/profile-changes.ts`) ; **un PER n’en a pas**. Sans
   date, Repères la compte bloquée (`isQuick`, `lib/screens/reperes.ts`). Apporte : « pour savoir quand cet argent
   se libère ». Se remplit sur la fiche de la ligne (rangée « unlock »).
5. **Un crédit relié à aucun logement**, seulement **quand le profil a au moins un logement** auquel le relier
   (`Account.financedLineId` absent sur un compte `loan`) : un crédit auto ou à la consommation n’a pas de logement,
   et ce n’est pas un trou. Aujourd’hui rien ne le signale (« aucun » sur la fiche). Apporte : « pour que ton
   logement soit compté net de son crédit ». Se remplit sur la fiche de la ligne (`setFinanced`).

Choix de Claude, hors première version :
- **les versements inconnus** (assurance vie, PER, épargne salariale). On ne peut les saisir que pendant une mise à
  jour (`ContributionField`), jamais après coup, et un versement de 0 n’est pas enregistré (`setContribution`,
  `lib/update/lines.ts:123-127`) : quelqu’un qui n’a rien versé ne pourrait jamais fermer ce trou. La phrase
  d’Évolution reste comme elle est ; régler le « 0 » est un chantier à part ;
- les banques pas revues et la date de l’estimation du logement (déjà dites sur Mon argent, et c’est le travail du
  rappel de mise à jour) ;
- le taux d’achat d’une ligne en devise (le site le calcule déjà depuis les relevés, sans vrai trou à signaler).

## L’ordre et le nombre

- **Un trou = une rangée par sujet, pas par ligne** (choix de Claude pour les destinations, aucun nouvel écran) :
  - titres sans prix d’achat : la fiche du titre s’il n’y en a qu’un ; sinon la page « Placements en bourse », qui
    marque déjà chaque ligne « prix d’achat manquant » ;
  - titres sans cours : `/titres` ;
  - lignes jamais rangées : `/categorie/[id]/ranger` de leur catégorie (une rangée par catégorie concernée) ;
  - épargne salariale sans date, crédit sans logement : une rangée par compte, vers sa fiche (ils sont rares).
- **Ordre** : par montant en jeu (la valeur des lignes concernées), le plus gros d’abord. Choix de Claude : à
  montant égal, l’ordre de la liste ci-dessus.
- **Trois rangées visibles**, le reste derrière « Voir les N autres » (déplié sur place, pas un autre écran).
- **Rien à compléter : pas de bloc du tout.** Jamais « Tout est complet ! ».

## « Je ne sais pas »

- Chaque trou qui peut ne pas avoir de réponse se ferme par « Je ne sais pas » **là où on le remplit** (la fiche,
  l’écran de rangement), pas dans la liste elle-même : la liste reste une liste de liens (planche 5B).
- La réponse est gardée **dans le profil**, chiffré, comme un choix de la personne (précédent : `group: 'unknown'`).
  Choix de Claude, à affiner dans le plan : un champ optionnel par sujet sur la ligne ou le compte concerné, au
  plus près de la donnée (`Line`, `Account`), avec son parseur dans `lib/model/documents.ts`. Rien de nouveau ne
  part en clair : tout est dans le document chiffré.
- Ce que chaque réponse veut dire (choix de Claude) :
  - **prix d’achat** : « Je ne sais pas » ; la ligne reste hors du gain depuis l’achat, comme aujourd’hui ;
  - **cours** : « Pas coté » (un fonds non coté, un produit maison) ; la ligne reste en saisie manuelle ;
  - **rangement** : « Je ne sais pas » existe déjà (`group: 'unknown'`) ;
  - **date de déblocage** : « Je ne sais pas » ; Repères continue de la compter comme bloquée (`isQuick`), parce
    qu’on ne promet pas un argent disponible sans le savoir ;
  - **crédit** : « Ce crédit ne finance pas de logement ».

## Les rappels au bon endroit

- **Page d’une catégorie** : sous la performance, une rangée « › » pour le trou de cette catégorie quand il y en a
  un (titres sans prix d’achat, lignes pas rangées). Une seule rangée, celle du plus gros montant.
- **Mise à jour d’une banque** : pour une ligne de bourse sans prix d’achat, le bouton qui existe déjà
  (« Les parts ou le prix moyen ont changé ? », `components/update/UnitsRow.tsx:149-163`, qui ouvre la même case)
  dit à la place « Tu as son prix d’achat sous les yeux ? » ; pour les autres lignes, rien ne change. Rien n’est
  obligatoire, rien ne bloque « Banque suivante ».
- **L’exemple** n’a pas de page Repères (vérifié : `app/(exemple)` n’a que Mon argent, une catégorie, Évolution) ;
  sa personne inventée n’a pas de trou. Rien n’y change (choix de Claude).

## Non-objectifs

- Pas de score de complétude, de pourcentage, de badge ni de pastille.
- Pas de notification ni d’e-mail.
- Pas de saisie dans la liste elle-même (pas de formulaire dans Repères).
- Pas de nouveau champ envoyé au serveur.

## Ce qui prouve que ça marche

- Une fonction pure `lib/screens/to-complete.ts` (le profil, les états, la date → les trous rangés), testée sans
  navigateur pour chacun des cinq trous, l’ordre, le « Je ne sais pas », le bloc vide.
- Les tests des écrans : Repères (trois rangées, « Voir les N autres », pas de bloc quand rien), page d’une
  catégorie, mise à jour.
- Un parcours e2e : un compte avec un titre sans prix, Repères montre le trou, on l’ajoute sur la fiche, le trou
  disparaît.
