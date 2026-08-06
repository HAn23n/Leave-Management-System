"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { LeaveStatus, UserRole } from "@/lib/supabase/types";

type NoteAction = "reject" | "return" | "skip" | null;

const SUCCESS_TITLE: Record<string, string> = {
  submit: "ส่งอนุมัติแล้ว",
  approve: "อนุมัติแล้ว",
  reject: "ไม่อนุมัติเอกสารแล้ว",
  return: "ส่งคืนเอกสารแล้ว",
  cancel: "ยกเลิกคำขอลาแล้ว",
  "skip-approver": "ข้ามผู้อนุมัติแล้ว",
};

const NOTE_ACTION_PATH: Record<Exclude<NoteAction, null>, string> = {
  reject: "reject",
  return: "return",
  skip: "skip-approver",
};

const NOTE_ACTION_LABEL: Record<Exclude<NoteAction, null>, string> = {
  reject: "ไม่อนุมัติ",
  return: "ส่งคืน",
  skip: "ข้ามผู้อนุมัติ",
};

export function LeaveRequestActions({
  requestId,
  status,
  isOwner,
  isApproverInScope,
  isCurrentApprover,
  currentUserRole,
}: {
  requestId: string;
  status: LeaveStatus;
  isOwner: boolean;
  isApproverInScope: boolean;
  isCurrentApprover: boolean;
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

  const canOwnerSubmit = isOwner && currentUserRole !== "approver" && (status === "draft" || status === "returned");
  const canOwnerCancel = isOwner && (status === "draft" || status === "pending");
  const canApproverAct = isApproverInScope && !isOwner && status === "pending" && isCurrentApprover;
  const canApproverCancel = currentUserRole === "admin" && (status === "approved" || status === "returned");
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
              variant="outline"
              size="sm"
              className="flex-1 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/40"
              onClick={() => setNoteAction(noteAction === "reject" ? null : "reject")}
            >
              ไม่อนุมัติ
            </Button>
          </div>
          {currentUserRole === "admin" && (
            <Button
              disabled={busy}
              variant="ghost"
              size="sm"
              onClick={() => setNoteAction(noteAction === "skip" ? null : "skip")}
            >
              ข้ามผู้อนุมัติ
            </Button>
          )}
        </>
      )}

      {noteAction && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              noteAction === "reject"
                ? "เหตุผลที่ไม่อนุมัติ"
                : noteAction === "return"
                  ? "เหตุผลที่ส่งคืน"
                  : "เหตุผล (ไม่บังคับ)"
            }
            rows={3}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <Button
            disabled={busy || (noteAction !== "skip" && !note.trim())}
            onClick={() => post(NOTE_ACTION_PATH[noteAction], { note })}
          >
            ยืนยัน{NOTE_ACTION_LABEL[noteAction]}
          </Button>
        </div>
      )}

      {(canOwnerCancel || canApproverCancel) && (
        <Button
          disabled={busy}
          variant="outline"
          className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/40"
          onClick={() => post("cancel")}
        >
          ยกเลิกคำขอลา
        </Button>
      )}
    </div>
  );
}
