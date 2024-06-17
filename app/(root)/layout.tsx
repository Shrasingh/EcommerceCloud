import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation"; // Correct import for redirect
import { Chilanka } from "next/font/google";

export default async function SetupLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { userId } = auth();
 
  if (!userId) {
    redirect('/sign-in');
    return; // Ensure function exits after redirect
  }

  

  const store = await prismadb.store.findFirst({
    where: {
      userId
    }
  });

  if (store) {
    redirect(`/${store.id}`);
    return; // Ensure function exits after redirect
  }

  return (
    <>
      {children}
    </>
  );
}
