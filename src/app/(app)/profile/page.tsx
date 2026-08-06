import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutAction, updateOwnTeams } from "./actions";

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
          <form action={updateOwnTeams} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              {(teams ?? []).map((t) => (
                <label key={t.id} className="flex items-center gap-1.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="team_ids"
                    value={t.id}
                    defaultChecked={memberTeamIds.has(t.id)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  {t.name}
                </label>
              ))}
              {(teams ?? []).length === 0 && (
                <span className="text-sm text-muted-foreground">ยังไม่มีทีมในระบบ</span>
              )}
            </div>
            <Button type="submit" size="sm" variant="outline" className="self-start">
              บันทึกทีม
            </Button>
          </form>
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
