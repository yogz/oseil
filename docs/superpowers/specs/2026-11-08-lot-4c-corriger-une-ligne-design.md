# Lot 4c — corriger une ligne après coup

Le 8 novembre 2026. Ce document complète la spec d'interface (« Hors mise à jour, le détail d'une
ligne permet de la corriger ou de la clore ») et la spec de fonctionnement (« Ouvrir, fermer,
corriger »). Ni l'une ni l'autre ne dessinait cet écran. Il reprend aussi le retour de Nicolas après
l'essai du lot 3 : le crédit immobilier se range dans sa banque. Le crédit de Nicolas a été saisi
avant ce changement : il est sans doute encore dans « Chez toi ».

La fiche a été validée par Nicolas sur une planche, le 8 novembre 2026 : trois exemples, un fonds
dans un PEA, un crédit encore dans « Chez toi » et de l'épargne salariale. Ses réponses du même jour
sont notées « Nicolas » ; le reste est un choix de l'assistant, noté comme tel.

## Pourquoi

Une faute de frappe ne se corrige aujourd'hui que dans la mise à jour du mois. Elle y compte alors
comme un changement : 3 400 € corrigés en 34 000 € deviennent 30 600 € « gagnés » sur les marchés ou
« mis de côté ». Une ligne vendue sans que la mise à jour le sache reste comptée, en plus de l'argent
de la vente arrivé sur le compte courant. Le lot 4c donne un endroit où réparer une saisie sans
fausser l'histoire.

## Ce que voit la personne

### Ouvrir la fiche

- Dans le détail d'une catégorie, chaque ligne s'ouvre d'un toucher, y compris celles de « Trop petit
  pour un carré ». La fiche ne s'ouvre que depuis là (Nicolas).
- **Un crédit n'est la ligne d'aucune catégorie**, car il est une dette. La ligne de la maison
  montre déjà sa valeur moins son crédit (`netHoldings` de `computeSituation`), et ses carrés en
  viennent. Ajouter une ligne pour le crédit compterait donc la dette deux fois. Le crédit reste
  donc une phrase, mais cette phrase ouvre sa fiche. Choix de l'assistant :
  - dans le détail d'Immobilier, la phrase « 260 000 € dont 80 000 € dus à la banque » devient un
    lien vers la fiche du crédit, avec un lien par crédit s'il y en a plusieurs ;
  - un crédit qui ne finance aucun bien abaisse l'argent disponible : le détail d'Argent
    disponible gagne une phrase du même genre, qui ouvre sa fiche.

  Le crédit n'est jamais en rouge, que ce soit dans la phrase ou dans sa fiche (spec d'interface :
  « Le crédit n'est jamais en rouge »).
- **Une catégorie sans carré.** Elle peut ne pas en avoir parce que son total est négatif, ou
  parce qu'il n'y a pas de grille du tout, quand le net est nul ou négatif. Aujourd'hui, Mon argent
  ne la relie à rien (`linked: false`). Or c'est justement après une grosse faute de frappe
  qu'elle n'a plus de carré, par exemple un crédit tapé 800 000 € au lieu de 80 000 €. Son détail
  s'ouvre donc quand même : ses lignes sont listées sans carrés, et chacune ouvre sa fiche. Choix
  de l'assistant.
