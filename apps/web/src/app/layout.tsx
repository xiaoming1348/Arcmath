import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Fraunces } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/app/providers";
import { TopNav } from "@/components/top-nav";
import { resolveLocale } from "@/i18n/server";
import "./globals.css";

// Three-font stack (v3 design system, 2026-05-13):
//
//   - Plus Jakarta Sans (display) — geometric but rounder and warmer
//     than Space Grotesk. Same family Brilliant.org-class edtech and
//     Vercel-adjacent dev product pages use; conveys "modern tech"
//     without the cold/library feel of pure neo-grotesque.
//   - Inter (body) — workhorse for body copy + form fields. Excellent
//     hinting for long math problem statements.
//   - JetBrains Mono (mono) — badges, kicker, code, verification tags.
//
// Chinese rendering is handled by CSS font-stack fallback in
// globals.css (PingFang SC → Hiragino Sans GB → MS YaHei → fallbacks);
// loading a CJK-subset web font would balloon transfer by ~3-5 MB and
// the system fonts on Apple/Windows render well at our sizes.
const sansFont = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-sans"
});
const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-display",
  weight: ["400", "500", "600", "700", "800"]
});
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-mono",
  weight: ["400", "500", "600"]
});
// Fraunces — variable serif used as our "florid" display font on
// the single hero accent word. It has true italic style with deep
// stress curves; at 80px+ it reads as magazine-cover-elegant rather
// than corporate. Loaded only at the weights/styles we actually use.
const florid = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-florid",
  weight: ["400", "500", "600", "700"],
  style: ["italic", "normal"]
});

export const metadata: Metadata = {
  title: "ArcMath — Math teaching platform for schools",
  description:
    "A Canvas-style math teaching platform for schools and tutoring organizations: classes, rosters, PDF assignments, submissions, gradebooks, reports, and verified grading."
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
      className={`${sansFont.variable} ${displayFont.variable} ${monoFont.variable} ${florid.variable}`}
    >
      <body className="antialiased" suppressHydrationWarning>
        <Providers locale={locale}>
          <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-5 pb-20 pt-6 md:px-8 md:pt-8">
            <TopNav session={session} locale={locale} />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
