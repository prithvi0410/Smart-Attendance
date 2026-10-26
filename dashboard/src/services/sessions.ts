import { supabase } from './supabase';
import type { AttendanceSession } from '../types/database';

export const getActiveSessions = async (excludeDemo?: boolean) => {
  let query = supabase
    .from('attendance_sessions')
    .select(`
      *,
      subjects (*),
      devices (*)
    `)
    .eq('status', 'active');
    
  if (excludeDemo) {
    query = query.neq('created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as AttendanceSession[];
};

export const getSessions = async (filters?: { status?: string; subjectId?: string; date?: string; page?: number; limit?: number; excludeDemo?: boolean }) => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('attendance_sessions')
    .select(`
      *,
      subjects (*),
      devices (*)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  
  if (filters?.subjectId) {
    query = query.eq('subject_id', filters.subjectId);
  }
  
  if (filters?.date) {
    query = query.eq('session_date', filters.date);
  }

  if (filters?.excludeDemo) {
    query = query.neq('created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data as AttendanceSession[], count: count || 0 };
};

export const startSession = async (subjectId: string, deviceId: string | null = null, className: string = '', section: string = '') => {
  const now = new Date();
  const sessionDate = now.toISOString().split('T')[0];
  const startTime = now.toISOString();
  
  const insertData: Record<string, any> = {
    subject_id: subjectId,
    device_id: deviceId,
    session_date: sessionDate,
    start_time: startTime,
    status: 'active'
  };
  
  if (className) insertData.class_name = className;
  if (section) insertData.section = section;
  
  const { data, error } = await supabase
    .from('attendance_sessions')
    .insert(insertData)
    .select(`
      *,
      subjects (*),
      devices (*)
    `)
    .single();
    
  if (error) throw error;
  return data as AttendanceSession;
};

export const endSession = async (sessionId: string) => {
  const now = new Date();
  const endTime = now.toISOString();
  
  const { data, error } = await supabase
    .from('attendance_sessions')
    .update({
      status: 'completed',
      end_time: endTime
    })
    .eq('id', sessionId)
    .select()
    .single();
    
  if (error) throw error;
  return data as AttendanceSession;
};

export const cancelSession = async (sessionId: string) => {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .update({
      status: 'cancelled'
    })
    .eq('id', sessionId)
    .select()
    .single();
    
  if (error) throw error;
  return data as AttendanceSession;
};

export const getSession = async (id: string) => {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select(`
      *,
      subjects (*),
      devices (*)
    `)
    .eq('id', id)
    .single();
    
  if (error) throw error;
  return data as AttendanceSession;
};

export const deleteSession = async (id: string) => {
  const { error } = await supabase.from('attendance_sessions').delete().eq('id', id);
  if (error) throw error;
};
