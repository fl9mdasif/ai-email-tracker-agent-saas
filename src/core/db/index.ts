import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireConfig } from "@/core/config";

function createDb() {
  return drizzle(neon(requireConfig("DATABASE_URL")));
}

export type Database = ReturnType<typeof createDb>;

let instance: Database | undefined;

/** Lazy singleton so importing this file never needs DATABASE_URL at build time. */
export function getDb(): Database {
  instance ??= createDb();
  return instance;
}
