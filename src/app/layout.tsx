import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { AppProviders } from "@/components/shell";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "katex/dist/katex.min.css";
import "./globals.css";

/*
  The generators are registered for their side effects from store-provider, a
  client module, because that is the boundary where the client bundle is built.
  Importing them from this server component would populate the registry on the
  server only, and the browser would silently fall back to recall-only questions.
*/

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Specwise",
  description:
    "Specification-driven revision for AQA Economics, OCR Computer Science and Edexcel Mathematics. Works out which chapters you have not got, then generates questions to match.",
  applicationName: "Specwise",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${plexSans.variable} ${plexMono.variable} ${newsreader.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Resolves the stored theme during HTML parsing, before the first paint.
          Without this the page renders light and then flips to dark once React
          hydrates, which is a visible white flash for anyone on a dark-mode
          device. `data-theme="light"` above is only the server's default for the
          prerendered HTML; this script overwrites it.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
