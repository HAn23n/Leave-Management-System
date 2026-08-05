"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { assignTeamLeadByEmail } from "./actions";

export function AssignTeamLeadForm({ teamId }: { teamId: string }) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    const formData = new FormData();
    formData.set("team_id", teamId);
    formData.set("email", trimmed);

    startTransition(async () => {
      await assignTeamLeadByEmail(formData);
      toast({ variant: "success", title: "เพิ่มหัวหน้าทีมแล้ว", description: trimmed });
      setEmail("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 pt-2">
      <Input
        type="email"
        placeholder="อีเมล Gmail ของหัวหน้าทีม"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
        required
        className="h-9 flex-1"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "กำลังเพิ่ม..." : "เพิ่ม"}
      </Button>
    </form>
  );
}
