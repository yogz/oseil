# Tout corriger depuis la fiche

Décidé par Nicolas le 11 novembre 2026, après trois avis (parcours, direction artistique, mots) et ses deux
choix sur la réécriture de l’historique. Ce document fait foi pour les six corrections.

## Pourquoi

Nicolas a quatre lignes de financement participatif (1 000 € chacune) rangées dans son PEA chez BoursoBank,
en Épargne sécurisée, « Je ne sais pas ». Pour les remettre d’aplomb il faut : un nouveau compte PEA-PME,
y déplacer les quatre lignes, les passer en Placements en bourse, les dire longues à récupérer. Aucune de ces
corrections n’était possible depuis la fiche (vérifié dans le code le 11 novembre 2026) :

- `placeChoices` (`lib/correct/profile-changes.ts`) ne déplace une ligne que vers un compte qui existe ;
- la catégorie ne se choisit que pour une ligne en parts ou d’un « Autre compte » ;
- « Récupérable en quelques semaines » s’écrit sur le compte entier (`setSlow`) ;
- le type d’un compte ne change nulle part ; une ligne ne passe jamais de montant à parts, ni d’une devise à une autre.

Un import par IA fait ce genre d’erreur à grande échelle : tout doit pouvoir se réparer sans tout ressaisir.

## Ce qui se voit

Le bloc « Corriger une erreur de saisie » se coupe en deux sous-titres :

- **Cette ligne** : Son nom, ses chiffres, **Catégorie** (le petit carré de sa couleur devant le mot), Zone ou
  Type (inchangés), **Où il est rangé** (une ligne d’un compte qui en a plusieurs), **Récupérable en quelques
  semaines**, **Compté en** (« parts · $ », « montant · € »), Son prix du jour, Le dollar à l’achat.
- **Son compte** (« PEA · BoursoBank ») : **Type du compte**, **Sa banque**.

Les rangées qui existaient gardent leurs mots. Pilules pour cinq choix au plus, rangées pour les types de
compte. Aucun nouveau pictogramme, `tabular-nums` sur les valeurs chiffrées, pas de rouge. Le bas de la fiche
ne passe plus sous la barre d’onglets.

## Les six corrections

1. **Catégorie**, pour toute ligne sauf un crédit et un logement : rangée → les cinq pilules → Enregistrer.
   Elle quitte le formulaire « Où il est rangé », qui ne fait plus que ranger. Une nouvelle catégorie efface le
   chapitre (Zone, Type), comme avant.
2. **Un nouveau compte** : dernière option de « Où il est rangé », « + Un nouveau compte » → la liste des types
   (celle de l’ajout d’un compte, réduite aux types qui acceptent cette ligne dans cette banque) → son nom, déjà
   rempli du nom du type → sous le nom, « Déplacer aussi », les autres lignes ouvertes du même compte et de la
   même catégorie, déjà cochées → Enregistrer. Une seule écriture. Le compte naît dans la banque de la ligne. Un
   type qui ne tient qu’une ligne (un livret) prend le nom de la ligne et n’emmène qu’elle. Un déplacement ne
   change jamais la catégorie en silence (règle de `fileLine`, gardée).
3. **Type du compte** : seulement les types qui acceptent toutes ses lignes (leur sorte, leur nombre) dans sa
   banque ; ni logement, ni crédit, dans un sens ou dans l’autre. Le nom suit le type s’il n’a jamais été changé
   (il est encore le nom du type). Ce que le nouveau type ne porte pas s’en va : l’année de déblocage hors
   épargne salariale, la marque « long à récupérer » d’un PER, le suivi du prix d’un type qui n’en a pas (l’or).
   Une ligne dont la catégorie suivait le type suit le nouveau type ; vers « Autre compte » (qui n’a pas de
   catégorie par défaut), elle garde la sienne, écrite.
4. **Récupérable en quelques semaines**, par ligne. La valeur du compte reste la valeur par défaut ; une ligne
   peut la contredire (`Line.slow`, `true` ou `false`, absent : celle du compte). Oui ou Non enregistre tout de
   suite, sans bouton. Quand le compte a d’autres lignes ouvertes, « Pour tout le compte » (une pilule à cocher
   avant Oui ou Non) l’écrit sur le compte et efface les choix des lignes. Le PER, l’épargne salariale, le
   logement et le crédit restent décidés par leur type. L’export écrit la valeur de chaque ligne ; l’import met
   le compte à « oui » quand toutes ses lignes le disent, sinon les lignes qui le disent.
5. **Sa banque** : déplace le compte entier, quel que soit son nombre de lignes (avant : seulement un compte
   d’une ligne, par « Où il est rangé »). Un crédit garde son invitation « Le ranger dans sa banque ».
6. **Compté en** (sorte et devise) réécrit l’historique de la ligne. Le formulaire dit la conséquence avant tout
   : « Tes 3 relevés suivront : 1 000 € deviennent 925 €. » (ou « Leur valeur ne change pas. »), un bouton
   « Recompter », pas de rouge. Ça se défait en recomptant dans l’autre sens.
   - **Une devise corrigée garde les nombres et change la devise** (choix 1 de Nicolas) : 1 000 € deviennent
     1 000 $. Un relevé qui n’a pas le taux de cette devise prend celui du jour, et la phrase le dit. Sans taux du
     jour, rien ne s’enregistre. Le taux d’achat d’une ligne passée en euros s’en va.
   - **Un montant passé en parts demande le nombre de parts d’aujourd’hui** (choix 2) : chaque relevé garde sa
     valeur, son prix d’une part en est tiré (valeur ÷ parts), sans prix moyen.
   - **Des parts passées en montant gardent leur valeur** (parts × prix) ; le prix moyen, le suivi du prix et le
     taux d’achat s’en vont.
   - Ni un crédit (en euros, un montant) ni un logement. La sorte ne se propose que si le type du compte accepte
     les deux.

## Comment c’est sûr

- Comme toute correction : relue juste avant l’écriture (`saveCorrection`), refusée pendant une mise à jour,
  jamais de relevé créé ni de date déplacée.
- Recompter écrit le dernier relevé d’abord, puis les plus anciens, puis le profil. Une coupure en chemin laisse
  des relevés qui ne s’accordent pas avec la ligne : la fiche le voit (« Son recompte n’est pas allé jusqu’au
  bout. ») et « Terminer » le finit dans le sens du dernier relevé, comme une fermeture coupée.
- Rien de nouveau ne part en clair : tout vit dans le profil et les relevés, chiffrés.

## Laissé au constructeur

Les mots qui ne sont pas cités ici, l’ordre exact des rangées, la forme des tests.
