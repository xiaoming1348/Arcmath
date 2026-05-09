import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/app/providers";
import { TopNav } from "@/components/top-nav";
import { resolveLocale } from "@/i18n/server";
import "./globals.css";

// Three-font stack, all loaded by next/font for FOUT-free SSR:
//  - Space Grotesk (display): geometric grotesk with character — used
//    for h1/h2/h3 + hero headline. Replaces the previous JetBrains
//    Mono headlines that user said felt "too square / too stiff".
//  - Inter (sans / body): clean, neutral, optimized for long math
//    problem statements where readability beats personality.
//  - JetBrains Mono (mono): kept for badges, kicker, code blocks,
//    and verification verdict tags — where the REPL/kernel feel
//    actually fits.
// Each exposes a CSS variable so globals.css can pick the role.
const sansFont = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-sans"
});
const displayFont = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-display",
  weight: ["400", "500", "600", "700"]
});
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-mono",
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  title: "ArcMath — Formally verified competition math",
  description:
    "Math competition practice where every step a student writes is checked by SymPy or Lean — not by an LLM guessing. AMC, AIME, Putnam, Euclid, MAT, STEP, USAMO."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, locale] = await Promise.all([
    getServerSession(authOptions),
    resolveLocale()
  ]);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${sansFont.variable} ${displayFont.variable} ${monoFont.variable}`}
    >
      <body className="antialiased" suppressHydrationWarning>
        <Providers locale={locale}>
          <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-5 pb-20 pt-6 md:px-8 md:pt-8">
            <TopNav session={session} />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
