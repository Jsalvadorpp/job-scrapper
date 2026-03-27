# Step 1 – Simple LinkedIn Job Scraper

The goal of this first step is to build a bare-bones scraper that opens LinkedIn job search pages and extracts job listings into a structured format. No database, no queue, no AI yet — just raw scraping working reliably.

---

## What you will build

A Node.js + TypeScript script that:
1. Opens a LinkedIn job search URL (headless browser)
2. Scrolls through results and extracts job cards
3. For each job, clicks into the detail page and grabs the full description
4. Outputs the results as JSON to the console (or a local `.json` file)

---

## Technologies

| Technology | Version | Why |
|---|---|---|
| **Node.js** | 22+ | Runtime |
| **TypeScript** | 5.x | Type safety, better DX |
| **Playwright** | 1.48+ | Controls a real browser; handles LinkedIn's JS-rendered pages and anti-bot measures better than `cheerio`/`axios` |
| **tsx** | 4.x | Run `.ts` files directly without a build step during development |
| **dotenv** | 16.x | Load cookies/credentials from `.env` without hardcoding |

> **Why Playwright over Puppeteer or axios+cheerio?**
> LinkedIn is a Single Page App — job content is loaded dynamically via JavaScript. Playwright controls a real Chromium browser and can wait for elements, scroll, and simulate human behaviour, which is essential to avoid being blocked.

---

## Folder structure for this step

Only create what you need right now:

```
apps/
└── worker/
    └── src/
        └── playwright/
            ├── scraper.ts        ← main scraping logic
            └── browser.ts        ← browser/context setup (stealth config)
.env
```

---

## Step-by-step guide

### 1. Initialise the worker package

Inside `apps/worker/`:
- Create a `package.json` with `"type": "module"`
- Add a `tsconfig.json` that extends the root `tsconfig.base.json`
- Add a `dev` script using `tsx` to run `src/playwright/scraper.ts`

Key dependencies to install:
```
playwright
tsx
typescript
dotenv
@types/node
```

After installing, run:
```bash
npx playwright install chromium
```
This downloads the Chromium browser binary Playwright needs.

---

### 2. Create the browser setup (`browser.ts`)

This file is responsible for launching the browser and creating a context that looks like a real human user.

Things to configure here:
- **`headless: false`** to start — run it in a visible window so you can see what's happening while you develop. Switch to `true` later.
- **`userAgent`** — set a realistic desktop Chrome user agent string
- **`locale`** and **`viewport`** — set to `en-US` and a normal desktop resolution
- **`extraHTTPHeaders`** — add an `Accept-Language: en-US` header

> Tip: Playwright's `BrowserContext` is the object that holds cookies and session state. Creating a context per scrape run keeps sessions isolated.

---

### 3. Create the scraper (`scraper.ts`)

This is the main script. Structure it in three phases:

**Phase 1 — Navigate to search results**

Build a LinkedIn job search URL. The base URL looks like:
```
https://www.linkedin.com/jobs/search/?keywords=ROLE&location=LOCATION&f_TPR=r86400
```
- `keywords` — the job title you are searching for (e.g. `Software Engineer`)
- `location` — city or country
- `f_TPR=r86400` — posted in the last 24 hours (optional filter)

Go to the URL and wait for the job list container to appear. The selector for the job cards list is typically:
```
ul.jobs-search__results-list
```

**Phase 2 — Extract job card links**

Each `<li>` in the list contains an `<a>` tag with the job detail URL. Extract the `href` from each one and collect them into an array.

Scroll down the page to trigger loading more cards — LinkedIn uses infinite scroll. You can automate this with `page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))` in a loop with small delays.

**Phase 3 — Visit each job detail page**

For each URL collected, open it in a new page and extract:

| Field | Selector (approximate) |
|---|---|
| `title` | `h1.top-card-layout__title` |
| `company` | `a.topcard__org-name-link` |
| `location` | `span.topcard__flavor--bullet` |
| `description` | `div.description__text` |

> ⚠️ LinkedIn's selectors change regularly. If something stops working, open the page in a real browser, inspect the element, and update the selector. This is normal scraper maintenance.

Output each job as a plain object:
```ts
{
  title: string
  company: string
  location: string
  url: string
  description: string
}
```

---

### 4. Handle rate limiting and blocks

LinkedIn will block you if you scrape too fast. Add these protections:

- **Random delay between requests** — wait 2–5 seconds between each job detail page visit. Use `setTimeout` wrapped in a promise, with a random number in the range.
- **Limit per run** — process a max of 10–20 jobs per run while testing
- **Catch errors per job** — wrap each detail page scrape in a try/catch so one failed page doesn't kill the whole run

---

### 5. Output the results

For now, write the results to a local file called `jobs.json` using `fs.writeFileSync`. This gives you something concrete to look at and verify before you add a database.

---

## What to NOT build yet

- ❌ Database connection
- ❌ RabbitMQ queue
- ❌ AI scoring
- ❌ Docker
- ❌ Any frontend

Keep this step focused. Once the scraper reliably returns clean JSON for 10–20 jobs, you are ready for Step 2.

---

## Definition of done for this step

- [ ] Running `pnpm dev` inside `apps/worker` launches the browser and scrapes LinkedIn
- [ ] At least 10 jobs are extracted with title, company, location, URL, and description fields
- [ ] Results are written to `jobs.json`
- [ ] The script does not crash on a single failed page (error handling in place)
- [ ] No hardcoded credentials — any auth tokens/cookies come from `.env`
