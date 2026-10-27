// Model.html on the payload a new sheet's first open returns, held to the numbers build_preview.py worked out in pandas.
const { X, ok, eq, section, done, loadModel, payload } = require("./lib");

const Model = loadModel();
const P = payload();
const M = Model.load(P);

section("load");
eq(M.entries.length, X.entries, "entries");
eq(M.threads.length, X.projects, "a thread per project");
eq(M.weeks, X.weeks, "weeks, Monday to Monday, first entry to today");
eq(M.streams.map((s) => s.name), X.streams_order, "streams in the streams tab's order");
ok(new Set(M.streams.map((s) => s.color)).size === M.streams.length, "a colour per stream");
ok(M.entries.every((e, i) => !i || M.entries[i - 1].date <= e.date), "entries sorted by date");
eq(Model.monday("2026-10-22"), "2026-10-19", "monday: Thursday 22 Oct -> 19 Oct");
eq(Model.monday("2026-10-19"), "2026-10-19", "monday: a Monday is its own");
eq(Model.monday("2026-10-25"), "2026-10-19", "monday: Sunday belongs to the week before");
eq(Model.weekLabel("2026-09-28"), { week: "W40", range: "28 Sep–4 Oct", start: "28 Sep" }, "week label across a month");
eq(Model.weekLabel("2026-10-19").range, "19–25 Oct", "week label within a month");

section("overview");
const O = Model.overview(M);
eq(O.tiles.map((t) => t.v), X.tiles, "tiles: shipped this week, last 30 days, open, projects touched");
ok(O.tiles[0].d === X.last_week + " last week", "this week vs last week");
ok(O.tiles[1].d === "across " + X.month_streams + " streams", "streams in the last 30 days");
ok(O.tiles[2].d === "oldest started " + X.oldest_open_days + " days ago", "oldest open work");
O.series.forEach((s) => eq(s.counts, X.weekly[s.stream], "weekly shipped: " + s.stream));
eq(O.totals, X.totals, "weekly totals");
eq(O.facts.perStream.map((s) => [s.stream, s.n]), Object.entries(X.per_stream_30), "last 30 days by stream, biggest first");
eq(O.recent.length, X.recent, "shipped in the last 7 days");
ok(O.recent.every((e, i) => !i || O.recent[i - 1].date >= e.date), "recent: newest first");

section("now");
const N = Model.now(M);
eq(N.open.map((t) => t.name), X.open.map((t) => t.name), "open threads, latest update first");
N.open.forEach((t, i) => {
  const x = X.open[i];
  eq([t.status, t.first, t.last, t.stream, t.n], [x.status, x.first, x.last, x.stream, x.n], "open: " + t.name);
});
eq(N.parked.map((t) => t.name), X.parked, "parked threads");
ok(N.open.every((t) => t.age >= t.quiet && t.quiet >= 0), "age >= time since the last update");

section("a thread's status is its latest entry's");
{
  const m = Model.load({ asOf: "2026-10-22", entries: [
    ["2026-10-10", "x", "T", "S", "Analysis", "In Progress", "", "", "", "", 2],
    ["2026-10-12", "x", "T", "S", "Analysis", "Completed", "", "", "", "", 3],
    ["2026-10-12", "y", "U", "S", "Analysis", "Completed", "", "", "", "", 4],
    ["2026-10-12", "y", "U", "S", "Analysis", "In Progress", "", "", "", "", 5],  // same day, later row: wins
    ["2026-10-11", "z", "", "S", "Analysis", "On hold", "", "", "", "", 6]  // blank project: the item; unknown status: open
  ], streams: [] });
  eq(m.threads.map((t) => [t.name, t.status, t.open]), [["T", "Completed", false], ["z", "On hold", true], ["U", "In Progress", true]], "latest wins; ties go to the later row");
  eq(Model.now(m).open.map((t) => t.name), ["U", "z"], "open: U (updated 12 Oct), then z");
  eq(m.streams.map((s) => s.name), ["S"], "a stream not in the streams tab still shows");
}

section("timeline");
const T = Model.timeline(M, {});
const sorted = (o) => Object.entries(o).sort();
eq(sorted(Object.fromEntries(T.map((g) => [g.week, g.entries.length]))), sorted(X.timeline_weeks), "entries per week");
ok(T.every((g, i) => !i || T[i - 1].week > g.week), "weeks newest first");
eq(Model.timeline(M, { q: "BULKY" }).reduce((t, g) => t + g.entries.length, 0), X.search_bulky, "search: any case, across item / project / notes / impact");
const ss = X.streams_order[0];
eq(Model.timeline(M, { stream: ss }).reduce((t, g) => t + g.entries.length, 0), X.streams[ss].entries, "stream filter");
ok(Model.timeline(M, { status: "Open" }).every((g) => g.entries.every((e) => Model.isOpen(e.status))), "status Open: in progress or not started");
ok(Model.timeline(M, { status: "Completed" }).every((g) => g.entries.every((e) => e.status === "Completed")), "status Completed");
eq(Model.timeline(M, { q: "zzz-nothing" }), [], "no match: nothing");

section("impact");
const I = Model.impact(M, {});
eq(I.shipped, X.impact.shipped, "shipped entries");
eq(I.lines.length, X.impact.with_impact, "impact lines");
eq(I.missing, X.impact.missing, "shipped without an impact line");
eq(sorted(Object.fromEntries(I.byKind.map((k) => [k.kind, [k.n, k.projects]]))), sorted(X.impact.by_kind), "by kind: entries and projects");
eq(I.byKind.map((k) => k.kind), Model.KINDS.filter((k) => k in X.impact.by_kind), "kinds in the fixed order");
ok(I.lines.every((e, i) => !i || I.lines[i - 1].date >= e.date), "impact lines newest first");
eq(Model.impact(M, { stream: ss }).shipped, X.streams[ss].done, "impact, one stream");

