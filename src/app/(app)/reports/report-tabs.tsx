"use client";

import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type ReportTab = "leave" | "attendance";

/**
 * Tab state lives in the URL (?tab=) rather than client state — each tab is a
 * full server-rendered section with its own independent filters, so
 * switching is just a navigation, not a client-side view swap.
 */
export function ReportTabs({ current }: { current: ReportTab }) {
  const router = useRouter();

  return (
    <SegmentedControl
      value={current}
      onChange={(tab) => router.push(`/reports?tab=${tab}`)}
      options={[
        { value: "leave", label: "รายงานการลา" },
        { value: "attendance", label: "รายงานเช็คอิน-เช็คเอาท์" },
      ]}
    />
  );
}
