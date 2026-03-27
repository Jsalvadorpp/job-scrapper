/**
 * test-pagination.ts
 * Tests the actual search URL + pagination to diagnose filter/loading issues.
 * Run: pnpm tsx extractor/test-pagination.ts
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const COOKIES_FILE = "linkedin-cookies.json";
const SEARCH_URL =
  "https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&keywords=software%20engineer&geoId=91000011&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true";

async function main() {
  const cookies = JSON.parse(readFileSync(COOKIES_FILE, "utf-8"));

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  await context.addCookies(cookies);

  const page = await context.newPage();

  // Test pages 0, 1, 2
  for (let pageIndex = 0; pageIndex <= 2; pageIndex++) {
    const start = pageIndex * 25;
    const url = `${SEARCH_URL}&start=${start}`;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`📄 PAGE ${pageIndex + 1} — start=${start}`);
    console.log(`   URL: ${url}`);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait a moment for JS to render
    await page.waitForTimeout(3000);

    // Check the page title / h1 to understand what loaded
    const title = await page.title();
    const h1 = await page.$eval("h1", (el) => el.textContent?.trim()).catch(() => "(no h1)");

    console.log(`   Title: ${title}`);
    console.log(`   H1:    ${h1}`);

    // Check for job cards
    const cardCount = await page.locator("li[data-occludable-job-id]").count();
    const linkCount = await page.locator("a[href*='/jobs/view/']").count();

    console.log(`   Job cards (li[data-occludable-job-id]): ${cardCount}`);
    console.log(`   Job links (a[href*='/jobs/view/']): ${linkCount}`);

    // Check for error messages / auth walls
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    const hasAuthwall = /sign in|log in|join now|authwall/i.test(bodyText);
    const hasError = /something went wrong|error|not found/i.test(title + bodyText);

    console.log(`   Auth wall detected: ${hasAuthwall}`);
    console.log(`   Error detected:     ${hasError}`);

    if (cardCount === 0) {
      // Dump what's actually on the page
      console.log(`\n   ⚠️  No job cards — first 800 chars of body:`);
      console.log("   " + bodyText.slice(0, 800).replace(/\n/g, "\n   "));
    } else {
      // Show first few job link hrefs
      const links = await page.$$eval(
        "a[href*='/jobs/view/']",
        (as) => as.slice(0, 3).map((a) => (a as HTMLAnchorElement).pathname)
      );
      console.log(`   Sample links: ${links.join(", ")}`);
    }

    // Small pause between pages
    await page.waitForTimeout(1500);
  }

  console.log("\n\n✅ Pagination test complete. Close the browser to exit.");
  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
