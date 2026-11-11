# Face ID — ouvrir le coffre d'un geste

**Note du 10 novembre 2026.** Sur la page de connexion, Face ID n’est plus un bouton en tête : c’est un
lien discret « Utiliser Face ID » sous le formulaire, entre « Mot de passe oublié ? » et « Créer un
compte ». Il apparaît aux mêmes conditions qu’avant. Voir `2026-11-10-accueil-design.md`.

Le 7 novembre 2026. Nicolas a demandé, le 6 novembre, de pouvoir ouvrir le site par Face ID ou
empreinte plutôt que par mot de passe. Un essai jetable a eu lieu le même jour (branche
`spike/essai-faceid`, jamais fusionnée). Ce document part de ses résultats et des deux réponses
de Nicolas du 7 novembre.

## Pourquoi

Sur iPhone, Safari efface les données d'un site après environ sept jours sans visite, dont la clé
du coffre gardée sur l'appareil. Avec une mise à jour par mois, Nicolas retaperait son mot de passe
presque à chaque visite. Une clé d'accès (passkey) vit dans le trousseau du téléphone, pas dans le
site : elle survit à cet effacement.

## Ce que voit la personne

- **Après une connexion par mot de passe**, sur la page de connexion, avant d'aller plus loin :
  « Ouvrir avec Face ID la prochaine fois ? », avec « Activer » et « Pas maintenant ». L'offre
  n'apparaît qu'à trois conditions :
  - la connexion a simplement ouvert le coffre, sans créer de coffre ni montrer de nouvelle clé de
    secours ;
  - la clé de secours est confirmée ;
  - l'appareil ne garde pas la marque « Face ID activé ici ».
  Après « Pas maintenant », l'offre revient à la connexion par mot de passe suivante.
- **Sur la page de connexion** : « Se connecter avec Face ID », au-dessus du formulaire. Un seul
  geste ouvre la session et le coffre, puis mène à Mon argent.
- **Retirer Face ID, ou l'activer hors de cette offre** : au lot 6, dans Réglages, avec la liste
  des clés d'accès (« ajoutée le …, utilisée le … ») et « Retirer » sur chacune. Choix recommandé
  à Nicolas le 7 novembre : savoir quelle clé d'accès vit sur quel appareil n'est pas possible
  sans écrire un nom d'appareil en clair. Une liste datée est plus simple et plus juste.
- **Le mot de passe et la clé de secours ne changent pas.** Ils servent sur un nouvel appareil,
  quand Face ID refuse, ou quand la clé d'accès a été effacée.
- Les mots sont « Face ID » sur iPhone et sur iPad. Sur un autre appareil, ce sont « Touch ID » ou
  « ton empreinte ». Le choix du mot est laissé à la construction ; à défaut, « Face ID ».

## Quand Face ID n'est pas proposé

- L'appareil ou le navigateur ne sait pas créer de clé d'accès : on ne propose rien.
- La clé d'accès a été créée, mais son gestionnaire ne fournit pas de **clé secrète** (l'extension
  WebAuthn « PRF »). C'est le cas de Proton Pass sur iPhone, vu deux fois à l'essai. Rien n'est
  enregistré côté serveur, et l'écran le dit : « Ton gestionnaire de mots de passe ne sait pas
  ouvrir le coffre. Sur iPhone, choisis l'app Mots de passe d'Apple quand il te le demande. » Le
  site ne peut pas effacer la clé créée dans le gestionnaire ; la phrase invite à la supprimer à la
  main.
- **Décision de Nicolas (7 novembre)** : sur son iPhone, la clé d'accès de stefin est rangée dans
  l'app Mots de passe d'Apple. Proton Pass garde tout le reste.

## Comment ça marche

Le coffre a aujourd'hui deux serrures sur la même clé de données : le mot de passe
(`wrapped_by_password`) et la clé de secours (`wrapped_by_recovery`). Face ID en ajoute une
troisième, **par clé d'accès**. Aucun document chiffré n'est touché ni rechiffré.

1. **La connexion.** On utilise les clés d'accès de Supabase Auth, en deux temps :
   `auth.passkey.startAuthentication`, puis notre propre `navigator.credentials.get` qui demande
   la clé secrète (`extensions.prf.eval.first`), puis `auth.passkey.verifyAuthentication`. Un seul
   geste donne la session Supabase **et** la clé secrète. L'enregistrement se fait de la même
   façon : `startRegistration`, `navigator.credentials.create`, `verifyRegistration`.
