import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@arcmath/db";
import { DEFAULT_ROLE, registerSchema } from "@arcmath/shared";
import { withPepper } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email } });

    if (exists) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(withPepper(parsed.data.password), 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash,
        role: DEFAULT_ROLE
      },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("register failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
