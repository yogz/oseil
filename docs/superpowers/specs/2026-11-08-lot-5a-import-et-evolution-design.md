# Lot 5a — tes deux vrais relevés, et l'écran Évolution

Le 8 novembre 2026. Ce document s'appuie sur la spec d'interface (§4 « Évolution », planches 15 à 17,
et sa note de tête) et sur la spec de fonctionnement (« Ton effort ou les marchés »). Il ajoute ce que
Nicolas a décidé le 8 novembre, noté « Nicolas » ; le reste est un choix de l'assistant, noté comme tel.

Le lot 5 est coupé en deux (Nicolas) : **5a**, l'import et Évolution ; **5b**, Repères, plus tard.

## Pourquoi

Nicolas veut voir l'évolution de son patrimoine, pas une courbe qui commence le 7 novembre 2026.
- Son seul vrai relevé ancien est celui du **16 novembre 2025** (Nicolas). Les autres relevés de
  l'ancien site sont des estimations automatiques, sauf deux en août et un en septembre 2026, qu'il ne
  retient pas.
- Le relevé saisi le 7 novembre 2026 au premier lancement était un essai (Nicolas).
- Son tableau Numbers « Tableau de bord Mes Finances » contient les deux dates, ligne par ligne : le
  16 novembre 2025 (tableau de bord et onglets par compte) et le 5 novembre 2026 (onglets PEA,
  PEA-PME, PER, Air Liquide, Revolut, et un onglet des comptes courants et livrets).
- Il ne veut pas perdre le détail des actions (Nicolas) : un relevé résumé par catégorie ne suffit
  pas.
- Il ne veut pas de bouton « tout effacer » (Nicolas).

## Ce qui est construit

### 1. L'import de deux relevés (une seule fois)

- **Ce que ça produit.** Dans le coffre de Nicolas :
  - son profil, avec ses établissements, comptes et lignes, tirés du fichier ;
  - deux relevés, celui du 16 novembre 2025 et celui du 5 novembre 2026, ligne par ligne (parts, prix
    moyen et prix d'une part pour les titres, montant pour le reste) ;
  - son relevé d'essai du 7 novembre 2026 est supprimé (Nicolas : « remplace ») ;
  - ses objectifs et ses réglages restent tels quels.
- **D'où vient le fichier.** L'assistant prépare, sur le Mac de Nicolas, un fichier d'import à partir
  du tableau Numbers et des chiffres que Nicolas donne pour ce qui manque (voir plus bas). Le fichier
  reste sur le Mac : il n'est ni dans le dépôt ni envoyé nulle part. Il est au format du modèle
  (`Profile` et `Snapshot`, `lib/model/types.ts`), et `parseProfile` / `parseSnapshot` le vérifient.
- **Où il est lu.** Dans le navigateur de Nicolas, connecté, par un écran d'import réservé. Il
  choisit le fichier ; le site le lit en local, le vérifie, montre un résumé (deux dates, nombre de
  comptes et de lignes, total de chaque relevé) et attend « Importer ». Les documents sont scellés
  dans le navigateur, comme d'habitude. **Rien de nouveau ne part en clair.**
- **Qui le fait.** L'assistant peut piloter l'écran dans le Chrome du Mac de Nicolas, une fois que
  Nicolas s'est connecté lui-même ; Nicolas valide le résumé avant « Importer » (Nicolas). L'assistant
  ne lit jamais le mot de passe.
- **Le relevé d'essai** est reconnu ainsi (choix de l'assistant) : le coffre a exactement un relevé
  et aucun brouillon. Le nouveau profil reprend `firstLaunch` du profil existant (premier lancement
  terminé), pour que le site ne renvoie pas au premier lancement. Le relevé d'essai est supprimé par
  `deleteDocument`, exporté par `repository.ts` pour ce seul usage (`deleteSnapshot`).
- **Ce que l'import refuse.** Choix de l'assistant :
  - pendant une mise à jour en cours, ou si une donnée du coffre est illisible ;
  - si le profil existant a plus d'un relevé, ou un relevé autre que celui à remplacer : l'import est
    fait pour remplacer le seul relevé d'essai, pas pour écraser un historique ;
  - un fichier qui ne passe pas `parseProfile` / `parseSnapshot`, ou dont un relevé cite une ligne
    absente du profil.
