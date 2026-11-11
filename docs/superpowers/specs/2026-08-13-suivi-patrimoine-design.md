# Suivi de patrimoine — spécification de conception

**Date :** 13 août 2026
**Statut :** validé
**Remplace :** `Tableau de bord Mes Finances.numbers` (Apple Numbers, iCloud)

---

> **Chiffres d'exemple.** Les montants de ce document proviennent du jeu de données fictif
> `data/opening-portfolio.example.json`. Les chiffres réels ne sont pas versionnés. Les ordres de
> grandeur et les proportions ont été conservés : le raisonnement reste lisible, les données ne
> sont plus celles de personne.

## 1. Le problème

Le propriétaire pilote son patrimoine — 466 552 € répartis sur une cinquantaine de lignes et onze
enveloppes — dans un fichier Numbers. Ce fichier affiche pour sa part un total de 461 552 € ; l'écart
de 5 000 € est expliqué plus bas. Le fichier a trois défauts de nature différente.

**Il n'a pas de mémoire.** Chaque mise à jour écrase la précédente. Le fichier ne contient qu'une
photo, datée du 16 novembre 2025, soit neuf mois avant la rédaction de cette spécification. Il est
donc impossible de savoir si le patrimoine progresse, ni de distinguer ce qui a été versé de ce qui
a été gagné.

**Il ment.** Cinq lignes de crowdfunding immobilier, soit 5 000 €, sont affichées mais additionnées
nulle part. Les cibles des sous-poches actions somment à 48 % pour une poche cible à 40 %. Deux
erreurs `#REF!` subsistent. Deux colonnes affichent des euros là où elles devraient afficher des
pourcentages.

**Il est fatigant à tenir.** Une soixantaine de lignes à mettre à jour à la main, cours compris, ce
qui explique les neuf mois d'abandon.

À cela s'ajoute un défaut de modèle, plus profond, identifié lors de l'audit : la résidence
principale pèse la moitié du patrimoine et rend toute analyse d'écart inutilisable.

## 2. Ce qu'on construit

Une application web privée, gratuite, qui répond à trois questions :

1. **Mon patrimoine progresse-t-il, et grâce à quoi ?** — la courbe et sa décomposition
2. **Où sont mes écarts par rapport à mes cibles ?** — sur le périmètre pilotable uniquement
3. **Qu'est-ce que je possède, et où ?** — le détail, lisible par enveloppe ou par classe

Périmètre : **patrimoine uniquement**. Ni budget, ni suivi de dépenses.

## 3. Les décisions structurantes

### 3.1 Deux périmètres au lieu d'un

La résidence principale (225 000 € nets) représente près de la moitié du patrimoine. Elle n'est ni liquide, ni
arbitrable : on ne vend pas 10 % de son logement pour rééquilibrer une allocation. La conserver dans
le calcul produit des écarts qui ne seront jamais comblés — « immobilier 60 % contre une cible de
15 % » — et écrase mécaniquement toutes les autres poches par effet de dénominateur.

L'outil expose donc deux périmètres :

| Périmètre | Contenu | Montant | Usage |
|---|---|---|---|
| **Total** | tout, résidence principale incluse | 466 552 € | la courbe, la vision succession |
| **Pilotable** | tout sauf la résidence principale | 241 552 € | **le calcul d'allocation et des écarts** |

Sur le périmètre pilotable, la répartition du jeu d'exemple est la suivante :

| Classe | Montant | Part |
|---|---|---|
| Immobilier locatif | 67 000 € | 27,7 % |
| Actions (toutes zones) | 66 957 € | 27,7 % |
| Liquidités | 41 300 € | 17,1 % |
| Monétaire en devises (USD, GBP) | 38 050 € | 15,8 % |
| Monétaire EUR | 13 049 € | 5,4 % |
| Dette privée / crowdfunding | 7 000 € | 2,9 % |
| Obligations | 5 196 € | 2,2 % |
| Private equity | 3 000 € | 1,2 % |
| Matières premières / or | 0 € | 0 % |

