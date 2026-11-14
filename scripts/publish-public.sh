#!/usr/bin/env bash
#
# Publishes the code of origin/main to the public copy, github.com/yogz/oseil (Nicolas, 11 November
# 2026): the code as it is, to be read and checked by anyone, without the history of this working
# repository (its authors, its addresses, its steps). No licence: all rights reserved.
#
# Run after every merge on main: npm run publish:public
# Each run adds one commit to the public copy, signed « Oseil »; it never rewrites what is there.
#
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLIC_URL=https://github.com/yogz/oseil.git
# Kept out of the public copy: the configuration of this machine's tools (the names of the password
# vaults it reads), and the working notes for the coding agents (CLAUDE.md, AGENTS.md). The design
# documents stay: they are what a reviewer reads.
EXCLUDED=(.env.tools.tmpl mise-supabase.tmpl mise-supabase-dev.tmpl mise-tokens.sh .claude CLAUDE.md AGENTS.md)

git fetch -q origin main
source_sha=$(git rev-parse --short origin/main)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

git clone -q "$PUBLIC_URL" "$work/public" 2>/dev/null
git -C "$work/public" rm -rq --ignore-unmatch .
git archive origin/main | tar -x -C "$work/public"
for path in "${EXCLUDED[@]}"; do rm -rf "${work:?}/public/$path"; done

git -C "$work/public" add -A
if git -C "$work/public" diff --cached --quiet; then
  echo "La copie publique est déjà à jour ($source_sha)."
  exit 0
fi
git -C "$work/public" -c user.name=Oseil -c user.email=noreply@oseil.fr commit -q -m "Oseil, version $source_sha"
git -C "$work/public" push -q origin HEAD:main
echo "Copie publique mise à jour : version $source_sha, https://github.com/yogz/oseil"
