import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { db } from "../db/client.js";
import { jobs as jobsTable, blockedCompanies, blockedKeywords, requiredKeywords } from "../db/schema.js";
import { asc, inArray } from "drizzle-orm";

// ─── Config ────────────────────────────────────────────────────────────────

// Base URL from your personal LinkedIn search — includes all active filters.
// &start=N is appended automatically during pagination (LinkedIn's own param for paging).
//
// TIME_RANGE env var controls the lookback window:
//   pnpm dev      → defaults to last 24 hours
//   pnpm dev:24h  → last 24 hours  (f_TPR=r86400)
//   pnpm dev:16h  → last 16 hours  (f_TPR=r57600)
//                   Ideal when running at ~9pm — only shows jobs posted after
//                   ~5am, skipping any noise posted in the middle of the night
const TIME_RANGE =
  process.env.TIME_RANGE === "16h" ? "r57600" : "r86400"; // default: 24 h

// ─── Search URL builder ───────────────────────────────────────────────────
// LinkedIn's Boolean search is unreliable — complex queries cause it to return
// unrelated results or silently drop valid jobs. We keep the LinkedIn query as
// simple as possible ("software engineer" exact phrase) and rely entirely on
// the local three-layer filter to enforce the user's preferences precisely:
//   1. Listing-card loop  — skips by company + title before opening detail pages
//   2. passesContentFilter — title (ROLE_KEYWORDS) + description (reqList) + blocked company
//   3. DB insert           — onConflictDoNothing deduplication
function buildSearchUrl(): string {
  return `https://www.linkedin.com/jobs/search/?f_TPR=${TIME_RANGE}&f_WT=2&keywords=${encodeURIComponent('"software engineer"')}&geoId=91000011&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true`;
}

// ─── Browser fingerprint rotation ──────────────────────────────────────────
// LinkedIn (and their 3rd-party bot-detection partner) fingerprint the browser
// on every request: User-Agent, sec-ch-ua, platform, viewport, and GPU all need
// to match. Rotating across a small pool of realistic Chrome/Windows and
// Chrome/macOS combos means each run looks like a slightly different person.
const FINGERPRINTS = [
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="134", "Google Chrome";v="134", "Not(A:Brand";v="99"',
    platform: "Windows",
    viewport: { width: 1920, height: 1080 },
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="133", "Google Chrome";v="133", "Not(A:Brand";v="99"',
    platform: "Windows",
    viewport: { width: 1440, height: 900 },
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="134", "Google Chrome";v="134", "Not(A:Brand";v="99"',
    platform: "macOS",
    viewport: { width: 1440, height: 900 },
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="133", "Google Chrome";v="133", "Not(A:Brand";v="99"',
    platform: "macOS",
    viewport: { width: 1536, height: 960 },
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="134", "Google Chrome";v="134", "Not(A:Brand";v="99"',
    platform: "Windows",
    viewport: { width: 1366, height: 768 },
  },
];
// Pick one randomly at startup — stays consistent for the whole run
const FP = FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)]!;

// How many job detail pages to open at the same time.
// 5 concurrent requests looks like a human with a few tabs open.
// Going higher (e.g. 8) causes burst detection and 429s on job detail pages.
const CONCURRENCY = 3;

// LinkedIn uses this query-param to page through results (0, 25, 50, ...)
const PAGE_SIZE = 25;

// File where we save your LinkedIn session after the first login.
// On the first run you log in manually — after that it's automatic.
const COOKIES_FILE = "linkedin-cookies.json";

// URLs that failed to scrape (rate-limited) are saved here so the next run
// picks them up automatically without re-collecting them from search pages.
const FAILED_JOBS_FILE = "failed-jobs.json";

// Fallback title keywords used when required_keywords table is empty.
// A listing-card title must contain at least one of these to be queued.
// When required_keywords ARE set those are used instead (they already encode
// the user's stack), so this list is just a safety net against off-topic roles
// like Graphic Designer, Clinical Coordinator, Reservation Specialist, etc.
const ROLE_KEYWORDS = [
  "software", "engineer", "developer", "dev",
  "backend", "back-end", "back end",
  "frontend", "front-end", "front end",
  "fullstack", "full-stack", "full stack",
  "python", "node", "node.js", "javascript", "typescript",
  "react", "vue", "angular",
  "data", "devops", "sre", "cloud", "platform",
];

