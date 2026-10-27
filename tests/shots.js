// Screenshots of every tab (desktop) and the overview (phone) of the demo, into docs/screenshots/ for the README.
//   node shots.js
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const out = path.join(__dirname, "..", "docs", "screenshots");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("file://" + path.join(__dirname, "preview.html"));
  await page.waitForSelector("#ov-tiles .tile");
  for (const t of ["overview", "now", "timeline", "impact", "outputs", "streams", "ideas"]) {
    await page.click(`#tabs button[data-tab="${t}"]`);
    await page.screenshot({ path: path.join(out, t + ".png"), fullPage: t !== "timeline" });
  }
  await page.click('#tabs button[data-tab="now"]');
  await page.click("#add-btn");
  await page.fill("#f-item", "Churn drivers deep dive");
  await page.screenshot({ path: path.join(out, "new-task.png") });
  await page.keyboard.press("Escape");
  await page.click('#tabs button[data-tab="notes"]');
  for (const n of ["Ask Sam about the churn deck\nneeds the Q3 cohorts before Thursday", "Check the price-match list with the category team"]) {
    await page.fill("#n-text", n);
    await page.click("#n-save");
    await page.waitForFunction((k) => document.querySelectorAll("#n-list .note-card").length === k, n.startsWith("Ask") ? 1 : 2);
  }
  await page.fill("#n-text", "Idea: weekly digest of what shipped");
  await page.screenshot({ path: path.join(out, "notes.png"), fullPage: true });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await phone.goto("file://" + path.join(__dirname, "preview.html"));
  await phone.waitForSelector("#ov-tiles .tile");
  await phone.screenshot({ path: path.join(out, "phone-overview.png"), fullPage: true });
  await browser.close();
  console.log("screenshots in " + out);
})();
