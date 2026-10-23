#!/usr/bin/env bash
#
# Push to Apps Script, but run the test suite first.
#
#   npm run push                  test, then push
#   npm run push -- --no-test     skip the suite (say why in the commit)
#
# A push changes the @HEAD test link only. Viewers see a change once `npm run release` moves the live link.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLASP="$ROOT/node_modules/.bin/clasp"
RUN_TESTS=1
for arg in "$@"; do [ "$arg" = "--no-test" ] && RUN_TESTS=0; done

[ -f "$ROOT/.clasp.json" ] || { echo "No .clasp.json yet. Copy .clasp.json.example to .clasp.json and fill in the ids." >&2; exit 2; }

if [ "$RUN_TESTS" = "1" ]; then
  echo "=== Rebuilding the preview and running the suite ==="
  # The preview is generated from apps-script/: a stale one would test the previous edit and pass.
  if ! npm --prefix "$ROOT/tests" test; then
    echo >&2
    echo "Suite failed - nothing pushed. Fix it, or push deliberately with: npm run push -- --no-test" >&2
    exit 1
  fi
  echo
else
  echo "Skipping the suite (--no-test)."
fi

echo "=== Pushing to Apps Script ==="
( cd "$ROOT" && "$CLASP" push --force )
echo
echo "Pushed to @HEAD. The live link still serves the last release - ship with: npm run release -- \"vX.Y - what changed\""
