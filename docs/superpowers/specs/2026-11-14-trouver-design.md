# Trouver (la recherche)

Décidé avec Nicolas le 14 novembre 2026, après une revue UX/UI/DA et sur planches (rangée 9 de « Planches
Réglages », https://claude.ai/artifact/6EU7f8vw6aZYasm8ShE17x : **9E** pour l’entrée, **9F** pour les résultats).
Ce document fait foi.

## Pourquoi

Nicolas voulait retrouver « une action » (OVHcloud, détenue dans un PEA et en épargne salariale sous deux noms),
puis « tout ». Aujourd’hui, il faut savoir dans quelle catégorie et quel compte elle vit. Le but : **taper quelques
lettres et avoir la réponse, puis la suite possible.**

## Ce qui est décidé (par Nicolas)

- **Une loupe, sur chaque écran de l’application** (planche 9E), à côté de la roue des Réglages là où elle est, et à
  la même place en haut des autres écrans (Repères, Évolution, une catégorie, une fiche…). **C’est le deuxième
  pictogramme du site**, décidé par Nicolas le 14 novembre 2026 sur planche, au même titre que la roue : dessiné ici,
  couleur du texte adouci, nommé « Trouver » pour VoiceOver. Sur ordinateur, **⌘K** (Ctrl+K ailleurs) l’ouvre de
  partout ; Échap la ferme.
- **Un écran de résultats qui répond, puis propose** (planche 9F) :
  1. une case « Trouver » active tout de suite (clavier levé), avec « Fermer » ;
  2. **une réponse en tête** quand ce qu’on cherche est un seul titre (les lignes d’un même titre, rapprochées comme
     dans Repères : même symbole boursier, ou même nom) ou un seul compte ou une seule banque : son nom, son montant en
     grand, puis « sur N comptes · X % de ce qui est à toi · +Y % depuis l’achat » (le gain seulement s’il est connu) ;
  3. **« Tes lignes »** : carré de catégorie, nom (lettres trouvées en gras, le reste adouci), où elle vit, **son
     montant**, « › » vers sa fiche ;
  4. **« Tes comptes »** et **« Tes relevés »** (un relevé se trouve par son mois ou son année, « novembre 2025 »,
     « 2025 », et mène à sa page) ;
  5. **« Ce que tu peux faire »** : des raccourcis vers les écrans qui existent (voir plus bas) ;
  6. la phrase « Tout se cherche sur ton téléphone, rien ne part. »
- **Les montants suivent « Masquer les montants »** (« ••• »), la réponse en tête aussi.

## Choix de Claude, à vérifier

- **Le mot : « Trouver »**, jamais « Chercher » : « Chercher » est déjà le bouton de la recherche en Bourse
  (« Le retrouver »), qui, elle, envoie le texte au serveur puis à Yahoo. La nouvelle recherche n’envoie rien et ne
  lance jamais seule la recherche en Bourse.
- **Ce qu’on trouve** : les lignes ouvertes et fermées (une fermée dit « fermée »), les comptes, les banques, les relevés
  listés dans Évolution, et une petite liste fixe d’écrans et de réglages (objectifs, revenus, apparence, masquer les
  montants, Face ID, mot de passe, clé de secours, rappel par e-mail, télécharger mes chiffres, confidentialité,
  supprimer mon compte, tes titres, mettre à jour).
- **Les actions de « Ce que tu peux faire »** (première version, toutes des liens vers des écrans existants) :
  - une ligne trouvée qui pourrait suivre son cours sans le faire : « Relier « {nom} » à son cours › » (vers
    `/titres`) ;
  - un compte ou une banque trouvés : « Mettre à jour tes chiffres › » (vers `/mise-a-jour`) ;
  - un relevé trouvé : « Corriger le relevé du {date} › » (vers sa page) ;
  - un réglage trouvé : son écran ou sa section (« Changer de mot de passe › », « Supprimer mon compte › »…).
- **Correspondance** : sans majuscules ni accents, « contient » ; ce qui **commence** par le texte passe avant ce qui le
  contient ; au plus 5 résultats par groupe, puis « Voir les N autres » sur place. Pas de tolérance aux fautes de frappe
  dans cette version (« ovhh » ne trouve rien).
- **Aucun résultat** : « Rien ne porte ce nom chez toi. »
- **Case vide** : « Une action, un compte, un mois, un réglage. » et rien d’autre : **pas de recherches récentes**.
- **Sur ordinateur**, l’écran s’ouvre en plein écran comme sur le téléphone (pas de fenêtre flottante) ; la loupe est
  aussi dans le menu du haut, à gauche de « Réglages ».
- **L’exemple** de l’accueil n’a pas la loupe (première version).

## Précisions après relecture (choix de Claude ; cette section l’emporte)

- **Pictogrammes** : la loupe est en fait le **troisième** pictogramme (la roue, et le cadenas de l’accueil,
  `components/ui/LockIcon.tsx`, choisi le 11 novembre 2026) ; CLAUDE.md, qui dit encore « un seul », est corrigé pour
  lister les trois. Le garde-fou du design ne compte pas les pictogrammes (il refuse les émojis) : rien à y changer.
- **Où va la loupe** : il n’y a pas d’en-tête commun ; chaque écran de l’application avec sa barre d’onglets reçoit la
  loupe en haut à droite (à gauche de la roue sur Mon argent), par un petit composant partagé. Les parcours plein écran
  (mise à jour, premier lancement) **n’ont ni loupe ni ⌘K** : on ne quitte pas une saisie en cours pour chercher.
- **Une page `/trouver`** (pas une fenêtre par-dessus) : le geste retour du téléphone et Échap reviennent à l’écran
  d’avant. Toujours pas de `?q=` dans l’adresse.
- **Les montants** sont ceux que montre Mon argent : le dernier relevé, avec les cours du jour déjà chargés par le site
  (`useMarket`). Les cours se demandent **à l’ouverture de la page**, avec les mêmes symboles qu’aujourd’hui, jamais
  pendant la frappe : la promesse et le test portent sur « aucune requête pendant qu’on tape ».
- **« X % de ce qui est à toi »** se calcule sur le même total que le grand montant de Mon argent (il suit donc « Ta
  grille : sans chez toi »).
- **Un même titre** : comme Repères (`lib/screens/reperes.ts`), seulement les lignes en parts, crédits exclus,
  rapprochées par symbole puis par nom. Une seule ligne trouvée a aussi sa réponse en tête.
- **Où mène « › »** :
  - une ligne : sa fiche ;
  - un compte : la page de la catégorie qui porte la plus grande part de sa valeur ;
  - une banque : Repères, « Où est ton argent » (une ancre `id` sur cette section) ;
  - un relevé : sa page ;
  - un réglage : `/reglages` à la bonne section, grâce à une ancre `id` sur chaque section des Réglages. Les mots disent
    honnêtement où l’on arrive (« Ton mot de passe, dans les Réglages › »), jamais une action que la page n’ouvre pas
    d’elle-même. Seuls `/reglages/supprimer` et la confidentialité ont leur propre adresse.

## Rien ne part en clair

La recherche se fait dans le navigateur, sur le modèle déjà ouvert (`useModel`). Le texte tapé n’est envoyé nulle
part, n’est écrit nulle part (ni stockage local, ni adresse : pas de `?q=` dans l’URL), et n’apparaît dans aucun
journal. Un test le vérifie (aucune requête pendant une recherche).

## Ce qui prouve que ça marche

- Une fonction pure `lib/screens/find.ts` (le modèle, le texte, la date → la réponse, les groupes, les actions),
  testée sans navigateur : majuscules et accents, ordre « commence par » puis « contient », regroupement d’un même
  titre (symbole ou nom), réponse en tête seulement pour un seul titre / compte / banque, montants masqués, relevés par
  mois et année, réglages, aucun résultat.
- Les tests de la loupe (présente sur chaque écran de l’application, nommée « Trouver »), du raccourci ⌘K / Ctrl+K et
  d’Échap, et de l’écran.
- Un parcours e2e : taper le nom d’une ligne, voir la réponse et la ligne, ouvrir sa fiche ; vérifier qu’aucune requête
  ne part pendant la frappe.
- Le garde-fou du design (`scripts/check-design.sh`) et CLAUDE.md (« Un seul pictogramme ») sont mis à jour : deux
  pictogrammes, la roue et la loupe.
