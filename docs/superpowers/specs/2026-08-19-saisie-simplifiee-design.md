# La saisie — mettre à jour son patrimoine sans cérémonie

19 août 2026

## Le problème

« La saisie, la mise à jour des données est très chiante. Plein de clics partout. »

Trois gestes font mal, et ce n'est pas la frappe : c'est le trajet et la cérémonie autour.

- **Mettre à jour les valeurs** demande d'ouvrir le menu « Gérer », d'y trouver « Nouveau relevé »
  — un nom qui sonne administratif pour un geste qu'on fait tous les mois.
- **Corriger une ligne** demande quatre à cinq clics : Gérer, Mes lignes, déplier le groupe,
  cliquer la ligne, puis seulement écrire.
- **Ajouter une ligne** demande six champs, et **la ligne naît sans valeur**. Elle s'affiche
  « pas encore relevée » et il faut refaire un relevé derrière pour lui donner un montant :
  deux formulaires pour un seul geste.

Le propriétaire a moins de dix lignes. Le formulaire complet tient donc déjà sur un écran — ce
qui coûte, c'est d'y arriver, pas sa longueur. Et il alterne deux rythmes : une session complète
de temps en temps, des corrections ponctuelles entre deux. Les deux doivent mener au même endroit.

Enfin, sur l'écran lui-même : « c'est moche, ça fait très formulaire. » Le diagnostic est
précis. `/releve` est le seul écran qui n'utilise **aucun** composant des cinq vues : chaque ligne
est encadrée dans une boîte, chaque champ porte une étiquette au-dessus et un contour complet, et
la page est réglée sur la largeur maximale du projet. Dix boîtes, vingt rectangles, quinze mots
parasites.

## Le principe

**L'écran de saisie n'est pas un formulaire, c'est le tableau « Mes lignes » dans lequel on
écrit.** Même gabarit, mêmes filets, mêmes chiffres alignés. Tout le reste en découle.

## 1. Le trajet

« Nouveau relevé » quitte le menu « Gérer » et devient **« Mettre à jour »**, visible en
permanence depuis n'importe quel écran. Le mot change avec la place : « nouveau relevé » nomme un
document, « mettre à jour » nomme le geste.

`/lignes/[id]` reste ce qu'il est — la fiche d'une ligne — et cesse d'être le chemin normal pour
saisir.

**Un seul bouton « Enregistrer » suffit pour les deux rythmes, et c'est honnête.** `figureFrom`
(`lib/domain/freshness.ts`) fait qu'une ligne dont le chiffre du propriétaire n'a pas changé
**garde la date qu'elle avait** : elle ne rajeunit pas parce qu'un relevé a été pris. Ouvrir,
corriger une ligne, enregistrer ne ment donc sur l'âge d'aucune autre.

## 2. L'écran de mise à jour

Une rangée par ligne, séparées par un filet, le nom à gauche, le montant à droite en chiffres
tabulaires. Un total en pied sous le trait épais de `.tbl`, qui se recalcule pendant la frappe.
Gabarit `tableau` (~920 px) et non `saisie` (~1200 px) : à deux colonnes, la largeur de « Mes
lignes » est la bonne. C'est un écart assumé à la spec du design system, qui rangeait `/releve`
sous le gabarit large quand il était encore une grille de boîtes.

### La grammaire du trait

Le vocabulaire des vues de lecture est déjà pris : **un trait = un seuil ou une cible**. Il porte
du sens parce qu'il **varie** — sa position ou sa longueur disent quelque chose de cette
valeur-là. Un trait identique sous chaque montant modifiable ne décrit pas une valeur, il décrit
un mode. Les deux cohabitent à condition de rendre la règle explicite, sans exception :

- filet **sur toute la largeur de la rangée** = structure ou seuil ;
- filet **de la largeur du nombre seul**, jamais au-delà = surface d'écriture.

Trois contraintes rendent la règle lisible : le filet d'écriture garde **8 px** sous la ligne de
base pour ne jamais toucher le filet de rangée, il s'arrête au bord droit de la colonne, et il
n'apparaît **que** sur les montants modifiables. Ni pointillé ni tireté : `--estimated` en tireté
veut déjà dire « estimé » dans `ConfidenceMark`.

