import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A completed Vercel deploy leaves .vercel/output containing the built
    // JavaScript. Linting that produced thousands of warnings about minified
    // code in a directory this project does not author.
    ".vercel/**",
  ]),
]);

export default eslintConfig;
