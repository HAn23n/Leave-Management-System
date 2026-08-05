import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decideOnPendingRequest } from "@/lib/leave-requests";
import { rateLimitResponse } from "@/lib/rate-limit";

// Approver/admin acting on someone else's pending request. RLS restricts this
// to requests within the approver's own team (or any team for admin).
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (appUser.role !== "approver" && appUser.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  const supabase = createServerSupabaseClient();
  const result = await decideOnPendingRequest({
    supabase,
    id: params.id,
    actor: appUser,
    decision: "approved",
    note: null,
  });

  if (!result.ok) {
    const status =
      result.reason === "not_found"
        ? 404
        : result.reason === "forbidden"
          ? 403
          : result.reason === "db_error"
            ? 400
            : 409;
    return NextResponse.json({ error: result.reason, message: result.message }, { status });
  }

  return NextResponse.json({ request: result.request });
}
