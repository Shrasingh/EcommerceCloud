import { Prisma } from "@prisma/client";

/**
 * Fixed-window rate limiter backed by the application database, so the limit
 * is shared by every serverless instance (an in-memory counter would reset on
 * each cold start and differ per instance). One row per key; the increment is
 * a single atomic upsert, so concurrent requests cannot both slip under the
 * limit.
 *
 * The caller decides what to do when the store is unreachable; `consume`
 * throws in that case rather than guessing.
 */

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests still allowed in this window (0 when denied). */
  remaining: number;
  /** Seconds until the window resets; suitable for a Retry-After header. */
  retryAfterSeconds: number;
}

/** Checkout: 10 attempts per IP and store every 10 minutes. */
export const CHECKOUT_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 10 * 60_000 };

/** The subset of PrismaClient the limiter needs (also satisfied by a transaction client). */
export interface RateLimitStore {
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>;
}

/** Start of the fixed window that contains `now`. */
export function windowStartFor(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/**
 * Records one request for `key` and reports whether it is within the limit.
 * A key whose stored window is older than the current one starts a fresh
 * count; otherwise the count is incremented. The upsert is atomic in Postgres.
 */
export async function consume(
  db: RateLimitStore,
  key: string,
  rule: RateLimitRule,
  now: number = Date.now()
): Promise<RateLimitDecision> {
  const windowStart = windowStartFor(now, rule.windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" = EXCLUDED."windowStart" THEN "RateLimit"."count" + 1
        ELSE 1
      END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  const windowEnd = windowStart.getTime() + rule.windowMs;
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

/**
 * Best-effort client address for rate limiting. On Vercel the first entry of
 * `x-forwarded-for` is the connecting client; `x-real-ip` is the fallback.
 * Returns "unknown" when neither is present so local requests share one bucket.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers.get("x-real-ip")?.trim();
  return real || "unknown";
}
