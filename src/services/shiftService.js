import { supabase } from '../supabase.js';
import { getCurrentShiftPeriod } from '../utils/time.js';

/** Ambil semua shift aktif dari database. */
export async function getActiveShifts() {
  const { data, error } = await supabase.from('shifts').select('*').eq('is_active', true);
  if (error) throw error;
  return data || [];
}

/** Shift yang sedang berjalan + periode absolutnya (atau null). */
export async function getCurrentShiftInfo() {
  const shifts = await getActiveShifts();
  return getCurrentShiftPeriod(shifts);
}
