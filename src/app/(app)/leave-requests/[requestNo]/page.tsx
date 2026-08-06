import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT, PERIOD_LABEL_TH } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeaveRequestActions } from "./leave-request-actions";
import { findLeaveRequestByParam } from "@/lib/leave-requests";
import { resolveApprovalChain } from "@/lib/approval-chain";

export default async function LeaveRequestDetailPage({ params }: { params: { requestNo: string } }) {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  const leaveRequest = await findLeaveRequestByParam(supabase, params.requestNo);

  if (!leaveRequest) notFound();

  const [{ data: leaveType }, { data: requester }, { data: approver }, { data: logs }] = await Promise.all([
    supabase.from("leave_types").select("name").eq("id", leaveRequest.leave_type_id).maybeSingle(),
    supabase.from("users").select("email").eq("id", leaveRequest.user_id).maybeSingle(),
    leaveRequest.approver_id
      ? supabase.from("users").select("email").eq("id", leaveRequest.approver_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("leave_request_logs")
      .select("*")
      .eq("request_id", leaveRequest.id)
      .order("created_at", { ascending: true }),
  ]);

  const actorIds = Array.from(new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))) as string[];
  const { data: actors } =
    actorIds.length > 0
      ? await supabase.from("users").select("id, email").in("id", actorIds)
      : { data: [] as { id: string; email: string }[] };
  const actorMap = new Map((actors ?? []).map((a) => [a.id, a.email]));

  const isOwner = leaveRequest.user_id === appUser.id;

  // Defense in depth on top of RLS: RLS already scopes which rows this
  // query can return (owner / admin / approver-of-this-team), so this
  // should never actually trigger — but an explicit check here means a
  // future RLS regression fails closed (404) instead of silently leaking
  // another team's document to whoever guesses its request number.
  let approverInScopeOfRequest = false;
  if (!isOwner && appUser.role === "approver") {
    // Two independent ways an approver is in-scope: leads the request's team
    // (team_leads), or is that specific requester's cross-team override
    // approver (approver_mappings) — mirrors the two OR'd RLS select policies.
    const [{ data: lead }, { data: mapping }] = await Promise.all([
      supabase
        .from("team_leads")
        .select("user_id")
        .eq("user_id", appUser.id)
        .eq("team_id", leaveRequest.team_id)
        .maybeSingle(),
      supabase
        .from("approver_mappings")
        .select("user_id")
        .eq("user_id", leaveRequest.user_id)
        .eq("approver_id", appUser.id)
        .maybeSingle(),
    ]);
    approverInScopeOfRequest = !!lead || !!mapping;
  }
  const isAuthorizedToView = isOwner || appUser.role === "admin" || approverInScopeOfRequest;
  if (!isAuthorizedToView) notFound();

  const isApproverInScope = appUser.role === "approver" || appUser.role === "admin";

  // Sequential approval chain: only the approver assigned to the request's
  // current level (or an override approver, or an admin) may act on it right
  // now — other levels/teammates can see it (RLS is team-scoped, not
  // level-scoped) but their approve/reject/return buttons must stay hidden.
  const chain =
    leaveRequest.status === "pending"
      ? await resolveApprovalChain({ userId: leaveRequest.user_id, teamId: leaveRequest.team_id })
      : null;
  // `level` is team_leads.approval_order's stored value, not a sequential
  // position — findIndex gives the human-readable "X of Y" position for
  // display, separately from the stable value used for matching below.
  const currentLevelIndex =
    chain?.type === "chain" ? chain.levels.findIndex((l) => l.level === leaveRequest.current_level) : -1;
  const pendingLevelApprover = currentLevelIndex >= 0 ? chain!.levels[currentLevelIndex].approver : null;
  const isCurrentApprover =
    appUser.role === "admin" ||
    (chain?.type === "override"
      ? chain.levels.some((l) => l.approver.id === appUser.id)
      : pendingLevelApprover?.id === appUser.id);
  const totalLevels = chain?.type === "chain" ? chain.levels.length : 1;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">รายละเอียดคำขอลา</h1>
        <Badge variant={STATUS_BADGE_VARIANT[leaveRequest.status]}>
          {STATUS_LABEL_TH[leaveRequest.status]}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{leaveType?.name ?? "-"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {leaveRequest.request_no && (
            <Row label="เลขที่เอกสาร" value={leaveRequest.request_no} />
          )}
          <Row label="ผู้ขอลา" value={requester?.email ?? "-"} />
          <Row
            label="วันที่เริ่ม"
            value={`${formatThaiDate(leaveRequest.start_date)} (${PERIOD_LABEL_TH[leaveRequest.start_period]})`}
          />
          <Row
            label="วันที่สิ้นสุด"
            value={`${formatThaiDate(leaveRequest.end_date)} (${PERIOD_LABEL_TH[leaveRequest.end_period]})`}
          />
          <Row label="จำนวนวันลา" value={leaveRequest.total_days != null ? `${leaveRequest.total_days} วัน` : "-"} />
          <Row label="เหตุผล" value={leaveRequest.reason || "-"} />
          {approver && <Row label="ผู้อนุมัติล่าสุด" value={approver.email} />}
          {leaveRequest.status === "pending" && chain?.type === "chain" && totalLevels > 1 && currentLevelIndex >= 0 && (
            <Row label="ลำดับอนุมัติ" value={`${currentLevelIndex + 1} / ${totalLevels}`} />
          )}
          {leaveRequest.status === "pending" && pendingLevelApprover && (
            <Row label="รอการอนุมัติจาก" value={pendingLevelApprover.email} />
          )}
          {leaveRequest.approver_note && <Row label="หมายเหตุ" value={leaveRequest.approver_note} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ประวัติเอกสาร</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 border-l border-border pl-4">
            {(logs ?? []).map((log) => (
              <li key={log.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" />
                <p className="font-medium text-foreground">
                  {log.from_status ? `${STATUS_LABEL_TH[log.from_status]} → ` : ""}
                  {STATUS_LABEL_TH[log.to_status]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {log.actor_id ? actorMap.get(log.actor_id) ?? "-" : "ระบบ"} ·{" "}
                  {formatThaiDate(log.created_at.slice(0, 10), "long")}
                </p>
                {log.note && <p className="mt-1 text-xs text-muted-foreground">หมายเหตุ: {log.note}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {isOwner && appUser.role !== "approver" && (leaveRequest.status === "draft" || leaveRequest.status === "returned") && (
        <Button asChild variant="outline">
          <Link href={`/leave-requests/${leaveRequest.request_no}/edit`}>แก้ไข</Link>
        </Button>
      )}

      <LeaveRequestActions
        requestId={leaveRequest.id}
        status={leaveRequest.status}
        isOwner={isOwner}
        isApproverInScope={isApproverInScope}
        isCurrentApprover={isCurrentApprover}
        currentUserRole={appUser.role}
      />
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
