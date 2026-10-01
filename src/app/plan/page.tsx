import type { Metadata } from "next";
import { PlanPage } from "./plan-client";

export const metadata: Metadata = {
  title: "Today · Revision",
  description: "Exam countdown, a weighted daily plan, and your wrong answers.",
};

export default function Page() {
  return <PlanPage />;
}
