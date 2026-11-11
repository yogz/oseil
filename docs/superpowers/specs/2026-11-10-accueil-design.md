# L’accueil d’Oseil avant connexion, et l’exemple — conception

Décidé avec Nicolas le 10 novembre 2026, sur planches (`.superpowers/brainstorm/39915-1794280796/content/`,
accueil-1 à accueil-4), après avis d’un stratège marketing, d’un panel UX/UI/DA et d’un copywriter.
« (proposition) » marque un choix de Claude que Nicolas n’a pas tranché lui-même.

**Ce que la construction a changé (10 novembre 2026).** Là où ce qui suit dit autre chose, ceci l’emporte :
- L’accueil vit à `/accueil`, servi à l’adresse `/` par `proxy.ts` pour une personne sans session ; ouvrir
  `/accueil` renvoie à `/`. Les adresses `/exemple…` sont publiques par préfixe, pas ajoutées à `PUBLIC_PATHS`.
- La grille de l’accueil se réduit par la seule mise en page (CSS), sans mesure après chargement : une mesure
  l’aurait fait sauter. Elle est un lien nommé « Ouvrir l’exemple », pour ne pas répéter « Voir un exemple ».
- Sur ordinateur, l’accueil reprend les colonnes de `PageColumns` sans s’en servir : sur téléphone, son
  premier écran doit rester un seul bloc.
- La marque « un compte a servi ici » est posée dès l’inscription, avant la confirmation de l’e-mail : le
  compte existe déjà.
- L’exemple parle de la personne inventée, à la troisième personne, partout (« Cette personne possède »,
  « Voir ses objectifs »), pas seulement dans le libellé du montant vedette. Le bandeau et la feuille, eux,
  s’adressent au visiteur.
- Trois pages d’exemple seulement : Mon argent, le détail d’une catégorie, l’évolution (pas de
  `/exemple/ligne/…`). Faute de barre d’onglets, Mon argent d’exemple mène à l’évolution par une rangée
  « Son évolution sur un an › ».
- Face ID : la condition d’affichage ne change pas (un appareil qui sait faire des clés d’accès, et l’adresse
  du site) ; seuls sa place et sa forme changent.

## Pourquoi

Aujourd’hui, quelqu’un sans session qui ouvre le site tombe sur « Te connecter » : rien ne dit ce qu’est
Oseil, et un bouton Face ID qui « marche peu » (Nicolas) occupe la première place. Nicolas veut :
1. une page d’accueil qui présente Oseil ;
2. Face ID mis en retrait ;
3. un exemple à visiter sans compte, en lecture seule.

## Objectifs

- Une personne qui découvre Oseil comprend en un écran ce que c’est et peut, au choix, créer son compte,
  voir un exemple, ou se connecter.
- Une personne qui a déjà un compte sur cet appareil se connecte en un toucher depuis l’accueil.
- L’exemple montre les vrais écrans d’Oseil avec une personne inventée, sans compte, sans rien enregistrer
  ni envoyer.

## Non-objectifs

- Pas de nom de domaine propre ici (l’adresse reste stefin.vercel.app : en changer désactive Face ID).
- Pas de témoignages, de nombre d’utilisateurs, de « sécurisé à 100 % », de conseil ou de promesse de
  rendement. Pas de foire aux questions (proposition : plus tard si besoin).
- Pas de changement du nom que Face ID affiche (réglage Supabase de production, à part et avec accord).

## Anti-objectifs

- **Un chiffre inventé pris pour un vrai.** L’accueil ne montre aucun montant. L’exemple en montre, mais
  chaque écran de l’exemple le dit (bandeau) et ses noms et montants sont visiblement inventés.
- **Quelque chose qui part vers le serveur depuis l’exemple.** L’exemple ne parle ni à Supabase, ni à
  `/api/quotes`, `/api/rates`, ni à aucune autre route ; il ne touche ni au coffre ni au stockage des clés.
  Un test le prouve.
