import type { Metadata } from "next";
import { Geist, Geist_Mono, Hedvig_Letters_Serif } from "next/font/google";
import { Suspense } from "react";
import { Intro, INTRO_SCRIPT } from "@/components/Intro";
import { Logo } from "@/components/Logo";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const hedvig = Hedvig_Letters_Serif({ variable: "--font-hedvig", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Tagih",
  description: "Agentic collections on PayPal. Get paid without the awkward follow-ups.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${hedvig.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Intro />
        <div className="app-frame">
        <Suspense
          fallback={
            <header className="topbar">
              <div className="topbar-inner">
                <Logo />
              </div>
            </header>
          }
        >
          <TopBar />
        </Suspense>
        <main className="shell">{children}</main>
        </div>
      </body>
    </html>
  );
}
