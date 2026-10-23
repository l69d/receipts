---
name: receipts
description: Log the work the user shipped into their Receipts page - find what they did since the last entry (git commits, merged PRs, Claude Code memory, documents and dashboards they opened), attach a link to every deliverable, and release. Use when the user says "update my receipts", "log my work", "update the work log", "add today's work", "what did I ship this week", or invokes /receipts.
---

# Receipts - log the work, with the receipts

Receipts is a Google Sheet plus a web app that shows what someone is working on, what they shipped, and what it changed,
with a link to every deliverable. You add entries through `apps-script/Inbox.gs`; the next time anyone opens the app, each
entry lands in the sheet exactly once. You never need sheet credentials.

Run from the root of the user's Receipts repo (the folder with `apps-script/` and `package.json`).

## 0. Guard the user's data

`Inbox.gs` holds the user's work log. Before writing to it, check the repo is not public:

```bash
gh repo view --json visibility -q .visibility 2>/dev/null || echo "no GitHub remote"
```

If it says `PUBLIC`, stop and tell the user: their log would be published. They should make the repo private (or keep it
local) first. Do not write to `Inbox.gs` in a public repo.

## 1. Find where the log stops

The newest date in `apps-script/Inbox.gs` is the last thing you logged. The user may also type rows into the sheet
directly - you cannot see those, so if the gap looks long or the user mentions other work, ask what they already logged.
If `Inbox.gs` is empty, ask how far back to go (default: 7 days).

## 2. Gather what they did since then

Use what exists; skip what does not. Do not invent work.

- **Commits:** for every git repo in the workspace, `git log --all --since=<date> --author="$(git config user.email)" --format='%ad %s' --date=short`.
  Repos inside the workspace that are their own git repos count too - find them with `find . -name .git -maxdepth 4`.
- **Merged PRs / closed issues:** `gh search prs --author=@me --merged ">=<date>" --json title,url,repository,closedAt` and the same for issues.
- **Claude Code memory and notes:** the user's memory files and any daily notes folders (e.g. `.remember/`, `notes/`,
  `HANDOFF.md` files) - they often say what shipped and what it changed.
- **Documents, dashboards and decks they opened:** `python3 tools/recent_outputs.py --days <N>` lists the Google Sheets /
  Slides / Docs, deployed Apps Script web apps, Looker Studio reports, RowZero workbooks and Drive folders opened in Chrome,
  with their real titles. It reads Chrome's own history locally and prints only those work URLs. Add `--json` for detail.

## 3. Write the entries

One row per meaningful piece of work - not one per commit. Group commits and documents into the piece of work they
belong to.

| column | what goes in it |
|---|---|
| id | `YYYY-MM-DD-NN`, today's date and a counter; never reuse one already in `Inbox.gs` |
| date | the day the work happened, `YYYY-MM-DD` |
| item | what was done, in a few words ("Churn drivers analysis", "Pricing floor rollout") |
| project | the larger piece of work it belongs to - entries with the same project form one thread; its status is the latest entry's |
| stream | one of the streams the user already uses (look at earlier rows); ask before inventing a new one |
| kind | Feature, Fix, Dashboard, Analysis, Pipeline, Doc, Deck or Review |
| status | Completed, In Progress, Not yet Started or Deprioritized |
| notes | one or two sentences on what was done |
| impact | what it changed - only from evidence (a number in a commit, a PR, a note, the user's words). Leave it blank otherwise. Never inflate. |
| link | the deliverables, one per line: `Label \| url` (no `\|` inside the label) |
| for | who asked for it or uses it, if known |

**Links are receipts, so they must be the user's own deliverables** - what someone would open to see the work: the
analysis sheet, the dashboard, the deck, the merged PR, the deployed app. Leave out inputs, other teams' reports,
references, working copies and tool back-ends. Seeing a document in the browser history does not mean the user made it:
match by name to the work you found, and ask the user about anything not clearly theirs.

To add links to an entry you logged earlier, add a `LINKS` row: `[id, date, item, how its notes start, "Label | url" lines]`
using that entry's exact date and item and the start of its notes. Include the links it already has - a link cell is only
filled when it is empty or when the new text contains every URL already in it, so nothing typed by hand is ever lost.

Append rows to `INBOX` / `LINKS` in `apps-script/Inbox.gs`. Keep the old rows: they are skipped once applied.

## 4. Ship it

```bash
npm test                                      # the suites must pass
npm run release -- "log: <what was added>"    # tests, push, new version on the same link
```

Then tell the user, in a short table, what you added (date, item, status, links) and that it appears in the sheet the
next time the link is opened. Mention anything you left out on purpose and anything you need them to confirm.
