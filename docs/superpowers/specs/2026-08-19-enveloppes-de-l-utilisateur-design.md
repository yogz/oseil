# Les enveloppes appartiennent à celui qui les tient

**19 août 2026 — lot 2 du chantier « plusieurs utilisateurs ».**

## Pourquoi

Les quinze enveloppes de l'application sont écrites en dur dans `scripts/seed-reference.ts` :
Boursobank, Crédit Agricole, PEE Criteo, nominatif pur Air Liquide. Ce ne sont pas des
enveloppes en général, ce sont *les comptes du propriétaire*. Aucun écran ne permet d'en créer
une : il faut lancer une commande.

Deux conséquences, l'une immédiate et l'une à venir :

- **aujourd'hui**, ouvrir un nouveau compte-titres oblige le propriétaire à éditer un fichier
  source et à lancer un script — l'application ne sait pas décrire son propre patrimoine ;
- **demain**, une deuxième personne n'a aucun moyen de décrire le sien.

Ce lot répare le premier point et lève le blocage du second. Il ne rend pas l'application
multi-utilisateur : la propriété des données est le lot 1, qui reste à faire.

## La décision qui gouverne tout le reste

**Une enveloppe est un compte, pas un établissement.**

Le modèle actuel confond les deux. `seed-reference.ts` le dit lui-même en commentaire :

> HYPOTHÈSE, à confirmer par le propriétaire : les trois banques françaises sont classées
> `exonere` en supposant qu'elles n'abritent que des livrets réglementés. […] une banque n'est
> pas un régime, et ce modèle fait comme si.

Tant que le fichier est rempli à la main par quelqu'un qui sait ce qu'il fait, l'hypothèse tient.
Le jour où quelqu'un crée ses propres enveloppes, il écrit « Boursobank » et y range son livret A
et son compte-titres — et l'écran Enveloppes affiche une fiscalité fausse sans que rien ne le
signale. La vue prétend répondre à « est-ce que j'optimise ma fiscalité ? » : elle ne peut pas
reposer sur une qualification que l'utilisateur a saisie au jugé.

Donc : **le type de compte se choisit dans une liste fermée, et le régime fiscal en découle.**
Il n'est jamais saisi, jamais modifiable, jamais stocké. C'est la règle déjà en vigueur ici —
ce qui se déduit ne s'écrit pas.

### La liste fermée des types de compte

| Type | Ce que l'utilisateur lit | Régime déduit |
|---|---|---|
| `livret-reglemente` | Livret réglementé (A, LDDS, LEP) | exonéré |
| `compte-courant` | Compte courant | flat tax 30 % |
| `compte-a-terme` | Compte à terme | flat tax 30 % |
| `pea` | PEA | exonéré |
| `pea-pme` | PEA-PME | exonéré |
| `cto` | Compte-titres ordinaire | flat tax 30 % |
| `assurance-vie` | Assurance-vie | abattement après 8 ans |
| `per` | PER | imposition différée, capital bloqué |
| `pee` | PEE / épargne salariale | imposition différée, capital bloqué |
| `immobilier` | Immobilier direct | flat tax 30 % |
| `non-cote` | Non coté / private equity | flat tax 30 % |
| `dispositif-fiscal` | Dispositif fiscal (Girardin…) | imposition différée, capital bloqué |

Douze entrées, quatre régimes — les quatre qui existent déjà dans `lib/domain/tax-regimes.ts`.
La correspondance vit dans un seul module du domaine, à côté d'eux.

**Cette table est une hypothèse fiscale, pas une vérité.** Elle est écrite ici pour être
corrigée : la corriger corrigera rétroactivement toutes les enveloppes que personne n'a
confirmées. C'est précisément ce que la règle « ce qui n'a pas été décidé n'est jamais écrit »
achète.

### Ce qui disparaît du modèle

