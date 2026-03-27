// ─── Drizzle Schema ────────────────────────────────────────────────────────
// This file defines the shape of the "jobs" table in PostgreSQL.
// Drizzle reads this to:
//   1. Generate SQL migrations (pnpm migrate)
//   2. Give you full TypeScript types when inserting/querying

import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  // Auto-incrementing primary key — Postgres assigns this automatically
  id: serial("id").primaryKey(),

  // The job posting details scraped from LinkedIn
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  url: text("url").notNull().unique(), // unique prevents duplicate jobs
  description: text("description").notNull(),

  // Work arrangement — "Remote", "Hybrid", "On-site", or null if LinkedIn didn't show it
  workType: text("work_type"),

  // How many people have already applied — e.g. "47 applicants", null if not shown
  applicants: text("applicants"),

  // AI score added in a later step (null for now)
  matchScore: integer("match_score"),

  // When the row was inserted — Postgres fills this automatically
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// This type represents one row as TypeScript knows it
export type Job = typeof jobs.$inferSelect;
// This type is what you pass to db.insert() — id and createdAt are optional
export type NewJob = typeof jobs.$inferInsert;
