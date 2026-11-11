# Avis dataviz — les cinq vues

**Principe** : la grille garde un seul sens partout. Les autres vues ne la recolorent pas : elles en **allument** une partie, ou changent de forme.

## Vue par vue

**1. Détail d'une catégorie — un tableau, pas un graphique.** Pour une dizaine de chiffres précis, un tableau bat tout graphique (Tufte). En tête, les carrés de la catégorie découpés par ligne : c'est le zoom de l'écran d'ouverture. Puis la liste triée par valeur : montant, quantité × cours, prix de revient, plus-value en euros et en %, **signée et dite « depuis l'achat »**. *Dépend du fonctionnement* : livrets et immobilier se réduisent au montant.

**5. Diagnostic — des jauges à seuil, pas des notes.**
- Matelas : le *bullet graph* de Few, une barre en mois avec deux traits à 3 et 6 mois.
- Disponible / immobilisé : la grille elle-même, carrés disponibles allumés. *Dépend du fonctionnement* : se juge **par ligne** ; la maquette range un PER et un PEE en disponible parce qu'ils sont « actions ».
- Score « 5,1/10 » : à retirer. Moyenne de niveaux : sa décimale est une précision fictive. Montrer combien de carrés par niveau de risque (une barre de cent, en paliers de gris).
- Rendement et projection : des hypothèses. Arrondies, marquées « estimé ».

**4. Banques — ne pas recolorer la grille.** Les teintes sont apprises comme catégories et seraient lues à rebours ; le nombre d'établissements n'est pas borné ; et « combien chez qui ? » est un classement, que la position sur un axe commun sert mieux que des surfaces (Cleveland & McGill). Donc des barres horizontales triées, découpées aux couleurs des catégories, avec un trait au plafond de garantie si tu le suis. Toucher une banque allume ses carrés. *Dépend du fonctionnement* : vue en **brut**, crédit en ligne « dû à » séparée, rubrique « détenu en direct » (résidence, or, crypto).

**2. Évolution — des points datés, pas des barres empilées.** Empilées, seuls la base et le total se comparent ; la maquette empile même du brut sous une étiquette nette. Avec 2 à 12 relevés : des points reliés d'un fil fin, sur un **vrai axe du temps** (la maquette espace également des intervalles d'un an et de dix mois). Deux relevés : une pente avant/après. Net et valeur du carré sont **la même courbe** (net ÷ 100) : une courbe, deux graduations, le prochain cap en trait. Dessous, « grâce à quoi » : une barre par catégorie, en euros, de part et d'autre de zéro, crédit remboursé compris.

**3. Vue brute — supprimer la bascule, oui ; hachurer, non.** Cinquante et un carrés hachurés produisent le moiré que Tufte range dans le *chartjunk*. Surtout, la bascule change en silence la valeur du carré (1 720 € → 3 520 €), donc l'unité du progrès. Le brut appartient à l'immobilier : une barre « possédé / dû à la banque » dans son détail suffit.

## Vocabulaire commun
- **Teinte** = catégorie, jamais réaffectée.
- **Trait** = référence : but, seuil, cap.
- **Plein / contour** = en trop / manquant.
- **Allumé / éteint** = sous-ensemble.
- **Position** = classement ou temps.
- Vert et rouge **en texte seulement** (la maquette peint « Optimal » en vert).

## Trois pièges
1. **Mélanger brut et net.** Déjà dans la maquette : « Résidence principale — 260 000 € (46 carrés) » en vue nette, alors que 46 carrés valent 79 000 €.
2. **Lire des carrés comme des montants dans le temps.** Un carré est une part : la maquette affiche « Fonds euros +6 000 € (−4 carrés) ». Dans le temps, on compare des euros.
3. **Présenter une hypothèse comme une mesure** : score, rendement, projection « 275 117 € » à l'euro près.

## Ce qui manque
- **Apports contre performance** : sans les versements, « je progresse » ne distingue pas l'épargne du marché. *Dépend du fonctionnement.*
- **Un seul relevé** : dire « rien à comparer encore », pas dessiner un point isolé.

## Un vrai problème sur l'écran d'ouverture
L'immobilier est le montant le moins sûr (une estimation), et le crédit amplifie son poids. 10 % d'erreur sur les 260 000 € font bouger le net de 15 %, la valeur du carré de 260 € — plus du tiers des « +700 € » affichés comme progrès — et 7 à 9 carrés. Ses 46 carrés sont pourtant aussi pleins que des livrets. Au minimum : « estimée » et sa date dans sa ligne.
