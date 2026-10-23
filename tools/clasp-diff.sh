#!/usr/bin/env bash
#
# What would a push change on the remote? Answered before it changes anything.
#
# `clasp push` overwrites the remote wholesale. Anyone editing in the Apps Script web editor leaves
# no trace in git, so the remote can hold work the repo has never seen - exactly the work a push
# destroys silently. Run this first if anyone might have edited there.
#
# Pulls into a throwaway directory rather than over apps-script/, so running this can never cost
# you local changes either.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLASP="$ROOT/node_modules/.bin/clasp"

if [ ! -f "$ROOT/.clasp.json" ]; then
  echo "No .clasp.json yet. Copy .clasp.json.example to .clasp.json and fill in the scriptId." >&2
  exit 2
fi
SCRIPT_ID="$(node -p "require('$ROOT/.clasp.json').scriptId")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Its own project file, rootDir "." - so the pull lands in the temp directory and nowhere near the
# working tree. Same extension settings, or every .gs would come back as .js and read as a change.
cat > "$TMP/.clasp.json" <<JSON
{ "scriptId": "$SCRIPT_ID", "rootDir": ".",
  "scriptExtensions": [".gs", ".js"], "htmlExtensions": [".html"] }
JSON

echo "Fetching the remote..."
( cd "$TMP" && "$CLASP" pull >/dev/null )
rm -f "$TMP/.clasp.json"

if diff -rq -x 'README.md' "$TMP" "$ROOT/apps-script" >/dev/null 2>&1; then
  echo "Remote is identical to apps-script/. A push would change nothing."
  exit 0
fi

echo
echo "=== summary ==="
# The per-file picture first, because the question people actually have is "does the remote hold
# anything the repo does not", and that answer drowns in a few thousand lines of unified diff.
diff -rq -x 'README.md' "$TMP" "$ROOT/apps-script" 2>/dev/null \
  | python3 -c 'import sys, re
tmp, local = sys.argv[1], sys.argv[2]
only_remote, only_local, differ = [], [], []
for line in sys.stdin:
    line = line.rstrip("\n")
    m = re.match(r"^Only in (.*): (.*)$", line)
    if m:
        (only_remote if m.group(1).startswith(tmp) else only_local).append(m.group(2))
    elif line.startswith("Files "):
        differ.append(line.split("/")[-1].split(" ")[0])
if only_remote:
    print("  ON THE REMOTE ONLY - a push would DELETE these:")
    for f in only_remote: print("    ! " + f)
if only_local:
    print("  In the repo only - a push would add these:")
    for f in only_local: print("    + " + f)
if differ:
    print("  Different in both:")
    for f in sorted(set(differ)): print("    ~ " + f)
if not (only_remote or only_local or differ):
    print("  identical")' "$TMP" "$ROOT/apps-script" || true

echo
echo "=== remote vs local (apps-script/) ==="
# Paths rewritten so the output reads as remote/local rather than as a path in /var/folders.
# Done in python rather than sed because a repo path can contain brackets ([v2]), and sed reads
# those brackets as a character range - it fails with "invalid character range" rather than
# matching anything. python replaces literal strings, with no pattern syntax to collide with.
diff -ru -x 'README.md' "$TMP" "$ROOT/apps-script" \
  | python3 -c 'import sys
tmp, local = sys.argv[1], sys.argv[2]
for line in sys.stdin:
    sys.stdout.write(line.replace(tmp, "remote").replace(local, "local"))' "$TMP" "$ROOT/apps-script" || true
echo
echo "Lines marked '-' are on the remote and would be lost; '+' is what the push would install."