- **L'ordre des écritures.** Choix de l'assistant, pour qu'une coupure ne laisse jamais un coffre
  illisible : d'abord le nouveau profil (il contient les lignes des deux relevés), puis le relevé
  2025, puis le relevé 2026, puis la suppression du relevé d'essai. Les identifiants des relevés sont
  tirés d'avance (`addSnapshot`), donc refaire l'import après une coupure ne crée pas de doublon. Tant
  que le relevé d'essai existe encore, l'écran le dit et propose de finir.
- **L'écran d'import** n'apparaît dans aucun menu. Il disparaît (ou se fige) après usage : une fois
  le coffre à deux relevés, il refuse. Choix de l'assistant : une page `/importer`, sans lien, qu'on
  pourra retirer au lot 6.

### 2. Comment les lignes de 2025 et de 2026 se rejoignent

- **Même titre, même ligne.** Une ligne présente aux deux dates est une seule ligne du profil, avec
  une entrée dans chaque relevé : par exemple Air Liquide dans le PEA, Sanofi, LVMH, OVHcloud, le
  profil offensif, les fonds monétaires Revolut. La reconnaissance se fait par le nom (le fichier 2025
  n'a pas de code ISIN) ; l'assistant propose les rapprochements et Nicolas les valide.
- **Une ligne de 2025 absente en 2026** (vendue, ou fonds remplacé, comme le MSCI World Amundi
  remplacé par celui d'iShares dans le PEA) est **fermée** au 5 novembre 2026 : elle a sa valeur en
  2025 et n'apparaît plus ensuite (`closedOn`, règle du lot 4c).
- **Une ligne nouvelle en 2026** a son arrivée marquée « ouvert depuis » (`arrivals`), sauf si
  Nicolas dit qu'il l'avait déjà. Ainsi un fonds remplacé par un autre dans le même compte
  s'équilibre (la sortie de l'ancien et l'entrée du nouveau se compensent dans l'effort). En
  préparant le fichier, l'assistant montre à Nicolas la liste des lignes nouvelles (PEE, logements,
  OpenAI, Girardin, assurance-vie s'ils n'existaient pas en 2025) et il dit, pour chacune, « nouveau »
  ou « je l'avais déjà ».
- **Les noms changés** (les « CAP IMMO 5xx » du PEA-PME en 2025, avec des noms de projets en 2026)
  sont rapprochés seulement si Nicolas le confirme ; sinon, ce sont des lignes fermées et des lignes
  nouvelles.
- **Les codes ISIN** de 2026 donnent le symbole de prix (`quoteSymbol`) quand la recherche Yahoo le
  trouve : l'assistant les résout au moment de préparer le fichier, et Nicolas les voit dans le résumé.
  Une ligne sans symbole garde son prix tapé.
- **Les devises.** Les fonds monétaires Revolut en dollars et en livres sont des lignes en USD et en
  GBP, avec le taux de chaque relevé (`fx`) : le fichier donne le cours utilisé (0,85 et 1,12 en 2025,
  1,198 pour la livre en 2026).

### 3. Ce qui manque au tableau

**Les logements** (Nicolas, 8 novembre) : leur valeur estimée est la même aux deux dates, celle de
2026 ; l'estimation de l'ancien site en 2025 était fausse. Le restant dû de 2025 vient de l'ancien
site, celui de 2026 de Nicolas. La résidence principale a deux crédits en 2026 ; en 2025, l'ancien
site n'en connaissait qu'un total. Choix de l'assistant : ce total de 2025 est porté par le plus gros
des deux crédits, l'autre est à 0 en 2025. Le total dû et l'effort (la baisse de la dette) sont
justes ; seule la répartition entre les deux crédits en 2025 est approchée.

**Ce que Nicolas ajoutera lui-même plus tard** (Nicolas, 8 novembre), à une mise à jour, avec « je
l'avais déjà » : ce qui n'est pas dans le fichier. Le PEE OVHcloud de 2026 est donné par Nicolas
(8 novembre) et importé ; l'assurance-vie est fermée et n'était pas dans le relevé de 2025. Le PEE Criteo (un fonds
monétaire de 223,27 € en 2025) est toujours détenu ; Nicolas n'a pas sa valeur de 2026 : il est
importé en 2026 à la même valeur, à corriger par sa fiche quand il la connaîtra (choix de l'assistant,
montant minime). Ce qui est dans le tableau de 2025 est importé. OpenAI a la même valeur aux deux dates
(Nicolas) : il est importé en 2025 et en 2026. Le Girardin a été remboursé (Nicolas), et le relevé
de 2025 ne le contenait pas : il n'est importé nulle part.

