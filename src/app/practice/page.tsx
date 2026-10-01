import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticePage } from "./practice-client";

export const metadata: Metadata = {
  title: "Practice · Revision",
  description: "Adaptive, untimed practice pitched at your current level.",
};

/*
  The setup form reads query parameters so the notebook and the exam plan can
  deep-link into a chosen subject and chapter set. Reading them opts the page
  out of static prerendering, so the boundary keeps the shell in the export and
  the form fills in on the client, which is where it is interactive anyway.
*/
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PracticePage />
    </Suspense>
  );
}
