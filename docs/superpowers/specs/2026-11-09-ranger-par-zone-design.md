# Ranger par zone : le détail d'une catégorie en chapitres

Décidé avec Nicolas le 9 novembre 2026, sur planche (`zones.html`, option B), après l'avis de deux
spécialistes (interfaces mobiles, direction artistique). Complète la spec d'interface
(`2026-11-06-refonte-interface-design.md`), dont les règles et les mots restent en vigueur.

## Pourquoi

Avant stefin, Nicolas suivait son patrimoine dans un tableau Numbers à neuf rubriques. Deux
choses lui manquent dans stefin : distinguer, dans l'épargne sûre, le **monétaire** des
**obligations**, et voir ses **actions par zone** (Europe, États-Unis, émergents, monde). Il les veut
en **vue détaillée, à la demande** : rien ne doit s'ajouter au premier écran, qui reste calme.

Aujourd'hui, à l'import de ses relevés, le monétaire et les obligations ont tous deux été rangés
dans « Épargne sécurisée », et toutes les actions dans « Placements en bourse ».

## Ce qui est décidé

### Le détail d'une catégorie se range en chapitres (option B)

Dans l'écran de détail d'une catégorie (`app/(app)/categorie/[id]`), les lignes se regroupent en
**chapitres fermés**. Chaque chapitre montre, sur une rangée :
- son nom, suivi de « › » quand il est fermé et de « ⌄ » quand il est ouvert ;
- son sous-total, à droite ;
- dessous, en petit : ses carrés (taille `size-square-s`, couleur de la catégorie, comme les
  carrés d'une ligne), puis « 14 carrés sur 22 · 17 lignes ». Un chapitre sans carré dit
  « moins d'un carré » à la place.

Un toucher sur la rangée ouvre le chapitre : ses lignes apparaissent dessous, exactement comme
aujourd'hui (nom, où elle est, montant, carrés, liens vers la fiche). Un second toucher le
referme. Tous les chapitres sont fermés à l'arrivée sur l'écran.

- Les carrés d'un chapitre sont la **somme des carrés de ses lignes** (celle de la grille,
  `lib/model/squares.ts`) : un chapitre ne contredit jamais la grille.
- Les chapitres se suivent du plus gros au plus petit ; « Je ne sais pas » vient toujours en
  dernier. Un chapitre sans ligne n'est pas montré.
- Avec un seul chapitre non vide, il n'y a pas de chapitre : la liste reste celle d'aujourd'hui.
- Aucune couleur nouvelle, aucune deuxième grille, aucun graphique : un chapitre se distingue par
  sa place et ses mots, jamais par une teinte (la teinte dit la catégorie).
- Rien ne change sur Mon argent.

### Les chapitres de chaque catégorie

| Catégorie | Chapitres | D'où vient le chapitre d'une ligne |
|---|---|---|
| Argent disponible | Comptes courants · Livrets · Autres | Le type de compte, tout seul (`current`, puis les types de livret ; le reste en « Autres ») |
| Épargne sécurisée | Fonds euros · Monétaire · Obligations et prêts · Je ne sais pas | Rangé par la personne (voir plus bas) |
| Placements en bourse | Europe · États-Unis · Japon · Pays émergents · Fonds monde · Non coté · Je ne sais pas | Rangé par la personne |
| Or et crypto | Or · Crypto · Autres | Le type de compte, tout seul (`gold`, `crypto`) |
| Immobilier | Aucun | Chaque logement est déjà une ligne : des chapitres n'ajouteraient rien |

> **Complété le 9 novembre 2026** (accord de Nicolas) : Placements en bourse a un chapitre
> « Japon » (`japan`), entre États-Unis et Pays émergents. Un fonds japonais tombait jusque-là dans
> « Je ne sais pas », faute de mieux : le Japon n’est pas un pays émergent. Les propositions le
> devinent d’après son indice (« MSCI Japan », « Nikkei », « Topix ») ou son nom (« Japon »,
> « Japan ») ; l’écran de rangement et la fiche d’une ligne le proposent dans le même ordre.
> Précédé de « ex », « ex- » ou « hors », un mot du Japon ne propose rien : « MSCI Pacific
> ex Japan » est tout sauf le Japon (relecture du même jour).

