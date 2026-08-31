// Shared Postgres connection pool for the app's in-process backend.
//
// Replaces the Supabase/PostgREST data plane. Every ported edge function talks
// to Postgres through the supabase-compat client, which uses this pool.

import { Pool, types } from "pg";

// --- PostgREST-faithful type parsing ---------------------------------------
// Supabase (PostgREST) serializes these as JSON strings/numbers; node-postgres
// defaults to JS Date objects and strings, which breaks code that compares
// `due_date === "2026-06-17"` or does arithmetic on numeric columns.
types.setTypeParser(1082, (v: string) => v); // date -> "YYYY-MM-DD"
types.setTypeParser(1114, (v: string) => (v ? v.replace(" ", "T") : v)); // timestamp
types.setTypeParser(1184, (v: string) => {
  // timestamptz "2026-06-17 12:34:56.789+00" -> "2026-06-17T12:34:56.789+00:00"
  if (!v) return v;
  let s = v.replace(" ", "T");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  return s;
});
types.setTypeParser(1700, (v: string | null) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v: string | null) => (v === null ? null : parseInt(v, 10))); // int8

const globalForPg = globalThis as unknown as { __abbyglowPgPool?: Pool };

function createPool(): Pool {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "";
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set, so the Postgres backend cannot start."
    );
  }

  const max = Number(process.env.PG_POOL_MAX || 10);
  const idleTimeoutMillis = Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000);
  const connectionTimeoutMillis = Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10_000);
  const statementTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 30_000);

  const pool = new Pool({
    connectionString,
    max: Number.isFinite(max) && max > 0 ? max : 10,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) ? idleTimeoutMillis : 30_000,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis)
      ? connectionTimeoutMillis
      : 10_000,
    // Self-hosted Postgres on the same host / private network: TLS optional.
    // Prefer private networking; rejectUnauthorized:false is intentional for
    // self-signed certs on private VPS links — do not expose PG publicly.
    ssl:
      process.env.PGSSL === "require"
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === "true" }
        : undefined,
  });

  pool.on("error", (err) => {
    console.error("[pg-pool] Idle client error:", err.message);
  });

  // Apply statement timeout per new connection (cancels runaway queries).
  if (Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0) {
    pool.on("connect", (client) => {
      client.query(`SET statement_timeout = ${Math.floor(statementTimeoutMs)}`).catch(() => {
        /* non-fatal */
      });
    });
  }

  return pool;
}

export function getPool(): Pool {
  if (globalForPg.__abbyglowPgPool) return globalForPg.__abbyglowPgPool;
  const pool = createPool();
  // Survive Next.js hot reload in development (prevents orphaned pools / too many clients).
  globalForPg.__abbyglowPgPool = pool;
  return pool;
}

export async function query<T = any>(
  text: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool();
  const res = await pool.query(text, params as any[]);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}
