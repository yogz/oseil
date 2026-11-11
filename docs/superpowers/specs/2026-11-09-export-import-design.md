# Export et import des chiffres, en un fichier Excel — conception

Décidé avec Nicolas le 9 novembre 2026. « (proposition) » marque un choix de Claude que Nicolas a lu sans le
contester ; le reste vient de lui.

## Pourquoi

Quatre usages, tous de Nicolas :

1. **Ouvrir ses chiffres dans un tableur** (Numbers, Excel, Google Sheets).
2. **Les montrer à un conseiller.**
3. **Partir ailleurs** avec son historique.
4. **Une sauvegarde** : sans mot de passe ni clé de secours, le coffre ne s’ouvre plus jamais (« repartir de
   zéro », `startOver` dans `lib/vault/store.ts`). Le fichier exporté est alors la seule façon de retrouver ses
   chiffres.

Et un cinquième, ajouté en cours de route : **quelqu’un qui démarre** peut remplir lui-même le fichier, à partir
d’un modèle, **historique compris**, et l’importer au lieu de faire le premier lancement à la main. Nicolas pourrait
y recopier son ancien tableau Numbers.

## Objectifs

- **Un seul fichier, au format Excel (.xlsx), qui contient tout le patrimoine** : banques, comptes, lignes, tous
  les relevés, les versements, les objectifs, les réglages. Nicolas a refusé deux fichiers, et un CSV ne porte pas
  plusieurs onglets.
- **Un fichier propre à lire** : une ligne de titres en gras et figée en haut, des colonnes à la bonne largeur, de
  vrais nombres au format euro (séparateur de milliers, « € ») et de vraies dates, sur lesquels un conseiller peut
  faire des sommes et des filtres. Nicolas juge cela sur un fichier d’exemple avant la fin du chantier.
- **Le même fichier sert à l’export et à l’import.** Un export réimporté redonne exactement les mêmes chiffres, au
  centime près.
- **Un fichier rempli à la main s’importe**, à condition de suivre le modèle : les lignes se relient par leurs noms,
  sans code à inventer.

## Non-objectifs

- Pas de graphique dans le fichier.
- Pas d’import par-dessus des chiffres existants, ni de fusion : l’import ne se fait que sur un coffre vide (voir
  plus bas). Restaurer un état plus ancien sur un compte qui a des chiffres n’est pas prévu.
- Pas de fichier protégé par mot de passe : la bibliothèque ne le sait pas faire, et le fichier est en clair sur
  l’appareil (dit à l’écran).
- Pas de lecture du format `.numbers` : depuis Numbers, on exporte vers Excel (dit à l’écran et dans le message
  d’erreur).
- La mise à jour en cours (le brouillon) n’est pas dans le fichier (proposition) : seuls les relevés terminés.

## Anti-objectifs (ce qui serait un échec même si « ça marche »)

- **Un import à moitié fait** : des relevés sans leurs comptes, des chiffres visibles alors que l’import a échoué.
  Soit tout est importé, soit le coffre reste vide.
- **Un import qui devine en silence.** Ce qui ne se lit pas est refusé, avec l’endroit exact. Jamais un zéro à la
  place d’un montant illisible (CLAUDE.md, « Une réponse qu’on ne peut pas donner se dit »).
- **Un chiffre qui change en passant par le fichier** (un arrondi, un crédit qui change de signe, un taux de change
  perdu).
- **Quelque chose qui part en clair vers le serveur.** Le fichier se fabrique et se lit dans le navigateur ; à
  l’import, chaque document est scellé comme aujourd’hui (`lib/model/repository.ts`). Aucun nouveau champ n’est
  envoyé au serveur ; si le constructeur en voit le besoin, c’est une décision à faire valider par Nicolas.

## Où, à l’écran

