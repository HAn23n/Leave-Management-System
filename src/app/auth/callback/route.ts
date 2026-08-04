import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    const fullName =
      (authUser.user_metadata?.full_name as string | undefined) ??
      (authUser.user_metadata?.name as string | undefined) ??
      authUser.email ??
      "";

    // role/is_active set explicitly (not left to column defaults) so this
    // insert satisfies users_insert_self's WITH CHECK regardless of what the
    // live schema's defaults happen to be.
    const { error: insertError } = await supabase.from("users").insert({
      id: authUser.id,
      email: authUser.email ?? "",
      full_name: fullName,
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
