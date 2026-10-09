import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SimulatedBanner } from "@/components/simulated-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DigSync — public works registry & clash coordination",
  description:
    "A public registry for civic works projects with a clash-detection engine that flags repeat digs and proposes coordinated schedules. Simulated demo data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <SimulatedBanner />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-neutral-200 px-4 py-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
          DigSync — hackathon demo. All projects, departments and contractors
          shown here are simulated.
        </footer>
      </body>
    </html>
  );
}
