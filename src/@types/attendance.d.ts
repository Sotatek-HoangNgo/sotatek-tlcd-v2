type TCheckTime = string | false;

export interface ITimekeepingRecord {
  id: number;
  timekeeping_code: number;
  employee_id: [number, string];
  date_check: string;
  is_holiday: boolean;
  is_weekend: boolean;
  work_start: string;
  work_end: string;
  check_in: TCheckTime;
  check_out: TCheckTime;
  late: number;
  early: number;
  minus_fund: number;
  work_lack: number;
  work_number: number;
  leave_ids: number[];
  total_work_number: number;
}

export interface IOverviewAttendanceData {
  id: number;
  order_id: number;
  name: string;
  operation: string | boolean;
  line_number: number;
  time_display: string | boolean;
  amount: number;
}
