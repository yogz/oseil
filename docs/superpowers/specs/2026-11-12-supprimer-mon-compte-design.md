# Supprimer mon compte

Décidé avec Nicolas le 12 novembre 2026. Ce document fait foi pour la suppression d’un compte.

## Pourquoi

Les inscriptions sont ouvertes depuis le 10 novembre 2026. La page de confidentialité promet qu’on peut
effacer ses données, mais aujourd’hui il faut écrire par e-mail : rien dans le site ne le permet (vérifié
le 12 novembre 2026 : aucun « Supprimer mon compte » dans `app/`, `components/`, `lib/` ni les
migrations). Partir doit être aussi simple qu’arriver, et ne doit dépendre de personne.

## Ce qui est décidé (par Nicolas)

- **Tout disparaît, tout de suite.** Pas de délai de grâce, pas de copie gardée « au cas où ».
- **On prévient bien** avant : ce qui disparaît, et que c’est définitif.
- **On propose de télécharger ses chiffres avant** (le fichier Excel qui existe déjà), en premier sur
  l’écran, sans le rendre obligatoire.
- **On confirme en retapant son mot de passe, ou par Face ID** (ajouté par Nicolas après relecture :
  quelqu’un qui n’utilise que Face ID et a oublié son mot de passe doit pouvoir partir sans passer par
  sa clé de secours). Le bouton Face ID n’apparaît que là où Face ID existe déjà (oseil.fr, une clé
  enregistrée).

## Le parcours

1. Dans les Réglages, section « Mon compte », sous « Se déconnecter » : un lien « Supprimer mon compte »
   qui mène à un écran à part (`/reglages/supprimer`, choix de Claude). Rien ne se supprime depuis les
   Réglages eux-mêmes : un toucher malheureux ne peut rien effacer.
2. L’écran dit, dans l’ordre :
   - ce qui disparaît : tous tes chiffres, ton historique, tes objectifs, tes clés Face ID, ton rappel
     par e-mail, ton adresse e-mail ; que c’est définitif et que personne, pas même nous, ne pourra rien
     récupérer ;
   - le bouton « Télécharger mes chiffres » (le même que dans les Réglages), avec une phrase du genre
     « C’est la seule trace qui te restera » ;
   - la case du mot de passe et le bouton qui supprime (« Supprimer mon compte et mes chiffres »,
     mots à affiner).
3. La personne tape son mot de passe et appuie. Le mot de passe est vérifié ; s’il est faux, on le dit
   comme ailleurs dans le site, et rien n’est supprimé.
4. Le compte est supprimé. La personne est déconnectée, la clé du coffre est oubliée par le navigateur,
   la marque « un compte a servi ici » (`lib/auth/account-here.ts`) est retirée, et l’accueil s’affiche
   avec une phrase « Ton compte a été supprimé ».
5. Une phrase rappelle, sur l’écran de suppression ou sur l’accueil après (choix laissé au constructeur),
   que la clé Face ID reste rangée dans l’app Mots de passe de l’appareil, et qu’on peut l’y retirer soi-même.
   Le site ne peut pas l’effacer de l’appareil.

## Comment ça marche

- **Ce qui efface.** Toutes les tables qui portent quelque chose d’une personne (`vaults`, `documents`,
  `vault_passkeys`, `update_reminders`) sont rattachées à `auth.users` avec `on delete cascade` (vérifié
  dans les migrations le 12 novembre 2026). Supprimer la ligne de `auth.users` efface donc tout.
  À vérifier par le constructeur : que les clés d’accès gardées par Supabase Auth (schéma `auth`) partent
  aussi avec l’utilisateur.
- **Qui efface.** `SUPABASE_SECRET_KEY` est interdite dans `app/`, `lib/`, `components/`. La suppression
  passe donc par une fonction de la base, dans une nouvelle migration : `public.delete_my_account()`,
  `security definer`, qui ne supprime que `auth.uid()`, exécutable par `authenticated` seulement (retirée
  à `public` et `anon`). Elle s’ajoute à `FUNCTIONS` dans `scripts/expected-access.ts`.
