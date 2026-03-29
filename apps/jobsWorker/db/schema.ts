// ─── Drizzle Schema ────────────────────────────────────────────────────────
// This file defines the shape of the "jobs" table in PostgreSQL.
// Drizzle reads this to:
//   1. Generate SQL migrations (pnpm migrate)
//   2. Give you full TypeScript types when inserting/querying

import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  url: text("url").notNull().unique(),
  description: text("description").notNull(),
  workType: text("work_type"),
  applicants: text("applicants"),
  companyLogo: text("company_logo"),  // LinkedIn CDN URL for the company logo image
  matchScore: integer("match_score"),
  // User-set status: "applied" | "dismissed" | null (null = untouched)
  status: text("status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Companies the user never wants to see in results
export const blockedCompanies = pgTable("blocked_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Keywords — any job whose title contains one of these is hidden
export const blockedKeywords = pgTable("blocked_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Keywords — only jobs whose description contains at least one of these are shown
export const requiredKeywords = pgTable("required_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type BlockedCompany = typeof blockedCompanies.$inferSelect;
export type BlockedKeyword = typeof blockedKeywords.$inferSelect;
