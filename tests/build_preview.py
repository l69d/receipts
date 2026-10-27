#!/usr/bin/env python3
"""Offline preview + expected numbers for Receipts.

    npm test                     # builds this, then runs every suite

Inputs
  tests/demo.json          a fictional analyst's 3 months (Alex Rivera at Acme) - the sheet as it looks in use.
  ../apps-script/Inbox.gs  what Claude Code has queued; the open appends it under the log.
Outputs
  tests/preview.html     the whole app as one file: demo.json as the spreadsheet behind fake_book.js, the REAL Code.gs in
                         the page, google.script.run shimmed. "Today" is pinned to AS_OF.
  docs/index.html        the same page, published as the live demo (GitHub Pages).
  tests/expected.json    the numbers worked out here in pandas from demo.json - a second, independent calculation the
                         suites hold Model.html to.
"""
import json
import re
import subprocess
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
APP = HERE.parent / "apps-script"
DOCS = HERE.parent / "docs"
AS_OF = "2026-10-23"
USER = "alex.rivera@acme.example"
OPEN = {"In Progress", "Not yet Started"}
DEMO = json.loads((HERE / "demo.json").read_text())


def inbox():
    """Inbox.gs's INBOX rows ([id, date, ...]) and LINKS patches ([id, date, item, notes start, link text]) - it is JS, so node reads it."""
    js = (APP / "Inbox.gs").read_text() + "\nprocess.stdout.write(JSON.stringify([INBOX, LINKS]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


def patch_links(log, links):
    """LINKS onto the log rows, as written independently of Code.gs: first row with that date and item whose notes start so;
    filled when its link is empty or every URL it has is in the new text."""
    log = [list(r) for r in log]
    for _, day, item, start, text in links:
        hit = next((r for r in log if r[0] == day and r[1] == item and r[6].startswith(start)), None)
        assert hit is not None, f"LINKS row matches nothing: {day} {item}"
        if all(u in text for u in URL.findall(hit[8])):
            hit[8] = text
    return log


URL = re.compile(r"https?://[^\s|]+")
TYPES = [("docs.google.com/spreadsheets", "Sheet"), ("docs.google.com/presentation", "Slides"), ("docs.google.com/document", "Doc"),
         ("script.google.com", "Web app"), ("lookerstudio.google.com", "Looker Studio"), ("datastudio.google.com", "Looker Studio"),
         ("rowzero.com", "RowZero"), ("github.com", "GitHub"), ("drive.google.com", "Drive")]


def outputs(df):
    """Projects with at least one link: distinct URLs per project, and how many of each type."""
    per, types = {}, {}
    for _, r in df.iterrows():
        for u in URL.findall(r["link"]):
            u = u.rstrip("),.;")
            per.setdefault(r["project"], set()).add(u)
    for urls in per.values():
        for u in urls:
            t = next((name for frag, name in TYPES if frag in u), u.split("/")[2].removeprefix("www."))
            types[t] = types.get(t, 0) + 1
    return {"projects": len(per), "links": sum(len(v) for v in per.values()), "by_type": types,
            "per_project": {p: len(v) for p, v in per.items()}}


def monday(d):
    return d - timedelta(days=d.weekday())


