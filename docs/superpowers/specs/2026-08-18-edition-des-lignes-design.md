# Éditer ses lignes

Spécification de conception — 18 août 2026

## Pourquoi

Les 46 lignes du patrimoine ont été créées une seule fois, par `scripts/import-numbers.ts`.
Depuis, rien dans l'application ne sait en créer une, en corriger une, ni en retirer une. Le seul
`insert` sur `assets` est celui du script de reprise ; la seule mise à jour est
`saveQualification`, qui ne touche que l'enveloppe et les attributs de qualification, et
uniquement tant que la ligne figure encore dans la file « À qualifier ». La colonne
`assets.archived_at` existe depuis le premier jour et n'est **jamais écrite** — seulement lue.

Un patrimoine évolue : on achète, on vend, on se trompe de rangement. L'outil ne le permet pas.

## Ce que le débat a établi

Le propriétaire a mis en cause la notion même de relevé, soupçonnant que la photo globale était la
cause du blocage. Trois analyses contradictoires ont été menées — modélisation de données, usage
produit, et défense de l'existant. Elles convergent sur trois points :

1. **L'écran manque, et c'est la cause principale.** Créer, corriger, archiver est impossible
   *quel que soit* le modèle de valorisation. Le relevé récolte le blâme d'un écran jamais
   construit.
2. **Le modèle par transactions est à écarter.** Sur 46 lignes, 9 sont cotées ; les 37 autres sont
   28 soldes, 7 valeurs saisies à la main et 2 biens immobiliers. Un journal d'achats et de ventes
   ne sait rien dire d'un livret ni d'une résidence, et ferait payer une charge de saisie que la
   spec du 13 août refuse explicitement.
3. **La fraîcheur doit se porter au grain de la ligne, pas au grain de la photo.** Aujourd'hui, le
   brouillon recopie les 37 lignes non cotées depuis le relevé précédent et les enregistre avec le
   statut `manual` — « saisi à la main ». Rien ne distingue « je viens de vérifier mon livret » de
   « personne n'a regardé ça depuis six mois », et le relevé sort estampillé `confirmed`. C'est
   exactement ce que la règle de la maison interdit partout ailleurs : une valeur jamais choisie
   se présente comme une valeur confirmée.

Le désaccord porte sur la suite : faut-il remplacer la photo par une valeur datée par ligne ? La
décision est de **ne pas trancher maintenant, et de rendre le tranchage possible** — en trois
temps :

| Temps | Objet | Pari pris |
|---|---|---|
| **1** | L'écran de gestion des lignes | Aucun. Nécessaire dans tous les scénarios. |
| **2** | L'âge réel de chaque valeur, et la mise à jour d'une ligne seule | Additif. Une colonne, pas une base réécrite. |
| **3** | Décider du modèle, chiffres en main | Différé jusqu'à ce que la donnée existe. |

**Cette spec couvre le temps 1.** Les temps 2 et 3 sont décrits en fin de document pour mémoire,
pas pour être implémentés ici.

## Les cinq gestes

| Geste | Quand | Effet |
|---|---|---|
| **Créer** | J'ai acheté quelque chose de nouveau | La ligne existe, sans valeur, jusqu'au prochain relevé |
| **Corriger** | Mauvais nom, mauvaise enveloppe, mauvaise classe, qualification fausse | La correction vaut pour le présent **et pour l'histoire** |
| **Retirer** | J'ai vendu, j'ai clôturé | La ligne quitte les relevés futurs ; l'historique la garde |
| **Supprimer définitivement** | Doublon, ligne créée par erreur | Proposé **uniquement** si la ligne ne figure dans aucun relevé |
| **Remettre en service** | J'ai retiré à tort, ou l'actif revient | La ligne reparaît dans le prochain relevé |

Deux gestes de disparition plutôt qu'un, parce que vendre et se tromper ne sont pas la même chose.
Le retrait préserve le passé ; la suppression n'est offerte que là où il n'y a pas de passé à
détruire. Le contrôle se fait **au moment du clic**, pas au moment de l'affichage : un relevé peut
être apparu entre les deux.

## Les écrans

### « Mes lignes » devient la porte d'entrée

L'écran existe et reste un tableau groupé par enveloppe ou par classe. Trois changements :

- chaque nom de ligne devient un lien vers sa fiche ;
- un bouton **« Ajouter une ligne »** en tête ;
- les lignes **actives mais absentes du dernier relevé** apparaissent en fin de liste, marquées
  « pas encore relevée ». Jamais 0 €.

Ce dernier point est une correction nécessaire, pas un agrément. `loadValuedLines` part de
`snapshot_lines` : une ligne créée après le dernier relevé n'existe **dans aucune vue**, pas même
dans l'écran censé lister les lignes. Sans ce changement, la création serait invisible.

Le périmètre des vues de consultation ne change pas : elles restent celles du relevé. Seul « Mes
lignes » — écran de gestion — montre l'union du relevé et des lignes actives.

