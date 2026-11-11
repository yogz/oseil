# Refonte de l'interface — design

*6 novembre 2026. Rédigé à l'issue d'une session de conception avec Nicolas, à partir de sa
maquette « PatriCube » (`~/Code/GitHub/stefinagy`). Les planches citées sont dans
`2026-11-06-refonte-interface/planches/` ; les avis d'experts dans
`2026-11-06-refonte-interface/experts/`.*

## Ce que couvre ce document, et ce qu'il ne couvre pas

Nicolas repart de zéro. Cette première étape a porté **uniquement sur l'interface** : l'apparence,
l'organisation des écrans, les parcours et les mots. Le **fonctionnement** — calculs, données,
stockage, comptes utilisateurs, automatisation — sera conçu ensuite, dans un document à part. Les
questions de fonctionnement rencontrées en chemin sont listées à la fin, sans réponse.

Rien n'a été construit. Le site actuel continue de tourner.

**La suite, décidée le 6 novembre** : concevoir le fonctionnement avant de construire quoi que ce
soit. Presque chaque écran dépend d'une question encore ouverte ; construire maintenant
obligerait à deviner des réponses qui changent les écrans.

> **Complété le même jour par `2026-11-06-refonte-fonctionnement-design.md`**, qui l'emporte en
> cas de désaccord. Ce qu'il change à l'écran :
> - **les décisions de Nicolas du 7 novembre** : un crédit, l'or et la crypto se saisissent dans
>   leur banque ; « Chez toi » passe en premier et ne garde que ce qu'on détient soi-même ;
>   « Plus tard » figure sur chaque écran du premier lancement dès que quelque chose est
>   enregistré ; Mon argent, en reprise, liste chaque étape (« fait », « en cours », « à faire »)
>   sans grille ni total ;
> - **la maison sort des objectifs** (planche 22) : les objectifs portent sur l'argent hors
>   logement, en pourcentages ; la phrase devient « Hors ta maison, proche de tes objectifs » ;
>   l'immobilier est listé sans barre ; les exemples d'objectifs ne gardent plus « la maison à sa
>   part » ;
> - **« D'où ça vient » et le résultat de la mise à jour partagent la progression** entre ton
>   effort, les marchés et les intérêts, et la maison réestimée (planche 21), au lieu de la phrase
>   « ces chiffres mélangent… » ;
> - **l'assurance-vie, le PER et l'épargne salariale** se saisissent par leur total (fonds euros et
>   unités de compte), avec « Combien a été versé dessus ? » ;
> - **le cours des titres cotés se met à jour tout seul**, et Mon argent peut montrer deux dates ;
> - **chaque ligne a sa devise** ;
> - **le chiffrement de bout en bout** ajoute au premier lancement le choix d'un mot de passe et la
>   remise d'une clé de secours, et au mot de passe oublié la demande de cette clé ;
> - le site est reconstruit **dans ce dépôt**, en remplaçant l'existant.

## Pourquoi

- **Usage** : le téléphone d'abord, l'ordinateur ensuite. On ouvre l'application pour **constater**
  où on en est, puis, de temps en temps, pour **mettre à jour**.
- **Mise à jour rare et complète** : une fois par mois, par trimestre ou par an, toutes les lignes
  d'un coup, tant que rien n'est automatisé. La mise à jour est donc un moment à part, pas un
  formulaire posé sur l'écran principal.
- **Public élargi** : l'application ne doit pas effrayer ceux pour qui la finance et le patrimoine
  font peur. Le diagnostic de Nicolas sur la première version dessinée : « trop Bloomberg, des
  chiffres partout ». Ce qui marche : les carrés.

## Objectifs, non-objectifs, anti-objectifs

**Objectifs.** Se lire d'un coup d'œil grâce aux cent carrés. Ne pas intimider. Rester honnête :
ne jamais afficher un chiffre inventé, ni un chiffre qui contredit la grille.

**Non-objectifs.** Synchronisation bancaire. Conseils en investissement. Notes de risque,
rendements estimés, projections dans le futur.

**Anti-objectifs** — ce qui ferait échouer l'interface même si elle fonctionne :