- **Un écran qui saute** au chargement de l’accueil (même règle que la grille d’accueil du premier lancement :
  la place des boutons est réservée avant de savoir lequel montrer).
- **Une page longue et bavarde** (« trop Bloomberg », trop de texte) : un premier écran, puis trois lignes.

## L’accueil (planche accueil-3, version « A′ »)

Pour une personne sans session qui ouvre `/` (l’adresse du site). Toute autre adresse privée continue
d’envoyer à `/connexion`. Une personne connectée qui ouvre l’adresse de l’accueil arrive sur Mon argent.

### Téléphone, premier écran (tout tient sans défiler sur un iPhone de 375 × 667 points)

1. En haut à gauche, le logo et « Oseil » (`Brand`, petite taille).
2. La grille de 100 carrés en exemple (même répartition que l’accueil du premier lancement : 20 / 20 / 25 /
   5 / 30), sans aucun montant. Elle arrive une fois, avec l’animation existante, puis ne bouge plus ; le
   mouvement réduit est respecté. Elle se réduit sur les petits écrans pour que tout tienne (même principe que
   `lib/app/grid-fit.ts`). **Toucher la grille ouvre l’exemple.**
3. Le titre : « Ton argent, en 100 carrés ».
4. La phrase : « Fais l’état des lieux de ton patrimoine, vois comment il est réparti, ajuste-le à tes
   objectifs et suis-le mois après mois. »
5. Les choix, selon l’appareil :
   - **Première visite** : pilule blanche « Créer mon compte », pilule à contour « Voir un exemple », lien
     « J’ai déjà un compte ».
   - **Un compte a déjà servi sur cet appareil** : pilule blanche « Me connecter », pilule à contour « Voir
     un exemple », lien « Créer un compte ».

### Sous le premier écran

Trois lignes, séparées par des filets, chacune un petit carré de couleur, une ligne et une légende :
1. « Tes chiffres restent à toi » — « Chiffrés sur ton appareil : même nous ne pouvons pas les lire. Tu les
   emportes en Excel quand tu veux. »
2. « Quelques minutes par mois » — « Tu notes tes comptes une fois. Les actions et les fonds que tu suis se
   mettent à jour tout seuls. » (reformulé le 10 novembre 2026 : les cours ne suivent que les lignes dont
   le symbole est suivi)
3. « Tes objectifs, pas les nôtres » — « Tu choisis ta répartition idéale ; Oseil te montre si tu y es. »

Puis le bas de page : « Oseil » (le 10 novembre 2026, Nicolas a retiré « fait en France, par une seule
personne », de l’accueil, de la page de confidentialité et des e-mails).

À vérifier avant d’écrire : « quelques minutes par mois » et « les actions et les fonds suivent leur cours
tout seuls » doivent être vrais dans le site tel qu’il est (cours suivis par `quoteSymbol` via `/api/quotes`).
Une affirmation fausse se corrige dans le texte, pas dans le site.

### Ordinateur

Les deux colonnes de Mon argent (`PageColumns`) : la grille en grand à gauche ; à droite le titre, la phrase,
les deux pilules côte à côte, puis les trois lignes. « J’ai déjà un compte » (ou « Créer un compte ») en lien
en haut à droite, à la hauteur du logo.

### « Un compte a déjà servi sur cet appareil »

Une marque sur l’appareil (stockage local du navigateur), posée à chaque connexion ou inscription réussie,
qui ne dit rien de la personne (pas d’adresse, pas d’identifiant) et ne part jamais vers le serveur. Elle
est posée à chaque entrée réussie (mot de passe, Face ID, inscription, clé de secours). Elle n’est effacée ni
à la déconnexion ni par « repartir de zéro » (proposition : le compte existe toujours). Safari peut effacer
le stockage local d’un site non ouvert depuis 7 jours : la personne voit alors l’accueil « première visite »,
où « J’ai déjà un compte » reste à portée ; ce n’est qu’un confort, jamais un verrou. Un stockage
refusé (navigation privée) se lit comme « première visite ». Tant qu’elle n’est pas lue, la zone des
boutons garde sa hauteur et reste vide : rien ne saute. Modèle : `lib/auth/face-id-marker.ts`.