def expected(log, ideas, streams):
    df = pd.DataFrame(log, columns=["date", "item", "project", "stream", "kind", "status", "notes", "impact", "link", "who"])
    df["row"] = range(2, len(df) + 2)  # the sheet row each entry sits on
    df["project"] = df["project"].where(df["project"] != "", df["item"])
    df["d"] = pd.to_datetime(df["date"]).dt.date
    df["week"] = df["d"].map(monday)
    a = date.fromisoformat(AS_OF)
    wk, last30 = monday(a), a - timedelta(days=29)
    done = df[df["status"] == "Completed"]
    between = lambda lo, hi: done[(done["d"] >= lo) & (done["d"] <= hi)]
    latest = df.sort_values(["d", "row"]).groupby("project").tail(1).set_index("project")
    first = df.groupby("project")["d"].min()
    open_ = latest[latest["status"].isin(OPEN)].sort_values(["d", "row"], ascending=False)
    parked = latest[latest["status"] == "Deprioritized"].sort_values(["d", "row"], ascending=False)
    weeks = [str(monday(df["d"].min()) + timedelta(weeks=i)) for i in range((wk - monday(df["d"].min())).days // 7 + 1)]
    month = between(last30, a)
    names = [s[0] for s in streams]
    weekly = {s: [int(((done["stream"] == s) & (done["week"].astype(str) == w)).sum()) for w in weeks] for s in names}
    totals = [sum(weekly[s][i] for s in names) for i in range(len(weeks))]
    ages = [(a - first[p]).days for p in open_.index]
    return {
        "as_of": AS_OF, "entries": len(df), "projects": int(df["project"].nunique()), "weeks": weeks,
        "first": str(df["d"].min()), "last": str(df["d"].max()),
        "tiles": [len(between(wk, a)), len(month), len(open_), int(df[(df["d"] >= last30) & (df["d"] <= a)]["project"].nunique())],
        "last_week": len(between(wk - timedelta(days=7), wk - timedelta(days=1))),
        "month_streams": int(month["stream"].nunique()),
        "oldest_open_days": max(ages) if ages else None,
        # biggest first; a tie keeps the streams tab's order
        "per_stream_30": dict(sorted(month.groupby("stream").size().items(), key=lambda kv: (-kv[1], names.index(kv[0])))),
        "weekly": weekly, "totals": totals,
        "open": [{"name": p, "status": r["status"], "first": str(first[p]), "last": str(r["d"]), "stream": r["stream"],
                  "n": int((df["project"] == p).sum())} for p, r in open_.iterrows()],
        "parked": list(parked.index),
        "recent": int(len(between(a - timedelta(days=6), a))),
        "impact": {"shipped": len(done), "with_impact": int((done["impact"] != "").sum()), "missing": int((done["impact"] == "").sum()),
                   "by_kind": {k: [int(len(g)), int(g["project"].nunique())] for k, g in done.groupby("kind")}},
        "streams": {s: {"entries": int((df["stream"] == s).sum()), "done": int((done["stream"] == s).sum()),
                        "done30": int((month["stream"] == s).sum()),
                        "open": int(((latest["stream"] == s) & latest["status"].isin(OPEN)).sum())} for s in names},
        "timeline_weeks": {str(w): int(n) for w, n in df.groupby("week").size().items()},
        "search_bulky": int(df.apply(lambda r: "bulky" in " ".join([r["item"], r["project"], r["notes"], r["impact"], r["who"], r["kind"]]).lower(), axis=1).sum()),
        "ideas": len(ideas), "streams_order": names,
        "outputs": outputs(df),
    }


def main():
    log, ideas, streams = DEMO["log"], DEMO["ideas"], DEMO["streams"]
    box, links = inbox()
    # the open appends the inbox under the log, in order, then fills the links
    full = patch_links(log + [r[1:] for r in box], links)
    X = expected(full, ideas, streams)
    X.update(demo_entries=len(log), inbox=len(box), config=dict(DEMO["config"]))
    (HERE / "expected.json").write_text(json.dumps(X, indent=1, default=str))

    # the sheet in use: every tab as the app made it, dates as date cells
    grids = {
        "log": [["date", "item", "project", "stream", "kind", "status", "notes", "impact", "link", "for"]] + [[{"$d": r[0]}] + r[1:] for r in log],
        "ideas": [["stream", "idea", "status"]] + ideas,
        "streams": [["stream", "about"]] + streams,
        "config": [["key", "value"]] + DEMO["config"],
    }
    html = (APP / "Index.html").read_text()
    for part in ("Model", "App"):
        html = html.replace("<?!= include('%s'); ?>" % part, (APP / (part + ".html")).read_text())
    badge = ('<div style="position:fixed;right:10px;bottom:10px;z-index:3000;background:#fff3cd;border:1px solid #e0b100;border-radius:8px;padding:4px 10px;'
             'font:12px system-ui">Demo · fictional data, placeholder links · today = ' + AS_OF + '</div>')
    y, m, d = (int(x) for x in AS_OF.split("-"))
    shim = badge + "<script>\nvar __GRIDS__ = " + json.dumps(grids) + ";\n" + \
        (HERE / "fake_book.js").read_text().replace("if (typeof module !== 'undefined')", "if (false)") + """
var __DATA__ = null;
var SERVER = (function () {
  var S = fakeServices(__GRIDS__, %s, [%s]);
  var SpreadsheetApp = S.SpreadsheetApp, Session = S.Session, LockService = S.LockService;
  var Utilities = { formatDate: fakeFormatDate };
%s
  CLOCK = new Date(%d, %d, %d, 18, 0);
  return { getData: getData, addTask: addTask };
})();
var google = { script: { run: (function runner(ok, fail) {
  var r = { withSuccessHandler: function (f) { return runner(f, fail); }, withFailureHandler: function (f) { return runner(ok, f); } };
  ['getData', 'addTask'].forEach(function (n) {
    r[n] = function () { var a = arguments; setTimeout(function () { try { var v = SERVER[n].apply(null, a); if (ok) ok(v); } catch (e) { if (fail) fail(e); } }, 30); };
  });
  return r;
})(null, null) } };
</script>""" % (json.dumps(USER), json.dumps(USER), "\n".join(p.read_text() for p in sorted(APP.glob("*.gs"))), y, m - 1, d)
    html = html.replace("<script>var __DATA__ = <?!= data ?>;</script>", shim)
    # doGet adds this with addMetaTag; without it a phone lays the page out 980px wide and the phone checks mean nothing
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">')
    assert "<?!=" not in html, "an include was not inlined"
    (HERE / "preview.html").write_text(html)
    DOCS.mkdir(exist_ok=True)
    (DOCS / "index.html").write_text(html)
    print(f"preview.html ({len(html) // 1024} KB), expected.json: {X['entries']} entries, {X['projects']} projects, {len(X['weeks'])} weeks, "
          f"{X['tiles'][2]} open, as of {AS_OF}")


if __name__ == "__main__":
    main()
