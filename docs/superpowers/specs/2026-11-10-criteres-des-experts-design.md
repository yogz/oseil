# Les critères des experts : six retouches et un constat sur la bourse

*10 novembre 2026. Décidé avec Nicolas après l'avis de quatre spécialistes (deux conseillers en
gestion de patrimoine, un spécialiste de l'allocation d'actifs, un spécialiste de la finance
comportementale et de la frontière entre information et conseil). Complète
`2026-11-06-refonte-fonctionnement-design.md` et `2026-11-06-refonte-interface-design.md`, dont les
règles restent en vigueur.*

## Pourquoi

Nicolas a demandé si les objectifs de répartition suffisaient. Les spécialistes ont relevé que le
site, à quelques endroits, **conseille sans le vouloir**, ou rend la personne responsable de ce que
les marchés ont fait. Ils ont aussi noté qu'une action seule et un fonds qui suit 1 250 entreprises
ont la même couleur dans « Placements en bourse ». Ce lot corrige ces endroits, puis ajoute un
constat qui ne demande rien de plus à la personne.

Ce lot n'ajoute **aucune donnée enregistrée** et **rien de nouveau ne part en clair**.

**Non-objectifs** de ce lot, reportés : objectifs par zone, objectif de projet daté, ancienneté du PEA
et de l'assurance-vie, séparation de l'or et de la crypto, frais. **Anti-objectifs** : un seuil
(« trop concentré »), un verbe qui pousse (« pense à diversifier »), un nom de produit, une note.

## 1. Les exemples d'objectifs

Décidé par Nicolas le 10 novembre 2026, sur la proposition d'un conseiller en patrimoine :

| Exemple | Argent disponible | Épargne sécurisée | Placements en bourse | Or et crypto |
|---|---|---|---|---|
| Prudent | 40 (avant : 20) | 45 (avant : 60) | 15 | 0 (avant : 5) |
| Équilibré | 25 (avant : 15) | 25 (avant : 35) | 45 | 5 |
| Dynamique | 10 | 15 | 65 | 10 |

Pourquoi :
- Avec 20 % d'argent disponible, une personne prudente dont l'épargne est sur des livrets se voyait
  « pas à sa place » tant qu'elle avait moins d'environ 175 000 € hors logement (Livret A et LDDS
  pleins : 34 950 €, soit 20 % de 174 750 €). L'écran la poussait vers une assurance-vie. À 40 %, ce
  seuil descend à environ 87 000 €. Aucun chiffre ne supprime l'effet tant que l'épargne sécurisée
  n'est pas à 0 : on l'atténue.
- « Or et crypto » peut être entièrement du bitcoin. Pour quelqu'un qui n'en a pas, 5 % s'affichait
  « en dessous de ton objectif » : l'écran suggérait d'en acheter.
- Chaque poche évolue dans un seul sens de Prudent à Dynamique : le disponible et la sécurisée
  baissent, la bourse et l'or-crypto montent.

Ce qui change : la table `GOAL_PRESETS` de `lib/catalog.ts`. Les objectifs déjà enregistrés ne
bougent pas : un exemple n'est qu'un point de départ, recopié au moment où on le choisit. La phrase
« Ce sont des exemples, pas un conseil fait pour toi. » de l'écran des objectifs reste ; on n'en
ajoute aucune autre (Nicolas trouve déjà qu'il y a trop de texte).

La personne de l'exemple public (`lib/example/person.ts`) garde ses objectifs, qui étaient ceux de
l'ancien « Équilibré » ; seul son commentaire change, pour ne plus dire « Équilibré ». *(Choix de
Claude : l'exemple ne change pas d'histoire.)*

La spec de fonctionnement (« Exemples validés par Nicolas le 6 novembre 2026 ») reçoit la mention de
ce changement, avec sa date.

## 2. Le repère du coussin

« 3 à 6 mois : ce qu'on conseille souvent » devient **« 3 à 6 mois : le repère le plus courant »**.
Le verbe « conseille », sur un site qui ne conseille pas, citait une autorité anonyme. La spec
d'interface (§ 3, Repères) reçoit la mention de ce changement.

## 3. La phrase de tête de « Tes objectifs » (Évolution)

La phrase ne dit plus « tu », pour ne pas rendre la personne responsable d'un écart que les marchés
créent souvent :

| Cas | Avant | Après |
|---|---|---|
| moins de carrés pas à leur place qu'au premier relevé | « Tu t'en rapproches. Au premier relevé, … » | « L'écart se réduit. Au premier relevé, … » |
| plus | « Tu t'en éloignes. Au premier relevé, … » | « L'écart grandit. Au premier relevé, … » |
| autant | inchangé | inchangé |

