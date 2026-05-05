// Pure helpers for Student Reports filtering & aggregation.
// Extracted so they can be unit-tested independently of Supabase / React.

export interface StudentReportSession {
  id: string;
  course_id: string;
  session_date: string; // YYYY-MM-DD
  status: string;
}

export interface StudentEnrollment {
  course_id: string;
  enrolled_at: string; // ISO timestamp
  left_at?: string | null; // ISO timestamp; null/undefined means still enrolled
}

export interface StudentExcuse {
  session_id: string;
  status: string; // "approved" | "pending" | "rejected"
  reason?: string | null;
}

/**
 * Apply date-range + per-module enrollment-window filtering.
 * A session is kept only if:
 *   - dateFrom <= session_date <= dateTo (when provided)
 *   - session_date >= enrolled_at (join date) for that course
 *   - session_date <= left_at (when student has left the course)
 */
export function filterSessionsForStudent(
  sessions: StudentReportSession[],
  enrollments: StudentEnrollment[],
  opts: { dateFrom?: string; dateTo?: string } = {},
): StudentReportSession[] {
  const enrollmentMap = new Map(enrollments.map((e) => [e.course_id, e]));
  return sessions.filter((s) => {
    if (opts.dateFrom && s.session_date < opts.dateFrom) return false;
    if (opts.dateTo && s.session_date > opts.dateTo) return false;
    const enrollment = enrollmentMap.get(s.course_id);
    if (!enrollment) return false; // not enrolled at all
    const enrolledDay = enrollment.enrolled_at.slice(0, 10);
    if (s.session_date < enrolledDay) return false;
    if (enrollment.left_at) {
      const leftDay = enrollment.left_at.slice(0, 10);
      if (s.session_date > leftDay) return false;
    }
    return true;
  });
}

export interface StudentTotals {
  total: number;
  present: number;
  absent: number;
  excused: number;
}

/** Compute present/absent/excused totals for a student given filtered sessions. */
export function computeTotals(
  sessions: StudentReportSession[],
  attendedSessionIds: Iterable<string>,
  excuses: StudentExcuse[],
): StudentTotals {
  const attended = new Set(attendedSessionIds);
  const approvedExcuses = new Set(
    excuses.filter((e) => e.status === "approved").map((e) => e.session_id),
  );
  let present = 0;
  let excused = 0;
  let absent = 0;
  for (const s of sessions) {
    if (attended.has(s.id)) present++;
    else if (approvedExcuses.has(s.id)) excused++;
    else absent++;
  }
  return { total: sessions.length, present, absent, excused };
}