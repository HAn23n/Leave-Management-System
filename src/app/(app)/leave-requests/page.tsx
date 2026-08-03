import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LeaveStatus } from "@/lib/supabase/types";

interface SearchParams {
  status?: string;
  leave_type_id?: string;
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

  const validStatuses = Object.keys(STATUS_LABEL_TH) as LeaveStatus[];
  if (searchParams.status && (validStatuses as string[]).includes(searchParams.status)) {
    query = query.eq("status", searchParams.status as LeaveStatus);
  }
  if (searchParams.leave_type_id) {
    query = query.eq("leave_type_id", searchParams.leave_type_id);
  }
  if (searchParams.from) {
    query = query.gte("end_date", searchParams.from);
  }
  if (searchParams.to) {
    query = query.lte("start_date", searchParams.to);
  }

  const [{ data: requests }, { data: leaveTypes }, { data: users }] = await Promise.all([
    query,
    supabase.from("leave_types").select("id, name, color"),
    appUser.role === "user"
      ? Promise.resolve({ data: null })
      : supabase.from("users").select("id, full_name"),
  ]);

  const leaveTypeMap = new Map((leaveTypes ?? []).map((lt) => [lt.id, lt]));
  const userMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">ค้นหาบันทึกการลา</h1>
        <Button asChild size="sm">
          <Link href="/leave-requests/new">+ บันทึกการลา</Link>
        </Button>
      </div>

      <form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <select
          name="status"
          defaultValue={searchParams.status ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        >
          <option value="">ทุกสถานะ</option>
          {(Object.keys(STATUS_LABEL_TH) as LeaveStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL_TH[s]}
            </option>
          ))}
        </select>

        <select
          name="leave_type_id"
          defaultValue={searchParams.leave_type_id ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        >
          <option value="">ทุกประเภท</option>
          {(leaveTypes ?? []).map((lt) => (
            <option key={lt.id} value={lt.id}>
              {lt.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="from"
          defaultValue={searchParams.from ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={searchParams.to ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        />

        <Button type="submit" variant="outline" size="sm" className="col-span-2 md:col-span-4">
          กรอง
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        {(requests ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบข้อมูล</p>
        )}

        {(requests ?? []).map((r) => (
          <Link
            key={r.id}
            href={`/leave-requests/${r.id}`}
            className="flex flex-col gap-1 rounded-2xl border border-border bg-white p-4 shadow-sm shadow-black/[0.02] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {leaveTypeMap.get(r.leave_type_id)?.name ?? "-"}
              </span>
              <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL_TH[r.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatThaiDate(r.start_date)} - {formatThaiDate(r.end_date)} ({r.total_days ?? "-"} วัน)
            </p>
            {appUser.role !== "user" && (
              <p className="text-xs text-muted-foreground">โดย {userMap.get(r.user_id) ?? "-"}</p>
            )}
            {r.request_no && <p className="text-xs text-muted-foreground">เลขที่ {r.request_no}</p>}
          </Link>
        ))}
      </div>
    </main>
  );
}
