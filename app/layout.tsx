import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ModalProvider } from "@/providers/modal-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "EcommerceCloud — Admin Dashboard",
    template: "%s | EcommerceCloud",
  },
  description:
    "EcommerceCloud is a multi-store admin dashboard to manage products, categories, inventory, orders and analytics.",
};

export default function RootLayout({
  children,
}: {

  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ToastProvider/>
        <ModalProvider/>
        {children}
        </ThemeProvider>
        
        </body>
    </html>
    </ClerkProvider>
  );
}
