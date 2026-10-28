// Code.gs on a fake spreadsheet: a new sheet is set up on the first open (and only a new one), the log is read by header
// name whatever the column order, dates and statuses typed by hand are read the way a person means them, what Claude
// Code queues in Inbox.gs lands once, and only the sheet's editors get its link.
const { X, DEMO, USER, LOG_HEAD, ok, eq, section, done, loadServer, demoGrids } = require("./lib");

section("first open of a new sheet");
{
  const s = loadServer();
  const P = JSON.parse(s.getData()), g = s.grids;
  eq(Object.keys(g).sort(), ["config", "ideas", "log", "streams"], "log, ideas, streams, config; the empty Sheet1 is gone");
  eq(g.log, [s.LOG_HEAD], "log: just its header");
  eq(g.ideas, [s.IDEA_HEAD], "ideas: just its header"); eq(g.streams, [s.STREAM_HEAD], "streams: just its header");
  eq(g.config, [s.CONFIG_HEAD].concat(s.CONFIG_DEFAULTS), "config: name, title, org, tagline to fill in");
  const dv = s.log.filter((c) => c[1] === "setDataValidation").map((c) => c[0].split("!")[0]);
  eq(dv.sort(), ["ideas", "ideas", "log", "log", "log"], "dropdowns: log kind / status / stream, ideas status / stream");
  ok(s.log.findIndex((c) => c[1] === "insertSheet" && c[2][0] === "streams") < s.log.findIndex((c) => c[1] === "requireValueInRange"),
    "the streams tab exists before a dropdown points at it");
  ok(s.log.some((c) => c[0] === "log" && c[1] === "setFrozenRows"), "log header frozen");
  eq(P.entries, [], "nothing logged yet");
  eq(P.config, { name: "Your name", title: "Your role", org: "Your team", tagline: s.CONFIG_DEFAULTS[3][1] }, "config read back");
  eq(P.warnings, [], "no warnings on a new sheet");
  const inserts = s.log.filter((c) => c[1] === "insertSheet").length;
  JSON.parse(s.getData());
  eq(s.log.filter((c) => c[1] === "insertSheet").length, inserts, "second open: nothing set up again");
}

section("the demo sheet");
{
  const s = loadServer(demoGrids());
  const P = JSON.parse(s.getData());
  eq(P.entries.length, X.entries, "every entry");
  eq(P.entries[0].slice(0, 2), DEMO.log[0].slice(0, 2), "first entry read back");
  eq(P.entries.map((e) => e[10]), Array.from({ length: X.entries }, (_, i) => i + 2), "each entry knows its sheet row");
  eq(P.asOf, X.as_of, "today");
  eq(P.config, X.config, "config");
  eq(P.streams.map((r) => r[0]), X.streams_order, "streams in the streams tab's order");
  eq(P.ideas.length, X.ideas, "ideas");
  eq(P.warnings, [], "no warnings");
  ok(P.canEdit && /docs\.google\.com/.test(P.sheet), "the owner gets the sheet link");
  eq(Object.keys(s.grids).sort(), ["config", "ideas", "log", "streams"], "a sheet that has a log is not set up again");
}

section("columns by name, in any order");
{
  const s = loadServer({ log: [["Status", "Item", "Extra", "Date", "STREAM", "project", "kind", "notes", "impact", "link", "for"],
    ["Completed", "B", "x", "2026-10-20", "Pricing", "", "Dashboard", "n", "i", "", ""]] });
  const e = JSON.parse(s.getData()).entries[0];
  eq(e.slice(0, 6), ["2026-10-20", "B", "", "Pricing", "Dashboard", "Completed"], "read by header, whatever the order or case");
  const P = JSON.parse(loadServer({ log: [["date", "item"], ["2026-10-23", "Something"]] }).getData());
  ok(P.warnings.some((w) => /no project, stream, kind, status, notes, impact, link, for column/.test(w)), "missing columns named");
}

