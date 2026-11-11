# Identité visuelle et design system — « Le relevé »

Date : 2026-08-15
Statut : spécification validée pour les chantiers 1 et 2

## Pourquoi ce chantier

Trois audits (parcours, identité, mobile/accessibilité) ont été menés sur l'application en
fonctionnement, avec les vraies données. Ils convergent sur quatre causes racines :

1. **Le fichier de styles n'a jamais été ouvert.** `app/globals.css` fait 26 lignes : c'est le
   gabarit de démarrage de Next.js, jamais touché. La ligne `body { font-family: Arial }` neutralise
   les polices Geist chargées dans `app/layout.tsx`, qui sont téléchargées à chaque visite sans
   jamais s'afficher. Conséquence en cascade : les 12 usages de `tabular-nums` du code n'ont aucun
   effet, Arial n'implémentant pas cette fonction. L'alignement actuel des montants tient d'un
   accident (les chiffres d'Arial ont nativement la même largeur).
2. **Un seul gabarit pour sept usages.** `max-w-3xl` centré est appliqué à tous les écrans, qu'il
   s'agisse de lire un chiffre, scanner un tableau ou saisir 58 champs.
3. **Le mode sombre est une inversion, pas un design.** Deux variables changent ; tout le reste est
   codé en dur dans les pages.
4. **La page « Nouveau relevé » est un problème de structure, pas de style.** Hors périmètre ici
   (voir « Hors périmètre »).

### Défauts mesurés que ce chantier corrige

| Défaut | Mesure | Exigence |
|---|---|---|
| Bouton principal en mode sombre (`bg-black` sur `#0a0a0a`) | **1,06:1** | 3:1 |
| « cours indisponible » (`text-amber-600` sur blanc) | **3,20:1** | 4,5:1 |
| Bordure du bandeau d'alerte (`border-amber-500` sur blanc) | **2,15:1** | 3:1 |
| Textes secondaires (`text-neutral-500`) en mode sombre | **4,18:1** | 4,5:1 |
| Erreurs (`text-red-600`) en mode sombre | **4,10:1** | 4,5:1 |
| Bordures nues (24 occurrences, couleur du texte héritée en Tailwind v4) | 17,9:1 clair / 16,9:1 sombre | 1,5–3:1 |
| Cibles tactiles de navigation | **20 px** | 44 px |
| Police des champs de saisie (déclenche le zoom iOS) | **14 px** | 16 px |
| Colonnes du tableau Allocation à 390 px | **0 px** d'écart | ≥ 8 px |
| Largeur de la page Recherche à 390 px | **426 px** (déborde) | ≤ largeur d'écran |
| Trait de la courbe rendu à 390 px | **0,95 px** | ≥ 1,5 px |

## La direction retenue : A — « Le relevé »

> L'application est un instrument gradué qui enregistre des lectures. Elle affiche la mesure,
> l'incertitude de la mesure, et rien d'autre.

Elle est justifiée par le README, qui emploie déjà le vocabulaire de la mesure (« relevé »,
« confirmé », « estimé ») et pose deux engagements : « l'application constate et mesure, elle ne
décide jamais » et « ne doit jamais laisser croire à une précision qu'elle n'a pas ».

**Le geste signature — la règle graduée.** Un même objet, réutilisé à deux endroits :
sous la courbe de l'accueil comme axe (un trait par mois : long pour un relevé confirmé, court pour
un mois estimé), et sur la page Allocation comme jauge partagée (la cible est un repère fixe, le
détenu un segment). L'écart se voit avant de se lire. La graduation n'encode que de vraies valeurs :
aucun trait décoratif, jamais.

## Les jetons

Deux couches. Les composants ne connaissent **que** la couche sémantique. Tout vit dans le bloc
`@theme` de `app/globals.css` (Tailwind v4).

Le mode sombre redéfinit uniquement la couche des valeurs, à deux endroits : la préférence système
(`prefers-color-scheme`) et un attribut de thème sur la racine, pour qu'une bascule manuelle reste
possible plus tard sans rien réécrire. Aucun composant ne contient de valeur de couleur ni
d'exception « en sombre » : si un composant a besoin d'une variante sombre, c'est que le jeton est
mal découpé.

### Couleur — mode clair (fond `#F7F8F8`, surface haute `#FFFFFF`)

