import type { Metadata } from "next";
import { StatsPage } from "./stats-client";

export const metadata: Metadata = {
  title: "Progress · Revision",
  description: "Model estimates, grade boundaries and your data.",
};

export default function Page() {
  return <StatsPage />;
}
