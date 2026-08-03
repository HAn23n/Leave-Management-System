import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export interface ApproverContact {
  id: string;
  email: string;
  full_name: string;
}

/**
 * Resolves who should be notified about a new leave request.
 * approver_mappings is an override for special cases; team_leads is the
 * normal path (derived from the requester's team). If a team has multiple
 * leads, all of them are notified — whoever approves first wins.
 */
export async function resolveApprovers(params: {
  userId: string;
  teamId: string;
}): Promise<ApproverContact[]> {
  const admin = createAdminSupabaseClient();

  const { data: overrides } = await admin
    .from("approver_mappings")
    .select("approver_id")
    .eq("user_id", params.userId);

  const approverIds =
    overrides && overrides.length > 0
      ? overrides.map((o) => o.approver_id)
      : (
          await admin.from("team_leads").select("user_id").eq("team_id", params.teamId)
        ).data?.map((t) => t.user_id) ?? [];

  if (approverIds.length === 0) return [];

  const { data: users } = await admin
    .from("users")
    .select("id, email, full_name")
    .in("id", approverIds)
    .eq("is_active", true);

  return users ?? [];
}