Pour Épargne sécurisée et Placements en bourse, une ligne que personne n'a rangée est dans
« Je ne sais pas ». Tant qu'**aucune** ligne de la catégorie n'est rangée, l'écran reste celui
d'aujourd'hui (pas de chapitre « Je ne sais pas » seul), avec le lien de rangement en bas.

### L'écran « Ranger par zone »

Un lien en bas du détail de Placements en bourse (« Ranger par zone › ») et d'Épargne sécurisée
(« Ranger par type › ») ouvre un écran qui liste toutes les lignes ouvertes de la catégorie, chaque
ligne une fois. En haut, le titre (« Ranger par zone » ou « Ranger par type ») et une phrase :
« Une proposition pour chaque ligne. Change-la d'un toucher si elle ne te va pas ; rien n'est rangé
avant « Valider ». » Pour chaque ligne : son nom, une ligne en petit qui dit d'où vient la
proposition (« deviné d'après son indice », « d'après son nom », « d'après sa place de cotation »,
« d'après son type de compte », ou « ne se devine pas »), et à droite son chapitre dans une
pilule à contour, qu'un toucher change (une liste native du téléphone suffit) ; « Je ne sais pas »
a un contour en pointillé et un texte gris. Une ligne déjà rangée montre son chapitre actuel, sans
raison ni proposition.

En bas, un bouton plein : « Valider ces N choix », N étant le nombre de lignes de l'écran. Rien
n'est enregistré avant. Le retour en haut ramène au détail sans rien changer. Après
l'enregistrement, on revient au détail, rangé.

**Un « Je ne sais pas » choisi est gardé.** Valider enregistre un chapitre pour chaque ligne de
l'écran, « Je ne sais pas » compris (valeur `unknown`) : une proposition que la personne a refusée
ne revient pas la fois suivante. Seule une ligne qui n'a encore aucun chapitre reçoit une
proposition. *(Choix de Claude.)*

**Les propositions** se calculent dans le navigateur, sans rien demander à personne, par une
règle pure et testée, dans cet ordre (la première qui répond l'emporte) :
1. *D'après son nom* : « monétaire », « court terme », « money market » → Monétaire ;
   « obligat », « bond » → Obligations et prêts ; un indice connu : « S&P 500 », « Nasdaq »,
   « MSCI USA », « Russell » → États-Unis ; « Euro Stoxx », « Stoxx Europe », « CAC 40 », « DAX »,
   « MSCI EMU », « MSCI Europe » → Europe ; « MSCI World », « ACWI », « monde », « world » →
   Fonds monde ; « MSCI Japan », « Nikkei », « Topix », « Japon », « Japan » → Japon ;
   « emerging », « émergents », « Chine », « China », « Inde », « India » → Pays
   émergents. La raison dite est « d'après son indice » pour un indice (« MSCI Japan »,
   « Nikkei » et « Topix » en sont), « d'après son nom » sinon.
2. *D'après son type de compte* : une ligne « montant » d'une assurance-vie ou d'un PER, rangée en
   Épargne sécurisée → Fonds euros. (Leurs « Unités de compte », aussi une ligne montant, sont en
   Placements en bourse : elles ne passent pas par cette règle.) *(Choix de Claude : à la saisie,
   le PER propose « + Le fonds euros » comme l'assurance-vie, `components/setup/account-kinds.ts` ;
   un nom plus précis, « monétaire » par exemple, passe avant.)*
3. *D'après sa place de cotation*, seulement pour une **action** : une ligne suivie dont le nom ne
   ressemble pas à un fonds et dont le symbole Yahoo finit par une place européenne (`.PA`, `.AS`,
   `.DE`, `.MI`, `.MC`, `.BR`, `.L`, `.SW`) → Europe ; sans suffixe → États-Unis. Un nom
   « ressemble à un fonds » s'il contient un nom de gérant ou un mot de fonds (iShares, Amundi,
   Lyxor, Xtrackers, Vanguard, SPDR, BNP Paribas Easy, Ossiam, ETF, UCITS, fonds, fund, SICAV) : un
   fonds coté à Paris peut suivre n'importe quelle zone, il ne passe que par la règle 1.
   *(Choix de Claude : stefin ne garde pas la nature d'un titre, action ou fonds, et ne la
   redemande pas à Yahoo.)*
4. *Ne se devine pas* : tout le reste (un prêt participatif comme « Cap Immo 518 Villa », un profil
   géré, un robot-conseiller, une entreprise non cotée) → « Je ne sais pas », sans reproche.