Un chiffre **calculé** — le net d'un bien, la valeur d'une ligne cotée, le total — s'affiche en
`--estimated`, sans filet. Cette opposition (encre pleine + filet / gris sans filet) porte à elle
seule l'affordance ; le filet ne fait que la confirmer.

### La couleur du filet

Ni `--hairline` ni `--rule` ne peuvent la porter. Contrastes mesurés sur `--ground` :

```
hairline / ground   1,19
rule / ground       2,13
measure / ground    5,61
```

WCAG 1.4.11 demande 3:1 pour la limite qui identifie un composant d'interface. Il faut donc un
jeton dédié — `--writable`, `#8A8270` sur papier (**3,63**) et `#6C7686` en mode sombre
(**3,79**). C'est la seule couleur ajoutée par ce chantier.

Le **focus** reste l'`outline: 2px solid var(--measure)` déjà défini au niveau `base` dans
`globals.css`. Ne pas le remplacer par une bordure, ne jamais poser `outline: none` : le filet
dit « ceci se modifie », l'outline dit « tu es ici ». Deux rôles, deux traits.

L'usage du terracotta pour le focus est légitime et non une dilution : l'accent marque l'endroit
où une mesure se prend, et un champ actif est littéralement l'endroit où la lecture est en train
d'être relevée. En revanche, **un seul terracotta à l'écran à la fois** — pas de fond teinté sur
la rangée active, pas de lien accentué ailleurs sur la page.

### Typographie et rythme

L'échelle du projet a six marches — 12, 14, 16, 20, 28, 40 — et l'espacement six valeurs — 4, 8,
12, 16, 24, 40. Les champs sont à **16 px** (c'est aussi le plancher qui évite le zoom
automatique sur iOS), le total à **28 px** en graisse 600, le padding de rangée à **12 px**.

Le total ne prend pas `--text-total` (40 px) : cette marche appartient au patrimoine net de
l'accueil, et un brouillon non enregistré ne doit pas s'afficher à la taille du seul chiffre
certain de l'application.

### La gouttière de l'euro

Une gouttière de largeur fixe est réservée à droite de chaque montant : **vide** sur les champs,
**occupée par le €** sur le total. Sans elle, le symbole décale les chiffres du total et rompt la
colonne des unités à l'endroit précis où l'œil en a besoin. Avec elle, l'œil suit une seule
colonne du premier champ jusqu'à la somme, et voit la somme bouger au pied de la colonne pendant
qu'il tape.

### Pas de centimes

`lib/format.ts` est réglé sur `maximumFractionDigits: 0` et l'application n'affiche de centimes
nulle part. Le tableau et le total n'en affichent pas non plus. La saisie les accepte en entrée.

### Les étiquettes

Elles disparaissent visuellement : la colonne dit déjà ce qu'elle contient. Mais un lecteur
d'écran en mode formulaire ne lit **que le nom accessible du champ**, pas les en-têtes de tableau
— `<th scope="row">` ne suffit pas. Chaque champ porte donc un `aria-label` composé du nom de la
ligne et du rôle du champ : « Livret A, solde en euros », « Résidence, valeur du bien »,
« Résidence, capital restant dû », « PEA World, nombre de parts ». Zéro pixel, et un nom unique
par champ — ce qu'exigent les rangées qui en portent deux.

Pour le total : **un seul `aria-live="polite"`**, sur le total, déclenché à la sortie du champ et
non à la frappe — sinon il est annoncé à chaque chiffre tapé. Pas d'`aria-live` par ligne.

### Le téléphone

- **Aucune rangée ne porte deux champs.** La résidence se scinde en deux sous-rangées étiquetées,
  « valeur du bien » et « capital restant dû ». C'est la seule forme qui tienne à 390 px, et elle
  résout du même coup le nom accessible.
- **La cellule entière est la cible de toucher**, `min-h-11` comme partout ailleurs — pas la
  hauteur du texte.
