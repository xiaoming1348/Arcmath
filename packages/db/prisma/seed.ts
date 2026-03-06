import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../src/client";

async function main() {
  const email = "admin@arcmath.local";
  const rawPassword = "Admin12345!";
  const pepper = process.env.PASSWORD_PEPPER ?? "";
  const passwordHash = await bcrypt.hash(`${rawPassword}${pepper}`, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      name: "ArcMath Admin",
      role: Role.ADMIN,
      passwordHash
    },
    create: {
      email,
      name: "ArcMath Admin",
      role: Role.ADMIN,
      passwordHash
    }
  });

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