2. **La clé secrète ne quitte jamais l'appareil.** Le format standard de la réponse WebAuthn
   (`toJSON()`) la contient, dans `clientExtensionResults.prf`. Elle est retirée avant chaque envoi
   à Supabase, à l'enregistrement comme à la connexion. Un test vérifie qu'aucune requête ne la
   contient. C'est le piège trouvé à l'essai.
3. **La troisième serrure.** La clé secrète, passée par HKDF avec un sel fixe propre à stefin,
   donne une clé d'emballage. Celle-ci enferme la clé de données, comme le fait déjà
   `wrapDataKey`. Le paquet `{ iv, ciphertext }` est lié à la personne et à la clé d'accès (données
   associées : identifiant du compte et identifiant de la clé d'accès), pour qu'un paquet ne puisse
   pas être déplacé.
4. **Ce qui est conservé**, dans une nouvelle table `vault_passkeys`. Une ligne par clé d'accès,
   avec :
   - l'identifiant du compte ;
   - l'identifiant WebAuthn de la clé d'accès (`rawId` en base64url), seul connu de l'appareil à la
     connexion ;
   - l'identifiant que Supabase donne à la clé d'accès (UUID), seul accepté par
     `auth.passkey.delete` ;
   - le paquet ;
   - la date de création.

   Les deux identifiants sont uniques par compte. Les données associées du paquet lient
   l'identifiant du compte et l'identifiant WebAuthn. Aucun nom d'appareil ni libellé en clair.

   La table suit les règles du projet : droits par défaut retirés, puis seulement SELECT, INSERT
   et DELETE pour `authenticated`, avec la RLS sur `user_id`. `scripts/expected-access.ts` attend
   aujourd'hui les mêmes quatre droits et quatre règles sur chaque table : il apprend les droits
   propres à chaque table, et la nouvelle entre dans ses vérifications.