C'est ce tableau — et non celui du fichier actuel — qui doit piloter les décisions.

### 3.2 Deux étiquettes par ligne

Le fichier actuel range chaque ligne par niveau de risque, et colle le nom de l'enveloppe au début
du libellé (`PEA - ACTION A`). C'est une convention d'écriture, pas une donnée : le fichier ne
sait donc pas totaliser une enveloppe.

Chaque actif porte désormais deux étiquettes indépendantes : son **enveloppe** (où est l'argent) et
sa **classe d'actif** (à quoi il est exposé). Le même patrimoine devient lisible dans les deux sens,
et le découpage « sécurité / risque » redevient ce qu'il aurait dû rester — une vue calculée, pas la
structure des données.

### 3.3 L'immobilier se décompose

Les biens sont aujourd'hui saisis nets d'emprunt, en un seul chiffre. Ils seront saisis en deux :
valeur du bien et capital restant dû. Le net est calculé.

Le résultat affiché est identique, mais l'amortissement mensuel du crédit — un enrichissement réel,
aujourd'hui invisible — devient mesurable.

### 3.4 Les cibles sont contraintes

La somme des cibles doit faire exactement 100 % du périmètre pilotable. L'outil refuse
d'enregistrer un jeu de cibles incohérent. C'est la correction directe du défaut « 48 % pour une
poche à 40 % ».

Les cibles actuelles, calculées sur un total incluant la résidence principale, sont caduques. Elles
seront redéfinies lors de la reprise. **Cette décision appartient au propriétaire** ; l'outil ne propose
aucune allocation.

## 4. Le modèle de données

Cinq objets.

**L'actif** — une ligne de patrimoine. Attributs : libellé, enveloppe, classe d'actif, devise, mode
de valorisation (cotée / solde saisi / estimation manuelle), identifiant de cotation le cas échéant,
quantité et prix de revient unitaire pour les lignes cotées, drapeau « pilotable ». Pour les biens
immobiliers : valeur brute et capital restant dû.

**L'enveloppe** — regroupe des actifs : PEA, PEA-PME, PER, PEE Criteo, PEE OVHcloud, nominatif pur
Air Liquide, Revolut, Boursobank, Crédit Agricole, Hello Bank, immobilier direct, non coté.

**La classe d'actif** — porte la cible en pourcentage du périmètre pilotable.

**Le relevé** — une photo datée de l'ensemble des actifs. Un relevé est soit *estimé* (produit
automatiquement), soit *confirmé* (validé par le propriétaire). Un relevé n'écrase jamais le précédent.

**Le mouvement** — un versement ou un retrait, daté, rattaché à une enveloppe. C'est ce qui permet
de séparer épargne et performance dans la variation du patrimoine.

### La taxonomie corrigée

| Classe | Périmètre | Changement par rapport au fichier actuel |
|---|---|---|
| Liquidités | pilotable | — |
| Monétaire EUR | pilotable | séparé du monétaire en devises |
| Monétaire en devises | pilotable | **nouveau** — rend visibles les 38 050 € en USD et GBP |
| Obligations | pilotable | ne contient plus que de vraies obligations |
| Dette privée / crowdfunding | pilotable | **nouveau**, côté risque — accueille les lignes de crowdfunding immobilier et obligataire |
| Actions Europe | pilotable | — |
| Actions US | pilotable | — |
| Actions Monde | pilotable | accueille le Japon, marché développé et non émergent |
| Actions Émergents | pilotable | perd le Japon |
| Private equity / non coté | pilotable | règle de valorisation explicite et datée |
| Immobilier locatif | pilotable | — |
| Résidence principale | **hors pilotable** | isolée du calcul d'allocation |
| Matières premières / or | pilotable | — |

## 5. Les écrans

