# Refonte — le fonctionnement

*6 novembre 2026. Suite de `2026-11-06-refonte-interface-design.md`, qui décrit les écrans. Ce
document dit ce que l'application sait, calcule et conserve pour les faire vivre. Il répond aux
questions de fonctionnement listées à la fin du document d'interface ; chaque décision ci-dessous a
été validée par Nicolas, sauf mention « à valider ».*

## Le cadre

- **Pour tout le monde** : inscription ouverte. C'est une bêta : on fait léger sur tout ce qui
  n'est pas indispensable.
- **Dans ce dépôt**, en remplaçant le site actuel. L'ancien code peut être effacé ; la production
  montrera le nouveau site au fil de sa construction, et c'est accepté.
- **Avant tout effacement**, les vrais chiffres de Nicolas, qui étaient dans la base Neon de
  l'ancien site, ont été exportés (copie locale, hors du dépôt : ce sont des données personnelles),
  comme sauvegarde ; ils ne seront pas réimportés (voir plus bas). Le 6 novembre 2026, avec l'accord
  de Nicolas et une fois la sauvegarde vérifiée identique, la base Neon `stefin` de l'ancien site a
  été supprimée ; le projet Neon lui-même est conservé, car il contient les données d'autres
  applications.
- **Aucun conseil, aucune connexion aux banques** dans cette version. Le cours des titres cotés,
  lui, se met à jour tout seul, comme sur l'ancien site (voir plus bas).

## Comptes et données

- **Supabase, offre gratuite, région Europe.** Il fournit l'inscription par e-mail et mot de passe,
  la confirmation de l'adresse et le mot de passe oublié — rien de tout ça n'est fabriqué à la main.
- **Chacun ne voit que ses propres chiffres, garanti deux fois.** L'application ne demande que les
  données de la personne connectée, **et** la base refuse d'elle-même de servir celles d'un autre
  (règles de sécurité au niveau des lignes de Supabase). Un défaut dans l'un des deux n'ouvre rien.
  Un test vérifie que la base refuse, sans passer par le code de l'application.
- **Le plancher légal de la bêta** : une courte page qui dit ce qui est gardé et pourquoi ; la
  suppression d'un compte et de toutes ses données sur simple demande par e-mail. Rien de plus pour
  l'instant.
- **La pause de l'offre gratuite.** Supabase met en pause un projet gratuit dont la base reçoit
  trop peu de requêtes pendant sept jours ; il faut alors le relancer à la main (vérifié dans sa
  documentation, le 6 novembre). C'est ce qui avait fait choisir Neon en août. Décidé : **une
  visite automatique chaque jour** — une tâche programmée chez Vercel appelle une petite fonction
  de la base, protégée par un secret — ce que la documentation de Supabase indique comme suffisant.
  Supabase prévient par e-mail une semaine avant toute pause : c'est le filet si la visite échoue.
- **Le compte Supabase** : un compte dédié, choisi par Nicolas, et non celui qui est aujourd'hui
  connecté sur sa machine (organisation « littlenunu's Org », projet « yww », sans rapport).
- **Sauvegardes** : l'offre gratuite n'en propose probablement pas d'automatiques (à vérifier au
  moment de créer le projet). **À l'ouverture de l'inscription, passer à l'offre payante**
  (environ 25 dollars par mois : plus de pause, sauvegardes quotidiennes) — une dépense à soumettre
  à Nicolas avant de l'engager.
- **Les e-mails d'inscription.** D'après sa documentation, Supabase n'envoie la confirmation
  d'adresse et le mot de passe oublié qu'aux membres de l'équipe du projet, tant qu'on n'a pas
  branché son propre service d'envoi. Pendant la construction, ça suffit : Nicolas est le seul
  utilisateur. **L'inscription s'ouvre à la fin**, et demande alors un service d'envoi (il en
  existe de gratuits) et un nom de domaine, que Nicolas n'a pas encore : l'achat du domaine est
  une dépense à lui soumettre.

## Chiffrement de bout en bout

Décidé : **les chiffres de chacun sont illisibles côté serveur**, y compris pour Supabase et pour
l'assistant.

- **Un seul mot de passe.** L'appareil en tire deux secrets distincts : de quoi se connecter, qui
  part chez Supabase, et la clé du coffre, qui ne quitte jamais l'appareil. Connaître le premier ne
  permet pas de retrouver la seconde.
