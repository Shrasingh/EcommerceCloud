import Stripe from "stripe";

let client: Stripe | undefined;

/**
 * Lazily creates the Stripe client so builds and routes that don't take
 * payments work without STRIPE_API_KEY. Uses the SDK's pinned API version.
 */
export function getStripe(): Stripe {
  if (!client) {
    const apiKey = process.env.STRIPE_API_KEY;
    if (!apiKey) throw new Error("STRIPE_API_KEY is not set");
    client = new Stripe(apiKey);
  }
  return client;
}