- **Réglages**, nouvelle rubrique « Tes données » (entre les rubriques existantes, à la place que le constructeur
  juge la plus logique ; proposition : en dernier, avant le compte) :
  - un bouton « Télécharger mes chiffres » ;
  - sous lui, en légende : « Ce fichier contient tes chiffres en clair. Garde-le en lieu sûr. » Si une mise à jour
    est en cours : « Ta mise à jour en cours n’y est pas : seuls les relevés terminés. »
  - Les montants masqués n’ont pas d’effet sur le fichier : il contient les vrais chiffres.
  - **Un document illisible** (le chargement les compte à part, `unreadable` dans `loadAll`) : l’export se fait
    quand même, puisque c’est peut-être la seule sauvegarde possible, mais il le dit, à l’écran et dans l’onglet
    « Mode d’emploi » du fichier, par exemple « 2 relevés n’ont pas pu être lus : ils ne sont pas dans ce
    fichier. » (proposition). Jamais un fichier incomplet sans le dire.
- **Le premier lancement**, écran d’accueil (`app/(app)/premier-lancement/page.tsx`), sous « C’est parti » et sa
  légende, deux liens discrets (proposition) : « Télécharger le modèle » et « J’ai déjà un fichier ». Ce second lien
  mène à l’import.
- **« Repartir de zéro »** (`components/account/NewPasswordForm.tsx`) : la phrase « Sans ta clé, tes chiffres sont
  perdus pour de bon. » gagne une suite (proposition) : « Si tu as téléchargé tes chiffres, tu pourras les reprendre
  juste après. »
- Les mots exacts restent à la main du constructeur, dans le ton du site (tutoiement, phrases courtes, typographie
  française vérifiée par `lib/__tests__/typography.test.ts`).
- Nom du fichier (proposition) : `mes-chiffres-AAAA-MM-JJ.xlsx` pour l’export, `modele-mes-chiffres.xlsx` pour le
  modèle. Le nom du site (PatriCube) est provisoire : il n’entre pas dans les noms de fichiers.

## Quand l’import est permis

**Seulement sur un coffre vide** (décision de Nicolas) : aucune banque dans le profil et aucun relevé enregistré.
C’est le cas d’un nouveau compte et de celui qui vient de « repartir de zéro ». Ailleurs, l’import n’est pas
proposé. L’import n’efface donc jamais rien.

Une personne qui a commencé le premier lancement (une banque choisie) n’a plus de coffre vide : le lien n’apparaît
plus (proposition). À vérifier par le constructeur : ce que l’écran d’accueil montre à quelqu’un qui revient au
milieu du premier lancement, pour que ce cas reste cohérent.

## Le déroulé de l’import

1. Choisir le fichier (sur iPhone, l’app Fichiers). Taille refusée au-delà d’une limite raisonnable (proposition :
   5 Mo), pour qu’un fichier énorme ne bloque pas le navigateur.
2. Le site lit tout, contrôle tout, **sans rien enregistrer**.
3. **Si quelque chose ne va pas** : la liste des erreurs, chacune avec son onglet et sa ligne, en mots simples. Par
   exemple « onglet Relevés, ligne 8 : le compte « Livret B » n’existe pas dans l’onglet Comptes. » Rien n’est
   enregistré. On corrige le fichier et on recommence.
4. **Si tout va bien** : un aperçu, par exemple « 14 relevés, de 412 000 € en mars 2025 à 898 000 € en novembre
   2026 · 6 banques · 23 lignes · 2 objectifs ». Le constructeur choisit sa forme ; elle doit permettre de voir une
   erreur de saisie flagrante (un zéro de trop) avant d’enregistrer. Proposition : la liste des relevés avec leur
   date et leur total, en plus du résumé.
5. « Importer » enregistre tout. Ensuite, Mon argent, avec le dernier relevé, comme après un premier lancement fini.
6. **Si l’enregistrement échoue en route** (réseau coupé), le coffre doit revenir vide ou l’import pouvoir être
   repris jusqu’au bout. Jamais un état à moitié importé visible dans Mon argent. Le constructeur choisit le
   mécanisme. Supprimer ce que l’import vient d’écrire est permis : il n’y avait rien avant.