Restait à demander, ce qui suit :

- Les deux PEE (Criteo, OVHcloud) au 5 novembre 2026.
- Les deux logements (résidence principale et bien loué) : leur estimation et ce qui reste dû sur
  chaque crédit, aux deux dates. Le tableau 2025 ne donne que la valeur nette des crédits.
- OpenAI et le Girardin, aux deux dates.
- L'assurance-vie, s'il en a une (l'ancien site en avait une).
- Les versements de l'année sur le PER et les PEE (« Combien a été versé dessus ? »), s'il les
  connaît. Sinon, voir « D'où ça vient ».

### 4. L'écran Évolution

Construit selon la spec d'interface §4 et les planches 15 à 17, l'onglet « Évolution » devient actif.
Rappel de ce qu'elle fixe :
- « Depuis ton premier relevé : +X € sur ce qui est à toi », et la valeur d'un carré alors et
  aujourd'hui ;
- la courbe de ce qui est à toi : vrai calendrier, interpolation monotone qui n'invente ni pic ni
  creux, voile en dégradé (seul fichier autorisé : `components/evolution/EvolutionChart.tsx`), prochain
  cap en pointillé, graduation de droite en valeur d'un carré, dessin à l'ouverture, bulle accrochée au
  relevé le plus proche ;
- « Tes objectifs » : les carrés pas à leur place, relevé par relevé, et la trace de chaque catégorie ;
- « D'où ça vient » : la progression partagée entre ton effort, les marchés et les intérêts, et ta
  maison réestimée, comme le résultat de la mise à jour (note de tête de la spec d'interface,
  planche 21), avec les règles de « Ton effort ou les marchés » ;
- « Tes relevés » : date, montant, valeur d'un carré ;
- avec un seul relevé : « Ta courbe commence ici », comme la planche 15.

Choix de l'assistant, là où la spec se tait :
- **Les objectifs d'un relevé** se comparent aux objectifs en vigueur à sa date ; un relevé plus
  ancien que tous les objectifs (les deux relevés importés : ses objectifs datent du 7 novembre
  2026) se compare aux premiers objectifs fixés, et l'écran le dit (« comparé à tes premiers
  objectifs »). Ainsi chaque relevé a sa rangée.
- **Un versement inconnu** sur une assurance-vie, un PER ou une épargne salariale n'est pas inventé :
  si le relevé n'a pas de versement pour ce compte (clé absente de `contributions`), toute sa
  variation est rangée dans les marchés, et une phrase le dit sous « D'où ça vient » (« Les
  versements sur ton PER ne sont pas connus : sa hausse est comptée dans les marchés. »). Un
  versement donné à 0 est écrit 0 : il est connu, aucune phrase.
- **Deux relevés seulement** donnent une courbe de deux points : c'est voulu, la courbe s'enrichira à
  chaque mise à jour.
- **Les montants en devise** sont convertis au taux de leur relevé, jamais au taux du jour.
- **La ligne « Tes relevés »** n'ouvre rien dans ce lot : corriger un relevé ancien viendra plus tard.

## Contraintes

- Rien de nouveau ne part en clair. Le fichier d'import ne quitte pas le Mac ; seuls des documents
  scellés partent, par les fonctions existantes.
- Pas de migration, pas de nouvelle table. Free tier.
- Une réponse qu'on ne peut pas donner se dit, jamais un 0.
- Jetons du design, `min-h-11`, sombre seulement, « le crédit n'est jamais en rouge ».
- Rythme (Nicolas, 08/11) : relecture à chaque étape pour l'import (il touche ses données), une seule
  relecture d'ensemble pour l'écran Évolution ; effort moyen pour construire les étapes d'affichage.

## Hors du lot

- Repères (lot 5b).
- Corriger un relevé ancien depuis « Tes relevés », saisir d'autres relevés passés à la main.
- Reprendre les relevés estimés de l'ancien site.

## Laissé à la construction

- Le format exact du fichier d'import, tant que ce sont un `Profile` et des `Snapshot` valides.
- La mise en page d'Évolution au-delà des planches, et les mots des phrases nouvelles (à lister à
  Nicolas).
