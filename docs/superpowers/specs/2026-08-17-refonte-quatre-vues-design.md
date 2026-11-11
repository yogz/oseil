# Refonte : quatre vues, une identité

Spécification de conception — 17 août 2026

## Pourquoi

L'application répond aujourd'hui à trois questions, sur cinq écrans hérités du fichier Numbers
qu'elle a remplacé. Elle est exacte, mais elle ne dit pas ce qui compte : *suis-je correctement
exposé, est-ce que j'optimise ma fiscalité, que puis-je mobiliser, et qu'est-ce qui ferait mal si
ça tournait mal.* Son apparence, par ailleurs, n'a jamais été choisie — elle a été déduite d'un
audit de lisibilité.

Cette refonte réorganise l'application autour de **quatre vues complémentaires**, chacune répondant
à une question, plus un accueil qui suit l'évolution du patrimoine. Elle lui donne aussi une
identité graphique délibérée.

Elle ne change rien à ce que l'application refuse de faire : ni budget, ni connexion bancaire, ni
temps réel, ni conseil.

## Les cinq écrans de consultation

| Écran | La question | Périmètre de calcul |
|---|---|---|
| **Accueil** | Mon patrimoine progresse-t-il, et grâce à quoi ? | Patrimoine total |
| **Classes** | Suis-je correctement exposé au risque ? | Pilotable (hors résidence principale) |
| **Enveloppes** | Est-ce que j'optimise ma fiscalité ? | Pilotable |
| **Liquidité** | Combien puis-je mobiliser, et sous quel délai ? | **Patrimoine total** |
| **Risques** | Qu'est-ce qui ferait mal si ça tournait mal ? | Pilotable, sauf une mesure |

Le choix des périmètres est délibéré et doit être affiché sur chaque écran. La résidence principale
écraserait les trois vues d'allocation — personne ne revend 10 % de son logement pour rééquilibrer
un portefeuille. Mais elle est indispensable à la vue Liquidité, dont la question porte justement
sur ce qui est immobilisé. C'est le prolongement direct de la distinction « deux périmètres » déjà
en place.

Les écrans de gestion, rarement ouverts, vivent derrière un bouton **Gérer** : Nouveau relevé,
À qualifier, Mes lignes, Journal, Réglages, Déconnexion.

Sur téléphone, les cinq écrans de consultation forment la barre du bas ; « Gérer » est en haut.

## Le modèle de données

### Trois attributs par ligne, avec leur source

Chaque ligne du patrimoine reçoit trois informations qui n'existent nulle part aujourd'hui. Chacune
porte sa **source** : `devine` ou `confirme`.

**Délai de sortie** — cinq valeurs : `48h`, `1mois`, `1an`, `5ans`, `bloque`.

Définition, qui doit figurer dans l'interface : *le délai pour disposer de cet argent sur son compte
courant, sans pénalité ni perte fiscale majeure.* Ce n'est pas le délai technique de vente. Un PEA
de moins de cinq ans se vend en trois jours mais se clôture si l'on retire : son délai de sortie est
`5ans`, pas `48h`.

**Répartition géographique** — une ou plusieurs zones avec leur part, dont la somme fait 100 % :
`france`, `europe-hors-france`, `etats-unis`, `developpe-autre`, `emergents`, `sans-objet`.

Une valeur unique serait fausse là où ça compte le plus. Classer un ETF Monde entièrement en
« monde » rendrait l'exposition France affichée mensongère — or c'est le chiffre central de la vue
Risques. Les lignes non cotées (un livret, un appartement) portent une seule zone à 100 %, donc
n'exigent aucun travail. Les lignes cotées reçoivent un **modèle pré-rempli** ajustable (« ETF Monde
standard : 65 % États-Unis, 12 % Europe, 6 % Japon, 10 % émergents, 3 % France »).

**Émetteur** — texte libre avec suggestions (Amundi, BlackRock, Vanguard…), plus un drapeau
booléen **lié à mon employeur**.

### Ce que l'application devine, et comment elle le dit

Les valeurs par défaut se déduisent de la classe d'actif et de l'enveloppe. Une ligne jamais
confirmée reste marquée `devine`.

Règles de déduction du délai de sortie, à titre indicatif — elles vivront dans un module unique,
documenté, et sont toutes corrigibles :

