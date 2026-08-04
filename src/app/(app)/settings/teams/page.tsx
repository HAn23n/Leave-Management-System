import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createTeam, setTeamActive, addTeamLead, removeTeamLead } from "./actions";

export default async function TeamsSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [{ data: teams }, { data: teamLeads }, { data: users }] = await Promise.all([
    supabase.from("teams").select("*").order("created_at"),
    supabase.from("team_leads").select("*"),
    supabase.from("users").select("id, full_name, team_id").eq("is_active", true).order("full_name"),
  ]);

  const userMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-lg font-semibold text-foreground">จัดการทีมและสายอนุมัติ</h1>
        <p className="text-sm text-muted-foreground">
          เพิ่มคนเป็นหัวหน้าทีมที่นี่เพื่อกำหนดว่าใครอนุมัติคำขอลาของทีมไหน — ระบบจะปรับสิทธิ์เป็น
          &quot;หัวหน้าทีม&quot; ให้อัตโนมัติ ผู้อนุมัติแต่ละคนเป็นหัวหน้าได้ทีมเดียวเท่านั้น
        </p>
      </div>

      <form action={createTeam} className="flex gap-2">
        <Input name="name" placeholder="ชื่อทีมใหม่" required />
        <Button type="submit">เพิ่มทีม</Button>
      </form>

      <div className="flex flex-col gap-3">
        {(teams ?? []).map((team) => {
          const leads = (teamLeads ?? []).filter((tl) => tl.team_id === team.id);
          const availableUsers = (users ?? []).filter(
            (u) => u.team_id === team.id && !leads.some((l) => l.user_id === u.id)
          );

          return (
            <Card key={team.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{team.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={team.is_active ? "success" : "secondary"}>
                    {team.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </Badge>
                  <form action={setTeamActive}>
                    <input type="hidden" name="id" value={team.id} />
                    <input type="hidden" name="is_active" value={(!team.is_active).toString()} />
                    <Button type="submit" size="sm" variant="outline">
                      {team.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                  </form>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground">หัวหน้าทีม</p>
                {leads.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีหัวหน้าทีม</p>}
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between text-sm">
                    <span>{userMap.get(lead.user_id) ?? "-"}</span>
                    <form action={removeTeamLead}>
                      <input type="hidden" name="id" value={lead.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        เอาออก
                      </Button>
                    </form>
                  </div>
                ))}

                {availableUsers.length > 0 && (
                  <form action={addTeamLead} className="flex gap-2 pt-2">
                    <input type="hidden" name="team_id" value={team.id} />
                    <select name="user_id" required className="h-9 flex-1 rounded-xl border border-input bg-background px-2 text-sm">
                      <option value="">เลือกสมาชิกในทีมเป็นหัวหน้า</option>
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      เพิ่ม
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