// ─── Types ─────────────────────────────────────────────────────────────────

interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  workType: string | null;    // "Remote" | "Hybrid" | "On-site" | null
  applicants: string | null;  // e.g. "47 applicants" | null
  companyLogo: string | null; // LinkedIn CDN image URL — null if not found
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Short random pause — uniform random, good for per-item micro-staggering.
function randomDelay(min = 500, max = 1200): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gaussian (normal) delay — clusters around `mean` ms with std-dev `stddev`.
// Human reaction times follow a normal distribution, not a flat uniform one.
// Uses the Box-Muller transform to approximate N(μ, σ).
function gaussianDelay(mean: number, stddev: number): Promise<void> {
  const u1 = Math.random() || 1e-10; // avoid log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = Math.max(200, Math.round(mean + z * stddev));
  return new Promise((r) => setTimeout(r, ms));
}

// 12 % chance of a longer "reading" pause (10–28 s).
// Simulates a person stopping to actually read a result before moving on.
async function maybeBreak(): Promise<void> {
  if (Math.random() < 0.12) {
    const sec = Math.floor(Math.random() * 18) + 10;
    console.log(`☕ Human break: pausing ${sec}s…`);
    await new Promise((r) => setTimeout(r, sec * 1_000));
  }
}

// Scroll a page down in small, irregular chunks — like a person reading.
// `totalPx` is the approximate scroll distance; 0 = auto-choose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function humanScroll(page: any, totalPx = 0): Promise<void> {
  const distance = totalPx || Math.floor(Math.random() * 500) + 300;
  const steps = Math.floor(distance / 100) + Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < steps; i++) {
    const chunk = Math.floor(Math.random() * 120) + 60;
    await page.evaluate(
      (amt: number) => window.scrollBy({ top: amt, behavior: "smooth" }),
      chunk
    );
    await randomDelay(60, 220);
  }
}

// Move the cursor to a random spot inside the viewport — simulates the idle
// mouse movement that happens while a person reads a page.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function moveMouseRandomly(page: any): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  const x = Math.floor(Math.random() * vp.width * 0.7 + vp.width * 0.1);
  const y = Math.floor(Math.random() * vp.height * 0.6 + vp.height * 0.1);
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 12) + 6 });
}

