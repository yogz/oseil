# Le total versé — design

Décidé par Nicolas le 14 novembre 2026 (planche 10C). Ce document fait foi pour les mots et le comportement.

## Pourquoi

« D’où ça vient » partage la hausse de l’argent entre l’effort (ce que la personne a mis) et les marchés. Sur
certains comptes, le site le devine mal :

- **assurance vie, PER, épargne salariale** (`change: 'contributions'` dans `lib/catalog.ts`) : la mise à jour demande
  aujourd’hui « Combien a été versé dessus ? Depuis le {date} » (`components/update/ContributionField.tsx`). Personne
  ne connaît ce chiffre entre deux dates ; la case reste vide, et tout ce qui a bougé est compté en marchés
  (`after.contributions[accountId] ?? 0`, `lib/model/change.ts`), versements automatiques compris ;
- **un compte en bourse, l’or ou la crypto saisis en montant** (`change: 'cost-basis'`, lignes `amount`) : par exemple
  un robot-advisor dans un compte-titres. Pour une ligne en euros, toute la variation y est comptée comme de l’effort,
  gains compris (en devise, seul l’effet du taux va déjà aux marchés).

La banque, elle, affiche presque toujours un total versé depuis l’ouverture. La personne le recopie à chaque relevé et
le site fait la soustraction.

## Ce qui est décidé (Nicolas)

1. **Une seule question, le total.** « Combien a été versé dessus ? » disparaît de la mise à jour, remplacée par
   « Total versé depuis l’ouverture ». On ne garde pas les deux cases.
2. **Facultative, et le site continue de deviner sans rien dire** quand elle est vide : pas de manque dans « À
   compléter ».
3. **Elle s’ouvre vide**, jamais pré-remplie. Le total du relevé précédent est rappelé dessous.
4. **Planche 10C** : une fois le chiffre tapé, une phrase dit ce que le site en déduit.
5. **Aussi pour un compte ajouté pendant une mise à jour**, pas au premier lancement (qui reste court) ; le total
   d’un compte venu du premier lancement s’ajoute plus tard, depuis la page d’un relevé. Pour un compte ouvert
   (`arrivals: 'opened'`) avec un total, l’effort est ce total et le reste de sa valeur va aux marchés.
6. **Aussi sur la page d’un relevé passé** (planche 10D, montrée pour voir) : on peut y recopier ou corriger le total de
   ce jour-là.

## Les mots (planche 10C)

- Étiquette : « Total versé depuis l’ouverture »
- Dessous, une fois tapé et quand le total précédent est connu : « Soit {X} € versés depuis le {date courte} » ; si le
  nouveau total est plus petit : « Soit {X} € retirés depuis le {date courte} » ; égal : « Rien versé depuis le
  {date courte} » (deux derniers cas : choix de Claude, à montrer sur planche si Nicolas le souhaite).
- Aide : « Au relevé du {date courte} : {total précédent}. Recopie le chiffre de ta banque, souvent appelé
  « versements » ou « montant investi ». Tu as retiré de l’argent ? Prends le total moins les retraits. Pas sous les
  yeux ? Laisse vide. » La première phrase n’apparaît que si le total précédent est connu. Pour l’épargne salariale,
  ajouter « ton employeur compris » comme aujourd’hui.
- Page d’un relevé (10D) : une rangée par compte concerné, « Total versé sur {nom du compte} », avec le montant ou
  « à recopier », et « › ».
- Espaces insécables et apostrophes courbes (test de typographie).

## Où la case apparaît

- Sur les trois comptes `contributions`, à la place de l’ancienne question, sous « Total du compte ».
- Sur un compte `cost-basis` (PEA, PEA-PME, compte-titres, or, crypto) **qui a au moins une ligne saisie en montant**
  dans ce relevé. Un compte suivi uniquement en parts avec un prix moyen n’en a pas besoin : le prix moyen fait déjà
  le calcul (choix de Claude).
- Elle reste aussi sur un compte `cost-basis` qui avait un total au relevé précédent, même s’il n’a plus de ligne en
  montant (choix de Claude) : le calcul suit le total dès qu’il existe des deux côtés.
