import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TeamChecklist } from "./team-checklist";
import {
  updateUserRole,
  updateMemberTeams,
  updateApprovedTeams,
  setUserActive,
  preProvisionUser,
  removePendingUser,
} from "./actions";

const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", approver: "หัวหน้าทีม", user: "developer" } as const;

export default async function UsersSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [
    { data: users },
    { data: teams },
    { data: teamLeads },
    { data: userTeams },
    { data: pendingUsers },
    { data: pendingUserTeams },
  ] = await Promise.all([
    supabase.from("users").select("*").order("email"),
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.from("team_leads").select("user_id, team_id"),
    supabase.from("user_teams").select("user_id, team_id"),
    supabase.from("pending_user_roles").select("*").order("created_at"),
    supabase.from("pending_user_teams").select("*"),
  ]);

  const teamMap = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">ผู้ใช้งานและสิทธิ์</h1>

      <div className="rounded-lg border border-border bg-white p-4">
        <p className="text-sm font-medium text-foreground">เพิ่มสิทธิ์เข้าใช้งานล่วงหน้า</p>
        <p className="mt-1 text-xs text-muted-foreground">
          ต้องเพิ่มอีเมลไว้ที่นี่ก่อน คนนั้นถึงจะเข้าสู่ระบบด้วย Google ได้ (หรือกำหนดเป็นหัวหน้าทีมได้ที่หน้า
          &quot;ทีม&quot; แทน)
        </p>
        <form action={preProvisionUser} className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input name="email" type="email" placeholder="อีเมล Gmail" required className="h-9 w-56" />
            <Select name="role" defaultValue="user">
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">developer</SelectItem>
                <SelectItem value="admin">ผู้ดูแลระบบ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-3">
            {(teams ?? []).map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="checkbox" name="team_ids" value={t.id} className="h-4 w-4 rounded border-input accent-primary" />
                {t.name}
              </label>
            ))}
          </div>
          <Button type="submit" size="sm" className="self-start">
            เพิ่มสิทธิ์
          </Button>
        </form>

        {(pendingUsers ?? []).length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
            {(pendingUsers ?? []).map((p) => {
              const teamNames = (pendingUserTeams ?? [])
                .filter((pt) => pt.email === p.email)
                .map((pt) => teamMap.get(pt.team_id) ?? "-");
              return (
                <div key={p.email} className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {p.email} · {ROLE_LABEL[p.role]}
                    {teamNames.length > 0 && ` · ${teamNames.join(", ")}`} <Badge variant="outline">รอเข้าระบบครั้งแรก</Badge>
                  </span>
                  <form action={removePendingUser}>
                    <input type="hidden" name="email" value={p.email} />
                    <Button type="submit" size="sm" variant="ghost">
                      ยกเลิก
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {(users ?? []).map((u) => {
          const approvedTeamIds = (teamLeads ?? []).filter((tl) => tl.user_id === u.id).map((tl) => tl.team_id);
          const memberTeamIds = (userTeams ?? []).filter((ut) => ut.user_id === u.id).map((ut) => ut.team_id);

          return (
            <div key={u.id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{u.email}</p>
                  {u.nickname && <p className="text-xs text-muted-foreground">ชื่อเล่น: {u.nickname}</p>}
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
                <p className="text-xs font-medium text-muted-foreground">ทีมที่เป็นสมาชิก (เลือกได้หลายทีม)</p>
                <div className="mt-2">
                  <TeamChecklist
                    userId={u.id}
                    teams={teams ?? []}
                    initialSelected={memberTeamIds}
                    action={updateMemberTeams}
                    saveLabel="บันทึกทีมที่เป็นสมาชิก"
                    successTitle="บันทึกทีมที่เป็นสมาชิกแล้ว"
                  />
                </div>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">ทีมที่ดูแลอนุมัติ (เลือกได้หลายทีม)</p>
                <div className="mt-2">
                  <TeamChecklist
                    userId={u.id}
                    teams={teams ?? []}
                    initialSelected={approvedTeamIds}
                    action={updateApprovedTeams}
                    saveLabel="บันทึกทีมที่ดูแล"
                    successTitle="บันทึกทีมที่ดูแลแล้ว"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
