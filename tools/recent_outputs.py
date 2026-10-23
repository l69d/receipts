#!/usr/bin/env python3
"""Work outputs you opened lately, from Chrome's own history - the links Claude Code attaches to your Receipts.

    <python> -I tools/recent_outputs.py                 # last 14 days, every Chrome profile
    <python> -I tools/recent_outputs.py --days 3 --json
    <python> -I tools/recent_outputs.py --self-test

Chrome already records every visit, with the page title, in <profile>/History (SQLite). This copies that file (Chrome
keeps it locked), reads it read-only, and keeps ONLY work outputs: Google Sheets / Slides / Docs, deployed Apps Script
web apps (/exec), Looker Studio reports, RowZero workbooks, Drive folders. Every other URL is dropped before anything is
printed - personal browsing never leaves the file. One line per output (the same sheet on several tabs is one output),
latest visit first, with its title as the label ("Q3 sales - Google Sheets" -> "Q3 sales").
Nothing is stored or sent anywhere.
"""
import argparse
import json
import re
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# macOS, then Linux; --chrome-dir for anything else (Chromium, Brave, Edge keep the same History file)
CHROME = next((p for p in [Path.home() / "Library/Application Support/Google/Chrome", Path.home() / ".config/google-chrome"] if p.exists()),
              Path.home() / "Library/Application Support/Google/Chrome")
EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)  # Chrome's timestamps: microseconds since 1601
# (type, pattern whose first group is the output's id, canonical url) - the same types as Model.html LINK_TYPES
KINDS = [
    ("Sheet", r"https://docs\.google\.com/spreadsheets/(?:u/\d+/)?d/([\w-]{20,})", "https://docs.google.com/spreadsheets/d/{}/edit"),
    ("Slides", r"https://docs\.google\.com/presentation/(?:u/\d+/)?d/([\w-]{20,})", "https://docs.google.com/presentation/d/{}/edit"),
    ("Doc", r"https://docs\.google\.com/document/(?:u/\d+/)?d/([\w-]{20,})", "https://docs.google.com/document/d/{}/edit"),
    ("Web app", r"https://script\.google\.com/(a/macros/[\w.]+|macros)/s/([\w-]{20,})/exec", None),
    ("Looker Studio", r"https://(?:lookerstudio|datastudio)\.google\.com/(?:u/\d+/)?reporting/([\w-]{20,})", "https://lookerstudio.google.com/reporting/{}"),
    ("RowZero", r"https://rowzero\.com/workbook/(\w{10,})", "https://rowzero.com/workbook/{}"),
    ("Drive folder", r"https://drive\.google\.com/drive/(?:u/\d+/)?folders/([\w-]{20,})", "https://drive.google.com/drive/folders/{}"),
]
SUFFIX = re.compile(r"\s+-\s+(Google (Sheets|Slides|Docs|Drive)|Looker Studio|Row Zero|RowZero)\s*$", re.I)


def classify(url):
    """A work-output URL -> (type, key, canonical url); anything else -> None."""
    for kind, pat, canon in KINDS:
        m = re.match(pat, url)
        if m:
            if kind == "Web app":  # keep the domain part: /a/macros/<your-domain>/s/<id>/exec is not /macros/s/<id>/exec
                return kind, m.group(2), f"https://script.google.com/{m.group(1)}/s/{m.group(2)}/exec"
            return kind, m.group(1), canon.format(m.group(1))
    return None


def label(title, kind):
    """The page title without Google's suffix; the type when the title is an address (a web app's redirect page) or blank."""
    t = SUFFIX.sub("", (title or "").strip())
    return kind if not t or re.match(r"^[\w.-]+\.(com|google\.com)/", t) else t


def read(history, since_us):
    """[(url, title, visit_count, last_visit_us, first_visit_us)] visited since since_us, from a copy of one History file.
    first_visit_us: the earliest visit Chrome still holds since since_us (it keeps about 90 days of visits)."""
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "History"
        shutil.copy2(history, copy)
        con = sqlite3.connect(f"file:{copy}?mode=ro&immutable=1", uri=True)
        try:
            return con.execute("SELECT u.url, u.title, u.visit_count, u.last_visit_time, COALESCE(MIN(v.visit_time), u.last_visit_time) "
                               "FROM urls u LEFT JOIN visits v ON v.url = u.id AND v.visit_time >= ? "
                               "WHERE u.last_visit_time >= ? AND u.hidden = 0 GROUP BY u.id", (since_us, since_us)).fetchall()
        finally:
            con.close()


