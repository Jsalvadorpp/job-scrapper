"use client";

interface Props {
  src: string | null;
  company: string;
}

export function CompanyLogo({ src, company }: Props) {
  if (!src) {
    return (
      <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0 uppercase">
        {company.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={company}
      width={28}
      height={28}
      className="rounded-md object-contain border border-slate-100 bg-white shrink-0"
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        img.style.display = "none";
        // Show the initial fallback by inserting a sibling span
        const span = document.createElement("span");
        span.className =
          "w-7 h-7 rounded-md bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0 uppercase";
        span.textContent = company.charAt(0).toUpperCase();
        img.parentNode?.insertBefore(span, img);
      }}
    />
  );
}