// Run an array of async tasks with at most `limit` in-flight at once.
// Uses a gaussian delay between batches + an occasional longer break so the
// burst pattern doesn't look like automated polling.
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit).map((t) => t());
    const settled = await Promise.allSettled(batch);
    results.push(...settled);
    if (i + limit < tasks.length) {
      // Gaussian inter-batch pause — ~4 s average, ±1.5 s std-dev
      await gaussianDelay(4_000, 1_500);
      await maybeBreak();
    }
  }
  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Starting scraper...");
  console.log(`📅 Time range: ${process.env.TIME_RANGE === "16h" ? "last 16 hours" : "last 24 hours"}`);

  // ── Load filters from DB ─────────────────────────────────────────────────
  const [reqRows, blockedKwRows, blockedCoRows] = await Promise.all([
    db.select().from(requiredKeywords).orderBy(asc(requiredKeywords.keyword)),
    db.select().from(blockedKeywords).orderBy(asc(blockedKeywords.keyword)),
    db.select().from(blockedCompanies).orderBy(asc(blockedCompanies.name)),
  ]);

  const reqList   = reqRows.map((r) => r.keyword);
  const blockedKwList = blockedKwRows.map((r) => r.keyword);
  // Normalised set for fast O(1) lookups during listing-card filtering
  const blockedCoSet  = new Set(blockedCoRows.map((r) => r.name.toLowerCase()));

  const SEARCH_URL = buildSearchUrl();

  console.log(`🔍 Search URL: "software engineer" (filters applied locally)`);
  if (blockedCoRows.length > 0) {
    console.log(`🚫 Blocked companies (${blockedCoRows.length}): ${blockedCoRows.map((c) => c.name).join(", ")}`);
  }
  if (blockedCoRows.length > 0) {
    console.log(`🚫 Blocked companies (${blockedCoRows.length}): ${blockedCoRows.map((c) => c.name).join(", ")}`);
  }

  console.log(`👾 Fingerprint: ${FP.platform} ${FP.viewport.width}x${FP.viewport.height}`);

  const browser = await chromium.launch({
    headless: false, // set to true once you're happy with results
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
      "--disable-dev-shm-usage",          // avoids /dev/shm crash in constrained envs
      "--disable-web-security",           // skip CORS preflight that headless-only browsers skip
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=" + FP.viewport.width + "," + FP.viewport.height,
    ],
  });

  const context = await browser.newContext({
    userAgent: FP.userAgent,
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: FP.viewport,
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "sec-ch-ua": FP.secChUa,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": `"${FP.platform}"`,
      // Typical navigation headers — missing ones are a bot signal
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  // ── Stealth patches ──────────────────────────────────────────────────────
  // LinkedIn (and their anti-bot partner PerimeterX/HUMAN) fingerprints the
  // browser on every page load. Each patch below neutralises a specific signal
  // that headless Chrome leaks by default.
  await context.addInitScript(() => {
    // 1. Hide the webdriver flag — the #1 bot signal
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // 2. Non-empty plugin list — real Chrome always has at least PDF Viewer etc.
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // 3. Realistic language preferences
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // 4. Remove the CDP (Chrome DevTools Protocol) runtime leak
    // @ts-ignore
    if (window.chrome) {
      // @ts-ignore
      window.chrome.runtime = {};
    }

    // 5. Permission queries — match the behaviour of a real, non-headless Chrome
    const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
    if (origQuery) {
      // @ts-ignore
      navigator.permissions.query = (params: PermissionDescriptor) =>
        params.name === "notifications"
          ? Promise.resolve({
              state: Notification.permission,
            } as PermissionStatus)
          : origQuery(params);
    }

    // 6. Hardware: realistic desktop values (headless often exposes 2 cores / 0 GB)
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 }); // no touch = desktop

    // 7. Screen colour depth — 24-bit on every modern monitor
    Object.defineProperty(screen, "colorDepth", { get: () => 24 });
    Object.defineProperty(screen, "pixelDepth", { get: () => 24 });

    // 8. WebGL GPU vendor/renderer — commonly fingerprinted to detect VMs / cloud
    //    Spoofing to a common Intel iGPU is the safest low-profile choice.
    try {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param: number) {
        if (param === 37445) return "Intel Inc."; // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER_WEBGL
        return getParameter.call(this, param);
      };
    } catch {}

    // 9. Network info — typical home broadband values
    try {
      // @ts-ignore
      const conn = navigator.connection;
      if (conn) {
        Object.defineProperty(conn, "rtt", { get: () => 100 });
        Object.defineProperty(conn, "downlink", { get: () => 10 });
        Object.defineProperty(conn, "effectiveType", { get: () => "4g" });
      }
    } catch {}

    // 10. Notification.permission — real browsers return 'default', not 'denied'
    try {
      Object.defineProperty(Notification, "permission", { get: () => "default" });
    } catch {}
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

    // Give the first batch of cards time to render, then scroll and wiggle
    // the mouse — same thing a human does while the page finishes loading.
    await page.waitForTimeout(1_500);
    await humanScroll(page, 700);          // scroll ~700 px down the results list
    await moveMouseRandomly(page);          // idle cursor movement while "reading"
    await randomDelay(400, 900);           // brief pause before extracting

    // Each real job card stores its ID in data-occludable-job-id.
    // We extract company AND title so we can skip blocked companies/keywords
    // before ever opening a detail page (saves rate-limit budget).
    const pageCards = await page.$$eval(
      "li[data-occludable-job-id]",
      (items) =>
        items
          .map((li) => {
            const id = li.getAttribute("data-occludable-job-id");
            if (!id || !/^\d+$/.test(id)) return null;
            // Company subtitle — several selectors LinkedIn has used over time
            const companyEl =
              li.querySelector(".job-card-container__primary-description") ??
              li.querySelector(".artdeco-entity-lockup__subtitle span") ??
              li.querySelector(".job-card-container__subtitle");
            const company = companyEl?.textContent?.trim() ?? "";
            // Title — the clickable job title link
            const titleEl =
              li.querySelector(".job-card-list__title") ??
              li.querySelector(".job-card-container__link") ??
              li.querySelector("a[data-control-name=\"jobcard_title\"]");
            const title = titleEl?.textContent?.trim() ?? "";
            return { id, company, title };
          })
          .filter((c): c is { id: string; company: string; title: string } => c !== null)
    );

    let newOnThisPage = 0;
    let skippedBlocked = 0;
    for (const { id, company, title } of pageCards) {
      const compLower  = company.toLowerCase();
      const titleLower = title.toLowerCase();

      // Skip blocked companies
      if (blockedCoSet.size > 0 && company && blockedCoSet.has(compLower)) {
        skippedBlocked++;
        continue;
      }

      // Skip jobs whose listing-card title already matches a blocked keyword
      if (blockedKwList.length > 0) {
        const hitKw = blockedKwList.find((kw) => titleLower.includes(kw.toLowerCase()));
        if (hitKw) {
          skippedBlocked++;
          continue;
        }
      }

      // Positive title check: title must contain at least one entry from the
      // hardcoded ROLE_KEYWORDS list — catches off-topic roles (Graphic Designer,
      // Clinical Coordinator, etc.) before we ever open their detail pages.
      const hasTitleMatch = ROLE_KEYWORDS.some((kw) => titleLower.includes(kw.toLowerCase()));
      if (!hasTitleMatch) {
        skippedBlocked++;
        continue;
      }
      const link = `https://www.linkedin.com/jobs/view/${id}/`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allLinks.push(link);
        newOnThisPage++;
      }
    }
    if (skippedBlocked > 0) {
      console.log(`🚫 Skipped ${skippedBlocked} cards (blocked company or title keyword) on page ${pageIndex + 1}`);
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
    // Gaussian inter-page pause — ~3.5 s average, feels like manually typing
    // the next page URL. Occasionally adds a longer "reading" break.
    await gaussianDelay(3_500, 1_000);
    await maybeBreak();
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
          // Add Referer so LinkedIn sees us arriving from a search results page,
          // not from a direct URL bar navigation (a common bot tell).
          await jobPage.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
            referer: "https://www.linkedin.com/jobs/search/",
          });
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

      // Wait for the description box — fires as soon as content is ready.
      await jobPage
        .waitForSelector(
          '[data-testid="expandable-text-box"], [data-sdui-component*="aboutTheJob"]',
          { timeout: 10_000 }
        )
        .catch(() => {}); // if it never appears, continue anyway

      // Simulate reading: scroll partway down the job description, then pause.
      // LinkedIn's engagement signals include scroll depth and time-on-page.
      await humanScroll(jobPage, 500);
      await moveMouseRandomly(jobPage);
      await randomDelay(600, 1_400);

      // ── Title: always in <title> as "Job Title | Company | LinkedIn" ──
      const rawTitle = await jobPage.title();
      const titleParts = rawTitle.split(" | ");
      const title = titleParts[0]?.trim() || "Unknown title";

      // ── Company name + logo: LinkedIn sets aria-label="Company, <Name>." on the logo link ──
      // The same element that holds the aria-label also contains the <img> for the logo.
      const { company, companyLogo } = await jobPage
        .evaluate(() => {
          const el = document.querySelector('[aria-label^="Company, "]');
          const name = el
            ? (el.getAttribute("aria-label") ?? "")
                .replace(/^Company,\s*/, "")
                .replace(/\.$/, "")
                .trim()
            : null;
          // Logo: try <img> inside the link, then nearby containers
          const imgEl =
            el?.querySelector("img") ??
            document.querySelector(".job-details-jobs-unified-top-card__company-logo img") ??
            document.querySelector(".artdeco-entity-lockup__image img");
          const logoSrc =
            imgEl?.getAttribute("src") ??
            imgEl?.getAttribute("data-delayed-url") ??
            null;
          // LinkedIn shrinks logo URLs to tiny sizes (&w=48) — bump to 200 px for clarity
          const logo = logoSrc
            ? logoSrc.replace(/(&|\?)w=\d+/gi, "").replace(/&amp;/g, "&")
            : null;
          return { company: name, companyLogo: logo };
        })
        .catch(() => ({ company: null as string | null, companyLogo: null as string | null }));

      const resolvedCompany = company ?? titleParts[1]?.trim() ?? "Unknown company";

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

      console.log(`✅ ${title} @ ${resolvedCompany} | ${location} | ${workType ?? "?"}`);
      return { title, company: resolvedCompany, location, url, description, workType, applicants, companyLogo };
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
      const failedUrl = toScrape[i]!;
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

  // ── Step 5: Local content validation ────────────────────────────────────
  // LinkedIn's Boolean search is not perfectly reliable — it sometimes returns
  // jobs that don't match the query at all (especially the NOT clauses).
  // We run a strict local check on the scraped text before touching the DB:
  //   • Title must contain at least one tech-role keyword (reqList or ROLE_KEYWORDS fallback)
  //   • If required keywords exist  → title OR description must contain at least one
  //   • If blocked keywords exist   → title must NOT contain any of them
  //   • If blocked companies exist  → company must NOT be in the blocked set
  // Anything that fails is logged and discarded silently.
  function passesContentFilter(job: Job): boolean {
    const titleLower = job.title.toLowerCase();
    const descLower  = job.description.toLowerCase();
    const compLower  = job.company.toLowerCase();

    // Blocked company check (second line of defence after the listing-page skip)
    if (blockedCoSet.size > 0 && blockedCoSet.has(compLower)) {
      console.log(`🚫 [filter] Blocked company skipped: "${job.company}" — ${job.title}`);
      return false;
    }

    // Positive title check: always uses ROLE_KEYWORDS (hardcoded tech-role list).
    // reqList (user's required keywords) is for description matching only.
    const hasTitleMatch = ROLE_KEYWORDS.some((kw) => titleLower.includes(kw.toLowerCase()));
    if (!hasTitleMatch) {
      console.log(`🚫 [filter] Off-topic title: "${job.title}" @ ${job.company}`);
      return false;
    }

    // Required keyword: title OR description must contain at least one
    if (reqList.length > 0) {
      const hit = reqList.some(
        (kw) => titleLower.includes(kw.toLowerCase()) || descLower.includes(kw.toLowerCase())
      );
      if (!hit) {
        console.log(`🚫 [filter] No required keyword found: "${job.title}" @ ${job.company}`);
        return false;
      }
    }

    // Blocked keyword: title must NOT contain any
    if (blockedKwList.length > 0) {
      const hit = blockedKwList.find((kw) => titleLower.includes(kw.toLowerCase()));
      if (hit) {
        console.log(`🚫 [filter] Blocked keyword "${hit}" in title: "${job.title}" @ ${job.company}`);
        return false;
      }
    }

    return true;
  }

  const filteredJobs = jobs.filter(passesContentFilter);
  const discarded = jobs.length - filteredJobs.length;
  if (discarded > 0) {
    console.log(`\n🧹 Local filter removed ${discarded} job(s) that slipped through LinkedIn's search.`);
  }

  // ── Step 6: Save to jobs.json (backup) and insert into PostgreSQL ──

  // Backup to file — useful for debugging even when DB is running
  writeFileSync("jobs.json", JSON.stringify(filteredJobs, null, 2));
  console.log(`\n💾 Saved ${filteredJobs.length} jobs to jobs.json`);

  // Insert into PostgreSQL — skip duplicates (same URL already exists)
  let saved = 0;
  for (const job of filteredJobs) {
    try {
      await db.insert(jobsTable).values(job).onConflictDoNothing();
      saved++;
    } catch (err) {
      console.error(`⚠️  DB insert failed for ${job.url}:`, err);
    }
  }

  console.log(`🎉 Done! Inserted ${saved}/${filteredJobs.length} new jobs into PostgreSQL`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
