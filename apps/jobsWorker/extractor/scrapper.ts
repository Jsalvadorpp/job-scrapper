import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { db } from "../db/client.js";
import { jobs as jobsTable } from "../db/schema.js";
import { inArray } from "drizzle-orm";

// ─── Config ────────────────────────────────────────────────────────────────

// Base URL from your personal LinkedIn search — includes all active filters.
// &start=N is appended automatically during pagination (LinkedIn's own param for paging).
//
// TIME_RANGE env var controls the lookback window:
//   pnpm dev        → defaults to last 24 hours
//   pnpm dev:24h    → last 24 hours  (f_TPR=r86400)
//   pnpm dev:week   → last 7 days    (f_TPR=r604800)
const TIME_RANGE = process.env.TIME_RANGE === "week" ? "r604800" : "r86400";
const SEARCH_URL =
  `https://www.linkedin.com/jobs/search/?f_TPR=${TIME_RANGE}&f_WT=2&keywords=software%20engineer&geoId=91000011&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true`;

// How many job detail pages to open at the same time.
// 5 concurrent requests looks like a human with a few tabs open.
// Going higher (e.g. 8) causes burst detection and 429s on job detail pages.
const CONCURRENCY = 4;

// LinkedIn uses this query-param to page through results (0, 25, 50, ...)
const PAGE_SIZE = 25;

// File where we save your LinkedIn session after the first login.
// On the first run you log in manually — after that it's automatic.
const COOKIES_FILE = "linkedin-cookies.json";

// URLs that failed to scrape (rate-limited) are saved here so the next run
// picks them up automatically without re-collecting them from search pages.
const FAILED_JOBS_FILE = "failed-jobs.json";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  workType: string | null;    // "Remote" | "Hybrid" | "On-site" | null
  applicants: string | null;  // e.g. "47 applicants" | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Short random pause between requests — just enough to look human, not so long it's slow.