section("dates typed by hand");
{
  const s = loadServer({ log: [LOG_HEAD] });
  const D = s.Date, rows = [[new D(2026, 9, 21), "a date cell"], [20261020, "yyyymmdd number"], ["2026-10-19", "ISO text"], ["18/10/2026", "dd/mm/yyyy"],
    ["2/3/2026", "d/m/yyyy - day first"], ["17.10.2026", "dd.mm.yyyy"], ["31/02/2026", "no such day"], ["tomorrow", "not a date"], ["", "blank date"]];
  rows.forEach((r) => s.grids.log.push([r[0], r[1], "", "", "", "Completed", "", "", "", ""]));
  const P = JSON.parse(s.getData());
  eq(P.entries.map((e) => e[0]), ["2026-10-21", "2026-10-20", "2026-10-19", "2026-10-18", "2026-03-02", "2026-10-17"], "six read, day first");
  ok(P.warnings.some((w) => /Skipped log rows 8, 9, 10:/.test(w)), "the three unreadable ones named by sheet row");
}

section("statuses typed by hand");
{
  const s = loadServer({ log: [LOG_HEAD] });
  ["done", "WIP", "in progress", "not yet started", "Deprioritised", "Blocked", ""].forEach((st, i) => s.grids.log.push(["2026-10-2" + i, "item " + i, "", "", "", st, "", "", "", ""]));
  s.grids.log.push(["2026-10-22", "", "", "", "", "Completed", "a spare row with no item", "", "", ""]);
  const P = JSON.parse(s.getData());
  eq(P.entries.map((e) => e[5]), ["Completed", "In Progress", "In Progress", "Not yet Started", "Deprioritized", "Blocked", ""], "aliases mapped; others kept");
  ok(P.warnings.some((w) => /Blocked, \(blank\) - counted as open/.test(w)), "unknown statuses flagged");
  eq(P.entries.length, 7, "a row without an item is skipped");
}

section("the shipped Inbox.gs");
{
  const s = loadServer({ log: [["date"]] });
  ok(Array.isArray(s.INBOX) && Array.isArray(s.LINKS), "INBOX and LINKS are defined");
  ok(s.INBOX.every((r) => r.length === s.LOG_HEAD.length + 1) && s.LINKS.every((l) => l.length === 5), "every queued row has its columns");
}

// what the skill queues, in the shape it writes
const ADD = [
  ["2026-10-24-01", "2026-10-24", "Pricing floor rollout", "Discount elasticity", "Pricing", "Feature", "Completed", "Floors live for 12 categories", "Discount cost down 2%", "Floor config | https://github.com/acme-demo/pricing/pull/42", ""],
  ["2026-10-24-02", "2026-10-24", "Churn deck", "Retention cohorts", "Growth", "Deck", "In Progress", "Draft for the Q4 review", "", "", "Leadership"]
];

section("inbox: rows Claude Code queues");
{
  const head = ["status", "date", "item", "project", "stream", "kind", "notes", "impact", "link", "for", "my col"];
  const s = loadServer({ log: [head, ["Completed", "2026-10-01", "old row", "", "", "", "", "", "", "", "x"]] });
  s.INBOX = ADD;
  const P = JSON.parse(s.getData()), g = s.grids;
  eq(g.log.length, 2 + ADD.length, "added under the last row");
  eq(g.log[2][head.indexOf("item")], ADD[0][2], "written under the log's own headers (item)");
  eq(g.log[2][head.indexOf("status")], ADD[0][6], "... (status, now the first column)");
  eq(g.log[2][head.indexOf("my col")], "", "... a column the inbox does not know stays blank");
  ok(g.log[2][head.indexOf("date")] instanceof s.Date, "... the date as a date cell");
  eq(P.entries[1][1], ADD[0][2], "read back like any row");
  eq(g["inbox-applied"].slice(1).map((r) => [r[0], r[2]]), [[ADD[0][0], 3], [ADD[1][0], 4]], "inbox-applied: each id and its log row");
  JSON.parse(s.getData());
  eq(g.log.length, 2 + ADD.length, "a second open adds nothing");
  g.log.splice(2, 1);  // deleted by hand
  JSON.parse(s.getData());
  eq(g.log.length, 1 + ADD.length, "a row deleted by hand is not added back");
  eq(g["inbox-applied"].length, 1 + ADD.length, "inbox-applied: one row per id, ever");
  eq(JSON.parse(JSON.stringify(s.applyInbox({ getSheetByName: () => null }))), { added: 0, linked: 0 }, "no log tab: nothing to add to");
}

