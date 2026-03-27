// ─── Database Client ────────────────────────────────────────────────────────
// Creates a single shared database connection used throughout the app.
// We use the "postgres" driver (postgres.js) under the hood.

import "dotenv/config"; // load DATABASE_URL from .env
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// DATABASE_URL comes from your .env file, e.g.:
// postgresql://postgres:postgres@localhost:5432/jobscrapper
const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to your .env file.");
}

// The raw Postgres connection
const client = postgres(connectionString);

// The Drizzle ORM layer — this is what you use to query/insert
export const db = drizzle(client, { schema });
