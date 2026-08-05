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
 *
 * `level` IS the stored approval_order value (not a recomputed array
 * position) — leave_requests.current_level is a snapshot compared against
 * this on every action, and a position-based level would silently retarget
 * an in-flight request to a different person whenever a lead is
 * added/removed/reordered while it's pending. approval_order values don't
 * need to stay gap-free for this to work (see nextLevel logic in
 * lib/leave-requests.ts, which jumps to the next *present* value, not +1).
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

  const levels: ApprovalLevel[] = [];
  for (const lead of leads) {
    const approver = userMap.get(lead.user_id);
    if (approver) levels.push({ level: lead.approval_order, approver });
  }
  return { type: "chain", levels };
}

/** Who to notify about a brand-new submission — the chain's first (lowest) level, or every override approver. */
export async function resolveApprovers(params: { userId: string; teamId: string }): Promise<ApproverContact[]> {
  const chain = await resolveApprovalChain(params);
  if (chain.type === "override") return chain.levels.map((l) => l.approver);
  const firstLevel = chain.levels[0]?.level;
  if (firstLevel == null) return [];
  return chain.levels.filter((l) => l.level === firstLevel).map((l) => l.approver);
}

/** The level a freshly submitted (or resubmitted) request should start at — the chain's lowest level, or 1 if there's no chain yet. */
export async function firstApprovalLevel(params: { userId: string; teamId: string }): Promise<number> {
  const chain = await resolveApprovalChain(params);
  return chain.type === "chain" ? (chain.levels[0]?.level ?? 1) : 1;
}

const UNIQUE_VIOLATION = "23505";

/**
 * Adds a team_leads row, appending to the end of the chain when no explicit
 * approval_order is given. The "read current max, then insert max+1" step
 * isn't atomic, so two concurrent callers assigning a lead to the same team
 * can compute the same order and collide on the (team_id, approval_order)
 * unique constraint — retries with a freshly recomputed order instead of
 * leaving that error unhandled (which previously left the second caller's
 * assignment silently dropped).
 */
export async function addTeamLead(
  supabase: SupabaseClient<Database>,
  teamId: string,
  userId: string,
  approvalOrder?: number
): Promise<void> {
  if (approvalOrder != null) {
    const { error } = await supabase
      .from("team_leads")
      .upsert({ team_id: teamId, user_id: userId, approval_order: approvalOrder }, { onConflict: "team_id,user_id", ignoreDuplicates: true });
    if (error) throw error;
    return;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from("team_leads")
      .select("approval_order")
      .eq("team_id", teamId)
      .order("approval_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (data?.approval_order ?? 0) + 1;

    const { error } = await supabase
      .from("team_leads")
      .upsert({ team_id: teamId, user_id: userId, approval_order: nextOrder }, { onConflict: "team_id,user_id", ignoreDuplicates: true });

    if (!error) return;
    if (error.code !== UNIQUE_VIOLATION) throw error;
    // Someone else claimed that order first — recompute and retry.
  }
  throw new Error("ไม่สามารถกำหนดลำดับผู้อนุมัติได้ กรุณาลองใหม่อีกครั้ง");
}
