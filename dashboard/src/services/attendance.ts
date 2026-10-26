import { supabase } from './supabase';
import type { AttendanceRecord, DashboardStats } from '../types/database';

export const getAttendanceRecords = async (filters: { sessionId?: string; studentId?: string; date?: string; excludeDemo?: boolean }) => {
  let query = supabase
    .from('attendance_records')
    .select(`
      *,
      students (*),
      attendance_sessions${filters.excludeDemo ? '!inner' : ''} (
        *,
        subjects (*)
      )
    `)
    .order('scanned_at', { ascending: false });

  if (filters.sessionId) {
    query = query.eq('session_id', filters.sessionId);
  }
  
  if (filters.studentId) {
    query = query.eq('student_id', filters.studentId);
  }
  
  if (filters.date) {
    query = query.eq('attendance_sessions.session_date', filters.date);
  }

  if (filters.excludeDemo) {
    query = query.neq('attendance_sessions.created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as AttendanceRecord[];
};

export const getSessionAttendance = async (sessionId: string) => {
  return getAttendanceRecords({ sessionId });
};

export const getDailyAttendance = async (date: string) => {
  return getAttendanceRecords({ date });
};

export const getStudentAttendance = async (studentId: string) => {
  return getAttendanceRecords({ studentId });
};

export const getAttendanceStats = async (excludeDemo?: boolean): Promise<DashboardStats> => {
  // 1. Get total active students
  let studentQuery = supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);
    
  if (excludeDemo) {
    studentQuery = studentQuery.neq('created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }
    
  const { count: totalStudents } = await studentQuery;

  // 2. Get today's stats
  const { data: dailyData, error: dailyError } = await supabase
    .rpc('get_daily_summary', {
      p_start_date: new Date().toISOString().split('T')[0],
      p_end_date: new Date().toISOString().split('T')[0],
      p_exclude_admin: excludeDemo || false
    });

  let filteredDaily = dailyData || [];

  // Aggregate stats across all valid classes for today
  let todayTotalStudents = 0;
  let todayPresent = 0;
  let todayAbsent = 0;
  if (filteredDaily.length > 0) {
    for (const day of filteredDaily) {
      todayTotalStudents += Number(day.total_students) || 0;
      todayPresent += Number(day.present) || 0;
      todayAbsent += Number(day.absent) || 0;
    }
  }
  const todayPercentage = (todayPresent + todayAbsent) > 0 ? (todayPresent / (todayPresent + todayAbsent)) * 100 : 0;

  // 3. Get 7-day stats for the average
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const startDate = d.toISOString().split('T')[0];
  const { data: weekData } = await supabase
    .rpc('get_daily_summary', {
      p_start_date: startDate,
      p_end_date: new Date().toISOString().split('T')[0],
      p_exclude_admin: excludeDemo || false
    });

  let filteredWeek = weekData || [];

  let weekTotalPresent = 0;
  let weekTotalEligible = 0;
  if (filteredWeek.length > 0) {
    for (const day of filteredWeek) {
      weekTotalPresent += Number(day.present) || 0;
      weekTotalEligible += (Number(day.present) || 0) + (Number(day.absent) || 0);
    }
  }
  const sevenDayAvg = weekTotalEligible > 0 ? (weekTotalPresent / weekTotalEligible) * 100 : 0;

  let sessionQuery = supabase
    .from('attendance_sessions')
    .select('*, subjects (*)')
    .eq('status', 'active');
    
  if (excludeDemo) {
    sessionQuery = sessionQuery.neq('created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }
    
  const { data: activeSessionResult } = await sessionQuery
    .limit(1)
    .maybeSingle();

  if (dailyError) throw dailyError;

  return {
    totalStudents: totalStudents || 0,
    presentToday: todayPresent,
    absentToday: todayAbsent,
    averageAttendance: todayPercentage,
    sevenDayAverage: sevenDayAvg,
    activeSession: activeSessionResult
  };
};

export const getAttendanceTrend = async (className?: string, section?: string, excludeDemo?: boolean) => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const startDate = d.toISOString().split('T')[0];
  const endDate = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .rpc('get_daily_summary', {
      p_class_name: className || null,
      p_section: section || null,
      p_start_date: startDate,
      p_end_date: endDate,
      p_exclude_admin: excludeDemo || false
    });

  if (error) throw error;
  
  let filteredData = data || [];

  const allDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  return allDates.map(date => {
    // If multiple classes for a day, we need to sum them
    const matches = filteredData.filter((d: any) => d.session_date === date);
    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
    
    if (matches.length > 0) {
      const totalPresent = matches.reduce((sum: number, m: any) => sum + (Number(m.present) || 0), 0);
      const totalAbsent = matches.reduce((sum: number, m: any) => sum + (Number(m.absent) || 0), 0);
      return {
        name: dayName,
        present: totalPresent,
        absent: totalAbsent,
        fullDate: date
      };
    }
    return { name: dayName, present: 0, absent: 0, fullDate: date };
  });
};

export const getMonthlyTrend = async (className?: string, section?: string, excludeDemo?: boolean) => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  const startDate = d.toISOString().split('T')[0];
  const endDate = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .rpc('get_monthly_trend', {
      p_class_name: className || null,
      p_section: section || null,
      p_start_date: startDate,
      p_end_date: endDate,
      p_exclude_admin: excludeDemo || false
    });

  if (error) throw error;
  
  let filteredData = data || [];

  const allDates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split('T')[0];
  });

  return allDates.map(date => {
    // Similarly sum the averages for multiple classes on the same day if we aren't filtering by specific class
    const matches = filteredData.filter((d: any) => d.session_date === date);
    const dayName = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    if (matches.length > 0) {
      // Average the percentages from multiple classes for the same day
      const sumPct = matches.reduce((sum: number, m: any) => sum + Number(m.attendance_percentage || 0), 0);
      const avgPct = matches.length > 0 ? sumPct / matches.length : 0;
      
      return {
        name: dayName,
        percentage: avgPct,
        fullDate: date
      };
    }
    return { name: dayName, percentage: 0, fullDate: date };
  }).filter(t => t.percentage > 0 || filteredData.some((d: any) => d.session_date === t.fullDate));
};
