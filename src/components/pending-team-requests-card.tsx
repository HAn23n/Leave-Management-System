import Link from "next/link";
import { formatThaiDate } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT } from "@/lib/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PendingTeamRequestRow {
  id: string;
  request_no: string | null;
  user_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
}

export function PendingTeamRequestsCard({
  requests,
  requesterMap,
  leaveTypeMap,
}: {
  requests: PendingTeamRequestRow[];
  requesterMap: Map<string, string>;
  leaveTypeMap: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>คำขอรออนุมัติของทีม</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {requests.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีคำขอรออนุมัติ</p>
        )}
        {requests.map((r) => (
          <Link
            key={r.id}
            href={`/leave-requests/${r.request_no ?? r.id}`}
            className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:border-primary/30 hover:bg-accent/40"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {requesterMap.get(r.user_id) ?? "-"} · {leaveTypeMap.get(r.leave_type_id) ?? "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatThaiDate(r.start_date)} - {formatThaiDate(r.end_date)} ({r.total_days ?? "-"} วัน)
              </p>
            </div>
            <Badge variant={STATUS_BADGE_VARIANT.pending}>{STATUS_LABEL_TH.pending}</Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
