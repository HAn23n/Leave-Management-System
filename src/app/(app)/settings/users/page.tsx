import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
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

const PAGE_SIZE = 5;

interface SearchParams {
  q?: string;
  page?: string;
}

export default async function UsersSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Search + pagination happen server-side (range()) so a page load only
  // ever fetches PAGE_SIZE users and their team memberships, not the whole
  // org — the earlier version loaded every user's full team_leads/user_teams
  // rows up front regardless of how many were ever shown.
  let usersQuery = supabase.from("users").select("*", { count: "exact" }).order("email").range(from, to);
  if (q) {
    const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
    usersQuery = usersQuery.or(`email.ilike.%${escaped}%,nickname.ilike.%${escaped}%`);
  }

  const [{ data: users, count }, { data: teams }, { data: pendingUsers }, { data: pendingUserTeams }, { data: pendingTeamLeads }] =
    await Promise.all([
      usersQuery,
      supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
      supabase.from("pending_user_roles").select("*").order("created_at"),
      supabase.from("pending_user_teams").select("*"),
      supabase.from("pending_team_leads").select("*"),
    ]);

  const pageUserIds = (users ?? []).map((u) => u.id);
  const [{ data: teamLeads }, { data: userTeams }] = await Promise.all([
    pageUserIds.length > 0
      ? supabase.from("team_leads").select("user_id, team_id").in("user_id", pageUserIds)
      : Promise.resolve({ data: [] as { user_id: string; team_id: string }[] }),
    pageUserIds.length > 0
      ? supabase.from("user_teams").select("user_id, team_id").in("user_id", pageUserIds)
      : Promise.resolve({ data: [] as { user_id: string; team_id: string }[] }),
  ]);

  const teamMap = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/settings/users?${qs}` : "/settings/users";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">ผู้ใช้งานและสิทธิ์</h1>

      <div className="rounded-lg border border-border bg-white p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserPlus className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium text-foreground">เพิ่มสิทธิ์เข้าใช้งานล่วงหน้า</p>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          ต้องเพิ่มอีเมลไว้ที่นี่ก่อน คนนั้นถึงจะเข้าสู่ระบบด้วย Google ได้ — เลือก &quot;หัวหน้าทีม&quot;
          พร้อมเลือกทีมที่จะดูแล เพื่อกำหนดเป็นผู้อนุมัติล่วงหน้าได้เลย (หรือทำที่หน้า &quot;ทีม&quot; แทนก็ได้)
        </p>
        <ToastForm action={preProvisionUser} successTitle="เพิ่มสิทธิ์แล้ว" resetOnSuccess className="mt-4 flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">อีเมล</label>
              <Input name="email" type="email" placeholder="name@gmail.com" required className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">สิทธิ์</label>
              <Select name="role" defaultValue="user">
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">developer</SelectItem>
                  <SelectItem value="approver">หัวหน้าทีม</SelectItem>
                  <SelectItem value="admin">ผู้ดูแลระบบ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ทีม (จำเป็นถ้าเลือก &quot;หัวหน้าทีม&quot;)</label>
            <div className="flex flex-wrap gap-1.5">
              {(teams ?? []).map((t) => (
                <label key={t.id} className="cursor-pointer">
                  <input type="checkbox" name="team_ids" value={t.id} className="peer sr-only" />
                  <span className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 peer-checked:border-primary/60 peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    {t.name}
                  </span>
                </label>
              ))}
              {(teams ?? []).length === 0 && <span className="text-sm text-muted-foreground">ยังไม่มีทีมในระบบ</span>}
            </div>
          </div>

          <Button type="submit" size="sm" className="mt-1 self-start">
            เพิ่มสิทธิ์
          </Button>
        </ToastForm>

        {(pendingUsers ?? []).length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
            {(pendingUsers ?? []).map((p) => {
              const teamNames = [
                ...(pendingUserTeams ?? []).filter((pt) => pt.email === p.email).map((pt) => teamMap.get(pt.team_id) ?? "-"),
                ...(pendingTeamLeads ?? [])
                  .filter((pt) => pt.email === p.email)
                  .map((pt) => `${teamMap.get(pt.team_id) ?? "-"} (หัวหน้า)`),
              ];
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

      <form method="get" className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="ค้นหาด้วยอีเมลหรือชื่อเล่น" className="pl-9" />
      </form>

      {(users ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบผู้ใช้งานที่ตรงกับการค้นหา</p>
      ) : (
        <UsersList
          users={users ?? []}
          teams={teams ?? []}
          teamLeads={teamLeads ?? []}
          userTeams={userTeams ?? []}
          teamMap={teamMap}
        />
      )}

      {/* Always shown once there's at least one result — even at page 1/1,
          this tells the admin "that's everything" (ทั้งหมด N คน) instead of
          silently capping the list at PAGE_SIZE with no indication that
          there could be more. */}
      {(count ?? 0) > 0 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="font-medium text-primary hover:underline">
              ก่อนหน้า
            </Link>
          ) : (
            <span className="text-muted-foreground">ก่อนหน้า</span>
          )}
          <span className="text-muted-foreground">
            หน้า {page} / {totalPages} · ทั้งหมด {count} คน
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="font-medium text-primary hover:underline">
              ถัดไป
            </Link>
          ) : (
            <span className="text-muted-foreground">ถัดไป</span>
          )}
        </div>
      )}
    </main>
  );
}
