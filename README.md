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
- **Catalog management.** Billboards (hero banners), categories, sizes, colors and products with multiple Cloudinary images, featured and archived flags.
- **Orders.** List with products, totals, paid status, phone and address. Totals use the price recorded at checkout; orders from before price recording are marked "≈ … (estimated)".
- **Dashboard.** Total revenue, paid-order count, in-stock count and a monthly revenue chart for the current year. When some sold items have no recorded price, revenue is shown as "≈" with the estimated portion stated.
- **Public catalog API.** Products filterable by category, color, size, featured flag, price range and free-text search.
- **Checkout.** Creates an order and a Stripe Checkout session. Each item's price is converted once to integer cents with exact decimal arithmetic (round half up); that amount is sent to Stripe and recorded on the order item with its currency, and the session id is stored on the order. Configuration is validated before any order is written. The webhook marks the order paid only when Stripe reports the session as `paid`, including delayed payment methods via `async_payment_succeeded`, and archives the sold products exactly once (each product is treated as a unique item).
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

To own the seeded store, sign in once, copy your user id from Clerk → Users, then run `SEED_STORE_OWNER_ID=user_xxx npm run seed`.

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
| `FRONTEND_STORE_URL` | for checkout | Storefront base URL for Stripe success/cancel redirects. Must be `https://…` (plain `http:` only for localhost); checkout returns 503 if it is missing or invalid | `https://shop.example.com` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | for uploads | Cloudinary cloud name | `demo` |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | for uploads | Unsigned upload preset from your own Cloudinary account. No default: if unset, image uploads are disabled | `ecommerce_unsigned` |
| `SEED_STORE_OWNER_ID` | seed only | Clerk user id that owns the seeded store | `user_...` |
| `SEED_NEON_WS` | seed only | `1` = seed over Neon's WebSocket driver (port 443) | `1` |
| `SEED_CONFIRM_WIPE` | seed only | Must equal the `DATABASE_URL` host to seed a non-empty database (the seed deletes all data) | `ep-xxx.us-east-1.aws.neon.tech` |

`NEXT_PUBLIC_*` values are bundled into browser JavaScript. Only the Clerk publishable key, Cloudinary cloud name and upload preset use that prefix, and none of them is a secret.

### Database

The schema lives in `prisma/schema.prisma`. `prisma/migrations/0_init` is a baseline generated from that schema.

- **New database:** `npx prisma migrate deploy`.
- **Existing database created with `prisma db push`** (the live demo database): first confirm there is no drift (`npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` must exit 0), then mark the baseline as applied once, without running it: `npx prisma migrate resolve --applied 0_init`. Do **not** run `migrate deploy` on it first; that would try to recreate existing tables and record a failed migration.
- **Price-snapshot migration** (`20261024120000_order_price_snapshot`): additive only (two nullable columns, a nullable unique column, two CHECK constraints), so existing rows stay valid with NULL prices. After the baseline step above, apply it with `npm run db:migrate:deploy`. Deploy order: migration first, then the code that writes the new columns.
- **Payment-exception migration** (`20261026120000_payment_exception`): additive only — creates the `PaymentException` table (webhook mismatch log) and its indexes; no existing table or row is touched. Apply with `npm run db:migrate:deploy`.
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
| POST · PATCH · DELETE | `/products` · `/products/{id}` | owner | Body: `name, price, categoryId, sizeId, colorId, images[{url}], isFeatured?, isArchived?` |
| GET | `/categories` · `/categories/{id}` | public | Includes billboard |
| POST · PATCH · DELETE | `/categories` · `/categories/{id}` | owner | Body: `name, billboardId` |
| GET | `/billboards` · `/billboards/{id}` | public | |
| POST · PATCH · DELETE | `/billboards` · `/billboards/{id}` | owner | Body: `label, imageUrl` |
| GET | `/sizes` · `/colors` (+ `/{id}`) | public | |
| POST · PATCH · DELETE | `/sizes`, `/colors` (+ `/{id}`) | owner | Body: `name, value` (color value must be a hex code) |
| POST | `/checkout` | public, CORS | Body: `{ productIds: string[] }` → `{ url }` (Stripe Checkout). Only this store's unarchived, in-stock products are sold. |
| POST | `/api/stores` · PATCH/DELETE `/api/stores/{storeId}` | signed in / owner | Body: `{ name }` |
| POST | `/api/webhook` | Stripe signature | Handles `checkout.session.completed` (fulfils only if `payment_status` is `paid` and the session matches the order: same linked session id, same currency, and `amount_subtotal` equal to the recorded prices; otherwise the order is not fulfilled, the mismatch is written to `PaymentException` for review, and `[STRIPE_WEBHOOK_REJECTED]` is logged), `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. Fulfilment is a one-time unpaid→paid transition, so duplicate deliveries are no-ops; mismatch records are keyed by Stripe event id, so redeliveries record once. |

## Deployment (Vercel)

1. Import the repository in Vercel (framework: Next.js; default build command).
2. Add the environment variables above under **Settings → Environment Variables**, separately for Production and Preview (see the next section).
3. Run migrations against each environment's database (`npm run db:migrate:deploy` with that environment's `DIRECT_URL`).
4. Stripe → Developers → Webhooks: add `https://<admin-domain>/api/webhook` subscribed to `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Set `FRONTEND_STORE_URL` to the storefront's URL.