Après l’import, le premier lancement est marqué terminé (`firstLaunch.complete`). Les objectifs et le budget, s’ils
manquent, se règlent ensuite dans les Réglages, comme aujourd’hui pour qui les a passés.

## Le fichier

Les noms d’onglets et de colonnes ci-dessous font foi. Le modèle vide est le même fichier, avec une ligne d’exemple
par onglet, à effacer ou à remplacer. L’export ne contient pas ces exemples.

Règles communes :
- **Des titres en français** dans la première ligne de chaque onglet. L’import retrouve les colonnes **par leur
  titre**, pas par leur position, et ignore les colonnes inconnues. Une colonne obligatoire manquante est une
  erreur. Majuscules, accents, espaces en trop : tolérés dans les titres et dans les mots attendus (proposition).
- **Les lignes vides** sont ignorées.
- **Les montants** : un nombre, ou un texte comme « 1 200,50 € » ou « 1200.50 », lu en euros. Arrondis au centime
  à l’import, jamais au-delà. Les parts et les prix d’une part gardent leurs décimales.
- **Les dates** : une vraie date du tableur, ou un texte « 05/11/2026 » ou « 2026-11-05 ». Une date impossible
  (31/02) est une erreur.
- **Oui / non** : « oui » ou « non », vide = non.
- **Les colonnes « (calculé) »** sont écrites par l’export pour la lecture et ignorées par l’import.
- Les textes écrits par la personne (noms) sont écrits comme du texte, jamais comme une formule.

### Onglet « Mode d’emploi » (proposition)

En premier. Quelques phrases : à quoi sert le fichier, qu’il contient les chiffres en clair, comment l’importer
(sur un compte neuf, au premier lancement), et la liste des mots acceptés pour les types de compte, les
catégories, les chapitres. Ignoré par l’import.

### Onglet « Pour une IA » (demandé par Nicolas le 9 novembre 2026 ; onglet à part : proposition)

Pour qu’une personne puisse confier le modèle à un assistant (ChatGPT, Claude…) avec ses relevés de banque et
recevoir un fichier qui s’importe du premier coup. Juste après « Mode d’emploi », ignoré par l’import.

- Une phrase pour la personne, en tête : copier le contenu de cet onglet dans la conversation avec l’assistant, avec
  le fichier et ses relevés. Et une mise en garde : ce que l’on donne à un assistant part chez lui, en clair.
- Puis des consignes écrites pour l’assistant, précises et complètes, en français : le rôle de chaque onglet, chaque
  colonne avec son obligation et son format, la liste exacte des mots acceptés (types de compte, catégories,
  chapitres, façons de compter, devises), le signe des crédits, le sens du taux de change, les règles de « Relevé
  n° », « Vu le », « Nouvelle », « Fermée le », « Finance », ce qui fait refuser un fichier, et un petit exemple
  complet (deux relevés, trois lignes, un crédit). La consigne de ne rien inventer : une valeur inconnue reste vide
  ou est demandée à la personne, jamais devinée.
- **Ces consignes et l’import ne doivent jamais se contredire.** Les listes de mots et les titres de colonnes
  viennent des mêmes constantes que l’import (le catalogue, les titres) ; un test le vérifie. Et le petit exemple
  de l’onglet est lui-même un fichier de test : écrit tel quel dans un modèle, il s’importe sans erreur.

### Onglet « Comptes » : une ligne par ligne de placement

