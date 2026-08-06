import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT } from "@/lib/status";
import type { LeaveStatus } from "@/lib/supabase/types";

/**
 * The one place that decides how a request's status renders for the
 * viewing approver — used on the dashboard card, search list, and request
 * detail page so an approver who already acted at their level always sees
 * "อนุมัติแล้ว รอลำดับถัดไป" instead of a plain "รออนุมัติ" that reads as
 * "still needs you", regardless of which page they're looking at.
 */
export function ApprovalStatusBadge({
  status,
  alreadyActedByMe,
  levelProgress,
}: {
  status: LeaveStatus;
  /** True when the viewer is an approver whose own chain level has already passed. */
  alreadyActedByMe?: boolean;
  /** e.g. "2/2" — appended to the plain status label when there's no more specific badge to show. */
  levelProgress?: string;
}) {
  if (status === "pending" && alreadyActedByMe) {
    return <Badge variant="secondary">อนุมัติแล้ว รอลำดับถัดไป</Badge>;
  }
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status]}>
      {STATUS_LABEL_TH[status]}
      {levelProgress ? ` (${levelProgress})` : ""}
    </Badge>
  );
}
