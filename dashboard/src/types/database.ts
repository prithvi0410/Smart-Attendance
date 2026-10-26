export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'faculty';
  created_at: string;
}

export interface Student {
  id: string;
  roll_no: string;
  full_name: string;
  rfid_uid: string;
  class_name: string | null;
  section: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  class_name: string | null;
  section: string | null;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export interface Device {
  id: string;
  device_name: string;
  device_token_hash: string;
  location: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  current_mode?: 'attendance' | 'registration';
  last_register_uid?: string | null;
  
  // Wi-Fi Status Columns
  current_ssid?: string | null;
  wifi_status?: string | null;
  wifi_ip?: string | null;
  wifi_rssi?: number | null;
  wifi_updated_at?: string | null;
  encryption_key?: string | null;
  preferred_wifi_network_id?: string | null;
}

export interface DeviceWifiNetwork {
  id: string;
  device_id: string;
  ssid: string;
  encrypted_password: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_success_at: string | null;
  last_failure_at: string | null;
}

export interface DeviceCommand {
  id: string;
  device_id: string;
  command: string;
  payload: any;
  status: 'pending' | 'received' | 'success' | 'failed';
  error_code: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AttendanceSession {
  id: string;
  subject_id: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  device_id: string | null;
  class_name: string | null;
  section: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  created_by?: string;
  // Joined fields
  subjects?: Subject;
  devices?: Device;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  device_id: string | null;
  scanned_at: string;
  status: 'present' | 'late' | 'manual';
  created_at: string;
  // Joined fields
  students?: Student;
  attendance_sessions?: AttendanceSession;
}

export interface AIInsight {
  id: string;
  student_id: string;
  analysis_date: string;
  period_start: string | null;
  period_end: string | null;
  attendance_percentage: number | null;
  recent_7_percentage: number | null;
  recent_14_percentage: number | null;
  recent_30_percentage: number | null;
  consecutive_absences: number | null;
  trend: string | null;
  risk_level: string | null;
  summary: string | null;
  factors: string[] | null;
  pattern_confidence: number | null;
  subject_patterns: SubjectPattern[] | null;
  model_name: string | null;
  generated_at: string | null;
  created_at: string;
}

export interface SubjectPattern {
  subject: string;
  pattern: string;
  summary: string;
}

export interface SubjectAttendance {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  total_eligible_sessions: number;
  present_sessions: number;
  absent_sessions: number;
  attendance_percentage: number;
}

export interface StudentPatternFeatures {
  student_id: string;
  full_name: string;
  class_name: string;
  section: string;
  overall_attendance: number;
  last_7_percentage: number;
  last_14_percentage: number;
  last_30_percentage: number;
  consecutive_absences: number;
  recent_change: number;
  longest_absence_streak: number;
  longest_present_streak: number;
  recent_absences_7: number;
  recent_absences_14: number;
  recent_absences_30: number;
  attendance_sequence: number[];
  subject_attendance: { subject: string; attendance: number; recent_attendance: number }[];
}

export interface ClassAttendanceSummary {
  total_students: number;
  safe_count: number;
  at_risk_count: number;
  high_risk_count: number;
  class_average_attendance: number;
  subject_averages: { subject_name: string; subject_code: string; average_attendance: number; total_sessions: number }[];
}

export interface RFIDScanResponse {
  success: boolean;
  status: 'present' | 'already_marked' | 'no_active_session' | 'unknown_card' | 'unauthorized' | 'invalid_request' | 'error';
  student_name?: string;
  roll_no?: string;
  scanned_at?: string;
  message: string;
}

// Dashboard statistics
export interface DashboardStats {
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  averageAttendance: number; // Today's average
  sevenDayAverage: number;   // 7-day average
  activeSession: AttendanceSession | null;
}

