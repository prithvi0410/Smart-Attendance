import { supabase } from './supabase';
import type { Subject } from '../types/database';

export const getSubjects = async (filters?: { className?: string; excludeDemo?: boolean }) => {
  let query = supabase
    .from('subjects')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
    
  if (filters?.className && filters.className !== 'All') {
    query = query.eq('class_name', filters.className);
  }

  if (filters?.excludeDemo) {
    query = query.neq('created_by', 'c8016be8-705b-4554-99ce-9e0a04fe99d2');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Subject[];
};

export const createSubject = async (subject: Omit<Subject, 'id' | 'created_at'>) => {
  const { data, error } = await supabase
    .from('subjects')
    .insert(subject)
    .select()
    .single();
    
  if (error) throw error;
  return data as Subject;
};

export const updateSubject = async (id: string, updates: Partial<Omit<Subject, 'id' | 'created_at'>>) => {
  const { data, error } = await supabase
    .from('subjects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as Subject;
};

export const deleteSubject = async (id: string) => {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) throw error;
};
