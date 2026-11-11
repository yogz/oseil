import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Nothing gains from announcing which framework serves this, and it is one
  // fewer line telling an attacker what to look up.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          development: process.env.NODE_ENV === "development",
          // Without it the policy is refused, and so is the build: the page
          // must be allowed to reach the Supabase project.
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        }),
      },
    ];
  },
};

export default nextConfig;
