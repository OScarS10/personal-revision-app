import type { NextConfig } from "next";

/*
  Standalone output for deployment with a server.

  This enables API routes, server-side authentication, and database access.
  The app can still be deployed to Vercel or any Node.js hosting platform.
*/
const nextConfig: NextConfig = {
  output: "standalone",
  // Directory-style URLs, since there is no rewrite layer to clean them up.
  trailingSlash: true,
};

export default nextConfig;