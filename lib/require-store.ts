import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";

/**
 * Server-side authorization guard for dashboard pages and their data access.
 *
 * Next.js layouts are not a reliable security boundary: they render
 * independently of the pages they wrap and are not guaranteed to re-run on
 * every navigation, so a check in the dashboard layout alone can leave a
 * page's data fetching unprotected. Following the App Router's recommended
 * "check close to the data" model, every store-scoped page calls this guard
 * directly before reading any data.
 *
 * It redirects signed-out users to sign-in and non-owners away to the store
 * picker, so another tenant's orders, customer addresses, phone numbers,
 * products and statistics are never returned.
 *
 * Wrapped in React's `cache` so the layout and the page it renders share a
 * single ownership query within one request rather than issuing two.
 */
export const requireStoreAccess = cache(async (storeId: string): Promise<{ id: string }> => {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const store = await prismadb.store.findFirst({
    where: { id: storeId, userId },
    select: { id: true },
  });
  if (!store) redirect("/");

  return store;
});
