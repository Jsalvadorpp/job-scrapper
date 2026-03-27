# jobsWorker

Scrapes LinkedIn job postings and saves them to a local PostgreSQL database.

---

## Requirements

Before you start, make sure you have these installed:

- [Node.js 22+](https://nodejs.org)
- [pnpm](https://pnpm.io) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop) — must be running

---

## First-time setup

```bash
# 1. Go into this folder
cd apps/jobsWorker

# 2. Install dependencies
pnpm install

# 3. Install Playwright's Chromium browser
pnpm exec playwright install chromium

# 4. Copy the environment variables file
cp .env.example .env
```

The default `.env` already has the right values for local development — no changes needed.

---

## Every time you want to run the scraper

```bash
# Step 1 — start the database (skip if it's already running)
pnpm db:up

# Step 2 — run the scraper
pnpm dev
```

That's it. The scraper will open a real Chrome window and start collecting jobs.

---

## First run — you'll need to log in

On the very first run there are no saved cookies, so the scraper will open LinkedIn's login page and wait for you to sign in manually.

1. A Chrome window opens at `linkedin.com/login`
2. Log in with your (throwaway) LinkedIn account
3. Once you land on the feed, the scraper continues automatically
4. Your session is saved to `linkedin-cookies.json` — **next runs skip this step**

> If your session expires later, delete `linkedin-cookies.json` and log in again.

---

## Results

| Output | Description |
|---|---|
| `jobs.json` | Backup file — every scraped job as JSON |
| PostgreSQL `jobs` table | The same data stored in the database |

To browse the database visually:

```bash
pnpm studio
```

This opens Drizzle Studio in your browser where you can see all rows in the `jobs` table.

---

## Other useful commands

| Command | What it does |
|---|---|
| `pnpm db:up` | Start Postgres + sync schema (run before `pnpm dev`) |
| `pnpm db:down` | Stop the Postgres container |
| `pnpm db:reset` | Wipe all data and start fresh |
| `pnpm studio` | Open Drizzle Studio to browse the DB |

---

## Troubleshooting

**LinkedIn shows a login popup or captcha**
→ Delete `linkedin-cookies.json` and re-run. Log in manually when the window opens.

**`db:up` fails or hangs**
→ Make sure Docker Desktop is open and running.

**`Cannot find module` errors**
→ Run `pnpm install` again.

**Selectors return empty strings (title/company shows "Unknown")**
→ LinkedIn may have updated their page structure. Open a job page in Chrome, right-click the title → Inspect, and find the new class name. Update the selectors in `extractor/scrapper.ts`.
