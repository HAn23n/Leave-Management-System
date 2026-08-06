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
  nickname: string | null;
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
  approval_order: number;
  created_at: string;
}

export interface UserTeam {
  id: string;
  user_id: string;
  team_id: string;
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

export interface PendingUserRole {
  email: string;
  role: UserRole;
  team_id: string | null;
  created_at: string;
}

export interface PendingTeamLead {
  id: string;
  email: string;
  team_id: string;
  approval_order: number | null;
  created_at: string;
}

export interface LeaveType {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  require_reason: boolean;
  created_at: string;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  source: "seed" | "manual" | "api";
  created_at: string;
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
  current_level: number;
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

export interface AttendanceLog {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  created_at: string;
}

export interface AttendanceSettings {
  id: number;
  check_in_reminder_time: string;
  check_out_reminder_time: string;
  standard_work_hours: number;
  break_hours: number;
  last_check_in_reminder_date: string | null;
  last_check_out_reminder_date: string | null;
  updated_at: string;
}

export interface EmailOutbox {
  id: string;
  type: "new_request" | "decision";
  to_email: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  sent_at: string | null;
}

// Plain interfaces (no index signature) don't structurally extend
// Record<string, unknown> under TS's rules. Intersecting with it here satisfies
// supabase-js's GenericSchema constraint without changing the field types used
// elsewhere in the app.
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
      user_teams: Table<UserTeam>;
      user_team_logs: Table<UserTeamLog>;
      approver_mappings: Table<ApproverMapping>;
      pending_user_roles: Table<PendingUserRole>;
      pending_team_leads: Table<PendingTeamLead>;
      leave_types: Table<LeaveType>;
      holidays: Table<Holiday>;
      leave_requests: Table<LeaveRequest>;
      leave_request_logs: Table<LeaveRequestLog>;
      email_outbox: Table<EmailOutbox>;
      attendance_logs: Table<AttendanceLog>;
      attendance_settings: Table<AttendanceSettings>;
    };
    Views: Record<string, never>;
    Functions: {
      move_team_lead: {
        Args: { p_id: string; p_direction: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
