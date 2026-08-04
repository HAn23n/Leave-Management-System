"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { LeaveStatus, UserRole } from "@/lib/supabase/types";

type NoteAction = "reject" | "return" | null;

const SUCCESS_TITLE: Record<string, string> = {
  submit: "ส่งอนุมัติแล้ว",
  approve: "อนุมัติแล้ว",
  reject: "ไม่อนุมัติเอกสารแล้ว",
  return: "ส่งคืนเอกสารแล้ว",
  cancel: "ยกเลิกคำขอลาแล้ว",
};

export function LeaveRequestActions({
  requestId,
  status,
  isOwner,
  isApproverInScope,
  currentUserRole,
}: {
  requestId: string;
  status: LeaveStatus;
  isOwner: boolean;
  isApproverInScope: boolean;
  currentUserRole: UserRole;
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
      const message =
        data.message ??
        (data.error === "conflict"
          ? "สถานะของเอกสารถูกเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่"
          : data.error === "note_required"
            ? "กรุณาระบุเหตุผล"
            : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setError(message);
      toast({ variant: data.error === "db_error" ? "warning" : "destructive", title: "ดำเนินการไม่สำเร็จ", description: message });
      return;
    }
    toast({ variant: "success", title: SUCCESS_TITLE[path] ?? "ดำเนินการสำเร็จ" });
    setNoteAction(null);
    setNote("");
    router.refresh();
  }

  // Approvers only review/approve their team's documents — they never submit
  // their own leave, even an old draft/returned one from before they held the role.
  const canOwnerSubmit = isOwner && currentUserRole !== "approver" && (status === "draft" || status === "returned");
  const canOwnerCancel = isOwner && (status === "draft" || status === "pending");
  const canApproverAct = isApproverInScope && !isOwner && status === "pending";
  // The cancel API also allows approver/admin to cancel an already-approved
  // or returned request (see /api/leave-requests/[id]/cancel) — mirror both here.
  const canApproverCancel = isApproverInScope && (status === "approved" || status === "returned");

  if (!canOwnerSubmit && !canOwnerCancel && !canApproverAct && !canApproverCancel) {
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
          {/* Reject/return are secondary to approve — grouped side-by-side and
              lighter-weight instead of two more full-width stacked buttons. */}
          <div className="flex gap-2">
            <Button
              disabled={busy}
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setNoteAction(noteAction === "return" ? null : "return")}
            >
              ส่งคืน
            </Button>
            <Button
              disabled={busy}
              variant="ghost"
              size="sm"
              className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setNoteAction(noteAction === "reject" ? null : "reject")}
            >
              ไม่อนุมัติ
            </Button>
          </div>
        </>
      )}

      {noteAction && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={noteAction === "reject" ? "เหตุผลที่ไม่อนุมัติ" : "เหตุผลที่ส่งคืน"}
            rows={3}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <Button disabled={busy || !note.trim()} onClick={() => post(noteAction, { note })}>
            ยืนยัน{noteAction === "reject" ? "ไม่อนุมัติ" : "ส่งคืน"}
          </Button>
        </div>
      )}

      {(canOwnerCancel || canApproverCancel) && (
        <Button disabled={busy} variant="ghost" onClick={() => post("cancel")}>
          ยกเลิกคำขอลา
        </Button>
      )}
    </div>
  );
}