- **Le mot de passe.** Le serveur ne connaît jamais le mot de passe. La vérification se fait comme pour
  « Changer de mot de passe » (`lib/vault/store.ts`) : le mot de passe tapé doit ouvrir le paquet du coffre
  (`wrapped_by_password`). Choix de Claude : en plus, se reconnecter avec le secret dérivé juste avant
  d’appeler la fonction, pour que Supabase confirme lui aussi. Cette protection vise quelqu’un qui tient un
  téléphone déverrouillé, pas un attaquant qui aurait déjà la session.
- **Par Face ID.** Une nouvelle cérémonie Face ID, à ce moment-là, qui doit ouvrir le paquet du coffre de
  `vault_passkeys`, comme à la connexion. Une clé déjà en mémoire ne suffit pas : il faut un geste de la
  personne, au moment de supprimer.
- **Rien de nouveau ne part en clair.** L’appel n’envoie aucun paramètre ; la connexion envoie ce qu’elle
  envoie déjà (e-mail, secret dérivé).

## Cas limites (choix de Claude, après relecture)

- **Ce que « tout » veut dire.** Tout ce qu’Oseil garde de la personne part : ses lignes, son compte, son
  adresse dans `auth.users`. Le journal d’audit de Supabase Auth (`auth.audit_log_entries`) garde l’adresse
  sans lien en cascade : la fonction le purge aussi pour cet utilisateur si la base le permet (à vérifier sur
  la copie locale puis en production). Les journaux des prestataires (Supabase, Resend) suivent leur propre
  rythme, comme le dit déjà la page de confidentialité. L’écran ne promet donc jamais plus que vrai :
  « Tout ce qu’Oseil garde de toi est effacé », pas « il ne reste rien nulle part ».
- **Si la base refuse de supprimer dans `auth.users`.** Hypothèse non vérifiée : le schéma courant sur
  Supabase (une fonction `security definer` qui supprime sa propre ligne) fonctionne sur un projet hébergé.
  Elle se vérifie d’abord sur la copie locale ; si la production refuse, on s’arrête et on revient vers
  Nicolas : aucun repli par une clé secrète sans sa décision.
- **Coffre illisible.** Le lien vit dans la section « Mon compte », visible seulement quand le coffre est
  ouvert. Un coffre qui ne s’ouvre pas garde la voie de l’e-mail, citée dans la page de confidentialité.
- **Les autres appareils.** Supprimer l’utilisateur ferme ses sessions côté serveur. Un autre appareil
  encore ouvert échoue à son prochain appel et doit revenir proprement à l’accueil, qui dit « Ton compte a été supprimé. » (`/?compte=supprime`), sans écran cassé ;
  le parcours e2e ne couvre que l’appareil qui supprime.

## À changer ailleurs

- **La page de confidentialité**, partie « Tes droits » : pour effacer, le bouton dans les Réglages, et
  l’e-mail reste pour le reste. La phrase sur les sauvegardes des prestataires (« disparaissent ensuite, à
  leur propre rythme ») reste vraie et reste.
- **L’exemple** n’a pas de compte : rien à y ajouter.

## Ce qui prouve que ça marche

- `test:rls` (copie locale) : un utilisateur supprime son compte et ses lignes disparaissent de chaque
  table ; il ne peut pas supprimer celui d’un autre ; `anon` ne peut pas appeler la fonction.
- Tests des vues et des mots (vitest) : le texte de l’écran, le refus d’un mot de passe faux.
- Un parcours e2e : créer un utilisateur de test, aller jusqu’à l’écran, mauvais mot de passe refusé,
  bon mot de passe, retour à l’accueil avec la phrase, et la reconnexion échoue.
- `check:rls:prod` après la migration en production.

## Non-objectifs

- Pas de délai de grâce ni d’annulation.
- Pas d’e-mail « ton compte a été supprimé » (l’adresse n’existe plus, et la limite gratuite de Resend est
  partagée).
- Pas de suppression depuis un autre appareil ou par e-mail : seulement connecté, dans les Réglages.
- Pas de question « pourquoi pars-tu ? ».

## Ordre de mise en ligne

Une migration qui ajoute : migrer en production (après accord de Nicolas), vérifier la fonction avec
`check:rls:prod`, fusionner (accord de Nicolas), vérifier le déploiement chez Vercel.
