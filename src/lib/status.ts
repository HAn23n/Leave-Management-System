import type { LeaveStatus } from "@/lib/supabase/types";

export const STATUS_LABEL_TH: Record<LeaveStatus, string> = {
  draft: "ฉบับร่าง",
  pending: "รออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
  returned: "ส่งคืน",
};

export const STATUS_BADGE_VARIANT: Record<
  LeaveStatus,
  "default" | "secondary" | "outline" | "success" | "warning" | "destructive"
> = {
  draft: "outline",
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
  returned: "warning",
};

// Left-accent-bar color per status for the dashboard stat cards.
export const STATUS_ACCENT_CLASS: Record<LeaveStatus, string> = {
  draft: "bg-zinc-300",
  pending: "bg-amber-400",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  cancelled: "bg-zinc-300",
  returned: "bg-amber-400",
};

export const PERIOD_LABEL_TH: Record<"full" | "morning" | "afternoon", string> = {
  full: "เต็มวัน",
  morning: "เช้า (08:30–12:00)",
  afternoon: "บ่าย (13:00–17:30)",
};
