# EcommerceCloud — Admin Dashboard

A multi-store ecommerce **admin dashboard** built with Next.js 14 (App Router). Create and manage stores, billboards, categories, sizes, colors and products, view orders, and track revenue/sales analytics. It also exposes a **public REST API** that powers the [QuickCart](../QuickCart) storefront.

> This is the backend/control panel of a two-app system:
> **EcommerceCloud** (this repo — admin + API) and **QuickCart** (customer storefront that consumes this API).

## ✨ Features

- 🏬 **Multi-store** — one account can own multiple stores, each with isolated data
- 🖼️ **Billboards** — hero/marketing banners, assigned per category
- 🗂️ **Catalog management** — categories, sizes, colors, and products with multiple images
- 📦 **Products** — pricing, featured flag, archive flag, image gallery (Cloudinary)
- 🧾 **Orders** — paid/unpaid status, itemized products, customer address & phone
- 📊 **Analytics** — total revenue, sales count, in-stock count, and a monthly revenue chart
- ⚙️ **Store settings** — rename or delete a store; view the store's public API URL
- 🔐 **Auth** — Clerk (sign-in / sign-up, protected dashboard, self-gated API)
- 💳 **Payments** — Stripe Checkout + webhook that marks orders paid and archives sold items
- 🌗 **Dark mode** — system-aware theme toggle

## 🧱 Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Auth | Clerk (`@clerk/nextjs` v5) |
| Database | PostgreSQL + Prisma ORM |
| UI | Tailwind CSS, shadcn/ui (Radix primitives), lucide-react |
| Forms | react-hook-form + zod |
| Data grids | @tanstack/react-table |
| Charts | recharts |
| Images | Cloudinary (`next-cloudinary`) |
| Payments | Stripe |
| State | zustand |

## 📁 Project structure

```
app/
  (auth)/            Clerk sign-in / sign-up routes
  (root)/            First-run: create your first store
  (dashboard)/[storeId]/(routes)/
    page.tsx         Analytics overview
    billboards/  categories/  sizes/  colors/  products/  orders/  settings/
  api/
    stores/                     POST create, PATCH update, DELETE
    [storeId]/billboards/       CRUD + public GET
    [storeId]/categories/       CRUD + public GET
    [storeId]/sizes/            CRUD + public GET
    [storeId]/colors/           CRUD + public GET
    [storeId]/products/         CRUD + public GET (filter by category/color/size/featured)
    [storeId]/checkout/         Public: creates a Stripe session (CORS enabled)
    webhook/                    Stripe webhook (marks orders paid)
actions/             Server-side analytics queries
components/           UI, modals, nav, data-table
lib/                 prismadb, stripe, utils
prisma/schema.prisma Data model
prisma/seed.ts       Demo catalog seeder
```

## 🚀 Getting started

### 1. Prerequisites
- Node.js 18+
- A PostgreSQL database — **[Neon](https://neon.tech)** recommended (free, serverless, no idle-deletion)
- [Clerk](https://clerk.com), [Stripe](https://stripe.com) and [Cloudinary](https://cloudinary.com) accounts (test mode is fine)

### 2. Install
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Fill in the values (see `.env.example` for the full list). **Note:** URL-encode any special characters in your DB password (`@` → `%40`).

### 4. Create the database schema
```bash
npx prisma generate
npx prisma migrate dev --name init      # or: npx prisma db push
```

### 5. (Optional) Seed a demo catalog
Seeds one store with 12 categories, billboards, sizes, colors and ~50 products.
```bash
# To own the demo store in the dashboard, first sign in once, copy your Clerk
# user id from the Clerk dashboard, then:
SEED_STORE_OWNER_ID=user_xxx npm run seed
```
The seed prints the **store id** and the exact `NEXT_PUBLIC_API_URL` to paste into QuickCart's `.env`.

### 6. Run
```bash
npm run dev            # http://localhost:3000
```

### 7. Stripe webhook (for local order updates)
```bash
stripe listen --forward-to localhost:3000/api/webhook
# put the printed whsec_... into STRIPE_WEBHOOK_SECRET
```

## 🌐 The public API

Each store exposes read endpoints the storefront consumes:

```
GET /api/{storeId}/products?categoryId=&colorId=&sizeId=&isFeatured=
GET /api/{storeId}/products/{productId}
GET /api/{storeId}/categories        /categories/{id}
GET /api/{storeId}/sizes  /colors  /billboards/{id}
POST /api/{storeId}/checkout         { productIds: string[] } -> { url }
```

Write endpoints require a Clerk session **and** store ownership.

## ☁️ Deployment (Vercel)

1. Push to GitHub and import the repo into [Vercel](https://vercel.com).
2. Add every variable from `.env.example` in **Project → Settings → Environment Variables**.
3. Set `FRONTEND_STORE_URL` to your deployed QuickCart URL.
4. Build command `next build` (default). Prisma Client is generated automatically during install/build.
5. In Stripe, add a webhook endpoint `https://<your-admin>.vercel.app/api/webhook` for `checkout.session.completed` and copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Use **Neon** or another always-on Postgres for production — Supabase free projects pause when idle.

## 📝 License

Personal portfolio project.
