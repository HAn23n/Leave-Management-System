import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastForm } from "@/components/toast-form";
import { DeleteButton } from "@/components/delete-button";
import { UsersList } from "./users-list";
import { preProvisionUser, removePendingUser } from "./actions";

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
        <ToastForm action={preProvisionUser} successTitle="เพิ่มสิทธิ์แล้ว" resetOnSuccess className="mt-3 flex flex-col gap-2">
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
        </ToastForm>

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
                  <DeleteButton
                    action={removePendingUser}
                    fields={{ email: p.email }}
                    confirmTitle="ยกเลิกสิทธิ์ที่เพิ่มไว้ล่วงหน้า?"
                    confirmDescription={`${p.email} จะเข้าสู่ระบบด้วย Google ไม่ได้จนกว่าจะเพิ่มสิทธิ์ใหม่`}
                    successTitle="ยกเลิกแล้ว"
                    label="ยกเลิก"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <UsersList
        users={users ?? []}
        teams={teams ?? []}
        teamLeads={teamLeads ?? []}
        userTeams={userTeams ?? []}
        teamMap={teamMap}
      />
    </main>
  );
}
