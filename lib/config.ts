export class ConfigError extends Error {
  /** Names of the misconfigured variables (never their values). */
  constructor(public variables: string[]) {
    super(`Missing or invalid configuration: ${variables.join(", ")}`);
    this.name = "ConfigError";
  }
}

export interface CheckoutConfig {
  /** Storefront base URL without a trailing slash, e.g. "https://shop.example.com". */
  storefrontUrl: string;
  /**
   * Browser origins allowed to start a checkout and to be redirected back to
   * after payment. Always contains the origin of `storefrontUrl`; extra
   * entries come from ALLOWED_STOREFRONT_ORIGINS (e.g. a fixed Preview alias
   * of the storefront). Each entry is a bare origin: scheme + host [+ port].
   */
  allowedOrigins: string[];
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True for https URLs, or plain http on a local development host. */
function isAcceptableScheme(url: URL): boolean {
  return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
}

/** Parses one allow-listed origin; returns null when it is not a bare, acceptable origin. */
function parseOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!isAcceptableScheme(url) || url.username || url.password || url.search || url.hash) return null;
    // A bare origin has no path other than "/".
    if (url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Validates the settings checkout needs before any order is created.
 * FRONTEND_STORE_URL must be an absolute http(s) URL; plain http is only
 * accepted for local development hosts. ALLOWED_STOREFRONT_ORIGINS is an
 * optional comma-separated list of additional storefront origins.
 */
export function getCheckoutConfig(env: Record<string, string | undefined> = process.env): CheckoutConfig {
  const invalid: string[] = [];

  if (!env.STRIPE_API_KEY?.trim()) invalid.push("STRIPE_API_KEY");

  let storefrontUrl = "";
  let storefrontOrigin = "";
  const raw = env.FRONTEND_STORE_URL?.trim();
  try {
    if (!raw) throw new Error("missing");
    const url = new URL(raw);
    if (!isAcceptableScheme(url) || url.username || url.password || url.search || url.hash) {
      throw new Error("invalid");
    }
    storefrontUrl = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    storefrontOrigin = url.origin;
  } catch {
    invalid.push("FRONTEND_STORE_URL");
  }

  const allowedOrigins = new Set<string>();
  if (storefrontOrigin) allowedOrigins.add(storefrontOrigin);
  const extra = env.ALLOWED_STOREFRONT_ORIGINS?.trim();
  if (extra) {
    for (const entry of extra.split(",")) {
      if (!entry.trim()) continue;
      const origin = parseOrigin(entry);
      if (!origin) {
        invalid.push("ALLOWED_STOREFRONT_ORIGINS");
        break;
      }
      allowedOrigins.add(origin);
    }
  }

  if (invalid.length > 0) throw new ConfigError(invalid);
  return { storefrontUrl, allowedOrigins: [...allowedOrigins] };
}

export type StorefrontResolution =
  | { ok: true; baseUrl: string; origin: string | null }
  | { ok: false; reason: "origin_not_allowed"; origin: string };

/**
 * Decides where a checkout started from `requestOrigin` (the browser's
 * `Origin` header, or null for non-browser clients) may redirect to.
 *
 * - No Origin header: the configured storefront (server-to-server callers).
 * - The configured storefront's own origin: FRONTEND_STORE_URL, path included.
 * - Another allow-listed origin (e.g. a Preview alias): that origin itself, so
 *   a Preview checkout returns to the Preview and never to production.
 * - Anything else: refused. The redirect base is never taken from the request
 *   unless it is on the allow list.
 */
export function resolveStorefront(config: CheckoutConfig, requestOrigin: string | null): StorefrontResolution {
  if (!requestOrigin) return { ok: true, baseUrl: config.storefrontUrl, origin: null };

  const origin = parseOrigin(requestOrigin);
  if (!origin || !config.allowedOrigins.includes(origin)) {
    return { ok: false, reason: "origin_not_allowed", origin: requestOrigin };
  }
  const configuredOrigin = new URL(config.storefrontUrl).origin;
  return { ok: true, baseUrl: origin === configuredOrigin ? config.storefrontUrl : origin, origin };
}
