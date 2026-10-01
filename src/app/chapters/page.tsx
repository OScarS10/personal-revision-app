import type { Metadata } from "next";
import { ChaptersPage } from "./chapters-client";

export const metadata: Metadata = {
  title: "Chapters · Revision",
  description: "Browse the specification and choose what to revise.",
};

export default function Page() {
  return <ChaptersPage />;
}
