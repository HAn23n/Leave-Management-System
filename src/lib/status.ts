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

export const PERIOD_LABEL_TH: Record<"full" | "morning" | "afternoon", string> = {
  full: "เต็มวัน",
  morning: "เช้า (08:30–12:00)",
  afternoon: "บ่าย (13:00–17:30)",
};
