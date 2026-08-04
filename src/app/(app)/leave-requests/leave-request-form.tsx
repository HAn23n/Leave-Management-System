"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDatePicker } from "@/components/calendar-date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { calcTotalDaysClient, todayIso, type LeavePeriodClient } from "@/lib/date";
import type { LeaveRequest, LeaveType, UserRole } from "@/lib/supabase/types";

const PERIOD_OPTIONS: { value: LeavePeriodClient; label: string }[] = [
  { value: "morning", label: "เช้า" },
  { value: "full", label: "เต็มวัน" },
  { value: "afternoon", label: "บ่าย" },
];

interface LeaveRequestFormProps {
  mode: "create" | "edit";
  leaveTypes: Pick<LeaveType, "id" | "name" | "color">[];
  holidays: { holiday_date: string; name: string }[];
  currentUserRole: UserRole;
  existing?: LeaveRequest;
}

export function LeaveRequestForm({
  mode,
  leaveTypes,
  holidays,
  currentUserRole,
  existing,
}: LeaveRequestFormProps) {
  const router = useRouter();
  const holidayDates = useMemo(() => holidays.map((h) => h.holiday_date), [holidays]);
  const holidayMap = useMemo(() => new Map(holidays.map((h) => [h.holiday_date, h.name])), [holidays]);

  const [leaveTypeId, setLeaveTypeId] = useState(existing?.leave_type_id ?? leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState(existing?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(existing?.end_date ?? todayIso());
  const [startPeriod, setStartPeriod] = useState<LeavePeriodClient>(existing?.start_period ?? "full");
  const [endPeriod, setEndPeriod] = useState<LeavePeriodClient>(existing?.end_period ?? "full");
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [submitting, setSubmitting] = useState<"draft" | "submit" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSingleDay = startDate === endDate;
  const canApproveOwn = currentUserRole === "approver" || currentUserRole === "admin";

  const previewDays = useMemo(
    () => calcTotalDaysClient(startDate, endDate, startPeriod, isSingleDay ? startPeriod : endPeriod, holidayDates),
    [startDate, endDate, startPeriod, endPeriod, isSingleDay, holidayDates]
  );

  function handleStartDateChange(iso: string) {
    setStartDate(iso);
    if (iso > endDate) setEndDate(iso);
  }

  function handleSingleDayPeriod(p: LeavePeriodClient) {
    setStartPeriod(p);
    setEndPeriod(p);
  }

  async function saveDraftOrUpdate(): Promise<string | null> {
    const payload = {
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      start_period: startPeriod,
      end_period: isSingleDay ? startPeriod : endPeriod,
      reason,
    };

    const res =
      mode === "edit" && existing
        ? await fetch(`/api/leave-requests/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/leave-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error === "invalid_input" ? "กรุณาตรวจสอบข้อมูลที่กรอก" : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return null;
    }
    return body.request.id as string;
  }

  async function handleSaveDraft() {
    setSubmitting("draft");
    setError(null);
    const id = await saveDraftOrUpdate();
    setSubmitting(null);
    if (id) {
      router.push(`/leave-requests/${id}`);
      router.refresh();
    }
  }

  async function handleSubmitForApproval() {
    setSubmitting("submit");
    setError(null);
    const id = await saveDraftOrUpdate();
    if (!id) {
      setSubmitting(null);
      return;
    }
    const res = await fetch(`/api/leave-requests/${id}/submit`, { method: "POST" });
    setSubmitting(null);
    if (!res.ok) {
      setError("ส่งอนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }
    router.push(`/leave-requests/${id}`);
    router.refresh();
  }

  async function handleSaveAndApprove() {
    setSubmitting("approve");
    setError(null);
    const id = await saveDraftOrUpdate();
    if (!id) {
      setSubmitting(null);
      return;
    }
    const res = await fetch(`/api/leave-requests/${id}/approve-own`, { method: "POST" });
    setSubmitting(null);
    if (!res.ok) {
      setError("บันทึกและอนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }
    router.push(`/leave-requests/${id}`);
    router.refresh();
  }

  const busy = submitting !== null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5 p-4 pb-4">
        <div className="space-y-2">
          <Label>ประเภทการลา</Label>
          <Select value={leaveTypeId} onValueChange={setLeaveTypeId} disabled={busy}>
            <SelectTrigger>
              <SelectValue placeholder="เลือกประเภทการลา" />
            </SelectTrigger>
            <SelectContent>
              {leaveTypes.map((lt) => (
                <SelectItem key={lt.id} value={lt.id}>
                  {lt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>วันที่เริ่มลา</Label>
          <CalendarDatePicker value={startDate} onChange={handleStartDateChange} holidays={holidayMap} disabled={busy} />
        </div>

        <div className="space-y-2">
          <Label>วันที่สิ้นสุด</Label>
          <CalendarDatePicker
            value={endDate}
            onChange={(iso) => setEndDate(iso < startDate ? startDate : iso)}
            holidays={holidayMap}
            disabled={busy}
          />
        </div>

        {isSingleDay ? (
          <div className="space-y-2">
            <Label>ช่วงเวลา</Label>
            <PeriodPicker value={startPeriod} onChange={handleSingleDayPeriod} disabled={busy} />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>ช่วงเวลาของวันแรก</Label>
              <PeriodPicker value={startPeriod} onChange={setStartPeriod} disabled={busy} />
            </div>
            <div className="space-y-2">
              <Label>ช่วงเวลาของวันสุดท้าย</Label>
              <PeriodPicker value={endPeriod} onChange={setEndPeriod} disabled={busy} />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label>เหตุผล</Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            rows={4}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            placeholder="ระบุเหตุผลการลา"
          />
        </div>

        <div className="rounded-2xl bg-accent px-4 py-3 text-accent-foreground">
          <span className="text-sm">จำนวนวันลา</span>
          <p className="text-2xl font-semibold">{previewDays.toFixed(1)} วัน</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="sticky bottom-16 flex flex-col gap-2 border-t border-border bg-white p-4 md:static">
        {canApproveOwn && (
          <Button onClick={handleSaveAndApprove} disabled={busy} variant="default">
            {submitting === "approve" ? "กำลังบันทึก..." : "บันทึกและอนุมัติเลย"}
          </Button>
        )}
        <div className="flex gap-2">
          <Button onClick={handleSaveDraft} disabled={busy} variant="outline" className="flex-1">
            {submitting === "draft" ? "กำลังบันทึก..." : "บันทึกร่าง"}
          </Button>
          {!canApproveOwn && (
            <Button onClick={handleSubmitForApproval} disabled={busy} className="flex-1">
              {submitting === "submit" ? "กำลังส่ง..." : "ส่งอนุมัติ"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodPicker({
  value,
  onChange,
  disabled,
}: {
  value: LeavePeriodClient;
  onChange: (p: LeavePeriodClient) => void;
  disabled?: boolean;
}) {
  return <SegmentedControl options={PERIOD_OPTIONS} value={value} onChange={onChange} disabled={disabled} />;
}
