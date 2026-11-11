# Le relevé au pouce — la forme de l'écran, pas sa règle

Spécification de conception — 22 août 2026

Complément à [la spec du 20 août](2026-08-20-releve-trie-design.md), qui a réglé **quelles rangées
montrer**. Elle tient dans son entier : le tri, le repli qui masque sans démonter, les groupes par
enveloppe, la colonne d'écart, le garde-fou d'ordre de grandeur, Entrée qui passe au champ suivant —
rien de tout cela n'est remis en cause. Cette spec règle ce qu'elle n'a pas abordé : **la forme que
prend une ligne sur un téléphone.**

## Le problème

L'écran se fait sur un téléphone, entre deux applications bancaires. Sa forme est un tableau à
quatre colonnes — une forme d'ordinateur, rétrécie à 390 px. Mesuré le 22 août 2026 dans un
navigateur réel, sur les données de production :

| Mesure | Ce qu'elle vaut | Ce qu'elle coûte |
|---|---|---|
| Boîte du total | **90 px** pour un chiffre de 32 px | Le total **se casse en deux** : « 664 € » puis « 509 ». Le patrimoine se lit comme six cent soixante-quatre euros. |
| Hauteur consommée avant le premier champ | **38 %** de l'écran | Un titre, la date écrite deux fois à deux endroits, un bandeau qui répète ce que chaque ligne dit déjà, un bouton qui casse sur deux lignes. |
| Lignes visibles sans défiler | **5 sur 8** | Le relevé se fait en série ; perdre le fil coûte un aller-retour. |
| Largeur de la colonne d'enveloppe | **15 %** de l'écran | Elle affiche « NON / COTÉ » et « PEA- / PME » coupés en deux, **dans la couleur `measure`** — celle qui sert par ailleurs à refuser un champ. La couleur la plus forte de la page est posée sur ce qui compte le moins. |
| Largeur laissée au nom de la ligne | **175 px** | « ISHARES MSCI WORLD SWAP PEA UCITS ETF EUR (ACC) » y tient sur trois lignes. |

Les montants à cinq chiffres se cassent aussi (« 36 / 886 »). Le propriétaire nomme deux frictions,
et elles se répondent : **retrouver la bonne ligne**, et **taper le chiffre**.

Un défaut annoncé au début de ce travail était faux et n'est pas traité ici : la barre de navigation
ne recouvre pas le contenu. Le `pb-20` du layout réserve sa place ; ce qu'on croyait voir était un
artefact de capture pleine page, où Playwright dessine les éléments `fixed` à leur position d'écran.

## 1. Le tableau disparaît du téléphone

Une ligne cesse d'être une rangée à quatre colonnes. Elle devient un bloc, et **sa forme suit ce
qu'elle porte** :

- **Un solde, une saisie manuelle** portent un chiffre. Nom et champ **sur une seule rangée**.
- **Une ligne cotée** en porte trois — parts, cours, valeur — et **une ligne d'immobilier** en porte
  deux. Nom sur toute la largeur, chiffres en dessous.

Ce n'est pas un compromis entre deux mises en page : c'est la même règle appliquée à des lignes qui
n'ont pas la même charge. Une ligne à un chiffre n'a pas besoin d'un étage à elle.

**Ce que ça donne, ligne par ligne** : une ligne de solde passe de **130 px à 82 px**, mesuré dans
un navigateur à 390 px sur le portefeuille réel. C'est la garantie de cette forme, et la seule qui
ne dépende pas de ce que contient le portefeuille.

### Ce que cette spec a d'abord affirmé, et qui était faux

> « Sept lignes tiennent au-dessus de la barre du bas, contre cinq aujourd'hui. »

**Mesuré après implémentation : quatre.** Et cinq avant la refonte — donc l'écran est
*moins* dense qu'avant, pas plus. La phrase est conservée ici plutôt qu'effacée, parce que la façon
dont elle s'est trompée est instructive.

Le chiffre venait d'une maquette. Elle mesurait juste, mais elle mesurait autre chose :

| | Maquette | Écran réel |
|---|---|---|
| Barre de navigation du haut | absente | ~60 px |
| « Rafraîchir les cours » | lien souligné, sur la ligne du compteur | bouton encadré, qui passe à la ligne |
| **En-tête total** | **~100 px** | **275 px** |