- un écran couvert de chiffres, façon terminal boursier ;
- du jargon non expliqué ;
- du rouge pour un crédit immobilier, qui est la chose la plus normale du monde ;
- un conseil déguisé (« l'avis de l'expert », un « score de risque AMF » qui n'existe pas) ;
- une courbe qui invente une bosse entre deux relevés ;
- un montant qui contredit les carrés affichés au-dessus de lui.

## Direction artistique

Base retenue parmi les quatre de la maquette : **« Quant »** — fond noir, filets fins à la place
des boîtes et des cartes, rien de décoratif. Elle a été adoucie ensuite (« version douce »,
planche 9) : plus de police à chasse fixe, moins de chiffres.

### Couleurs

> **Thème clair, 10 novembre 2026** (planche 5, choix de Nicolas) : le site reste sombre par
> défaut ; le clair se choisit dans les Réglages (« Sombre », « Clair », « Comme l'appareil »), et
> ce choix est gardé dans le navigateur. Fond `#f1f5f1`, texte `#121a15` (adouci `#3a453e`, discret `#59665e`) ; mêmes
> teintes de catégories, plus foncées : disponible `#3B92AD`, sécurisée `#564BC8`, immobilier
> `#679157`, bourse `#A12E69`, or `#A27C0B` ; gain `#187A42`, perte `#B23B2E`. Les valeurs font
> foi dans `app/globals.css`.

> **Changé le 10 novembre 2026** (planches de thème, choix de Nicolas). Le fond devient un
> « vert oseille », un noir à peine vert comme le nom, et le texte blanc prend la même nuance. La
> bourse quitte le rouge pour le framboise : dans l'ancienne palette, aucune autre teinte de bourse
> ne restait distincte pour les daltoniens, si bien que les cinq couleurs ont bougé ensemble. La
> paire la plus proche, simulée, passe de 25 à 30 (ΔE). Le framboise a été préféré à l'orange
> parce qu'une version claire le garde framboise, alors que l'orange tire vers le brun. Le
> tableau ci-dessous donne les nouvelles valeurs ; le paragraphe qui le suit raconte l'ancienne
> palette.

| Rôle | Valeur | Remarque |
|---|---|---|
| Fond | `#09110d` | vert oseille, un noir à peine vert |
| Texte | `#eef3ee` | |
| Texte adouci | `#c3cdc5` | phrases d'explication |
| Texte discret | `#8a988d` | sous-titres, dates |
| Filets | `rgba(225,245,232,0.14)` | séparations (14 % depuis la planche 6 ; 9 % les rendait presque invisibles) |
| Argent disponible | `#2BB4D2` | bleu ciel |
| Épargne sécurisée | `#6A66DC` | violet |
| Immobilier | `#8ACB80` | vert tendre |
| Placements en bourse | `#B4467A` | framboise |
| Or et crypto | `#EFBE2A` | or |
| Gain | `#3FD182` | **en texte seulement** |
| Perte | `#F2877A` | rouge adouci, texte seulement |

Avant le 10 novembre, les teintes des catégories étaient celles des cent carrés du site d'avant, version « mode sombre »
(planches 4 et 5), avec deux retouches :

- les liquidités prennent le turquoise (le bleu d'origine se confondait avec le pervenche) ;
- le vert est un peu éclairci et le corail un peu foncé, pour les daltoniens : en protanopie
  simulée, l'écart de couleur entre les deux (mesuré en ΔE) tombait de 99 à 15 ; la retouche le
  porte à 28. **Éclaircir le corail aggrave la confusion** : c'est le vert qu'on
  éclaircit.

Le vert de l'immobilier reste proche du vert des gains. C'est assumé : les gains ne s'affichent
qu'en texte, jamais en carrés. **Le crédit n'est jamais en rouge.** Le rouge adouci est réservé aux
vraies pertes.

### Typographie et forme

- **Inter** partout, chiffres tabulaires. Plus de police à chasse fixe : c'est elle qui donnait
  l'effet « terminal ». *Depuis le 10 novembre 2026 : les titres d'écran, le grand montant et le
  nom du logo sont en Bricolage Grotesque ; tout le reste reste en Inter.*
- Nombres à la française : espace fine pour les milliers, virgule décimale.
- Titres en minuscules à la française (« Coussin de sécurité », pas « Coussin De Sécurité »).
- **Aucun émoji.**
- Carrés à angles légèrement adoucis (2 à 3 px), boutons en pilule.

### Vocabulaire graphique

Constant d'un écran à l'autre ; c'est lui qui tient l'ensemble, pas la répétition d'une forme.

- **Teinte = catégorie**, jamais réaffectée à autre chose (pas de grille recolorée par banque).
- **Trait blanc = référence** : un objectif, un cap, un repère.
- **Plein après le trait = au-dessus. Contour vide = en dessous, ou manquant.** *Depuis le
  10 novembre 2026 (planche 7), dans une barre d'objectif, ce contour porte un voile pâle de sa
  teinte, pour que le manque se voie de loin ; il ne devient jamais un plein.* *Même jour
  (planche 8) : sur la courbe d'évolution, le cap est le trait blanc, la courbe du total est en
  texte adouci.*
- **Allumé / éteint = sous-ensemble** (les carrés d'une catégorie ouverte, ce qu'on peut récupérer vite).
- **Position horizontale = temps** (sur un vrai calendrier).

### Mouvement

La courbe d'évolution se dessine à l'ouverture, puis ses points apparaissent ; la grille se remplit
au premier lancement ; les petits carrés « pas à leur place » apparaissent en cascade. Durées
indicatives : 1,5 s pour la courbe, 0,35 s par élément. **Tout mouvement s'arrête si le téléphone
demande moins d'animations.**

Le **dégradé** est autorisé à un seul endroit : le voile sous la courbe d'évolution (choix de
Nicolas, planche 17).

## Les mots

Tutoiement. Des mots de tous les jours, et une explication sous chaque sigle inévitable (« LEP —
livret d'épargne populaire »).

| Au lieu de | On écrit |
|---|---|
| Liquidités et livrets | Argent disponible |
| Fonds euros et obligations | Épargne sécurisée |
| Actions et bourse | Placements en bourse |
| Crypto, or et alternatifs | Or et crypto |
| Patrimoine net | Ce qui est vraiment à toi |
| Cours | Prix d'une part |
| PRU, prix de revient | Prix moyen d'achat |
| +3 329 € (+18,8 %) | a gagné 3 329 € depuis l'achat |
| Diagnostic | Repères |
| Points d'attention | Bon à savoir |
| Matelas de sécurité | Coussin de sécurité |
| 5 carrés au mauvais endroit | Proche de tes objectifs, à 5 carrés près |
| 6 880 € manquants | un peu en dessous de ton objectif |

Écart à l'objectif, en carrés : 0 → « pile à ton objectif » ; 1 → « presque à ton objectif » ;
2 à 5 → « un peu au-dessus / un peu en dessous » ; plus de 5 → « au-dessus / en dessous ».

Aucune phrase ne juge et aucune ne fait peur. Un constat sur la maison s'écrit « Ta maison
représente presque la moitié de ce qui est à toi. C'est courant quand on est propriétaire. », pas
« Si elle perd 10 %, ton net perd 15 %. »

## Règles valables partout

1. **Un seul montant par ligne.** Les détails techniques (quantité, prix du jour, prix moyen
   d'achat) existent, mais derrière « Voir les chiffres détaillés ».
2. **Euros ou pourcentages, d'un toucher** (planche 10). Tout chiffre souligné en pointillés se
   touche. Un toucher fait passer tous ces chiffres de l'application en %, un second les remet en
   euros, et le choix est retenu (aussi réglable dans les Réglages). Une petite bulle confirme.
   Valable sur téléphone **et** sur ordinateur.
   - **Basculent, et sont soulignés** : les montants des catégories et des lignes, qui deviennent
     leur part de ce qui est à toi, **écrite comme leur nombre de carrés** (« 3 % » pour une ligne
     de 3 carrés, « moins de 1 % » sous un carré) — jamais une décimale qui contredirait les carrés
     dessinés à côté, la part exacte restant dans « Voir les chiffres détaillés » ; les gains et
     pertes, qui deviennent un pourcentage du prix d'achat (une décimale) ; les progrès (« 700 € de
     plus » devient « 69 % de plus »).
   - **Ne basculent pas, et ne sont pas soulignés** : le grand total, le crédit, les montants qui
     ne sont pas une part de ce qui est à toi (les banques, « Chez toi », ce que tu possèdes avant
     crédit), « D'où ça vient », et les écrans de saisie.
   - La planche 10 affiche encore « 2,4 % » à côté de 3 carrés : ce document la corrige.
   - **Décidé par Nicolas le 9 novembre 2026** (avis de direction artistique, C4) : **le pointillé
     seulement dans les listes**. Un montant vedette (le grand chiffre d’une catégorie, le gain
     depuis le premier relevé dans Évolution) ou la progression posée sous le grand montant n’en
     portent plus : ils se touchent toujours de la même façon, et la bulle « Chiffres en % partout »
     continue de l’apprendre. Les montants des catégories et des lignes, dans leurs listes, gardent
     leur pointillé.
3. **La date affichée est celle des chiffres**, jamais celle du jour : « Chiffres du 30 septembre ».
4. **Un chiffre ne contredit jamais la grille.** Dans une vue, chaque montant est celui que ses
   carrés représentent. (La maquette d'origine affichait « Résidence principale 260 000 €
   (46 carrés) » alors que ces 46 carrés valaient 80 000 €.)
5. **Moins d'un carré : absent de la grille, jamais de la liste.** Ces lignes sont nommées à part,
   sous « Trop petit pour un carré ».
6. **Une réponse qu'on ne peut pas donner se dit.** Pas d'objectifs → pas de barres ni de phrase
   d'objectif. Pas de dépenses connues → le coussin n'est pas calculé (jamais « 0 mois »). Un seul
   relevé → pas de courbe.
7. **Masquer les montants** : un interrupteur dans les Réglages, pour regarder son téléphone en
   public.
8. **Cibles tactiles** d'au moins 44 px de haut. La grille ne se touche pas carré par carré : on
   touche la ligne de la catégorie.

## Navigation

**Téléphone.** Trois onglets en bas : **Mon argent**, **Repères**, **Évolution**. Les Réglages
s'ouvrent par un petit lien en haut de Mon argent. Le détail d'une catégorie s'ouvre comme un
écran poussé, avec retour. La mise à jour et le premier lancement prennent tout l'écran.

**Ordinateur** (planche 20). Les trois onglets deviennent un menu en haut ; à droite du menu, la
date des chiffres, « Mettre à jour » et « Réglages ». Le contenu passe en deux colonnes.

## Les écrans

### 1. Mon argent — l'écran d'ouverture (planche 10, écran 1)

De haut en bas :

1. Titre « Mon argent » et bouton « Mettre à jour ». Dessous, la date des chiffres.
2. « Ce qui est vraiment à toi », le grand montant net, et une phrase : « Tu possèdes 352 000 €,
   dont 180 000 € encore prêtés par la banque pour ta maison. »
3. La valeur d'un carré (« Un carré vaut 1 720 € ») et son progrès (« 700 € de plus qu'en janvier
   2024 »). C'est la mesure de progrès centrale.
   > **Décidé par Nicolas le 9 novembre 2026** (avis de direction artistique, C3) : « 46 € de plus »,
   > souligné, se lisait « j’ai gagné 46 € » alors que la personne avait gagné 4 642 €. La phrase
   > devient « Un carré vaut 2 128 € (2 082 € en octobre) », sans pointillé (l’année n’est dite que si
   > ce n’est pas celle-ci), et la vraie
   > progression, celle de ce qui est à toi, s’écrit sous le grand montant, sur téléphone : « +4 642 € depuis
   > octobre » (elle bascule en % d’un toucher). Sur ordinateur, elle reste dans le coup d’œil
   > « Depuis octobre 2026 » sous les catégories. Le résultat de la mise à jour dit de même « Un carré
   > vaut maintenant 2 060 € (2 020 € au 30 septembre) ».
4. La grille de cent carrés, remplie ligne par ligne, catégorie après catégorie.

   > **Décidé par Nicolas le 9 novembre 2026**, sur son iPhone : avec ses deux relevés, la dernière
   > rangée de la grille passait sous la barre d'onglets. Le haut de l'écran devient, sur téléphone :
   > - l'en-tête : le titre « Mon argent », la pilule « Mettre à jour » et une **roue dentée** pour
   >   les Réglages (le seul pictogramme du site, lu « Réglages » par VoiceOver). Sous 360 px de
   >   large, le titre n'est plus que lu à voix haute : la ligne ne tenait pas à 320 px ;
   > - « Ce qui est vraiment à toi » en petit et gris, le grand montant, la progression ;
   > - la phrase « Tu possèdes… dont… prêtés pour ta maison » s'ouvre en touchant le montant, dans
   >   une bulle posée sur la grille, qui ne bouge pas ; un second toucher, un toucher ailleurs ou
   >   Échap la referment ;
   > - la grille, qui se règle seule pour finir au-dessus de la barre d'onglets (elle ne descend
   >   pas sous 60 % de sa colonne) ;
   > - sous la grille, en petit : « Un carré vaut… » (la légende de la grille), puis la date des
   >   chiffres.
   >
   > Sur ordinateur, la colonne de gauche suit le même ordre (la date est dans le menu).
   > La grille arrive **à chaque ouverture du site** (ou rechargement), jamais en revenant d'un autre
   > onglet ; elle n'arrive plus une seule fois par relevé, ce que Nicolas ne voyait jamais.
   >
   > **Toucher un carré** (décidé le même jour, sur planches ; jusque-là, seul un toucher sur la
   > ligne d'une catégorie allumait ses carrés) :
   > - un premier toucher allume toute sa catégorie. Le petit titre et le grand montant deviennent
   >   ceux de la catégorie (« ● Placements en bourse · 22 carrés », son montant) en glissant :
   >   l'ancien monte et s'efface, le nouveau arrive par en dessous. Jamais de chiffres qui
   >   défilent : au milieu, ils seraient faux. La progression, qui est celle du total, s'efface ;
   > - sous la grille, à la place de la légende : la phrase de la catégorie (« 22 carrés sur 100,
   >   en dessous de ton objectif (30 carrés) »), la date de ses chiffres, « Voir le détail › » ;
   > - un second toucher sur un carré allumé allume sa ligne seule, en trois niveaux : la ligne en
   >   plein, le reste de sa catégorie à moitié, les autres catégories presque éteintes. En haut,
   >   son nom et son montant ; dessous, « PEA chez BoursoBank · 11 des 22 carrés de Placements en
   >   bourse », la date, « Voir la ligne › » ;
   > - le même carré encore, un toucher ailleurs ou Échap ramènent tout. Rien pendant la
   >   simulation des objectifs, dont les carrés ne sont pas à la place de leurs lignes.
   >
   > **Sur ordinateur** (décidé le 9 novembre 2026) : un clic sur un carré ouvre le détail de sa
   > catégorie, comme un clic sur sa ligne. Sa catégorie s’allume aussitôt, la colonne de droite
   > s’efface, puis la page change (350 ms ; tout de suite avec moins d’animations). Ni montant qui
   > glisse, ni « Voir le détail › » sous la grille. Sur la page de la catégorie, la grille reste
   > cliquable : un carré d’une autre catégorie remplace la page (le retour ramène à Mon argent) ;
   > un carré de la même catégorie allume sa ligne seule, ouvre son chapitre et met sa rangée en
   > avant dans le détail ; le même carré encore l’éteint ; Échap éteint la ligne, puis ramène à
   > Mon argent. Sur téléphone, rien ne change.
   >
   > **Sur téléphone aussi** (décidé par Nicolas le 9 novembre 2026, le soir : « le même
   > comportement sur téléphone … affiché en dessous du cube ») : un toucher sur un carré ouvre le
   > détail de sa catégorie, comme sur ordinateur ; ce qui est sous la grille s’efface, puis la page
   > change. L’allumage sur place du matin (montant qui glisse, « Voir le détail › », « Voir la
   > ligne › ») est remplacé. Sur téléphone, le détail montre la grille de Mon argent **au-dessus**
   > de lui, à la même place et à la même largeur : le retour « ‹ Mon argent » prend la place de la
   > ligne d’en-tête, puis le petit titre, le total, la progression, la grille, et le détail
   > dessous. La grille y est cliquable comme sur ordinateur, et la rangée d’une ligne allumée vient
   > au milieu de l’écran. Sur les deux tailles, **un toucher hors de la grille**, sur rien qui se
   > touche (ni lien, ni bouton, ni chapitre, ni ligne), ramène à Mon argent, où la grille est
   > entière ; le toucher qui referme la bulle « Tu possèdes… » ne fait que la refermer. **Sur
   > ordinateur, survoler un carré le dit** sous la grille, à la place de « Un carré vaut… » :
   > « ● PEA · Placements en bourse · 68 893 € » (le montant de la ligne tel que le détail le
   > montre, « ••• » s’il est masqué ; son pourcentage quand l’écran est en %) ; une ligne qu’un
   > crédit finance ajoute « , crédit déduit » (« ● Ma maison · Immobilier · 221 100 €, crédit
   > déduit »). Sur Mon argent, la rangée de sa catégorie s’allume, la grille ne s’assombrit pas.
   > Une catégorie sans carré à elle (l’immobilier sous son crédit) n’allume rien dans la grille.
5. La phrase des objectifs : « Proche de tes objectifs », « À 5 carrés près sur 100. »
6. Les catégories : pastille, nom, montant et flèche ›, puis la **barre d'objectif** (planche 6,
   variante A), puis les mots de l'écart. L'immobilier porte « estimée le 30 sept. ».

La barre d'objectif : toutes les barres partagent la même échelle (la plus grande catégorie
remplit la largeur). Plein jusqu'au plus petit de « aujourd'hui » et « objectif », un trait blanc à
l'objectif, plein après le trait pour ce qui est au-dessus, contour vide pour ce qui manque.

