import type { Job } from "@/lib/schema";
import { RowActions } from "@/components/RowActions";
import { BlockCompanyButton } from "@/components/BlockCompanyButton";

const WORK_TYPE_STYLES: Record<string, string> = {
  Remote: "bg-emerald-100 text-emerald-700",
  Hybrid: "bg-blue-100 text-blue-700",
  "On-site": "bg-orange-100 text-orange-700",
};

function WorkTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-slate-300">—</span>;
  const style = WORK_TYPE_STYLES[type] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${style}`}>
      {type}
    </span>
  );
}

export function JobsTable({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col items-center justify-center py-20 text-slate-400">
        <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mb-3 opacity-40">
          <path d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
        </svg>
        <p className="font-medium">No jobs found</p>
        <p className="text-sm mt-1">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                Title
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                Company
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                Location
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                Type
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                Applicants
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                Actions
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className={`hover:bg-slate-50 transition-colors group ${
                  job.status === "dismissed" ? "opacity-50" : ""
                }`}
              >
                <td className="px-4 py-3 w-72 max-w-[288px]">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-800 hover:text-blue-600 transition-colors truncate block leading-snug"
                    title={job.title}
                  >
                    {job.title}
                  </a>
                </td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                  <span className="flex items-center gap-0">
                    {job.company}
                    <BlockCompanyButton company={job.company} />
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate" title={job.location}>
                  {job.location}
                </td>
                <td className="px-4 py-3">
                  <WorkTypeBadge type={job.workType} />
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {job.applicants ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <RowActions jobId={job.id} currentStatus={job.status ?? null} />
                </td>
                <td className="px-4 py-3">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 hover:text-blue-700"
                    title="Open on LinkedIn"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
