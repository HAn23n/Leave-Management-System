"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NicknameForm() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("กรุณากรอกชื่อเล่น");
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

    const { error: updateError } = await supabase.from("users").update({ nickname: trimmed }).eq("id", user.id);

    if (updateError) {
      setError("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <Input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="ชื่อเล่น"
        maxLength={50}
        onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleConfirm} disabled={!nickname.trim() || loading} size="lg" className="mt-2">
        {loading ? "กำลังบันทึก..." : "ยืนยัน"}
      </Button>
    </div>
  );
}
