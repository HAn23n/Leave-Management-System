import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT, STATUS_ACCENT_CLASS } from "@/lib/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LeaveStatus } from "@/lib/supabase/types";

const SUMMARY_STATUSES: LeaveStatus[] = ["draft", "pending", "approved", "rejected", "returned"];

export default async function DashboardPage() {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  const { data: ownRequests } = await supabase
    .from("leave_requests")
    .select("status")
    .eq("user_id", appUser.id);

  const counts = SUMMARY_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (ownRequests ?? []).filter((r) => r.status === s).length;
    return acc;
  }, {});

  const isApprover = appUser.role === "approver" || appUser.role === "admin";

  const { data: pendingTeamRequests } = isApprover
    ? await supabase
        .from("leave_requests")
        .select("id, request_no, user_id, leave_type_id, start_date, end_date, total_days")
        .eq("status", "pending")
        .order("submitted_at", { ascending: true })
    : { data: null };

  let requesterMap = new Map<string, string>();
  let leaveTypeMap = new Map<string, string>();
  if (pendingTeamRequests && pendingTeamRequests.length > 0) {
    const userIds = Array.from(new Set(pendingTeamRequests.map((r) => r.user_id)));
    const leaveTypeIds = Array.from(new Set(pendingTeamRequests.map((r) => r.leave_type_id)));
    const [{ data: users }, { data: leaveTypes }] = await Promise.all([
      supabase.from("users").select("id, full_name").in("id", userIds),
      supabase.from("leave_types").select("id, name").in("id", leaveTypeIds),
    ]);
    requesterMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    leaveTypeMap = new Map((leaveTypes ?? []).map((lt) => [lt.id, lt.name]));
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 pb-24">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">สวัสดี, {appUser.full_name}</h1>
        <p className="text-sm text-muted-foreground">สรุปคำขอลาของฉัน</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {SUMMARY_STATUSES.map((status) => (
          <Link key={status} href={`/leave-requests?status=${status}`}>
            <Card className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className={`h-1 w-full ${STATUS_ACCENT_CLASS[status]}`} />
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-3xl font-bold tracking-tight text-foreground">{counts[status] ?? 0}</span>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL_TH[status]}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {isApprover && (
        <Card>
          <CardHeader>
            <CardTitle>คำขอรออนุมัติของทีม</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(!pendingTeamRequests || pendingTeamRequests.length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีคำขอรออนุมัติ</p>
            )}
            {(pendingTeamRequests ?? []).map((r) => (
              <Link
                key={r.id}
                href={`/leave-requests/${r.id}`}
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
      )}
    </main>
  );
}
