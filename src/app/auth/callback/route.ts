import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { addTeamLead } from "@/lib/approval-chain";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const authUser = data.user;

  // First login -> create the users row (RLS forces role='user'/is_active=true, blocking privilege escalation)
  const { data: existing } = await supabase
    .from("users")
    .select("id, team_id, is_active")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!existing) {
    const admin = createAdminSupabaseClient();
    // Lowercased to match how pending_user_roles/pending_team_leads store
    // (and are looked up by) email everywhere else in the app.
    const email = (authUser.email ?? "").toLowerCase();
    const [{ data: pendingRole }, { data: pendingUserTeams }, { data: pendingTeamLeads }] = await Promise.all([
      admin.from("pending_user_roles").select("*").eq("email", email).maybeSingle(),
      admin.from("pending_user_teams").select("*").eq("email", email).order("created_at"),
      admin.from("pending_team_leads").select("*").eq("email", email).order("created_at"),
    ]);

    if (pendingRole || (pendingUserTeams && pendingUserTeams.length > 0) || (pendingTeamLeads && pendingTeamLeads.length > 0)) {
      // An admin pre-provisioned this email's role/team(s) ahead of time.
      // Leading at least one team makes them an approver regardless of any
      // pre-set role, unless that role was explicitly 'admin'. Home team
      // prefers the first pre-assigned membership, else the first team
      // they'll lead, so they're not stuck needing team selection.
      const leadsTeams = pendingTeamLeads && pendingTeamLeads.length > 0;
      const role = pendingRole?.role === "admin" ? "admin" : leadsTeams ? "approver" : (pendingRole?.role ?? "user");
      const teamId = pendingUserTeams?.[0]?.team_id ?? (leadsTeams ? pendingTeamLeads![0].team_id : null);

      // Insert via the service-role client — users_insert_self's RLS WITH
      // CHECK would otherwise cap a client-driven self-insert at role='user'
      // (the anti-privilege-escalation rule), which can't fulfil a pre-set
      // approver/admin role.
      const { error: insertError } = await admin.from("users").insert({
        id: authUser.id,
        email,
        role,
        team_id: teamId,
        is_active: true,
      });

      if (insertError) {
        console.error("[auth/callback] pre-provisioned users insert failed:", insertError);
        return NextResponse.redirect(`${origin}/login?error=profile_create_failed`);
      }

      // team_id above is written directly (service-role, first-ever row) —
      // sync_user_home_team only reacts to user_teams changes, so every
      // pre-assigned membership needs creating explicitly to match. A
      // pre-provisioned lead is also always a member of the team(s) they
      // lead, even if they were never separately pre-provisioned as a member
      // — otherwise they end up with a team_leads row but no user_teams row,
      // making them invisible to co-leads/requesters under it (users_select
      // and leave_requests_select both key off user_teams).
      const teamIdsToJoin = Array.from(
        new Set([...(pendingUserTeams ?? []).map((pt) => pt.team_id), ...(pendingTeamLeads ?? []).map((lead) => lead.team_id)])
      );
      if (teamIdsToJoin.length > 0) {
        await admin.from("user_teams").insert(teamIdsToJoin.map((teamId) => ({ user_id: authUser.id, team_id: teamId })));
      }

      for (const lead of pendingTeamLeads ?? []) {
        await addTeamLead(admin, lead.team_id, authUser.id, lead.approval_order ?? undefined);
      }

      await Promise.all([
        admin.from("pending_user_roles").delete().eq("email", email),
        admin.from("pending_user_teams").delete().eq("email", email),
        admin.from("pending_team_leads").delete().eq("email", email),
      ]);

      return NextResponse.redirect(teamId ? `${origin}/` : `${origin}/onboarding/team`);
    }

    // No admin ever pre-provisioned this email — anyone with a Google
    // account can still sign in and self-register here, always capped at
    // role='user' with no team yet; pre-provisioning (Settings →
    // ผู้ใช้งาน/ทีม) is only for granting an approver/admin role or a team
    // ahead of time, not a gate on access itself.
    const { error: insertError } = await admin.from("users").insert({
      id: authUser.id,
      email,
      role: "user",
      team_id: null,
      is_active: true,
    });

    if (insertError) {
      console.error("[auth/callback] self-registration insert failed:", insertError);
      return NextResponse.redirect(`${origin}/login?error=profile_create_failed`);
    }

    return NextResponse.redirect(`${origin}/onboarding/team`);
  }

  if (!existing.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=inactive`);
  }

  if (!existing.team_id) {
    return NextResponse.redirect(`${origin}/onboarding/team`);
  }

  return NextResponse.redirect(`${origin}/`);
}
