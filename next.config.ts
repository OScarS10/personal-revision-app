import type { NextConfig } from "next";

/*
  Static export.

  The app has no server: no API routes, no server actions, no auth, and every
  route already prerenders to static HTML. Progress lives in the browser's
  localStorage. So there is nothing a server would do at runtime.

  Exporting statically fits that shape and has a practical benefit here: the
  build emits plain files instead of serverless function wrappers, which avoids
  the Windows symlink requirement that blocks deployment on machines without
  Developer Mode.
*/
const nextConfig: NextConfig = {
  output: "export",
  // Directory-style URLs, since there is no rewrite layer to clean them up.
  trailingSlash: true,
};

export default nextConfig;