La suite de la phrase ne change pas. Les mots des courbes par catégorie (« se rapproche »,
« s'éloigne », dont le sujet est la catégorie) ne changent pas. Les deux règles de
`lib/example/third-person.ts` qui tournaient « Tu t'en rapproches / éloignes » à la troisième personne
n'ont plus d'objet : elles sont retirées, et son test suit.

## 4. « Ce que tu peux récupérer vite » : le déblocage pour la résidence principale

Quand une part de ce qui n'est pas récupérable vite est dans un PER ou dans une épargne salariale
encore bloquée, la phrase de la section reçoit une phrase de plus, à la fin :

- PER seulement : « Un PER peut aussi se débloquer, dans certains cas, pour acheter ta résidence
  principale. »
- épargne salariale seulement : « L'épargne salariale peut aussi se débloquer, dans certains cas,
  pour acheter ta résidence principale. »
- les deux : « Le PER et l'épargne salariale peuvent aussi se débloquer, dans certains cas, pour
  acheter ta résidence principale. »

Vérifié le 10 novembre 2026 : l'achat de la résidence principale est un cas de déblocage anticipé du
PER (sauf la part alimentée par des versements obligatoires) et du PEE (une seule fois pour ce
motif). « Dans certains cas » couvre ces limites. Les cas déclencheurs sont ceux qui allument
aujourd'hui « attend ta retraite » (`retirement`) et « bloqué chez ton employeur » (`employer`) dans
`quickSentence` : la nouvelle phrase n'apparaît que quand l'une d'elles apparaît. Quand rien n'est
récupérable vite (« Rien de ce qui est à toi n'est récupérable vite pour l'instant. »), elle
n'apparaît pas. Elle apparaît aussi chez une personne déjà propriétaire : changer de résidence
principale est un des cas. *(Choix de Claude.)*

## 5. Le chapitre « Fonds monde »

Dans le détail de « Placements en bourse », quand au moins une ligne ouverte est rangée dans le
chapitre « Fonds monde », l'écran dit en petit :

> « Un fonds qui suit l'indice MSCI World place environ 7 euros sur 10 aux États-Unis (fiche MSCI du
> 30 septembre 2026). »

- Vérifié le 10 novembre 2026 : la fiche MSCI World du 30 septembre 2026 donne 72,94 % aux
  États-Unis. La phrase parle de l'indice MSCI World, pas de la ligne de la personne (qui peut suivre
  l'ACWI ou autre chose) : elle reste vraie quel que soit le fonds.
- C'est une phrase fixe, sans calcul. Elle porte sa date ; elle se relit une fois par an.
- Où : sous la rangée du chapitre « Fonds monde », visible quand le chapitre est ouvert, au-dessus de
  ses lignes. Quand la catégorie n'a qu'un chapitre (pas de chapitres affichés) et que ce chapitre est
  « Fonds monde », la phrase se place sous la liste des lignes. *(Choix de Claude.)*
- L'exemple public (`components/example/ExampleCategory.tsx`) la montre de la même façon.

## 6. La plus grosse action en direct (« Bon à savoir »)

*(L'avis des spécialistes proposait de garder la nature d'un titre dans le profil. La réponse des
cours la donnant déjà, rien n'est gardé : c'est plus simple, et aucune donnée nouvelle n'est à faire
valider.)*

Un constat de plus dans « Bon à savoir » (onglet Repères) :

> « Ta plus grosse action en direct, Air Liquide, occupe 9 de tes 30 carrés de bourse. »

### D'où vient « action »

Le site ne garde pas la nature d'un titre et ne la redemande pas. **La réponse des cours la donne
déjà** : la source des prix (`query1.finance.yahoo.com/v8/finance/chart`, lue par `fetchQuote` dans
`lib/market/yahoo.ts`) renvoie un champ `instrumentType` (vérifié le 10 novembre 2026 : `ETF` pour
CW8.PA, `EQUITY` pour AI.PA). On le lit avec la même table que la recherche (`KINDS` : `EQUITY` →
`action`, `ETF` → `ETF`, `MUTUALFUND` → `fonds`, le reste → rien).

- `Quote` (`lib/market/types.ts`) reçoit un champ facultatif `kind`, avec les trois mêmes valeurs que
  `SecurityMatch['kind']`. `fetchQuote` le remplit quand Yahoo le donne ; `parseQuote` le garde
  seulement s'il est l'une des trois valeurs, et l'ignore sinon (le cours reste valable).
