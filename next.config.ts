import type { NextConfig } from "next";

/*
  No `output: "standalone"` here.

  Standalone is for self-hosting the compiled server yourself, typically in a
  Docker image. It relocates the server bundle to `.next/standalone`, and on
  Vercel the builder looks in `.next/server` instead - so the API routes are
  never picked up. The symptom is quiet rather than obvious: the build passes,
  every route returns 200, and each one serves the same HTML shell because the
  static export is all Vercel can find. Sign-in, sync and every other route
  handler silently stop running.

  Vercel builds and runs Next.js itself, so the defaults are what is wanted.
*/
const nextConfig: NextConfig = {
  // Directory-style URLs, since there is no rewrite layer to clean them up.
  trailingSlash: true,
};

export default nextConfig;