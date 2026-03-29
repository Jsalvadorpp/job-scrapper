"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RowActionsProps {
  jobId: number;
  currentStatus: string | null;
}

export function RowActions({ jobId, currentStatus }: RowActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(status: string | null) {
    // Toggle: clicking the active status clears it
    const next = currentStatus === status ? null : status;
    setLoading(true);
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const isApplied = currentStatus === "applied";
  const isDismissed = currentStatus === "dismissed";

  return (
    <div className={`flex items-center gap-1 transition-opacity ${loading ? "opacity-40 pointer-events-none" : ""}`}>
      {/* Applied */}
      <button
        onClick={() => setStatus("applied")}
        title={isApplied ? "Remove applied mark" : "Mark as applied"}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
          isApplied
            ? "bg-emerald-100 border-emerald-300 text-emerald-700 font-medium"
            : "border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50"
        }`}
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {isApplied ? "Applied" : "Apply"}
      </button>

      {/* Dismiss */}
      <button
        onClick={() => setStatus("dismissed")}
        title={isDismissed ? "Restore job" : "Dismiss job"}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
          isDismissed
            ? "bg-red-100 border-red-300 text-red-700 font-medium"
            : "border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50"
        }`}
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Hide
      </button>
    </div>
  );
}
