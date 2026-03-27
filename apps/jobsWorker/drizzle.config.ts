// ─── Drizzle Kit Config ─────────────────────────────────────────────────────
// Drizzle Kit is the CLI tool that reads your schema and generates SQL migrations.
// Run: pnpm migrate   → applies pending migrations to the database
// Run: pnpm studio    → opens a visual browser UI to inspect your DB

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Where your schema lives
  schema: "./db/schema.ts",

  // Where migration SQL files will be saved
  out: "./db/migrations",

  // Which database driver to use
  dialect: "postgresql",

  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
