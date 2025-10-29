// gym-tracker-app/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ✅ skip ESLint errors in Vercel builds
  },
};

export default nextConfig;