## La connexion (`/connexion`)

- Le bouton Face ID n’est plus en tête. Il devient un lien discret « Utiliser Face ID » **sous** le
  formulaire, à côté de « Mot de passe oublié ? ».
- Ce lien apparaît, comme le bouton aujourd’hui, dès que l’appareil sait faire des clés d’accès
  (proposition, après relecture : le limiter aux appareils marqués « Face ID activé ici » retirait les clés
  synchronisées par le trousseau iCloud sur un deuxième appareil, et Safari peut effacer le stockage local
  d’un site non ouvert depuis 7 jours, ce qui l’aurait fait disparaître chez une personne qui vient une fois
  par mois). Seule sa place et sa forme changent.
- Quand Face ID échoue (clé retirée côté serveur), le message d’erreur reste affiché.
- Le parcours de bout en bout `e2e/face-id.live.spec.ts` attend aujourd’hui un bouton : il est mis à jour
  pour le lien, dans la même branche.
- Le reste de l’écran ne change pas. Le parcours Face ID de bout en bout (`e2e/face-id.live.spec.ts`) doit
  passer après la mise en ligne.

## L’exemple

### Entrée et sortie

- Depuis l’accueil : « Voir un exemple » ou un toucher sur la grille. Adresses publiques dédiées
  (proposition : `/exemple`, `/exemple/categorie/<id>`, `/exemple/ligne/<id>`, `/exemple/evolution`),
  ajoutées à `PUBLIC_PATHS` (`lib/auth/routing.ts`), qui compare aujourd’hui des chemins exacts : le
  constructeur choisit comment couvrir des adresses à paramètre sans ouvrir autre chose.
- Un bandeau fixe en haut de chaque écran de l’exemple : « Exemple, chiffres inventés », un lien « Créer mon
  compte » et un lien « Quitter » (retour à l’accueil). Une seule ligne, sans retour à la ligne, sur un
  téléphone de 375 points.
- Une personne connectée peut aussi ouvrir l’exemple ; ses propres chiffres n’y apparaissent jamais et ne
  sont pas touchés.

### Ce qu’on y voit : des pages d’exemple à part (décidé par Nicolas le 10 novembre 2026)

Nicolas a choisi des pages qui n’existent que pour l’exemple, plutôt que d’adapter les vrais écrans : elles
ne lisent ni n’écrivent rien, et les vrais écrans ne sont pas touchés. Elles sont assemblées avec les mêmes
briques d’affichage que le site (la grille `HundredSquares`, les rangées de catégorie, les lignes, la courbe
d’évolution), nourries de chiffres inventés écrits une fois pour toutes. Assumé : quand Mon argent évoluera,
l’exemple ne suivra pas tout seul ; il se remettra à jour à la main.

Trois pages (proposition) :
- **Mon argent** (`/exemple`) : le montant vedette, la grille, les catégories ; toucher un carré ou une
  catégorie ouvre son détail ; survol d’un carré sur ordinateur comme dans le site.
- **Le détail d’une catégorie** (`/exemple/categorie/<id>`) : ses chapitres et ses lignes, en lecture ;
  toucher une ligne ne mène nulle part de plus (proposition).
- **L’évolution** (`/exemple/evolution`) : la courbe sur un an.
Sur ordinateur, les deux colonnes comme dans le site. Pas de barre d’onglets du site : la navigation de
l’exemple se fait par ses pages et le bandeau.

- Le libellé du montant vedette de Mon argent devient « Ce qui est à la personne de l’exemple » (« ce qui est
  vraiment à toi » y serait faux).