- **Le régime fiscal saisi.** Il devient une déduction. La colonne `envelopes.tax_regime` reste
  en base le temps de la reprise (elle sert à deviner le type), puis sera retirée par une
  migration séparée — une suppression de colonne inverse l'ordre migration/déploiement et
  mérite d'être traitée seule.
- **Le nom saisi.** Il n'existera pas non plus. Le nom d'une enveloppe se compose de son type et,
  s'il y en a un, de son établissement : « Assurance-vie », ou « Assurance-vie — Boursobank »
  quand il y en a deux. Deux champs libres pour une seule identité produisent « PEA » d'un côté
  et « Mon PEA Bourso » de l'autre, et les regroupements des vues deviennent illisibles. Le nom
  est une déduction comme les autres — même règle que le régime.
- **`envelopes.kind`** (bank / securities / insurance / retirement…) devient une déduction du
  type, au même titre que le régime. Même traitement que `tax_regime`.

## L'écran

Il vit sur `/mes-enveloppes`, rangé sous « Gérer » à côté de « Mes lignes ». Le mot
« Enveloppes » reste à la vue de consultation, qui répond à une autre question.

```
  Mes enveloppes
  Une enveloppe est un compte, pas une banque. Tu choisis son type ;
  son nom et sa fiscalité en découlent.

  ┌────────────────────────────────────────────────────────────┐
  │ ╌  Le type de 12 enveloppes est deviné, jamais confirmé.   │
  │    Tant qu'il l'est, leur nom l'est aussi.                 │
  └────────────────────────────────────────────────────────────┘

  [ Ajouter une enveloppe ]
  ──────────────────────────────────────────────────────────────
   PEA                                                  4 lignes
   ╌ type deviné
   [ PEA                              ▾ ]   [ Confirmer ]
  ──────────────────────────────────────────────────────────────
   Compte-titres ordinaire — Air Liquide                 1 ligne
   ╌ type deviné
   [ Compte-titres ordinaire          ▾ ]   [ Confirmer ]
  ──────────────────────────────────────────────────────────────
   Assurance-vie                                        2 lignes
   abattement après 8 ans                              Modifier →
  ──────────────────────────────────────────────────────────────
   Compte courant — Boursobank                     aucune ligne
   flat tax 30 %                                       Modifier →
  ──────────────────────────────────────────────────────────────

   15 enveloppes · 12 types encore devinés
```

**Une liste plate, triée par type** dans l'ordre de la liste fermée, puis par établissement.
Pas de titres de groupe, et surtout **pas de bloc « à confirmer » séparé** : une enveloppe qu'on
confirme sauterait alors d'un bloc à l'autre, l'écran se réordonnerait sous les doigts et on
perdrait sa place. Le compte de ce qui reste vit dans l'encadré du haut et dans le pied de liste,
qui ne bougent pas.

La vue de consultation groupe déjà par régime fiscal pour répondre à « est-ce que j'optimise ma
fiscalité ». Regrouper à nouveau par régime ici donnerait deux réponses concurrentes à la même
question, et mettrait l'accent sur ce qui se déduit plutôt que sur ce qui se choisit.

**Le nombre de lignes** est affiché parce que c'est lui qui décide de ce qu'on peut retirer. **Le
montant, non** : c'est de la consultation, et l'écran Enveloppes le donne déjà. Une petite
enveloppe a autant besoin d'un type juste qu'une grosse.

**La marque du deviné réutilise `ConfidenceMark`** en état « estimé » — carré à contour
pointillé, avec le mot « type deviné ». C'est déjà la forme du manquant dans les quatre vues ;
inventer un badge ferait un troisième vocabulaire. Un rang deviné porte un menu pré-rempli avec la
supposition et un bouton « Confirmer » ; un rang confirmé n'affiche que son régime et un lien
« Modifier ».

**Le nom est deviné en même temps que le type**, puisqu'il s'en compose : un rang qui s'intitule
« Compte-titres ordinaire — Air Liquide » pourrait s'intituler autrement demain. L'encadré du
haut le dit, sinon la marque ne couvrirait que la moitié de ce qu'elle affirme.