| Colonne | Obligatoire | Contenu |
|---|---|---|
| Banque | oui | Le nom de l’établissement. « Chez toi » désigne ce que la personne garde elle-même (établissement `home`). |
| Compte | oui | Le nom du compte. |
| Type de compte | oui | Un des libellés de `ACCOUNT_TYPES` (`lib/catalog.ts`) : « Compte courant », « Livret A », « LDDS », « LEP », « Livret jeune », « PEL ou CEL », « Autre livret », « Assurance-vie », « PER », « Épargne salariale », « PEA », « Compte-titres », « Or », « Crypto », « Logement », « Crédit », « Autre compte ». |
| Ligne | oui | Le nom de la ligne. Pour un compte d’une seule ligne (un livret), le même nom que le compte convient. |
| Catégorie | selon le type | Un des libellés de `CATEGORIES`. Vide : la catégorie par défaut du type (`defaultCategory`). Obligatoire quand le type n’en a pas (« Autre compte »). Interdite pour un crédit. |
| Chapitre | non | Un des libellés de `GROUP_LABELS`, permis seulement dans les catégories qui en ont (`RANGED_GROUPS`). |
| Façon de compter | non | « Montant » ou « Parts ». Vide : la première de `lineKinds` du type. Refusée si le type ne l’accepte pas. |
| Devise | non | Code à trois lettres (`CURRENCIES`). Vide : EUR. |
| Symbole suivi | non | Le symbole boursier (`quoteSymbol`), pour une ligne en parts que le site suit. |
| Débloqué le | non | Date de déblocage du compte (`unlockOn`). |
| Long à récupérer | non | Oui / non (`slow`). |
| Finance | non | Pour un crédit seulement : le logement qu’il finance, écrit « Banque › Compte › Ligne » (proposition), ou sa Référence. |
| Fermée le | non | La date de fermeture de la ligne (`closedOn`). |
| Référence | non | Écrite par l’export (l’identifiant de la ligne) ; facultative à la main. |
| Référence du compte | non | Écrite par l’export (l’identifiant du compte) ; facultative à la main. Quand elle est remplie, c’est elle qui reconnaît le compte, pas « Banque + Compte » : deux comptes de même nom (le site ne l’interdit pas) restent deux comptes. |

- Les champs d’un compte (type, déblocage, long à récupérer) se répètent sur chacune de ses lignes : deux lignes du
  même compte qui disent deux types différents sont une erreur.
- Un compte se reconnaît à « Banque + Compte », une ligne à « Banque + Compte + Ligne ». Deux lignes identiques sur
  ces trois noms sans Référence pour les distinguer : erreur. L’export écrit toujours la Référence, pour qu’un tel
  doublon (possible dans le site) revienne intact.
- Une banque du catalogue des banques retrouve son `catalogId` par son nom (proposition) ; sinon elle reste sans.

### Onglet « Relevés » : une ligne par ligne de placement et par relevé

| Colonne | Obligatoire | Contenu |
|---|---|---|
| Date du relevé | oui | Le jour du relevé (`takenOn`). Toutes les lignes d’une même date forment un relevé, sauf si « Relevé n° » les sépare. |
| Relevé n° | non | Écrit par l’export : 1, 2, 3… dans l’ordre des relevés. Le site permet deux relevés le même jour (`takenOnRange`, `lib/update/build.ts` ; `loadSnapshots` garde leur ordre) : ce numéro les garde séparés. Rempli, il fait le relevé ; vide (fichier fait à la main), c’est la date. Un même numéro sur deux dates est une erreur. |
| Banque, Compte, Ligne | oui | Doivent exister dans « Comptes » (ou la Référence). |
| Montant | si « Montant » | Dans la devise de la ligne. **Négatif pour un crédit** (ce qu’il reste à rembourser), pour que la somme de la colonne « Valeur en euros » d’un relevé donne le patrimoine net. Un crédit positif est une erreur. |
| Parts | si « Parts » | Nombre de parts, décimales permises. |
| Prix d’une part | si « Parts » | Dans la devise de la ligne. |
| Prix moyen d’achat | non | `averagePrice` ; vide = inconnu. |
| Vu le | non | Le jour où ce chiffre a été vu (`seenOn`), s’il est plus ancien que le relevé. Vide : la date du relevé. Jamais après elle. |
| Nouvelle | non | Oui quand la ligne a été ouverte avec de l’argent neuf ce mois-là (`arrival: 'opened'`) ; non ou vide : elle existait déjà (`'existing'`) (proposition). Ne compte que pour le premier relevé où la ligne apparaît. |
| Taux de change | si devise ≠ EUR | Combien vaut une unité de la devise en euros ce jour-là, le sens de `fx` dans `toEuroCents` (`lib/model/situation.ts`, qui multiplie par `fx[devise]`). Le même pour toutes les lignes d’une devise dans un relevé, sinon erreur. |
| Valeur en euros (calculé) | — | Écrite par l’export. |
| Référence | non | Comme dans « Comptes ». |

