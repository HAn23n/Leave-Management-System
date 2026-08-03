"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { LeaveStatus } from "@/lib/supabase/types";

type NoteAction = "reject" | "return" | null;

export function LeaveRequestActions({
  requestId,
  status,
  isOwner,
  isApproverInScope,
}: {
  requestId: string;
  status: LeaveStatus;
  isOwner: boolean;
  isApproverInScope: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteAction, setNoteAction] = useState<NoteAction>(null);
  const [note, setNote] = useState("");

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leave-requests/${requestId}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "conflict"
          ? "สถานะของเอกสารถูกเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่"
          : data.error === "note_required"
            ? "กรุณาระบุเหตุผล"
            : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      );
      return;
    }
    setNoteAction(null);
    setNote("");
    router.refresh();
  }

  const canOwnerSubmit = isOwner && (status === "draft" || status === "returned");
  const canOwnerCancel = isOwner && (status === "draft" || status === "pending");
  const canApproverAct = isApproverInScope && !isOwner && status === "pending";
  const canApproverCancelApproved = isApproverInScope && status === "approved";

  if (!canOwnerSubmit && !canOwnerCancel && !canApproverAct && !canApproverCancelApproved) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canOwnerSubmit && (
        <Button disabled={busy} onClick={() => post("submit")}>
          ส่งอนุมัติ
        </Button>
      )}

      {canApproverAct && (
        <>
          <Button disabled={busy} onClick={() => post("approve")}>
            อนุมัติ
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => setNoteAction(noteAction === "return" ? null : "return")}
          >
            ส่งคืน
          </Button>
          <Button
            disabled={busy}
            variant="destructive"
            onClick={() => setNoteAction(noteAction === "reject" ? null : "reject")}
          >
            ไม่อนุมัติ
          </Button>
        </>
      )}

      {noteAction && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={noteAction === "reject" ? "เหตุผลที่ไม่อนุมัติ" : "เหตุผลที่ส่งคืน"}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button disabled={busy || !note.trim()} onClick={() => post(noteAction, { note })}>
            ยืนยัน{noteAction === "reject" ? "ไม่อนุมัติ" : "ส่งคืน"}
          </Button>
        </div>
      )}

      {(canOwnerCancel || canApproverCancelApproved) && (
        <Button disabled={busy} variant="ghost" onClick={() => post("cancel")}>
          ยกเลิกคำขอลา
        </Button>
      )}
    </div>
  );
}
