import { chromium } from "playwright";
import { readFileSync } from "fs";

const cookies = JSON.parse(readFileSync("linkedin-cookies.json", "utf-8"));
const browser = await chromium.launch({
  headless: false,
  args: ["--disable-blink-features=AutomationControlled"],
});
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  locale: "en-US",
  viewport: { width: 1280, height: 800 },
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
await ctx.addCookies(cookies);
const page = await ctx.newPage();

await page.goto(
  "https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&keywords=software%20engineer&geoId=91000011&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true&start=0",
  { waitUntil: "domcontentloaded", timeout: 30_000 }
);
await page.waitForSelector("li[data-occludable-job-id]", { timeout: 10_000 });
await page.waitForTimeout(3000);

const result = await page.$$eval("li[data-occludable-job-id]", (els) =>
  els.map((e) => ({
    id: e.getAttribute("data-occludable-job-id"),
    href: e.querySelector("a")?.getAttribute("href")?.slice(0, 80) ?? null,
    text: e.innerText.slice(0, 50).replace(/\n/g, " "),
  }))
);

console.log(`\nTotal li[data-occludable-job-id]: ${result.length}\n`);
result.forEach((r, i) => {
  const numeric = r.id ? /^\d+$/.test(r.id) : false;
  console.log(
    `[${i + 1}] id=${r.id} numeric=${numeric} | text: "${r.text}" | href: ${r.href}`
  );
});

const numericIds = result
  .map((r) => r.id)
  .filter((id): id is string => !!id && /^\d+$/.test(id));
console.log(`\nNumeric IDs: ${numericIds.length}`);

await browser.close();
