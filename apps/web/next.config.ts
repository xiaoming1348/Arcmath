import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@arcmath/db", "@arcmath/shared"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.prisma/client/**/*",
      "./node_modules/@prisma/client/**/*",
      "./node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*",
      "./node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**/*",
      "../../node_modules/.prisma/client/**/*",
      "../../node_modules/@prisma/client/**/*",
      "../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*",
      "../../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**/*"
    ]
  }
};

export default nextConfig;
