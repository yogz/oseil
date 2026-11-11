#!/usr/bin/env bash
#
# Garde-fou du design system : il refuse tout seul, sans relecteur.
#
# Huit règles dures de la spécification, vérifiées sur app/ et components/.
# app/globals.css est le seul fichier du code où une couleur a le droit d'être
# écrite en dur : c'est la couche des jetons, tout le reste ne connaît que leurs
# noms. Lancer avec : npm run check:design
#
set -uo pipefail
cd "$(dirname "$0")/.."

status=0
# Sans argument : le périmètre du projet. Avec arguments : les chemins donnés —
# c'est ce qui rend le garde-fou testable, un garde-fou que rien ne vérifie
# finissant toujours par ne plus rien refuser.
if [ "$#" -gt 0 ]; then
  CIBLES=("$@")
else
  # components/ does not exist until the first shared component is written.
  CIBLES=(app)
  [ -d components ] && CIBLES+=(components)
  CIBLES+=(--exclude=globals.css)
fi

# Affiche les lignes fautives (fichier:ligne:extrait) suivies de la règle brisée.
signaler() { # $1 = règle, $2 = résultats de grep
  [ -z "$2" ] && return 0
  echo "$2" | sed "s|^|  |; s|$|  →  $1|"
  status=1
}

# 1. Quatre rayons, pas un de plus : rounded-none, rounded-square (les carrés),
#    rounded-control (les champs), rounded-full (les boutons en pilule).
#    Un « rounded » nu vaut 4 px en Tailwind v4 : il est refusé.
rayons=$(grep -rInoE '\brounded(-[a-z0-9]+)*' "${CIBLES[@]}" | grep -vE ':rounded-(none|square|control|full)$')
signaler "rayon interdit (seuls rounded-none, rounded-square, rounded-control et rounded-full existent)" "$rayons"

# 2. Aucune variante dark: — le mode sombre est porté par les jetons, jamais par
#    une exception « en sombre » posée dans un composant.
sombre=$(grep -rInoE '\bdark:' "${CIBLES[@]}")
signaler "variante dark: interdite (le mode sombre vit dans les jetons)" "$sombre"

# 3. Aucune couleur écrite en dur, ni palette Tailwind : ni #hex, ni rgb()/hsl(),
#    ni neutral-500 / red-600…, ni bg-black / text-white.
couleurs=$(grep -rInoE '#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(|\b(slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b|\b(bg|text|border|fill|stroke|ring|outline|divide)-(black|white)\b' "${CIBLES[@]}")
signaler "couleur en dur (les couleurs ne vivent que dans app/globals.css)" "$couleurs"

# 4. Aucune ombre : l'identité repose sur des aplats mats.
#    `shadow-none` est explicitement autorisé : il affirme l'absence d'ombre.
ombres=$(grep -rInoE '\b(shadow|drop-shadow)(-[a-z0-9\[]+)*|\b(box|text)Shadow\b' "${CIBLES[@]}" | grep -vE ':(shadow-none|drop-shadow-none)$')
signaler "ombre interdite (seule shadow-none existe)" "$ombres"

# 5. Aucun dégradé, sauf dans les fichiers listés ici : le graphique d'évolution,
#    et la traînée d'étoile filante des billes de « Catégorie par catégorie »
#    (décidée par Nicolas le 11 novembre 2026). La liste se compare par
#    suffixe de chemin, ce qui garde la règle testable hors du dépôt.
DEGRADES_PERMIS=(components/evolution/EvolutionChart.tsx components/evolution/TraceComet.tsx)
degrades=$(grep -rInoE '\bbg-(gradient|linear|radial|conic)\b(-[a-z-]+)?|\b(linear|radial|conic)-gradient\(' "${CIBLES[@]}")
for permis in "${DEGRADES_PERMIS[@]}"; do
  degrades=$(echo "$degrades" | grep -vE "^[^:]*${permis//./\\.}:")
done
signaler "dégradé interdit (l'identité repose sur des aplats mats)" "$degrades"

# 6. Aucun titre en capitales : les titres et intertitres s'écrivent en minuscules à la française
#    (« Chez toi », pas « CHEZ TOI »), partout.
capitales=$(grep -rInoE '\b(uppercase|capitalize)\b' "${CIBLES[@]}")
signaler "capitales interdites (titres et intertitres en minuscules à la française)" "$capitales"

# 7. Aucun émoji : l'interface parle avec des mots et des formes, pas des pictogrammes.
CHEMINS=()
for cible in "${CIBLES[@]}"; do case "$cible" in --*) ;; *) CHEMINS+=("$cible") ;; esac; done
emojis=$(find "${CHEMINS[@]}" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.mdx' \) -print0 2>/dev/null \
  | xargs -0 perl -CSD -ne 'print "$ARGV:$.:$&\n" if /[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]/' 2>/dev/null)
signaler "émoji interdit (pas de pictogrammes dans l'interface)" "$emojis"

# 8. Une seule échelle de texte, cinq crans nommés dans app/globals.css : text-caption, text-body,
#    text-subtitle, text-title, text-hero. Ni taille arbitraire (text-[15px]) ni échelle Tailwind
#    (text-sm, text-5xl…).
tailles=$(grep -rInoE '(^|[^-[:alnum:]])([a-z]+:)*text-(\[[0-9.]+[a-z%]*\]|(xs|sm|base|lg|xl|[2-9]xl)([^-[:alnum:]]|$))' "${CIBLES[@]}")
signaler "taille de texte hors échelle (seuls text-caption, text-body, text-subtitle, text-title et text-hero existent)" "$tailles"

echo
if [ "$status" -ne 0 ]; then
  echo "✗ Design system enfreint : corrigez les lignes ci-dessus."
else
  echo "✓ Design system respecté : quatre rayons, aucun dark:, aucune couleur en dur, aucune ombre, aucun dégradé hors graphique, aucune capitale forcée, aucun émoji, une seule échelle de texte."
fi
exit "$status"
