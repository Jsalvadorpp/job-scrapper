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
  matchScore: integer("match_score"),
  status: text("status"), // "applied" | "dismissed" | null
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blockedCompanies = pgTable("blocked_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
export type BlockedCompany = typeof blockedCompanies.$inferSelect;
export type BlockedKeyword = typeof blockedKeywords.$inferSelect;
export type RequiredKeyword = typeof requiredKeywords.$inferSelect;