function randomDelay(min = 500, max = 1200): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run an array of async tasks with at most `limit` in-flight at once.
// Adds a pause between every batch so LinkedIn doesn't see a sustained burst.
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit).map((t) => t());
    const settled = await Promise.allSettled(batch);
    results.push(...settled);
    // Pause between batches — gives LinkedIn's rate-limiter time to cool down
    // before we open the next set of pages.
    if (i + limit < tasks.length) {
      await randomDelay(3000, 6000);
    }
  }
  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Starting scraper...");
  console.log(`📅 Time range: ${process.env.TIME_RANGE === "week" ? "last 7 days" : "last 24 hours"}`);

  const browser = await chromium.launch({
    headless: false, // set to true once you're happy with results
    // These flags suppress Chrome's automation banner and some bot-detection signals
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
    ],
  });

  const context = await browser.newContext({
    // Up-to-date Chrome user agent — older values stand out to LinkedIn's bot checks
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York", // a plausible timezone for a US Chrome user
    viewport: { width: 1280, height: 800 },
    // Tell the server we accept typical browser content types
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "sec-ch-ua": '"Chromium";v="134", "Google Chrome";v="134", "Not(A:Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
  });

  // ── Stealth patches ──────────────────────────────────────────────────────
  // Playwright sets navigator.webdriver = true by default — LinkedIn checks for
  // this exact flag to identify bots. We also patch a few other properties that
  // headless browsers commonly expose.
  await context.addInitScript(() => {
    // 1. Hide the webdriver flag — most important
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // 2. Fake a non-empty plugin list (real browsers always have plugins)
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });

    // 3. Advertise realistic language preferences
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });

    // 4. Remove the CDP (Chrome DevTools Protocol) runtime leak
    // @ts-ignore
    if (window.chrome) {
      // @ts-ignore
      window.chrome.runtime = {};
    }

    // 5. Make permission queries look like a normal browser
    const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
    if (origQuery) {
      // @ts-ignore
      navigator.permissions.query = (params: PermissionDescriptor) =>
        params.name === "notifications"
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : origQuery(params);
    }
  });

  // ── Session handling: load saved cookies or ask user to log in ──
  if (existsSync(COOKIES_FILE)) {
    // Cookies file found — load the saved session so LinkedIn sees us as logged in
    console.log("🍪 Loading saved LinkedIn session...");
    const cookies = JSON.parse(readFileSync(COOKIES_FILE, "utf-8"));
    await context.addCookies(cookies);
  } else {
    // No cookies yet — open LinkedIn and wait for the user to log in manually
    console.log("⚠️  No saved session found. Please log in to LinkedIn in the browser window.");
    const loginPage = await context.newPage();
    await loginPage.goto("https://www.linkedin.com/login");

    // Wait until the user is redirected to the feed (means login was successful)
    console.log("⏳ Waiting for you to log in... (the scraper will continue automatically)");
    await loginPage.waitForURL("**/feed/**", { timeout: 120_000 }); // 2 min to log in
    await loginPage.close();

    // Save the cookies so we don't need to log in again next time
    const cookies = await context.cookies();
    writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log(`✅ Session saved to ${COOKIES_FILE} — next run will skip login.`);
  }

  // ── Steps 1-3: Paginate through all results pages and collect every job link ──
  // LinkedIn search supports ?start=0, ?start=25, ?start=50, ...
  // We keep loading pages until we either hit MAX_JOBS or a page comes back empty.
  console.log("📄 Collecting job links from all result pages...");

  const seenIds = new Set<string>(); // job IDs we've already queued
  const allLinks: string[] = [];
  let pageIndex = 0;

  const MAX_RETRIES = 3; // how many times to retry a rate-limited page

  while (true) {
    const start = pageIndex * PAGE_SIZE;
    const url = `${SEARCH_URL}&start=${start}`;

    // Open a FRESH page for every search-results URL.
    // Re-using the same Page object causes LinkedIn's SPA to do a client-side
    // navigation that skips the full component initialisation, so only the first
    // ~7 virtual-scroll items ever render. A new page forces a full load.
    const page = await context.newPage();

    // Retry up to MAX_RETRIES times with exponential backoff on rate-limit errors.
    let navOk = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        navOk = true;
        break; // success — stop retrying
      } catch {
        if (attempt < MAX_RETRIES) {
          const waitSec = 30 * attempt; // 30s, 60s, 90s
          console.log(`⚠️  Rate-limited on page ${pageIndex + 1} (attempt ${attempt}/${MAX_RETRIES}) — waiting ${waitSec}s before retry...`);
          await page.waitForTimeout(waitSec * 1000);
        } else {
          console.log(`📭 Failed page ${pageIndex + 1} after ${MAX_RETRIES} attempts — stopping pagination.`);
        }
      }
    }

    if (!navOk) { await page.close(); break; }

    // Wait for job cards — if this times out the page is empty (end of results)
    const hasCards = await page
      .waitForSelector("li[data-occludable-job-id]", { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (!hasCards) {
      console.log(`📭 No more results at page ${pageIndex + 1} — stopping.`);
      await page.close();
      break;
    }

    // LinkedIn renders the first ~7 cards immediately. Wait until they appear
    // (or 5s max) rather than a fixed sleep — exits as soon as cards are ready.
    await page.waitForTimeout(1_500);

    // Each real job card stores its ID in data-occludable-job-id.
    // Extract those IDs directly and build URLs from them — much more reliable
    // than hunting for <a> links which may not render for off-screen cards.
    const pageLinks = await page.$$eval(
      "li[data-occludable-job-id]",
      (items) =>
        items
          .map((li) => li.getAttribute("data-occludable-job-id"))
          .filter((id): id is string => !!id && /^\d+$/.test(id))
          .map((id) => `https://www.linkedin.com/jobs/view/${id}/`)
    );

    let newOnThisPage = 0;
    for (const link of pageLinks) {
      const idMatch = link.match(/\/jobs\/view\/(\d+)/);
      const jobId = idMatch?.[1];
      if (jobId && !seenIds.has(jobId)) {
        seenIds.add(jobId);
        allLinks.push(link);
        newOnThisPage++;
      }
    }

    console.log(`📃 Page ${pageIndex + 1}: found ${newOnThisPage} new links (${allLinks.length} total)`);

    // If LinkedIn returned 0 new IDs on this page we've reached the end
    if (newOnThisPage === 0) {
      console.log("✅ All result pages collected.");
      await page.close();
      break;
    }

    await page.close(); // done with this search-results page
    pageIndex++;
    await randomDelay(2500, 4000); // generous pause between result pages to avoid rate-limits
  }

  const uniqueLinks = allLinks;
  console.log(`\n🔗 Total job links collected: ${uniqueLinks.length}`);

  // ── Load previously failed URLs and merge into queue ──
  // If a previous run hit rate limits, those URLs were saved to failed-jobs.json.
  // We retry them now so nothing is permanently lost.
  const previouslyFailed: string[] = existsSync(FAILED_JOBS_FILE)
    ? JSON.parse(readFileSync(FAILED_JOBS_FILE, "utf-8"))
    : [];
  if (previouslyFailed.length > 0) {
    console.log(`♻️  Retrying ${previouslyFailed.length} previously failed URLs...`);
    for (const url of previouslyFailed) {
      if (!seenIds.has(url)) {
        seenIds.add(url);
        uniqueLinks.push(url);
      }
    }
  }

  // ── Skip jobs already stored in the DB ──
  // Query all existing URLs in one go, then filter the queue down to only
  // new jobs. This avoids hitting LinkedIn for data we already have.
  const existingUrls = uniqueLinks.length > 0
    ? (await db
        .select({ url: jobsTable.url })
        .from(jobsTable)
        .where(inArray(jobsTable.url, uniqueLinks)))
        .map((r) => r.url)
    : [];
  const existingUrlSet = new Set(existingUrls);
  const toScrape = uniqueLinks.filter((u) => !existingUrlSet.has(u));
  console.log(`⏭️  Skipping ${existingUrls.length} already-stored jobs.`);
  console.log(`🆕 Need to scrape ${toScrape.length} new jobs.`);

  // ── Step 4: Visit each job page and extract details (in parallel) ──
  // We open CONCURRENCY pages at once so the total time ≈ (jobs / CONCURRENCY) × per-job time
  // instead of jobs × per-job time.
  console.log(`⚡ Scraping ${toScrape.length} jobs (${CONCURRENCY} at a time)...`);

  const failedUrls: string[] = [];

  async function scrapeJob(url: string): Promise<Job> {
    const jobPage = await context.newPage();
    // Block images, fonts, and media on job detail pages — not needed for text
    // extraction, and skipping them cuts load time significantly.
    await jobPage.route(
      /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm)$/i,
      (route) => route.abort()
    );
    try {
      // Retry the job page on rate-limit errors (same strategy as search pages).
      // LinkedIn occasionally 429s individual job pages — a short wait + retry
      // clears it without losing the URL.
      let navOk = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await jobPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          navOk = true;
          break;
        } catch (err) {
          if (attempt < 3) {
            const waitSec = 30 * attempt; // 30s, 60s
            console.log(`⚠️  Rate-limited on job page (attempt ${attempt}/3) — waiting ${waitSec}s...`);
            await jobPage.waitForTimeout(waitSec * 1_000);
          } else {
            throw err; // exhaust retries → bubble up to pLimit error handler
          }
        }
      }
      if (!navOk) throw new Error(`Failed to load ${url} after 3 attempts`);

      // Wait for the description box — this fires as soon as the content is ready
      // instead of always waiting a fixed 4 seconds.
      await jobPage
        .waitForSelector(
          '[data-testid="expandable-text-box"], [data-sdui-component*="aboutTheJob"]',
          { timeout: 10_000 }
        )
        .catch(() => {}); // if it never appears, continue anyway and get what we can

      // ── Title: always in <title> as "Job Title | Company | LinkedIn" ──
      const rawTitle = await jobPage.title();
      const titleParts = rawTitle.split(" | ");
      const title = titleParts[0]?.trim() || "Unknown title";

      // ── Company: LinkedIn sets aria-label="Company, <Name>." for accessibility ──
      const company =
        (await jobPage
          .evaluate(() => {
            const el = document.querySelector('[aria-label^="Company, "]');
            if (!el) return null;
            return (el.getAttribute("aria-label") ?? "")
              .replace(/^Company,\s*/, "")
              .replace(/\.$/, "")
              .trim();
          })
          .catch(() => null)) ??
        titleParts[1]?.trim() ??
        "Unknown company";

      // ── Location + Applicants: both live in the same metadata <p> ──
      // LinkedIn renders: "Colombia · Reposted 15 hours ago · 90 applicants"
      const { location, applicants } = await jobPage.evaluate(() => {
        const paras = Array.from(document.querySelectorAll("p"));
        for (const p of paras) {
          const text = p.textContent ?? "";
          if (/\bago\b/i.test(text) && text.includes("·")) {
            const spanTexts = Array.from(p.querySelectorAll("span"))
              .map((s) => s.textContent?.trim() ?? "")
              .filter((t) => t.length > 0 && t !== "·" && t !== " " && !/^\s+$/.test(t));
            const loc = spanTexts.find(
              (t) =>
                !t.match(/\d+\s*(hour|day|week|month|year)/i) &&
                !t.match(/applicant/i) &&
                !t.match(/promoted|reposted|posted/i)
            );
            return { location: loc ?? "Unknown location", applicants: spanTexts.find((t) => /applicant/i.test(t)) ?? null };
          }
        }
        return { location: "Unknown location", applicants: null };
      });

      // ── Work type: "Remote" | "Hybrid" | "On-site" ──
      const workType = await jobPage.evaluate((): string | null => {
        const spans = Array.from(document.querySelectorAll("span"));
        const match = spans.find((el) => {
          const t = (el.textContent ?? "").trim();
          return t === "Remote" || t === "Hybrid" || t === "On-site";
        });
        return match ? (match.textContent?.trim() ?? null) : null;
      });

      // ── Description: data-testid="expandable-text-box" ──
      const description = await jobPage
        .locator('[data-testid="expandable-text-box"]')
        .first()
        .textContent()
        .catch(async () =>
          jobPage.evaluate(
            () =>
              document
                .querySelector('[data-sdui-component*="aboutTheJob"]')
                ?.textContent?.trim() ?? "No description found"
          )
        )
        .then((t) => (t ?? "No description found").trim());

      console.log(`✅ ${title} @ ${company} | ${location} | ${workType ?? "?"}`);
      return { title, company, location, url, description, workType, applicants };
    } finally {
      await jobPage.close();
    }
  }

  // Build a task list and run them CONCURRENCY at a time.
  // Each job is staggered within its batch: job 0 starts immediately,
  // job 1 after ~1-2s, job 2 after ~2-4s. This avoids all CONCURRENCY
  // requests landing on LinkedIn at the exact same millisecond.
  const tasks = toScrape.map(
    (url, i) => async () => {
      const posInBatch = i % CONCURRENCY;
      if (posInBatch > 0) await randomDelay(1000 * posInBatch, 1000 * posInBatch + 2000);
      return scrapeJob(url);
    }
  );

  const settled = await pLimit(tasks, CONCURRENCY);

  const jobs: Job[] = settled
    .map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      const failedUrl = toScrape[i];
      console.error(`❌ Failed to scrape ${failedUrl}: ${(r.reason as Error).message}`);
      failedUrls.push(failedUrl); // save for retry on next run
      return null;
    })
    .filter((j): j is Job => j !== null);

  // Persist failed URLs so the next run retries them automatically
  writeFileSync(FAILED_JOBS_FILE, JSON.stringify(failedUrls, null, 2));
  if (failedUrls.length > 0) {
    console.log(`\n⚠️  ${failedUrls.length} jobs failed (rate-limited). Saved to ${FAILED_JOBS_FILE} — will retry next run.`);
  } else {
    console.log(`\n✅ No failures — cleared ${FAILED_JOBS_FILE}.`);
  }

  // ── Step 5: Save to jobs.json (backup) and insert into PostgreSQL ──

  // Backup to file — useful for debugging even when DB is running
  writeFileSync("jobs.json", JSON.stringify(jobs, null, 2));
  console.log(`\n💾 Saved ${jobs.length} jobs to jobs.json`);

  // Insert into PostgreSQL — skip duplicates (same URL already exists)
  let saved = 0;
  for (const job of jobs) {
    try {
      await db.insert(jobsTable).values(job).onConflictDoNothing();
      saved++;
    } catch (err) {
      console.error(`⚠️  DB insert failed for ${job.url}:`, err);
    }
  }

  console.log(`🎉 Done! Inserted ${saved}/${jobs.length} new jobs into PostgreSQL`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
