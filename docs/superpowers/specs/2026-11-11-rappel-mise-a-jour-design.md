# Le rappel de mise à jour

Décidé avec Nicolas le 11 novembre 2026. Ce document fait foi pour ce rappel.

## Pourquoi

Oseil ne vaut que si ses chiffres sont récents. Personne ne pense de lui-même à revenir tous les
trimestres : sans rappel, le patrimoine affiché vieillit sans bruit, et un chiffre vieux qui a l’air
juste est exactement ce que le projet refuse (« Une réponse qu’on ne peut pas donner se dit »).
Le rappel n’est pas là pour informer : **il est là pour que la personne fasse sa mise à jour.**
Il mène au parcours qui existe déjà (`/mise-a-jour`), il n’en crée pas un nouveau.

## Ce qui est décidé (par Nicolas)

- **Sur le site, après 3 mois sans mise à jour** : un message à l’ouverture de Mon argent, qui
  propose de mettre à jour.
- **Par e-mail, après 6 mois sans mise à jour** : un e-mail qui ramène sur Oseil.
- **Seulement si rien n’a été fait entre deux** : chaque mise à jour remet le compteur à zéro.
  Qui met à jour tous les mois ne voit jamais rien.
- **L’e-mail se coupe** : un réglage « Me le rappeler par e-mail » dans les Réglages, **activé par
  défaut** ; un lien « Ne plus recevoir ce rappel » au bas de chaque e-mail ; une phrase de plus
  dans la page de confidentialité.
- **Pas de rappel de sauvegarde.** L’idée d’un rappel « télécharge ton fichier Excel » a été
  proposée puis écartée par Nicolas. Rien ne parle de sauvegarde, ni sur le site ni par e-mail.

## Non-objectifs

- Pas de notification sur le téléphone (push), pas de SMS.
- Pas de rappel sur une autre date que la mise à jour (objectifs, dépenses, clé de secours…).
- Pas de calendrier fixe (1er janvier, 1er avril…) : tout se compte depuis la dernière mise à jour.
- Rien dans l’exemple (`/exemple`) : la personne inventée n’a pas de rappel.

## Anti-objectifs (ce qui ferait de ce chantier un échec, même s’il marche)

- **Un e-mail qui révèle quelque chose de la situation** : ni montant, ni banque, ni nombre de
  comptes, ni catégorie. Un e-mail peut être lu par-dessus l’épaule ou transféré.
- **Un rappel qui harcèle** : plusieurs e-mails pour la même période d’absence, ou un message qui
  bloque l’écran sans pouvoir être écarté.
- **Un rappel qui ment** : envoyé à quelqu’un qui vient de mettre à jour, ou qui affirme une date
  fausse. Dans le doute, ne rien envoyer.
- **Une nouvelle donnée en clair non décidée** (voir « Rien ne part en clair » plus bas).

## Le comportement

### Ce qu’est « une mise à jour »

L’enregistrement d’un nouvel état des comptes (un document `snapshot`) : à la fin d’une mise à
jour, d’un premier lancement ou d’un import. Le rafraîchissement automatique des cours de bourse
**n’en est pas une** : il ne dit rien des comptes que la personne tape elle-même.

**Le compteur part du jour où la mise à jour a été faite**, pas de la date choisie pour les
chiffres (choix de Claude, pour tenir l’anti-objectif « un rappel qui ment »). Les deux peuvent
être loin l’une de l’autre : un import garde les dates du fichier, parfois vieilles de plusieurs
années, et la mise à jour permet de dater ses chiffres d’un jour passé (`takenOnRange`,
`lib/update/build.ts`). Quelqu’un qui vient d’importer ou de mettre à jour ne doit jamais voir le
rappel. Le site et l’e-mail utilisent donc la même date : la `created_at` du `snapshot` le plus
récent (le site la lit en même temps que le document, ou garde la plus récente de `takenOn` et
de `created_at`, au choix du constructeur). Le message peut, lui, dire de quand datent les chiffres
(`takenOn`).

### Sur le site (3 mois)

- Quand la dernière mise à jour a 3 mois ou plus (comptés en mois du calendrier : du 11 février
  au 11 mai), l’ouverture de Mon argent montre le message.
- Ce qu’il dit : depuis quand les chiffres datent, et une pilule pleine « Mettre à jour » vers
  `/mise-a-jour`. Si une mise à jour est déjà en cours (`update.pending`), il dit « Reprendre ».
- Il s’écarte (« Plus tard »). Écarté, il ne revient pas avant le lendemain. Il revient
  ensuite chaque jour d’ouverture, tant que la mise à jour n’est pas faite.
