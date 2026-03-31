"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const WORK_TYPES = ["Remote", "Hybrid", "On-site"] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "applicants", label: "Most applicants" },
] as const;

export function Filters({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Local state for debounced text inputs
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [location, setLocation] = useState(params.get("location") ?? "");

  // Push new params to the URL
  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      }
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router]
  );

  // Debounce text search (300ms) — also resets to page 1
  useEffect(() => {
    const t = setTimeout(() => updateParams({ search, page: "" }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Debounce location (300ms) — also resets to page 1
  useEffect(() => {
    const t = setTimeout(() => updateParams({ location, page: "" }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const activeWorkType = params.get("workType") ?? "";
  const activeSort = params.get("sort") ?? "newest";
  const showDismissed = params.get("showDismissed") === "1";
  const hideApplied = params.get("hideApplied") === "1";
  const statusFilter = params.get("statusFilter") ?? "";
  const last24h = params.get("last24h") === "1";
  const hasFilters = !!(
    params.get("search") ||
    params.get("location") ||
    params.get("workType") ||
    params.get("statusFilter") ||
    params.get("showDismissed") ||
    params.get("hideApplied") ||
    params.get("last24h")
  );

  function clearAll() {
    setSearch("");
    setLocation("");
    router.push(pathname);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap gap-3">
        {/* Text search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search title or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
          />
        </div>

        {/* Location */}
        <div className="relative flex-1 min-w-[160px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Filter by location…"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
          />
        </div>

        {/* Work type */}
        <select
          value={activeWorkType}
          onChange={(e) => updateParams({ workType: e.target.value, page: "" })}
          className="py-2 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="">All types</option>
          {WORK_TYPES.map((wt) => (
            <option key={wt} value={wt}>
              {wt}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={activeSort}
          onChange={(e) => updateParams({ sort: e.target.value, page: "" })}
          className="py-2 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Status toggles */}
        <button
          onClick={() => updateParams({ statusFilter: statusFilter === "applied" ? "" : "applied", page: "" })}
          className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
            statusFilter === "applied"
              ? "bg-emerald-600 border-emerald-600 text-white font-medium"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          ✓ Applied only
        </button>
        <button
          onClick={() => updateParams({ hideApplied: hideApplied ? "" : "1", statusFilter: "", page: "" })}
          className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
            hideApplied
              ? "bg-violet-600 border-violet-600 text-white font-medium"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          Hide applied
        </button>
        <button
          onClick={() => updateParams({ showDismissed: showDismissed ? "" : "1", page: "" })}
          className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
            showDismissed
              ? "bg-slate-700 border-slate-700 text-white font-medium"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          Show hidden
        </button>
        <button
          onClick={() => updateParams({ last24h: last24h ? "" : "1", page: "" })}
          className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
            last24h
              ? "bg-amber-500 border-amber-500 text-white font-medium"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          Last 24h
        </button>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="py-2 px-3 text-sm text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="mt-2 text-xs text-slate-400">
        Showing <span className="font-semibold text-slate-600">{total}</span> jobs
        {hasFilters && " (filtered)"}
      </p>
    </div>
  );
}
