"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { TeamChecklist } from "./team-checklist";
import { updateUserRole, updateMemberTeams, updateApprovedTeams, setUserActive } from "./actions";
import { cn } from "@/lib/utils";
import type { AppUser, UserRole } from "@/lib/supabase/types";

const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", approver: "หัวหน้าทีม", user: "developer" } as const;

interface TeamOption {
  id: string;
  name: string;
}

/** One page's worth of user cards — search/pagination happen server-side (see page.tsx). */
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
  return (
    <div className="flex flex-col gap-3">
      {users.map((u) => (
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

function sameSet(a: Set<string>, b: string[]): boolean {
  return a.size === b.length && b.every((id) => a.has(id));
}

function UserCard({
  user: u,
  teams,
  approvedTeamIds: initialApprovedTeamIds,
  memberTeamIds: initialMemberTeamIds,
  homeTeamName,
}: {
  user: AppUser;
  teams: TeamOption[];
  approvedTeamIds: string[];
  memberTeamIds: string[];
  homeTeamName: string | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const [role, setRole] = useState<UserRole>(u.role);
  const [memberTeamIds, setMemberTeamIds] = useState<Set<string>>(() => new Set(initialMemberTeamIds));
  const [approvedTeamIds, setApprovedTeamIds] = useState<Set<string>>(() => new Set(initialApprovedTeamIds));

  const hasChanges =
    role !== u.role || !sameSet(memberTeamIds, initialMemberTeamIds) || !sameSet(approvedTeamIds, initialApprovedTeamIds);

  function toggleMember(teamId: string) {
    setMemberTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function toggleApproved(teamId: string) {
    setApprovedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const tasks: Promise<void>[] = [];

      if (role !== u.role) {
        const fd = new FormData();
        fd.append("id", u.id);
        fd.append("role", role);
        tasks.push(updateUserRole(fd));
      }
      if (!sameSet(memberTeamIds, initialMemberTeamIds)) {
        const fd = new FormData();
        fd.append("id", u.id);
        memberTeamIds.forEach((id) => fd.append("team_ids", id));
        tasks.push(updateMemberTeams(fd));
      }
      if (!sameSet(approvedTeamIds, initialApprovedTeamIds)) {
        const fd = new FormData();
        fd.append("id", u.id);
        approvedTeamIds.forEach((id) => fd.append("team_ids", id));
        tasks.push(updateApprovedTeams(fd));
      }

      await Promise.all(tasks);
      toast({ variant: "success", title: "บันทึกการเปลี่ยนแปลงแล้ว" });
      router.refresh();
    });
  }

  function toggleActive() {
    const fd = new FormData();
    fd.append("id", u.id);
    fd.append("is_active", (!u.is_active).toString());
    startTransition(async () => {
      await setUserActive(fd);
      toast({ variant: "success", title: u.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว" });
      router.refresh();
    });
  }

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
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)} disabled={pending}>
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

            <Button type="button" size="sm" variant={u.is_active ? "destructive" : "outline"} disabled={pending} onClick={toggleActive}>
              {u.is_active ? "ปิดใช้งานผู้ใช้" : "เปิดใช้งานผู้ใช้"}
            </Button>
          </div>

          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">สมาชิกทีม</p>
              <div className="mt-1.5">
                <TeamChecklist
                  teams={teams}
                  selected={memberTeamIds}
                  onToggle={toggleMember}
                  onSelectAll={() => setMemberTeamIds(new Set(teams.map((t) => t.id)))}
                  disabled={pending}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">หัวหน้าทีม (ผู้อนุมัติ)</p>
              <div className="mt-1.5">
                <TeamChecklist
                  teams={teams}
                  selected={approvedTeamIds}
                  onToggle={toggleApproved}
                  onSelectAll={() => setApprovedTeamIds(new Set(teams.map((t) => t.id)))}
                  disabled={pending}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex justify-end border-t border-border pt-3">
            <Button type="button" size="sm" variant={hasChanges ? "default" : "outline"} disabled={pending || !hasChanges} onClick={save}>
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