- **Une clé de secours**, montrée une fois à l'inscription, à mettre de côté. Le mot de passe
  oublié se réinitialise par e-mail, mais seule la clé de secours rouvre le coffre. Sans elle, les
  chiffres sont perdus : l'écran le dit clairement, avant et au moment de l'inscription.
- **Tout ce qui décrit la situation de quelqu'un est chiffré** sur l'appareil avant de partir :
  noms des comptes et des lignes, montants, parts, prix d'achat, versements, objectifs, réglages,
  brouillons de mise à jour. Le serveur garde des paquets scellés, et la règle « chacun ne voit que
  les siens » s'applique en plus.
- **Chaque document est scellé pour sa place** : il est lié à son propriétaire, à son type et à son
  identifiant. Déplacé par le serveur vers une autre place, il est refusé et mis de côté, sans
  jamais faire planter le reste.
- **Un numéro de format**, en clair, accompagne chaque document : un paquet scellé selon un autre
  procédé n'est jamais ouvert comme s'il suivait celui-ci.
- **Une clé de secours jamais confirmée comme mise de côté est remplacée** à la connexion suivante
  (elle a pu être perdue), et la confirmer vérifie que la clé affichée à l'écran est toujours la
  bonne.
- **Le serveur voit encore** : l'adresse e-mail, les dates de connexion et de mise à jour, le
  volume des données, et les titres dont on demande le cours (sans quantité ni montant).
- **Tous les calculs se font sur l'appareil** : grille, objectifs, coussin, évolution, effort ou
  marchés. Le serveur ne calcule rien sur les chiffres de quelqu'un : pas d'e-mail contenant des
  montants, pas d'analyse automatique.
- **Uniquement des outils de chiffrement éprouvés** (ceux du navigateur, et une bibliothèque
  reconnue pour tirer une clé d'un mot de passe) ; aucun procédé maison.
- **Un test vérifie tout seul** que ce qui part vers le serveur ne contient aucun montant ni aucun
  nom de compte en clair.

## Cours de bourse et devises

- **Le cours des titres cotés** (actions, ETF) se met à jour tout seul, chaque fois qu'on ouvre
  l'application, comme sur l'ancien site (même source : `lib/quotes/`). Le serveur reçoit la liste
  des titres et renvoie leurs cours ; il ne sait ni combien on en a, ni ce qu'ils pèsent. Les
  lignes non cotées (soldes, livrets, assurance-vie, PER, épargne salariale) restent saisies à la
  main lors de la mise à jour.
- **Mon argent montre donc deux dates** quand elles diffèrent : « Cours du jour pour tes actions ·
  le reste au 30 septembre ». Un relevé, lui, ne se crée qu'à la mise à jour ; les cours du jour
  n'en fabriquent pas.
- **Chaque ligne a sa devise.** On saisit le montant tel que la banque l'affiche (dollars chez
  Revolut, par exemple). L'application le convertit en euros avec le taux officiel du jour de la
  Banque centrale européenne, récupéré automatiquement : une donnée publique qui ne révèle rien.
  Un relevé garde le taux utilisé, pour que l'histoire ne change pas quand le taux bouge.

