#!/usr/bin/env bash
# `npm run verify`: every check CLAUDE.md asks before a merge, on the version committed here, then a stamp that
# lets .claude/hooks/oseil-rules.py allow the merge of exactly this version. Nothing is pushed, nothing leaves
# this machine: the stamp lives in the git common dir, beside the branches, never in the repository.
#
# A branch that changes only documents (*.md, docs/, .github/, .claude/) gets the light checks: the benches
# of the hooks and the unit tests. Any other gets them all: unit tests, lint, types, and the journeys against
# a production build on the dev base (which also builds the site). A branch that touches supabase/ also gets
# the access rules on the local copy of the base.
set -uo pipefail

# A shell opened before a change of mise's templates keeps its old environment (on 14 November 2026, one still
# pointed at the real base): verify always runs under a fresh one.
if [ -z "${OSEIL_VERIFY_UNDER_MISE:-}" ] && command -v mise >/dev/null 2>&1; then
  OSEIL_VERIFY_UNDER_MISE=1 exec mise exec -- bash "$0" "$@"
fi
cd "$(git rev-parse --show-toplevel)" || exit 1

fail() { echo "✗ $*"; exit 1; }

[ -z "$(git status --porcelain)" ] || fail "Des changements ne sont pas enregistrés : verify vérifie une version enregistrée (un commit), pas un brouillon."
git fetch -q origin main || fail "main est introuvable sur GitHub (réseau ?)."
git merge-base --is-ancestor origin/main HEAD || fail "Cette branche n'est pas à jour de main : la remettre à jour d'abord (git merge origin/main), puis relancer."

sha=$(git rev-parse HEAD)
changed=$(git diff --name-only origin/main...HEAD)
[ -n "$changed" ] || fail "Rien à vérifier : cette branche ne change rien par rapport à main."

mode=light
while IFS= read -r file; do
  case "$file" in
    *.md | docs/* | .github/* | .claude/*) ;;
    *) mode=full ;;
  esac
done <<< "$changed"

logs=$(mktemp -d "${TMPDIR:-/tmp}/oseil-verify-XXXXXX")
step() {
  local label=$1; shift
  local log="$logs/$(echo "$label" | tr -c 'a-zA-Z0-9' '-').log"
  printf '→ %s… ' "$label"
  if "$@" >"$log" 2>&1; then
    echo "ok"
  else
    echo "ÉCHEC"
    tail -40 "$log"
    fail "$label (journal complet : $log)"
  fi
}

if [ "$mode" = full ]; then kind="complète"; else kind="légère (documents seulement)"; fi
echo "Version ${sha:0:7}, vérification $kind"
step "Banc du garde-fou" python3 .claude/hooks/test-guard-dangerous.py
step "Banc des règles d'Oseil" python3 .claude/hooks/test-oseil-rules.py
step "Tests" npm test

if [ "$mode" = full ]; then
  step "Contrôle du code" npm run lint
  step "Types" sh -c 'npx next typegen && npx tsc --noEmit'
  case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
    *"${DEV_SUPABASE_PROJECT_REF:-none}"*) ;;
    *) fail "Cette machine ne pointe pas sur la base de dev (mise n'est pas chargé ?) : les parcours ne doivent jamais tourner sur la vraie base." ;;
  esac
  if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Le port 3000 est pris par un autre serveur : attendre qu'il se libère, ne jamais l'arrêter."
  fi
  step "Parcours sur un build de production (base de dev)" npm run test:e2e:prod
fi

# A change to the database (a migration, its tests) also passes the access rules on the local copy.
if grep -q '^supabase/' <<< "$changed"; then
  step "Règles d'accès sur la copie locale (npm run db:start d'abord, Docker)" sh -c 'npm run db:reset && npm run test:rls'
fi

stamps="$(git rev-parse --path-format=absolute --git-common-dir)/oseil-verified"
mkdir -p "$stamps"
printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$mode" >"$stamps/$sha"
echo "✓ Version ${sha:0:7} vérifiée ($mode) : sa fusion est permise sur cette machine."