section("inbox: links for rows already in the log");
{
  const L = [
    ["L1", "2026-10-01", "A", "notes a", "Sheet A | https://docs.google.com/spreadsheets/d/1DEMOaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/edit"],
    ["L2", "2026-10-02", "B", "notes b", "Sheet B | https://docs.google.com/spreadsheets/d/1DEMObbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/edit"],
    ["L3", "2026-10-03", "C", "notes c", "Deck C | https://docs.google.com/presentation/d/1DEMOcccccccccccccccccccccccccccccccccccc/edit"],
    ["L4", "2026-10-04", "D", "notes d", "App D | https://script.google.com/macros/s/AKfycbDEMOdddddddddddddd/exec"]
  ];
  const mine = "My own | https://example.com/x", bare = L[1][4].match(/https:\/\/\S+/)[0];
  const row = (l, link, notes) => [l[1], l[2], "", "", "", "Completed", notes || l[3] + " and more", "", link, ""];
  const s = loadServer({ log: [LOG_HEAD, row(L[0], ""), row(L[1], bare), row(L[2], mine), row(L[3], "", "notes that start differently")] });
  s.LINKS = L;
  JSON.parse(s.getData());
  const g = s.grids;
  eq(g.log[1][8], L[0][4], "an empty link cell is filled");
  eq(g.log[2][8], L[1][4], "a bare URL is replaced by the labelled text that includes it");
  eq(g.log[3][8], mine, "a link typed by hand is kept");
  eq(g.log[4][8], "", "a row whose notes start differently is not touched");
  const ids = g["inbox-applied"].slice(1).map((r) => r[0]);
  ok(["L1", "L2", "L3"].every((id) => ids.includes(id)), "filled and kept ids are recorded");
  ok(!ids.includes("L4"), "an id whose row was not found is left for a later open");
  g.log[4][6] = "notes d now";  // the row turns up
  g.log[1][8] = "";  // and a filled link is cleared by hand
  JSON.parse(s.getData());
  eq(g.log[4][8], L[3][4], "a later open fills the row once it is there");
  eq(g.log[1][8], "", "a link cleared by hand is not filled again");
}

