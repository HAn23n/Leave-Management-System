"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastForm } from "@/components/toast-form";
import { TeamChecklist } from "./team-checklist";
import { updateUserRole, updateMemberTeams, updateApprovedTeams, setUserActive } from "./actions";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/lib/supabase/types";

const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", approver: "หัวหน้าทีม", user: "developer" } as const;

interface TeamOption {
  id: string;
  name: string;
}

/**
 * Each row is collapsed by default (email/nickname/role/status only) and
 * expands to the full edit controls on click — with dozens of users, always
 * rendering every checklist open made this page unusably long. A search box
 * filters by email/nickname so a specific person doesn't need scrolling to
 * find.
 */
export function UsersList({
  users,
  teams,
  teamLeads,
  userTeams,
  teamMap,
}: {
  users: AppUser[];
  teams: TeamOption[];
  teamLeads: { user_id: string; team_id: string }[];
  userTeams: { user_id: string; team_id: string }[];
  teamMap: Map<string, string>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.nickname ?? "").toLowerCase().includes(q)
    );
  }, [users, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาด้วยอีเมลหรือชื่อเล่น"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบผู้ใช้งานที่ตรงกับการค้นหา</p>
      )}

      {filtered.map((u) => (
        <UserCard
          key={u.id}
          user={u}
          teams={teams}
          approvedTeamIds={teamLeads.filter((tl) => tl.user_id === u.id).map((tl) => tl.team_id)}
          memberTeamIds={userTeams.filter((ut) => ut.user_id === u.id).map((ut) => ut.team_id)}
          homeTeamName={u.team_id ? teamMap.get(u.team_id) ?? "-" : null}
        />
      ))}
    </div>
  );
}

function UserCard({
  user: u,
  teams,
  approvedTeamIds,
  memberTeamIds,
  homeTeamName,
}: {
  user: AppUser;
  teams: TeamOption[];
  approvedTeamIds: string[];
  memberTeamIds: string[];
  homeTeamName: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{u.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            {u.nickname && `${u.nickname} · `}
            {ROLE_LABEL[u.role]}
            {homeTeamName && ` · ${homeTeamName}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={u.is_active ? "success" : "secondary"}>{u.is_active ? "ใช้งาน" : "ปิดใช้งาน"}</Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToastForm action={updateUserRole} successTitle="บันทึกสิทธิ์แล้ว" className="flex items-center gap-2">
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
            </ToastForm>

            <ToastForm action={setUserActive} successTitle={u.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว"}>
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="is_active" value={(!u.is_active).toString()} />
              <Button type="submit" size="sm" variant={u.is_active ? "destructive" : "outline"}>
                {u.is_active ? "ปิดใช้งานผู้ใช้" : "เปิดใช้งานผู้ใช้"}
              </Button>
            </ToastForm>
          </div>

          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">สมาชิกทีม</p>
              <div className="mt-1.5">
                <TeamChecklist
                  userId={u.id}
                  teams={teams}
                  initialSelected={memberTeamIds}
                  action={updateMemberTeams}
                  saveLabel="บันทึก"
                  successTitle="บันทึกทีมที่เป็นสมาชิกแล้ว"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">หัวหน้าทีม (ผู้อนุมัติ)</p>
              <div className="mt-1.5">
                <TeamChecklist
                  userId={u.id}
                  teams={teams}
                  initialSelected={approvedTeamIds}
                  action={updateApprovedTeams}
                  saveLabel="บันทึก"
                  successTitle="บันทึกทีมที่ดูแลแล้ว"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
