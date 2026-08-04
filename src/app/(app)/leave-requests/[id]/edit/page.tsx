import { notFound, redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaveRequestForm } from "../../leave-request-form";

export default async function EditLeaveRequestPage({ params }: { params: { id: string } }) {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  const { data: leaveRequest } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!leaveRequest) notFound();
  if (leaveRequest.user_id !== appUser.id) redirect(`/leave-requests/${params.id}`);
  if (leaveRequest.status !== "draft" && leaveRequest.status !== "returned") {
    redirect(`/leave-requests/${params.id}`);
  }
  // Approvers only review/approve documents — they never submit/edit their own leave requests.
  if (appUser.role === "approver") redirect(`/leave-requests/${params.id}`);

  const [{ data: leaveTypes }, { data: holidays }, { data: existingLeave }] = await Promise.all([
    supabase.from("leave_types").select("id, name, color").eq("is_active", true).order("name"),
    supabase.from("holidays").select("holiday_date, name"),
    supabase
      .from("leave_requests")
      .select("start_date, end_date, start_period, end_period")
      .eq("user_id", appUser.id)
      .neq("id", leaveRequest.id)
      .in("status", ["pending", "approved"]),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="p-4 pb-0">
        <h1 className="text-lg font-semibold text-foreground">แก้ไขคำขอลา</h1>
      </div>
      <LeaveRequestForm
        mode="edit"
        existing={leaveRequest}
        leaveTypes={leaveTypes ?? []}
        holidays={holidays ?? []}
        existingLeave={existingLeave ?? []}
        currentUserRole={appUser.role}
      />
    </main>
  );
}
