"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { computeWorkedHours } from "@/lib/attendance";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export function AttendanceCard({
  checkInAt,
  checkOutAt,
  breakHours,
}: {
  checkInAt: string | null;
  checkOutAt: string | null;
  breakHours: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(path: "check-in" | "check-out") {
    setBusy(true);
    const res = await fetch(`/api/attendance/${path}`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "ดำเนินการไม่สำเร็จ", description: "กรุณาลองใหม่อีกครั้ง" });
      return;
    }
    toast({ variant: "success", title: path === "check-in" ? "เช็คอินแล้ว" : "เช็คเอาท์แล้ว" });
    router.refresh();
  }

  const isActive = !!checkInAt && !checkOutAt;
  const isDone = !!checkInAt && !!checkOutAt;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>เข้า-ออกงาน</CardTitle>
        {isActive && <Badge variant="success">กำลังทำงาน</Badge>}
        {isDone && <Badge variant="secondary">เสร็จสิ้นวันนี้</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {checkInAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">เช็คอิน</span>
            <span className="font-medium text-foreground">{formatTime(checkInAt)}</span>
          </div>
        )}
        {checkOutAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">เช็คเอาท์</span>
            <span className="font-medium text-foreground">{formatTime(checkOutAt)}</span>
          </div>
        )}
        {isDone && checkInAt && checkOutAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">ชั่วโมงทำงาน (หักพัก {breakHours} ชม.)</span>
            <span className="font-medium text-foreground">
              {computeWorkedHours(checkInAt, checkOutAt, breakHours).toFixed(1)} ชม.
            </span>
          </div>
        )}

        {!checkInAt && (
          <Button disabled={busy} onClick={() => act("check-in")}>
            เช็คอิน
          </Button>
        )}
        {isActive && (
          <Button disabled={busy} variant="outline" onClick={() => act("check-out")}>
            เช็คเอาท์
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