Sur 844 px, la barre du bas commençant à 801, il reste **526 px utiles** pour **981 px de lignes**.
Six lignes auraient demandé un en-tête de 118 px — moins que la barre de navigation plus le titre.
**La cible n'était atteignable dans aucun cas**, et aucune mise en page n'y serait arrivée.

Deux décisions de cette spec y contribuent, et il faut les nommer :

- **La bande d'écart coûte 16 px par ligne, soit 128 px sur huit lignes.** La section 6 dit qu'elle
  coûte « une quinzaine de pixels par ligne au lieu d'une colonne de la largeur d'un nom » — vrai
  par ligne, jamais additionné à l'échelle de l'écran. Dans le tableau, l'écart était une *colonne* :
  il ne coûtait rien en hauteur.
- **Les bandes d'enveloppe coûtent 30 px chacune**, y compris pour un groupe d'une seule ligne. Le
  portefeuille réel en compte trois sur les huit lignes en attente.

**Ce qui reste vrai et acquis** : le nom sur toute la largeur, le champ plus grand, la disparition
de la colonne de marge et du bleu sur l'étiquette de groupe, et les 48 px gagnés par ligne de solde.
**Ce qui reste à décider par le propriétaire** : si la densité doit primer, il faut reprendre la
bande d'écart, la hauteur d'une ligne cotée, ou l'en-tête — trois arbitrages qui n'ont pas été
soumis.

L'affirmation sur le clavier — « il n'en reste qu'environ 465 px » — était déjà marquée comme une
déduction et non une mesure. Elle le reste, et rien ne s'appuie plus dessus.

**Et il faut le dire, parce que l'argument inverse est séduisant et faux** : cette forme ne donne au
nom que ~196 px, contre 175 aujourd'hui. Vingt pixels. **Ce n'est pas la largeur du nom qui règle le
repérage** — c'est la bande d'enveloppe, le compteur, et le passage de deux écrans à un seul. Une
spec qui écrirait « le nom devient lisible » affirmerait quelque chose que la mesure ne soutient pas.

## 2. L'enveloppe devient une bande, plus une colonne de marge

Le nom du compte prend toute la largeur, dans une bande sur la teinte `surface`, bas de casse, en
`ink-2`. Il porte le nombre de lignes de son groupe, à droite.

Trois choses en découlent : les 15 % de largeur reviennent au contenu ; « NON COTÉ » et « PEA-PME »
cessent d'être coupés en deux ; et **le bleu `measure` quitte l'étiquette de groupe**, où il n'avait
rien à dire. Le vocabulaire de la couleur redevient celui du reste de l'application : `measure` pour
ce qui se mesure et ce qui se refuse, `stale` pour un cours périmé, `positive` / `negative` pour un
écart.

Le filet vertical qui tenait le groupe disparaît avec la colonne. C'est la bande qui tient le
groupe, et elle le fait mieux : un filet vertical se lit comme une frontière, une bande se lit comme
un en-tête.

## 3. L'en-tête dit ce qu'il reste à faire, et rien d'autre

Aujourd'hui l'en-tête porte : un titre, la date du dernier cours, un bouton de rafraîchissement, un
bandeau d'avertissement, et la date du jour. Deux dates, et un bandeau qui annonce « 3 lignes
affichent leur dernier cours connu » alors que **chacune de ces trois lignes porte déjà sa marque
« cours périmé »**.

Il ne reste que :

1. Le titre et la date du relevé, sur une rangée.
2. **« 8 lignes attendent une valeur »**, et à droite « Rafraîchir les cours ».
3. La date du dernier cours, en petit, sous le bouton — quand il y en a une.

**Le bandeau `Message tone="warning"` disparaît.** Il ne disait rien que les lignes ne disent, et il
le disait sans dire lesquelles — le tri du 20 août les a déjà fait remonter en haut de l'écran. La
spec du 20 août avait prévu ce retrait pour le bandeau cliquable ; celui-ci tombe pour la même
raison.

