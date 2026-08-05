import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decideOnPendingRequest } from "@/lib/leave-requests";
import { rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (appUser.role !== "approver" && appUser.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "note_required" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const result = await decideOnPendingRequest({
    supabase,
    id: params.id,
    actor: appUser,
    decision: "rejected",
    note,
  });

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "db_error" ? 400 : 409;
    return NextResponse.json({ error: result.reason, message: result.message }, { status });
  }

  return NextResponse.json({ request: result.request });
}