def outputs(rows_by_profile):
    """{profile: rows} -> one dict per output, latest visit first."""
    best = {}
    for profile, rows in rows_by_profile.items():
        for url, title, visits, last, first in rows:
            c = classify(url)
            if not c:
                continue
            kind, key, canon = c
            o = best.setdefault((kind, key), {"type": kind, "url": canon, "label": None, "visits": 0, "last_us": 0, "first_us": first, "profiles": set()})
            o["visits"] += visits
            o["first_us"] = min(o["first_us"], first)
            o["profiles"].add(profile)
            # the latest visit's title is the current name - unless it is a redirect address and a real name is known
            if last >= o["last_us"]:
                name = label(title, kind)
                o["last_us"], o["label"] = last, name if name != kind or not o["label"] else o["label"]
            elif o["label"] == kind:
                o["label"] = label(title, kind)
    # "Page Not Found": a file since deleted, or no longer shared with you
    out = sorted((o for o in best.values() if o["label"] != "Page Not Found"), key=lambda o: -o["last_us"])
    when = lambda us: (EPOCH + timedelta(microseconds=us)).astimezone().strftime("%Y-%m-%d %H:%M")
    for o in out:
        o["last"], o["first"] = when(o.pop("last_us")), when(o.pop("first_us"))
        o["profiles"] = sorted(o["profiles"])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--chrome-dir", type=Path, default=CHROME, help="the browser's user-data folder (holds Default/, Profile 1/ ...)")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    since = int((datetime.now(timezone.utc) - timedelta(days=a.days) - EPOCH).total_seconds() * 1e6)
    rows = {p.parent.name: read(p, since) for p in sorted(a.chrome_dir.glob("*/History")) if p.parent.name == "Default" or p.parent.name.startswith("Profile ")}
    out = outputs(rows)
    if a.json:
        print(json.dumps(out, indent=1, ensure_ascii=False))
        return
    for o in out:
        print(f"{o['last']}  {o['type']:<13} {o['label'][:70]:<70}  {o['url']}")
    n = {k: sum(1 for o in out if o["type"] == k) for k, _, _ in KINDS}
    print(f"{len(out)} outputs opened in the last {a.days} days (" + ", ".join(f"{k}: {v}" for k, v in n.items() if v) + ")", file=sys.stderr)


def self_test():
    """A tiny History file: only work outputs come out, one per file, newest title, latest first."""
    with tempfile.TemporaryDirectory() as tmp:
        h = Path(tmp) / "History"
        con = sqlite3.connect(h)
        con.execute("CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_time INTEGER, hidden INTEGER)")
        con.execute("CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER)")
        t = lambda d: int((datetime(2026, 10, d, tzinfo=timezone.utc) - EPOCH).total_seconds() * 1e6)
        con.executemany("INSERT INTO visits (url, visit_time) VALUES (?, ?)", [(2, t(12)), (2, t(20)), (1, t(10))])  # the sheet: first 10 Oct
        sheet = "1DEMOdemoDEMOdemoDEMOdemoDEMOdemo0000000001"
        con.executemany("INSERT INTO urls (url, title, visit_count, last_visit_time, hidden) VALUES (?,?,?,?,0)", [
            (f"https://docs.google.com/spreadsheets/d/{sheet}/edit?gid=1", "Q3 sales (old) - Google Sheets", 2, t(10)),
            (f"https://docs.google.com/spreadsheets/u/1/d/{sheet}/edit?gid=9", "Q3 sales by region - Google Sheets", 3, t(20)),
            ("https://script.google.com/a/macros/example.com/s/AKfycbDEMOdemoDEMOdemoDEMO01/exec", "Weekly Report", 4, t(22)),
            ("https://script.google.com/home/projects/abc", "Apps Script", 9, t(22)),  # the editor, not an output
            ("https://www.youtube.com/watch?v=x", "a video", 5, t(23)),  # personal: dropped
            ("https://docs.google.com/spreadsheets/u/0/", "Google Sheets home", 7, t(23)),  # no file: dropped
            ("https://lookerstudio.google.com/reporting/00000000-demo-4000-8000-000000000001/page/p1", "Waterfall - Looker Studio", 1, t(15)),
            # the same web app reached through Google's redirect page later: keeps its real name
            ("https://script.google.com/a/macros/example.com/s/AKfycbDEMOdemoDEMOdemoDEMO01/exec?x=1", "script.googleusercontent.com/a/macros/example.com/echo?k=1", 1, t(23)),
            ("https://docs.google.com/spreadsheets/d/1DEMOdemoDEMOdemoDEMOdemoDEMOdemo0000000002/edit", "Page Not Found", 1, t(21)),  # gone: dropped
        ])
        con.commit()
        con.close()
        out = outputs({"Profile 1": read(h, t(1))})
    assert [o["type"] for o in out] == ["Web app", "Sheet", "Looker Studio"], out
    assert out[1]["label"] == "Q3 sales by region" and out[1]["visits"] == 5, out[1]
    assert out[1]["url"] == f"https://docs.google.com/spreadsheets/d/{sheet}/edit", out[1]
    assert out[0]["url"].startswith("https://script.google.com/a/macros/example.com/s/") and out[2]["label"] == "Waterfall"
    assert out[0]["label"] == "Weekly Report" and out[0]["visits"] == 5, out[0]
    assert out[1]["first"].startswith("2026-10-10") and out[1]["last"].startswith("2026-10-20"), out[1]  # first visit across both URLs of the sheet
    assert not any("youtube" in o["url"] or o["url"].endswith("/u/0/") or o["label"] == "Page Not Found" for o in out)
    print("self-test ok: 3 outputs from 9 visits; personal, non-file and gone pages dropped; redirect titles ignored")


if __name__ == "__main__":
    main()
