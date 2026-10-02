import { sql, type VercelPool } from "@vercel/postgres";

/**
 * Vercel Postgres client wrapper with connection pooling and retry logic.
 * In production, this uses the Vercel Postgres (Neon) connection pool.
 * In development without DATABASE_URL, it gracefully degrades.
 */

let isAvailable = true;

export function checkDatabaseAvailability(): boolean {
  if (typeof process !== "undefined" && process.env.DATABASE_URL) {
    isAvailable = true;
    return true;
  }
  isAvailable = false;
  return false;
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
export async function query<T = any>(
  strings: TemplateStringsArray,
  ...values: any[]
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
export async function queryOne<T = any>(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await query(strings, ...values);
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
    query: <T = any>(strings: TemplateStringsArray, ...values: any[]) => Promise<T[]>;
    queryOne: <T = any>(strings: TemplateStringsArray, ...values: any[]) => Promise<T | null>;
  }) => Promise<T>
): Promise<{ data: T | null; error: Error | null }> {
  if (!checkDatabaseAvailability()) {
    return { data: null, error: new Error("Database not configured") };
  }

  try {
    const tx = {
      query: async <T = any>(strings: TemplateStringsArray, ...values: any[]) => {
        const result = await query<T>(strings, ...values);
        if (result.error) throw result.error;
        return result.data ?? [];
      },
      queryOne: async <T = any>(strings: TemplateStringsArray, ...values: any[]) => {
        const result = await queryOne<T>(strings, ...values);
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