section("streams");
const S = Model.streams(M);
S.forEach((s) => eq([s.entries, s.done, s.done30, s.open], [X.streams[s.name].entries, X.streams[s.name].done, X.streams[s.name].done30, X.streams[s.name].open], "stream: " + s.name));
S.forEach((s) => eq(s.weekly, X.weekly[s.name], "stream weekly: " + s.name));
ok(S.every((s) => s.impacts.length <= 3), "at most three impact lines a card");

section("links");
{
  const L = Model.links("F-Now Coverage | https://docs.google.com/spreadsheets/d/abc/edit?gid=1\nhttps://rowzero.com/workbook/X1\n" +
    "Deck: https://docs.google.com/presentation/d/p/edit, Report - https://datastudio.google.com/u/0/reporting/r).\nhttps://docs.google.com/spreadsheets/d/abc/edit?gid=1");
  eq(L.map((l) => [l.type, l.label]), [["Sheet", "F-Now Coverage"], ["RowZero", "RowZero"], ["Slides", "Deck"], ["Looker Studio", "Report"]],
    "type from the address, label from the text before it, repeats dropped");
  eq(L[3].url, "https://datastudio.google.com/u/0/reporting/r", "trailing punctuation is not part of the URL");
  eq(Model.links("App | https://script.google.com/a/macros/example.com/s/X/exec")[0].type, "Web app", "a web app");
  eq(Model.links("https://example.com/a")[0].type, "example.com", "anything else: its host");
  eq(Model.links(""), [], "no links");
  eq(Model.links("see the sheet"), [], "text without a URL is not a link");
}

section("outputs");
{
  const O = Model.outputs(M, {});
  eq(O.cards.length, X.outputs.projects, "a card per project with a link");
  eq(O.links, X.outputs.links, "every distinct link");
  eq(Object.fromEntries(O.byType.map((t) => [t.type, t.n])), Object.fromEntries(Object.entries(X.outputs.by_type).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))), "links by type");
  O.cards.forEach((c) => eq(c.links.length, X.outputs.per_project[c.name], "links of " + c.name));
  ok(O.cards.every((c, i) => !i || O.cards[i - 1].last >= c.last), "latest work first");
  const ss = X.streams_order[0];
  ok(Model.outputs(M, { stream: ss }).cards.every((c) => c.stream === ss), "stream filter");
}

section("ideas");
eq(Model.ideas(M).length, X.ideas, "every idea");

section("work dated after today (a task planned ahead)");
{
  const m = Model.load({ asOf: "2026-10-27", entries: [
    ["2026-10-20", "a", "A", "S", "Analysis", "Completed", "", "", "", "", 2],
    ["2026-11-03", "b", "B", "S", "Analysis", "Completed", "", "", "", "", 3],  // next week, already marked done
    ["2026-11-04", "c", "C", "S", "Analysis", "Not yet Started", "", "", "", "", 4]
  ], streams: [["S", ""]] });
  eq(m.weeks, ["2026-10-19", "2026-10-26", "2026-11-02"], "the chart runs to the latest entry's week");
  eq(Model.overview(m).totals, [1, 0, 0], "overview: future work has not shipped yet");
  eq(Model.streams(m)[0].weekly, [1, 0, 0], "streams: the same rule");
  eq(Model.now(m).open.map((t) => t.name), ["C"], "a future task is open work");
}

section("notes");
{
  const raw = [["n3", "2026-10-27 10:00", "2026-10-27 10:00", "Third\nmore detail\nand more", "Open", ""],
    ["n2", "2026-10-26 09:00", "2026-10-26 12:00", "Second", "Made a task", "Second task"],
    ["n1", "2026-10-25 08:00", "2026-10-25 08:00", "First", "Archived", ""]];
  const N = Model.notes(raw);
  eq(N.list.map((n) => n.id), ["n3"], "Open by default");
  eq(N.counts, { Open: 1, "Made a task": 1, Archived: 1, All: 3 }, "how many in each");
  eq(Model.notes(raw, "All").list.map((n) => n.id), ["n3", "n2", "n1"], "All, newest first as sent");
  eq(Model.notes(raw, "Made a task").list[0].task, "Second task", "a note made into a task knows which");
  eq([N.list[0].title, N.list[0].rest], ["Third", "more detail\nand more"], "first line -> the task's name, the rest -> its notes");
  const long = Model.notes([["n", "", "", "x".repeat(320), "Open", ""]]).list[0];
  eq([long.title.length, long.rest.length], [300, 20], "a first line longer than a task name spills into the notes");
  eq(Model.notes(undefined).counts.All, 0, "no notes: nothing to show");
}

section("empty log");
{
  const m = Model.load({ asOf: "2026-10-22", entries: [], streams: [], ideas: [] });
  const o = Model.overview(m);
  eq(o.tiles.map((t) => t.v), [0, 0, 0, 0], "no entries: zero tiles");
  eq(o.tiles[2].d, "nothing open", "no entries: nothing open");
  eq(Model.timeline(m, {}), [], "no entries: empty timeline");
  eq(Model.streams(m), [], "no entries: no stream cards");
}

done("model");