Une proposition qui désigne un chapitre de l'autre catégorie (un fonds monétaire rangé en
Placements en bourse) est ignorée : la ligne reste « Je ne sais pas » dans sa catégorie, et rien
ne change de catégorie (Mon argent ne bouge pas).

Pièges connus, que les tests doivent tenir : « EUR-ACC » ou « EUR » seul est la devise d'une part,
pas l'Europe ; le Japon n'est pas un pays émergent (« iShares MSCI Japan », même coté à
Amsterdam → Japon, d’après son indice, et jamais Pays émergents ; jusqu’au 9 novembre 2026, faute
de chapitre Japon, c’était « Je ne sais pas ») ; « ex Japan » n’est pas le Japon (« iShares Core
MSCI Pacific ex-Japan », « MSCI AC Asia ex Japan » → Je ne sais pas ; « MSCI World ex Japan » →
Fonds monde).

La planche qui a servi à décider (`zones.html`) reste hors du dépôt : elle porte les vraies lignes
de Nicolas. Ses rangements d'exemple (« PEA Profil offensif » en Europe, « Robot-Advisor » en Fonds
monde) n'étaient que des illustrations ; les règles ci-dessus l'emportent.

### La fiche d'une ligne

La fiche d'une ligne de ces deux catégories montre son chapitre et permet de le changer, comme sa
catégorie aujourd'hui. *(Choix de Claude, à relire par Nicolas : tout ce qui décrit une ligne se
corrige dans sa fiche, lot 4c.)*

### La donnée

- Une ligne reçoit un champ facultatif, son chapitre : l'une des valeurs `euro-fund`,
  `money-market`, `bonds`, `europe`, `us`, `japan`, `emerging`, `world`, `unlisted`, ou `unknown` (« Je ne
  sais pas », choisi par la personne). Absent veut dire « jamais rangée » : elle est montrée dans
  « Je ne sais pas » et reçoit une proposition dans l'écran de rangement.
- « Aucune ligne rangée » (l'écran reste celui d'aujourd'hui) veut dire : aucune ligne de la
  catégorie n'a de chapitre autre qu'absent ou `unknown`.
- Il vit dans le **profil, chiffré** comme le reste : **rien de nouveau ne part en clair**.
  `parseProfile` (`lib/model/documents.ts`) le contrôle comme `category` : une valeur inconnue rend
  la ligne illisible, comme aujourd'hui pour tout champ faux.
- Un chapitre qui n'appartient pas à la catégorie de la ligne est lu comme « Je ne sais pas ».
  Changer la catégorie d'une ligne (`setCategory`, `lib/correct/profile-changes.ts`) efface son
  chapitre.
- Une ligne ajoutée plus tard (mise à jour, premier lancement) arrive sans chapitre.

## Ce qui n'est pas dans ce lot

- **Allumer un chapitre dans la grille** en le touchant (trois niveaux, comme le toucher d'un
  carré). Nicolas l'a accepté pour plus tard : il demande de ranger les carrés d'un même chapitre
  côte à côte dans la grille de Mon argent, ce qui change leur ordre.
- **Des objectifs par chapitre.** Écartés par les deux spécialistes : sept cibles et sept écarts en
  euros, c'était l'ancien tableau, « trop Bloomberg » ; et proposer des cibles par zone
  ressemblerait à un conseil d'investissement.
- Des chapitres pour l'Immobilier.
- Une source de données externe pour la zone d'un fonds : seuls le nom et le symbole déjà connus
  servent.
- Une ligne qui mélange plusieurs zones (une assurance-vie saisie par son total) : elle reste
  entière dans un seul chapitre, « Je ne sais pas » si la personne ne choisit pas.

## Ce qui ne doit jamais arriver

- Un chapitre dont les carrés ne sont pas la somme de ceux de ses lignes.
- Un rangement enregistré sans « Valider ».
- Un chapitre écrit en clair vers le serveur.
- Une couleur ou une grille nouvelle pour un chapitre.
- Une proposition présentée comme sûre alors qu'elle est devinée : la raison est toujours dite.

## Ce qui est laissé à celui qui construit

L'ordre des lignes dans un chapitre (celui d'aujourd'hui, du plus gros au plus petit, convient), le
mot exact sous chaque proposition, la façon de rendre « ⌄ » et « › », l'enregistrement (le même
chemin que les corrections du lot 4c), et la place des lignes trop petites pour un carré (dans leur
chapitre, comme les autres).