En bas, un bloc replié **« Lignes retirées »**, qui n'apparaît que s'il y en a.

### La fiche d'une ligne — `/lignes/<id>`

Trois blocs.

**Ce qu'elle est.** Nom, enveloppe, classe d'actif, devise, mode de valorisation, symbole. Le mode
de valorisation est présenté en français, jamais par son nom technique :

| Stocké | Affiché |
|---|---|
| `quoted` | Cotée — quantité × cours |
| `balance` | Solde de compte |
| `manual` | Montant saisi à la main |
| `property` | Bien immobilier — valeur moins emprunt |

Le symbole porte un lien vers `/lignes/recherche`, l'écran de recherche de cotation qui existe
déjà et ne sert aujourd'hui à rien : il affiche des symboles sans permettre de les rattacher à
quoi que ce soit.

**Ce qu'elle vaut.** La dernière valeur connue et la date du relevé d'où elle vient — ou « pas
encore relevée ». En lecture seule : corriger un montant passé est un autre chantier.

**Ce qu'on en sait.** Délai de sortie, répartition géographique sur les six zones, émetteur, lien
employeur. Ce sont les champs de `QualifyForm`, désormais atteignables en permanence, y compris
pour une ligne déjà confirmée. La règle du deviné ne change pas : ne pas toucher un champ le
laisse deviné, et le formulaire doit le montrer.

Puis, séparés du reste : **Retirer**, et **Supprimer définitivement** quand il est offert.

### La création — `/lignes/nouvelle`

La même fiche, vide. Exigés : nom, enveloppe, classe, mode de valorisation. Le symbole devient
exigé si le mode est « cotée » — sans lui, le relevé ne saura pas la coter. Les qualifications
restent devinées tant que rien n'est saisi.

Après enregistrement, la fiche propose d'enchaîner sur un nouveau relevé.

## Ce que le retrait ne fait pas, et pourquoi on l'assume

Toutes les vues lisent les lignes du dernier relevé. **Retirer une ligne ne fait donc baisser
aucun chiffre** tant qu'un relevé n'a pas été enregistré.

C'est la règle qui tient l'application : le patrimoine affiché est celui du dernier relevé
constaté, pas une opinion sur aujourd'hui. Faire disparaître la valeur au moment du retrait ferait
dire au relevé du 15 août quelque chose qu'il ne dit pas.

L'écran de retrait l'affiche donc explicitement — « cette ligne compte encore pour X € dans le
relevé du <date> ; enregistrez un relevé pour que sa sortie soit prise en compte » — avec le lien.
Une conséquence tue serait un mensonge par omission.

**Une vente déplace de la valeur, elle n'en détruit pas.** Le portefeuille porte une ligne
d'espèces par enveloppe, ce qui est exactement ce qu'il faut : le produit d'une vente y atterrit.
Mais les deux moitiés du geste ne sont pas liées — rien n'oblige à créditer les espèces en
retirant la ligne vendue. Faire la première sans la seconde produit une baisse que le Journal
n'explique pas, et `decomposeChange` l'impute intégralement à la **performance**. L'écran de
retrait nomme donc la ligne d'espèces de l'enveloppe concernée : « le produit de la vente doit
apparaître sur <ligne d'espèces> au prochain relevé ». Un rappel, pas une écriture automatique :
l'application ne sait pas à quel prix la vente s'est faite, et l'inventer serait pire que se
taire.

La ligne d'espèces d'une enveloppe se reconnaît à sa classe d'actif `liquidites`. Il peut y en
avoir plusieurs, ou aucune : avec une seule, on la nomme ; sinon le rappel reste général — « le
produit de la vente doit apparaître sur la ligne qui l'accueille ». Deviner laquelle quand il y en
a deux serait une affirmation que rien ne fonde.

## La correction est rétroactive, et c'est voulu

Changer l'enveloppe ou la classe d'une ligne change la façon dont **tous** les relevés, passés
compris, sont ventilés : les vues joignent `assets` au moment de la lecture. Les totaux ne bougent
pas, leur répartition si.

C'est déjà le comportement de « À qualifier » pour l'enveloppe, et c'est le bon : une erreur de
rangement corrigée doit l'être partout. Le nom, la devise et le mode de valorisation n'ont aucun
effet rétroactif sur les valeurs : les relevés passés gardent les montants qu'ils ont enregistrés.

## Le modèle de données

**Aucune colonne à ajouter.** `assets` porte déjà tout ce qu'il faut, `archived_at` compris. Les
précautions lourdes de migration avant déploiement ne s'appliquent donc pas.

**Une contrainte à ajouter.** `assets.valuation` est un `text` sans `CHECK`, alors que tous les
autres vocabulaires du modèle en portent un, construit depuis le domaine par la fonction `oneOf`.
Jusqu'ici cette colonne n'était écrite que par un script ; elle va l'être par un formulaire. La
migration ajoute `CHECK ("valuation" in ('quoted','balance','manual','property'))`.