**Retirés** de la maquette d'origine sur cet écran : les bascules net/brut et catégories/banques
(elles changeaient le sens de la grille, des objectifs et de la valeur du carré), la « machine à
remonter le temps », les profils d'exemple, le choix de direction artistique.

### 2. Le détail d'une catégorie (planche 10, écrans 2 et 3)

> **Complété le 9 novembre 2026** : les lignes s’y rangent en chapitres fermés (zones, types,
> comptes) ; voir `2026-11-09-ranger-par-zone-design.md`.

Ouvert en touchant la ligne d'une catégorie. En tête : retour, titre, montant, « 26 carrés sur
100, un peu en dessous de ton objectif (30 carrés) » et la barre d'objectif. Puis chaque ligne,
la plus grosse d'abord :

- nom et montant ;
- où elle est, en mots (« PEA chez BoursoBank », « Épargne salariale, disponible en 2029 ») ;
- **ses carrés**, en petite rangée de la couleur de la catégorie (12 carrés pour une ligne qui en
  vaut 12) ;
- « a gagné 3 329 € depuis l'achat », en vert, ou « a perdu 204 € », en rouge adouci.

Puis « Trop petit pour un carré » et ses lignes, puis « Voir les chiffres détaillés ».

Pour l'immobilier, le détail dit ce qui est possédé et ce qui reste dû (« 260 000 € dont
180 000 € dus à la banque ») : c'est ce qui remplace la vue « brute » hachurée de la maquette,
abandonnée. Cet écran précis n'a pas été dessiné.

