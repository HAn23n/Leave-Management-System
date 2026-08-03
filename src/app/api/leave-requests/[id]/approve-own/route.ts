import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { transitionLeaveRequest } from "@/lib/leave-requests";

// "Save and approve" shortcut: an approver filing their own leave skips
// pending and goes straight to approved. Distinct from the approve action in
// the approvals stage, which acts on someone else's pending request.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (appUser.role !== "approver" && appUser.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("leave_requests")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing || existing.user_id !== appUser.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await transitionLeaveRequest({
    supabase,
    id: params.id,
    fromStatuses: ["draft", "returned"],
    toStatus: "approved",
    approverId: appUser.id,
    approverNote: null,
  });

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ request: result.request });
}
