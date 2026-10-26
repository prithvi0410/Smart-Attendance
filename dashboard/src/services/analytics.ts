import { supabase } from './supabase';
import type { AIInsight, SubjectAttendance, ClassAttendanceSummary } from '../types/database';

export const getStudentInsights = async (studentId: string) => {
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('student_id', studentId)
    .order('analysis_date', { ascending: false })
    .limit(1)
    .maybeSingle();
    
  if (error) throw error;
  return data as AIInsight | null;
};

export const getAllInsights = async (excludeDemo?: boolean) => {
  let query = supabase
    .from('ai_insights')
    .select('*, students!inner(full_name, roll_no, class_name, created_by)')
    .order('analysis_date', { ascending: false });

  if (excludeDemo) {
    query = query.neq('students.created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }
    
  const { data, error } = await query;
  if (error) throw error;
  return data as (AIInsight & { students: { full_name: string; roll_no: string } })[];
};

export const triggerAIAnalysis = async (className?: string, section?: string) => {
  const { data, error } = await supabase.functions.invoke('generate-ai-insights', {
    body: { action: 'start_job', class_name: className, section }
  });
  
  if (error) throw error;
  return data; // { job_id, total_batches }
};

export const processAIBatch = async (jobId: string) => {
  const { data, error } = await supabase.functions.invoke('generate-ai-insights', {
    body: { action: 'process_batch', job_id: jobId }
  });
  
  if (error) throw error;
  return data; // { status, processed }
};

export const getAIJobStatus = async (jobId: string) => {
  const { data, error } = await supabase.functions.invoke('generate-ai-insights', {
    body: { action: 'job_status', job_id: jobId }
  });
  
  if (error) throw error;
  return data.job; 
};

// --- New RPCs for enhanced analytics ---

export const getStudentSubjectAttendance = async (studentId: string): Promise<SubjectAttendance[]> => {
  const { data, error } = await supabase.rpc('get_student_subject_attendance', {
    p_student_id: studentId
  });
  
  if (error) throw error;
  return (data || []) as SubjectAttendance[];
};

export const getClassAttendanceSummary = async (className?: string, section?: string, excludeDemo?: boolean): Promise<ClassAttendanceSummary | null> => {
  const { data, error } = await supabase.rpc('get_class_attendance_summary', {
    p_class_name: className || null,
    p_section: section || null,
    p_period_days: 60,
    p_exclude_admin: excludeDemo || false
  });
  
  if (error) throw error;
  if (data && data.length > 0) return data[0] as ClassAttendanceSummary;
  return null;
};
