# Les intérêts des livrets — design

Décidé par Nicolas le 14 novembre 2026. Ce document fait foi.

## Pourquoi

« D’où ça vient » compte toute la variation d’un livret comme de l’effort (`change: 'all'` dans `lib/catalog.ts`,
branche finale de `walk` dans `lib/model/change.ts`). Les intérêts, versés chaque 31 décembre, gonflent donc
« Ton effort » au lieu de « Les marchés et les intérêts ». Presque tout le monde a un livret.

Demander le chiffre ne marche pas : la banque l’affiche, mais personne ne le regarde (Nicolas : « il y a une ligne à
la banque mais je ne la regarde pas »). Le site l’estime donc lui-même.

## Ce qui est décidé (Nicolas)

1. **Une estimation automatique, rien à taper**, pour les livrets réglementés dont l’État fixe le taux : Livret A,
   LDDS (même taux que le Livret A) et LEP (`livret-a`, `ldds`, `lep`).
2. **Rien d’autre ne change** : le livret jeune (taux libre, au moins celui du Livret A), le PEL/CEL (taux propre au
   contrat), « Autre livret » et le compte courant restent comptés comme aujourd’hui.
3. **L’estimation va dans « Les marchés et les intérêts »**, et la petite phrase de cette rangée devient, seulement
   quand la période contient des intérêts estimés : « ce que ton argent a rapporté tout seul, intérêts des livrets
   estimés compris ». Sinon elle reste « ce que ton argent a rapporté tout seul ». Pas de montant à part.

## Le calcul (choix de Claude, à vérifier par le constructeur)

- Les intérêts d’une année Y sont crédités au 31 décembre Y. Entre deux relevés consécutifs `before` et `after`, chaque
  31 décembre D tel que `before.takenOn` ≤ D et `after.takenOn` > D apporte une estimation pour l’année de D.
- Estimation pour l’année Y d’un compte = solde du compte au relevé `before` (en euros, ses lignes additionnées) × taux
  moyen de l’année Y pour ce type (moyenne des taux en vigueur, pondérée par les jours), arrondie au centime. Un compte
  absent de `before`, ou à 0, n’a pas d’intérêts estimés (sous-estimation assumée pour un livret ouvert dans l’année).
  Plusieurs 31 décembre dans la même période : une estimation par année, chacune sur le même solde `before`.
- **Par compte, une fois** : le solde `before` est la somme des lignes du compte présentes dans les deux relevés (une
  ligne fermée ou ajoutée dans la période n’y entre pas) ; l’estimation est arrondie au centime par compte et par année,
  puis appliquée une fois au compte, après la boucle des lignes de `walk` : `markets += intérêts`, `effort −= intérêts`
  (un retrait reste un retrait, intérêts déduits). Le total ne bouge pas. Un livret est en euros ; une ligne dans une
  autre devise sur un livret n’est pas estimée.
- `ChangeSplit` gagne la part estimée (par exemple `estimatedInterest`), pour que les écrans sachent quand changer la
  petite phrase ; un écran ne recalcule rien.
- La rangée et sa phrase viennent de `splitView` (`lib/update/result.ts`), partagée par l’écran de fin de mise à jour
  et Évolution : les deux suivent. Piège : `splitOf` (`lib/screens/evolution.ts`) additionne lui-même chaque champ de
  `ChangeSplit` sur plusieurs relevés ; le nouveau champ s’y ajoute, sinon la phrase ne changerait jamais sur Évolution.
  L’exemple passe par `evolutionView` et suit tout seul.

## La table des taux

- Une seule liste dans le code, par type et par date d’effet (1er février et 1er août), avec ses sources en commentaire.
- **Chaque taux est vérifié sur une source officielle** (Banque de France ou service-public.fr) au moment de l’écrire.
  Une recherche du 14 novembre 2026 donne, par des sites spécialisés, à revérifier : Livret A 3 % (février 2023), 2,4 %
  (février 2025), 1,7 % (août 2025), 1,5 % (février 2026), 1,7 % (août 2026) ; LEP 3,5 % (février 2025), 2,7 % (août
  2025), 2,5 % (février 2026 et août 2026). Les sources ne concordent pas toutes : ne rien écrire sans l’officiel.
- Si une source officielle ne donne pas une période, la table commence à la première date vérifiée (choix de Claude) :
  on livre une table partielle plutôt que de bloquer, et le compte rendu dit jusqu’où elle remonte.
- Avant la première date de la table : pas d’estimation (comportement d’aujourd’hui). La table remonte au moins à 2015
  pour couvrir des relevés importés par l’Excel.
- Après la dernière date connue, le dernier taux reste valable. Mettre la table à jour à chaque changement de taux
  (au plus deux fois par an) ; une ligne dans CLAUDE.md le rappelle.

## Ce qui va bouger

- Les chiffres de « D’où ça vient » de tous ceux qui ont un Livret A, un LDDS ou un LEP et des relevés de part et
  d’autre d’un 31 décembre : une partie de l’effort passe en « marchés et intérêts ». C’est le but.
- **Les huit profils de la revue des calculs** (`lib/screens/__tests__/profils/`) : ceux qui ont un livret sur un
  31 décembre verront leurs chiffres attendus changer. C’est un changement de règle voulu par Nicolas : réécrire ces
  chiffres seulement après les avoir montrés, profil par profil (ancien → nouveau, et pourquoi), dans le compte rendu.
  Le profil `thomas` déclare des versements sur son Livret A, que le calcul ignore déjà pour un livret : on ne les
  touche pas, on montre seulement l’écart.
- **L’exemple** (`lib/example/person.ts`, un Livret A et des relevés de part et d’autre du 31 décembre 2025) bouge
  aussi, et son test (`lib/example/__tests__/person.test.ts`) le fige : même traitement que les profils.

## Hors champ

Les dividendes en espèces, le PEE débloqué, l’achat du logement en vue « sans chez toi », le taux de change manquant,
le crédit en devise : chantiers à part. Rien de nouveau ne part vers le serveur (la table des taux vit dans le code).
