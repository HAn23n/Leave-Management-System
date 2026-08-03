import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaveRequestForm } from "../leave-request-form";

export default async function NewLeaveRequestPage() {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  const [{ data: leaveTypes }, { data: holidays }] = await Promise.all([
    supabase.from("leave_types").select("id, name, color").eq("is_active", true).order("name"),
    supabase.from("holidays").select("holiday_date"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="p-4 pb-0">
        <h1 className="text-lg font-semibold text-foreground">บันทึกการลา</h1>
      </div>
      <LeaveRequestForm
        mode="create"
        leaveTypes={leaveTypes ?? []}
        holidayDates={(holidays ?? []).map((h) => h.holiday_date)}
        currentUserRole={appUser.role}
      />
    </main>
  );
}
