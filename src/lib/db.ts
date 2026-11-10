import "dotenv/config";
import { Pool } from "pg";
const globalDb = globalThis as unknown as { lioPool?: Pool };
export const db =
  globalDb.lioPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  });
if (process.env.NODE_ENV !== "production") globalDb.lioPool = db;