- **Une ligne absente d’un relevé n’est pas comptée à cette date.**
- **Une ligne fermée** : sa date « Fermée le » de l’onglet Comptes. Si elle manque et que la ligne n’apparaît pas
  dans le dernier relevé, elle est fermée au premier relevé où elle manque après sa dernière apparition
  (proposition). L’export écrit « Fermée le » tel quel, même après le dernier relevé (une fermeture pas encore
  « sentie », `reopenLine`). L’import refuse une fermeture inachevée (`closingUnfinished` : un relevé daté du jour
  de la fermeture ou après qui contient encore la ligne).
- Une ligne qui ne figure dans aucun relevé est permise : le site en a (`build.ts` saute une ligne sans valeur).
- « Finance » doit désigner une ligne de logement encore ouverte, la règle de `lib/correct/profile-changes.ts`.
- Il faut au moins un relevé.

### Onglet « Versements » (facultatif)

| Colonne | Obligatoire | Contenu |
|---|---|---|
| Date du relevé | oui | Un relevé qui existe dans « Relevés ». |
| Relevé n° | non | Comme dans « Relevés ». |
| Banque, Compte | oui | Un compte qui existe (ou sa « Référence du compte », même colonne que dans « Comptes »). |
| Versé | oui | En euros, depuis le relevé précédent ; négatif = retiré (`contributions`). |

Le site ne garde des versements que pour les comptes dont le type a `change: 'contributions'` (assurance-vie, PER,
épargne salariale) : un versement sur un autre compte est une erreur, pas un chiffre ignoré.

Sans versements, le site ne peut pas séparer l’argent versé de ce que les placements ont gagné. Il doit le dire
plutôt qu’afficher zéro. Le constructeur vérifie ce que les écrans montrent aujourd’hui d’un relevé sans
versements, et corrige seulement si c’est un zéro trompeur.

### Onglet « Objectifs » (facultatif)

Une ligne par objectif : « À partir du » (date), puis une colonne en pour cent par catégorie d’objectif
(« Argent disponible », « Épargne sécurisée », « Placements en bourse », « Or et crypto »). Le total fait 100,
sinon erreur. L’immobilier n’a pas d’objectif.

### Onglet « Réglages » (facultatif)

Deux colonnes, « Réglage » et « Valeur » :
- « Budget mensuel » (euros) et « Budget calculé sur » (« dépenses » ou « salaire »), les deux ou aucun ;
- « Affichage » : « euros » ou « pour cent » ;
- « Montants masqués » : oui / non.

Absents : les réglages par défaut (`DEFAULT_SETTINGS`).

## La bibliothèque

Deux bibliothèques du même auteur, licence MIT, maintenues en 2026 (vérifié le 9 novembre 2026 sur npm) :
`write-excel-file` (4.1.1, écrit) et `read-excel-file` (9.3.14, lit). ExcelJS a été écartée : aucune version depuis
octobre 2023, et 22 Mo. Nicolas a accepté d’ajouter une bibliothèque au site.