Le titre reste **« Mettre à jour »**, comme le lien qui y mène dans `components/Nav.tsx`. Le nommer
« Relevé » sur l'écran et « Mettre à jour » dans la barre ferait exactement ce que la refonte des
quatre vues a corrigé ailleurs : deux noms pour une chose.

## 4. Le total ne se casse jamais, et dit son compte

Le total est le chiffre de l'écran. Il ne doit **jamais** passer à la ligne : le retour à la ligne
ne le rend pas seulement illisible, il en fait un **autre nombre**, plus petit et plausible.

- Le montant et son symbole sont insécables (`white-space: nowrap`).
- La gouttière du `€` — une colonne de largeur fixe posée à côté du chiffre — **ne s'applique plus
  au total**. C'est elle qui, dans un conteneur flex trop étroit, laisse le symbole avec les
  premiers chiffres et renvoie les suivants dessous.

**Ce qui protège vraiment n'est pas ce que cette section annonçait.** Une version antérieure
promettait que « la taille descend si nécessaire plutôt que de casser » : rien ne la fait descendre,
le total est en `text-amount` fixe. Ce qui empêche le débordement, c'est que **le libellé de gauche,
lui, peut se replier** — le total insécable prend la largeur qu'il lui faut et le libellé cède. À
390 px sur le patrimoine réel, l'ensemble occupe ~290 px des ~358 disponibles. Le filet est le test
e2e `no screen scrolls sideways on a phone`, pas une règle de taille élastique qui n'existe pas.

Et il annonce son compte : **« Total, 39 lignes »**. La règle du `CLAUDE.md` s'applique ici sans
exception — le relevé liste ses lignes, donc le lecteur peut confronter le compte à ce qu'il a sous
les yeux, et c'est exactement le détecteur de la panne du fichier Numbers décrite dans le README.

La même règle vaut pour les montants de ligne : « 36 886 » ne se casse pas non plus.

## 5. Le repli dit le fait, pas le jugement

Aujourd'hui : « Revoir les 31 lignes qui n'attendent rien (613 300 €) ». « Qui n'attendent rien »
est une **affirmation** que le propriétaire doit croire sur parole, sur un repli qui cache — vérifié
sur les données du 22 août 2026 — **92 % de son patrimoine**, dont ses deux biens immobiliers à eux
seuls 60 %.

Le repli dira, sur les données du 22 août :

> **31 lignes · 613 300 €**
> 25 relevées depuis le 16 août · 6 au cours du jour

Le fait plutôt que le jugement. Il se vérifie d'un coup d'œil, et le jour où une ligne serait cachée
à tort, **la date se déformerait toute seule**.

**Deux populations, deux phrases — et jamais une date unique pour les deux.** Sur les données
réelles, 24 des 31 lignes datent du 21 août, une du 16, et **six ne sont pas repliées à cause d'une
date du tout** : ce sont des lignes cotées dont le cours a été rafraîchi ce matin. Écrire « relevées
le 21 août » serait faux pour sept lignes sur trente et une.

**Et la date la plus ancienne se calcule sur les lignes non cotées seulement.** Une ligne cotée
porte bien un `figureFrom` — la date de sa quantité — mais `stalenessOf` (`lib/domain/freshness.ts`)
l'ignore délibérément : *« a quoted line's euro value is as current as its price, whatever the age of
its quantity »*. Un calcul naïf du « plus ancien » ramasserait cette date. Une quantité posée il y a
un an ferait alors afficher « rien de plus ancien que le 22 août 2025 » sur un lot dont chaque cours
date du matin — alarmer pour une raison ennuyeuse, ce que ce fichier évite déjà ailleurs en nommant
la ligne qui domine un total périmé.

Chaque moitié disparaît quand sa population est vide : aucune ligne cotée repliée, pas de seconde
phrase ; aucune ligne non cotée datée, pas de première. Quand les deux manquent, le repli dit son
compte et son montant, sans rien affirmer d'autre. Une date inventée serait pire que pas de date.

## 6. Où va l'écart

La spec du 20 août réserve une colonne de largeur fixe à droite du montant, vide tant que la ligne
n'a pas bougé, **pour qu'aucune rangée ne saute** quand un chiffre s'y inscrit. Cette contrainte
tient, mais la colonne ne tient pas : à 390 px, une colonne de 96 px laisserait au nom 112 px, moins
qu'aujourd'hui.

