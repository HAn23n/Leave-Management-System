"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TeamOption {
  id: string;
  name: string;
}

export function ProfileTeamForm({
  teams,
  currentTeamId,
  disabled,
}: {
  teams: TeamOption[];
  currentTeamId: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentTeamId ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleSave() {
    if (!selected || selected === currentTeamId) return;
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("users").update({ team_id: selected }).eq("id", user.id);

    if (error) {
      // Message from the DB trigger when a pending/approved request is blocking the change
      setMessage({
        type: "error",
        text: error.message.includes("รออนุมัติ")
          ? error.message
          : "เปลี่ยนทีมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      });
      setLoading(false);
      return;
    }

    setMessage({ type: "success", text: "เปลี่ยนทีมเรียบร้อย" });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {disabled && (
        <p className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
          ไม่สามารถเปลี่ยนทีมได้ เนื่องจากมีคำขอลาที่รออนุมัติหรืออนุมัติแล้วค้างอยู่
        </p>
      )}

      <Select value={selected} onValueChange={setSelected} disabled={disabled || loading}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {message && (
        <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-green-700"}>
          {message.text}
        </p>
      )}

      <Button
        onClick={handleSave}
        disabled={disabled || loading || !selected || selected === currentTeamId}
      >
        {loading ? "กำลังบันทึก..." : "บันทึกทีม"}
      </Button>
    </div>
  );
}
