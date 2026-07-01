import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/ui/Sidebar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nekretnine Dashboard — Scraper za nekretnine",
  description:
    "Dashboard za praćenje nekretnina s Njuškala. Automatsko skrapanje, filtriranje i Telegram obavijesti.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hr" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-[#f8f9fa] antialiased">
        <Sidebar />
        <main className="ml-[240px] p-8">{children}</main>
      </body>
    </html>
  );
}
