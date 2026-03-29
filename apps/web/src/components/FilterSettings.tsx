"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { BlockedCompany, BlockedKeyword, RequiredKeyword } from "@/lib/schema";

interface FilterSettingsProps {
  companies: BlockedCompany[];
  keywords: BlockedKeyword[];
  requiredKeywords: RequiredKeyword[];
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface SectionProps {
  title: string;
  description: string;
  count: number;
  accentColor: "blue" | "emerald";
  children: React.ReactNode;
}

function Section({ title, description, count, accentColor, children }: SectionProps) {
  const [open, setOpen] = useState(true);
  const chevronColor = accentColor === "emerald" ? "text-emerald-600" : "text-blue-600";
  const badge = accentColor === "emerald"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-blue-100 text-blue-700";

  return (
    <section className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          {count > 0 && (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${badge}`}>
              {count}
            </span>
          )}
        </div>
        <span className={chevronColor}><ChevronIcon open={open} /></span>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-slate-400">{description}</p>
          {children}
        </div>
      )}
    </section>
  );
}

export function FilterSettings({ companies, keywords, requiredKeywords }: FilterSettingsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [requiredInput, setRequiredInput] = useState("");
  const [loading, setLoading] = useState(false);
  const companyRef = useRef<HTMLInputElement>(null);
  const keywordRef = useRef<HTMLInputElement>(null);
  const requiredRef = useRef<HTMLInputElement>(null);

  async function addCompany() {
    const name = companyInput.trim();
    if (!name) return;
    setLoading(true);
    await fetch("/api/blocked/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCompanyInput("");
    router.refresh();
    setLoading(false);
    companyRef.current?.focus();
  }

  async function removeCompany(id: number) {
    await fetch(`/api/blocked/companies/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function addKeyword() {
    const keyword = keywordInput.trim();
    if (!keyword) return;
    setLoading(true);
    await fetch("/api/blocked/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    setKeywordInput("");
    router.refresh();
    setLoading(false);
    keywordRef.current?.focus();
  }

  async function removeKeyword(id: number) {
    await fetch(`/api/blocked/keywords/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function addRequiredKeyword() {
    const keyword = requiredInput.trim();
    if (!keyword) return;
    setLoading(true);
    await fetch("/api/required/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    setRequiredInput("");
    router.refresh();
    setLoading(false);
    requiredRef.current?.focus();
  }

  async function removeRequiredKeyword(id: number) {
    await fetch(`/api/required/keywords/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const totalBlocked = companies.length + keywords.length;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
      >
        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Filters
        {totalBlocked > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-blue-600 text-white">
            {totalBlocked}
          </span>
        )}
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <aside className="relative z-10 w-full max-w-md h-screen bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Filter Settings</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">

              {/* ── Blocked Companies ───────────────── */}
              <Section
                title="Blocked companies"
                description="Jobs from these companies are hidden from all results."
                count={companies.length}
                accentColor="blue"
              >
                <div className="flex gap-2">
                  <input
                    ref={companyRef}
                    type="text"
                    placeholder="Company name…"
                    value={companyInput}
                    onChange={(e) => setCompanyInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCompany()}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
                  />
                  <button
                    onClick={addCompany}
                    disabled={loading || !companyInput.trim()}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Add
                  </button>
                </div>
                {companies.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No companies blocked yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {companies.map((c) => (
                      <li key={c.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <span className="text-sm text-slate-700">{c.name}</span>
                        <button onClick={() => removeCompany(c.id)} className="text-slate-400 hover:text-red-500 transition-colors p-0.5" title="Remove">
                          <CloseIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* ── Blocked Title Keywords ──────────── */}
              <Section
                title="Blocked title keywords"
                description="Jobs whose title contains any of these words are hidden."
                count={keywords.length}
                accentColor="blue"
              >
                <div className="flex gap-2">
                  <input
                    ref={keywordRef}
                    type="text"
                    placeholder="e.g. senior, manager…"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
                  />
                  <button
                    onClick={addKeyword}
                    disabled={loading || !keywordInput.trim()}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Add
                  </button>
                </div>
                {keywords.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No keywords blocked yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {keywords.map((k) => (
                      <li key={k.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <code className="text-sm text-slate-700">{k.keyword}</code>
                        <button onClick={() => removeKeyword(k.id)} className="text-slate-400 hover:text-red-500 transition-colors p-0.5" title="Remove">
                          <CloseIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* ── Required Description Keywords ───── */}
              <Section
                title="Required description keywords"
                description="When set, only jobs whose description contains at least one of these words are shown."
                count={requiredKeywords.length}
                accentColor="emerald"
              >
                <div className="flex gap-2">
                  <input
                    ref={requiredRef}
                    type="text"
                    placeholder="e.g. react, typescript…"
                    value={requiredInput}
                    onChange={(e) => setRequiredInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addRequiredKeyword()}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400"
                  />
                  <button
                    onClick={addRequiredKeyword}
                    disabled={loading || !requiredInput.trim()}
                    className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Add
                  </button>
                </div>
                {requiredKeywords.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No required keywords set — all jobs are shown.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {requiredKeywords.map((k) => (
                      <li key={k.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        <code className="text-sm text-emerald-800">{k.keyword}</code>
                        <button onClick={() => removeRequiredKeyword(k.id)} className="text-emerald-400 hover:text-red-500 transition-colors p-0.5" title="Remove">
                          <CloseIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

            </div>
          </aside>
        </div>
      )}
    </>
  );
}
