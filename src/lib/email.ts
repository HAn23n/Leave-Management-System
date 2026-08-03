import "server-only";
import { Resend } from "resend";
import { formatThaiDate } from "@/lib/date";

const FROM = process.env.RESEND_FROM_EMAIL || "Leave System <noreply@example.com>";

// All interpolated values below come from user-controlled data (full names,
// free-text reasons/notes) — escape before embedding in HTML to prevent
// HTML/script injection rendering in the recipient's email client.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY is not set — skipping email send.");
    return null;
  }
  return new Resend(apiKey);
}

function emailShell(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="th">
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#c81e1e;padding:20px 24px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">ระบบบันทึกการลา</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;color:#171717;font-size:14px;line-height:1.6;">
                <h2 style="margin:0 0 12px 0;font-size:16px;color:#171717;">${title}</h2>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background-color:#fafafa;color:#8a8a8a;font-size:12px;">
                อีเมลนี้ส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 0;color:#8a8a8a;">${label}</td>
    <td style="padding:4px 0;text-align:right;font-weight:bold;">${value}</td>
  </tr>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:16px;padding:10px 20px;background-color:#c81e1e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">${label}</a>`;
}

export async function notifyNewLeaveRequest(params: {
  approverEmail: string;
  approverName: string;
  requesterName: string;
  requestNo: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number | null;
  requestUrl: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const body = `
    <p>เรียนคุณ ${escapeHtml(params.approverName)}</p>
    <p>มีคำขอลาใหม่รอการอนุมัติจากคุณ</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      ${params.requestNo ? infoRow("เลขที่เอกสาร", escapeHtml(params.requestNo)) : ""}
      ${infoRow("ผู้ขอลา", escapeHtml(params.requesterName))}
      ${infoRow("ประเภทการลา", escapeHtml(params.leaveTypeName))}
      ${infoRow("วันที่", `${formatThaiDate(params.startDate)} - ${formatThaiDate(params.endDate)}`)}
      ${params.totalDays != null ? infoRow("จำนวนวัน", `${params.totalDays} วัน`) : ""}
    </table>
    ${ctaButton(params.requestUrl, "ดูรายละเอียดและอนุมัติ")}
  `;

  await resend.emails.send({
    from: FROM,
    to: params.approverEmail,
    subject: `[รออนุมัติ] คำขอลาจาก ${params.requesterName}`,
    html: emailShell("มีคำขอลาใหม่รออนุมัติ", body),
  });
}

const DECISION_LABEL: Record<"approved" | "rejected" | "returned", string> = {
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  returned: "ส่งคืนเพื่อแก้ไข",
};

export async function notifyLeaveDecision(params: {
  requesterEmail: string;
  requesterName: string;
  requestNo: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  decision: "approved" | "rejected" | "returned";
  approverName: string;
  approverNote?: string | null;
  requestUrl: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const decisionLabel = DECISION_LABEL[params.decision];
  const body = `
    <p>เรียนคุณ ${escapeHtml(params.requesterName)}</p>
    <p>คำขอลาของคุณได้รับการพิจารณาแล้ว ผลคือ <strong>${decisionLabel}</strong></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      ${params.requestNo ? infoRow("เลขที่เอกสาร", escapeHtml(params.requestNo)) : ""}
      ${infoRow("ประเภทการลา", escapeHtml(params.leaveTypeName))}
      ${infoRow("วันที่", `${formatThaiDate(params.startDate)} - ${formatThaiDate(params.endDate)}`)}
      ${infoRow("พิจารณาโดย", escapeHtml(params.approverName))}
      ${params.approverNote ? infoRow("หมายเหตุ", escapeHtml(params.approverNote)) : ""}
    </table>
    ${ctaButton(params.requestUrl, "ดูรายละเอียด")}
  `;

  await resend.emails.send({
    from: FROM,
    to: params.requesterEmail,
    subject: `[${decisionLabel}] คำขอลาเลขที่ ${params.requestNo ?? "-"}`,
    html: emailShell(`คำขอลาของคุณ: ${decisionLabel}`, body),
  });
}
