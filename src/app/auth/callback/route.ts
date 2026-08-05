import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { nextApprovalOrder } from "@/lib/approval-chain";

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
    const { data: pending } = await admin
      .from("pending_user_roles")
      .select("*")
      .eq("email", authUser.email ?? "")
      .maybeSingle();

    if (pending) {
      // An admin pre-provisioned this email's role/team ahead of time. Insert
      // via the service-role client — users_insert_self's RLS WITH CHECK
      // would otherwise cap a client-driven self-insert at role='user' (the
      // anti-privilege-escalation rule), which can't fulfil a pre-set
      // approver/admin role.
      const { error: insertError } = await admin.from("users").insert({
        id: authUser.id,
        email: authUser.email ?? "",
        role: pending.role,
        team_id: pending.team_id,
        is_active: true,
      });

      if (insertError) {
        console.error("[auth/callback] pre-provisioned users insert failed:", insertError);
        return NextResponse.redirect(`${origin}/login?error=profile_create_failed`);
      }

      if (pending.role === "approver" && pending.team_id) {
        const approvalOrder = pending.approval_order ?? (await nextApprovalOrder(admin, pending.team_id));
        await admin
          .from("team_leads")
          .upsert(
            { team_id: pending.team_id, user_id: authUser.id, approval_order: approvalOrder },
            { onConflict: "team_id,user_id", ignoreDuplicates: true }
          );
      }

      await admin.from("pending_user_roles").delete().eq("email", pending.email);

      return NextResponse.redirect(pending.team_id ? `${origin}/` : `${origin}/onboarding/team`);
    }

    // role/is_active set explicitly (not left to column defaults) so this
    // insert satisfies users_insert_self's WITH CHECK regardless of what the
    // live schema's defaults happen to be.
    const { error: insertError } = await supabase.from("users").insert({
      id: authUser.id,
      email: authUser.email ?? "",
      role: "user",
      is_active: true,
    });

    if (insertError) {
      console.error("[auth/callback] users insert failed:", insertError);
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
