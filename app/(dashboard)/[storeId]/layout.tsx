import Navbar from "@/components/navbar";
import { requireStoreAccess } from "@/lib/require-store";

export default async function DashboardLayout({
  children,
  params: paramsPromise
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>
}) {
  const params = await paramsPromise;
  // Authorization lives in the guard (shared with each page via React cache),
  // not only here: a layout is not a reliable security boundary on its own.
  await requireStoreAccess(params.storeId);

  return (
    <>
     <Navbar/>
      {children}
    </>
  );
}
