import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/app/providers";
import { TopNav } from "@/components/top-nav";
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
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 pb-16 pt-8 md:px-8">
            <TopNav session={session} />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