| Enveloppe / classe | Délai deviné |
|---|---|
| Comptes courants, livrets | `48h` |
| Monétaire, compte-titres ordinaire | `1mois` |
| Assurance-vie | `1an` |
| PEA, PEA-PME, Girardin, dette privée | `5ans` |
| Immobilier locatif, private equity | `5ans` |
| PER, PEE | `bloque` |
| Résidence principale | `bloque` |

**Le marquage est structurel, pas décoratif.** Toute vue affichant un chiffre dérivé d'attributs
devinés doit l'indiquer visiblement, avec le nombre de lignes concernées. Le risque principal du
choix « défaut deviné » est qu'un défaut jamais corrigé finisse par passer pour un fait. Un test
échoue si une vue calcule sur des attributs devinés sans afficher ce marquage.

### Les six poches remplacent les cinq actuelles

| Poche | Classes d'actifs regroupées |
|---|---|
| Monétaire EUR | liquidités, monétaire EUR |
| Monétaire devises | monétaire en devises |
| Obligataire & dette | obligations, dette privée |
| Actions | actions Europe, US, Monde, Émergents |
| Immobilier | immobilier locatif |
| Alternatif | private equity, matières premières, Girardin |

Deux différences avec les cinq poches actuelles. L'immobilier **sort** du fourre-tout « actifs
réels » : c'est la poche qui doit crier dans la vue Risques, elle ne peut pas être diluée avec l'or
et le non coté. Le monétaire en devises **garde** sa poche isolée : fondu dans la sécurité euro, un
pari sur le dollar deviendrait invisible.

Conséquence assumée : les cibles saisies sur les cinq poches actuelles sont perdues et doivent être
ressaisies une fois, sur un écran unique.

### Un régime fiscal par enveloppe

Quatre valeurs : `exonere`, `abattement`, `differe-bloque`, `taxe`. C'est ce qui permet le
groupement de la vue Enveloppes. La donnée appartient à l'enveloppe, pas à la ligne.

### La liste des enveloppes doit être complétée

Les enveloppes existantes désignent des **établissements** (Boursobank, Hello Bank, Revolut) autant
que des **régimes** (PEA, PER, PEE). La vue Enveloppes raisonne en régimes : trois manquent
aujourd'hui et doivent être ajoutés — **assurance-vie**, **compte-titres ordinaire**, **Girardin**.

Les enveloppes bancaires conservent leur nom d'établissement et reçoivent toutes le régime `exonere`
ou `taxe` selon qu'il s'agit d'un livret réglementé ou d'un compte courant. Le regroupement
d'affichage se fait par régime, donc quatre comptes bancaires n'encombrent pas la vue.

L'étape B commence par une passe de rattachement : chaque ligne existante est reliée à la bonne
enveloppe, et l'écran À qualifier signale toute ligne restée sur une enveloppe générique.

### Réglages

Trois réglages, tous saisis à la main, tous modifiables, tous affichés comme des choix et non comme
des vérités :

- **Dépenses mensuelles** — un montant unique. L'application ne suit pas les dépenses et ne le fera
  pas ; ce chiffre est déclaré, pas calculé. Sans lui, la vue Liquidité affiche un montant
  mobilisable mais aucun nombre de mois.
- **Quatre seuils de vigilance** — France 30 %, émetteur unique 20 %, ligne la plus grosse 20 %,
  employeur 10 %. Valeurs de départ, affichées comme telles.
- **Cibles d'allocation** — une par poche, sur le périmètre pilotable.

## Les quatre vues

### Vue 1 — Classes

Une **grille de cent carrés**, un par pourcent du périmètre pilotable, colorée par poche et
ordonnée de la plus lourde à la plus légère.

Sous la grille, la **bande d'écart** : une rangée de carrés rayés (ce qui est en trop) et une rangée
de carrés en contour vide (ce qui manque), avec la phrase qui résume tout — *« 14 carrés sur 100
sont au mauvais endroit »*.

Règles de calcul :

- La part d'une poche est arrondie à l'entier. La somme doit valoir exactement 100 : le reste
  d'arrondi est reporté sur la poche la plus lourde. Un test vérifie que la grille comporte
  toujours cent carrés, quelles que soient les valeurs.
- L'écart d'une poche est `réel − cible`, en points. La somme des excédents égale toujours la somme
  des manques ; c'est ce nombre unique qui s'affiche.
- Une poche à zéro reste présente dans la légende : « tu ne détiens rien ici » est une information.

### Vue 2 — Enveloppes

