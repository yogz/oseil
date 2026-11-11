# Avis UX mobile — PatriCube, hors écran d'ouverture

## 1. Les cinq vues

**Détail d'une catégorie — garder, priorité 1.** On y entre en touchant une ligne de la légende (48 px, bonne cible). Pas les carrés : 33 px, et pas de survol au doigt. Un écran poussé, retour par geste, pas un tiroir sous la grille. En tête, la même ligne que sur l'accueil (montant, barre de but, écart) ; puis les lignes par montant décroissant : nom et établissement, montant, dessous en gris « 38 × 171,05 € » et la plus-value. Les lignes de moins d'un carré groupées en bas.
*Dépend du fonctionnement :* plus-value depuis l'achat (il faut saisir un prix de revient) ou depuis le dernier relevé (gratuite, et c'est elle qui raconte le progrès) ?

**Diagnostic — garder, pas celui de la maquette.** Un onglet : des constats séparés par des filets, chacun une phrase, un chiffre, une barre. Matelas en mois de dépenses ; disponible contre bloqué ; concentration (plus grosse ligne, même entreprise sur plusieurs comptes). Retirer score de risque, rendement estimé et projection à 10 ans (piège 2).

**Vue par banque — garder, déplacée.** Pas en recoloriant la grille (piège 1) : une liste d'établissements, montant et part, chaque barre découpée aux couleurs des catégories, dans le Diagnostic.
*Dépend du fonctionnement :* l'établissement doit être un vrai champ. La maquette le devine dans le libellé et range « Air Liquide (Nominatif) » parmi les banques.

**Évolution — l'écran plus tard, les données dès le premier jour.** Chaque mise à jour enregistre un relevé, sinon pas d'historique. Écran : courbe du net, puis liste des relevés (date, net, valeur du carré). Axe du temps proportionnel : des relevés irréguliers posés à intervalles égaux, comme dans la maquette, faussent la pente.

**Vue brute — abandonner.** Le crédit est déjà dit par « possède − crédits » et la sous-ligne de l'immobilier ; des hachures à 33 px, c'est du bruit.

## 2. Navigation

Cinq écrans :
- barre d'onglets en bas : **Patrimoine** (l'ouverture), **Diagnostic**, **Historique** (état vide honnête : « la courbe apparaît au deuxième relevé ») ;
- **détail d'une catégorie**, poussé depuis Patrimoine ;
- **mise à jour**, plein écran par-dessus tout, organisée **par établissement**, puisqu'on lit ses soldes appli bancaire par appli bancaire. Une étape par banque, valeurs précédentes pré-remplies, « inchangé » en un geste, « 3 établissements sur 5 », récapitulatif avant d'enregistrer.

Plus les réglages. On lit par catégorie, on saisit par banque.

## 3. Trois pièges

1. **Les bascules de l'écran d'ouverture** — le vrai problème de l'écran validé. Posées au-dessus du verdict, elles en changent le sens. En « Banques », verdict et barres de but ne veulent plus rien dire : les buts sont par catégorie. En « Brut », l'immobilier passe de 46 à 74 carrés et le verdict de 5 à 29 carrés mal placés. Et un carré bleu serait un fonds euros ici, une banque là. Retirer les deux.
2. **Un diagnostic qui parle comme un conseiller.** L'indicateur de risque réglementaire des documents d'informations clés va de 1 à 7 et note un produit, pas un patrimoine : un « score AMF /10 » prête le nom du régulateur à un chiffre maison. Le rendement repose sur des hypothèses saisies, les conseils sur des règles écrites en dur, les badges verts « Optimal » rassurent sans fondement. Et la maquette calcule le matelas sur le brut, la liquidité sur le net. Des constats, pas des notes ; chaque chiffre dit son périmètre.
3. **La mise à jour qui se perd.** On quitte l'appli pour lire un solde, on revient : sans brouillon conservé, la saisie meurt à la première interruption.

## 4. Ce qui manque

- **Les réglages** : buts, dépenses mensuelles, établissements. Sans eux, verdict et matelas n'ont pas d'entrée.
- **Les états vides** : premier lancement ; « buts non définis », jamais « 0 carré au mauvais endroit » ; matelas « non calculable » sans dépenses, jamais 0.
- **Ce qui a changé depuis le dernier relevé**, par catégorie : la récompense de la mise à jour, que l'accueil ne donne pas.
- **Épargne versée contre performance.** Sans noter les versements, « +700 € par carré » mélange l'effort, le marché et le crédit remboursé. Choix de fonctionnement, à trancher tôt.
- **Un geste pour masquer les montants** : ce genre d'appli s'ouvre aussi en public.

Enfin : tout étant saisi à la main, la mise à jour est le second cœur du produit, pas un formulaire annexe.
