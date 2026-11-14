# Corriger un relevé passé

Décidé avec Nicolas le 12 novembre 2026, après une revue UX/UI et sur planches (rangée 8 de « Planches Réglages »,
https://claude.ai/artifact/6EU7f8vw6aZYasm8ShE17x). Ce document fait foi pour cette fonction.

## Pourquoi

Aujourd’hui, on ne corrige que le dernier relevé : la fiche d’une ligne (« Son montant au 10 nov. › »,
`components/line/FiguresEdit.tsx`, `correctFigures` dans `lib/correct/snapshot-changes.ts`) n’agit que sur lui, et la
liste « Tes relevés » d’Évolution (`app/(app)/evolution/page.tsx`, section `STATEMENTS_TITLE`) n’est qu’une liste qu’on
ne peut pas ouvrir. Une erreur de frappe dans un vieux relevé fausse pour toujours la courbe et « D’où ça vient ».
C’est aussi le socle du chantier suivant, « Montant investi » (un chiffre par relevé pour une ligne en montant), qui se
logera sur la même page. **Simple et bien intégré** (Nicolas).

## Ce qui est décidé

- **Un relevé, c’est une page.** Dans Évolution, chaque rangée de « Tes relevés » devient un lien « › » vers la page de ce
  relevé (planche 8B). La rangée garde la date et le total ; **la valeur d’un carré quitte la liste** et passe sur la page
  du relevé (oui de Nicolas). Le plus récent porte, sous sa date, « le dernier » (texte adouci).
- **La page d’un relevé** (planche 8C) : retour « ‹ Évolution » ; titre « Relevé du 16 novembre 2025 » ; le total en grand
  montant ; « un carré valait 2 214 € » ; la phrase « Les chiffres de ce jour-là. Les corriger change ta courbe, pas tes
  chiffres d’aujourd’hui. » ; puis les lignes de ce relevé **rangées par banque, dans l’ordre de la mise à jour**, chacune
  avec son petit carré de catégorie, son nom, son chiffre de ce jour-là (pointillé, comme les chiffres d’une liste) et
  « › ». C’est une lecture : aucune case ouverte, ni progression, ni « suivant ».
- **Corriger un chiffre** (planche 8D) : toucher une ligne ouvre l’écran de correction qui existe (`FiguresEdit`), daté de
  ce relevé partout : retour « ‹ Relevé du 16 novembre 2025 », titre « Son montant au 16 novembre 2025 » (ou « Ses parts
  et son prix moyen au … »), étiquette « … ce jour-là », une phrase grise « Aujourd’hui : 43 913 €, inchangé » (le chiffre
  de la ligne au dernier relevé ; « Aujourd’hui : la ligne n’existe plus » si elle est fermée), la phrase existante
  « C’est une correction : … » et « Ce relevé fait partie de ton histoire : ta courbe et D’où ça vient vont bouger. »,
  et le bouton « Corriger le 16 novembre 2025 ».
- **Après l’enregistrement** : retour à la page du relevé, avec, à la place de la phrase de tête, « Corrigé. Ta courbe et
  D’où ça vient en tiennent compte. » (jusqu’à la prochaine visite). Pas de message éphémère, pas d’avant/après chiffré,
  pas de rouge.
- **Le même chiffre dans les relevés voisins** (oui de Nicolas, précisé plus bas) : si d’autres relevés portent exactement
  l’ancienne valeur, sans interruption, l’écran le dit avant d’enregistrer (« Ce chiffre est le même dans 2 autres
  relevés : on les corrige aussi. ») et la correction s’y applique aussi. Le site ne sait pas distinguer un
  chiffre repris d’un chiffre retapé à l’identique (`seenOn` devient la date du relevé quand on confirme une ligne
  inchangée) : on corrige donc tout ce qui est identique et contigu, et on le dit.
- **Mise à jour en cours** (oui de Nicolas) : on peut corriger un relevé passé ; corriger **le dernier** relevé (la base
  de la mise à jour, `UpdateDraft.basedOn`) reste refusé avec « Termine d’abord ta mise à jour en cours. » Aujourd’hui,
  `readForCorrection` (`lib/correct/save.ts`) refuse toute correction pendant une mise à jour : la règle s’assouplit pour
  les relevés passés seulement, à condition que la correction n’écrive jamais dans le dernier relevé (la propagation vers
  l’avant s’arrête avant lui pendant une mise à jour, et l’écran le dit).
- **Depuis la fiche d’une ligne** : « Son montant au 10 nov. › » garde son comportement (le dernier relevé) ; une rangée
  discrète « Ses relevés précédents › » mène à « Tes relevés » d’Évolution (choix de Claude : pas une nouvelle liste
  par ligne, pour ne pas doubler le chemin).

## Précisions après relecture (choix de Claude)

- **La propagation se fait dans les deux sens** et **champ par champ**, comme `correctFigures` aujourd’hui
  (`lib/correct/snapshot-changes.ts:52-61`) : un champ corrigé l’est aussi dans les relevés voisins, avant et après,
  tant qu’ils portaient exactement l’ancienne valeur de ce champ, sans interruption. Une ancienne valeur inconnue
  (`null`) ne se propage pas (comme aujourd’hui, l. 56). L’écran annonce le nombre de relevés touchés en plus de celui-ci.
- **Si la propagation atteint le dernier relevé** (le même chiffre faux a été repris jusqu’à aujourd’hui), elle le corrige
  aussi, et l’écran le dit à la place de « inchangé » : « Aujourd’hui aussi : ce chiffre était le même, il est corrigé. »
  La phrase de la page reste juste pour le cas courant. Pendant une mise à jour, la propagation s’arrête avant le dernier
  relevé, et l’écran le dit.
- **Pas d’effacement dans le passé** : sur un relevé passé, une case laissée vide alors que le chiffre était connu est
  refusée (« Un chiffre de ce jour-là ne peut pas être effacé. ») ; le dernier relevé garde son comportement actuel.
- **Le total et les lignes de la page** suivent le même filtre que « Tes relevés » (`convertible` et « sans chez toi »,
  `lib/screens/evolution.ts:148-165`) : la page montre les mêmes lignes que celles qui font son total. Un relevé que la
  liste ne montre pas (taux manquant) n’a pas de page. « le dernier » ne marque que le relevé le plus récent, et
  seulement s’il est dans la liste.
- **Au moment d’enregistrer**, on relit tout (comme `saveCorrection`) : si le chiffre de ce relevé a changé entre-temps,
  ou si le nombre de relevés touchés n’est plus celui annoncé, on refuse avec la phrase existante de la fiche quand les
  chiffres ont changé, et l’écran se recharge.
- **Mise à jour en cours** : le refus du dernier relevé reprend la phrase existante `LOCKED_UPDATE`
  (`lib/screens/line-words.ts:43`) ; « Ses relevés précédents › » reste accessible depuis une fiche verrouillée. Un
  brouillon illisible continue de tout bloquer.
- **L’écran de correction** : le formulaire `FiguresEdit` est repris, mais son titre, ses étiquettes et son bouton
  deviennent des paramètres (aujourd’hui « Enregistrer » est fixe, `FiguresEdit.tsx:142`) ; c’est du nouveau code, pas
  seulement des mots.

## Ce qu’on ne fait pas

Changer la date d’un relevé ; supprimer ou fusionner des relevés ; ajouter ou fermer une ligne dans le passé ; changer
le type d’une ligne (montant ↔ parts) dans un relevé passé (on corrige dans le format de ce relevé-là) ; toucher aux
taux de change (une ligne en devise se corrige dans sa devise, le taux de ce jour-là reste) ou aux cours suivis ; faire
de la grille « relevé par relevé » un éditeur ; corriger plusieurs relevés d’un coup ; mettre une case vide : un vide
dans un relevé passé ne vaut jamais zéro (on ne peut pas effacer un chiffre).

## Cas limites (choix de Claude)

- Une ligne absente de ce relevé (ajoutée plus tard) n’apparaît pas sur sa page.
- Une ligne fermée apparaît sur les relevés où elle existait, et se corrige.
- Le dernier relevé : sa page est la même ; corriger y fait exactement ce que fait la fiche aujourd’hui (`correctFigures`,
  qui corrige aussi vers l’arrière les relevés identiques).
- Les « versés » d’un compte (`Snapshot.contributions`) ne se corrigent pas dans cette version ; ils viendront avec
  « Montant investi ».
- L’exemple n’a pas de relevés à corriger : rien n’y change.

## Rien de nouveau ne part en clair

Les relevés sont des documents chiffrés ; une correction réécrit le relevé concerné (et ceux qu’on corrige avec lui) par
son identifiant, comme aujourd’hui (`saveCorrection`). Aucun nouveau champ, aucune nouvelle route serveur.

## Ce qui prouve que ça marche

- Une fonction pure de correction à une date (le relevé choisi, la ligne, les chiffres → les écritures, avec la
  propagation vers l’avant et l’arrêt avant le dernier relevé pendant une mise à jour), testée sans navigateur.
- Une vue pure de la page d’un relevé (`lib/screens`), testée : banques dans l’ordre de la mise à jour, lignes absentes
  exclues, fermées incluses, total et valeur d’un carré.
- Les tests d’Évolution (rangées en liens, « le dernier », plus de valeur d’un carré) et de la fiche.
- Un parcours e2e : un compte avec deux relevés, ouvrir le plus ancien depuis Évolution, corriger une ligne, voir la phrase
  « Corrigé… », et voir le total de ce relevé changer dans « Tes relevés ».
