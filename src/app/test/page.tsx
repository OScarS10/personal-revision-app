import type { Metadata } from "next";
import { TestPage } from "./test-client";

export const metadata: Metadata = {
  title: "Mock test · Revision",
  description: "Timed papers with feedback held back until the end.",
};

export default function Page() {
  return <TestPage />;
}
