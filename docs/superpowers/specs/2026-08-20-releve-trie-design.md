# Le relevé trié — ne montrer que ce qui attend une valeur

Spécification de conception — 20 août 2026

> **Reprise en partie par [la spec du 22 août](2026-08-22-releve-au-pouce-design.md).** Ses règles
> tiennent toutes — le tri, le repli qui masque sans démonter, l'écart réservé d'avance, le
> garde-fou d'ordre de grandeur, Entrée qui passe au champ suivant. Mais **la forme a changé** : le
> tableau à quatre colonnes est devenu une liste de blocs, et la section 4 ci-dessous décrit une
> *colonne* d'écart qui n'existe plus — c'est désormais une bande sous le montant. Une spec de ce
> dépôt se lit comme un état des lieux : ce renvoi est là pour qu'on ne lise pas la section 4 comme
> une description du code d'aujourd'hui.

Complément à [la spec du 19 août](2026-08-19-saisie-simplifiee-design.md), qui a fait de `/releve`
un tableau qu'on remplit. Elle tient toujours dans son entier : cette spec n'en change aucune
décision, elle en règle une qu'elle n'avait pas abordée — **quelles rangées montrer**.

## Ce que la spec du 19 août a déjà réglé

Il faut le dire, parce que le diagnostic qui a lancé ce travail portait à tort sur l'écran
d'avant : le total qui se recalcule pendant la frappe, l'accusé de réception après
l'enregistrement, l'annulation d'un relevé du jour, le cours périmé qui redevient un champ, le
champ vidé refusé sur sa propre ligne — tout cela existe. Le tableau est déjà dense.

## Le problème qui reste

L'écran affiche **les 46 lignes actives, toutes, dans l'ordre alphabétique** que rend
`listActiveAssets`. Or elles ne demandent pas la même chose :

| Population | Combien | Ce qu'elle attend |
|---|---|---|
| Soldes, saisies manuelles, biens dont le chiffre a plus de trois mois | ~10 | Un chiffre que le propriétaire est seul à connaître |
| Lignes cotées dont le cours n'a pas pu être rafraîchi | 0 à 3 | Un cours retapé à la main |
| Tout le reste | ~35 | Rien. Le marché s'en occupe, ou le chiffre est récent |

Corriger deux soldes oblige à passer devant quarante-quatre rangées qui n'attendent rien. Et le
bandeau qui annonce « 3 lignes affichent leur dernier cours connu » ne dit ni lesquelles ni où
elles sont — il faut les chercher dans la liste.

## 1. Deux populations, une seule règle

Une ligne **attend une valeur** quand l'une des deux conditions est vraie :

- son cours est périmé (`priceStatus === 'stale'`) — le marché n'a pas répondu, seul le
  propriétaire peut trancher ;
- la date de son propre chiffre (`figureFrom`) est absente, ou remonte à plus de
  `STALE_AFTER_MONTHS` (trois mois, `lib/domain/settings.ts`).

Rien d'autre. En particulier, **une ligne cotée dont le cours est frais n'attend jamais rien** :
`owned()` (`lib/domain/freshness.ts`) dit déjà que seule sa quantité appartient au propriétaire, et
sa quantité ne change que s'il a acheté ou vendu — ce qui se fait depuis « Mes lignes ».

La règle réutilise `stalenessOf` plutôt que d'en écrire une deuxième. Deux définitions de « périmé »
divergeraient le jour où le seuil bougerait.

**`figureFrom` à `NULL` compte comme périmé, et c'est délibéré.** Un âge inconnu n'est pas un âge
récent ; le faire basculer du bon côté ferait passer pour frais tout ce qui précède l'existence de
la colonne.

## 2. Le repli cache des rangées, il ne les démonte pas

C'est la contrainte technique qui gouverne l'implémentation, et elle est facile à manquer.

`saveDraft` (`app/(app)/releve/actions.ts`) itère sur **tous** les actifs actifs et lit, pour
chacun, les champs `amount_<id>`, `quantity_<id>`, `fx_<id>`, `status_<id>`… dans le `FormData`.
Une ligne dont les champs auraient quitté le DOM n'enverrait rien : `number()` rendrait `undefined`
et `lineValueEur` refuserait la ligne — l'enregistrement entier échouerait, à cause d'une rangée
que personne n'a touchée.

Donc : **replier, c'est masquer visuellement une rangée dont tous les champs restent dans le
formulaire.** Pas de rendu conditionnel qui les retire. Un test doit tenir cette règle en propre,
parce que le symptôme apparaît loin de la cause.

## 3. Les groupes sont les comptes

Les rangées qui attendent une valeur se groupent par enveloppe, avec son libellé en tête de groupe.
C'est l'ordre dans lequel un relevé se fait réellement : on ouvre Boursobank, on relève ses lignes,
on passe au PEA.

**Un groupe par enveloppe, même à une seule ligne**, et les groupes rangés par libellé d'enveloppe.
La table `envelopes` ne porte aucune colonne d'ordre — lui en inventer un ici serait une décision
prise à la place du propriétaire, dans le mauvais fichier. L'alphabet ne prétend rien.

`DraftLine` ne porte aujourd'hui ni `envelopeId` ni le libellé de l'enveloppe : `buildDraftLines`
les laisse tomber. Il faut les faire voyager avec la ligne, comme `loadMeasuredLines` fait voyager
`guessed` — une vue qui devrait les recalculer pourrait l'oublier.

Le repli, lui, ne se groupe pas : c'est **une seule ligne** qui dit combien de lignes et combien
d'euros, avec le geste qui l'ouvre. Une fois ouvert, il rend ses rangées groupées comme les autres.

## 4. L'écart n'apparaît que sur ce que le propriétaire touche