L'écart passe donc **sous le montant**, dans une bande de hauteur fixe, présente dès le premier
rendu et vide jusqu'à ce que la ligne bouge. La contrainte est respectée — rien ne saute — et elle
coûte une quinzaine de pixels par ligne au lieu d'une colonne de la largeur d'un nom.

Le `data-testid` `gap-<assetId>` voyage avec cette bande : les **sept** assertions qui le lisent
continuent de passer sans être réécrites.

## 7. L'ordinateur hérite, il ne diverge pas

Un seul balisage, une seule liste de champs, **aucune règle responsive** : ce sont les largeurs qui
changent, pas la structure. Le bloc à une rangée s'étire, la bande d'enveloppe s'étend sur la mesure
du contenu.

**Une ligne cotée garde ses quatre étages sur un grand écran, et c'est un manque assumé.** Mesuré à
1440 px : 149 px de haut, contre 82 pour un solde. Le nom, la marque « cours périmé », les deux
champs parts × cours, puis le montant calculé seul sur sa ligne à droite — sur 920 px de large, ce
dernier étage est du vide. Une version antérieure de cette spec affirmait que « le bloc à deux
étages redevient une rangée quand il y a la place » : **c'était faux**, rien dans le code ne le
fait, et la maquette approuvée ne le montrait pas non plus. Le montant calculé pourrait rejoindre la
rangée des champs — il y tiendrait même à 390 px, où les deux champs n'occupent que 180 px des 358
disponibles. Ce n'est pas fait, ce n'est pas décidé, et le dire vaut mieux que de le promettre.

Deux garanties existantes restent tenues par leurs tests e2e : `main` fait plus de 900 px sur un
écran de 1440, et aucun champ ne descend sous 16 px — en dessous, Safari zoome à la prise de focus.

## Ce qui ne change pas

Il faut le dire, parce qu'une refonte de forme donne envie de tout rouvrir :

- **Le tri et la règle « attend une valeur »** (`awaitsValue`, `lib/domain/draft.ts`).
- **Le repli masque, il ne démonte pas.** `saveDraft` itère sur tous les actifs actifs et lit leurs
  champs dans le `FormData` : une ligne dont les champs quitteraient le DOM ferait échouer
  l'enregistrement entier, pour une rangée que personne n'a touchée. Un rendu conditionnel reste
  interdit — ce qui se dit maintenant sans `<tr hidden>`, mais veut dire la même chose.
- **Entrée passe au champ suivant**, et un champ qui prend le focus voit son contenu sélectionné.
- **Le garde-fou d'ordre de grandeur** (×3 / ÷3), qui ne bloque rien.
- **Le cours appartient au marché** : frais, il se lit ; périmé, il se retape et porte sa marque.
- **La clé de remontage du formulaire** sur la date du dernier rafraîchissement. Sans elle, un
  rafraîchissement re-rendrait la page en place et le formulaire garderait les anciens cours :
  l'écran afficherait un total et en enregistrerait un autre.

## Ce que ça coûte, vérifié

Les tests du formulaire interrogent les champs **par leur nom accessible**, leur `name` ou leur
`data-testid` — pas par la structure du tableau. Sur l'ensemble de
`app/(app)/releve/__tests__/snapshot-form.test.tsx`, **cinq assertions seulement** dépendent
de `<tr>` (`closest('tr')`).

**Et cette phrase, telle qu'elle était écrite, se trompait sur la suite** — elle disait « toutes sur
le repli. Elles se réécrivent sur le conteneur de ligne. » Vérifié après coup : **trois** portaient
sur le repli et se sont bien réécrites en `closest('[data-ligne]')` ; les deux autres portaient sur
le nom de compte en colonne de marge et ont dû être **supprimées**, cette marge n'existant plus. Il
y avait en outre un `closest('td')`, non compté ici, qui a lui aussi dû être repris.

C'est exactement le geste que le `CLAUDE.md` décrit : une affirmation sur du code existant, écrite
sans être vérifiée, et tenue pour vraie ensuite. Sans conséquence ici — mais écrite dans la spec qui
prétend s'en garder.

