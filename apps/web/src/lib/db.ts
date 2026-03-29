import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local");
}

// postgres.js connection — Next.js server-side only
const client = postgres(connectionString, { max: 5 });

export const db = drizzle(client, { schema });
