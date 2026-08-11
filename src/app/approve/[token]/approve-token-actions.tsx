"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Decision = "approved" | "rejected";

export function ApproveTokenActions({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");

  async function submit(decision: Decision) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/approval-tokens/${token}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.message ??
          (data.error === "invalid_token"
            ? "ลิงก์นี้ใช้งานไม่ได้แล้ว"
            : data.error === "conflict"
              ? "สถานะของเอกสารถูกเปลี่ยนไปแล้ว"
              : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
      );
      return;
    }
    setDone(decision);
  }

  if (done) {
    return (
      <p className="rounded-xl border border-border bg-accent/20 p-3 text-center text-sm font-medium text-foreground">
        {done === "approved" ? "อนุมัติคำขอลานี้แล้ว" : "ไม่อนุมัติคำขอลานี้แล้ว"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!showReject ? (
        <>
          <Button disabled={busy} onClick={() => submit("approved")}>
            อนุมัติ
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/40"
            onClick={() => setShowReject(true)}
          >
            ไม่อนุมัติ
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เหตุผลที่ไม่อนุมัติ"
            rows={3}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <Button disabled={busy || !note.trim()} onClick={() => submit("rejected")}>
            ยืนยันไม่อนุมัติ
          </Button>
        </div>
      )}
    </div>
  );
}