### 5.1 Accueil — la courbe

Le patrimoine net au dernier relevé, sa variation depuis le relevé précédent, et **la décomposition
de cette variation entre versements et performance**. En dessous, la courbe dans le temps, puis le
montant du périmètre pilotable.

La courbe respecte les **dates réelles** des relevés, jamais un pas mensuel régulier. Un intervalle
de sept mois se lit comme un intervalle de sept mois. Toute variation affichée précise sa période.

Les relevés estimés apparaissent en trait pointillé, les relevés confirmés en trait plein.

### 5.2 Allocation — les écarts

Calculée exclusivement sur le périmètre pilotable. Les classes triées du plus gros écart au plus
petit, exprimés **en euros** — « il manque 42 000 € en actions US » est actionnable, « −12,6 points »
ne l'est pas.

### 5.3 Mes lignes — le détail

Toutes les lignes, avec bascule entre les deux lectures : **par enveloppe** ou **par classe
d'actif**. C'est le bénéfice direct des deux étiquettes.

### 5.4 Journal — les mouvements

La liste des versements et retraits, avec un bouton d'ajout.

## 6. Le rituel de mise à jour

Le propriétaire prévient qu'il ne sera pas régulier. Le design en tient compte : l'outil **n'émet aucun
rappel et aucune alerte de retard**. Il affiche discrètement la date du dernier relevé confirmé.

### 6.1 Le relevé manuel

1. Le propriétaire ouvre « Nouveau relevé »
2. L'outil pré-remplit tout avec le relevé précédent et **rafraîchit seul les cours** des lignes
   cotées (~17 lignes)
3. Il corrige à la main ce qui ne se cote pas : quatre soldes bancaires, deux livrets, cinq
   lignes Revolut, les supports du PER — une douzaine de chiffres
4. Il saisit ses mouvements de la période, s'il y en a eu
5. Il enregistre : un relevé **confirmé** de plus

Durée visée : cinq minutes, contre une trentaine aujourd'hui. L'immobilier et le non coté ne se
touchent qu'une à deux fois par an.

### 6.2 Le relevé automatique

Chaque mois, l'outil enregistre seul un relevé **estimé** : cours du jour pour les lignes cotées,
dernière valeur connue pour toutes les autres.

La courbe reste ainsi continue même après une longue absence — exactement le scénario qui vient de
se produire avec le fichier Numbers. Entre deux passages, les soldes bancaires et l'immobilier
restent figés ; c'est précisément pourquoi les deux natures de relevés sont distinguées
visuellement. L'outil ne doit jamais laisser croire à une précision qu'il n'a pas.

## 7. L'architecture

| Brique | Choix | Coût |
|---|---|---|
| Application | Next.js déployé sur Vercel | 0 € |
| Données | Postgres chez Neon | 0 € |
| Accès | mot de passe unique, HTTPS, page non indexée | 0 € |
| Cours | Yahoo Finance, sans clé ni compte | 0 € |
| Relevé automatique | tâche programmée mensuelle chez Vercel | 0 € |

**Neon plutôt que Supabase** : le free tier de Supabase met le projet en pause après sept jours
d'inactivité et exige une restauration manuelle — rédhibitoire pour un outil ouvert quelques fois
par an. Neon suspend le calcul après cinq minutes mais reprend seul à la requête suivante.

**Règle sur les cours** : la source est gratuite mais non officielle. En cas d'échec, l'outil
affiche « cours indisponible » et conserve le dernier prix connu. Il ne présentera jamais une valeur
périmée comme une valeur fraîche.

**Couverture de l'automatisation** : elle porte sur ce qui bouge seul — les actions et ETF du PEA,
du PEA-PME et du nominatif pur. Les soldes bancaires, les fonds Revolut, les supports du PER,
l'immobilier et le non coté restent saisis à la main, mais ce sont des valeurs qui ne varient pas
d'elles-mêmes.