- Une personne inventée, écrite dans le code de l’exemple :
  - total 100 000 € tout rond (un carré = 1 000 €), répartition 20 / 20 / 25 / 5 / 30 (proposition) ;
  - des noms évidemment inventés : « Banque Exemple », « Livret d’exemple », « Appartement d’exemple »,
    « Fonds monde (exemple) » ;
  - aucun vrai symbole boursier (aucune demande de cours) ;
  - au moins trois relevés étalés sur un an, pour que l’évolution ait une courbe ;
  - des objectifs, pour que les écarts aux objectifs se voient.
- Les montants ne sont pas masqués dans l’exemple (le réglage « montants masqués » d’un vrai compte ne s’y
  applique pas).

### Les liens à l’intérieur de l’exemple

- Tout lien de l’exemple reste dans l’exemple (adresses `/exemple/...`) ; aucun ne mène à un écran privé.
- La bascule euros / pour cent (toucher le montant) marche dans l’exemple, sans rien enregistrer
  (proposition).

### Ce qu’on ne peut pas y faire

Mon argent d’exemple montre « Mettre à jour » et la roue dentée, comme le vrai : les toucher ouvre une
feuille :
- titre « L’exemple ne garde rien » ;
- texte « Crée ton compte pour noter tes propres chiffres. Ils seront chiffrés sur ton appareil. » ;
- pilule blanche « Créer mon compte », lien « Continuer l’exemple ».

### Rien ne part

L’exemple n’appelle aucune route du site ni Supabase, n’ouvre pas le coffre, n’écrit ni dans le stockage des
clés ni dans la mémoire d’onglet (`lib/app/session-memory.ts`). Un test e2e contre le build de production
ouvre l’exemple, touche des carrés, ouvre une catégorie et l’évolution, et vérifie qu’aucune requête n’est
partie vers Supabase ni vers `/api/`.

## Ce que la relecture a établi (10 novembre 2026)

- Les vrais écrans chargent le modèle en ouvrant le coffre, écrivent, et ont leurs adresses en dur à une
  quinzaine d’endroits : les faire tourner sur la personne inventée aurait demandé de les adapter. D’où le
  choix de Nicolas : des pages d’exemple à part, qui ne réutilisent que les briques d’affichage. Le
  constructeur vérifie, brique par brique, qu’elle s’affiche sans coffre ni session (une brique qui lit
  `useModel`, la session ou un lien privé ne s’utilise pas telle quelle).
- L’exemple vit dans son propre groupe de routes, avec son cadre : l’enveloppe actuelle des écrans renvoie
  vers `/connexion` sans session.
- `/` sans session se sert dans le contrôle d’entrée (`proxy.ts`), qui connaît déjà la session, et non en
  ajoutant `/` aux adresses publiques. Les adresses `/exemple/...` demandent une correspondance par préfixe
  dans `lib/auth/routing.ts`.
- Un exemple sans symbole boursier ne déclenche aucune demande de cours ni de taux.

## Ce qui reste au constructeur

La forme des pages d’exemple et de leurs données inventées (dans les limites ci-dessus), la réécriture de `/`
pour une personne sans session, le découpage du code, les tests. Dans le vocabulaire graphique de CLAUDE.md (jetons, cinq tailles,
pilules, aucune ombre, un seul pictogramme), la typographie française, « Rien ne part en clair ».

## Comment on saura que c’est juste

- L’accueil tient sur un écran de 375 × 667 sans défiler, sur les deux versions (première visite, retour) ;
  rien ne saute quand la marque est lue.
- Une personne sans session sur `/` voit l’accueil ; sur une autre adresse privée, `/connexion` ; une
  personne connectée sur l’adresse de l’accueil voit Mon argent.
- Le lien Face ID est sous le formulaire, discret, et n’apparaît que sur un appareil qui sait faire des clés
  d’accès ; le parcours Face ID de bout en bout passe avec lui.
- L’exemple : aucune requête vers Supabase ni `/api/` (e2e prod), chaque écran porte le bandeau, chaque
  action d’écriture ouvre la feuille.
- Vérifications habituelles, puis `E2E_LIVE=1 mise exec -- npx playwright test e2e/face-id.live.spec.ts`
  après la mise en ligne (la connexion change).