Des **barres horizontales**, une par enveloppe, **groupées par régime fiscal** et non par taille.
Chaque groupe affiche son total et sa part. Chaque barre porte son montant et une étiquette en
clair (« exonéré après 5 ans », « flat tax 30 % »).

La réponse à « est-ce que j'optimise ma fiscalité » se lit dans les titres des groupes avant même
qu'une barre soit lue. Un encart met en avant le montant logé dans le régime le moins favorable.

Aucune cible n'existe sur les enveloppes, et il n'y en aura pas : l'allocation se pilote par classe
d'actif, la fiscalité se constate.

### Vue 3 — Liquidité

Une **échelle unique**, lue de gauche à droite, du plus liquide au plus bloqué. Cinq segments de
largeur proportionnelle, un par délai de sortie. Le **seuil de précaution** — les dépenses
mensuelles multipliées par six — est posé dessus en trait plein.

C'est la seule vue calculée sur le patrimoine total : la question porte sur ce qui est mobilisable,
et la résidence principale est précisément ce qui ne l'est pas.

Sous l'échelle, le détail par poche de délai, puis les deux chiffres qui valent un graphique :

- **Épargne de précaution** = montant à délai `48h` ÷ dépenses mensuelles, en mois.
- **Actif réellement productif** = (patrimoine total − résidence principale) ÷ patrimoine total.

Le nuage de points à deux axes évoqué initialement est abandonné : illisible sur téléphone, qui est
l'appareil de consultation principal. L'information — montant, délai, classe — est intégralement
préservée par l'échelle et le détail qui la suit.

### Vue 4 — Risques

Des **jauges à seuil**, triées par gravité : celles qui dépassent leur seuil d'abord. Chaque jauge
porte sa valeur, son seuil marqué d'un trait, et l'écart en points.

Cinq mesures :

| Mesure | Calcul | Périmètre |
|---|---|---|
| Exposition France | Σ (valeur × part France) ÷ pilotable | Pilotable |
| Émetteur unique | max par émetteur ÷ pilotable | Pilotable |
| Ligne la plus grosse | max par ligne ÷ pilotable | Pilotable |
| Lié à l'employeur | Σ lignes marquées ÷ pilotable | Pilotable |
| Part liée à la résidence | résidence ÷ patrimoine total | **Total**, sans seuil |

La dernière n'a pas de seuil et ne doit pas en recevoir : posséder son logement n'est pas un défaut,
c'est un fait dont il faut connaître le poids.

Un encart de synthèse énonce le risque **cumulé** quand plusieurs mesures pointent la même cause —
typiquement logement, locatif et employeur tous en France.

## L'accueil

La courbe du patrimoine, et rien d'autre. Trait plein pour un relevé confirmé, pointillé pour un
relevé estimé : le principe existe déjà et il est bon, l'application ne doit jamais laisser croire à
une précision qu'elle n'a pas.

Sous la courbe, le partage **versé / gagné** sur douze mois, qui répond à « grâce à quoi ».

