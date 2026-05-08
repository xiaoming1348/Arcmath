import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/app/providers";
import { TopNav } from "@/components/top-nav";
import { resolveLocale } from "@/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArcMath",
  description: "ArcMath web app bootstrap"
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
    <html lang={locale} suppressHydrationWarning>
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
