import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserRole, updateUserTeam, setUserActive } from "./actions";

const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", approver: "หัวหน้าทีม", user: "developer" } as const;

export default async function UsersSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [{ data: users }, { data: teams }] = await Promise.all([
    supabase.from("users").select("*").order("email"),
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
  ]);

  const teamMap = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">ผู้ใช้งานและสิทธิ์</h1>

      <div className="flex flex-col gap-3">
        {(users ?? []).map((u) => (
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
                  บันทึกทีม
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
              <p className="mt-2 text-xs text-muted-foreground">ทีมปัจจุบัน: {teamMap.get(u.team_id) ?? "-"}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
