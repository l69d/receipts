// A save must stay cheap. Every Sheets / Session / Lock / Cache call the server makes is counted, and the budgets below
// fail the suite if a note or task save ever goes back to rebuilding the whole page (it once cost 59-77 calls and sent
// back the whole page's data, and saving a note took seconds).
const { ok, eq, section, done, loadServer, demoGrids, USER } = require("./lib");

/** Wrap the services a server function calls; returns the counters. */
function counted(ctx) {
  const n = { calls: 0, by: {} };
  const wrap = (o, name) => new Proxy(o, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== "function") return v;
      return (...a) => {
        n.calls++; const key = name + "." + String(k); n.by[key] = (n.by[key] || 0) + 1;
        const r = v.apply(t, a);
        return r && typeof r === "object" && !Array.isArray(r) && !(r instanceof ctx.Date) ? wrap(r, String(k)) : r;
      };
    }
  });
  ["SpreadsheetApp", "Session", "LockService", "CacheService"].forEach((g) => { ctx[g] = wrap(ctx[g], g); });
  return n;
}
const run = (n, fn) => { n.calls = 0; n.by = {}; const reply = fn(); return { calls: n.calls, by: { ...n.by }, reply: String(reply) }; };

section("call budgets");
{
  const s = loadServer(demoGrids());
  JSON.parse(s.getData());
  const n = counted(s);
  const page = run(n, () => s.getData());
  ok(page.reply.length > 5000, "(the page load is the big one: " + page.calls + " calls, " + page.reply.length + " characters)");

  const first = run(n, () => s.saveNote(JSON.stringify({ text: "one" })));
  ok(first.calls <= 32, `the first note (makes the notes tab): ${first.calls} calls, budget 32`);
  const next = run(n, () => s.saveNote(JSON.stringify({ text: "two" })));
  ok(next.calls <= 16, `a new note: ${next.calls} calls, budget 16`);
  ok(next.reply.length < 120, `... a reply of ${next.reply.length} characters`);
  const id = JSON.parse(s.getData()).notes[0][0];
  const edit = run(n, () => s.saveNote(JSON.stringify({ id, text: "two, edited" })));
  ok(edit.calls <= 22, `an edit: ${edit.calls} calls, budget 22`);
  ok(edit.reply.length < 60, `... a reply of ${edit.reply.length} characters`);
  const arch = run(n, () => s.noteState(JSON.stringify({ id, state: "Archived" })));
  ok(arch.calls <= 22, `archive: ${arch.calls} calls, budget 22`);
  const task = run(n, () => s.addTask(JSON.stringify({ item: "x", fromNote: id })));
  ok(task.calls <= 34, `a task made from a note: ${task.calls} calls, budget 34`);
  ok(task.reply.length < 300, `... a reply of ${task.reply.length} characters`);
  ok([first, next, edit, arch, task].every((r) => !/entries|ideas|streams|warnings/.test(r.reply)), "no reply carries the page's data");
  ok(next.calls < page.calls / 2 && task.calls < page.calls, "a save is far cheaper than loading the page");
}

section("asking the sheet who its editors are (the slow call)");
{
  const s = loadServer();  // fresh: nothing has confirmed the editor yet
  const n = counted(s);
  const editors = () => run(n, () => s.saveNote(JSON.stringify({ text: "x" }))).by["getActiveSpreadsheet.getEditors"] || 0;
  eq([editors(), editors(), editors()], [1, 0, 0], "asked once; a confirmed editor is remembered for the next saves");
  const viewer = loadServer(s.grids, "someone.else@acme.example", [USER]);
  const nv = counted(viewer);
  const ask = () => { nv.calls = 0; nv.by = {}; try { viewer.saveNote(JSON.stringify({ text: "x" })); } catch (e) { /* refused */ } return nv.by["getActiveSpreadsheet.getEditors"] || 0; };
  eq([ask(), ask()], [1, 1], "a viewer is asked about every time - a refusal is never remembered");
  // a newly added editor works at once: the same sheet, the same user, now in the editors list
  const now = loadServer(s.grids, "someone.else@acme.example", [USER, "someone.else@acme.example"]);
  ok(JSON.parse(now.getData()).canEdit, "added as an editor: allowed on the very next call");
}

done("speed");
