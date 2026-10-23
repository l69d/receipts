#!/usr/bin/env bash
#
# Ship a release to the one link everybody already has.
#
# A web app's URL belongs to a deployment, not to the code: a new deployment mints a new URL, frozen on the build
# it was made for. This never makes one. It tests and pushes, cuts a version, repoints the SAME deployment at it -
# so the link never changes - and then every other deployment too, so an old link never serves an old build.
#
#   npm run release -- "v1.1 - what changed"
#
# The deployment id is read from .clasp.json (gitignored - it is the app's URL). See .clasp.json.example.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLASP="$ROOT/node_modules/.bin/clasp"
DESC="${1:-}"
[ -n "$DESC" ] || { echo 'Say what changed:  npm run release -- "v1.1 - what changed"' >&2; exit 2; }
DEPLOYMENT_ID="$(node -p "require('$ROOT/.clasp.json').deploymentId || ''")"
[ -n "$DEPLOYMENT_ID" ] || { echo 'No "deploymentId" in .clasp.json - see .clasp.json.example.' >&2; exit 2; }

# caffeinate: a laptop that sleeps mid-suite turns a short run into a long list of false failures.
caffeinate -i bash "$ROOT/tools/clasp-push.sh"

cd "$ROOT"
VERSION="$("$CLASP" create-version "$DESC" | grep -oE '[0-9]+$')"
"$CLASP" redeploy "$DEPLOYMENT_ID" -V "$VERSION" -d "$DESC"
OLD=0
for id in $("$CLASP" list-deployments | awk '$1 == "-" && $3 != "@HEAD" {print $2}'); do
  [ "$id" = "$DEPLOYMENT_ID" ] && continue
  "$CLASP" redeploy "$id" -V "$VERSION" -d "$DESC (old link, follows the live version)" >/dev/null
  OLD=$((OLD + 1))
done
echo "$OLD older link(s) repointed to version $VERSION as well."
echo
echo "Live as version $VERSION, on the same link as always:"
echo "  https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
