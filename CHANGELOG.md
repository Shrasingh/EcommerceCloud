# Changelog

All notable changes to the admin and commerce API. Dates are merge dates on `main`.

## Unreleased — `fix/audit-remediation`

Follow-up to the 2026-10-29 cross-repository review (QuickCart + EcommerceCloud).

### Security
- Checkout accepts browser requests only from allow-listed storefront origins (`FRONTEND_STORE_URL` plus `ALLOWED_STOREFRONT_ORIGINS`) and redirects each origin back to itself. CORS is granted per allow-listed origin instead of `*`; any other origin receives 403 before an order is written. A Preview storefront can therefore never create production orders or be sent to the production success page unless its origin was deliberately listed.
- Checkout is rate limited per client address and store (10 per 10 minutes) with a database-backed counter shared by all serverless instances (`lib/rate-limit.ts`, `RateLimit` table). Exceeding it returns 429 with `Retry-After`; a counter-store failure logs and lets the request through.
- Stripe Checkout sessions expire after 60 minutes (Stripe's 30-minute minimum plus a 30-minute margin for clock skew and latency; previously Stripe's 24-hour default), shrinking the window in which a single-unit product can be bought twice.
- The webhook detects an oversell (an item already archived by an earlier order's payment), still marks the order paid because the charge happened, and records a `PaymentException` with reason `oversold: …` for a refund instead of fulfilling silently. The record is written in the same database transaction as the paid transition, so a failed write rolls the transition back and Stripe's retry records it.
- Security headers on every response (nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy) and a report-only Content Security Policy covering Clerk, Cloudflare Turnstile and the Cloudinary widget; `X-Powered-By` removed.
- Cloudinary upload widget restricted client-side (image formats, 10 MB, one file, local/url/camera sources).
- The seed refuses to create a store owned by the placeholder id unless `SEED_ALLOW_PLACEHOLDER_OWNER=1`.

### Fixed
- Product delete on the edit page and colour delete on the edit page did nothing (the confirm handler was never wired); size delete and the colour list delete called `/Sizes/` and `/Colors/` (case-sensitive routes) and 404'd.
- Products page advertised `/api/<store>/productsds`; the Colour column showed the product name; stray `console.log`s and doubled spaces in form copy.
- Dashboard "Products in stock" counted archived-only, ignoring `isInStock`.
- Settings page used its own copy of the ownership guard instead of `requireStoreAccess`.
- `.env.example` claimed a default Cloudinary preset that does not exist in code.

### Added
- Product `description`, `brand`, `originalPrice` (must exceed `price`) and `isInStock` are editable in the product form and accepted by the API (all optional; omitted fields are unchanged on PATCH). Previously only the seed could set them.
- Migration `20261029120000_rate_limit` (additive: one new table).
- `.github/pull_request_template.md`; `.github/rulesets/main.json` (importable branch ruleset); `engines.node >= 20.9` in `package.json`.
- ESLint ignores `docs/`; `/docs/interview-handbook/` is git-ignored.

### Tests
- 185 → 274 Vitest tests: 401/403 on every catalog write route, sizes and colours routes, origin allow list and per-origin redirects, CORS preflight, rate limiting (429, fail-open, keying), session expiry, oversell handling, product-detail validation, rate-limit SQL semantics on PGlite, all migrations applied to an empty database.

## 2026-10-27 to 2026-10-28 — PRs #2 to #12
- Dependabot: GitHub Actions and minor/patch bumps; Prisma and Tailwind majors deliberately excluded (`.github/dependabot.yml`).

## 2026-10-27 — PR #1 (`chore/production-hardening`)
- Store-ownership checks on every write route and dashboard page; zod request validation; exact decimal-to-cents pricing; price snapshot on order items (migration `20261024120000_order_price_snapshot`); webhook verification of session, currency and amount with exactly-once fulfilment; `PaymentException` log (migration `20261026120000_payment_exception`); seed and backfill safety guards; Vitest suite with route-handler and PGlite migration tests; CI workflow.

## 2026-10-24
- Upgrade to Next.js 16, React 19, Clerk 7, Prisma 6, Stripe 23; cross-store write fixes; checkout validation; Neon WebSocket seed option.

## 2024-06
- Initial admin: stores, billboards, categories, sizes, colours, products, orders, Stripe checkout and webhook.
