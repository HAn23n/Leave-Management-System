"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

const MAX_VISIBLE_TEAMS = 8;

export function TeamSelectForm({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  // A person can belong to more than one team from day one (user_teams
  // supports it, and the profile page already lets them adjust this later)
  // — no reason to force a single choice here just to make them redo it
  // right after onboarding.
  const [selected, setSelected] = useState<Set<string>>(new Set(teams[0] ? [teams[0].id] : []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Keep any already-selected team visible even past the collapse cutoff —
  // otherwise toggling a team beyond index 8 and then collapsing back would
  // hide it while it's still selected.
  const visibleTeams = showAll ? teams : teams.filter((t, i) => i < MAX_VISIBLE_TEAMS || selected.has(t.id));
  const hiddenCount = teams.length - visibleTeams.length;

  function toggle(teamId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 ทีม");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // Membership lives in user_teams (a person can belong to more than one
    // team) — users.team_id follows automatically (see sync_user_home_team,
    // migration 0023), it's never written directly.
    const { error: insertError } = await supabase
      .from("user_teams")
      .insert(Array.from(selected).map((teamId) => ({ user_id: user.id, team_id: teamId })));

    if (insertError) {
      setError("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {teams.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">ยังไม่มีทีมในระบบ กรุณาติดต่อผู้ดูแลระบบ</p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {visibleTeams.map((team) => {
          const isSelected = selected.has(team.id);
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => toggle(team.id)}
              aria-pressed={isSelected}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all duration-150",
                isSelected
                  ? "border-primary/60 bg-accent shadow-sm shadow-primary/10"
                  : "border-input bg-background hover:border-primary/30 hover:bg-accent/40"
              )}
            >
              <span
                className={cn(
                  "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                  isSelected ? "gradient-primary border-transparent text-primary-foreground" : "border-input bg-background"
                )}
              >
                {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <Users className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium leading-tight text-foreground">{team.name}</span>
            </button>
          );
        })}
      </div>

      {teams.length > MAX_VISIBLE_TEAMS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-center text-xs font-medium text-primary hover:underline"
        >
          {showAll ? "แสดงน้อยลง" : `เพิ่มเติม... (+${hiddenCount})`}
        </button>
      )}

      <p className="text-center text-xs text-muted-foreground">เลือกได้มากกว่า 1 ทีม แล้วปรับเพิ่ม/ลดภายหลังได้ที่หน้าโปรไฟล์</p>

      {error && <p className="text-center text-sm text-destructive">{error}</p>}

      <Button onClick={handleConfirm} disabled={selected.size === 0 || loading} size="lg" className="mt-1">
        {loading ? "กำลังบันทึก..." : `ยืนยัน${selected.size > 0 ? ` (${selected.size} ทีม)` : ""}`}
      </Button>
    </div>
  );
}