Le raisonnement du `CLAUDE.md` sur l'ordre — migrer avant de fusionner — vise les migrations qui
**ajoutent une colonne**, parce que le code déployé la réclame aussitôt. Ici rien de tel : le code
n'a pas besoin de la contrainte pour fonctionner, et les données existantes la respectent déjà,
donc aucun des deux ordres ne casse quoi que ce soit. On migre néanmoins avant de fusionner, parce
que c'est le chemin sanctionné et qu'une exception qu'on s'accorde une fois se réaccorde. Vérifier
avant application que les 46 lignes portent bien l'une des quatre valeurs.

**La suppression définitive** retire la ligne de `assets` ; `asset_geo_splits` part en cascade.
`snapshot_lines` référence `assets` sans cascade — c'est précisément ce qui rend la vérification
obligatoire, et une suppression tentée sur une ligne ayant un passé échouerait de toute façon au
niveau de la base. Le refus est explicite en amont pour que le message soit lisible, pas pour
compenser une absence de garde-fou.

## Ce qui refuse

Toute anomalie renvoie un message en français dans le formulaire, sans rien écrire — le même
patron que `confirmQualification`, qui valide tout avant la première instruction.

- nom non vide, après suppression des espaces ;
- enveloppe et classe existantes ;
- mode de valorisation parmi les quatre ;
- devise en trois lettres majuscules ;
- symbole exigé si le mode est « cotée » ;
- suppression définitive refusée si la ligne figure dans au moins un relevé ;
- remise en service refusée sur une ligne qui n'est pas archivée.

Chaque action commence par `await requireSession()`, chaque écran par
`await requireSessionOrRedirect()`. `lib/__tests__/server-actions-guarded.test.ts` et
`lib/__tests__/session-gate.test.ts` le vérifient déjà automatiquement pour toute action et tout
écran nouveaux.

## Les tests

Écrits avant le code.

| Ce qui est vérifié | Où |
|---|---|
| Créer une ligne l'ajoute active, sans valeur, avec ses qualifications devinées | test des actions |
| Corriger le nom, l'enveloppe, la classe, la devise, le mode, le symbole | test des actions |
| Une qualification **déjà confirmée** peut être corrigée | test des actions |
| Retirer pose `archived_at` ; la ligne sort du brouillon du relevé suivant | test des actions + `buildSnapshotDraft` |
| Une ligne retirée **reste** dans les relevés passés et leurs totaux | test des vues |
| Supprimer est refusé si la ligne figure dans un relevé | test des actions |
| Supprimer est accepté si elle n'y figure pas, et emporte ses zones géographiques | test des actions |
| Remettre en service efface `archived_at` | test des actions |
| Une ligne retirée quitte la file « À qualifier » et son compteur de navigation | test des actions |
| Le retrait nomme la ligne d'espèces quand l'enveloppe en a exactement une, et reste général sinon | test de l'écran |
| « Mes lignes » affiche une ligne créée après le dernier relevé, marquée, jamais à 0 € | test de l'écran |
| Chaque validation refuse sans écrire | test des actions |

Les tests de base de données passent par PGlite (`lib/db/test-client.ts`), sans base réelle.

## Deux défauts trouvés en chemin

Indépendants de ce chantier, à corriger dans une PR séparée et courte :

1. **Une date passée détruit le relevé de ce jour-là.** Le champ date de `/releve` n'a ni `min` ni
   `max`, et `saveSnapshot` supprime tout relevé portant la date soumise avant d'insérer. Une
   faute de frappe sur l'année écrase un point d'historique, sans confirmation. Le commentaire de
   `snapshots.ts` décrit une immuabilité que le code ne tient pas. Vérifié par lecture.
2. **Le relevé automatique du 1er du mois écrase un relevé confirmé du même jour.** Le cron tourne
   à 6h et enregistre à la date du jour ; le même `DELETE` s'applique. Lecture du code, non testé.

## Pour mémoire — les temps 2 et 3

**Temps 2.** Marquer, par ligne de relevé, si la valeur a été réellement touchée ou reportée, et
depuis quand. Une colonne additive sur `snapshot_lines`, dans la grammaire du dépôt : `NULL` =
mesurée à la date de ce relevé, une date = reportée depuis ce relevé-là. Elle rend possibles deux
choses : afficher « vérifié il y a 4 mois » par ligne, avec un compte réel comme le fait déjà
`GuessedMark` ; et offrir « mettre à jour cette ligne seule », qui écrit dans le relevé du jour
plutôt que d'en créer un — mécanisme déjà permis par `saveSnapshot`, qui remplace un relevé de
même date.

**Temps 3.** Décider, avec les chiffres du temps 2 sous les yeux, si la photo globale reste
l'unité de stockage ou cède la place à une mesure datée par ligne. La décision demande de savoir
quelle part du patrimoine, en euros, repose sur des valeurs périmées — donnée que l'application ne
conserve pas aujourd'hui, et que le temps 2 produit.