Ce qui reste à vérifier par le constructeur, en premier, avant d’écrire le reste (hypothèses non vérifiées) :
- que `write-excel-file` sait faire ce que l’objectif « fichier propre » demande (gras, ligne figée, largeurs,
  format euro et date, plusieurs onglets) ;
- que `read-excel-file` lit plusieurs onglets dans le navigateur et rend les dates comme des dates ;
- qu’elles fonctionnent avec la politique de sécurité de production (`lib/security-headers.ts` : pas de
  `unsafe-eval` ; `worker-src 'self' blob:`). Seul `npm run test:e2e:prod` le prouve, pas `test:e2e` ;
- qu’elles ne se chargent qu’au moment d’exporter ou d’importer (import dynamique), sans alourdir les autres pages.

Si l’une ne tient pas, le constructeur le dit à Nicolas avant de changer de bibliothèque.

## Comment on saura que c’est juste

- **L’aller-retour** : un test prend un patrimoine complet (plusieurs banques, « Chez toi », un crédit qui finance un
  logement, une ligne en dollars, des parts, une ligne fermée, des lignes vues plus tôt que leur relevé, des
  versements positifs et négatifs, deux objectifs, des réglages non par défaut, deux lignes de même nom, deux
  comptes de même nom dans une banque, deux relevés le même jour), l’exporte,
  relit le fichier et retrouve **le même patrimoine** : mêmes relevés, mêmes montants au centime, même situation
  calculée (`computeSituation`) à chaque date. Seuls les identifiants peuvent changer, et encore : l’export écrit la
  Référence, l’import la reprend (proposition).
- **Un fichier fait à la main**, sans Référence, avec trois relevés : il s’importe et donne les totaux attendus.
- **Chaque erreur** a son test, avec son message (onglet, ligne, mots).
- **Un fichier re-enregistré par Numbers** reste lisible : Nicolas ouvre l’export dans Numbers, l’exporte de
  nouveau en Excel, et l’import le lit. S’il peut être obtenu une fois, ce fichier devient un fichier de test.
- **Le parcours complet** dans `e2e` : un compte neuf, le modèle téléchargé, un fichier importé, Mon argent qui
  montre le bon total ; et l’export depuis les Réglages. Contre le build de production.
- Les vérifications habituelles de CLAUDE.md (`npm test`, `npm run lint`, `npx tsc --noEmit`,
  `bash scripts/check-design.sh`, `npm run build`, `mise exec -- npm run test:e2e:prod`).

## Ce qui est laissé au constructeur

La forme exacte des écrans d’import (dans le vocabulaire graphique de CLAUDE.md), les mots exacts, la découpe du
code, le mécanisme qui garantit « tout ou rien » à l’enregistrement, la largeur des colonnes et la mise en forme du
fichier dans les limites ci-dessus.

## Révisions du 9 novembre 2026, après relecture technique et UI/UX/DA (elles l’emportent sur ce qui précède)

**Ce que la personne voit**
- Réglages : la rubrique s’appelle « Mes chiffres en fichier » (comme « Mes objectifs », « Mes banques », « Mon
  compte »), en dernier avant « Mon compte ». Légende : « Tout ton historique dans un fichier Excel, à ouvrir dans
  Numbers ou à montrer à un conseiller. C’est aussi ta sauvegarde. Il est en clair : garde-le en lieu sûr. »
  Brouillon : « Ta mise à jour en cours n’y est pas, seulement les relevés terminés. » Illisibles : « 2 relevés
  n’ont pas pu être lus : ils manquent dans ce fichier. » Échec : « Le fichier n’a pas pu être préparé. Réessaie. »
  Après le téléchargement : « C’est dans tes Téléchargements (app Fichiers sur iPhone). »
- Accueil du premier lancement : **un seul lien discret** sous « Tu peux t’arrêter… » : « J’ai déjà mes chiffres
  dans un fichier ». Le modèle se télécharge depuis l’écran d’import : « Pas encore de fichier ? Télécharge le
  modèle, remplis-le sur ordinateur, puis reviens ici. »