Sur ordinateur, le détail s'ouvre dans la colonne de droite et la grille reste visible à gauche :
seuls les carrés de la catégorie restent allumés.

### 3. Repères (planche 9, écran 3)

Ce qui remplace le « Diagnostic » de la maquette. Des constats, pas des notes.

1. **Ton coussin de sécurité.** « Si tes revenus s'arrêtaient, ton argent disponible couvrirait
   environ 5 mois et demi de dépenses. » Douze cases, une par mois, remplies de turquoise ; un
   trait sous les cases 4 à 6 (*retiré le 9 novembre avec la phrase sur une ligne, rétabli le
   11 novembre 2026 en blanc, la couleur de la référence, la phrase partant du trait ; au-delà de
   douze mois, « + 7 mois » au bout de la rangée, décidé par Nicolas*) : « 3 à 6 mois : ce qu'on conseille souvent » (*devenu le 10 novembre 2026 « 3 à 6 mois : le repère le plus courant » : le site ne conseille pas ; voir `2026-11-10-criteres-des-experts-design.md`*). L'écran dit toujours
   s'il compte en mois de **dépenses** ou de **salaire** (voir premier lancement).
2. **Ce que tu peux récupérer vite.** Une phrase (« Un peu plus de la moitié de ce qui est à toi,
   90 600 €, en quelques semaines si besoin. Le reste est dans ta maison, et une petite part attend
   ta retraite. ») et une petite grille où les carrés récupérables sont allumés, les autres éteints.
   Le PER et l'épargne salariale ne sont pas récupérables vite.
