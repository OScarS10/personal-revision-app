import type { Metadata } from "next";
import { NotebookPage } from "./notebook-client";

export const metadata: Metadata = {
  title: "Wrong answers · Revision",
  description: "Everything you have not got right, grouped by template.",
};

export default function Page() {
  return <NotebookPage />;
}