- Il n’apparaît pas tant que le coffre n’est pas ouvert et le tableau prêt, ni quand une mise à
  jour n’est pas possible (`update.available` faux).
- **Sa forme : une feuille qui monte du bas** (planche A, choisie par Nicolas le 11 novembre
  2026, contre un bloc en tête de Mon argent et une ligne à la place de la date). L’écran
  s’assombrit derrière ; la feuille porte un titre (« Tes chiffres ont trois mois »), une phrase
  (« Ils datent du 11 août. Un tour de tes banques, et ils seront de nouveau justes. »), la pilule
  pleine « Mettre à jour » et un lien souligné « Plus tard ». Elle suit le vocabulaire graphique du `CLAUDE.md` : aucun pictogramme ajouté, aucune
  ombre, aucun émoji.

### Par e-mail (6 mois)

- Une tâche tourne chaque jour. Elle écrit à chaque compte dont la dernière mise à jour a 6 mois
  ou plus, qui n’a pas coupé le rappel, et qui n’a pas déjà reçu un rappel pour cette absence.
- **Un e-mail par période de 6 mois d’absence** : un à 6 mois, un deuxième à 12 mois si rien
  n’a changé, et ainsi de suite. Jamais deux e-mails à moins de 6 mois d’écart.
- Un compte sans aucune mise à jour (inscrit, premier lancement jamais fini) ne reçoit rien :
  il n’a pas de chiffres qui vieillissent.
- Le contenu : expéditeur « Oseil » `<noreply@milou.studio>`, comme les autres e-mails. Une
  phrase qui dit que ses chiffres n’ont pas été mis à jour depuis plus de six mois, un bouton vers
  `https://oseil.fr`, et en bas « Ne plus recevoir ce rappel ». Même style que les six modèles
  existants (`scripts/emails/gen_emails.py`, thème clair de `globals.css`). Les mots exacts
  passent par Nicolas.
- « Ne plus recevoir ce rappel » marche **sans se connecter** : un lien qui contient un jeton
  propre au compte, vers une page qui demande un toucher sur un bouton « Ne plus recevoir ce
  rappel », puis confirme « C’est noté, plus de rappel par e-mail » et dit qu’on peut le réactiver
  dans les Réglages. **Ouvrir la page seule ne coupe rien** (choix de Claude) : les filtres de
  messagerie (Outlook, certaines boîtes d’entreprise) ouvrent les liens d’avance, et couperaient
  le rappel sans que la personne le sache. Pas d’en-tête `List-Unsubscribe` pour l’instant : un
  e-mail tous les six mois au plus n’est pas un envoi de masse.

### Dans les Réglages

Un réglage « Me le rappeler par e-mail », activé ou non, avec une ligne d’explication (« quand tes
chiffres n’ont pas été mis à jour depuis six mois »). Il reflète l’état réel, y compris après un
clic sur le lien de l’e-mail. Place exacte dans les Réglages : au choix du constructeur, près de
« Mon compte ».

### Page de confidentialité

Dans « Ce que nous gardons en clair », la ligne « Ton adresse e-mail » dit aussi : pour te rappeler
de mettre à jour tes chiffres, si tu ne l’as pas coupé. Une ligne de plus dit que le serveur sait
si le rappel par e-mail est coupé et quand le dernier est parti.

## Rien ne part en clair

**Ce que le serveur sait déjà, et qui suffit pour la date** : chaque document chiffré a sa
`created_at`, et son type (`snapshot`) est en clair. La date de la dernière mise à jour, côté
serveur, est donc la plus récente `created_at` des documents `snapshot` du compte. Rien de
nouveau ne part pour ça.

**Ce qui est nouveau, et validé par Nicolas le 11 novembre 2026 en acceptant le réglage** :
- si le rappel par e-mail est coupé (oui ou non) ;
- la date du dernier rappel envoyé ;
- un jeton aléatoire par compte, pour le lien de désinscription (il ne dit rien de la personne).

Rien d’autre. L’e-mail ne contient aucune donnée tirée du coffre : le serveur ne peut pas en lire,
et il n’en a pas besoin.

## Comment c’est fabriqué

### Le site (3 mois) : choix de Claude

Tout se calcule dans le navigateur, depuis la date du dernier état (`takenOn` du dernier
`snapshot`, déjà déchiffré pour Mon argent). La règle (3 mois atteints ? écarté aujourd’hui ?)
vit dans une petite fonction pure, testée seule. Le « écarté aujourd’hui » est un mot du stockage
local du navigateur, comme l’apparence (`oseil-apparence`) ou l’indice des carrés
(`oseil-indice-carres`) : jamais envoyé.

