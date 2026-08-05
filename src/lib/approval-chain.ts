import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export interface ApproverContact {
  id: string;
  email: string;
}

export interface ApprovalLevel {
  level: number;
  approver: ApproverContact;
}

export interface ApprovalChain {
  // "override": approver_mappings bypasses the team's chain entirely (single
  // step, whoever's listed approves). "chain": the normal team_leads
  // sequence, ordered by approval_order — must be signed off level by level.
  type: "override" | "chain";
  levels: ApprovalLevel[];
}

/**
 * Resolves the full approval chain for a leave request. approver_mappings is
 * an override for special cases; team_leads (ordered by approval_order) is
 * the normal path, e.g. หัวหน้าคนที่ 1 (level 1) -> หัวหน้าคนที่ 2 (level 2).
 */
export async function resolveApprovalChain(params: { userId: string; teamId: string }): Promise<ApprovalChain> {
  const admin = createAdminSupabaseClient();

  const { data: overrides } = await admin
    .from("approver_mappings")
    .select("approver_id")
    .eq("user_id", params.userId);

  if (overrides && overrides.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, email")
      .in(
        "id",
        overrides.map((o) => o.approver_id)
      )
      .eq("is_active", true);
    return { type: "override", levels: (users ?? []).map((u) => ({ level: 1, approver: u })) };
  }

  const { data: leads } = await admin
    .from("team_leads")
    .select("user_id, approval_order")
    .eq("team_id", params.teamId)
    .order("approval_order");

  if (!leads || leads.length === 0) return { type: "chain", levels: [] };

  const { data: users } = await admin
    .from("users")
    .select("id, email")
    .in(
      "id",
      leads.map((l) => l.user_id)
    )
    .eq("is_active", true);
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  // `level` is the 1-based position in the sorted list, not the raw stored
  // approval_order value — approval_order only needs to sort correctly, it
  // doesn't need to stay gap-free as leads are added/removed/reordered.
  const levels: ApprovalLevel[] = [];
  for (const lead of leads) {
    const approver = userMap.get(lead.user_id);
    if (approver) levels.push({ level: levels.length + 1, approver });
  }
  return { type: "chain", levels };
}

/**
 * Next free approval_order for a new lead in this team — appends them to the
 * end of the chain (last level). Used wherever a team_leads row gets
 * upserted with a default: inserting with the column's default (1) would
 * collide with the unique (team_id, approval_order) constraint whenever the
 * team already has a level-1 lead.
 */
export async function nextApprovalOrder(supabase: SupabaseClient<Database>, teamId: string): Promise<number> {
  const { data } = await supabase
    .from("team_leads")
    .select("approval_order")
    .eq("team_id", teamId)
    .order("approval_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.approval_order ?? 0) + 1;
}

/** Who to notify about a brand-new submission — level 1 of the chain (or every override approver). */
export async function resolveApprovers(params: { userId: string; teamId: string }): Promise<ApproverContact[]> {
  const chain = await resolveApprovalChain(params);
  if (chain.type === "override") return chain.levels.map((l) => l.approver);
  const firstLevel = chain.levels[0]?.level;
  if (firstLevel == null) return [];
  return chain.levels.filter((l) => l.level === firstLevel).map((l) => l.approver);
}
