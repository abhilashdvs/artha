import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { QuickAdd } from "@/components/QuickAdd";
import { DbInit } from "@/components/DbInit";
import { AuthGate } from "@/components/AuthGate";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Artha — Know your money. Own your future.",
  description: "Track every rupee: expenses, income, budgets, lending, subscriptions, goals and insights. Local-first, INR.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <DbInit />
          <AuthGate>
            <Sidebar />
            {/* pb-28 on mobile clears the bottom tab bar; the sidebar is w-56 on desktop */}
            <main className="pb-28 lg:pb-10 lg:pl-56">
              <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
            </main>
            <MobileNav />
            <QuickAdd />
          </AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