| Rôle sémantique | Hex | Contraste |
|---|---|---|
| Encre principale | `#16191C` | 16,59:1 |
| Encre secondaire | `#565D64` | 6,27:1 |
| Filet capillaire (décoratif) | `#C9CFD3` | — |
| Filet structurant (en-têtes, totaux) | `#848C92` | 3,21:1 |
| Mesure (courbe, liens, focus) | `#15619E` | 6,10:1 |
| Confirmé | `#15619E` | 6,10:1 |
| Estimé | `#5F6870` | 5,33:1 |
| Périmé | `#8A5300` | 5,95:1 |
| Positif | `#1B6B4B` | 6,07:1 |
| Négatif | `#A32B23` | 6,74:1 |

### Couleur — mode sombre (fond `#0E1114`, surface haute `#171B1F`)

| Rôle sémantique | Hex | Contraste |
|---|---|---|
| Encre principale | `#E6E9EC` | 15,54:1 |
| Encre secondaire | `#A0A9B2` | 7,95:1 |
| Filet capillaire (décoratif) | `#262C32` | — |
| Filet structurant | `#5E6870` | 3,33:1 |
| Mesure / confirmé | `#6FA8E0` | 7,53:1 |
| Estimé | `#98A2AC` | 7,30:1 |
| Périmé | `#E0A63A` | 8,73:1 |
| Positif | `#56C08D` | 8,40:1 |
| Négatif | `#F0857B` | 7,53:1 |

Tous les ratios sont calculés contre la surface qui porte le texte. Ils sont à revérifier à
l'implémentation, pas à recopier de confiance.

### Typographie

- **IBM Plex Sans** (variable, via `next/font/google`) — titres, texte, libellés.
- **IBM Plex Mono** (variable) — **tous** les montants, pourcentages, dates et codes ISIN.

Le monospace garantit l'alignement des chiffres **par construction** : aucune fonction OpenType à
activer, aucun réglage à oublier. C'est ce qui remplace les `tabular-nums` actuellement inopérants.
Effet de bord connu et accepté : en monospace, l'espace fine des milliers occupe une case entière,
donc « 666 698 € » respire davantage.

Échelle à **6 marches**, et pas une de plus : légende 12, texte 14, texte large 16, titre 20,
montant 28, total 40. Trois graisses (400, 500, 600). Deux interlignages : serré pour les chiffres,
large pour la prose.

### Espacement, formes, mouvement

- **Espacement** : échelle restreinte à 6 valeurs — 4, 8, 12, 16, 24, 40.
- **Gabarits** : trois largeurs, au lieu du `max-w-3xl` universel — *lecture* ~640 px (Accueil),
  *tableau* ~920 px (Allocation, Mes lignes, Journal), *saisie* jusqu'à ~1200 px (Relevé, Recherche).
- **Rayons** : deux valeurs — 0 pour tout ce qui est donnée, 3 px pour ce qui se clique ou se remplit.
- **Ombres** : une seule, réservée à l'en-tête de tableau figé au défilement. Aucune ailleurs.
- **Mouvement** : 120 ms au survol, 200 ms à l'apparition, une courbe unique, et respect de
  `prefers-reduced-motion`.

Volume total visé : environ 45 jetons.

## Les composants

Onze, plus deux optionnels. Sept écrans et un seul utilisateur : un système de quarante composants
serait une faute.

