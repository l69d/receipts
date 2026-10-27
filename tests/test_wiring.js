// The pieces fit: every element App.html reaches for is in Index.html, every server call it makes is in Code.gs, and
// the page includes what it needs.
const { fs, path, APP, ok, eq, section, done } = require("./lib");

const index = fs.readFileSync(path.join(APP, "Index.html"), "utf8");
const app = fs.readFileSync(path.join(APP, "App.html"), "utf8");
const code = fs.readFileSync(path.join(APP, "Code.gs"), "utf8");

section("ids");
const ids = new Set([...index.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const used = [...new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))];
ok(used.length > 20, "App reaches for elements by id");
used.forEach((id) => ok(ids.has(id), `#${id} is in Index.html`));
const tabs = ["overview", "now", "timeline", "impact", "outputs", "streams", "ideas"];
tabs.forEach((t) => ok(index.includes(`data-tab="${t}"`) && ids.has(t), `tab ${t}: a button and a panel`));
eq(JSON.parse(/var TABS = (\[[^\]]+\])/.exec(app)[1].replace(/'/g, '"')), tabs, "App's TABS match the buttons");
tabs.forEach((t) => ok(new RegExp(`function render${t[0].toUpperCase() + t.slice(1)}\\(`).test(app), `render${t[0].toUpperCase() + t.slice(1)} exists`));

section("server calls");
ok(/google\.script\.run[\s\S]*\.getData\(\)/.test(app), "App falls back to getData");
ok(/^function getData\(/m.test(code), "Code.gs defines getData");
ok(/^function doGet\(/m.test(code) && /^function include\(/m.test(code), "doGet and include");
ok(/\.addTask\(JSON\.stringify\(task\)\)/.test(app) && /^function addTask\(/m.test(code), "the task form calls addTask, and Code.gs defines it");
ok(/canEdit\(book\)\) throw/.test(code.slice(code.indexOf("function addTask("))), "addTask checks the caller is an editor before anything else");

section("includes");
["Model", "App"].forEach((n) => ok(index.includes(`<?!= include('${n}'); ?>`) && fs.existsSync(path.join(APP, n + ".html")), `Index includes ${n}`));
ok(index.indexOf("include('Model')") < index.indexOf("include('App')"), "Model before App");
const manifest = JSON.parse(fs.readFileSync(path.join(APP, "appsscript.json"), "utf8"));
eq(manifest.webapp, { executeAs: "USER_DEPLOYING", access: "DOMAIN" }, "web app runs as the deployer, open to the domain");
ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/userinfo.email"), "the email scope canEdit needs");
eq(manifest.timeZone, "Asia/Kolkata", "IST");
ok(!/prefers-color-scheme/.test(index), "light only - no dark-mode styles");

section("statuses agree");
const model = fs.readFileSync(path.join(APP, "Model.html"), "utf8");
const list = (src) => JSON.parse(/var STATUSES = (\[[^\]]+\])/.exec(src)[1].replace(/'/g, '"'));
eq(list(model), list(code), "Model and Code.gs have the same four statuses");
const kinds = (src) => JSON.parse(/var KINDS = (\[[^\]]+\])/.exec(src)[1].replace(/'/g, '"'));
eq(kinds(model), kinds(code), "Model and Code.gs have the same kinds");

done("wiring");
