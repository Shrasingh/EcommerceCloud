# EcommerceCloud — Multi-store Admin & Commerce API

EcommerceCloud is a multi-tenant ecommerce back office built with Next.js 16. Store owners sign in, create one or more stores, manage their catalog and see orders and revenue. The same app exposes a REST API that powers the [QuickCart](https://github.com/Shrasingh/QuickCart) storefront and handles checkout through Stripe.

**Live demo:** admin at <https://ecommerce-cloud-beta.vercel.app> (sign up to get your own empty store) · storefront at <https://quick-cart-eta-ecru.vercel.app>

> The live demo runs on Clerk and Stripe **test** keys. No real payments are taken, and the Stripe webhook is not configured there, so demo checkouts stay "unpaid" (see [Known limitations](#known-limitations)).

---

## Project origin and contributions

This is a personal portfolio project built to learn and demonstrate production-grade Next.js, Prisma and Stripe. It is not affiliated with or endorsed by any company and runs only on test keys.

The recent work (visible in the git history) was about turning a happy-path demo into something closer to production-shaped. These are the substantive contributions:

- **Multi-tenant authorization** — server-side store-ownership checks on every write API (`lib/api.ts` → `requireStoreOwner`) and on every dashboard page and its data access (`lib/require-store.ts`), so one owner can never read or modify another store's catalog, orders, customer phone numbers or addresses.
- **Checkout and payment correctness** — exact decimal→integer-cents conversion (`lib/money.ts`), configuration validated before any order is written, and a Stripe webhook that fulfils an order only when the session is `paid` and the linked session id, currency and amount all match, with fulfilment applied exactly once (`lib/stripe-events.ts`, `lib/order-payment.ts`).
- **Input validation** — one zod schema per request body (`lib/validations.ts`), shared with the forms.
- **Price history** — an additive migration recording each item's price and currency at checkout, so revenue isn't recomputed from today's catalog prices, plus a dry-run-first Stripe backfill for legacy orders.
- **Safety rails** — a seed guard that refuses to wipe a non-empty or production database without explicit host confirmation.
- **Tests and CI** — a Vitest suite (unit, mocked route handlers, and the real migration SQL applied to an in-process Postgres) runs in CI alongside lint, typecheck and build.

Foundational UI patterns and the shadcn/ui primitives come from the wider Next.js ecosystem; the work above is the project's own.

## Problem and users

Small sellers who want a storefront need somewhere to manage products, categories and pricing, and to see what sold. EcommerceCloud is that back office:

- **Store owners** (authenticated) manage one or more isolated stores from a dashboard.
- **Storefronts** (unauthenticated) read a store's catalog over a public API and start a Stripe checkout.

## Features

- **Multi-store tenancy.** Every record carries a `storeId`; reads and writes are scoped to it, and writes require the signed-in user to own the store.
- **Catalog management.** Billboards (hero banners), categories, sizes, colors and products with multiple Cloudinary images, featured, archived and in-stock flags, an optional description, brand and "was" price (shown struck through by the storefront).
- **Orders.** List with products, totals, paid status, phone and address. Totals use the price recorded at checkout; orders from before price recording are marked "≈ … (estimated)".
- **Dashboard.** Total revenue, paid-order count, in-stock count and a monthly revenue chart for the current year. When some sold items have no recorded price, revenue is shown as "≈" with the estimated portion stated.
- **Public catalog API.** Products filterable by category, color, size, featured flag, price range and free-text search.
- **Checkout.** Creates an order and a Stripe Checkout session (60-minute expiry: Stripe's 30-minute minimum plus a 30-minute margin for clock skew and latency). Each item's price is converted once to integer cents with exact decimal arithmetic (round half up); that amount is sent to Stripe and recorded on the order item with its currency, and the session id is stored on the order. Configuration is validated before any order is written. Browser checkouts are accepted only from allow-listed storefront origins, each of which is redirected back to itself, and are rate limited per client address with a database-backed counter shared by all serverless instances. The webhook marks the order paid only when Stripe reports the session as `paid`, including delayed payment methods via `async_payment_succeeded`, archives the sold products exactly once (each product is treated as a unique item), and flags an order whose item had already been sold to an earlier order as a `PaymentException` for refund instead of fulfilling it silently.
- **Auth.** Clerk sign-in/sign-up; dashboard pages and write APIs check ownership on the server.
- **Dark mode.**

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript | Server components read the database directly; route handlers provide the API in the same deployable. |
| Database | PostgreSQL (Neon) + Prisma 6 | Relational data with foreign keys; Prisma gives typed queries and migrations. |
| Auth | Clerk (`@clerk/nextjs` 7) | Hosted auth; the app only needs a `userId` to enforce ownership. |
| Payments | Stripe Checkout + webhook | Hosted payment page; no card data touches the app. |
| Images | Cloudinary upload widget | Direct browser uploads; the app stores URLs only. |
| Validation | zod 4 | One schema per request body, shared with forms. |
| UI | Tailwind CSS 3, shadcn/ui (Radix), TanStack Table, Recharts | |
| Tests | Vitest | Fast TypeScript tests with path aliases and module mocking. |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    A[Admin dashboard<br/>React client forms]
    S[QuickCart storefront]
  end
  subgraph EcommerceCloud [EcommerceCloud · Next.js on Vercel]
    P[proxy.ts<br/>clerkMiddleware]
    RSC[Dashboard pages<br/>server components]
    API[Route handlers<br/>/api/...]
    L[lib/api.ts · lib/validations.ts<br/>ownership + validation + error mapping]
  end
  DB[(PostgreSQL · Neon)]
  C[Clerk]
  ST[Stripe]
  CL[Cloudinary]

  A -->|axios| API
  S -->|GET catalog, POST checkout| API
  RSC --> DB
  API --> L --> DB
  P --> C
  API -->|checkout session| ST
  ST -->|checkout.session.* events| API
  A -->|image upload| CL
```

**Request flow for a write** (e.g. `PATCH /api/{storeId}/products/{id}`):

1. `requireStoreOwner(storeId)`: 401 if signed out, 403 if the store belongs to someone else.
2. `parseBody(req, productSchema)`: 400 with a readable message on invalid JSON or input.
3. `assertRefsInStore(...)`: 400 if the category, size or color belongs to another store.
4. The query is scoped by `storeId`; a record outside the store is a 404.
5. `handleApiError` maps Prisma foreign-key violations to 409 with guidance, and logs anything else as a 500 without leaking details.

**Data model.** `Store` 1─* `Billboard`, `Category`, `Size`, `Color`, `Product`, `Order`. `Category` → `Billboard`; `Product` → `Category`, `Size`, `Color`, and has many `Image`s; `Order` has many `OrderItem`s → `Product`. Deletes are restricted by foreign keys (images cascade with their product), so a product that appears in an order must be archived rather than deleted.

## Repository structure

```
app/
  (auth)/                      Clerk sign-in / sign-up pages
  (root)/                      First run: opens the "create store" modal, or redirects to your store
  (dashboard)/[storeId]/       Overview, billboards, categories, sizes, colors, products, orders, settings
  api/
    stores/                    POST create · PATCH rename · DELETE
    [storeId]/<resource>/      billboards · categories · sizes · colors · products (CRUD, public GET)
    [storeId]/checkout/        Public, CORS-enabled: creates order + Stripe session
    webhook/                   Stripe webhook
actions/get-dashboard-stats.ts Dashboard query (one pass over paid orders)
lib/
  api.ts                       API ownership check, body validation, error → HTTP mapping
  require-store.ts             Dashboard page/data-layer store-ownership guard (redirects)
  validations.ts               zod request schemas (incl. approved image hosts)
  analytics.ts                 Revenue summary (pure, unit-tested)
  products.ts                  Product filter builder (pure, unit-tested)
  orders.ts                    Address formatting
  money.ts                     Exact decimal <-> integer minor-unit conversion
  config.ts                    Checkout configuration: storefront URL, origin allow list, redirect resolution
  rate-limit.ts                Fixed-window limiter on the RateLimit table (atomic upsert)
  order-payment.ts             Verifies a paid Stripe session against the order
  backfill.ts                  Matches Stripe line items to order items (backfill)
  errors.ts                    Client-side error message helper
  prismadb.ts · stripe.ts      Clients (Stripe is created lazily)
components/                    UI primitives (shadcn), modals, nav, data table
prisma/
  schema.prisma                Data model
  migrations/0_init/           Baseline migration (see "Database")
  migrations/20261024120000_order_price_snapshot/  Adds OrderItem.unitPrice/currency and Order.stripeSessionId
  migrations/20261026120000_payment_exception/      Adds the PaymentException table (webhook mismatch log)
  migrations/20261029120000_rate_limit/             Adds the RateLimit table (shared checkout rate-limit counters)
  backfill-order-prices.ts     Manual, dry-run-first Stripe backfill of legacy prices
  seed.ts                      Demo catalog seeder
tests/
  unit/                        Validation, analytics, filters, formatting
  api/                         Route handlers with Prisma, Clerk and Stripe mocked
  db/                          Migrations applied to an in-process Postgres (PGlite)
.github/workflows/ci.yml       Lint, typecheck, test, build on push / PR
```

## Getting started

### Prerequisites

- Node.js 20.9+ (CI uses Node 22) and npm
- A PostgreSQL database ([Neon](https://neon.tech) free tier works)
- [Clerk](https://clerk.com), [Stripe](https://stripe.com) (test mode) and [Cloudinary](https://cloudinary.com) accounts

### Setup

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # fill in the values, see below
npx prisma migrate deploy   # create tables on a new, empty database
npm run seed                # optional: demo store with ~130 products
npm run dev                 # http://localhost:3000
```

The seed needs an owner: sign in once, copy your user id from Clerk → Users, then run `SEED_STORE_OWNER_ID=user_xxx npm run seed`. Without it the seed refuses to run (a store owned by a placeholder id could never be managed from the dashboard); `SEED_ALLOW_PLACEHOLDER_OWNER=1` overrides that for a throwaway database.

> **The seed deletes every row in every table, including other users' stores.** It refuses to run on Vercel or with `NODE_ENV=production`, and on a database that already has stores unless you confirm the exact host: `SEED_CONFIRM_WIPE=<host from DATABASE_URL> npm run seed`. Check which database `.env` points at before seeding.

### Environment variables

| Variable | Required | Purpose | Example |
|---|---|---|---|
| `DATABASE_URL` | yes | Postgres connection used by the app (pooled for Neon) | `postgresql://user:pass@host-pooler/db?sslmode=require` |
| `DIRECT_URL` | yes | Direct (non-pooled) connection for migrations | `postgresql://user:pass@host/db?sslmode=require` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key (public by design) | `pk_test_...` |
| `CLERK_SECRET_KEY` | yes | Clerk server key | `sk_test_...` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` | yes | Auth routes | `/sign-in`, `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `_AFTER_SIGN_UP_URL` | yes | Redirect after auth | `/` |
| `STRIPE_API_KEY` | for checkout | Stripe secret key; read lazily, so builds work without it | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | for webhook | Signing secret of the webhook endpoint | `whsec_...` |
| `FRONTEND_STORE_URL` | for checkout | Storefront base URL for Stripe success/cancel redirects and the storefront origin allowed to call `/checkout` from a browser. Must be `https://…` (plain `http:` only for localhost); checkout returns 503 if it is missing or invalid. **Set a different value per Vercel environment** (Preview must not reuse production's) | `https://shop.example.com` |
| `ALLOWED_STOREFRONT_ORIGINS` | optional | Comma-separated extra storefront origins (scheme + host only) that may call `/checkout`; each is redirected back to itself. Checkout from any other browser origin is refused with 403 | `https://quick-cart-staging.vercel.app` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | for uploads | Cloudinary cloud name | `demo` |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | for uploads | Unsigned upload preset from your own Cloudinary account. No default: if unset, image uploads are disabled | `ecommerce_unsigned` |
| `SEED_STORE_OWNER_ID` | seed only | Clerk user id that owns the seeded store; required unless `SEED_ALLOW_PLACEHOLDER_OWNER=1` | `user_...` |
| `SEED_NEON_WS` | seed only | `1` = seed over Neon's WebSocket driver (port 443) | `1` |
| `SEED_CONFIRM_WIPE` | seed only | Must equal the `DATABASE_URL` host to seed a non-empty database (the seed deletes all data) | `ep-xxx.us-east-1.aws.neon.tech` |

`NEXT_PUBLIC_*` values are bundled into browser JavaScript. Only the Clerk publishable key, Cloudinary cloud name and upload preset use that prefix, and none of them is a secret.

### Database

The schema lives in `prisma/schema.prisma`. `prisma/migrations/0_init` is a baseline generated from that schema.

- **New database:** `npx prisma migrate deploy`.
- **Existing database created with `prisma db push`** (the live demo database): first confirm there is no drift (`npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` must exit 0), then mark the baseline as applied once, without running it: `npx prisma migrate resolve --applied 0_init`. Do **not** run `migrate deploy` on it first; that would try to recreate existing tables and record a failed migration.
- **Price-snapshot migration** (`20261024120000_order_price_snapshot`): additive only (two nullable columns, a nullable unique column, two CHECK constraints), so existing rows stay valid with NULL prices. After the baseline step above, apply it with `npm run db:migrate:deploy`. Deploy order: migration first, then the code that writes the new columns.
- **Payment-exception migration** (`20261026120000_payment_exception`): additive only — creates the `PaymentException` table (webhook mismatch log) and its indexes; no existing table or row is touched. Apply with `npm run db:migrate:deploy`.
- **Rate-limit migration** (`20261029120000_rate_limit`): additive only — creates the `RateLimit` table used by the checkout limiter. Deploy order: migration first, then the code; until the table exists the limiter logs `[CHECKOUT_RATE_LIMIT]` and lets requests through (fail-open), so a code-first deploy degrades to "no limit" rather than to a broken checkout.
- **Schema changes:** run `npx prisma migrate dev --name <change>` against a **local or development database only**. If it detects drift it offers to reset the database, which deletes all data, so never run it with production credentials. Apply migrations to the preview and production databases with `npm run db:migrate:deploy`.
- **`npx prisma migrate reset` is destructive:** it drops the schema, recreates it from the migrations, and re-runs the seed — deleting **all** data in the target database. Only ever run it against a local or preview database, never with production credentials.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on :3000 |
| `npm run lint` | ESLint (`eslint-config-next` core-web-vitals) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, run once |
| `npm run build` | `prisma generate` + production build |
| `npm run seed` | Wipes **all** data and seeds a demo store (guarded, see Setup) |
| `npm run db:migrate:deploy` | Applies pending migrations |
| `npm run backfill:prices` | Dry run: reports which legacy orders could get prices from Stripe. Add `-- --apply` to write them — `--apply` refuses to run on production/Vercel and requires `BACKFILL_CONFIRM_HOST=<database host>` |

## API

Base path: `/api/{storeId}`. Reads are public; writes need a Clerk session for the store's owner. Errors are plain-text bodies with these statuses: `400` invalid input · `401` signed out · `403` not your store · `404` not found in this store · `409` still referenced (e.g. a product with orders) · `500` unexpected.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/products` | public | Query: `categoryId`, `colorId`, `sizeId`, `isFeatured=true`, `search`, `minPrice`, `maxPrice`. Excludes archived. Includes images, category, color, size. |
| GET | `/products/{id}` | public | |
| POST · PATCH · DELETE | `/products` · `/products/{id}` | owner | Body: `name, price, categoryId, sizeId, colorId, images[{url}], isFeatured?, isArchived?, isInStock?, description?, brand?, originalPrice?` (`originalPrice` must exceed `price`; blank text clears a field; omitted fields are unchanged on PATCH) |
| GET | `/categories` · `/categories/{id}` | public | Includes billboard |
| POST · PATCH · DELETE | `/categories` · `/categories/{id}` | owner | Body: `name, billboardId` |
| GET | `/billboards` · `/billboards/{id}` | public | |
| POST · PATCH · DELETE | `/billboards` · `/billboards/{id}` | owner | Body: `label, imageUrl` |
| GET | `/sizes` · `/colors` (+ `/{id}`) | public | |
| POST · PATCH · DELETE | `/sizes`, `/colors` (+ `/{id}`) | owner | Body: `name, value` (color value must be a hex code) |
| POST | `/checkout` | public, CORS (allow-listed origins) | Body: `{ productIds: string[] }` → `{ url }` (Stripe Checkout, expires after 60 min). Only this store's unarchived, in-stock products are sold. `403` when the browser `Origin` is not `FRONTEND_STORE_URL` or in `ALLOWED_STOREFRONT_ORIGINS` (non-browser callers without an Origin header use `FRONTEND_STORE_URL`); `429` + `Retry-After` after 10 attempts per client address and store in 10 minutes; `503` when checkout is misconfigured. |
| POST | `/api/stores` · PATCH/DELETE `/api/stores/{storeId}` | signed in / owner | Body: `{ name }` |
| POST | `/api/webhook` | Stripe signature | Handles `checkout.session.completed` (fulfils only if `payment_status` is `paid` and the session matches the order: same linked session id, same currency, and `amount_subtotal` equal to the recorded prices; otherwise the order is not fulfilled, the mismatch is written to `PaymentException` for review, and `[STRIPE_WEBHOOK_REJECTED]` is logged), `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. Fulfilment is a one-time unpaid→paid transition, so duplicate deliveries are no-ops; mismatch records are keyed by Stripe event id, so redeliveries record once. If an item was already archived by an earlier order's payment (oversell), the order is still marked paid (the charge happened) and a `PaymentException` with reason `oversold: …` is written for a refund. |

## Deployment (Vercel)

1. Import the repository in Vercel (framework: Next.js; default build command).
2. Add the environment variables above under **Settings → Environment Variables**, separately for Production and Preview (see the next section).
3. Run migrations against each environment's database (`npm run db:migrate:deploy` with that environment's `DIRECT_URL`).
4. Stripe → Developers → Webhooks: add `https://<admin-domain>/api/webhook` subscribed to `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Set `FRONTEND_STORE_URL` to the storefront's URL **for that environment** (production storefront in Production, a fixed preview alias or a staging storefront in Preview). Add any further storefront origins to `ALLOWED_STOREFRONT_ORIGINS`. A storefront whose origin is not listed cannot start a checkout.
6. Production also benefits from a platform-level rule (Vercel Firewall → rate limiting on `/api/*/checkout`); the in-app limiter is the floor, not the ceiling.

## Branching, environments and releases

This is a solo portfolio project, so it uses a single long-lived branch and short-lived working branches rather than permanent `development`/`staging` branches.

| Branch | Purpose | Deploys to | Database |
|---|---|---|---|
| `feat/*`, `fix/*`, `chore/*` | One focused change per branch, opened as a PR into `main` | Vercel **Preview** per push | Preview DB (separate from production) |
| `main` | Production-ready code | Vercel **Production** | Production DB |

- CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every push to `main` and on every PR into `main`.
- Vercel's Git integration does the deploys, so there's no separate deploy workflow to maintain: each PR gets a Preview URL for QA, and merging to `main` promotes to Production.
- **Use a separate preview database, never the production one.** Point Vercel's Preview environment at a dedicated database (e.g. a [Neon branch](https://neon.tech/docs/introduction/branching)) so preview deployments and migration trials can't touch production data. Set environment-specific values (`DATABASE_URL`, `DIRECT_URL`, Stripe keys, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_STORE_URL`, `ALLOWED_STOREFRONT_ORIGINS`) per environment in Vercel, never as "All environments". Because checkout only serves allow-listed origins and redirects each back to itself, a Preview admin cannot send shoppers to the production storefront, and a Preview storefront cannot create orders in the production admin unless its origin was deliberately listed there.
- **Release:** merge the PR into `main`. If the change includes a migration, apply it to the preview database first (`npm run db:migrate:deploy` with the preview `DIRECT_URL`), verify on the Preview deployment, then apply it to production **before** the new code serves traffic (see [Database](#database)), and merge.
- Recommended GitHub settings (set these in the repository settings; they are not configured from this repo): protect `main`; require the **CI / Lint, typecheck, test, build** check and an up-to-date branch before merging; block force-pushes; enable Dependabot alerts and secret scanning. Dependabot (`.github/dependabot.yml`) opens its PRs against `main`.

## Testing strategy

`npm test` runs 276 tests with Vitest. Most finish in milliseconds; the database tests boot an in-process Postgres and take longer:

- **Unit:** the seed safety guard, the backfill `--apply` guard, the dashboard store-ownership guard (`lib/require-store.ts`: owner allowed, non-owner and signed-out redirected), checkout configuration, Stripe event classification, request validation including image-host restriction (`lib/validations.ts`), revenue summary, product filter building, address formatting, cents rounding and the Stripe minimum charge.
- **Route handlers:** the real handlers are called with Prisma, Clerk and Stripe mocked. They cover 401/403 ownership checks on every catalog write route (billboards, categories, sizes, colors, products), 400 validation messages, tenant isolation (scoped reads and updates return 404; cross-store references are rejected), 409 on foreign-key conflicts, 500 without leaking details, product image replacement in one write, checkout (configuration validated before any write, storefront-origin allow list with per-origin redirects and CORS, shared rate limiting with 429 and fail-open, 60-minute session expiry with a margin over Stripe's minimum, store/stock filtering, rejecting partially-unavailable carts, zero-cent and below-minimum totals, integer cents, cleanup when Stripe fails), and the webhook (oversell detection recorded as a `PaymentException` in the same transaction as the paid transition, including rollback and retry; signature errors; fulfilment only for `paid` sessions; delayed payments; failed and unexpected events; duplicate delivery not re-archiving products an admin restored, checked against an in-memory fake database; retry on failure; durable recording of amount/currency/session mismatches to `PaymentException`, idempotent on event redelivery, and a 500 so Stripe retries if that write fails).

- **Database (`tests/db`):** the real migration SQL is applied to PGlite (Postgres compiled to WebAssembly, in-process) on top of legacy-shaped rows, checking that no data is lost, legacy prices stay NULL, the CHECK and unique constraints reject bad data, every migration applies in order to an empty database, and the rate-limit upsert increments within a window and resets across windows.

**Not covered yet:** route handlers against a real database (they use a mocked Prisma client), a full Stripe test-mode round trip, and browser end-to-end tests of the dashboard.

## Known limitations

- **Live demo has no Stripe webhook**, so completed demo checkouts remain unpaid and products aren't archived.
- **Orders placed before the price-snapshot migration have no recorded prices.** They are shown as estimates using current prices; they are never backfilled from catalog prices. `npm run backfill:prices` can fill them only from Stripe session line items.
- **Quantity is always 1.** Each product is treated as a unique item and is archived once sold.
- **No inventory reservation at checkout.** Availability is checked when the Stripe session is created but the product isn't held until payment, so two checkouts of the same unique item can both proceed for as long as the first session is open (now at most 60 minutes). If both pay, the second is marked paid and flagged as a `PaymentException` (`oversold: …`) for a manual refund; it is never fulfilled silently. A true reservation (atomic hold + expiry) is the next step.
- **Rate limiting is per client address** (10 checkouts per 10 minutes per store), backed by the database so it holds across serverless instances. Determined abuse from many addresses still needs a platform rule (Vercel Firewall). Abandoned sessions expire after 60 minutes but their unpaid orders are kept; nothing purges them.
- **One storefront origin per environment by default.** `FRONTEND_STORE_URL` is a single value; additional storefronts (another store's shop, a preview alias) must be added to `ALLOWED_STOREFRONT_ORIGINS` and are redirected to their own origin's `/order-success` and `/cart`. A per-store storefront URL in the database would be the next step for true multi-storefront tenancy.
- **Image uploads are unsigned** (a public, unsigned Cloudinary preset). The widget limits sources, formats and size client-side, but only the preset's own settings in Cloudinary (folder, formats, max bytes) are enforced server-side; signed uploads (a server endpoint using `CLOUDINARY_API_SECRET`) would be the hardening step. Stored image URLs are already restricted to approved hosts.
- **List endpoints aren't paginated.** Fine for hundreds of products per store; pagination is needed beyond that. The dashboard loads every paid order to compute revenue; a SQL aggregate would scale better.
- **Single currency (USD)** and prices stored without tax or shipping.
- **The live database predates the migration baseline.** It still needs a one-time `prisma migrate resolve --applied 0_init`.
- **Clerk runs in development mode** on `vercel.app` domains (production keys require a custom domain).
- **No admin UI for `PaymentException`.** Unresolved records are reviewed with the SQL query in [Operations: payment exceptions](#operations-payment-exceptions).

## Operations: payment exceptions

There is **no admin page** for `PaymentException` yet; the table is the webhook's durable log of paid Stripe sessions that could not be fulfilled normally. Two kinds of record exist:

- **Mismatch** (`reason` starts with `amount mismatch`, `currency mismatch`, `order is linked to a different session`, …): the order was **not** marked paid. Investigate before refunding; a mismatch usually means the session was not the one checkout created for that order.
- **Oversell** (`reason` starts with `oversold:`): the order **was** marked paid because the charge happened, but one or more of its items had already been sold to an earlier order. The customer must be refunded for the unavailable item(s).

Procedure (read-only query first; run against the environment in question with its own `DATABASE_URL`):

```sql
SELECT id, "orderId", "sessionId", reason, "eventId", "createdAt"
FROM "PaymentException"
WHERE resolved = false
ORDER BY "createdAt";
```

1. Open the session in the Stripe dashboard (search by the `sessionId`, `cs_…`) and confirm the amount and payment status.
2. For an oversell, refund the affected line(s) from the Stripe dashboard (test mode on the demo), and tell the customer. For a mismatch, decide case by case; never mark the order paid by hand without matching the Stripe amount to the recorded order prices.
3. Mark the record handled: `UPDATE "PaymentException" SET resolved = true, "resolvedAt" = now() WHERE id = '<id>';`
4. Each Stripe event is recorded at most once (`eventId` is unique), so redelivered events never create duplicates.

A small read-only dashboard page for this table is the natural next step; until then, the query above is the supported procedure.

## Security headers

`next.config.mjs` sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that only allows the camera (an upload-widget source), and a Content Security Policy in **report-only** mode listing Clerk, Cloudflare Turnstile and the Cloudinary widget. `X-Powered-By` is disabled; Vercel adds HSTS. To enforce the CSP: open a Preview deployment with the browser console visible, walk sign-in → store switcher → each dashboard page → create/edit a product with an image upload → orders, confirm no `[Report Only]` violations (ignore `vercel.live`, the Preview toolbar), then rename the header to `Content-Security-Policy` in a PR and repeat on that PR's Preview. Clerk production instances serve from a custom domain; add it to `clerkHosts` before enforcing.

## License

Personal portfolio project. No license is granted for reuse.