section("addTask: the page's + New task form");
{
  const s = loadServer(demoGrids());
  const n0 = s.grids.log.length;
  const R = JSON.parse(s.addTask(JSON.stringify({ item: "  City expansion model  ", project: "City expansion", stream: "Growth", kind: "Analysis", notes: "first cut", "for": "Strategy team" })));
  const row = s.grids.log[n0];
  eq(s.grids.log.length, n0 + 1, "one row added under the last row");
  eq([row[1], row[2], row[3], row[4], row[5], row[6], row[9]], ["City expansion model", "City expansion", "Growth", "Analysis", "Not yet Started", "first cut", "Strategy team"],
    "trimmed fields under their headers; status defaults to Not yet Started");
  ok(row[0] instanceof s.Date && row[0].getDate() === +X.as_of.slice(8), "date defaults to today, as a date cell");
  eq(R.entry, [X.as_of, "City expansion model", "City expansion", "Growth", "Analysis", "Not yet Started", "first cut", "", "", "Strategy team", n0 + 1],
    "the reply is the row as the page reads the log, with its sheet row - not the whole payload");
  eq(R.note, null, "no note involved");
  ok(JSON.stringify(R).length < 400, "a small reply");
  eq(JSON.parse(s.getData()).entries.find((e) => e[1] === "City expansion model").slice(0, 10), R.entry.slice(0, 10), "what the reply says is what a reload reads");
  const at = (o) => { try { s.addTask(JSON.stringify(o)); return "saved"; } catch (e) { return e.message; } };
  ok(/name/.test(at({ item: "   " })), "a blank name is refused");
  ok(/date/.test(at({ item: "x", date: "31/02/2026" })), "a date that is not a day is refused");
  ok(/Status must be/.test(at({ item: "x", status: "Blocked" })), "an unknown status is refused");
  eq(at({ item: "x", status: "done", date: "2026-10-20" }), "saved", "statuses typed loosely still map (done -> Completed)");
  eq(s.grids.log[s.grids.log.length - 1][5], "Completed", "... written as Completed");
  at({ item: "=IMPORTXML(\"https://evil.example\")", notes: "+1 more", link: "@x" });
  const f = s.grids.log[s.grids.log.length - 1];
  eq([f[1], f[6], f[8]], ["'=IMPORTXML(\"https://evil.example\")", "'+1 more", "'@x"], "text starting = + - @ stays text, never a formula");
  at({ item: "long", notes: "n".repeat(5000) });
  eq(s.grids.log[s.grids.log.length - 1][6].length, 2000, "notes capped at 2,000 characters");
  const before = s.grids.log.length;
  const v = loadServer(s.grids, "someone.else@acme.example", [USER]);
  let refused = "";
  try { v.addTask(JSON.stringify({ item: "sneaky" })); } catch (e) { refused = e.message; }
  ok(/Only editors/.test(refused) && s.grids.log.length === before, "a viewer cannot add (and nothing is written)");
  const r = loadServer({ log: [["Status", "my col", "Item", "date"]] });
  r.addTask(JSON.stringify({ item: "B", status: "In Progress" }));
  eq([r.grids.log[1][0], r.grids.log[1][1], r.grids.log[1][2]], ["In Progress", "", "B"], "written under the log's own headers, whatever their order");
  const n = loadServer();
  n.addTask(JSON.stringify({ item: "First task" }));
  ok(n.grids.log && n.grids.log[1][1] === "First task" && n.grids.config, "a brand-new sheet is set up first, then the task goes in");
}

