#!/usr/bin/env node
/**
 * Runs every suite and says, in one line, whether the app is still whole.
 *
 *   node run_all.js            # everything
 *   node run_all.js model      # only suites whose name contains "model"
 *
 * Suites run in parallel, each in its own process (the UI suite launches its own browser). A failing suite prints
 * its output in full under the summary - each one logs what it checked, so that is usually enough to see the cause.
 * Exits non-zero if anything failed, so it gates `npm run push` and `npm run release`.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const filter = process.argv[2] || "";
// cheapest first, so an obvious breakage shows in a second
const ORDER = ["test_wiring", "test_server", "test_model", "test_ui"];
const suites = fs.readdirSync(HERE).filter((f) => /^test_.*\.js$/.test(f)).map((f) => f.replace(/\.js$/, ""))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)).filter((s) => s.includes(filter));

const t0 = Date.now();
Promise.all(suites.map((s) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(HERE, s + ".js")], { cwd: HERE });
  let out = "";
  p.stdout.on("data", (b) => { out += b; });
  p.stderr.on("data", (b) => { out += b; });
  p.on("close", (code) => resolve({ s, code, out }));
}))).then((results) => {
  results.forEach((r) => {
    const last = r.out.trim().split("\n").pop();
    console.log((r.code === 0 ? "  ✓ " : "  ✗ ") + (r.code === 0 ? last.replace(/^ok /, "") : r.s + " - FAILED"));
  });
  const failed = results.filter((r) => r.code !== 0);
  failed.forEach((r) => console.log("\n--- " + r.s + " ---\n" + r.out));
  const checks = results.reduce((t, r) => { const m = /(\d+)\/(\d+) checks/.exec(r.out); return t + (m ? +m[2] : 0); }, 0);
  console.log(`\n${failed.length ? "FAILED" : "all"} ${results.length - failed.length}/${results.length} suites pass, ${checks} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(failed.length ? 1 : 0);
});
