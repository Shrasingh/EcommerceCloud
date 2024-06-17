import prismadb from "@/lib/prismadb";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Navbar from "@/components/navbar";
export default async function DashboardLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { storeId: string }
}) {
  const { userId } = auth();
  
  if (!userId) {
    redirect('/sign-in');
   // return; // ensure function exits after redirect
  }

  const store = await prismadb.store.findFirst({
    where: {
      id: params.storeId, // corrected to match the params key
      userId // corrected to match the authenticated user
    }
  });

  if (!store) {
    redirect('/');
  return; // ensure function exits after redirect
  }

  // if (store) {
  //   redirect(`/${store.id}`);
  //    //ensure function exits after redirect
  // }

  return (
    <>
     <Navbar/>
      {children}
    </>
  );
}