- **Un nom long passe à la ligne**, jamais d'ellipsis : un nom tronqué n'identifie plus rien. La
  colonne des montants est dimensionnée en `ch` de la police mono.
- `app/(app)/layout.tsx` porte déjà `pb-20` pour la barre fixe. Le problème restant est le
  clavier : iOS remonte la barre fixe au-dessus de lui et le champ amené à l'écran atterrit
  dessous. Les rangées portent `scroll-margin-bottom: 5rem`.

### La frappe en français

- **Formater à la sortie du champ, jamais pendant la frappe.** Insérer un séparateur à chaque
  caractère déplace le curseur.
- `formatEur(219935)` produit `"219 935 €"` avec **U+202F** (espace fine insécable) comme
  séparateur de milliers et U+00A0 avant le symbole. Un parseur qui ne nettoie que l'espace
  ordinaire casse dès qu'une valeur formatée est resoumise : normaliser sur `/\p{White_Space}/gu`,
  et accepter la virgule comme le point.
- `type="text"` avec `inputMode="decimal"` — jamais `type="number"`.

### La date ne se modifie pas

Elle s'affiche, elle ne s'édite plus. Antidater un relevé désordonne le calcul de fraîcheur, au
point que `figureFrom` porte déjà une garde contre ce cas (`previousFigureFrom > takenOn`). Le
besoin est quasi nul et le piège est réel.

## 3. Les lignes cotées

**La quantité est modifiable, le cours ne l'est pas.** C'est ce que le domaine dit déjà :
`owned()` dans `lib/domain/freshness.ts` retient **la quantité seule** pour une ligne cotée — le
montant pour un solde, la valeur et la dette pour un bien. Le cours n'y figure pas : le marché
bouge tout seul, le propriétaire non. Comparer le cours ferait paraître chaque ligne cotée
fraîchement relevée tous les mois. Aujourd'hui
`/releve` laisse retaper le cours à la main : rien n'empêche d'enregistrer un prix faux qui sera
conservé comme s'il venait du marché.

La quantité vit **à gauche, sous le nom** — « 14 parts × 128,40 € · cours relevé aujourd'hui » —
et non dans la colonne des montants, qui ne contient qu'une seule chose : un euro aligné au même
bord. Le montant à droite est un calcul, donc en gris, sans filet, et il se recalcule quand la
quantité change. Un `aria-describedby` porte le cours et sa date vers le champ quantité, pour que
le prix soit dit au moment où l'on entre dedans.

**Exception obligatoire : un cours périmé redevient modifiable.** `resolvePrice` rend
`status: 'stale'` quand le marché n'a pas répondu et que le dernier prix connu est réutilisé.
C'est exactement le cas où une main est nécessaire ; l'y retirer supprimerait le recours sur le
seul cas qui le demande. Le cours redevient un champ, accompagné de la marque `stale` déjà
existante.

L'option « saisir le mouvement (+3 parts) » est écartée : le Journal parle déjà des apports et
retraits, et acheter dans un PEA n'en est pas un — l'argent était déjà dedans. Deux écrans qui
parlent d'achats finiraient par se contredire.

## 4. Les cours et le réseau

`buildSnapshotDraft` interroge Yahoo pour **chaque symbole** et le taux de change pour **chaque
devise** à chaque affichage de `/releve`, sans aucune durée de cache : `resolvePrice` appelle le
réseau systématiquement et ne se rabat sur `lastQuotes` que si l'appel échoue. Et le cron qui
rafraîchit tourne **une fois par mois** (`vercel.json` : `0 6 1 * *`).

Un bouton « Mettre à jour » permanent ferait donc payer à une correction de Livret A le coût
entier d'une session complète — l'attente, et parfois un bandeau « 2 lignes n'ont pas pu être
actualisées » alors qu'on ne venait pas pour ça. Le rythme rapide hériterait de tout le poids du
rythme lent.

**L'écran s'ouvre donc sur les derniers cours connus**, chacun affichant sa date, et un bouton
**« rafraîchir les cours »** va chercher le marché quand on le demande. Corriger une ligne au vol
ne coûte plus rien ; la session complète coûte un clic de plus, au moment où l'attente a un sens.