| # | Composant | Rôle | Écrans |
|---|---|---|---|
| 1 | Gabarit de page | Applique une des trois largeurs et le rythme vertical | Les 7 |
| 2 | Navigation | Les 5 liens **avec état actif**, défilement horizontal sur mobile, cibles 44 px | Les 6 écrans connectés |
| 3 | En-tête d'écran | Titre + phrase expliquant ce que l'écran calcule | Allocation, Lignes, Relevé, Journal, Recherche |
| 4 | **Montant** | Composant central. Police des chiffres, alignement tabulaire, taille, signe, marque de confiance et couleur optionnelles | Partout |
| 5 | Chiffre-clé | Libellé + Montant en grand + date et état du relevé | Accueil, total d'Allocation |
| 6 | Marque de confiance | Confirmé / estimé / périmé — forme **et** mot **et** couleur | Accueil, Relevé, légende de la courbe, Lignes |
| 7 | Tableau de données | En-tête, colonnes à droite, hiérarchie de filets, ligne de total, comportement mobile | Allocation, Lignes, Journal |
| 8 | Champ de saisie | Libellé + champ, variante numérique, état d'erreur, focus visible, 16 px, 44 px de haut | Relevé, Journal, Recherche, Connexion |
| 9 | Bouton | Deux variantes, principale et discrète. Corrige le bouton noir sur noir | Les 4 formulaires |
| 10 | Message | Avertissement, erreur de formulaire, erreur d'écran | Relevé, Allocation, Journal, Connexion |
| 11 | Courbe du patrimoine | Existe déjà. À rebrancher sur les jetons, doter d'un axe gradué et de valeurs lisibles au doigt | Accueil |
| 12 | *Bascule segmentée* | *« par enveloppe / par classe d'actif »* | *Lignes* |
| 13 | *État vide* | *Peut n'être qu'une variante du Message* | *Accueil, Allocation, Lignes, Recherche* |

## Les règles d'usage

Elles existent pour empêcher la dérive une fois le système posé.

**Écrire un montant.** Toujours par le composant Montant, jamais à la main. Toujours en chiffres
tabulaires, aligné à droite en colonne, avec le symbole € — jamais d'abréviation en « k » ou « M »,
qui est précisément l'imprécision que le produit refuse. Le comportement actuel de `lib/format.ts`
est **à préserver tel quel** : pas de centimes, et vrai signe moins typographique U+2212 (et non un
trait d'union) pour les valeurs négatives. Le gras est réservé à **un seul montant par écran** :
celui qui répond à la question de l'écran.

**Aucun total sans son compte.** Toute somme affichée indique de combien de lignes elle est faite
(« 12 poches · 336 247 € »). C'est la règle qui rend structurellement impossible l'erreur qui a
rendu le fichier Numbers inutilisable — 5 000 € affichés mais jamais additionnés.

**Signaler l'incertitude.** Trois états, pas un de plus : confirmé, estimé, périmé. Chacun porté par
**une forme d'abord, un mot ensuite, une couleur en dernier** — jamais par la couleur seule, jamais
par une infobulle seule. Tout écran affichant un chiffre issu d'un relevé doit dire, au moins une
fois et sans survol, de quel relevé il s'agit et dans quel état.

**Quand la couleur a le droit d'exister.** Quatre cas, aucun autre : la donnée sur la courbe ; les
trois marques de confiance ; l'accent sur ce qui est cliquable et l'anneau de focus ; le signe d'une
variation, et uniquement quand ce signe est déjà écrit à côté. Interdits : fond de couleur
décoratif, dégradé, carte colorée, ligne de tableau entièrement colorée.

**Le vert et le rouge ne portent jamais seuls le sens.** Le signe précède la couleur, et sur la page
Allocation l'écart est écrit en toutes lettres (« à renforcer de 21 471 € », « en excès de
8 260 € ») — le signe `+` seul se lit spontanément à l'envers.

## Chantier 1 — Le socle

Aucun écran redessiné. Objectif : réparer ce qui est mesurablement cassé et poser les fondations.

1. Supprimer la ligne `font-family: Arial…` de `app/globals.css`, et brancher IBM Plex Sans / Plex
   Mono dans `app/layout.tsx` en remplacement de Geist.
2. Poser la couche de jetons dans `@theme`, avec le mode sombre en deux endroits (préférence
   système + attribut de thème).
3. Donner une couleur de filet par défaut aux 24 bordures nues.
4. Remplacer les couleurs codées en dur — 19 `text-neutral-500`, 4 `bg-black`, 3 `text-red-600`,
   `text-amber-600`, `border-amber-500` — par les jetons correspondants. Répare les cinq défauts de
   contraste du tableau ci-dessus, dont le bouton invisible.
5. Navigation : état actif, défilement horizontal sur mobile, cibles portées à 44 px.
6. Champs de saisie : police 16 px (supprime le zoom iOS), hauteur minimale 44 px.
7. Espacement horizontal des cellules de tableau (Allocation, Lignes, Journal).
8. Page Recherche : largeur souple au lieu de `w-72`, corrige le seul débordement horizontal.
9. Ajouter `autoComplete="current-password"` sur la connexion, et `scope` sur les en-têtes de
   tableau.

