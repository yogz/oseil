# Lot 6a — les Réglages

Le 9 novembre 2026. La spec d'interface (§7, planche 18) donne la liste en une ligne ; Nicolas a validé
le 9 novembre la proposition ci-dessous (« Ok »). Le lot 6 est coupé en trois (Nicolas) : 6a les
Réglages et le ménage, 6b la version ordinateur, 6c l'ouverture à d'autres (e-mails, confidentialité,
domaine).

## Ce que voit la personne

On arrive aux Réglages par un petit lien « Réglages » en haut de Mon argent (planche 18). Peu de
choses, toutes compréhensibles sans explication :

1. **Mes objectifs** : le même écran qu'au premier lancement (`/premier-lancement/objectifs`), avec
   leur répartition en petite barre dans la liste des réglages.
2. **Mes dépenses par mois** (ou mon salaire) : le même écran qu'au premier lancement
   (`/premier-lancement/depenses`). C'est ce qui alimente le coussin de Repères.
3. **Mes banques** :
   - ajouter une banque, avec la même recherche qu'au premier lancement ;
   - retirer une banque **vide** (aucun compte ouvert) ;
   - changer l'ordre de la mise à jour (monter / descendre).

   « Chez toi » et « Épargne salariale » gardent leur place, comme le veut `steps()`.
4. **Affichage** : chiffres en euros ou en % (`settings.display`), et un interrupteur « Masquer les
   montants » (`settings.hideAmounts`) qui remplace chaque montant par « ••• » partout, la grille
   restant visible.
5. **Mon compte** :
   - l'adresse e-mail, en lecture seule ;
   - **changer son mot de passe** : l'ancien, puis le nouveau deux fois. La clé de données est
     réemballée avec le nouveau mot de passe, et le secret de connexion de Supabase change avec lui.
     Face ID et la clé de secours continuent d'ouvrir le coffre ;
   - **refaire sa clé de secours** : le mot de passe, puis la nouvelle clé montrée une fois, avec la
     même confirmation qu'au premier lancement. L'ancienne clé ne sert plus ;
   - **mes clés Face ID** : une liste datée (« ajoutée le … »), avec « Retirer » sur chacune, qui
     retire la clé chez Supabase et sa serrure (`vault_passkeys`). C'est la sortie prévue aux clés
     orphelines (mémoire `apres-lot-3`) ;
   - se déconnecter.

## Le ménage

- La page `/importer` et `lib/import/` sont retirées : l'import a été fait le 8 novembre.
- Les routes de cours (`/api/quotes`, `/api/quotes/search`) gagnent un plafond global d'appels par
  minute vers Yahoo, côté serveur, sans savoir qui appelle (mémoire `apres-lot-3`, « Lot 6, avant
  d'ouvrir les inscriptions »).

## Contraintes

- **Rien de nouveau ne part en clair.** Changer de mot de passe envoie seulement ce qui part déjà
  à la création du coffre : le nouveau secret de connexion dérivé, les paramètres de dérivation et le
  paquet `{ iv, ciphertext }`. Retirer une clé Face ID envoie son identifiant, déjà connu du serveur.
- Les opérations sur le coffre sont faites pour qu'une coupure ne laisse jamais un coffre qu'aucun
  secret n'ouvre. Choix de l'assistant : le nouveau paquet du mot de passe est écrit avant le
  changement du secret de connexion. Si celui-ci échoue, l'ancien mot de passe ouvre encore la
  session, et le nouveau ouvre le coffre : l'écran le dit et propose de recommencer.
- Pas de migration : les règles d'accès permettent déjà de modifier `vaults` et de supprimer dans
  `vault_passkeys`.
- Toute écriture du profil (banques) relit juste avant et refuse pendant une mise à jour, comme les
  corrections du lot 4c.
- Le ton des specs, les jetons du design, `min-h-11`, et jamais de rouge pour un crédit.

## Hors du lot

- Changer d'adresse e-mail, supprimer son compte : plus tard.
- La version ordinateur (6b), les e-mails, la confidentialité et le domaine (6c).
