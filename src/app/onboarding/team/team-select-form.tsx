"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

export function TeamSelectForm({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(teams[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selected) return;
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

    const { error: updateError } = await supabase
      .from("users")
      .update({ team_id: selected })
      .eq("id", user.id);

    if (updateError) {
      setError("บันทึกทีมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      {teams.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">ยังไม่มีทีมในระบบ กรุณาติดต่อผู้ดูแลระบบ</p>
      )}

      {teams.map((team) => (
        <button
          key={team.id}
          type="button"
          onClick={() => setSelected(team.id)}
          className={cn(
            "flex h-12 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors",
            selected === team.id
              ? "border-primary bg-accent text-accent-foreground"
              : "border-input bg-background text-foreground hover:bg-accent/50"
          )}
        >
          {team.name}
        </button>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleConfirm} disabled={!selected || loading} size="lg" className="mt-2">
        {loading ? "กำลังบันทึก..." : "ยืนยัน"}
      </Button>
    </div>
  );
}
