// Hosts that may serve catalog images. Kept in sync with ALLOWED_IMAGE_HOSTS
// in lib/validations.ts (the API refuses image URLs on any other host).
const imageHosts = ["res.cloudinary.com", "images.unsplash.com", "plus.unsplash.com", "picsum.photos"];

// Third parties the admin UI loads at runtime. Clerk serves its scripts and
// API from the instance's frontend host (*.clerk.accounts.dev for development
// instances, a custom domain for production) and uses Cloudflare Turnstile
// for bot protection; the Cloudinary upload widget runs in an iframe and
// posts files to api.cloudinary.com.
const clerkHosts = ["https://*.clerk.accounts.dev", "https://clerk.com", "https://*.clerk.com"];
const turnstile = "https://challenges.cloudflare.com";
const cloudinaryWidget = ["https://upload-widget.cloudinary.com", "https://widget.cloudinary.com"];
const cloudinaryApi = "https://api.cloudinary.com";

// Report-only on purpose: violations show up in the browser console (and in
// the `report-to` endpoint if one is configured) without blocking anything.
// Promote to `Content-Security-Policy` only after walking sign-in, every
// dashboard page, an image upload and the Stripe-free order list with the
// console open and no [Report Only] violations; see README "Security headers".
//   - script-src needs 'unsafe-inline' for Next.js hydration without nonces;
//     'unsafe-eval' is only needed by the development bundler.
//   - style-src 'unsafe-inline' covers Radix/Tailwind inline styles.
function contentSecurityPolicy() {
  const isDev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${[...clerkHosts, turnstile, ...cloudinaryWidget].join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://img.clerk.com ${imageHosts.map((host) => `https://${host}`).join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self' ${[...clerkHosts, cloudinaryApi, ...cloudinaryWidget].join(" ")}`,
    `frame-src ${[...cloudinaryWidget, turnstile, ...clerkHosts].join(" ")}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The upload widget may use the camera as an image source; nothing else needs a sensor.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https", hostname, pathname: "/**" })),
  },
  async headers() {
    // Vercel adds Strict-Transport-Security on HTTPS deployments; nothing to set here.
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
