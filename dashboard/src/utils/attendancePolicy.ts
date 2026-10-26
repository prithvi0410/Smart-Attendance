// Official College Attendance Policy
// This is the SINGLE SOURCE OF TRUTH for attendance status classification.
// AI must NEVER override these classifications.

export const ATTENDANCE_THRESHOLDS = {
  SAFE: 75,      // >= 75% is SAFE
  AT_RISK: 60,   // >= 60% and < 75% is AT RISK
  // < 60% is HIGH RISK
} as const;

export type AttendanceStatus = 'safe' | 'at_risk' | 'high_risk';

/**
 * Deterministic attendance status based on official college policy.
 * Uses exact numeric comparisons, not rounded display values.
 * 
 * 75.0%  -> safe
 * 74.99% -> at_risk
 * 60.0%  -> at_risk
 * 59.99% -> high_risk
 */
export function getAttendanceStatus(percentage: number): AttendanceStatus {
  if (percentage >= ATTENDANCE_THRESHOLDS.SAFE) return 'safe';
  if (percentage >= ATTENDANCE_THRESHOLDS.AT_RISK) return 'at_risk';
  return 'high_risk';
}

/**
 * Calculate minimum consecutive future sessions a student must attend to reach 75%.
 * 
 * Solves: (present + x) / (eligible + x) >= 0.75
 *   => 4 * (present + x) >= 3 * (eligible + x)
 *   => 4 * present + 4x >= 3 * eligible + 3x
 *   => x >= 3 * eligible - 4 * present
 * 
 * Returns 0 if already >= 75%.
 */
export function classesNeededFor75(present: number, eligible: number): number {
  if (eligible === 0) return 0;
  if ((present / eligible) * 100 >= ATTENDANCE_THRESHOLDS.SAFE) return 0;
  // (present + x) / (eligible + x) >= 0.75
  // present + x >= 0.75 * eligible + 0.75 * x
  // 0.25 * x >= 0.75 * eligible - present
  // x >= (0.75 * eligible - present) / 0.25
  const x = Math.ceil((0.75 * eligible - present) / 0.25);
  return Math.max(x, 0);
}

/**
 * Status display configuration
 */
export const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  safe: { label: 'SAFE', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  at_risk: { label: 'AT RISK', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  high_risk: { label: 'HIGH RISK', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
};

export const PATTERN_CONFIG: Record<string, { label: string; color: string }> = {
  stable: { label: 'Stable', color: 'text-blue-600' },
  improving: { label: 'Improving', color: 'text-green-600' },
  declining: { label: 'Declining', color: 'text-red-600' },
  irregular: { label: 'Irregular', color: 'text-amber-600' },
};
