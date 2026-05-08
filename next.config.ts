import type { NextConfig } from "next";

/** Vercel sets VERCEL=1 during build & runtime. Standalone output is for Docker; Vercel uses its own serverless bundle. */
const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "standalone" }),
};

export default nextConfig;
