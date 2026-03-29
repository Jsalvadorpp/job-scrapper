import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Board",
  description: "LinkedIn job scraper dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