**Ce qui ne se fait pas sur place** : changer l'établissement, retirer l'enveloppe. Ça vit sur
`/mes-enveloppes/[id]`, comme les lignes. Sur une enveloppe qui porte des lignes, le lien
« Retirer » est **absent**, pas présenté puis refusé après coup.

### L'état vide

C'est le premier écran qu'un nouvel utilisateur verra, et il compte autant que l'autre. Le
formulaire est ouvert d'emblée : avec zéro enveloppe, l'écran ne peut rien faire d'autre, et un
bouton qui révèle un formulaire est une étape qui n'achète rien.

```
  Mes enveloppes

  Tu n'as encore aucune enveloppe. Une enveloppe est un compte : ton PEA,
  ton assurance-vie, ton livret. Chaque ligne que tu suivras se rangera
  dans l'une d'elles — c'est par ici que ça commence.

  ──────────────────────────────────────────────────────────────
   Type de compte
   [ Choisir un type…                                       ▾ ]

   Établissement                                     facultatif
   [                                                          ]
   À remplir seulement quand tu en auras deux du même type.

   [ Créer l'enveloppe ]           elle s'appellera « PEA »
  ──────────────────────────────────────────────────────────────
```

**Aucune enveloppe n'est pré-créée.** Proposer d'« importer les enveloppes types » écrirait
quinze comptes que personne n'a choisis — exactement ce que la règle centrale du projet refuse.
La liste fermée, visible dans le menu, enseigne le périmètre mieux qu'un paragraphe.

**L'aperçu du nom à côté du bouton** est indispensable ici : puisque le nom ne se saisit plus, il
faut voir celui qu'on obtient avant de valider.

### Le formulaire

Deux champs, dont un facultatif. Tout le reste est déduit.

```
  Nouvelle enveloppe

  Type de compte
  [ Choisir un type…                       ▾ ]

  Le régime fiscal s'affichera ici, une fois le
  type choisi.

  Établissement (facultatif)
  [ Boursobank, Criteo…                      ]

                                    [ Enregistrer ]
```

Une fois le type choisi, la zone d'attente est remplacée sans que rien ne bouge :

```
  Type de compte
  [ Assurance-vie                          ▾ ]

  abattement après 8 ans                       ← grand, encre pleine, aucun cadre
  Une assurance-vie relève de ce régime. Il vient
  du type de compte, pas d'un réglage : c'est la
  loi qui le fixe.

  Établissement (facultatif)
  [ Boursobank                               ]
  Elle apparaîtra sous le nom
  « Assurance-vie — Boursobank ».
```

- **Le type d'abord, sans valeur de départ.** Ni un défaut proposé ni une déduction : c'est la
  seule chose que l'utilisateur seul sait. Un sélecteur pré-rempli sur « PEA » écrirait « PEA »
  sans que personne l'ait décidé.
- **Un menu déroulant natif**, comme les trois formulaires existants, mais **groupé par famille**
  (bourse, assurance et retraite, bancaire, réel et non coté) — jamais par régime fiscal, ce qui
  inviterait à choisir son type pour l'avantage qu'il rapporte, à l'envers de la réalité. Douze
  entrées empilées en boutons radio pousseraient le bouton d'enregistrement sous la navigation
  collée en bas de l'écran sur téléphone.
- **Les libellés du menu restent nus** — « PEA », pas « PEA — exonéré ». Écrire le régime dans
  chaque option montrerait la conséquence sans une ligne de JavaScript, mais douze options
  allongées se tronquent sur téléphone (« Compte-titres ordinaire — fla… ») : la conséquence
  serait montrée coupée. La phrase sous le menu la dit en entier.
- **L'établissement n'est réclamé que s'il le faut** : le serveur refuse deux enveloppes de même
  nom et demande alors de le préciser. Il accepte aussi une précision qui n'est pas un
  établissement — « Livret réglementé — des enfants » est un nom légitime.
