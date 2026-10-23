// Shared by every suite: expected.json (worked out in pandas by build_preview.py), the demo sheet (demo.json), the REAL
// Code.gs + Inbox.gs on fake_book.js, the REAL Model.html, and the check helpers. A suite calls done() last; it exits
// non-zero on failure.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { fakeServices, fakeFormatDate } = require("./fake_book");

const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const APP = path.join(ROOT, "apps-script");
const PREVIEW = path.join(HERE, "preview.html");
if (!fs.existsSync(PREVIEW)) { console.error("run: npm --prefix tests run build"); process.exit(2); }
const X = JSON.parse(fs.readFileSync(path.join(HERE, "expected.json"), "utf8"));
const DEMO = JSON.parse(fs.readFileSync(path.join(HERE, "demo.json"), "utf8"));
const USER = "alex.rivera@acme.example";
const LOG_HEAD = ["date", "item", "project", "stream", "kind", "status", "notes", "impact", "link", "for"];

let passed = 0;
const failures = [];
function ok(cond, msg) { if (cond) passed++; else { failures.push(msg); console.log("  FAIL " + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function section(name) { console.log(name); }
function done(name) {
  console.log(`${failures.length ? "FAILED" : "ok"} ${name}: ${passed}/${passed + failures.length} checks`);
  process.exit(failures.length ? 1 : 0);
}

/**
 * Code.gs + Inbox.gs with `grids` as the workbook ({tab: [[cell, ...]]}; a new spreadsheet is {Sheet1: []}); `user` is the
 * viewer, `editors` the sheet's editors; today pinned to the expected.json date. ctx.log: the recorded calls.
 */
function loadServer(grids = { Sheet1: [] }, user = USER, editors = [USER]) {
  const ctx = vm.createContext({});
  const CtxDate = vm.runInContext("Date", ctx);
  const S = fakeServices(grids, user, editors, CtxDate);
  Object.assign(ctx, S, { Utilities: { formatDate: fakeFormatDate } });
  fs.readdirSync(APP).filter((f) => f.endsWith(".gs")).forEach((f) => vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), ctx, { filename: f }));
  const [y, m, d] = X.as_of.split("-").map(Number);
  ctx.CLOCK = new CtxDate(y, m - 1, d, 18, 0);
  ctx.grids = grids; ctx.Date = CtxDate;  // the context's own Date, for instanceof checks
  return ctx;
}

function loadModel() {
  const src = fs.readFileSync(path.join(APP, "Model.html"), "utf8").replace(/<\/?script>/g, "");
  const ctx = vm.createContext({ module: { exports: {} } });
  vm.runInContext(src, ctx, { filename: "Model.html" });
  return ctx.module.exports;
}

/** The demo sheet in use - every tab as the app makes it, dates as date cells (as build_preview.py writes it). */
function demoGrids() {
  return {
    log: [LOG_HEAD].concat(DEMO.log.map((r) => [{ $d: r[0] }].concat(r.slice(1)))),
    ideas: [["stream", "idea", "status"]].concat(DEMO.ideas),
    streams: [["stream", "about"]].concat(DEMO.streams),
    config: [["key", "value"]].concat(DEMO.config)
  };
}

/** The payload the demo sheet returns. */
function payload() { return JSON.parse(loadServer(demoGrids()).getData()); }

module.exports = { fs, path, HERE, ROOT, APP, PREVIEW, X, DEMO, USER, LOG_HEAD, ok, eq, section, done, loadServer, loadModel, payload, demoGrids };
