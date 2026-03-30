import { db } from "./db";
import { blockedCompanies, blockedKeywords, jobs, requiredKeywords } from "./schema";
import type { BlockedCompany, BlockedKeyword, Job, RequiredKeyword } from "./schema";
import { and, asc, count, desc, eq, ilike, isNull, ne, not, or, sql } from "drizzle-orm";
import { PER_PAGE } from "./constants";

export type { Job, BlockedCompany, BlockedKeyword, RequiredKeyword };
export { PER_PAGE };

export interface JobFilters {
  search?: string;         // matches title or company
  workType?: string;       // "Remote" | "Hybrid" | "On-site"
  location?: string;       // partial match
  sort?: "newest" | "oldest" | "applicants";
  page?: number;           // 1-based, defaults to 1
  showDismissed?: boolean; // include dismissed jobs (default: false)
  statusFilter?: string;   // "applied" | "all" — show only applied, or all non-dismissed
  hideApplied?: boolean;   // exclude applied jobs from results
}

function buildWhere(filters: JobFilters) {
  const conditions = [];

  // Text search: title or company
  if (filters.search?.trim()) {
    conditions.push(
      or(
        ilike(jobs.title, `%${filters.search.trim()}%`),
        ilike(jobs.company, `%${filters.search.trim()}%`)
      )
    );
  }

  // Work type
  if (filters.workType) {
    conditions.push(eq(jobs.workType, filters.workType));
  }

  // Location
  if (filters.location?.trim()) {
    conditions.push(ilike(jobs.location, `%${filters.location.trim()}%`));
  }

  // Status: by default hide dismissed; show them only when showDismissed=true
  if (!filters.showDismissed) {
    conditions.push(or(isNull(jobs.status), ne(jobs.status, "dismissed")));
  }

  // Status filter: only show "applied" jobs when requested
  if (filters.statusFilter === "applied") {
    conditions.push(eq(jobs.status, "applied"));
  }

  // Hide applied: exclude jobs already applied to
  if (filters.hideApplied) {
    conditions.push(or(isNull(jobs.status), ne(jobs.status, "applied")));
  }

  // Blocked companies: exclude any job whose company is in the blocked_companies table
  conditions.push(
    not(
      sql`EXISTS (
        SELECT 1 FROM ${blockedCompanies}
        WHERE lower(${blockedCompanies.name}) = lower(${jobs.company})
      )`
    )
  );

  // Blocked keywords: exclude jobs whose title contains any blocked keyword
  conditions.push(
    not(
      sql`EXISTS (
        SELECT 1 FROM ${blockedKeywords}
        WHERE ${jobs.title} ILIKE '%' || ${blockedKeywords.keyword} || '%'
      )`
    )
  );

  // Required description keywords: if any are defined, only show jobs whose
  // description contains at least one of them (no-op when table is empty)
  conditions.push(
    sql`(
      NOT EXISTS (SELECT 1 FROM ${requiredKeywords})
      OR EXISTS (
        SELECT 1 FROM ${requiredKeywords}
        WHERE ${jobs.description} ILIKE '%' || ${requiredKeywords.keyword} || '%'
      )
    )`
  );

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getJobsCount(filters: JobFilters = {}): Promise<number> {
  const where = buildWhere(filters);
  const [result] = await db.select({ count: count() }).from(jobs).where(where);
  return result?.count ?? 0;
}

export async function getJobs(filters: JobFilters = {}): Promise<Job[]> {
  const where = buildWhere(filters);
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * PER_PAGE;

  if (filters.sort === "oldest") {
    return db.select().from(jobs).where(where).orderBy(asc(jobs.createdAt)).limit(PER_PAGE).offset(offset);
  }

  if (filters.sort === "applicants") {
    return db
      .select()
      .from(jobs)
      .where(where)
      .orderBy(
        sql`CAST(NULLIF(regexp_replace(${jobs.applicants}, '[^0-9]', '', 'g'), '') AS INTEGER) DESC NULLS LAST`
      )
      .limit(PER_PAGE)
      .offset(offset);
  }

  return db.select().from(jobs).where(where).orderBy(desc(jobs.createdAt)).limit(PER_PAGE).offset(offset);
}

export async function getStats() {
  const [result] = await db
    .select({
      total: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      remote: sql<number>`CAST(COUNT(*) FILTER (WHERE ${jobs.workType} = 'Remote') AS INTEGER)`,
      hybrid: sql<number>`CAST(COUNT(*) FILTER (WHERE ${jobs.workType} = 'Hybrid') AS INTEGER)`,
      onsite: sql<number>`CAST(COUNT(*) FILTER (WHERE ${jobs.workType} = 'On-site') AS INTEGER)`,
      applied: sql<number>`CAST(COUNT(*) FILTER (WHERE ${jobs.status} = 'applied') AS INTEGER)`,
    })
    .from(jobs);
  return result;
}

export async function getBlockedLists() {
  const [companies, keywords, required] = await Promise.all([
    db.select().from(blockedCompanies).orderBy(asc(blockedCompanies.name)),
    db.select().from(blockedKeywords).orderBy(asc(blockedKeywords.keyword)),
    db.select().from(requiredKeywords).orderBy(asc(requiredKeywords.keyword)),
  ]);
  return { companies, keywords, requiredKeywords: required };
}