- **Le régime n'est pas un contrôle** : une phrase en clair, en encre pleine, à la taille
  `--text-amount`, sans cadre ni fond ni coin arrondi. Le design system porte déjà cette
  distinction — arrondi pour ce qui se clique ou se remplit, carré pour la donnée. Un champ grisé
  dirait « vous pourriez le changer, mais pas ici » ; une phrase nue dit « c'est un fait ».

> **Le régime n'est ni « deviné » ni « par défaut ».** Ne jamais lui accrocher `GuessedMark`, ne
> jamais écrire « deviné » à côté. Un régime fiscal est une conséquence sans exception, pas une
> hypothèse à confirmer. C'est le **type** qui peut être deviné, et c'est lui qui porte le
> marquage. Confondre les deux abîmerait les deux vocabulaires du projet.

**En modification**, le même formulaire, sans l'entrée « Choisir un type… », plus une ligne
« 4 lignes sont rangées ici » avant le bouton : changer le type d'une enveloppe peuplée déplace
ces quatre lignes de groupe fiscal, et il faut le voir avant de valider.

**Un composant `Select` est à créer** au passage. La même ligne de style de menu déroulant est
aujourd'hui recopiée dans `LineForm`, `QualifyForm` et `MovementForm` ; ce formulaire est le
quatrième, et le premier à avoir besoin d'intertitres de famille. C'est le moment de la sortir
une fois — c'est le genre d'amélioration qui appartient au code qu'on touche, pas un
remaniement d'à-côté.

## Retirer une enveloppe

Trois cas, calqués sur ce que l'application fait déjà pour une ligne (`LineActions.tsx`) plutôt
qu'un mécanisme neuf.

**Elle porte encore des lignes → l'option n'est pas là.** Pas un bouton qu'on presse pour
s'entendre refuser : la fiche indique simplement ce qui bloque.

> Cette enveloppe porte 4 lignes. Déplace-les ou retire-les d'abord.

Faire disparaître une enveloppe en emportant ses lignes serait une destruction en masse ; le
dépôt ne s'autorise rien de tel. Le serveur revérifie au moment de l'écriture — une option
absente de l'écran n'est pas une protection, seulement une politesse.

**Elle est vide mais apparaît dans des relevés passés ou dans le journal → retrait, pas
suppression.**
> Elle ne sera plus proposée pour de nouvelles lignes. Les relevés passés la gardent.

Effacer une enveloppe présente dans l'historique réécrirait le passé.

**Elle n'a jamais servi → suppression définitive.**
> Aucune ligne, aucun mouvement : il n'y a pas de passé à détruire. La suppression est définitive.

Le retrait est réversible, avec un bouton « Remettre en service », comme pour les lignes.

## Changer le type d'une enveloppe

Changer le type change le régime, donc change ce que montre l'écran Enveloppes — y compris pour
les relevés passés, puisque le régime est calculé et non stocké. On le dit, sans bloquer :

> Le régime fiscal découle du type. Le changer modifie ce qu'affiche l'écran Enveloppes, y
> compris pour les relevés passés.

C'est cohérent avec le reste : ici, corriger une déduction corrige rétroactivement tout ce que
personne n'a confirmé. C'est la fonctionnalité, pas un effet de bord.

## La reprise des quinze enveloppes existantes

Aucune ne reçoit de type écrit. La colonne arrive vide, et vide veut dire deviné.

Le type deviné se calcule à la lecture, depuis le régime et le `kind` actuels : `pea` → PEA,
`insurance` → assurance-vie, `retirement` + `differe-bloque` → PER ou PEE, `bank` + `exonere` →
livret réglementé, et ainsi de suite. Les quatre enveloppes bancaires hériteront donc de
l'hypothèse d'aujourd'hui — mais **marquée comme hypothèse**, et présentée à confirmer. C'est
tout le gain : l'hypothèse cesse de se faire passer pour un fait.

