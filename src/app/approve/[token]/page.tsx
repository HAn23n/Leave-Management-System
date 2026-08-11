import { peekApprovalToken } from "@/lib/approval-tokens";
import { formatThaiDate } from "@/lib/date";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { ApproveTokenActions } from "./approve-token-actions";

// Unauthenticated by design — reached straight from the approval email, no
// login wall. Only shows/acts on the one request the token was minted for.
export default async function ApproveTokenPage({ params }: { params: { token: string } }) {
  const summary = await peekApprovalToken(params.token);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo className="h-12 w-12 rounded-2xl shadow-lg shadow-primary/25" />
        <h1 className="text-lg font-bold tracking-tight text-foreground">ระบบบันทึกการลา</h1>
      </div>

      {!summary ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>ลิงก์นี้ใช้งานไม่ได้แล้ว</CardTitle>
            <CardDescription>
              ลิงก์อนุมัติหมดอายุ ถูกใช้ไปแล้ว หรือคำขอนี้ถูกดำเนินการไปแล้ว กรุณาเข้าสู่ระบบเพื่อดูรายละเอียด
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/login" className="text-sm font-medium text-primary underline underline-offset-4">
              เข้าสู่ระบบ
            </a>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>คำขอลารออนุมัติ</CardTitle>
            {summary.requestNo && <CardDescription>เลขที่เอกสาร {summary.requestNo}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label="ผู้ขอลา" value={summary.requesterEmail} />
              <Row label="ประเภทการลา" value={summary.leaveTypeName} />
              <Row label="วันที่" value={`${formatThaiDate(summary.startDate)} - ${formatThaiDate(summary.endDate)}`} />
              {summary.totalDays != null && <Row label="จำนวนวัน" value={`${summary.totalDays} วัน`} />}
              {summary.reason && <Row label="เหตุผล" value={summary.reason} />}
            </dl>
            <ApproveTokenActions token={params.token} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