- **Rien de nouveau ne part en clair** : la demande de cours envoie les mêmes symboles qu'aujourd'hui.
  Seule la réponse du site au navigateur porte un mot de plus. Rien n'est enregistré : ni dans le
  profil, ni dans les relevés, ni dans le cache du navigateur au-delà de ce qu'il garde déjà des cours.
  Les relevés, l'export et l'import ne changent pas.
- Les réponses déjà en cache côté serveur (sans `kind`) restent valables jusqu'à leur expiration.

### Quelles lignes comptent

Une ligne compte comme **action en direct** si, et seulement si :
- elle est ouverte et a une valeur dans le dernier relevé (aux prix du jour quand ils sont là, comme le
  reste de Repères) ;
- elle est dans la catégorie « Placements en bourse » de la grille ;
- elle est suivie (`quoteSymbol`) **et** la réponse des cours du jour pour ce symbole dit
  `kind: 'action'`. Une réponse reçue suffit, même quand son **prix** n'est pas utilisé (cours plus
  ancien que le relevé, après une mise à jour faite un week-end ; plus de sept jours ; pas de taux) :
  la nature d'un titre ne dépend pas de la date de son prix. *(Choix de Claude.)*

Le type de compte ne compte pas : une action de son employeur suivie dans une épargne salariale est
une action d'une seule entreprise, et c'est précisément le cas que les spécialistes voulaient voir.
*(Choix de Claude.)* « Bon à savoir » peut alors nommer l'employeur deux fois, une fois pour
l'épargne placée chez lui, une fois pour l'action : ce sont deux constats différents.

Tout le reste ne compte jamais comme une action : un fonds, un ETF, une unité de compte (saisie par
son total, elle n'a pas de symbole), une ligne sans symbole, une ligne dont le cours n'est pas
arrivé. On ne devine pas d'après le nom.

Les lignes d'un même symbole (Air Liquide au PEA et au nominatif) s'additionnent. Le nom affiché est
celui de la ligne la plus grosse de ce symbole. *(Choix de Claude : le symbole est plus sûr que le
nom.)*

### Ce qui est dit

- La plus grosse action, par **carrés** : la somme des carrés de ses lignes dans la grille
  (`lib/model/squares.ts`), sur les carrés de la catégorie « Placements en bourse ». Égalité de
  carrés : la plus grosse valeur. Les carrés suivent la grille : le constat ne contredit jamais les
  carrés affichés.
- Phrase : « Ta plus grosse action en direct, {nom}, occupe {n} de tes {N} carrés de bourse. » ;
  « 1 de tes {N} carrés » au singulier ; « occupe tous tes carrés de bourse » quand n = N.
- **Pas de constat** si aucune ligne ne compte, ou si la plus grosse action a moins d'un carré
  (« moins d'un carré » n'apprendrait rien). *(Choix de Claude.)*
- **Toujours montré** dès qu'il y a une action d'au moins un carré : aucun seuil, aucun « trop »,
  aucun verbe qui pousse. C'est la condition que le spécialiste de la réglementation pose pour rester
  une information : un seuil choisi par le site, une alerte ou une incitation à vendre en feraient
  un conseil.
- Place : après les constats existants (la maison, la même valeur sur plusieurs comptes,
  l'employeur). Les montants masqués ne changent rien : la phrase ne dit aucun montant.
- **Quatre constats au plus** (décidé par Nicolas le 10 novembre 2026). Aujourd'hui la vue en garde
  trois (`facts.slice(0, 3)` dans `lib/screens/reperes.ts`, et le test « at most three facts… »).
  Elle en garde désormais quatre, dans l'ordre : la maison, la même valeur sur plusieurs comptes,
  l'employeur, l'action. Le constat sur l'action n'est donc jamais coupé. La spec d'interface (§ 3,
  « Deux ou trois faits ») reçoit la mention de ce changement.

**Limite connue.** Sans les cours du jour (réseau coupé, source indisponible), aucune ligne n'a de
`kind` : le constat n'apparaît pas. C'est une absence, pas un chiffre faux. Si c'était le seul
constat, « Bon à savoir » dit alors « Rien de particulier à signaler pour l'instant », comme
aujourd'hui sans action.

## Vérifications

`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e` et
`npm run test:e2e:prod` (CLAUDE.md). Rien ne touche la base : pas de migration, pas de `test:rls`.

## Ce qui reste au constructeur

L'emplacement exact des mots (fichiers `*-words.ts` existants), les tests à écrire, la forme du champ
de note du chapitre dans la vue (`DetailChapter` ou vue de la catégorie).