**L'établissement se dérive du libellé actuel**, qui le contient déjà : « PEE Criteo » donne le
type PEE et l'établissement Criteo, « Boursobank » donne un établissement du même nom.

La confirmation a lieu dans l'écran Enveloppes lui-même, pas dans un parcours séparé et pas dans
« À qualifier ». Quinze entrées tiennent sur un écran ; « À qualifier » existe parce que les
lignes, elles, peuvent être nombreuses. Une sixième entrée de navigation pour quinze
confirmations serait du bruit.

## Ce qui change dans la base

Une seule migration, et elle **ajoute** — donc l'ordre habituel s'applique : migrer d'abord,
fusionner ensuite.

- `envelopes.account_type`, texte, **nullable**. NULL = jamais confirmé = deviné. Un `CHECK`
  construit sur la liste des types, comme les autres colonnes du vocabulaire, pour que la base
  refuse ce que les types refusent.
- `envelopes.establishment`, texte, nullable — facultatif par nature.
- `envelopes.archived_at`, horodatage nullable — l'équivalent de ce que `assets` a déjà.
- `envelopes.id` reste un texte choisi à la création ; rien ne le change.

`tax_regime`, `kind` et `label` restent en place, non lus par les vues, le temps que la reprise
s'appuie dessus. Leur retrait fera l'objet d'un lot séparé — le nom affiché se compose désormais
du type et de l'établissement, il ne se stocke plus.

Un module unique du domaine porte, pour chaque type : son libellé, sa famille, son régime et son
article (« un » PEA, « une » assurance-vie — pour que la phrase du formulaire soit du français et
pas de l'interface). C'est le seul endroit où la déduction existe.

## Comment on vérifie

- **Le régime n'est jamais écrit.** Un test refuse toute écriture d'un régime fiscal en base,
  sur le modèle des tests qui gardent déjà les règles structurelles du dépôt.
- **Le retrait respecte ses trois cas.** Un test par cas : refus quand des lignes restent,
  archivage quand l'historique existe, suppression seulement quand rien n'existe.
- **Le marquage du deviné reste réel.** `lib/__tests__/guessed-mark.test.ts` tient une liste
  d'écrans **écrite à la main** — c'est délibéré : une liste déduite du dossier laisserait entrer
  une vue nouvelle sans que personne ne le remarque. On y ajoute une seconde liste pour les
  écrans bâtis sur le type d'enveloppe, avec le même contrôle : le composant est rendu, et le
  compte qu'on lui passe est réel.
- **`GuessedMark` devient paramétrable plutôt que dupliqué** : le nom de ce qui est compté
  (« lignes » par défaut, « enveloppes » ici) et la destination (`/qualifier` par défaut, absente
  ici — la confirmation a lieu sur place, et un lien vers la page où l'on se trouve est du bruit).
  Un second composant jumeau serait précisément celui qu'on oublierait d'ajouter à la liste du
  test : dupliquer un garde-fou pour éviter une propriété optionnelle échange une petite
  complication contre le risque qu'il cesse de garder.
- **La reprise ne perd personne.** Un test rejoue les quinze enveloppes réelles et vérifie que
  chacune reçoit un type deviné, aucune un type écrit.
- **Deux enveloppes ne peuvent pas porter le même nom.** Un test vérifie que la deuxième est
  refusée avec la demande de préciser l'établissement, et non enregistrée en double.
- Les trois commandes du dépôt (`npm test`, `npm run lint`, `npm run build`), avec leur sortie
  collée, avant toute annonce.

## Ce que ce lot ne fait pas

- Il ne rend pas l'application multi-utilisateur. Les enveloppes créées ici n'appartiennent
  toujours à personne : c'est le lot 1.
- Il ne touche pas aux classes d'actifs. Elles restent le vocabulaire du produit — c'est ce qui
  rend une allocation comparable et une cible sensée. Un utilisateur qui inventerait ses propres
  classes casserait les quatre vues.
- Il n'importe rien. Créer ses lignes en masse reste le lot 3.
