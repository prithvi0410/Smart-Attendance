import { supabase } from './supabase';
import type { Student } from '../types/database';

export const getUniqueClasses = async (excludeDemo?: boolean) => {
  const { data, error } = await supabase.rpc('get_unique_classes', {
    p_exclude_admin: excludeDemo || false
  });
  if (error) throw error;
  return data.map((d: any) => d.class_name) as string[];
};

export const getStudents = async (filters?: { search?: string; isActive?: boolean; page?: number; limit?: number; className?: string; excludeDemo?: boolean }) => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from('students').select('*', { count: 'exact' }).order('roll_no', { ascending: true });

  if (filters?.search) {
    query = query.or(`full_name.ilike.%${filters.search}%,roll_no.ilike.%${filters.search}%`);
  }
  
  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  if (filters?.className && filters.className !== 'All') {
    query = query.eq('class_name', filters.className);
  }

  if (filters?.excludeDemo) {
    query = query.neq('created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data as Student[], count: count || 0 };
};

export const getStudent = async (id: string) => {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error) throw error;
  return data as Student;
};

export const createStudent = async (student: Omit<Student, 'id' | 'created_at'>) => {
  const { data, error } = await supabase
    .from('students')
    .insert(student)
    .select()
    .single();
    
  if (error) throw error;
  return data as Student;
};

export const updateStudent = async (id: string, updates: Partial<Omit<Student, 'id' | 'created_at'>>) => {
  const { data, error } = await supabase
    .from('students')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as Student;
};

export const deactivateStudent = async (id: string) => {
  return updateStudent(id, { is_active: false });
};

export const deleteStudent = async (id: string) => {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
};
