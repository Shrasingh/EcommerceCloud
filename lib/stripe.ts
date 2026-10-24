import Stripe from "stripe"

// No apiVersion: use the version pinned by the installed stripe SDK.
const stripe = new Stripe(process.env.STRIPE_API_KEY!);
export default stripe;