Aucun test e2e ne parle de `<table>` sur `/releve` — les deux qui en parlent visent `/lignes` et
`/allocation`.

## Ce que les tests doivent tenir

En plus de tout ce que la spec du 20 août fait déjà tenir :

- **Le total ne se casse pas.** Mesuré dans un vrai navigateur à 390 px : la hauteur de la boîte du
  total reste celle d'une seule ligne de texte. Aucun test unitaire ne peut l'attraper — le source
  était parfaitement raisonnable, et c'est un test e2e qui a la charge de cette règle. Le même
  contrôle vaut pour le montant de chaque ligne.
- **Une ligne de solde tient sur une seule rangée** — au plus 100 px de haut sur un écran de
  390 px. C'est la garantie de la forme, et elle ne dépend pas de la composition du portefeuille.
  Un retour aux deux étages repasserait au-dessus.
- **Le nombre de lignes visibles sans défiler ne descend pas sous quatre**, sur un brouillon qui en
  attend huit. C'est un **plancher, pas une cible** : voir plus haut pourquoi la cible annoncée était
  inatteignable. Un test qui viserait plus haut échouerait sans qu'aucune mise en page ne puisse le
  sauver.
- **La bande d'enveloppe n'utilise pas `measure`.** Un test de source, à côté de ceux du design
  system, qui refuse le retour du bleu sur une étiquette de groupe.
- **Le repli annonce la date la plus ancienne** de ce qu'il cache, **calculée sur les lignes non
  cotées seulement** — une ligne cotée dont la quantité remonte à un an ne doit pas la repousser.
  Il n'annonce aucune date quand aucune ligne non cotée repliée n'en porte.
- **Le bandeau d'avertissement des cours périmés n'existe plus**, et chaque ligne concernée porte
  toujours sa marque.
- **Le total annonce son compte.**
- **Une ligne repliée envoie toujours ses champs** : un enregistrement fait sans jamais ouvrir le
  repli produit un relevé complet. La règle du 20 août survit au changement de balisage, et c'est
  celle dont le symptôme est le plus loin de sa cause.

## Hors périmètre

- **Le brouillon gardé sur l'appareil.** Écarté par le propriétaire le 19 août ; rien ici ne le
  rouvre. Le prix assumé reste qu'une saisie perdue est une saisie à refaire.
- **Le total collé au bas de l'écran.** Étudié, écarté : le clavier occupe le même bord, donc le
  total n'y serait visible qu'entre deux champs. Et pendant la saisie, ce qu'on vérifie est la
  ligne, pas le total — qui compte à la fin, quand on est déjà en bas.
- **Le relevé guidé, une ligne par écran.** Écarté : il supprime la vue d'ensemble et le saut direct
  à une ligne, alors que le relevé se fait application par application, en revenant avec un chiffre
  précis pour une ligne précise.
- **Les doublons apparents dans les données.** « ODDO BHF ACTIVE MICRO CAP CR-EUR » existe en ligne
  cotée (423 €) **et** en solde (393 €) ; « CAP IMMO 518 VILLA » est un solde quand les 517, 519 et
  521 attendent une valeur ; le LDD Boursobank et l'Amundi MSCI World valent 0 €. Ce sont des
  observations sur la donnée du propriétaire, pas des défauts de l'écran. À regarder séparément.

## Le découpage

Trois changements indépendants, dans cet ordre — chacun se relit et se fusionne seul :

1. **L'en-tête et le total.** Le bandeau disparaît, la date cesse d'être écrite deux fois, le
   compteur apparaît, le total cesse de se casser et annonce son compte. Ne touche ni la forme des
   lignes ni les données. C'est le plus petit changement, et il règle à lui seul le défaut le plus
   grave.
2. **La forme des lignes.** Le tableau devient des blocs, l'enveloppe devient une bande, l'écart
   passe sous le montant. C'est le gros morceau.
3. **Le repli qui dit ses deux faits.** Rien de nouveau à transporter : `figureFrom` et `valuation`
   sont déjà sur `DraftLine`, et le calcul — la plus ancienne date des lignes non cotées, le compte
   des cotées — est une fonction pure à tester seule. Aucune migration.
