#!/usr/bin/env bash
#
# One-time setup: a new Google Sheet with the Receipts web app bound to it, deployed on a link that never changes.
#
#   npm run setup                         # a Google Workspace account (the app is open to your organisation)
#   ACCESS=ANYONE npm run setup           # a personal Google account (anyone with a Google account and the link)
#   TITLE="Receipts - Alex" npm run setup # name the sheet
#
# Needs: node, and `npx clasp login` done once (opens a browser to sign in to Google).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
CLASP="$ROOT/node_modules/.bin/clasp"
TITLE="${TITLE:-Receipts}"
ACCESS="${ACCESS:-DOMAIN}"

[ -f .clasp.json ] && { echo "Already set up (.clasp.json exists). Ship changes with: npm run release -- \"what changed\""; exit 0; }
[ -x "$CLASP" ] || npm install --no-audit --no-fund
[ -f "$HOME/.clasprc.json" ] || "$CLASP" login

# the web app's audience
node -e '
  const f = "apps-script/appsscript.json", m = JSON.parse(require("fs").readFileSync(f, "utf8"));
  m.webapp.access = process.argv[1];
  require("fs").writeFileSync(f, JSON.stringify(m, null, 2) + "\n");' "$ACCESS"

# `clasp create` replaces the manifest with Google's default (no web app, US time zone): keep ours and put it back
cp apps-script/appsscript.json "$ROOT/.appsscript.json.keep"
"$CLASP" create --type sheets --title "$TITLE" --rootDir apps-script
mv "$ROOT/.appsscript.json.keep" apps-script/appsscript.json

# .gs first, or a later `clasp pull` rewrites Code.gs as Code.js
node -e '
  const f = ".clasp.json", c = JSON.parse(require("fs").readFileSync(f, "utf8"));
  c.scriptExtensions = [".gs", ".js"]; c.htmlExtensions = [".html"];
  require("fs").writeFileSync(f, JSON.stringify(c, null, 2) + "\n");'

"$CLASP" push --force
VERSION="$("$CLASP" create-version "v1.0 - first setup" | grep -oE '[0-9]+$')"
DEPLOYMENT_ID="$("$CLASP" create-deployment -V "$VERSION" -d "Receipts" | grep -oE 'AKfyc[A-Za-z0-9_-]+' | head -1)"
[ -n "$DEPLOYMENT_ID" ] || { echo "Could not read the deployment id - run: npx clasp list-deployments" >&2; exit 1; }
node -e '
  const f = ".clasp.json", c = JSON.parse(require("fs").readFileSync(f, "utf8"));
  c.deploymentId = process.argv[1];
  require("fs").writeFileSync(f, JSON.stringify(c, null, 2) + "\n");' "$DEPLOYMENT_ID"

echo
echo "Your Receipts page (this link never changes; npm run release moves it to each new version):"
echo "  https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
echo
echo "Next: open it once and approve (it reads and writes only its own sheet). That first open sets up the sheet's tabs."
echo "Then fill the config tab (name, title, org) - and ask Claude Code to \"update my receipts\"."