## Branching, environments and releases

This is a solo portfolio project, so it uses a single long-lived branch and short-lived working branches rather than permanent `development`/`staging` branches.

| Branch | Purpose | Deploys to | Database |
|---|---|---|---|
| `feat/*`, `fix/*`, `chore/*` | One focused change per branch, opened as a PR into `main` | Vercel **Preview** per push | Preview DB (separate from production) |
| `main` | Production-ready code | Vercel **Production** | Production DB |

- CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every push to `main` and on every PR into `main`.
- Vercel's Git integration does the deploys, so there's no separate deploy workflow to maintain: each PR gets a Preview URL for QA, and merging to `main` promotes to Production.
- **Use a separate preview database, never the production one.** Point Vercel's Preview environment at a dedicated database (e.g. a [Neon branch](https://neon.tech/docs/introduction/branching)) so preview deployments and migration trials can't touch production data. Set environment-specific values (`DATABASE_URL`, `DIRECT_URL`, Stripe keys, `FRONTEND_STORE_URL`) per environment in Vercel.
- **Release:** merge the PR into `main`. If the change includes a migration, apply it to the preview database first (`npm run db:migrate:deploy` with the preview `DIRECT_URL`), verify on the Preview deployment, then apply it to production **before** the new code serves traffic (see [Database](#database)), and merge.
- Recommended GitHub settings (set these in the repository settings; they are not configured from this repo): protect `main`; require the **CI / Lint, typecheck, test, build** check and an up-to-date branch before merging; block force-pushes; enable Dependabot alerts and secret scanning. Dependabot (`.github/dependabot.yml`) opens its PRs against `main`.

## Testing strategy

`npm test` runs 185 tests with Vitest. Most finish in milliseconds; the database tests boot an in-process Postgres and take longer:

- **Unit:** the seed safety guard, the backfill `--apply` guard, the dashboard store-ownership guard (`lib/require-store.ts`: owner allowed, non-owner and signed-out redirected), checkout configuration, Stripe event classification, request validation including image-host restriction (`lib/validations.ts`), revenue summary, product filter building, address formatting, cents rounding and the Stripe minimum charge.
- **Route handlers:** the real handlers are called with Prisma, Clerk and Stripe mocked. They cover 401/403 ownership checks, 400 validation messages, tenant isolation (scoped updates return 404; cross-store references are rejected), 409 on foreign-key conflicts, 500 without leaking details, product image replacement in one write, checkout (configuration validated before any write, store/stock filtering, rejecting partially-unavailable carts, zero-cent and below-minimum totals, integer cents, cleanup when Stripe fails), and the webhook (signature errors; fulfilment only for `paid` sessions; delayed payments; failed and unexpected events; duplicate delivery not re-archiving products an admin restored, checked against an in-memory fake database; retry on failure; durable recording of amount/currency/session mismatches to `PaymentException`, idempotent on event redelivery, and a 500 so Stripe retries if that write fails).

- **Database (`tests/db`):** the real migration SQL is applied to PGlite (Postgres compiled to WebAssembly, in-process) on top of legacy-shaped rows, checking that no data is lost, legacy prices stay NULL, and the CHECK and unique constraints reject bad data.

**Not covered yet:** route handlers against a real database (they use a mocked Prisma client), a full Stripe test-mode round trip, and browser end-to-end tests of the dashboard.

## Known limitations

- **Live demo has no Stripe webhook**, so completed demo checkouts remain unpaid and products aren't archived.
- **Orders placed before the price-snapshot migration have no recorded prices.** They are shown as estimates using current prices; they are never backfilled from catalog prices. `npm run backfill:prices` can fill them only from Stripe session line items.
- **Quantity is always 1.** Each product is treated as a unique item and is archived once sold.
- **No inventory reservation at checkout.** Availability is checked when the Stripe session is created but the product isn't held until payment, so two near-simultaneous checkouts of the same unique item can both proceed. A reservation design (atomic hold + expiry + refund on oversell) is documented but not yet implemented.
- **No rate limiting** on the public checkout endpoint. Repeated calls can create many unpaid orders, and nothing expires them.
- **Image uploads are unsigned** (a public, unsigned Cloudinary preset). Signed uploads (a server endpoint using `CLOUDINARY_API_SECRET`) would be the hardening step; stored image URLs are already restricted to approved hosts.
- **List endpoints aren't paginated.** Fine for hundreds of products per store; pagination is needed beyond that. The dashboard loads every paid order to compute revenue; a SQL aggregate would scale better.
- **Single currency (USD)** and prices stored without tax or shipping.
- **The live database predates the migration baseline.** It still needs a one-time `prisma migrate resolve --applied 0_init`.
- **Clerk runs in development mode** on `vercel.app` domains (production keys require a custom domain).

## License

Personal portfolio project. No license is granted for reuse.
