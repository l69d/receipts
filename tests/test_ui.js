// The page in a real browser (Playwright): the preview opens the demo sheet -
// then every tab and filter, no JavaScript errors, no NaN / undefined anywhere, light in a dark-mode browser, and a
// phone-width pass that never scrolls sideways.
const { chromium } = require("playwright");
const { PREVIEW, X, ok, eq, section, done } = require("./lib");

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
    const clean = async (where) => {
      const t = await page.evaluate(() => document.querySelector(".viz-root").innerText);
      ok(!/NaN|undefined|Infinity|\bnull\b|\[object/.test(t), where + ": no NaN / undefined / null on the page");
    };
    const tab = async (t) => { await page.click(`#tabs button[data-tab="${t}"]`); };
    const count = (sel) => page.locator(sel).count();
    await page.goto("file://" + PREVIEW);
    await page.waitForSelector("#ov-tiles .tile");

    section("overview (the landing tab)");
    eq(await page.evaluate(() => document.querySelector('#tabs button[aria-pressed="true"]').dataset.tab), "overview", "Overview is the landing tab");
    eq((await page.locator("#ov-tiles .tile .v").allInnerTexts()).map(Number), X.tiles, "tiles match pandas");
    ok(await count("#ov-insights li") >= 3, "three or more insight lines");
    ok(/shipped this week/.test(await page.locator("#ov-insights").innerText()), "an insight on this week");
    ok(new RegExp(X.outputs.links + " outputs you can open").test(await page.locator("#ov-insights").innerText()), "an insight on the outputs");
    await page.click('#ov-insights [data-go="outputs"]');
    eq(await page.evaluate(() => document.querySelector('#tabs button[aria-pressed="true"]').dataset.tab), "outputs", "... which opens Outputs");
    await tab("overview");
    eq(await count("#ov-weekly .hit"), X.weeks.length, "a bar slot per week");
    ok(await count("#ov-weekly rect:not(.hit)") >= X.weeks.length, "stacked bar segments drawn");
    eq(await count("#ov-weekly .legend span"), Object.values(X.weekly).filter((c) => c.some(Boolean)).length, "legend: streams that shipped");
    await page.hover("#ov-weekly .hit >> nth=-1");
    ok(/shipped/.test(await page.locator("#ov-weekly .tip").innerText()), "hovering a week shows its split");
    eq(await count("#ov-open .entry"), X.open.length, "in progress: every open project");
    eq(await count("#ov-recent .entry"), Math.min(X.recent, 8), "shipped in the last 7 days: the latest 8");
    ok(X.recent <= 8 || (await page.locator("#ov-more").innerText()) === `+ ${X.recent - 8} more in the Timeline`, "the rest: a link to the timeline");
    if (X.recent > 8) {
      await page.click("#ov-more");
      eq(await page.evaluate(() => document.querySelector('#tabs button[aria-pressed="true"]').dataset.tab), "timeline", "... which opens the timeline");
      eq(await page.evaluate(() => document.querySelector('#status button[aria-pressed="true"]').dataset.s), "Completed", "... showing what shipped");
      await page.click('#status button[data-s=""]');
      await page.click('#tabs button[data-tab="overview"]');
    }
    const dm = (iso) => +iso.slice(8) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+iso.slice(5, 7) - 1];
    eq(await page.locator("#meta").innerText(), `${X.entries} entries since ${dm(X.first)} · last logged ${dm(X.last)}`, "header: how much is logged");
    ok(await page.locator("#sheet").isVisible(), "the owner sees the sheet link");
    ok(await page.locator("#ctl").isHidden(), "overview: no filters");
    await clean("overview");

    section("now");
    await tab("now");
    eq(await count("#now-open .thread"), X.open.length, "a card per open project");
    eq(await page.locator("#now-open .thread .name").allInnerTexts(), X.open.map((t) => t.name), "latest update first");
    eq(await count("#now-parked .entry"), X.parked.length, "parked projects");
    await clean("now");

    section("timeline");
    await tab("timeline");
    ok(await page.locator("#g-stream").isVisible() && await page.locator("#g-status").isVisible() && await page.locator("#q").isVisible(), "timeline: stream, status and search");
    eq(await count("#tl-weeks .week"), Object.keys(X.timeline_weeks).length, "a block per week");
    eq(await count("#tl-weeks .entry"), X.entries, "every entry");
    await page.click('#status button[data-s="Completed"]');
    ok((await page.locator("#tl-weeks .badge").allInnerTexts()).every((b) => b === "Completed"), "status: Completed only");
    eq(await count("#tl-weeks .entry"), X.impact.shipped, "Completed: every shipped entry");
    await page.click('#status button[data-s=""]');
    await page.fill("#q", "bulky");
    eq(await count("#tl-weeks .entry"), X.search_bulky, "search");
    await page.fill("#q", "no such thing at all");
    ok(/No entries match/.test(await page.locator("#tl-weeks").innerText()), "search with no match says so");
    await page.fill("#q", "");
    const ss = X.streams_order[1];
    await page.selectOption("#stream", ss);
    eq(await count("#tl-weeks .entry"), X.streams[ss].entries, "stream filter");
    await page.selectOption("#stream", "");
    await clean("timeline");

    section("impact");
    await tab("impact");
    ok(await page.locator("#g-stream").isVisible() && await page.locator("#g-status").isHidden(), "impact: stream filter only");
    eq(await count("#im-kinds .tile"), Object.keys(X.impact.by_kind).length, "a tile per kind of work");
    eq(await count("#im-lines .entry"), X.impact.with_impact, "every impact line");
    ok(new RegExp(X.impact.missing + " shipped entries have no impact line").test(await page.locator("#im-lede").innerText()), "says how many lack an impact line");
    await page.selectOption("#stream", ss);
    ok((await count("#im-lines .entry")) <= X.streams[ss].done, "impact for one stream");
    await page.selectOption("#stream", "");
    await clean("impact");

    section("outputs");
    await tab("outputs");
    ok(await page.locator("#g-stream").isVisible() && await page.locator("#g-status").isHidden(), "outputs: stream filter only");
    eq(await count("#op-cards .out"), X.outputs.projects, "a card per project with a link");
    eq(await count("#op-cards .lnk"), X.outputs.links, "every link");
    eq(await count("#op-types .tile"), Object.keys(X.outputs.by_type).length, "a tile per kind of link");
    ok((await page.locator("#op-cards .lnk").evaluateAll((as) => as.every((a) => a.target === "_blank" && /^https:\/\//.test(a.href) && a.rel === "noopener"))), "links open in a new tab");
    const types = await page.locator("#op-cards .lnk b").evaluateAll((bs) => bs.map((b) => b.textContent));
    ok(types.length && types.every((t) => t in X.outputs.by_type), "each link says what it is (" + [...new Set(types)].join(", ") + ")");
    await clean("outputs");

    section("streams");
    await tab("streams");
    eq(await count("#st-cards .stream"), X.streams_order.length, "a card per stream");
    eq(await page.locator("#st-cards .stream h3").allInnerTexts(), X.streams_order, "in the streams tab's order");
    await clean("streams");
    await page.click(`#st-cards .stream[data-stream="${X.streams_order[2]}"]`);
    eq(await page.evaluate(() => document.querySelector('#tabs button[aria-pressed="true"]').dataset.tab), "timeline", "clicking a stream opens its timeline");
    eq(await page.locator("#stream").inputValue(), X.streams_order[2], "... filtered to it");
    eq(await count("#tl-weeks .entry"), X.streams[X.streams_order[2]].entries, "... with its entries");
    await page.selectOption("#stream", "");

    section("ideas");
    await tab("ideas");
    eq(await count("#id-table tr"), X.ideas + 1, "header + every idea");
    await clean("ideas");

    section("+ New task and Log update (the demo user edits the sheet)");
    await tab("overview");
    ok(await page.locator("#add-btn").isVisible(), "an editor sees + New task");
    await page.click("#add-btn");
    ok(await page.locator("#add-dlg").isVisible(), "it opens the form");
    eq(await page.locator("#add-title").innerText(), "New task", "titled New task");
    eq(await page.locator("#f-date").inputValue(), X.as_of, "date defaults to today");
    eq(await page.locator("#f-status").inputValue(), "Not yet Started", "status defaults to Not yet Started");
    eq(await page.locator("#f-stream option").count(), X.streams_order.length + 1, "streams to pick from (+ none)");
    ok(await page.locator("#f-projects option").count() >= X.projects, "existing projects suggested");
    await page.click("#f-save");
    ok(await page.locator("#add-dlg").isVisible(), "an empty name does not save");
    await page.fill("#f-item", "Pricing review prep");
    await page.fill("#f-project", "Pricing review");
    await page.selectOption("#f-stream", X.streams_order[0]);
    await page.fill("#f-for", "Leadership");
    await page.click("#f-save");
    await page.waitForSelector("#toast:not([hidden])");
    ok(/Saved: Pricing review prep/.test(await page.locator("#toast").innerText()), "saved, and says so");
    ok(await page.locator("#add-dlg").isHidden(), "the form closes");
    ok(new RegExp(`${X.entries + 1} entries`).test(await page.locator("#meta").innerText()), "the page redraws with one more entry");
    await tab("now");
    eq(await count("#now-open .thread"), X.open.length + 1, "the new task is open work");
    const card = page.locator('#now-open .thread', { hasText: "Pricing review" });
    ok(/Not yet Started/.test(await card.innerText()), "... not yet started");
    await card.locator("[data-update]").click();
    eq(await page.locator("#add-title").innerText(), "Update: Pricing review", "Log update opens the form for that project");
    eq(await page.locator("#f-project").inputValue(), "Pricing review", "... project filled in");
    eq(await page.locator("#f-stream").inputValue(), X.streams_order[0], "... stream filled in");
    await page.fill("#f-item", "Pricing review deck shared");
    await page.selectOption("#f-status", "Completed");
    await page.click("#f-save");
    await page.waitForSelector("#add-dlg", { state: "hidden" });
    eq(await count("#now-open .thread"), X.open.length, "completing it takes the project off Now");
    await page.click("#add-btn");
    await page.keyboard.press("Escape");
    ok(await page.locator("#add-dlg").isHidden(), "Esc closes the form");
    await clean("after adding tasks");

    section("notes: jot down, make a task, archive");
    ok(await page.locator("#tab-notes").isVisible(), "an editor sees the Notes tab");
    await tab("notes");
    ok(/No open notes/.test(await page.locator("#n-list").innerText()), "empty to begin with");
    await page.click("#n-save");
    ok(/Write something/.test(await page.locator("#n-msg").innerText()), "an empty note does not save");
    await page.fill("#n-text", "Ask Sam about the churn deck\nneeds the Q3 cohorts");
    await page.press("#n-text", "Meta+Enter");
    await page.waitForSelector("#n-list .note-card");
    eq(await page.locator("#n-text").inputValue(), "", "⌘+Enter saves and clears the box");
    eq(await count("#n-list .note-card"), 1, "the note is listed");
    ok(/churn deck\nneeds the Q3 cohorts/.test(await page.locator("#n-list .note-card .txt").innerText()), "line breaks kept");
    await page.fill("#n-text", "Second thought");
    await page.click("#n-save");
    await page.waitForFunction(() => document.querySelectorAll("#n-list .note-card").length === 2);
    eq(await page.locator("#n-list .note-card .txt").first().innerText(), "Second thought", "newest first");
    await page.locator("#n-list .note-card").nth(0).locator('[data-act="edit"]').click();
    await page.fill("#n-list textarea", "Second thought, edited");
    await page.locator('#n-list [data-act="save-edit"]').click();
    await page.waitForFunction(() => /edited/.test(document.querySelector("#n-list .note-card .txt") && document.querySelector("#n-list .note-card .txt").textContent));
    ok(/Second thought, edited/.test(await page.locator("#n-list .note-card .txt").first().innerText()), "edited in place");
    const note = page.locator("#n-list .note-card", { hasText: "churn deck" });
    await note.locator('[data-act="task"]').click();
    eq(await page.locator("#add-title").innerText(), "Task from a note", "Make a task opens the task form");
    eq(await page.locator("#f-item").inputValue(), "Ask Sam about the churn deck", "... first line as the task");
    eq(await page.locator("#f-notes").inputValue(), "needs the Q3 cohorts", "... the rest as its notes");
    await page.click("#f-save");
    await page.waitForSelector("#add-dlg", { state: "hidden" });
    eq(await count("#n-list .note-card"), 1, "the note leaves Open once it is a task");
    await page.click('#n-filter button[data-f="Made a task"]');
    ok(/Made a task: Ask Sam about the churn deck/.test(await page.locator("#n-list").innerText()), "... and says which task it became");
    ok(await page.locator('#n-list [data-act="task"]').count() === 0, "... no second Make a task");
    await tab("now");
    ok(/Ask Sam about the churn deck/.test(await page.locator("#now-open").innerText()), "the task is open work in Now");
    await tab("notes");
    await page.click('#n-filter button[data-f="Open"]');
    await page.locator('#n-list [data-act="archive"]').first().click();
    await page.waitForFunction(() => !document.querySelector("#n-list .note-card"));
    await page.click('#n-filter button[data-f="Archived"]');
    eq(await count("#n-list .note-card"), 1, "archived notes are kept, under Archived");
    await page.locator('#n-list [data-act="reopen"]').click();
    await page.waitForFunction(() => !document.querySelector("#n-list .note-card"));
    await page.click('#n-filter button[data-f="Open"]');
    eq(await count("#n-list .note-card"), 1, "reopen brings it back");
    ok(/Open · 1/.test(await page.locator("#n-filter").innerText()), "filter counts");
    await page.fill("#n-text", "half a thought");
    await page.reload();
    await page.waitForSelector("#ov-tiles .tile");
    await tab("notes");
    eq(await page.locator("#n-text").inputValue(), "half a thought", "an unsaved note survives a reload");
    await page.fill("#n-text", ""); await page.dispatchEvent("#n-text", "input");
    await clean("notes");

    eq(errors, [], "no JavaScript errors");

    section("a dark-mode browser still gets the light page");
    const dark = await browser.newPage({ colorScheme: "dark" });
    await dark.goto("file://" + PREVIEW);
    await dark.waitForSelector("#ov-tiles .tile");
    eq(await dark.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(249, 249, 247)", "page background stays light");
    await dark.close();

    section("phone width");
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await phone.goto("file://" + PREVIEW);
    await phone.waitForSelector("#ov-tiles .tile");
    eq(await phone.evaluate(() => window.innerWidth), 390, "laid out at the phone's width (viewport meta)");
    eq(await phone.evaluate(() => getComputedStyle(document.querySelector(".grid2")).gridTemplateColumns.split(" ").length), 1, "overview lists stack on a phone");
    for (const t of ["overview", "now", "timeline", "impact", "outputs", "streams", "ideas", "notes"]) {
      await phone.click(`#tabs button[data-tab="${t}"]`);
      const w = await phone.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      ok(w[0] <= w[1], `${t}: no sideways scroll at 390px (${w[0]} <= ${w[1]})`);
    }
    await phone.close();
  } finally {
    await browser.close();
  }
  done("ui");
})().catch((e) => { console.error(e); process.exit(1); });