## Chantier 2 — Le système et les écrans de lecture

1. Créer les composants 1 à 11 du tableau ci-dessus.
2. Passer du gabarit unique aux trois gabarits.
3. **Accueil** : le montant devient un vrai titre de niveau 1 (il n'y en a aucun aujourd'hui) ;
   marque de confiance à côté de la date ; courbe dotée de l'axe gradué ; valeurs de chaque relevé
   listées sous la courbe (date + montant + état), ce qui les rend accessibles au doigt, au clavier
   et au lecteur d'écran — aujourd'hui elles n'existent qu'au survol de la souris ; avertissement
   explicite quand aucun versement n'est journalisé sur la période, la répartition
   versement/performance n'étant alors pas fiable.
4. **Allocation** : fiches empilées sur mobile plutôt que quatre colonnes ; jauge graduée partagée ;
   écart écrit en toutes lettres ; ligne de total avec le nombre de poches.
5. **Mes lignes** et **Journal** : tableau rebranché sur les composants, total avec compte de lignes,
   comportement mobile.
6. **Courbe** : épaisseur et rayons adaptés à l'échelle (`vector-effect="non-scaling-stroke"`),
   repère réduit sur petit écran. Les couleurs actuelles (`#2a78d6` / `#3987e5`) sont à revalider
   contre les nouveaux fonds — elles restaient conformes lors de l'audit (4,15:1 et 5,20:1), mais
   c'est à vérifier, pas à supposer.

## Hors périmètre

**Chantier 3 — la refonte du relevé.** Regroupement par établissement, total qui se met à jour à la
saisie, validation qui ne perd plus les 58 champs, écran d'erreur, récapitulatif avant
enregistrement. C'est la refonte d'une tâche, pas un habillage : session et spécification dédiées.
Le chantier 1 lui applique tout de même ses correctifs mécaniques (police 16 px, hauteur des champs,
couleurs des jetons).

**Deux problèmes de données**, signalés et volontairement non traités ici :
- La « performance » affichée est la variation totale moins ce que contient le Journal. Le Journal
  étant vide, chaque euro versé est aujourd'hui présenté comme un gain de placement. Le chantier 2
  ajoute l'avertissement ; il ne corrige pas le calcul.
- 35 des 46 lignes sont en saisie manuelle alors que plusieurs sont des fonds cotés disposant d'un
  ISIN. C'est le levier le plus puissant sur la durée du rituel mensuel, et il ne demande aucune
  modification d'écran.

**Non retenu volontairement** : écran d'historique des relevés, modification ou suppression d'un
mouvement du Journal, écran d'ajout d'une ligne, réglage des objectifs d'allocation. Tous sont des
manques réels relevés par l'audit des parcours, mais ce sont des fonctionnalités, pas du design.

## Vérification

Rien n'est annoncé sans avoir été observé.

- `npm test` et `npm run test:e2e` passent.
- **Contrainte à respecter** : la suite e2e s'appuie sur des textes et des rôles existants —
  « Patrimoine net », « Périmètre pilotable, hors résidence principale », le bouton « Entrer », le
  message « Mot de passe incorrect. », et `getByRole('cell')` sur `/lignes` pour « PEA » et
  « Actions Europe ». Playwright tourne à 1280 px, donc le rendu en tableau y reste actif ; toute
  bascule en fiches doit rester cantonnée aux petites largeurs, sinon les tests cassent. Si un texte
  doit changer, le test correspondant est mis à jour dans le même commit.
- Contrastes recalculés sur les couleurs réellement rendues par le navigateur, pas sur les valeurs
  du présent document.
- Captures avant/après aux largeurs 390 px et 1440 px, en clair et en sombre, sur les six écrans.
- Vérification qu'aucune page ne déborde horizontalement à 320, 390 et 430 px.
- Vérification que la police effective est bien IBM Plex Sans, et non une police de repli.

## Ce qui est déjà bon et doit survivre

- `lib/format.ts` : absence de centimes et vrai signe moins typographique.
- Les `inputMode="decimal"` sur tous les champs de montant.
- Les libellés qui entourent leur champ.
- Le focus clavier natif, jamais supprimé.
- L'absence de blocage du zoom à deux doigts.
- Les messages d'erreur avec `role="alert"` du Journal et de la connexion, à généraliser.
