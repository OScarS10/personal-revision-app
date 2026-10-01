/*
  Static preview server.

  next.config.ts sets output: "export", so the build produces plain files in
  out/ and `next start` no longer applies. This serves that directory the way a
  static host would, which keeps `npm start` and the headless browser check
  working locally.

  Deliberately dependency-free. The export is static, so a static file server is
  all that is needed, and adding a dependency to do it would be the only thing
  in this project that cannot be audited by reading it.
*/

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const OUT = resolve(process.cwd(), "out");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  // Strip the query string and decode, then normalise so a crafted path cannot
  // escape the out directory.
  const raw = decodeURIComponent(url.pathname);
  const target = resolve(join(OUT, normalize(raw)));

  if (target !== OUT && !target.startsWith(OUT + sep)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  // A directory request redirects to its trailing-slash form, matching what a
  // static host does, so relative asset URLs resolve correctly.
  let file = target;
  if (raw.endsWith("/")) {
    file = join(target, "index.html");
  } else {
    const asDirectory = join(target, "index.html");
    if (exists(asDirectory)) {
      res.writeHead(308, { location: `${raw}/` });
      res.end();
      return;
    }
  }

  if (!exists(file)) {
    const notFound = join(OUT, "404.html");
    const body = exists(notFound) ? notFound : file;
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    createReadStream(body).pipe(res);
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

try {
  statSync(OUT);
} catch {
  console.error(`No static export found at ${OUT}. Run "npm run build" first.`);
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(`Serving ${OUT} at http://${HOST}:${PORT}`);
});
