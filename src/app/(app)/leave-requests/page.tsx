import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFields } from "@/components/date-range-fields";
import { Search } from "lucide-react";
import type { LeaveStatus } from "@/lib/supabase/types";
import { displayName } from "@/lib/users";

interface SearchParams {
  status?: string;
  leave_type_id?: string;
  team_id?: string;
  from?: string;
  to?: string;
}

export default async function LeaveRequestsSearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("leave_requests")
    .select("*")
    .order("created_at", { ascending: false });

  // Approvers only ever review documents that were actually submitted —
  // a teammate's still-private draft isn't theirs to see, even though RLS
  // (scoped by team, not status) would otherwise let the row through.
  if (appUser.role === "approver") {
    query = query.neq("status", "draft");
  }

  // A plain employee only ever sees their own leave records here — team-wide
  // visibility is an approver/admin thing. RLS (migration 0026) already
  // enforces this at the DB level; filtering explicitly too keeps the intent
  // obvious and avoids depending solely on RLS for a page-level guarantee.
  if (appUser.role === "user") {
    query = query.eq("user_id", appUser.id);
  }

  const statusOptions = (Object.keys(STATUS_LABEL_TH) as LeaveStatus[]).filter(
    (s) => appUser.role !== "approver" || s !== "draft"
  );
  if (searchParams.status && (statusOptions as string[]).includes(searchParams.status)) {
    query = query.eq("status", searchParams.status as LeaveStatus);
  }
  if (searchParams.leave_type_id && searchParams.leave_type_id !== "all") {
    query = query.eq("leave_type_id", searchParams.leave_type_id);
  }

  // A plain member's filter is limited to teams they actually belong to
  // (RLS would return nothing for any other team anyway); an approver/admin
  // can filter by any team in the org.
  let teamOptions: { id: string; name: string }[] = [];
  if (appUser.role === "user") {
    const { data: memberships } = await supabase.from("user_teams").select("team_id").eq("user_id", appUser.id);
    const teamIds = (memberships ?? []).map((m) => m.team_id);
    if (teamIds.length > 0) {
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds).order("name");
      teamOptions = teams ?? [];
    }
  } else {
    const { data: teams } = await supabase.from("teams").select("id, name").eq("is_active", true).order("name");
    teamOptions = teams ?? [];
  }
  if (searchParams.team_id && teamOptions.some((t) => t.id === searchParams.team_id)) {
    query = query.eq("team_id", searchParams.team_id);
  }

  if (searchParams.from) {
    query = query.gte("end_date", searchParams.from);
  }
  if (searchParams.to) {
    query = query.lte("start_date", searchParams.to);
  }

  const [{ data: requests }, { data: leaveTypes }, { data: users }, { data: holidayRows }, { data: ownLeadRows }] =
    await Promise.all([
      query,
      supabase.from("leave_types").select("id, name, color"),
      supabase.from("users").select("id, email, nickname"),
      supabase.from("holidays").select("holiday_date, name"),
      appUser.role === "approver"
        ? supabase.from("team_leads").select("team_id, approval_order").eq("user_id", appUser.id)
        : Promise.resolve({ data: null }),
    ]);

  const leaveTypeMap = new Map((leaveTypes ?? []).map((lt) => [lt.id, lt]));
  const userMap = new Map((users ?? []).map((u) => [u.id, displayName(u)]));
  const holidayMap = new Map((holidayRows ?? []).map((h) => [h.holiday_date, h.name]));
  // A pending request whose current_level has already moved past this
  // approver's own chain position means they already acted (approved) on
  // it — the row's real status is still "pending" overall (waiting on the
  // next level), but showing the plain "รออนุมัติ" badge reads as "it's on
  // you", which is misleading once it's already left their hands.
  const ownApprovalOrderByTeam = new Map((ownLeadRows ?? []).map((l) => [l.team_id, l.approval_order]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">ค้นหาบันทึกการลา</h1>
        {appUser.role !== "approver" && (
          <Button asChild size="sm">
            <Link href="/leave-requests/new">+ บันทึกการลา</Link>
          </Button>
        )}
      </div>

      <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">สถานะ</Label>
          <Select name="status" defaultValue={searchParams.status ?? "all"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL_TH[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ประเภทการลา</Label>
          <Select name="leave_type_id" defaultValue={searchParams.leave_type_id ?? "all"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              {(leaveTypes ?? []).map((lt) => (
                <SelectItem key={lt.id} value={lt.id}>
                  {lt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {teamOptions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">ทีม</Label>
            <Select name="team_id" defaultValue={searchParams.team_id ?? "all"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกทีม</SelectItem>
                {teamOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DateRangeFields
          fromName="from"
          toName="to"
          fromDefault={searchParams.from}
          toDefault={searchParams.to}
          holidays={holidayMap}
        />

        <Button type="submit" size="sm" className="col-span-2 md:col-span-4">
          <Search className="h-4 w-4" />
          ค้นหา
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        {(requests ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบข้อมูล</p>
        )}

        {(requests ?? []).map((r) => {
          const ownOrder = ownApprovalOrderByTeam.get(r.team_id);
          const alreadyActedByMe = r.status === "pending" && ownOrder != null && r.current_level > ownOrder;
          return (
            <Link
              key={r.id}
              href={`/leave-requests/${r.request_no ?? r.id}`}
              className="flex flex-col gap-1 rounded-2xl border border-border bg-white p-4 shadow-sm shadow-black/[0.02] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {leaveTypeMap.get(r.leave_type_id)?.name ?? "-"}
                </span>
                {alreadyActedByMe ? (
                  <Badge variant="secondary">อนุมัติแล้ว รอลำดับถัดไป</Badge>
                ) : (
                  <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL_TH[r.status]}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatThaiDate(r.start_date)} - {formatThaiDate(r.end_date)} ({r.total_days ?? "-"} วัน)
              </p>
              {r.user_id !== appUser.id && (
                <p className="text-xs text-muted-foreground">โดย {userMap.get(r.user_id) ?? "-"}</p>
              )}
              {r.request_no && <p className="text-xs text-muted-foreground">เลขที่ {r.request_no}</p>}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