### L’e-mail (6 mois) : choix de Claude, à cause d’une règle du projet

La clé qui permet de lire tous les comptes (`SUPABASE_SECRET_KEY`) est **interdite dans `app/`,
`lib/` et `components/`**. Une route du site ne peut donc pas parcourir les comptes pour trouver
qui prévenir. La tâche tourne **dans la base** :

- une tâche programmée par `pg_cron`, une fois par jour ;
- une fonction SQL (`security definer`, jamais exécutable par `anon` ni `authenticated`) qui
  trouve les comptes à prévenir, note la date de l’envoi, et demande l’envoi à l’API de Resend par
  `pg_net` ;
- la clé Resend rangée dans le coffre de secrets de Supabase (Vault), jamais dans une migration,
  jamais dans le dépôt. **Pour l’instant, la clé existante** (« resend-token », coffre Proton
  Pass « Milou Studio »), décidé par Nicolas le 11 novembre 2026. **Plus tard, une clé à part**,
  dédiée à ce rappel et limitée à l’envoi : une clé dans la base peut être volée avec la base, et
  « resend-token » sert aussi aux e-mails de connexion et aux autres produits de Milou Studio ; une
  clé à part se révoque seule, sans couper le reste. Le changement de clé ne touche que Vault, pas
  le code : le nom du secret dans Vault ne dit pas quelle clé il porte. Dans les deux cas, c’est
  Nicolas qui lance la commande qui installe la clé dans Vault (`!`) : l’agent ne la voit jamais.

Aucune adresse ne passe par le site ni par Vercel. Hypothèses **non vérifiées**, à confirmer avant
d’écrire le plan : `pg_cron`, `pg_net` et Vault sont disponibles sur l’offre gratuite de
Supabase ; l’offre gratuite de Resend suffit (sa limite est à lire chez Resend, la limite de
30 e-mails par heure du `CLAUDE.md` est celle du SMTP de Supabase Auth, pas celle de l’API).

La date de l’envoi est notée **avant** la demande d’envoi : un échec fait perdre un rappel, il
n’en envoie jamais deux. (Anti-objectif « un rappel qui harcèle ».)

### Le stockage

Une nouvelle table, une ligne par compte (créée au besoin) : rappel coupé ou non, date du dernier
rappel, jeton de désinscription. Comme toute nouvelle table : `revoke all`, puis seulement le
nécessaire (la personne lit et change **son** réglage, rien d’autre), règles RLS, et ajout à
`TABLES` dans `scripts/expected-access.ts`. Le lien de désinscription passe par une fonction SQL
qui ne prend que le jeton et ne rend rien sur le compte. Le nom de la table et des colonnes est au
choix du constructeur.

### La désinscription

Une page publique du site (à ajouter aux adresses publiques de `routeFor`), qui appelle la
fonction SQL avec le jeton. Un jeton inconnu donne la même page de confirmation : la page ne dit
jamais si un compte existe.

## L’ordre de mise en ligne

C’est une migration qui **ajoute** : migrer (avec l’accord de Nicolas), vérifier ce que la base
contient vraiment, fusionner, vérifier le déploiement. La tâche quotidienne d’envoi est activée en
dernier, une fois l’e-mail vu par Nicolas dans sa propre boîte.

## Ce qui reste au constructeur

- La forme du message sur le site, sur planches, avec Nicolas.
- Les mots exacts du message, de l’e-mail et du réglage, validés par Nicolas.
- Les noms de la table, des colonnes, des fonctions et de la page de désinscription.
- L’heure de la tâche quotidienne.

## Vérifié le 11 novembre 2026

- **`pg_cron`, `pg_net` et Vault** : les trois sont proposés par le vrai projet (offre gratuite),
  lu en lecture seule par l’API de gestion (`pg_available_extensions`) : Vault est déjà installé
  (0.3.1), `pg_cron` et `pg_net` sont disponibles, à activer par la migration. `net.http_post`
  prend `url`, `body jsonb`, `headers jsonb`, et ne part qu’une fois la transaction validée.
- **Resend, offre gratuite** : 100 e-mails par jour, 3 000 par mois, **partagés avec les e-mails de
  connexion** (même compte). Une limite d’appels par seconde existe, sans chiffre publié.
  Conséquence (choix de Claude) : **un seul appel par jour**, à l’envoi groupé de Resend
  (`/emails/batch`), et **au plus 20 rappels par jour** ; les suivants partent les jours d’après.
  Les e-mails de connexion gardent ainsi au moins 80 places par jour.
- **6 comptes confirmés** en production ce jour : le premier envoi est loin de la limite.
