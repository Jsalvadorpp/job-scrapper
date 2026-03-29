"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BlockCompanyButton({ company }: { company: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  async function block() {
    await fetch("/api/blocked/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: company }),
    });
    setDone(true);
    router.refresh();
  }

  if (done) return null;

  return (
    <button
      onClick={block}
      title={`Block "${company}"`}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
    >
      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    </button>
  );
}