- Écran d’import : avant le choix, « Depuis Numbers, exporte d’abord en Excel : Partager › Exporter › Excel. » ; une
  pilule « Choisir le fichier » (pas le champ brut). Erreurs : en tête « Rien n’est enregistré. Corrige ces points
  dans le fichier, puis choisis-le de nouveau. », groupées par onglet, chacune « Onglet Relevés, ligne 8 : … ».
  Aperçu : « 14 relevés · 6 banques · 23 placements · 2 objectifs », les relevés du plus récent au plus ancien avec
  leur total, les noms des banques, « Ça ressemble à tes chiffres ? », la pilule « Importer ces chiffres » et un
  lien « Choisir un autre fichier ».
- « Repartir de zéro » : « Sans ta clé, tes chiffres sont perdus pour de bon. Si tu les as téléchargés dans les
  Réglages, tu pourras les reprendre juste après. Tu peux repartir de zéro avec un coffre vide. »
- Le téléchargement est vérifié sur un vrai iPhone (Safari et l’app sur l’écran d’accueil) avant la fusion.

**Le fichier**
- Ordre des onglets à l’export : Comptes, Relevés, Versements, Objectifs, Réglages, Mode d’emploi, Pour une IA (ce
  qu’un conseiller voit d’abord, ce sont les chiffres). Dans le modèle : Mode d’emploi d’abord.
- Titres renommés : « Référence » → « Identifiant (laisser vide) » ; « Référence du compte » → « Identifiant du
  compte (laisser vide) » ; « Vu le » → « Chiffre vu le (si plus ancien) » ; « Nouvelle » → « Ouverte avec de
  l’argent neuf » ; « Finance » → « Logement financé » ; « Relevé n° » → « N° du relevé », placé après « Date du
  relevé ». Les identifiants en dernier, avec un titre plus pâle.
- Comptes, dans l’ordre : Banque, Compte, Ligne, Type de compte, Catégorie, Chapitre, Façon de compter, Devise, puis
  les facultatifs, puis les identifiants. Relevés : « Valeur en euros (calculé) » juste après Ligne, et « Devise
  (calculé) » à côté du montant.
- **Les lignes d’exemple du modèle ne s’importent pas** : « Onglet Comptes, ligne 2 : c’est la ligne d’exemple du
  modèle. Efface-la ou remplace-la. » (oubliées, elles mettraient une fausse banque dans le coffre, sans retour).
- Un crédit positif : « Onglet Relevés, ligne 12 : un crédit s’écrit en négatif (ce qu’il reste à rembourser), par
  exemple -180 000. » Le modèle en montre un.
- Objectifs : des nombres simples, titres « Argent disponible (%) »… Une ligne dont le total fait 1 (« 25 % » tapé
  dans Excel est rangé 0,25) est lue en fractions.
- Formats : euros `#,##0.00 "€"` (le tableur l’affiche à la française), dates `dd/mm/yyyy` ; Mode d’emploi en
  colonne large, texte replié, première ligne en gras.
- Onglets inconnus (Numbers ajoute parfois un résumé) ignorés ; noms d’onglets reconnus comme les mots.

**Fidélité : un fichier que le site a produit se réimporte toujours**
- Une fermeture inachevée (`closingUnfinished`) est **acceptée telle quelle** (elle est atteignable, et la fiche de
  la ligne propose de la terminer) : c’est l’inverse de ce qui était écrit plus haut.
- Un crédit peut financer un logement vendu (ligne fermée) : « Logement financé » doit désigner une ligne d’un compte
  de type Logement, ouverte ou non.
- La fermeture déduite (ligne absente des relevés suivants) ne s’applique qu’aux lignes sans identifiant.
- L’établissement « Épargne salariale » (`catalogId: 'employee-savings'`) est reconnu par son nom.
- « Ouverte avec de l’argent neuf » : oui → `opened`, non → `existing`, vide → rien (le premier lancement n’écrit
  rien).
