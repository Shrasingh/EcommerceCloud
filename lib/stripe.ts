import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_API_KEY!,{
    apiVersion: "2024-04-10",
    typescript: true,
});
export default stripe;