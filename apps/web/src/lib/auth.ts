import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@arcmath/db";
import { DEFAULT_ROLE, type Role } from "@arcmath/shared";
import { loginSchema } from "@arcmath/shared";
import { withPepper } from "@/lib/password";

const authSecret = process.env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";
const isDevelopment = process.env.NODE_ENV !== "production";

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  session: {
    strategy: "jwt"
  },
  ...(isDevelopment
    ? {
        cookies: {
          sessionToken: {
            name: "arcmath.dev.session-token",
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: false
            }
          }
        }
      }
    : {}),
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          return null;
        }

        // passwordHash is nullable for accounts that were spawned by an
        // admin's class-roster import and haven't yet set a password.
        // Those users must go through /login/set-password before they
        // can sign in normally; refuse to authenticate them through the
        // password form until they do.
        if (!user.passwordHash) {
          return null;
        }

        const valid = await bcrypt.compare(withPepper(parsed.data.password), user.passwordHash);
        if (!valid) {
          return null;
        }

        // Hard-block self-signup accounts that haven't verified their
        // email yet. Admin-spawned accounts that went through
        // /login/set-password already have emailVerifiedAt set by that
        // endpoint, so they pass this check.
        //
        // We throw with a distinguishable error message rather than
        // returning null so the login page can show the "resend
        // verification email" affordance instead of the generic
        // "invalid credentials" message.
        if (!user.emailVerifiedAt) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = ((token.role as Role | undefined) ?? DEFAULT_ROLE) as Role;
      }
      return session;
    }
  }
};