5. **Activer**, depuis l'offre qui suit une connexion par mot de passe.
   - **La clé dérivée du mot de passe.** `signIn()` la rend à la page de connexion, qui la garde en
     mémoire jusqu'à la réponse. Elle n'est jamais écrite nulle part, et quitter la page l'oublie.
   - **L'enregistrement chez Supabase** est demandé (`startRegistration`) dès que l'offre
     s'affiche. Ainsi `navigator.credentials.create` part directement du toucher sur « Activer » :
     Safari peut refuser une demande WebAuthn qui ne suit pas immédiatement un geste.
   - **Si la clé d'accès n'annonce pas la clé secrète** (`prf.enabled`), on s'arrête là. Rien
     n'est envoyé à Supabase, et l'écran dit ce que dit « Quand Face ID n'est pas proposé ».
   - **La clé secrète.** Si la création la rend, on la prend. Sinon, un second bouton « Confirmer
     avec Face ID » fait une ouverture locale (`get`, défi aléatoire tiré sur l'appareil, limitée à
     cette clé d'accès), qui n'a pas besoin du serveur.
   - **Puis, dans l'ordre :**
     1. le paquet du mot de passe est rouvert en mode extractible ;
     2. la clé de données est enfermée pour la clé d'accès ;
     3. `verifyRegistration` est envoyé, sans la clé secrète ;
     4. la ligne de `vault_passkeys` est écrite ;
     5. l'appareil garde la marque « Face ID activé ici ».
   - **Si l'écriture de la ligne échoue**, la clé d'accès est retirée chez Supabase.
   - **Si la clé d'accès existe déjà dans ce trousseau** (refus `InvalidStateError`), l'écran dit
     que Face ID est déjà prêt, et la marque est posée.
6. **Se connecter avec Face ID.**
   - La demande à Supabase (`startAuthentication`) part dès l'ouverture de la page de connexion,
     et elle est renouvelée si elle a expiré. Ainsi `navigator.credentials.get` part directement
     du toucher.
   - La session s'ouvre (`verifyAuthentication`, sans la clé secrète).
   - On lit la ligne de `vault_passkeys` qui porte l'identifiant WebAuthn utilisé, puis on ouvre
     le paquet.
   - La clé de données est gardée sur l'appareil comme après un mot de passe (`KeyStore`), et
     l'appareil garde la marque.
   - **Si la ligne manque ou ne s'ouvre pas**, la session est refermée et l'écran dit : « Face ID
     n'ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe. »
7. **La clé de secours.** Face ID n'est proposé qu'une fois la clé de secours confirmée. Une
   connexion par Face ID n'a donc jamais à renouveler une clé de secours jamais confirmée. Ce
   renouvellement reste le travail de la connexion par mot de passe.
8. **« Repartir de zéro »** change la clé de données, donc plus aucune clé d'accès ne l'ouvre. Il
   efface toutes les lignes de `vault_passkeys`, puis retire chez Supabase toutes les clés d'accès
   du compte (`list`, puis `delete`), et enfin la marque de l'appareil. La réinitialisation par
   clé de secours ne touche pas la clé de données : les clés d'accès restent valables.
9. **Se déconnecter** ne retire pas Face ID : il sert justement à revenir.

## Ce qui part vers le serveur

Rien qui décrive la situation de quelqu'un. Voici les nouveaux champs, à valider comme le demande
`CLAUDE.md` :
- l'identifiant de la clé d'accès et sa clé publique, envoyés à Supabase Auth par la cérémonie
  standard ;
- dans `vault_passkeys`, ses deux identifiants (WebAuthn et Supabase) et le paquet
  `{ iv, ciphertext }` de la troisième serrure.

Sur l'appareil seulement, la marque « Face ID activé ici » : un drapeau, sans rien d'autre.

Jamais la clé secrète, ni la clé de données en clair.

## Réglages de production

- Dans Supabase Auth : `passkey_enabled` à vrai, `webauthn_rp_id` = `stefin.vercel.app`,
  `webauthn_rp_origins` = `https://stefin.vercel.app`, `webauthn_rp_display_name` = le nom affiché
  aujourd'hui, « PatriCube ». Ce changement touche la production. Il se fait avec l'accord de
  Nicolas, avant la fusion, par l'API de gestion ou dans le tableau de bord si le garde-fou refuse.
  **Jamais `supabase config push`.** Les clés d'accès sont en bêta chez Supabase, ouvertes à tous
  les projets (Authentication → Passkeys). Si leur activation demandait une offre payante, on
  s'arrête et on demande à Nicolas.
- Une clé d'accès est liée à l'adresse du site. **Décision de Nicolas (7 novembre)** : Face ID se
  fait maintenant, sur stefin.vercel.app. Si le site change de nom, chacun réactive Face ID une
  fois, après une connexion par mot de passe.
- Une adresse d'essai Vercel n'est pas sous stefin.vercel.app. **L'essai sur téléphone se fait
  donc sur le vrai site, après la fusion.** C'est sans risque : Face ID est un ajout, et le mot de
  passe marche toujours.

## Tests

- **Tests unitaires** sans navigateur ni serveur (WebAuthn et Supabase simulés) : l'emballage et
  le déballage, les données associées, le retrait de la clé secrète avant envoi, le refus d'une
  clé d'accès sans clé secrète, les messages.
- **Copie locale de la base** (`npm run test:rls`) : la nouvelle table, ses droits et sa RLS.
- **Parcours complet dans Chromium** avec un authentificateur virtuel qui fournit la clé secrète
  (protocole DevTools, `hasPrf`), contre un service d'auth qui accepte les clés d'accès pour
  `localhost`. La vraie base ne peut pas servir : son `rp_id` est stefin.vercel.app. La CLI
  Supabase 2.75 ne sait pas activer les clés d'accès en local ; l'essai avait lancé le service
  d'auth à la main dans Docker. Le choix entre une CLI plus récente, un service d'auth lancé à
  part, ou des tests unitaires seuls si aucun des deux ne tient est laissé à la construction. Il
  doit être dit dans le plan.
- **L'essai final** : Nicolas, sur son iPhone et sur le vrai site.

## Ce qui n'est pas dans ce lot

- Se passer complètement du mot de passe.
- Retirer une clé d'accès, ou activer Face ID hors de l'offre qui suit une connexion : au lot 6,
  dans Réglages (voir « Ce que voit la personne »).

## Laissé à la construction

- La disposition exacte des boutons.
- Le mot affiché selon l'appareil (Face ID, Touch ID, empreinte).
- Le sel HKDF.
- La forme du code.
- La façon de tester de bout en bout (voir « Tests »).