- **Une ligne sans taux de change** n'est pas comptée, mais elle reste nommée dans la note du
  détail (« … n'est pas compté : son taux de change manque »). Ce nom ouvre aussi sa fiche. Choix
  de l'assistant.

### La fiche

En haut :
- le nom de la ligne ;
- où elle est rangée (« PEA chez BoursoBank », « Chez toi · il finance « Maison » ») ;
- son montant au dernier relevé ;
- une ligne de détail : parts et prix, « reste à rembourser », et la date du relevé.

Puis « Corriger une erreur de saisie ». Chaque rangée ouvre une petite correction, une seule chose
à la fois, avec « Enregistrer » et un retour à la fiche :
- **Son nom.** Pour un compte qui n'a qu'une ligne (un livret, un crédit, une maison), le nom du
  compte suit, comme au premier lancement (`editSingleLineAccount`). Attention : cette fonction
  passe par `putLine`, qui remet `seenOn` et la date du relevé à aujourd'hui. Elle ne se reprend
  donc pas telle quelle. Pour un compte à plusieurs lignes (un PEA), seule la ligne change.
- **Son montant**, ou pour une action ou un fonds **ses parts, son prix et son prix moyen** : les
  chiffres du dernier relevé (voir « Corriger un montant »). Pour un crédit, « Ce qui reste à
  rembourser ».
- **Où elle est rangée** (voir « Ranger ailleurs »).
- **Son prix du jour**, pour une ligne qui peut suivre un cours : « automatique » ou « tapé à la
  main », et la rangée mène à « Tes titres » (lot 4b), sans rien refaire.
- **Le bien qu'il finance**, pour un crédit.
- **Disponible en …**, pour l'épargne salariale. C'est le seul type de compte qui demande une année
  de déblocage (`askYear`) ; un PER s'affiche « disponible à la retraite » et n'en a pas. Elle
  vaut pour tout le compte. Elle se saisit comme une année (`unlockOn` = « AAAA-01-01 », affichée
  « disponible en 2029 ») et se corrige comme une année aussi. Elle peut aussi être ajoutée si elle
  manque, ou effacée. La planche montrait une date complète ; l'année suit ce qui existe. Choix de
  l'assistant.

En bas, deux sorties bien séparées, chacune avec sa phrase d'explication :
- **« Fermé ou tout vendu »**, « Remboursé » pour un crédit et « Vendu » pour une maison : « Il passe
  à zéro à la date que tu choisis. Il reste dans tes anciens relevés. »
- **« Supprimer, saisi par erreur »** : « Il disparaît partout, même de tes anciens relevés. »

Les mots des planches sont repris tels quels. Les autres phrases sont à écrire dans le ton des
specs (tutoiement, apostrophe ’) et à lister à Nicolas.

## Les règles

### Fermer à une date (Nicolas)

- **Une ligne fermée le jour D n'apparaît plus dans les relevés pris ce jour-là ou après.** C'est la
  règle de la mise à jour, qui ferme une ligne à la date de son relevé (`closedOn` = `takenOn`, et le
  relevé ne la contient pas).
- Si D est après le dernier relevé, aucun relevé ne change, puisque la ligne existait encore au
  dernier relevé. La prochaine mise à jour ne la demande plus.
  - Mon argent la garde, mais une ligne qui suivait un cours y revient au prix du relevé : les
    lignes fermées ne suivent plus de cours (`followedLines`, `titleRows`). Elle quitte aussi
    « Tes titres ».
  - Sa fiche dit « Fermé le 12 novembre » et propose « Ce n'était pas fermé », qui retire
    simplement la date de fermeture. Rien d'autre ne s'y corrige.
- Si D est le jour du dernier relevé ou avant, la ligne est retirée des relevés pris depuis D, et
  Mon argent baisse d'autant. C'est le cas d'une vente oubliée : l'argent de la vente est déjà
  compté ailleurs. Ce retrait ne se défait pas, donc il demande une confirmation, comme une
  suppression. Choix de l'assistant.
- D vient au plus tard aujourd'hui, et au plus tôt le lendemain du premier relevé qui contient la
  ligne. Plus tôt, la ligne n'aurait jamais eu de valeur : c'est une suppression, et la fiche
  propose alors « Supprimer, saisi par erreur ». Choix de l'assistant.
- Une maison vendue garde le lien avec son crédit, comme dans la mise à jour : `closeLine` ne fait
  que fermer la ligne, et `build.ts` garde les lignes fermées pour qu'un crédit puisse encore les
  désigner. Dans un relevé où la maison n'est plus, `computeSituation` fait déjà baisser l'argent
  disponible par le crédit. Les relevés d'avant, eux, restent tels quels. Choix de l'assistant.

### Supprimer (Nicolas : « elle disparaît partout »)

- Après une confirmation, la ligne est retirée de tous les relevés puis du profil. Le total d'avant
  change en conséquence. Une ligne retirée ne laisse ni sa valeur, ni son arrivée (`arrivals`).
- C'est une exception assumée à la règle du modèle selon laquelle une ligne n'est jamais retirée du
  profil (`lib/model/types.ts`). Cette règle protège les noms des anciens relevés, et ceux-ci ne
  tiennent plus la ligne.
- Un compte qui n'a plus de ligne est retiré, avec ses versements (`contributions`). Un crédit qui
  finançait la ligne en est détaché.
- Supprimer la seule ligne d'un relevé : la fiche le refuse et propose de la corriger. Un relevé ne
  reste jamais vide. Choix de l'assistant. Repartir de zéro n'existe aujourd'hui que dans « Mot de
  passe oublié » (`startOver`) ; rien n'est ajouté pour ça dans ce lot.

### Corriger un montant

- **Ce n'est pas un changement** : la correction ne crée ni « mis de côté » ni « gain des
  marchés ».
- **Une même saisie recopiée.** La mise à jour recopie une valeur qu'on ne touche pas : une faute
  du premier lancement se retrouve donc dans chaque relevé qui a suivi. La correction remplace le
  chiffre fautif dans le dernier relevé, et dans les relevés qui le précèdent sans interruption
  avec exactement le même chiffre, champ par champ (montant, parts, prix, prix moyen). Corriger le
  seul dernier relevé reporterait toute la faute dans l'écart entre l'avant-dernier et le dernier,
  et c'est ce faux gain que le lot veut éviter. Choix de l'assistant.
- La date à laquelle la valeur a été vue (`seenOn`) ne change pas : on corrige une saisie, on ne la
  relit pas.
- Les relevés plus anciens se corrigeront au lot 5, depuis « Tes relevés » (spec d'interface).
- Une ligne absente du dernier relevé (fermée) n'a pas de montant à corriger.
- Le prix d'une ligne qui suit un cours se corrige aussi : c'est celui du relevé, pas celui du jour.

### Ranger ailleurs

- **Une ligne seule dans son compte** (un livret, un crédit, une maison) se range dans une autre
  banque : le compte entier la suit. Pour un crédit dans « Chez toi », la fiche le propose d'emblée :
  « Un crédit se range dans la banque qui te l'a prêté : il se met alors à jour avec elle. » Et le
  bouton « Le ranger dans sa banque ».
- **Une ligne dans un compte à plusieurs lignes** (un fonds dans un PEA) se range dans un autre
  compte déjà saisi qui accepte ce genre de ligne (`lineKinds` du type de compte).
- **Les banques proposées** sont celles que la personne a déjà saisies. En ajouter une reste au
  lot 6 (« Mes banques », dans Réglages).
- **La catégorie** se choisit au même endroit quand le type de compte en permet plusieurs, comme au
  premier lancement. Choix de l'assistant.
- **Ranger ailleurs corrige le passé** : les anciens relevés sont relus avec la ligne à sa nouvelle
  place, puisque `splitChange` lit le profil d'aujourd'hui.
- **Où un compte peut aller** suit ce que le premier lancement propose depuis le lot 3 bis.
  « Chez toi » n'offre que la maison, l'or et la crypto (`HOME_TYPES` de `TypePicker`), et plus
  de crédit (`LEGACY_OUTSIDE_IDS`). Choix de l'assistant :
  - une maison reste dans « Chez toi » ;
  - un crédit va seulement dans une banque ;
  - l'or et la crypto vont dans « Chez toi » ou dans une banque ;
  - les autres comptes vont d'une banque à une autre, l'établissement « Épargne salariale »
    compris.

### Pendant une mise à jour, et quand les données ne se lisent pas

- **Pendant une mise à jour en cours**, la fiche se lit sans se modifier. Elle propose « Reprendre la
  mise à jour ». C'est la règle de « Tes titres » (`saveTitleChange` renvoie `update-running`).
- **Une donnée illisible** (profil, relevé ou brouillon) : rien ne s'écrit, et la fiche le dit.
- **Chaque écriture relit juste avant** le profil, les relevés et le brouillon, puis applique la
  correction à ce qu'elle a relu, comme `saveTitleChange`.
- **Une coupure au milieu** ne doit jamais laisser une ligne qu'on ne peut plus rouvrir. L'ordre
  des écritures est choisi pour ça. Choix de l'assistant :
  - **Fermer** : le profil d'abord (la date de fermeture), puis les relevés, du plus ancien au
    plus récent, le dernier en dernier. Après une coupure, la ligne est fermée le jour D, mais le
    dernier relevé, pris ce jour-là ou après, la contient encore. La mise à jour ne produit jamais
    cet état : la ligne qu'elle ferme n'est pas dans le relevé qu'elle enregistre, et ce relevé
    est le dernier. C'est donc forcément une fermeture interrompue. La ligne reste visible, et sa
    fiche propose de terminer.
  - **Supprimer** : d'abord fermer la ligne à la date de son premier relevé, ce qui revient au cas
    précédent si une coupure survient. Ensuite, la retirer des relevés, puis du profil. Une coupure
    entre les deux dernières étapes laisse une ligne fermée qu'aucun relevé ne tient : elle est
    invisible et sans effet.
  - **Corriger un montant sur plusieurs relevés** : chaque relevé réécrit est juste à lui seul.
    Une coupure laisse la correction à moitié faite, et la refaire la termine.

## Contraintes

- **Rien de nouveau ne part en clair** : le profil et les relevés restent des documents scellés.
- Pas de migration ni de nouvelle table. Le free tier suffit.
- **Une réponse qu'on ne peut pas donner se dit** : pas de « 0 € » pour un montant inconnu.
- Les jetons du design et `scripts/check-design.sh`, des cibles de `min-h-11`, une apparence
  sombre seulement.

## Hors du lot

- Renommer un compte entier (un PEA, une assurance-vie), ajouter ou retirer une banque : lot 6,
  Réglages.
- Corriger un relevé ancien, saisir un relevé à une date passée : lot 5.
- Le nom et l'année d'un compte à plusieurs lignes, notés dans les écarts du lot 3 : le nom va au
  lot 6. L'année se corrige depuis la fiche de n'importe laquelle de ses lignes.
- Aucun moyen de repartir de zéro une fois connecté : lot 6.

## Laissé à la construction

- L'ordre exact des rangées selon le genre de ligne, et les mots des corrections qui ne figurent
  pas sur la planche.
- L'adresse de la fiche, par exemple `/ligne/[id]`.
- La façon de montrer une correction réussie.
- Le choix du jour dans « Fermé ou tout vendu », avec aujourd'hui proposé d'avance.
