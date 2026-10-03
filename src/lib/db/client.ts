import { sql } from "@vercel/postgres";

/**
  Vercel Postgres client wrapper with connection pooling and retry logic.
  In production, this uses the Vercel Postgres (Neon) connection pool.
  In development without DATABASE_URL, it gracefully degrades.
*/

/**
  A value the driver can bind to a placeholder.
 *
  Exactly the driver's own `Primitive`, restated rather than reinvented. An earlier
  version of this file used `any[]`, which meant a mistyped column name or an
  object passed where a string was meant compiled cleanly and only failed against
  the live database. Matching the driver keeps call sites checked; timestamps go
  in as ISO strings, as the driver requires.
 */
export type SqlParam = string | number | boolean | undefined | null;

export type SqlValues = readonly SqlParam[];

export function checkDatabaseAvailability(): boolean {
  return typeof process !== "undefined" && Boolean(process.env.DATABASE_URL);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 100
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

/**
 * Execute a query with automatic retry and connection checking.
 * Returns { data, error } tuple for easy error handling.
 */
export async function query<T = unknown>(
  strings: TemplateStringsArray,
  ...values: SqlParam[]
): Promise<{ data: T[] | null; error: Error | null }> {
  if (!checkDatabaseAvailability()) {
    return { data: null, error: new Error("Database not configured") };
  }

  try {
    const result = await withRetry(() => sql(strings, ...values));
    return { data: result.rows as T[], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Execute a query that returns a single row.
 */
export async function queryOne<T = unknown>(
  strings: TemplateStringsArray,
  ...values: SqlParam[]
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await query<T>(strings, ...values);
  if (error) return { data: null, error };
  return { data: (data?.[0] ?? null) as T | null, error: null };
}

/**
 * Execute multiple queries in a transaction-like manner.
 * Note: Vercel Postgres (Neon) doesn't support traditional transactions over HTTP.
 * This executes queries sequentially but doesn't provide atomicity.
 * For true transactions, consider using a different database driver or direct connection.
 */
export async function transaction<T>(
  fn: (tx: {
    query: <R = unknown>(strings: TemplateStringsArray, ...values: SqlParam[]) => Promise<R[]>;
    queryOne: <R = unknown>(strings: TemplateStringsArray, ...values: SqlParam[]) => Promise<R | null>;
  }) => Promise<T>
): Promise<{ data: T | null; error: Error | null }> {
  if (!checkDatabaseAvailability()) {
    return { data: null, error: new Error("Database not configured") };
  }

  try {
    const tx = {
      query: async <R = unknown>(strings: TemplateStringsArray, ...values: SqlParam[]) => {
        const result = await query<R>(strings, ...values);
        if (result.error) throw result.error;
        return result.data ?? [];
      },
      queryOne: async <R = unknown>(strings: TemplateStringsArray, ...values: SqlParam[]) => {
        const result = await queryOne<R>(strings, ...values);
        if (result.error) throw result.error;
        return result.data;
      },
    };
    const result = await fn(tx);
    return { data: result, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export { sql };