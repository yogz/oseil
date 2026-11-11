# Résidence principale, secondaire, investissement locatif — conception

Décidé avec Nicolas le 10 novembre 2026, sur planche (`.superpowers/brainstorm/73677-1794296781/content/
immobilier-locatif.html`), après avis d’un panel (patrimoine des particuliers, UX, UI, direction artistique).
« (proposition) » marque un choix de Claude ou du panel que Nicolas a validé sans le trancher lui-même.

## Pourquoi

Aujourd’hui tout logement est « ta maison » : l’immobilier entier est hors objectifs et les textes disent « ta
maison ». Or un logement peut être une résidence secondaire ou un investissement locatif. Nicolas veut que
l’investissement locatif soit un placement qu’on pilote, comme la bourse.

## Décisions de Nicolas

1. Chaque logement a un type : **résidence principale**, **résidence secondaire**, **investissement locatif**.
2. La résidence principale et la résidence secondaire restent **hors objectifs** (« Chez toi »).
3. L’investissement locatif **entre dans les objectifs** : une part qu’on pilote, à côté de l’argent disponible, de
   l’épargne sécurisée, des placements en bourse et de l’or et crypto.
4. L’affichage de la planche (option du panel) : une seule couleur pour l’immobilier ; deux poches dans les calculs.

## Le modèle (propositions)

- Le type vit sur le compte de type `home` (champ facultatif, scellé dans le profil comme le reste : rien ne part
  en clair). Absent : « résidence principale » (tous les logements actuels le deviennent ; Nicolas corrige les
  siens).
- Deux poches : **« Chez toi »** (principale + secondaire) et **« En location »** (locatif). Chaque poche est nette
  de **ses** crédits : un crédit (`financedLineId`) est déduit du logement qu’il finance, donc de sa poche.
- **Une poche n’est jamais déduite de l’autre.** Un locatif qui vaut moins que son crédit (fréquent les premières
  années) n’a aucun carré et le dit (« Ton logement en location vaut moins que ce qu’il reste à rembourser : pas de
  carré pour l’instant. ») ; il n’entame jamais les carrés « Chez toi ». Même règle à l’inverse. Le total des
  carrés fait toujours 100 ; « Une réponse qu’on ne peut pas donner se dit ».
- La catégorie reste `property` (une couleur, `cat-property`) ; les poches sont des sous-groupes (le constructeur
  choisit : chapitres existants `GroupId`, ou un champ dérivé du type de compte).

## Les objectifs

- Une cinquième part d’objectif : **« Immobilier locatif »**, en dernier (du plus liquide au moins liquide).
- La place des objectifs = 100 − les carrés « Chez toi » (au lieu de 100 − tout l’immobilier).
- Les objectifs déjà enregistrés n’ont pas cette part : elle vaut 0 (lecture tolérante, aucune réécriture forcée).
  Les modèles « Prudent / Équilibré / Dynamique » gagnent une part locatif à 0 (proposition).
- L’éditeur d’objectifs montre la cinquième ligne **seulement si la personne a un logement en location**
  (proposition) ; sinon rien ne change pour elle. Sous la ligne, une note discrète : « Un logement ne se vend pas
  par carré : cet objectif guide surtout où va ton argent neuf. »
- « Montre-moi mes objectifs » : seuls les carrés pilotés changent, locatif compris ; les carrés « Chez toi » ne
  bougent jamais.
- L’historique des objectifs (Évolution) reste juste avec l’ancienne et la nouvelle forme.

## L’écran

- **Mon argent** : la rangée Immobilier se découpe en deux sous-lignes discrètes (carré 8 px, `ink-muted`),
  seulement si la personne a un locatif : « Chez toi · pas d’objectif » et « En location · <écart à l’objectif> ».
  Sans locatif : rien ne change.
- **La grille** : même couleur ; les carrés du locatif viennent juste après les catégories pilotées, ceux de « Chez
  toi » en dernier (le haut de la grille = ce qu’on pilote, le bas = ce qu’on habite). Le constructeur vérifie
  l’ordre de remplissage actuel (`lib/model/squares.ts`) et l’adapte.
- **La phrase d’en-tête** : « Hors ta maison, … » devient « Hors chez toi, … » ; « pas d’objectif pour ta maison »
  devient « pas d’objectif pour chez toi » ; la phrase « rien à comparer » : « Tes objectifs portent sur ce qui
  n’est pas chez toi : rien à comparer pour l’instant. » Les mots exacts restants sont au constructeur, dans le ton.
- **Détail Immobilier** : deux groupes, « Pour y vivre » (principale, secondaire ; « pas d’objectif ») et « En
  location » (valeur nette, écart à l’objectif). Toucher un carré ouvre le groupe auquel il appartient.