section("notes: the notepad");
{
  const s = loadServer(demoGrids());
  JSON.parse(s.getData());
  const notes = () => JSON.parse(s.getData()).notes;
  ok(!s.grids.notes, "no notes tab until the first note");
  const R = JSON.parse(s.saveNote(JSON.stringify({ text: "  Ask Sam about the churn deck\nneeds the Q3 cohorts  " })));
  eq(s.grids.notes[0], s.NOTE_HEAD, "the notes tab is made with its header");
  eq(Object.keys(R).sort(), ["created", "id", "updated"], "a new note's reply is only what the page cannot know: its id and stamps");
  ok(/^n/.test(R.id) && R.created === R.updated && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(R.created), "an id and a created / updated stamp");
  let N = notes();
  eq(N.length, 1, "a reload has it");
  const [id, created, updated, text, state, task] = N[0];
  eq([id, created, updated], [R.id, R.created, R.updated], "... with what the reply said");
  eq([text, state, task], ["Ask Sam about the churn deck\nneeds the Q3 cohorts", "Open", ""], "trimmed text, open, no task yet");
  const R2 = JSON.parse(s.saveNote(JSON.stringify({ text: "second note" })));
  N = notes();
  eq(N.map((n) => n[3]), ["second note", "Ask Sam about the churn deck\nneeds the Q3 cohorts"], "newest first");
  ok(R2.id !== id, "ids are unique, even within a minute");
  const E = JSON.parse(s.saveNote(JSON.stringify({ id, text: "Ask Sam about the churn deck (edited)" })));
  eq(Object.keys(E), ["updated"], "an edit's reply is just the new stamp");
  eq(notes().find((n) => n[0] === id)[3], "Ask Sam about the churn deck (edited)", "an edit replaces the text, by id");
  eq(s.grids.notes.length, 3, "... without adding a row");
  const at = (fn, o) => { try { s[fn](JSON.stringify(o)); return "saved"; } catch (e) { return e.message; } };
  ok(/empty/.test(at("saveNote", { text: "   " })), "an empty note is refused");
  ok(/no longer/.test(at("saveNote", { id: "n-gone", text: "x" })), "editing a note that is not there is refused");
  eq(Object.keys(JSON.parse(s.noteState(JSON.stringify({ id, state: "Archived" })))), ["updated"], "archive: a reply of just the stamp");
  eq(notes().find((n) => n[0] === id)[4], "Archived", "... and it is archived");
  s.noteState(JSON.stringify({ id, state: "Open" }));
  eq(notes().find((n) => n[0] === id)[4], "Open", "reopen");
  ok(/A note is/.test(at("noteState", { id, state: "Deleted" })), "an unknown state is refused");
  at("saveNote", { text: "=HYPERLINK(\"https://evil.example\")" });
  ok(s.grids.notes.some((r) => r[3] === "'=HYPERLINK(\"https://evil.example\")"), "a note starting = is stored as text");
  ok(notes().some((n) => n[3] === "=HYPERLINK(\"https://evil.example\")"), "... and reads back as typed");
  const n0 = s.grids.log.length;
  const T = JSON.parse(s.addTask(JSON.stringify({ item: "Churn deck", notes: "needs the Q3 cohorts", fromNote: id })));
  eq(s.grids.log.length, n0 + 1, "Make a task: the task goes into the log");
  eq(Object.keys(T.note), ["updated"], "... and the reply carries the note's new stamp");
  eq(notes().find((n) => n[0] === id).slice(4), ["Made a task", "Churn deck"], "... and the note says which task it became, in the same save");
  const v = loadServer(s.grids, "someone.else@acme.example", [USER]);
  const PV = JSON.parse(v.getData());
  eq(PV.notes, [], "a viewer is never sent the notes");
  let refused = "";
  try { v.saveNote(JSON.stringify({ text: "sneaky" })); } catch (e) { refused = e.message; }
  ok(/Only editors/.test(refused), "a viewer cannot write a note");
  try { v.noteState(JSON.stringify({ id, state: "Archived" })); refused = ""; } catch (e) { refused = e.message; }
  ok(/Only editors/.test(refused), "... nor archive one");
}

section("notes: what you type is what you get back");
{
  const s = loadServer(demoGrids());
  JSON.parse(s.getData());
  const odd = ["27/10", "1e3", "007", "2026-10-27", "=SUM(1,1)", "+5 to the plan", "-3 stores", "@Sam", "'quoted'", "plain words"];
  odd.forEach((t) => s.saveNote(JSON.stringify({ text: t })));
  const back = JSON.parse(s.getData()).notes.map((n) => n[3]).reverse();
  eq(back, odd, "dates, numbers, formulas and quotes come back exactly as typed");
  ok(s.grids.notes.slice(1).every((r) => String(r[3])[0] === "'"), "every note is stored with Sheets' text mark, so nothing is ever turned into a date, number or formula");
  const id = JSON.parse(s.getData()).notes[0][0];
  s.saveNote(JSON.stringify({ id, text: "27/10 again" }));
  eq(JSON.parse(s.getData()).notes[0][3], "27/10 again", "an edit is stored the same way");
}

section("only editors get the sheet");
{
  const P = JSON.parse(loadServer(demoGrids(), "someone.else@acme.example", [USER]).getData());
  ok(!P.canEdit && P.sheet === null, "a viewer: no edit, no sheet link");
  eq(P.entries.length, X.entries, "a viewer still sees everything");
  ok(!JSON.parse(loadServer(demoGrids(), "", [USER]).getData()).canEdit, "no email (outside the domain): no edit");
  ok(JSON.parse(loadServer(demoGrids(), "Alex.Rivera@acme.example", [USER]).getData()).canEdit, "email case does not matter");
}

done("server");