**Construit au lot 4b (8 novembre 2026, plan validé par Nicolas).**
- **Sources.** Yahoo Finance pour les prix et la recherche (gratuite, non officielle : elle peut
  casser un jour, et l'écran le dit alors ligne par ligne). Le fichier quotidien de la BCE
  (`eurofxref-daily.xml`) pour les taux. Les deux sont appelés seulement par le serveur du site,
  derrière une session.
- **Rattacher une ligne.** Une ligne « titres » se rattache à son prix par une recherche, par nom
  ou par code ISIN : quand on l'ajoute (premier lancement, « + Ajouter » de la mise à jour), ou
  sur l'écran « Tes titres » pour les lignes déjà saisies. Une ligne d'un compte à versements
  (assurance-vie, PER) peut aussi se rattacher. L'or et la crypto, non.
- **Mon argent.** Seules les lignes rattachées bougent, aux taux du relevé. Un prix de plus de
  sept jours, ou plus vieux que le relevé, n'est pas « du jour ». Un prix ou un taux manquant est
  dit, jamais remplacé par 0.
- **La mise à jour.** La case « prix d'une part » est pré-remplie avec le prix du jour, pris une
  fois à l'ouverture : laissée telle quelle, c'est lui qui entre dans le relevé. Le relevé garde
  le taux du jour, ou celui du relevé précédent si la BCE ne répond pas, et le dit. Sans aucun
  taux connu pour une devise utilisée, « Enregistrer » attend.
- **Devises.** Euros, dollars américains, livres sterling et francs suisses. La devise se choisit
  à l'ajout d'une ligne, et ne change plus une fois la ligne dans un relevé. Un crédit reste en
  euros.

## Ce que l'application conserve

Décrit en mots ; la forme exacte des tables est laissée au plan.

- **Une personne** a des **établissements** : ses banques, et « Chez toi » pour ce qu'elle détient
  elle-même (logement, or, crypto sur un portefeuille personnel). Un crédit appartient à sa banque et
  désigne ce qu'il finance, où que cela se trouve (décision du 7 novembre). L'or et la crypto
  achetés sur une plateforme se saisissent avec elle.
- **Un établissement** a des **comptes**. Un compte a un **type** : compte courant, Livret A, LDDS,
  LEP, Livret Jeune, PEL ou CEL, autre livret, assurance-vie, PEA, compte-titres, PER, épargne
  salariale, logement, or, crypto, crédit.
- **Un compte** contient des **lignes** :
  - une ligne « montant » (un livret, un fonds euros, une maison) ;
  - ou une ligne « titres » (une action, un fonds, de l'or, une crypto) : nombre de parts, prix
    moyen d'achat (peut être vide), prix d'une part, et, si elle est cotée, de quoi retrouver son
    cours automatiquement.
  - Chaque ligne a sa **devise** (l'euro par défaut).
- **Un relevé** est une photo datée de toute la situation : la valeur de chaque ligne à cette date,
  et pour les lignes « titres », les parts et le prix moyen. Il naît d'une mise à jour (ou du
  premier lancement). Pour l'assurance-vie, le PER et l'épargne salariale, il garde aussi « ce qui
  a été versé depuis le relevé précédent ».
- **Les objectifs** sont datés : une répartition en pourcentages de l'argent hors logement, avec
  la date à partir de laquelle elle vaut. Changer ses objectifs ajoute une nouvelle répartition ; on
  n'écrase jamais l'ancienne.
- **Les réglages** : dépenses par mois **ou** salaire net (et lequel des deux), affichage en euros ou
  en %, montants masqués ou non.
- **Les listes des banques proposées et des types de comptes** vivent dans un seul fichier du dépôt,
  modifiable sans toucher aux écrans.

## Ce que l'application calcule

### Les catégories

Déduites du type de compte ou de ligne, modifiables ligne par ligne :

| Type | Catégorie |
|---|---|
| Compte courant, tous les livrets | Argent disponible |
| Fonds euros (assurance-vie, PER) | Épargne sécurisée |
| PEA, compte-titres, unités de compte (assurance-vie, PER), épargne salariale | Placements en bourse |
| Or, crypto | Or et crypto |
| Logement | Immobilier |

### Ce qui est récupérable vite

Déduit du type de compte : tout de suite (compte courant, livrets) ; en quelques semaines (actions,
assurance-vie, or, crypto) ; bloqué jusqu'à une date (épargne salariale, avec sa date de
déblocage) ; bloqué jusqu'à la retraite (PER) ; le logement à part.

### Ce qui est vraiment à toi, et les crédits

- Ce qui est à toi = tout ce qui est possédé − tous les crédits restant dus.
- Un **crédit immobilier** est rattaché à un logement : la valeur nette de ce logement est sa valeur
  estimée moins ce crédit.
- Un **crédit qui ne finance rien de suivi** (voiture, études, consommation) est retiré de
  « Argent disponible », puisque c'est avec cet argent qu'on le rembourse.
- **Une catégorie négative** (un logement qui vaut moins que son crédit, un argent disponible
  inférieur à un prêt) n'a pas de carré. Elle est listée à part avec une phrase. Dans ce cas, la
  grille répartit les catégories positives, et l'écran le dit.
- **Si ce qui est à toi est nul ou négatif**, pas de grille : ce qui est possédé, ce qui est dû, et
  une phrase.

### Les cent carrés

- Chaque catégorie reçoit sa part de cent, arrondie **au plus fort reste** (les arrondis par défaut
  d'abord, puis les carrés restants aux catégories qui en sont le plus près), de sorte que le
  total fasse toujours cent.
- **Une catégorie qui détient quelque chose n'arrondit jamais à zéro carré** : « tu ne détiens rien
  ici » serait faux. À l'intérieur d'une catégorie, une ligne peut en revanche valoir zéro carré :
  elle est alors listée sous « Trop petit pour un carré ».
- En %, une part s'affiche comme son nombre de carrés (règle du document d'interface).

### Les objectifs

- Ils portent sur **l'argent hors logement**, en pourcentages qui totalisent 100.
- Pour l'affichage, chaque objectif est converti en carrés de la grille entière : objectif × nombre
  de carrés hors logement. Les « carrés pas à leur place » sont la somme des excédents.
- Un ancien relevé se compare aux objectifs **en vigueur à sa date**.
- **Exemples validés par Nicolas le 6 novembre 2026** (argent disponible / épargne sécurisée /
  placements en bourse / or et crypto) : Prudent 20 / 60 / 15 / 5 ; Équilibré 15 / 35 / 45 / 5 ;
  Dynamique 10 / 15 / 65 / 10. Identiques pour tout le monde : des exemples, pas un conseil.
  **Remplacés le 10 novembre 2026** (accord de Nicolas, sur l'avis d'un conseiller en patrimoine) :
  Prudent 40 / 45 / 15 / 0 ; Équilibré 25 / 25 / 45 / 5 ; Dynamique inchangé. Voir
  `2026-11-10-criteres-des-experts-design.md`.

### Le coussin de sécurité

Argent disponible ÷ dépenses mensuelles, ou ÷ salaire net si c'est ce que la personne a donné.
L'écran dit lequel. Sans l'un ni l'autre, il n'est pas calculé.

### Ton effort ou les marchés

Entre deux relevés, chaque variation est rangée dans l'une de trois familles : **ton effort**, **les
marchés et les intérêts**, **ta maison réestimée**.

| Ce qui a bougé | Effort | Marchés et intérêts |
|---|---|---|
| Comptes de bourse (PEA, compte-titres), or, crypto | variation de « parts × prix moyen d'achat » | le reste de la variation |
| Assurance-vie, PER, épargne salariale | « versé depuis la dernière fois » (employeur compris) | le reste de la variation |
| Compte courant, livrets | toute la variation (intérêts compris, approximation assumée) | — |
| Crédit | la baisse de ce qui est dû | — |
| Logement | — | — (rangé dans « maison réestimée ») |

**Une ligne qui apparaît.** Quand on ajoute une ligne, l'écran demande : « Ouvert depuis la
dernière fois, ou tu l'avais déjà ? ».
- **Ouvert depuis** : sa valeur de départ compte comme de l'effort (de l'argent qu'on y a mis), et
  un nouveau crédit comme un effort négatif. Un logement acheté entre donc pour sa valeur dans
  l'effort, son crédit en sort, l'apport quitte les livrets : le tout s'équilibre, et seules ses
  réestimations suivantes vont dans « maison réestimée ».
- **Tu l'avais déjà** (un compte oublié) : il n'entre pas dans le partage de la période. Il est
  simplement ajouté, et « D'où ça vient » le signale à part.
- Une ligne fermée sort de la même façon : le solde retiré quitte l'effort.

**Limite connue** : quand on vend des titres, le gain réalisé atterrit souvent sur un compte
courant ou un livret, où il sera compté comme de l'effort. Acceptable pour la bêta ; à corriger
plus tard si ça gêne (en reconnaissant un transfert).

### « Bon à savoir »

Pour la bêta, seulement des constats calculables avec ce qu'on conserve : la part du logement dans
ce qui est à toi ; une même valeur détenue sur plusieurs comptes, reconnue **par son nom** ; une
épargne placée chez son employeur, reconnue par le compte d'épargne salariale (dont l'établissement
est l'entreprise). Pas de champ « émetteur » ni « employeur » à saisir.

## Les règles de la mise à jour

- **Une case pré-remplie qu'on ne touche pas vaut « inchangé ».**
- **Le brouillon est enregistré au fil de la saisie**, sur le serveur : on peut quitter
  l'application pour lire un solde, ou reprendre le lendemain sur un autre appareil.
- **On peut enregistrer sans avoir tout revu** : les comptes non revus gardent leur valeur
  précédente, et chaque valeur garde la date à laquelle elle a été vue pour la dernière fois.
- **Le relevé porte la date du jour de l'enregistrement**, modifiable.
- **À la fin de chaque compte**, le total calculé est montré avec « C'est bien ce que montre ta
  banque ? ». Un écart vient presque toujours d'un achat ou d'une vente oublié.
- **Ouvrir, fermer, corriger** : « + Ajouter » à chaque établissement, « Fermé ou tout vendu » sur
  chaque ligne. Hors mise à jour, une ligne se corrige depuis son détail, et un relevé déjà
  enregistré depuis la liste « Tes relevés ».

**Construit au lot 4c (8 novembre 2026).** Chaque ligne a sa fiche, qu'on ouvre depuis le détail
d'une catégorie : nom, parts et prix, rangement, année de déblocage. Corriger une erreur de saisie
n'est pas un changement : la correction s'applique au même chiffre reporté d'un relevé à l'autre,
sans créer de relevé et sans compter comme de l'argent mis de côté ni comme un gain. « Fermé ou tout
vendu » met la ligne à zéro à la date choisie. Si aucun relevé n'est réécrit, rien n'est demandé et
la fermeture se défait par « Ce n'était pas fermé » ; si des relevés le sont, elle demande une
confirmation et ne se défait pas. « Supprimer, saisi par erreur » l'efface de tous les
relevés, après confirmation, et ne se défait pas. Un crédit se range dans la banque qui l'a prêté.
Le détail est dans `docs/superpowers/specs/2026-11-08-lot-4c-corriger-une-ligne-design.md`.

**Construit au lot 6a (9 novembre 2026).** Un petit lien « Réglages » en haut de Mon argent ouvre un
écran qui se pousse sur Mon argent, sans barre d'onglets. Il réunit : les objectifs et les dépenses
par mois (qui rouvrent les écrans du premier lancement, puis reviennent aux Réglages sans le faire
avancer), les banques (en ajouter, retirer une banque vide, changer l'ordre de la mise à jour), le
choix euros ou % et « Masquer les montants » (chaque montant devient « ••• » sur toute l'application ;
les pourcentages et les carrés restent), et le compte : changer de mot de passe, refaire sa clé de
secours (montrée une fois, confirmée comme au premier lancement) et retirer une clé Face ID. Rien de
nouveau ne part en clair : changer de mot de passe n'envoie que le nouveau secret de connexion dérivé
et un paquet chiffré ; le coffre prend le nouveau mot de passe avant la connexion, pour qu'aucune
coupure ne laisse un coffre que rien n'ouvre. L'import de l'ancien site est retiré, et les routes de
cours ont un plafond global d'appels par minute vers Yahoo. Le détail est dans
`docs/superpowers/specs/2026-11-09-lot-6a-reglages-design.md`.

## Pas de reprise de l'ancien site

Décidé par Nicolas le 6 novembre : **il repart de zéro**, sans reprendre ni ses chiffres ni son
historique, pour vivre le premier lancement comme n'importe quel nouvel utilisateur. Il saisira sa
situation par le parcours de bienvenue.

L'export de l'ancienne base reste fait avant tout effacement, **comme sauvegarde** : rien n'est
importé, mais rien n'est perdu.

## Ce qui reste ouvert

1. ~~**Les proportions des exemples d'objectifs**~~ — validées par Nicolas le 6 novembre 2026
   (voir plus haut).
2. **Le passage à l'offre payante de Supabase** à l'ouverture (sauvegardes, plus de pause) : une
   dépense à soumettre.
3. **La bascule de l'adresse.** La base Neon `stefin` de l'ancien site a été supprimée le
   6 novembre 2026, avec l'accord de Nicolas et après vérification que la sauvegarde était
   identique ; le projet Neon est conservé (il contient les données d'autres applications).
4. **La vente de titres** comptée comme de l'effort (limite connue ci-dessus).
5. **Le nom de domaine et le service d'envoi d'e-mails**, à l'ouverture de l'inscription (le
   domaine est une dépense à soumettre).