- **Fiche d’un logement** : une rangée « Type » (Résidence principale / secondaire / Investissement locatif),
  modifiable comme les autres rangées de la fiche.
- **Premier lancement** : « Ma maison » = résidence principale ; « Un autre logement » demande son type
  (secondaire ou locatif) au moment de l’ajouter (proposition).
- **Inchangés** : le coussin et « Ce que tu peux récupérer vite » excluent tout l’immobilier.

## Ce qui suit le changement ailleurs (à vérifier par le constructeur, rien à oublier)

- L’export / import Excel (`lib/transfer/`, format dans `format.ts`) : une colonne « Type de logement » dans
  Comptes, une colonne « Immobilier locatif (%) » dans Objectifs ; ancien fichier sans ces colonnes = principale
  et 0 ; les consignes « Pour une IA » et les refus suivent (mécanisme REFUSALS).
- L’exemple (`lib/example/`, à la troisième personne) : rien à changer obligatoirement ; s’il reste cohérent.
- Les tests de l’aller-retour d’export.

## Anti-objectifs

- Un logement d’une poche qui se déduit de l’autre en silence.
- Une sixième couleur.
- Une rangée de plus ou des chiffres en plus pour quelqu’un qui n’a pas de locatif.
- Des objectifs existants réécrits ou cassés.

## Précisions après relecture du code (10 novembre 2026, choix de Claude, marqués comme tels)

- **Porter les poches** : `situation.categories` garde une seule entrée `property`, avec un champ en plus
  `pockets` (« chez-toi » / « location » : valeur nette et lignes de chacune). Pas de chapitres (`GroupId` est le
  choix de la personne et sert à la bourse) ; pas de deux entrées `property` (une quinzaine de lecteurs cherchent
  la catégorie par `find`). Une poche négative va dans une liste d’exclusions au niveau de la poche, avec sa
  phrase.
- **Lignes d’immobilier hors compte « Logement »** (un « Autre compte » rangé en Immobilier) : poche « Chez toi »,
  hors objectifs, comme aujourd’hui (choix de Claude).
- **Dans une poche**, les logements se compensent (deux locatifs, l’un sous son crédit, l’autre au-dessus : la
  poche est leur somme nette).
- **La rangée Immobilier de Mon argent** montre ce que montrent ses carrés : la somme des poches positives ; une
  poche négative est dite par sa phrase, jamais retranchée en silence.
- **Valeur nette ≤ 0** (aucune grille) : règle actuelle inchangée.
- **La clé d’objectif** s’appelle `rental` ; `GoalCategory` n’est plus un sous-ensemble de `CategoryId`. Les cinq
  copies de la liste des catégories d’objectifs (`documents.ts`, `transfer/format.ts`, `model/goals.ts`,
  `setup/goals-editor.ts`, `screens/evolution.ts`) passent par une seule constante. Un objectif enregistré sans
  `rental` se lit avec 0 (jamais « illisible »). Dans la grille et les couleurs, `rental` prend `cat-property`.
- **Grille** : dans l’immobilier, les lignes du locatif avant celles de « Chez toi » (aujourd’hui l’ordre des
  relevés) ; `cellsOf` remplit déjà l’immobilier en dernier.
- **Le type de logement** : champ facultatif de `Account`, accepté seulement pour `type: 'home'` (refusé ailleurs
  par `parseAccount`, effacé si le compte change de type).
- **Changer le type d’un logement s’applique aussi aux relevés passés** (le type décrit le logement, pas un
  moment) : l’historique des objectifs de l’Évolution est recalculé comme si le logement avait toujours eu ce
  type (choix de Claude, dit dans la fiche : « s’applique à tout l’historique »).
- **L’éditeur d’objectifs** montre la ligne « Immobilier locatif » si la personne a un locatif **ou** si son objectif
  en vigueur en a une part > 0 (sinon la somme ne ferait plus 100).
- **Premier lancement** : « Un autre logement » demande son type dans l’écran d’ajout du logement lui-même (deux
  choix : résidence secondaire, investissement locatif), pas un écran de plus.
- **Les phrases de « ta maison »** (`excludedSentence`, `noGridSentence`, `allForHomes`, la révélation) sont
  revues pour parler de « chez toi » ou du logement en location selon le cas.

## Vérification

Tests purs (poches, crédits, locatif négatif, place des objectifs, anciens objectifs sans part locatif, ordre de
la grille), tests d’écran (sous-lignes, éditeur, simulation, détail, fiche), export/import aller-retour, puis
`npm test`, `npm run lint`, `npx tsc --noEmit`, `bash scripts/check-design.sh`, `npm run build`,
`mise exec -- npm run test:e2e:prod`.
