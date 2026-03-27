/**
 * inspect-selectors.ts
 *
 * Loads your saved LinkedIn session, opens the job search page,
 * and prints out what classes / elements are actually present so
 * we can update scrapper.ts to match the current DOM.
 *
 * Run:  pnpm tsx extractor/inspect-selectors.ts
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";

const COOKIES_FILE = "linkedin-cookies.json";
const SEARCH_URL =
  "https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&keywords=software%20engineer";

async function main() {
  console.log("🔍 Loading cookies...");
  const cookies = JSON.parse(readFileSync(COOKIES_FILE, "utf-8"));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  });

  await context.addCookies(cookies);
  const page = await context.newPage();

  console.log("📄 Navigating to job search page...");
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Give the page extra time to render React components
  await page.waitForTimeout(5_000);

  // ── 1. Try common job-card container selectors ──────────────────────────
  console.log("\n─── JOB CARD SELECTORS ────────────────────────────────────");
  const cardSelectors = [
    "li.jobs-search-results__list-item",
    ".job-card-container",
    "[data-job-id]",
    "li[data-occludable-job-id]",
    ".scaffold-layout__list-item",
    "li.ember-view",
    ".jobs-search-results-list li",
  ];

  for (const sel of cardSelectors) {
    const count = await page.locator(sel).count();
    console.log(`  ${count > 0 ? "✅" : "❌"}  "${sel}"  →  ${count} element(s)`);
  }

  // ── 2. Grab actual classes of the first <li> inside the results list ────
  console.log("\n─── FIRST <li> CLASSES in results list ────────────────────");
  const firstLiClasses = await page.evaluate(() => {
    const lists = ["ul.jobs-search-results__list", ".jobs-search-results-list", "ul"];
    for (const listSel of lists) {
      const ul = document.querySelector(listSel);
      if (ul) {
        const li = ul.querySelector("li");
        return li ? { list: listSel, classes: li.className, tag: li.tagName } : null;
      }
    }
    return null;
  });
  console.log(JSON.stringify(firstLiClasses, null, 2));

  // ── 3. Grab all <a> hrefs that look like job links ─────────────────────
  console.log("\n─── JOB LINK <a> SELECTORS ────────────────────────────────");
  const linkSelectors = [
    "a.job-card-container__link",
    "a[href*='/jobs/view/']",
    ".job-card-list__title",
    "a.disabled.ember-view",
  ];

  for (const sel of linkSelectors) {
    const count = await page.locator(sel).count();
    const sample = count > 0 ? await page.locator(sel).first().getAttribute("href") : "—";
    console.log(`  ${count > 0 ? "✅" : "❌"}  "${sel}"  →  ${count}  (sample: ${sample?.slice(0, 80)})`);
  }

  // ── 4. Find the first job link and inspect the detail page ─────────────
  const firstJobHref = await page
    .locator("a[href*='/jobs/view/']")
    .first()
    .getAttribute("href")
    .catch(() => null);

  if (firstJobHref) {
    const jobUrl = firstJobHref.startsWith("http")
      ? firstJobHref
      : `https://www.linkedin.com${firstJobHref}`;

    console.log(`\n📌 Opening job detail: ${jobUrl.slice(0, 100)}`);
    const jobPage = await context.newPage();
    await jobPage.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await jobPage.waitForTimeout(4_000);

    console.log("\n─── JOB DETAIL SELECTORS ──────────────────────────────────");
    const detailSelectors = [
      // Title
      "h1.jobs-unified-top-card__job-title",
      "h1.t-24",
      "h1",
      // Company
      ".jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name",
      "a.ember-view.t-black.t-normal",
      // Location / bullets
      ".jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__primary-description",
      // Description
      "#job-details",
      ".jobs-description__content",
      ".jobs-description",
      // Work type
      ".jobs-unified-top-card__workplace-type",
      ".jobs-unified-top-card__job-insight",
      // Applicants
      ".jobs-unified-top-card__applicant-count",
      ".jobs-unified-top-card__sub-components",
    ];

    for (const sel of detailSelectors) {
      const el = jobPage.locator(sel).first();
      const count = await jobPage.locator(sel).count();
      const text = count > 0 ? (await el.textContent().catch(() => ""))?.trim().slice(0, 80) : "—";
      console.log(`  ${count > 0 ? "✅" : "❌"}  "${sel}"  →  ${count}  text: "${text}"`);
    }

    // Dump the full outer HTML of the top-card so we can find the real classes
    console.log("\n─── TOP-CARD OUTER HTML (first 3000 chars) ─────────────────");
    const topCardHtml = await jobPage.evaluate(() => {
      const candidates = [
        ".jobs-unified-top-card",
        ".jobs-details__main-content",
        ".job-view-layout",
        "main",
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) return { selector: sel, html: el.outerHTML.slice(0, 3000) };
      }
      return { selector: "body", html: document.body.outerHTML.slice(0, 3000) };
    });

    console.log(`Found via: ${topCardHtml.selector}`);
    console.log(topCardHtml.html);

    // Save full page HTML for offline inspection
    const fullHtml = await jobPage.content();
    writeFileSync("job-detail-page.html", fullHtml);
    console.log("\n💾 Full page HTML saved to job-detail-page.html");

    await jobPage.close();
  } else {
    console.log("\n⚠️  Could not find any job links — saving search page HTML for inspection");
  }

  // Save search page HTML too
  const searchHtml = await page.content();
  writeFileSync("job-search-page.html", searchHtml);
  console.log("💾 Search page HTML saved to job-search-page.html");

  await browser.close();
  console.log("\n✅ Inspection complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
