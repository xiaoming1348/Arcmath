import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arcmath/db", "@arcmath/shared"]
};

export default nextConfig;
