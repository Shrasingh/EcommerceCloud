import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk needs to run on every request so `auth()` is available in server
// components/route handlers. Nothing is force-protected here: the admin pages
// guard themselves via `auth()` redirects in their server layouts, and the
// public API routes self-gate (they check `userId` for writes and stay open
// for the storefront's read/checkout calls).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
