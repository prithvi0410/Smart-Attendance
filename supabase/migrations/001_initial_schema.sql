-- ============================================
-- Smart Attendance System - Initial Schema
-- Migration: 001_initial_schema
-- Applied to Supabase project: qavnkzamsatdofdblrgv
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Students
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_no text UNIQUE NOT NULL,
  full_name text NOT NULL,
  rfid_uid text UNIQUE NOT NULL,
  class_name text,
  section text,
  email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Subjects
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Devices
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text UNIQUE NOT NULL,
  device_token_hash text NOT NULL,
  location text,
  is_active boolean DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Attendance Sessions
CREATE TABLE public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id),
  session_date date NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  device_id uuid REFERENCES public.devices(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

-- Attendance Records
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  device_id uuid REFERENCES public.devices(id),
  scanned_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'manual')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_session_student UNIQUE (session_id, student_id)
);

-- AI Insights
CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  analysis_date date NOT NULL,
  period_start date,
  period_end date,
  attendance_percentage numeric,
  recent_7_percentage numeric,
  recent_14_percentage numeric,
  recent_30_percentage numeric,
  consecutive_absences integer,
  trend text,
  risk_level text,
  summary text,
  factors jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_attendance_records_session_id ON public.attendance_records(session_id);
CREATE INDEX idx_attendance_records_student_id ON public.attendance_records(student_id);
CREATE INDEX idx_attendance_records_scanned_at ON public.attendance_records(scanned_at);
CREATE INDEX idx_attendance_sessions_status ON public.attendance_sessions(status);
CREATE INDEX idx_attendance_sessions_subject_id ON public.attendance_sessions(subject_id);
CREATE INDEX idx_ai_insights_student_id ON public.ai_insights(student_id);

-- RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "students_select" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "students_insert" ON public.students FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "students_update" ON public.students FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "subjects_select" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "subjects_insert" ON public.subjects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "subjects_update" ON public.subjects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "devices_select" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "devices_insert" ON public.devices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "devices_update" ON public.devices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "sessions_select" ON public.attendance_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sessions_insert" ON public.attendance_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sessions_update" ON public.attendance_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "records_select" ON public.attendance_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "insights_select" ON public.ai_insights FOR SELECT TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