Une colonne s'ajoute à droite du montant. Elle reste **vide et de largeur fixe** tant que rien n'est
modifié : réservée dès le premier rendu, elle ne fait sauter aucune rangée quand un chiffre s'y
inscrit.

Elle affiche l'écart entre la valeur en cours de saisie et **la valeur de la même ligne au relevé
précédent** (`snapshot_lines.value_eur`, déjà en base).

**Et seulement sur les lignes que le propriétaire modifie.** C'est la décision qui évite un
contresens : sur une ligne cotée, l'écart vient du marché, pas de lui. Afficher « +287 € » à côté
d'Air Liquide se lirait comme un achat. L'accusé de réception, lui, parle bien du mouvement complet
après l'enregistrement — les deux chiffres ne répondent pas à la même question, et c'est pour ça
qu'ils vivent à deux endroits.

## 5. Le garde-fou d'ordre de grandeur

Quand la valeur saisie vaut plus de trois fois, ou moins d'un tiers de, la précédente, la colonne
affiche le rapport (`×10 ?`) au lieu de l'écart, dans la couleur `negative`.

**Il ne bloque rien.** Un solde peut vraiment doubler ; un livret vidé pour un apport tombe
vraiment à zéro. Interdire ferait de l'outil un obstacle sur un geste légitime, et l'annulation du
relevé du jour existe déjà comme second filet.

Le facteur trois est une **valeur de départ** au sens de `lib/domain/settings.ts` : proposée, jamais
choisie par personne, corrigeable rétroactivement. Pas de colonne, pas d'écran de réglage.

Une valeur précédente à zéro ne produit aucun rapport — diviser par zéro ne dit rien. La ligne
affiche alors son écart ordinaire.

## 6. Entrée passe au champ suivant

Dans un formulaire à un seul bouton d'envoi, la touche Entrée le déclenche : c'est la soumission
implicite du standard HTML. Sur cet écran, elle enregistre donc le relevé au milieu de la saisie.

Entrée doit amener au champ suivant. Sur le dernier, elle quitte le champ sans rien envoyer —
l'enregistrement reste un clic délibéré sur un bouton.

Et un champ prend le focus **avec son contenu sélectionné** : on écrase l'ancien montant en tapant
le nouveau, sans avoir à l'effacer d'abord.

Ce comportement n'a pas été observé à l'écran, il est déduit du standard et du code. Le test qui
l'établit vient donc en premier, et fait foi.

## 7. Quand rien n'attend de valeur

Le lendemain d'un relevé, aucune ligne ne remplit la règle. L'écran ne peut pas être vide, et il ne
doit pas non plus prétendre qu'il n'y a rien à faire.

Il dit ce qui est vrai — tous les chiffres ont moins de trois mois — affiche le total, et laisse le
repli ouvrable. Le point trimestriel, où l'on veut tout revoir sans que rien ne soit périmé, passe
par là.

## Ce que le brouillon doit transporter en plus

`buildSnapshotDraft` et `buildDraftLines` remontent aujourd'hui de quoi afficher et enregistrer.
Trois données manquent, toutes déjà en base :

| Donnée | D'où elle vient | Pour quoi |
|---|---|---|
| `figureFrom` de la ligne précédente | `snapshot_lines.figure_from` | Décider si la ligne attend une valeur |
| `envelopeId` et le libellé de l'enveloppe | `assets.envelope_id`, `envelopes.label` | Grouper |
| `valueEur` de la ligne précédente | `snapshot_lines.value_eur` | L'écart |

Aucune migration : ces trois colonnes existent. C'est un élargissement de lecture, pas un
changement de schéma.

## Hors périmètre

- **Le brouillon gardé sur l'appareil.** Déjà écarté par le propriétaire dans la spec du 19 août.
  Rien ici ne le remet en cause.
- **Le statut d'un cours retapé à la main.** Aujourd'hui, corriger un cours périmé l'enregistre
  quand même avec `priceStatus: 'stale'`, alors que `'manual'` décrirait mieux ce qui vient de se
  passer. C'est une question de justesse de l'historique, sans effet à l'écran — le statut est
  recalculé à chaque ouverture. À traiter séparément, si ça vaut la peine.
- **Rendre le bandeau des cours périmés cliquable.** Le tri le rend inutile : les lignes concernées
  remontent d'elles-mêmes en haut de l'écran.

## Ce que les tests doivent tenir

- Une ligne repliée **envoie toujours ses champs** : un enregistrement fait sans jamais ouvrir le
  repli produit un relevé complet, avec les 46 lignes.
- La règle « attend une valeur » : cours périmé, `figureFrom` nul, `figureFrom` à plus de trois
  mois, `figureFrom` à moins de trois mois, ligne cotée à cours frais.
- Entrée dans un champ ne soumet pas le formulaire et déplace le focus.
- La colonne d'écart reste vide tant que la ligne n'est pas modifiée, et n'apparaît jamais sur une
  ligne cotée que le propriétaire n'a pas touchée.
- Le rapport d'ordre de grandeur s'affiche à partir de ×3 et de ÷3, et jamais quand la valeur
  précédente est zéro.
- L'écran dont aucune ligne n'attend de valeur affiche son total et son repli, sans rangée vide.

## Le découpage

Trois changements indépendants, dans cet ordre — chacun se relit et se fusionne seul :

1. **Entrée passe au champ suivant.** Ne touche que `SnapshotForm`. Aucune donnée nouvelle.
2. **Le tri et les groupes.** Élargit le brouillon (`figureFrom`, enveloppe), ajoute le repli.
   C'est le gros morceau, et celui qui règle la demande initiale : moins de rangées.
3. **La colonne d'écart et le garde-fou.** Élargit le brouillon (`valueEur` précédent), ajoute la
   colonne et le seuil dans `settings.ts`.
