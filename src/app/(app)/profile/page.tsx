import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileTeamForm } from "./profile-team-form";
import { signOutAction } from "./actions";

export default async function ProfilePage() {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  const [{ data: teams }, { count: pendingOrApprovedCount }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", appUser.id)
      .in("status", ["pending", "approved"]),
  ]);

  const hasPendingOrApproved = (pendingOrApprovedCount ?? 0) > 0;

  const roleLabel = { admin: "ผู้ดูแลระบบ", approver: "หัวหน้าทีม", user: "พนักงาน" }[appUser.role];

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>โปรไฟล์</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">ชื่อ</span>
            <span className="font-medium">{appUser.full_name}</span>
          </div>
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
          <ProfileTeamForm
            teams={teams ?? []}
            currentTeamId={appUser.team_id}
            disabled={hasPendingOrApproved}
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
