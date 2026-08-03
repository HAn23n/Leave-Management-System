export type UserRole = "admin" | "approver" | "user";
export type LeavePeriod = "full" | "morning" | "afternoon";
export type LeaveStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "returned";

export interface Team {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  team_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamLead {
  id: string;
  team_id: string;
  user_id: string;
  created_at: string;
}

export interface UserTeamLog {
  id: string;
  user_id: string;
  from_team_id: string | null;
  to_team_id: string | null;
  changed_at: string;
}

export interface ApproverMapping {
  id: string;
  user_id: string;
  approver_id: string;
  created_at: string;
}

export interface LeaveType {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  source: "seed" | "manual";
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  user_id: string;
  leave_type_id: string;
  year: number;
  quota_days: number;
  used_days: number;
}

export interface LeaveRequest {
  id: string;
  request_no: string | null;
  user_id: string;
  team_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  start_period: LeavePeriod;
  end_period: LeavePeriod;
  total_days: number | null;
  reason: string;
  status: LeaveStatus;
  approver_id: string | null;
  approver_note: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequestLog {
  id: string;
  request_id: string;
  actor_id: string | null;
  from_status: LeaveStatus | null;
  to_status: LeaveStatus;
  note: string | null;
  created_at: string;
}

// อินเทอร์เฟซ (ไม่มี index signature) ไม่ extends Record<string, unknown> ตรงๆ ตามกฎ TS
// intersect กับ Record<string, unknown> เพื่อให้ผ่าน GenericSchema constraint ของ supabase-js
// โดยไม่กระทบ field types เดิมที่ใช้ทั่วแอป
type Table<Row extends object> = {
  Row: Row & Record<string, unknown>;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      teams: Table<Team>;
      users: Table<AppUser>;
      team_leads: Table<TeamLead>;
      user_team_logs: Table<UserTeamLog>;
      approver_mappings: Table<ApproverMapping>;
      leave_types: Table<LeaveType>;
      holidays: Table<Holiday>;
      leave_balances: Table<LeaveBalance>;
      leave_requests: Table<LeaveRequest>;
      leave_request_logs: Table<LeaveRequestLog>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