## 8. La reprise du fichier

Les ~50 lignes sont reprises depuis `docs/reprise/patrimoine-numbers-2025-11-16.md`, avec les
corrections validées : deux étiquettes par ligne, crowdfunding reclassé en dette privée, Japon
reclassé en Actions Monde, réintégration des 5 000 € omis, résidence principale marquée non
pilotable et décomposée.

Le relevé de reprise devient le point de départ de la courbe.

**Le propriétaire vérifie ensuite ligne à ligne.** Trois informations lui seront demandées à ce moment :

- la valeur brute et le capital restant dû de ses deux biens immobiliers (le fichier ne contient que
  le net)
- la règle de valorisation retenue pour la ligne non cotée
- ses nouvelles cibles, exprimées sur le périmètre pilotable

## 9. Hors périmètre

Exclus délibérément, pour tenir la promesse d'un outil simple :

- **Budget et suivi de dépenses** — autre métier, charge de saisie sans rapport
- **Connexion automatique aux banques** — payante en France, fragile, et ferait transiter des
  identifiants bancaires chez un tiers
- **Cours en temps réel et notifications quotidiennes** — un patrimoine se regarde au mois ; le
  temps réel produit de l'anxiété, pas des décisions
- **Conseil, recommandation ou passage d'ordres** — l'outil constate et mesure
- **Estimation automatique de l'immobilier** — une estimation manuelle annuelle est plus honnête
  qu'une API approximative qui ferait bouger 60 % du patrimoine sans raison

## 10. Évolutions prévues

Recommandées par l'audit, écartées de la v1, et que le modèle peut accueillir sans rupture :

| Évolution | Question à laquelle elle répond | Coût de saisie |
|---|---|---|
| Plus-values et impôt latent par enveloppe | « combien vaut mon patrimoine net d'impôt ? » | nul, les prix de revient existent déjà |
| Étiquettes de disponibilité | « combien puis-je mobiliser sous un mois ? » | une saisie unique par ligne |
| Compteur de plafonds PEA / PEA-PME | « quelle capacité d'enveloppe me reste-t-il ? » | reconstitution des versements passés |
| Revenus passifs (dividendes, loyers nets) | « que rapporte mon patrimoine ? » | une saisie annuelle agrégée |

## 11. Annexe — points de vigilance relevés par l'audit

L'audit d'origine listait ici six constats chiffrés sur la situation réelle du propriétaire :
trésorerie dormante, sur-pondération du monétaire, exposition de change non couverte, poche
obligataire qui n'en contenait pas, produits mal adaptés à la détention longue. Ces constats sont
des données personnelles et non des décisions de conception : ils ne sont pas versionnés, et vivent
avec les notes de reprise, en local.

Un seul point est conservé ici, parce qu'il justifie directement la taxonomie du §4 :

- **Erreurs de classement dans le fichier d'origine** : le crowdfunding immobilier est de la dette
  privée et non une obligation ; le Japon est un marché développé et non émergent ; un « plafond
  150 000 € » avait été recopié sur un PEE, alors que ce plafond est celui du PEA. À noter
  également, le plafond du PEA porte sur les **versements cumulés** (150 000 €, et 225 000 €
  mutualisés avec le PEA-PME) et non sur la valeur du plan.

Sources réglementaires vérifiées en août 2026 :
[taux du Livret A](https://www.info.gouv.fr/actualite/augmentation-du-taux-du-livret-a-a-compter-du-1er-aout-2026),
[plafonds Livret A et LDDS](https://www.journaldunet.com/patrimoine/guide-des-finances-personnelles/1141373-livret-a-taux-et-plafond-en-2026/),
[plafonds PEA et PEA-PME](https://www.toutsurmesfinances.com/bourse/a/pea-plafond-de-versements-a-150-000-euros),
[fiscalité du PEA](https://advizexperts.fr/baremes-seuils/pea-plan-epargne-actions/).
