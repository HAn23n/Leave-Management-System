import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReportTabs, type ReportTab } from "./report-tabs";
import { LeaveReportTab } from "./leave-report-tab";
import { AttendanceReportTab } from "./attendance-report-tab";

interface ReportsSearchParams {
  tab?: string;
  user_id?: string;
  team_id?: string;
  leave_type_id?: string;
  status?: string;
  from?: string;
  to?: string;
}

export default async function ReportsPage({ searchParams }: { searchParams: ReportsSearchParams }) {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  const tab: ReportTab = searchParams.tab === "attendance" ? "attendance" : "leave";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">รายงานสรุป</h1>

      <ReportTabs current={tab} />

      {tab === "leave" ? (
        <LeaveReportTab appUser={appUser} supabase={supabase} searchParams={searchParams} />
      ) : (
        <AttendanceReportTab appUser={appUser} supabase={supabase} searchParams={searchParams} />
      )}
    </main>
  );
}
