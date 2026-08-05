import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserRole, updateUserTeam, updateApprovedTeams, selectAllApprovedTeams, setUserActive } from "./actions";

const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", approver: "หัวหน้าทีม", user: "developer" } as const;

export default async function UsersSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [{ data: users }, { data: teams }, { data: teamLeads }] = await Promise.all([
    supabase.from("users").select("*").order("email"),
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.from("team_leads").select("user_id, team_id"),
  ]);

  const teamMap = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">ผู้ใช้งานและสิทธิ์</h1>

      <div className="flex flex-col gap-3">
        {(users ?? []).map((u) => {
          const approvedTeamIds = new Set(
            (teamLeads ?? []).filter((tl) => tl.user_id === u.id).map((tl) => tl.team_id)
          );

          return (
            <div key={u.id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{u.email}</p>
                </div>
                <Badge variant={u.is_active ? "success" : "secondary"}>
                  {u.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={updateUserRole} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Select name="role" defaultValue={u.role}>
                    <SelectTrigger className="h-9 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm" variant="outline">
                    บันทึกสิทธิ์
                  </Button>
                </form>

                <form action={updateUserTeam} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Select name="team_id" defaultValue={u.team_id ?? "none"}>
                    <SelectTrigger className="h-9 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ไม่มีทีม</SelectItem>
                      {(teams ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm" variant="outline">
                    บันทึกทีมหลัก
                  </Button>
                </form>

                <form action={setUserActive}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="is_active" value={(!u.is_active).toString()} />
                  <Button type="submit" size="sm" variant={u.is_active ? "destructive" : "outline"}>
                    {u.is_active ? "ปิดใช้งานผู้ใช้" : "เปิดใช้งานผู้ใช้"}
                  </Button>
                </form>
              </div>

              {u.team_id && (
                <p className="mt-2 text-xs text-muted-foreground">ทีมหลัก: {teamMap.get(u.team_id) ?? "-"}</p>
              )}

              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  ทีมที่ดูแลอนุมัติ (เลือกได้หลายทีม — เลือกอย่างน้อย 1 ทีมจะปรับสิทธิ์เป็นหัวหน้าทีมอัตโนมัติ)
                </p>
                <form action={updateApprovedTeams} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <div className="flex flex-wrap gap-3">
                    {(teams ?? []).map((t) => (
                      <label key={t.id} className="flex items-center gap-1.5 text-sm text-foreground">
                        <input
                          type="checkbox"
                          name="team_ids"
                          value={t.id}
                          defaultChecked={approvedTeamIds.has(t.id)}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        {t.name}
                      </label>
                    ))}
                    {(teams ?? []).length === 0 && (
                      <span className="text-sm text-muted-foreground">ยังไม่มีทีมในระบบ</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant="outline">
                      บันทึกทีมที่ดูแล
                    </Button>
                    <Button type="submit" formAction={selectAllApprovedTeams} size="sm" variant="ghost">
                      เลือกทั้งหมด
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
