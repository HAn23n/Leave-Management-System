import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { formatThaiDate } from "@/lib/date";

const FROM = process.env.GMAIL_USER ? `ระบบบันทึกการลา <${process.env.GMAIL_USER}>` : "";

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

// Sends straight through Gmail's own SMTP (smtp.gmail.com) using an App
// Password — no third-party email service involved. GMAIL_USER is the
// sending Gmail address; GMAIL_APP_PASSWORD is a 16-char App Password
// generated at https://myaccount.google.com/apppasswords (requires 2FA on
// that account — a normal account password will be rejected by Gmail).
let cachedTransporter: Transporter | null = null;

function getMailTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn("GMAIL_USER / GMAIL_APP_PASSWORD is not set — skipping email send.");
    return null;
  }
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return cachedTransporter;
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
  requesterEmail: string;
  requestNo: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number | null;
  requestUrl: string;
}): Promise<void> {
  const transporter = getMailTransporter();
  if (!transporter) return;

  const body = `
    <p>เรียนคุณ ${escapeHtml(params.approverEmail)}</p>
    <p>มีคำขอลาใหม่รอการอนุมัติจากคุณ</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      ${params.requestNo ? infoRow("เลขที่เอกสาร", escapeHtml(params.requestNo)) : ""}
      ${infoRow("ผู้ขอลา", escapeHtml(params.requesterEmail))}
      ${infoRow("ประเภทการลา", escapeHtml(params.leaveTypeName))}
      ${infoRow("วันที่", `${formatThaiDate(params.startDate)} - ${formatThaiDate(params.endDate)}`)}
      ${params.totalDays != null ? infoRow("จำนวนวัน", `${params.totalDays} วัน`) : ""}
    </table>
    ${ctaButton(params.requestUrl, "ดูรายละเอียดและอนุมัติ")}
  `;

  await transporter.sendMail({
    from: FROM,
    to: params.approverEmail,
    subject: `[รออนุมัติ] คำขอลาจาก ${params.requesterEmail}`,
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
  requestNo: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  decision: "approved" | "rejected" | "returned";
  approverEmail: string;
  approverNote?: string | null;
  requestUrl: string;
}): Promise<void> {
  const transporter = getMailTransporter();
  if (!transporter) return;

  const decisionLabel = DECISION_LABEL[params.decision];
  const body = `
    <p>เรียนคุณ ${escapeHtml(params.requesterEmail)}</p>
    <p>คำขอลาของคุณได้รับการพิจารณาแล้ว ผลคือ <strong>${decisionLabel}</strong></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      ${params.requestNo ? infoRow("เลขที่เอกสาร", escapeHtml(params.requestNo)) : ""}
      ${infoRow("ประเภทการลา", escapeHtml(params.leaveTypeName))}
      ${infoRow("วันที่", `${formatThaiDate(params.startDate)} - ${formatThaiDate(params.endDate)}`)}
      ${infoRow("พิจารณาโดย", escapeHtml(params.approverEmail))}
      ${params.approverNote ? infoRow("หมายเหตุ", escapeHtml(params.approverNote)) : ""}
    </table>
    ${ctaButton(params.requestUrl, "ดูรายละเอียด")}
  `;

  await transporter.sendMail({
    from: FROM,
    to: params.requesterEmail,
    subject: `[${decisionLabel}] คำขอลาเลขที่ ${params.requestNo ?? "-"}`,
    html: emailShell(`คำขอลาของคุณ: ${decisionLabel}`, body),
  });
}

export async function notifyCheckInReminder(toEmail: string): Promise<void> {
  const transporter = getMailTransporter();
  if (!transporter) return;

  const body = `<p>สวัสดีตอนเช้าค่ะ/ครับ อย่าลืมกด <strong>เช็คอิน</strong> เข้าระบบน้าา</p>`;

  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: "อย่าลืมเช็คอินเข้างานน้าา",
    html: emailShell("เตือนเช็คอินเข้างาน", body),
  });
}

export async function notifyCheckOutReminder(toEmail: string): Promise<void> {
  const transporter = getMailTransporter();
  if (!transporter) return;

  const body = `<p>เลิกงานแล้ว อย่าลืมกด <strong>เช็คเอาท์</strong> น้า</p>`;

  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: "เลิกงานแล้ว อย่าลืมเช็คเอาท์น้า",
    html: emailShell("เตือนเช็คเอาท์ออกงาน", body),
  });
}