En bas, les quatre questions — mais **chacune affiche déjà sa réponse en un chiffre** (« 14 points
d'écart », « 8,2 mois », « 2 alertes »). Ce n'est pas un menu : on ne clique que pour comprendre
pourquoi.

L'avertissement existant reste : si aucun versement n'a été journalisé sur la période, la part
« performance » n'est pas fiable et le dit.

## Saisie et qualification

**Le rituel mensuel ne change pas de nature.** Valeurs pré-remplies, cours automatiques pour les
lignes cotées, correction à la main de la douzaine de champs qui ne se cotent pas, versements et
retraits, enregistrement. Cinq minutes.

La qualification vit **ailleurs**, dans un écran **À qualifier** qui n'apparaît dans « Gérer » que
lorsqu'il reste du travail, avec son compteur. On y qualifie quand on veut, pas quand l'application
le décide. En attendant, les vues fonctionnent sur les valeurs devinées, et le disent.

Une ligne nouvelle apparue pendant un relevé reçoit ses trois attributs devinés et rejoint
silencieusement la file.

## L'identité graphique

| Élément | Choix |
|---|---|
| Palette | Terres douces — terracotta, sauge, ocre, ardoise, sable — sur ivoire chaud |
| Mode nuit | Bleu d'encre chaud, aplats poudrés. Automatique, suivant le réglage du téléphone |
| Traitement | Aplats mats. Aucune ombre, aucun dégradé, angles vifs |
| Texte | Familjen Grotesk |
| Chiffres | JetBrains Mono, tabulaire — les colonnes de montants s'alignent au chiffre près |
| Code de lecture | Un trait = un seuil ou une cible · rayé = en trop · contour vide = manquant |

Ce dernier point fait l'unité de l'ensemble. Les quatre vues n'ont pas la même forme — répéter un
même graphique partout donnerait de l'unité sur une planche et de l'illisibilité à l'usage. Ce qui
tient l'ensemble, c'est un vocabulaire constant.

Le garde-fou `scripts/check-design.sh` conserve ses trois règles et en reçoit une quatrième :
**aucune ombre ni dégradé** dans `app/` et `components/`. Une règle de style qui n'est pas vérifiée
automatiquement ne survit pas six mois.

## Livraison

Quatre étapes, chacune sur sa branche avec sa pull request, chacune vérifiable seule. L'application
reste utilisable après chacune.

**A — La peau.** Jetons de couleur, deux polices, briques de base (grille de cent carrés, barre,
jauge, échelle, courbe). Appliqués aux écrans existants. Aucune donnée nouvelle : le changement
d'apparence est visible immédiatement et isolément.

**B — Les données.** Six poches, trois attributs de ligne, régime fiscal par enveloppe, écran
Réglages, écran À qualifier, règles de déduction. Migration versionnée, relue, appliquée par
`db:migrate`. Jamais de `db:push`.

**C — Les vues.** Les quatre vues et le nouvel accueil.

**D — Le ménage.** Saisie revue, nouvelle navigation, retrait des écrans absorbés.

Ce que « absorbé » veut dire, précisément :

| Écran actuel | Devient |
|---|---|
| Accueil | Réécrit — courbe, versé/gagné, les quatre réponses |
| Allocation | Disparaît. Son graphique va dans **Classes**, sa saisie de cibles dans **Réglages** |
| Mes lignes | Conservé, sous « Gérer ». Reçoit la correction des qualifications |
| Nouveau relevé | Conservé, inchangé dans son principe, réhabillé |
| Journal | Conservé, sous « Gérer », réhabillé |
| Recherche de lignes | Conservée, rattachée à Mes lignes |

Arrêter après B ou C laisse une application cohérente. C'est l'objet de ce découpage.

## Vérification

Le propriétaire de ce dépôt ne lit pas le code. Une relecture ne le protège donc de rien : ce qui le
protège, ce sont des garde-fous qui refusent tout seuls.

- **Chaque chiffre affiché a son test** : écart à la cible, somme des carrés égale à cent, mois de
  précaution, part productive, chacune des cinq mesures de concentration, répartition géographique
  pondérée. Un calcul faux qui a l'air juste est le pire scénario possible.
- **Un test échoue si une vue affiche un chiffre dérivé d'attributs devinés sans le marquage.**
- **Le garde-fou du design refuse ombres et dégradés**, en plus des couleurs en dur.
- Les garde-fous de session existants restent intacts : toute Server Action passe par
  `requireSession()`, tout écran par `requireSessionOrRedirect()`, et deux tests lisent le source
  pour l'imposer.
- `npm test`, `npm run lint`, `npm run build` et les tests Playwright sont **exécutés**, et leur
  sortie collée. Aucun ✓ non observé.
- **Des captures d'écran réelles au format téléphone** accompagnent chaque étape : c'est le seul
  moyen de vérifier « est-ce que ça ressemble aux maquettes ».
- Ce dépôt n'a **pas d'intégration continue** : GitHub ne vérifie rien à la fusion. Tout est relancé
  sur `main` fusionné, à chaque étape.

## Ce que cette refonte ne fait pas

- Pas de suivi de dépenses. Le montant mensuel est déclaré, jamais calculé.
- Pas de cible sur les enveloppes ni sur les délais de sortie.
- Pas de nuage de points à deux axes.
- Pas de conseil, pas de recommandation d'arbitrage. Les vues constatent et mesurent ; elles ne
  décident jamais à la place de leur propriétaire. Une jauge au-dessus de son seuil dit « regarde
  ici », pas « vends ça ».
- Pas d'historique des attributs de qualification : le délai de sortie d'une ligne est un fait
  présent, pas une série temporelle.

## Maquettes

Les maquettes validées pendant la conception sont conservées dans
`.superpowers/brainstorm/` (non versionné). Les captures produites à chaque étape de livraison
serviront de référence durable.
