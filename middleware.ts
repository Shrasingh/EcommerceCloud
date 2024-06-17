import { clerkMiddleware } from "@clerk/nextjs/server";

// const isPublicRoute = createRouteMatcher(['/sign-in', '/sign-up']);

export default clerkMiddleware((auth, request) => {
  publicRoutes : ["/api/:path*"]
});

// export default clerkMiddleware();