## 5. Ajouter une ligne

- **Le montant entre dans le formulaire de création.** La ligne naît avec sa valeur et entre
  directement dans le relevé du jour ; « pas encore relevée » disparaît du cas normal.
- **« Devise » et « symbole boursier » ne s'affichent que pour une ligne cotée.** L'euro par
  défaut. Un bien immobilier remplace le champ montant par « valeur du bien » et « capital
  restant dû ».
- **Le menu « Comment elle se valorise » devient quatre choix visibles**, en français ordinaire :
  un solde que je relève, un cours de bourse, un chiffre que je pose, un bien immobilier.
- **Pas de « + ajouter une ligne » sur l'écran de mise à jour.** Créer un actif est un autre acte,
  et c'est un lien de navigation posé au milieu d'un formulaire non enregistré : cliqué par
  réflexe, il fait perdre la saisie. L'ajout reste dans « Mes lignes ».

La qualification (délai de sortie, émetteur, géographie) reste un écran à part. C'est un geste
rare et réfléchi ; l'accrocher à la création ferait payer six questions de plus à chaque ajout, et
la règle du projet est explicite — ce qui n'a pas été décidé n'est jamais écrit. La ligne
apparaîtra dans « À qualifier » comme aujourd'hui.

## 6. Un champ vide est refusé

`lineValueEur` **lève une erreur** quand un montant manque — vérifié en l'exécutant :

```
solde vidé -> balance line requires amount
immo vidé  -> property line requires grossValue and debt
coté vidé  -> quoted line requires quantity and unitPrice
```

Ce n'est donc pas un zéro silencieux, mais c'est pire pour l'usage : **tout l'enregistrement
échoue**, sans dire quelle ligne était vide. Le formulaire valide avant d'appeler l'action, pose
le message **sur la ligne fautive**, et conserve tout ce qui a été tapé.

## 7. Après « Enregistrer »

Aujourd'hui : `redirect('/')`, sans un mot. On vient de retaper six chiffres et rien ne dit ce
qui a bougé.

Au retour sur l'accueil, un accusé : quelles lignes ont changé, de combien le total a bougé, et
le rappel que les autres gardent leur date. Puis **annuler ce relevé** — supprimer un relevé
enregistré de travers et revenir à l'état précédent.

L'annulation est une opération destructrice et prend ses propres garde-fous : elle ne vise que le
relevé du jour, elle demande une confirmation, et elle ne peut pas effacer un relevé antérieur.

## Hors périmètre

- **Le brouillon gardé sur l'appareil.** Écarté par le propriétaire. Conséquence assumée : quitter
  l'écran au milieu d'une session perd ce qui est tapé — la réouverture sera simplement devenue
  instantanée. Indépendant du reste, ajoutable plus tard.
- **L'import de fichier ou la connexion bancaire.** La frappe n'est pas le problème.
- **La saisie directement dans les écrans de lecture.** Les cinq vues répondent à des questions ;
  les rendre modifiables les alourdirait toutes, et un chiffre changé par mégarde pendant qu'on
  consulte est une donnée fausse dont personne ne se rend compte.

## Ce que les tests doivent tenir

- Le jeton `--writable` existe en clair et en sombre, et son contraste sur `--ground` est ≥ 3:1
  (le test de design system lit déjà `globals.css`).
- Aucun champ de l'écran de mise à jour n'est sans nom accessible.
- Le cours d'une ligne cotée est en lecture seule quand il est frais, modifiable quand il est
  `stale`.
- Un champ vidé fait échouer la validation avec un message porté par la ligne, et n'atteint pas
  `saveSnapshot`.
- L'ouverture de `/releve` n'appelle pas le réseau ; « rafraîchir les cours » l'appelle.
- Une ligne dont le chiffre du propriétaire n'a pas changé conserve son `figureFrom` après un
  enregistrement complet (le comportement existe, il doit rester couvert).
- La date du relevé n'est pas modifiable depuis l'écran.
