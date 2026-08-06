import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutAction, updateOwnTeams } from "./actions";
import { TeamMembershipForm } from "./team-membership-form";

export default async function ProfilePage() {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  const [{ data: teams }, { data: memberships }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.from("user_teams").select("team_id").eq("user_id", appUser.id),
  ]);

  const memberTeamIds = new Set((memberships ?? []).map((m) => m.team_id));

  const roleLabel = { admin: "ผู้ดูแลระบบ", approver: "หัวหน้าทีม", user: "developer" }[appUser.role];

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>โปรไฟล์</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
           {appUser.nickname && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">ชื่อเล่น</span>
              <span className="font-medium">{appUser.nickname}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">อีเมล</span>
            <span className="font-medium">{appUser.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">สิทธิ์การใช้งาน</span>
            <span className="font-medium">{roleLabel}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ทีม</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamMembershipForm
            teams={teams ?? []}
            initialSelected={Array.from(memberTeamIds)}
            action={updateOwnTeams}
          />
        </CardContent>
      </Card>

      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="w-full">
          ออกจากระบบ
        </Button>
      </form>
    </main>
  );
}
