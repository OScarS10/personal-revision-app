import type { Metadata } from "next";
import { ReviewPage } from "./review-client";

export const metadata: Metadata = {
  title: "Review · Revision",
  description: "Spaced repetition over the chapters you are forgetting.",
};

export default function Page() {
  return <ReviewPage />;
}