3. **Bon à savoir.** Deux ou trois faits (*quatre au plus depuis le 10 novembre 2026, avec la plus grosse action en direct ; voir `2026-11-10-criteres-des-experts-design.md`*), jamais un conseil, jamais un produit nommé : la part de la
   maison, une même entreprise sur deux comptes, une épargne placée chez son employeur.
4. **Où est ton argent.** Chaque banque avec son montant et une barre découpée aux couleurs des
   catégories qu'elle contient, à la même échelle, et un crédit apparaît sous la banque qui l'a
   prêté (décision du 7 novembre), sans rouge. Puis « Chez toi » (ce qu'on détient soi-même :
   maison, or, crypto sur un portefeuille personnel) sans barre.

**Retirés** de la maquette : score de risque « AMF » sur 10, rendement estimé, projection à 10 ans,
« L'avis de l'expert patrimonial », badges « Optimal ». (Raisons détaillées dans les avis
d'experts : l'échelle réglementaire note un produit de 1 à 7, pas un patrimoine ; 70 % du
rendement estimé venait d'un taux prêté à la résidence principale.)

### 4. Évolution (planches 16 et 17)

1. **Depuis ton premier relevé** : « +70 000 € sur ce qui est à toi », et « Un carré valait
   1 020 € en janvier 2024. Il en vaut 1 720 aujourd'hui. »
2. **La courbe** de ce qui est à toi :
   - posée sur un **vrai calendrier** (deux relevés à neuf mois d'écart sont espacés de neuf mois) ;
   - arrondie entre les relevés par une interpolation **qui ne dépasse jamais** les relevés
     (monotone) : elle ne peut pas dessiner un pic ou un creux qui n'a pas eu lieu ;
   - un voile en dégradé dessous ; le prochain cap en trait pointillé (« prochain cap : 1 carré =
     2 000 € ») ; la graduation de droite en valeur d'un carré, puisque c'est le même chiffre
     divisé par cent ;
   - elle se dessine à l'ouverture ;
   - au doigt (ou à la souris), une bulle montre la date, le montant et la valeur d'un carré, en
     **s'accrochant au relevé le plus proche** : jamais de valeur inventée entre deux relevés.
3. **Tes objectifs** :
   - « Tu t'en rapproches. En janvier 2024, 19 carrés n'étaient pas à leur place. Aujourd'hui, 5. » ;
   - une rangée de petits carrés par relevé, un par carré « pas à sa place », **de la couleur de la
     catégorie qui en a trop**, avec une légende ;
   - « Catégorie par catégorie » : pour chacune, une trace — un point par relevé, du plus pâle
     (ancien) au plus net (récent), le trait blanc de l'objectif, et un mot (« se rapproche »,
     « presque atteint », « atteint », « à peu près stable », « s'éloigne »).
4. **D'où ça vient** : ce que chaque catégorie a apporté depuis le premier relevé, en barres de part
   et d'autre d'un trait zéro, **crédit remboursé compris**. Dessous du titre, une phrase honnête :
   « Ces chiffres mélangent ce que tu as mis de côté et ce que les marchés ont fait. »
5. **Tes relevés** : date, montant, valeur d'un carré.

**Avec un seul relevé** (planche 15, écran 2) : pas de courbe. « Ta courbe commence ici », le
relevé unique, ce qui viendra, et « Mettre à jour maintenant ».

### 5. La mise à jour (planches 11 et 14)

Plein écran, lancée par « Mettre à jour ». **Banque par banque**, dans l'ordre où l'on ouvre ses
applications bancaires.

1. **Départ** : la liste des banques à faire et leur nombre de lignes, une barre en N morceaux,
   « Commencer par BoursoBank », et « Tu peux t'arrêter quand tu veux, rien n'est perdu ».
2. **Une banque** : chaque case est déjà remplie avec l'ancienne valeur. Taper par-dessus allume la
   case et rappelle « avant : 10 000 € ». « Inchangé » d'un toucher par ligne ; « Rien n'a changé
   ici » pour toute la banque.
3. **Une action ou un fonds** (planche 14, « le mélange ») : par défaut **une seule case**, le prix
   d'une part ; l'écran calcule la valeur (3 800 parts × 5,89 € = 22 382 €). Sous chaque ligne,
   « Les parts ou le prix moyen ont changé ? » ouvre deux cases supplémentaires, **déjà remplies**,
   où l'on recopie ce que montre la banque. Pas de calculateur d'achat-vente.
4. **Chez toi, et le crédit avec sa banque** : la maison reste dans « Chez toi » et ne se tape pas à
   chaque fois (« C'est toujours ça » ou « Changer », « une estimation par an suffit ») ; le crédit
   se met à jour avec sa banque, et l'écran dit où trouver le chiffre (application de la banque,
   tableau d'amortissement).
5. **Résultat** : ce qui est à toi, l'écart depuis le relevé précédent, la nouvelle valeur d'un
   carré, ce qui a changé par catégorie, « Revenir corriger », « Enregistrer ».

La saisie en cours est **conservée** si l'on quitte l'application pour aller lire un solde.

### 6. Le premier lancement (planches 18 et 19)

1. **Bienvenue** : la grille se remplit doucement ; « Ton argent, en 100 carrés » ; ce qu'est un
   carré ; « Compte un quart d'heure » ; « C'est parti » ; « Tu peux t'arrêter quand tu veux, rien
   n'est perdu ».
2. **Où est ton argent ?** : les banques **les plus courantes en France** d'abord (Crédit Agricole,
   BNP Paribas, Société Générale, Crédit Mutuel, La Banque Postale, Caisse d'Épargne, Banque
   Populaire, LCL, CIC, BoursoBank, Fortuneo, Revolut — liste de travail, non vérifiée par des
   chiffres de clientèle), une recherche pour les autres, « + Ajouter la mienne ». Puis ce qu'on a
   en dehors des banques : ma maison, un autre logement, de l'or que tu gardes toi-même, de la
   crypto sur ton propre portefeuille, mon épargne salariale. Un crédit se saisit dans sa banque
   (décision de Nicolas, 7 novembre). La page le dit : « Ton crédit se saisit avec sa banque. L’or
   et la crypto achetés sur une plateforme (Coinbase, Binance…) se saisissent avec elle, comme une
   banque. » Ce choix fixe les étapes du premier lancement **et** de chaque
   mise à jour.
3. **Une banque à la fois** : d'abord « Chez toi » (ce que la personne détient elle-même, décision
   du 7 novembre : la maison que le crédit financera est alors déjà saisie), puis chaque banque, puis
   l'épargne salariale. « Qu'as-tu chez BoursoBank ? » ; les lignes ajoutées ; les types de
   comptes **les plus courants en France**, en quatre familles, avec une explication sous les sigles :
   - comptes et livrets : compte courant, Livret A, LDDS, LEP, Livret Jeune, PEL ou CEL, autre livret ;
   - placements : assurance-vie, PEA, compte-titres ;
   - retraite et entreprise : PER, épargne salariale ;
   - crédit, or et crypto : un crédit (« ce qu’il te reste à rembourser »), de l'or, de la crypto
     (une plateforme comme Coinbase ou Binance met cette famille en premier) ;
   - et « Je ne trouve pas mon compte ».

   **Les listes de banques et de types de comptes vivent à part des écrans** : on doit pouvoir les
   modifier sans redessiner quoi que ce soit.
4. **Ajouter une action ou un fonds** (planche 13, écran 1) : nom ; où (banque, puis enveloppe) ;
   combien de parts ; prix moyen d'achat (« ta banque l'affiche sous "prix de revient" ou "PRU" ;
   tu ne le sais pas ? laisse vide, on affichera la valeur sans le gain ») ; prix d'une part
   aujourd'hui ; un résumé avant validation, avec la catégorie proposée et « changer ».
