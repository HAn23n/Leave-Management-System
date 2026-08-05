import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaveRequestForm } from "../leave-request-form";

export default async function NewLeaveRequestPage() {
  const appUser = await requireAppUser();
  // Approvers only review/approve documents — they never submit their own leave requests.
  if (appUser.role === "approver") redirect("/leave-requests");
  const supabase = createServerSupabaseClient();

  const [{ data: leaveTypes }, { data: holidays }, { data: existingLeave }] = await Promise.all([
    supabase.from("leave_types").select("id, name, color, require_reason").eq("is_active", true).order("name"),
    supabase.from("holidays").select("holiday_date, name"),
    supabase
      .from("leave_requests")
      .select("start_date, end_date, start_period, end_period")
      .eq("user_id", appUser.id)
      .in("status", ["pending", "approved"]),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="p-4 pb-0">
        <h1 className="text-lg font-semibold text-foreground">บันทึกการลา</h1>
      </div>
      <LeaveRequestForm
        mode="create"
        leaveTypes={leaveTypes ?? []}
        holidays={holidays ?? []}
        existingLeave={existingLeave ?? []}
        currentUserRole={appUser.role}
      />
    </main>
  );
}