- Ce qui ne survit pas à l’aller-retour, et n’a pas d’effet : les identifiants des banques, `firstLaunch.planned`,
  les taux de devises qu’aucune ligne n’utilise, des réglages absents (reviennent par défaut).

**L’enregistrement**
- Le profil et les réglages (une seule ligne par personne) ne sont jamais effacés : ils sont réécrits par leur
  identifiant ; quand le profil n’existe pas, un profil vide est écrit d’abord pour en avoir l’identifiant. Les
  restes d’un import échoué (relevés, objectifs, brouillons) sont effacés au début d’un nouvel import **et** au début
  d’un premier lancement fait à la main.
- Un coffre n’est vide que si, en plus, aucun document n’est illisible et le premier lancement n’est pas marqué
  terminé.
- Rien n’est défait après l’écriture du profil (sa réponse peut s’être perdue alors qu’il est écrit).

## Note du 9 novembre 2026, à la fin de la construction : ce qui diffère de ce qui précède

- **Le modèle n’a pas de ligne d’exemple dans Objectifs ni dans Réglages** : ces onglets ne nomment pas de banque,
  et c’est la banque d’exemple qui fait reconnaître (et refuser) une ligne d’exemple. Ils restent vides ; le Mode
  d’emploi donne leurs mots.
- **L’onglet Comptes garde aussi les comptes sans ligne et les banques sans compte** : une ligne avec « Ligne »
  vide pour un compte encore vide, une ligne avec la seule « Banque » pour une banque encore vide. Sans cela, ils
  se perdaient à l’aller-retour.
- **« Montant », « Prix d’une part » et « Prix moyen d’achat » sont des nombres simples, sans « € »** : une ligne en
  dollars aurait affiché « € ». Seuls « Valeur en euros (calculé) » et « Versé » gardent le format en euros.
- **« Logement financé » peut contenir l’identifiant du logement** au lieu de « Banque › Compte › Ligne », quand un
  des noms contient « › » ou que deux logements s’écrivent pareil. Les consignes « Pour une IA » le disent.
- **Après un import, les comptes et les lignes sont rangés dans l’ordre de l’onglet Comptes** : banque, puis compte,
  puis ligne. Une ligne ajoutée plus tard à un vieux compte (une mise à jour l’ajoute en dernier) revient donc à
  côté des autres lignes de son compte.
- **Une ligne d’objectifs avec une seule part à 1 et les autres à 0 est refusée** : elle se lit aussi bien 1 % que
  100 %. Le message demande les pourcentages en nombres simples (100, pas 1).
- **Deux banques dont les noms se lisent pareil** (majuscules, accents et espaces mis à part) deviennent une seule banque.
- **Deux refus de plus**, tirés des règles du site : un compte rangé là où le site ne le range pas (un Logement hors
  de « Chez toi », un Livret dans « Chez toi », un Crédit à l’Épargne salariale) ; « Long à récupérer » rempli pour
  un type où cela ne se choisit pas (Logement, PER, Crédit).
- **Un relevé sans aucun placement a sa ligne dans « Relevés »** : sa date et son numéro, toutes les autres cases
  vides. Le site en garde un quand un premier lancement se termine sans compte (« J’ai fini avec… » n’en demande
  pas) ou quand une mise à jour ferme tout. Sans cette ligne, le fichier était refusé (« il n’a aucune ligne ») ou
  perdait ce relevé. Une telle ligne dans un relevé qui a des placements reste refusée. **Le numéro y est
  obligatoire** (l’export l’écrit toujours) : une ligne qui n’a que sa date, sans numéro, est refusée, car tapée à la
  main c’est plutôt un placement oublié, et lue comme un relevé vide elle fermerait toutes les lignes sans
  identifiant. Dans l’aperçu de l’import, un tel relevé dit « aucun placement » au lieu d’un total à 0 €.
