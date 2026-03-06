import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessAdmin, isRole } from "@arcmath/shared";
import { getToken } from "next-auth/jwt";

const authSecret = process.env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";
const protectedPrefixes = ["/dashboard", "/problems", "/assignments", "/resources", "/membership", "/admin"];

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isProtectedRoute = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: authSecret });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin")) {
    const tokenRole = typeof token.role === "string" && isRole(token.role) ? token.role : null;
    if (!canAccessAdmin(tokenRole)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/problems/:path*",
    "/assignments/:path*",
    "/resources/:path*",
    "/membership/:path*",
    "/admin/:path*"
  ]
};
