# Oseil

Le code du site oseil.fr, publié pour être lu et vérifié. Tous droits réservés : aucune licence
n’autorise sa réutilisation.

Une application web pour voir son patrimoine d'un coup d'œil. Tout ce qui décrit la situation
de quelqu'un est chiffré dans le navigateur avant de partir : le serveur ne stocke que des
paquets illisibles.

Deux documents de design expliquent les choix :

- `docs/superpowers/specs/2026-11-06-refonte-interface-design.md` : l'interface et les mots ;
- `docs/superpowers/specs/2026-11-06-refonte-fonctionnement-design.md` : le chiffrement et les données.

Lancer en local : `npm run dev`, puis ouvrir http://localhost:3000.
Vérifier : `npm test`, `npm run lint` et `npm run build`. Les règles du projet sont dans `CLAUDE.md`.
