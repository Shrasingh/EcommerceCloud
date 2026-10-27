// The seed deletes EVERY row in every table (all users' stores), so it must
// never run against a database that holds real data by accident.

export interface SeedGuardInput {
  /** Number of stores currently in the database. */
  existingStores: number;
  /** Host from DATABASE_URL, shown so the operator can see where they are pointing. */
  databaseHost: string;
  env: Record<string, string | undefined>;
}

export type SeedGuardResult = { allowed: true } | { allowed: false; reason: string };

export const WIPE_FLAG = "SEED_CONFIRM_WIPE";

export function checkSeedAllowed({ existingStores, databaseHost, env }: SeedGuardInput): SeedGuardResult {
  if (env.VERCEL || env.NODE_ENV === "production") {
    return {
      allowed: false,
      reason: "Refusing to seed in a production/Vercel environment: the seed deletes all data.",
    };
  }

  // An empty database has nothing to lose.
  if (existingStores === 0) return { allowed: true };

  // Non-empty: require the operator to type the exact database host, so a
  // stale shell variable or copy-pasted command can't wipe the wrong database.
  if (env[WIPE_FLAG] !== databaseHost) {
    return {
      allowed: false,
      reason:
        `The database at "${databaseHost}" already contains ${existingStores} store(s), ` +
        `which the seed would DELETE (including other users' stores).\n` +
        `If you really want to wipe it, re-run with ${WIPE_FLAG}=${databaseHost}`,
    };
  }

  return { allowed: true };
}

/** Extracts the host from a Postgres connection string ("" if unparsable). */
export function databaseHostFrom(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
