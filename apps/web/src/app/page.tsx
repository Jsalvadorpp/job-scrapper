import { Suspense } from "react";
import { getBlockedLists, getJobs, getJobsCount, getStats } from "@/lib/queries";
import { JobsTable } from "@/components/JobsTable";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { FilterSettings } from "@/components/FilterSettings";
import type { JobFilters } from "@/lib/queries";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    workType?: string;
    location?: string;
    sort?: string;
    page?: string;
    showDismissed?: string;
    statusFilter?: string;
  }>;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
      <p className="text-2xl font-bold text-slate-800">{value.toLocaleString()}</p>
      <p className={`text-xs font-medium mt-0.5 ${color}`}>{label}</p>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const currentPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const filters: JobFilters = {
    search: sp.search,
    workType: sp.workType,
    location: sp.location,
    sort: (sp.sort as JobFilters["sort"]) ?? "newest",
    page: currentPage,
    showDismissed: sp.showDismissed === "1",
    statusFilter: sp.statusFilter,
  };

  const [jobs, total, stats, blocked] = await Promise.all([
    getJobs(filters),
    getJobsCount(filters),
    getStats(),
    getBlockedLists(),
  ]);

  return (
    <div className="min-h-screen">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="text-blue-600">
                <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </span>
              Job Board
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              LinkedIn jobs scraped automatically
            </p>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 flex-wrap">
            <StatCard label="Total jobs" value={stats?.total ?? 0} color="text-slate-500" />
            <StatCard label="Remote" value={stats?.remote ?? 0} color="text-emerald-600" />
            <StatCard label="Hybrid" value={stats?.hybrid ?? 0} color="text-blue-600" />
            <StatCard label="On-site" value={stats?.onsite ?? 0} color="text-orange-600" />
            <StatCard label="Applied" value={stats?.applied ?? 0} color="text-violet-600" />
          </div>

          {/* Settings */}
          <Suspense>
            <FilterSettings
              companies={blocked.companies}
              keywords={blocked.keywords}
              requiredKeywords={blocked.requiredKeywords}
            />
          </Suspense>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="max-w-screen-2xl mx-auto px-3 sm:px-4 py-4 flex flex-col gap-4">
        <Suspense>
          <Filters total={total} />
        </Suspense>

        <JobsTable jobs={jobs} />

        <Suspense>
          <Pagination total={total} currentPage={currentPage} />
        </Suspense>
      </main>
    </div>
  );
}
