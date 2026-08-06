import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid date format");
const period = z.enum(["full", "morning", "afternoon"]);

export const leaveRequestInputSchema = z
  .object({
    leave_type_id: z.string().uuid(),
    // Only meaningful (and required) on create — team_id is immutable once a
    // request exists (see guard_leave_request_field_ownership), so the edit
    // form/route never sends or reads it.
    team_id: z.string().uuid().optional(),
    start_date: isoDate,
    end_date: isoDate,
    start_period: period,
    end_period: period,
    reason: z.string().trim().max(1000).optional().default(""),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม",
    path: ["end_date"],
  })
  .refine((v) => v.start_date !== v.end_date || v.start_period === v.end_period, {
    message: "ลาวันเดียวต้องเลือกช่วงเวลาเดียวกันทั้งเริ่มและสิ้นสุด",
    path: ["end_period"],
  });

export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;