- Jamais sur les livrets, le compte courant, le logement, le crédit, « Autre compte ».
- **Une banque passée pendant la mise à jour** : ses chiffres sont recopiés du relevé précédent (`lib/update/build.ts`),
  son total aussi (choix de Claude). Le compte n’a pas bougé, son total non plus ; la chaîne ne se casse pas.

## Le calcul

- **Ce qui est gardé, c’est le total tel qu’il est tapé**, par compte et par relevé, dans le relevé chiffré. Le site ne
  stocke jamais un écart calculé à sa place : corriger un total passé doit corriger tout seul les deux écarts voisins.
- Entre deux relevés, **si le compte a un total dans les deux**, il se traite d’un bloc, comme un compte
  `contributions` aujourd’hui : effort = total après − total avant ; marchés = le reste de la variation du compte.
  Cela vaut aussi pour un compte `cost-basis`, dont les lignes en parts sortent alors de leur calcul ligne par ligne
  (sinon l’argent serait compté deux fois).
- **Sinon, la règle d’aujourd’hui** : pour un compte `contributions`, l’ancien versement tapé s’il existe
  (`Snapshot.contributions`, jamais converti en total), sinon tout en marchés ; pour un compte `cost-basis`, le calcul
  ligne par ligne actuel (l’effet du taux d’une ligne en devise y va déjà aux marchés).
- **Le nettoyage suit celui des versements** : là où `Snapshot.contributions` d’un compte est retiré (une ligne fermée
  qui vide le compte, `withoutLine` dans `lib/correct/snapshot-changes.ts` ; `lib/setup/first-launch.ts` ;
  `snapshotWithoutHome` dans `lib/model/situation.ts`), le total l’est aussi.
- Le premier total recopié n’a pas de précédent : ce relevé-là reste deviné. C’est attendu ; 10D permet de remplir un
  relevé passé pour que le calcul soit juste plus tôt.
- Un total ne se propage pas aux relevés voisins quand on le corrige (contrairement aux chiffres d’une ligne dans
  `correctFiguresAt`) : chaque relevé a le sien (choix de Claude).
- La mention de l’écran de résultat (« Rien n’est noté comme versé sur « … » », `lib/update/result.ts`) reste pour un
  compte qui a bougé sans total ni versement connu ; ses mots s’adaptent au total si besoin (choix de Claude). La phrase
  d’Évolution « Les versements sur ton {compte} ne sont pas connus » (`splitOf`, `lib/screens/evolution.ts`) suit la même
  règle, pour que les deux écrans ne se contredisent pas, et ne vise un compte `cost-basis` que s’il est traité d’un bloc.

## Ce qui n’est pas touché

- Les huit profils de la revue des calculs (`lib/screens/__tests__/profils/`) n’ont pas de total : leurs chiffres ne
  doivent pas bouger. S’ils bougent, c’est un changement de règle à montrer à Nicolas.
- Le détail de « D’où ça vient » compte par compte : chantier suivant, pas ici.
- Rien de nouveau en clair : le total vit dans le relevé chiffré, comme les montants.

## L’Excel

L’onglet « Versements » gagne une colonne « Total versé », à côté de « Versé » (choix de Claude) ; l’import l’accepte,
les consignes « Pour une IA » le décrivent, la fixture e2e est refaite (`npx tsx scripts/e2e-fixture.ts`). Une rangée
peut porter l’un, l’autre ou les deux : « Versé » devient facultatif quand « Total versé » est rempli. Une rangée qui
ne porte qu’un total est acceptée aussi sur un compte `cost-basis` ; « Versé » reste refusé hors des comptes
`contributions` (`contributionNotAllowed`). Les consignes et les refus restent tirés des mêmes listes.

## Laissé au constructeur

Les noms dans le code, la forme exacte du champ dans `Snapshot` et `UpdateDraft` (absent dans les anciens documents,
lus sans erreur), l’écran de correction d’un total depuis 10D (réutiliser `/releve/[id]` et `saveCorrection`), les
tests.
