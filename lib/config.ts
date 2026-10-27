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
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validates the settings checkout needs before any order is created.
 * FRONTEND_STORE_URL must be an absolute http(s) URL; plain http is only
 * accepted for local development hosts.
 */
export function getCheckoutConfig(env: Record<string, string | undefined> = process.env): CheckoutConfig {
  const invalid: string[] = [];

  if (!env.STRIPE_API_KEY?.trim()) invalid.push("STRIPE_API_KEY");

  let storefrontUrl = "";
  const raw = env.FRONTEND_STORE_URL?.trim();
  try {
    if (!raw) throw new Error("missing");
    const url = new URL(raw);
    const secure = url.protocol === "https:";
    const localHttp = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
    if (!(secure || localHttp) || url.username || url.password || url.search || url.hash) {
      throw new Error("invalid");
    }
    storefrontUrl = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    invalid.push("FRONTEND_STORE_URL");
  }

  if (invalid.length > 0) throw new ConfigError(invalid);
  return { storefrontUrl };
}