5. **La révélation** : « Voilà ton argent en 100 carrés », la grille qui se construit, ce qui est à
   toi, la valeur d'un carré, le nombre de carrés par catégorie.
6. **Tes objectifs** (planche 19) : quatre boutons d'exemple — « Ma répartition actuelle »,
   « Prudent », « Équilibré », « Dynamique » — puis un « − / + » par catégorie, en carrés, et une
   petite grille de la répartition visée. **La maison garde sa part actuelle** : les exemples
   répartissent le reste. Tant que le total n'est pas 100, les carrés non placés apparaissent en
   contour vide, l'écran dit combien il en reste, et « Enregistrer » attend. Sous la liste : « Ce
   sont des exemples, pas un conseil fait pour toi. » « Plus tard » est toujours possible.
7. **Tes dépenses** : « Combien dépenses-tu par mois, à peu près ? », à quoi ça sert (le coussin,
   rien d'autre), une case et des montants tout prêts. « Je ne connais pas mes dépenses » propose le
   **salaire net** (il est sur la fiche de paie ; le calcul sera un peu prudent). « Plus tard »
   possible.

**« Plus tard » sur chaque écran** (décision du 7 novembre) : dès que quelque chose est enregistré,
chaque écran du premier lancement propose « Plus tard », qui mène à Mon argent. Seuls en sont
privés la bienvenue et un premier « Où est ton argent ? », où rien n'est encore enregistré.

### 7. Réglages (planche 18)

Mes objectifs (avec leur répartition en petite barre), mes dépenses par mois (ou mon salaire), mes
banques et l'ordre de la mise à jour, chiffres en euros ou en %, masquer les montants, mon compte.

### 8. Ordinateur (planche 20)

Deux colonnes. À gauche : ce qui est à toi, la phrase sur le crédit, la valeur d'un carré, la grille
en grand. À droite : la phrase des objectifs, les catégories (une ligne s'éclaire au survol), puis
deux encarts de coup d'œil — le coussin de sécurité (vers Repères) et la progression depuis le
premier relevé (vers Évolution). Le détail d'une catégorie remplace la colonne de droite.

Repères, Évolution, la mise à jour et le premier lancement n'ont pas été dessinés sur ordinateur :
ils reprennent les écrans du téléphone, centrés, en profitant de la largeur sans changer d'ordre.

## Ce qui est laissé au constructeur

- Le choix technique (framework, composants, bibliothèque de graphiques ou SVG à la main).
- Les durées et courbes d'animation exactes, dans l'esprit décrit.
- Les formulations non citées ici, dans le ton décrit.
- L'icône et le nom : « PatriCube » est provisoire. (10 novembre 2026 : Nicolas choisit « Oseil ».
  Seul le nom affiché change ; l'adresse reste stefin.vercel.app, puisqu'en changer désactive Face ID.)
- La mise en page ordinateur des écrans non dessinés, selon la règle ci-dessus.

## Décisions prises à la relecture

Un relecteur a lu ce document « à froid », comme le ferait quelqu'un chargé de le construire. Les
points ci-dessous répondent à ses questions ; ce sont des choix de l'assistant, **à vérifier par
Nicolas**, et aucun n'a été dessiné.

- **Un compte contient ses lignes.** Un PEA, une assurance-vie ou un compte-titres est un compte,
  dans lequel on ajoute ses actions et fonds (formulaire de la planche 13) ; une assurance-vie
  contient aussi son fonds euros, qui se saisit par son montant. Le premier lancement montre le
  compte et son total (« PEA · 4 actions et fonds · 34 100 € », planche 18) ; la mise à jour et le
  détail d'une catégorie montrent chaque ligne, avec le nom de son compte.
- **La vie d'une ligne entre deux mises à jour** se gère dans la mise à jour, là où l'on voit ce qui
  a changé : à chaque banque, « + Ajouter » (un compte ou une ligne ouverte depuis) et, sur chaque
  ligne, « Fermé ou tout vendu ». Hors mise à jour, le détail d'une ligne permet de la corriger ou
  de la clore, et « Mes banques » dans les Réglages permet d'ajouter ou de retirer une banque. Un
  relevé déjà enregistré se corrige depuis la liste « Tes relevés » de l'onglet Évolution.
- **La mise à jour inachevée.**
  - Une case pré-remplie qu'on ne touche pas vaut « inchangé ». Le bouton « Inchangé » sert à le
    confirmer et fait avancer le compte « 3 lignes sur 7 vérifiées » ; il n'est pas obligatoire.
  - On peut enregistrer sans avoir fait toutes les banques. L'écran de résultat le dit : « 2 banques
    non revues : leurs chiffres datent du 30 septembre ». Mon argent affiche alors une date par
    banque dans « Où est ton argent », et la date du relevé.
  - Le relevé porte la date du jour où on l'enregistre, modifiable sur l'écran de résultat.
  - Tant qu'un brouillon attend, Mon argent montre le dernier relevé enregistré et un bandeau
    discret « Mise à jour en cours · Reprendre ».
  - Un premier lancement abandonné montre ce qui a déjà été saisi, avec « Il te reste 2 banques à
    ajouter · Continuer ». Mon argent liste chaque étape dans l'ordre, avec « fait », « en cours »
    ou « à faire », les comptes saisis avec leur montant (« montant à saisir » s'il est vide) et
    « aucun compte » pour une étape terminée sans compte. Il ne montre ni grille, ni net, ni total.

## Questions de fonctionnement mises de côté

À concevoir avant de construire les écrans qui en dépendent. Aucune n'a de réponse.

1. **Versements ou performance.** Sans noter ce qu'on verse entre deux relevés, « +1 210 € » sur
   les placements mélange épargne et marchés, et le crédit remboursé gonfle la progression. Soulevé
   indépendamment par les trois experts. Touche le résultat de la mise à jour et « D'où ça vient ».
2. **La résidence principale et les objectifs.** Les exemples d'objectifs gardent la maison à sa
   part ; faut-il la sortir complètement des objectifs (et du « à N carrés près ») ? Chaque
   mensualité de crédit augmente mécaniquement sa part nette.
3. **Ce qui est récupérable vite se juge par ligne**, pas par catégorie : un PER ou une épargne
   salariale sont dans « Placements en bourse » mais bloqués.
4. **L'établissement et l'enveloppe** d'une ligne doivent être de vrais champs (la maquette les
   devinait dans le libellé).
5. **Les crédits** : plusieurs crédits, chacun rattaché à ce qu'il finance (la maquette imputait
   toute dette à l'immobilier, prêt à la consommation compris).
6. **La catégorie d'une ligne** : devinée depuis le type de compte, choisie, ou les deux.
7. **Objectifs et historique** : appliquer les objectifs d'aujourd'hui aux anciens relevés (choix
   provisoire des planches) ou garder les objectifs en vigueur à chaque date.
8. **Frais** dans le prix moyen d'achat recopié depuis la banque.
9. **Les proportions des exemples d'objectifs** (Prudent, Équilibré, Dynamique) : à fixer avec
   Nicolas ; celles des planches sont des chiffres de travail.
10. **Les listes de banques et de types de comptes** : leur source et la façon de les tenir à jour.
11. **Dépenses ou salaire** : comment le choix est enregistré et affiché.
12. **Où vivent les données** : stockage, comptes, plusieurs utilisateurs, sauvegardes.
13. **Le site actuel** : remplacé dans ce dépôt ou nouveau dépôt.
14. **Une part négative.** Un acheteur récent peut devoir à la banque plus que sa maison ne vaut ;
    un patrimoine net peut être nul ou négatif. Cent carrés ne savent pas montrer une part
    négative, et les autres catégories dépasseraient alors 100. Principe proposé, à confirmer avec
    le fonctionnement : une catégorie négative n'a pas de carré et est dite à part (« Ta maison vaut
    encore moins que ce que tu dois : pas de carré pour l'instant ») ; un net nul ou négatif
    n'affiche pas de grille, mais ce qui est possédé, ce qui est dû, et quand les carrés
    apparaîtront.
