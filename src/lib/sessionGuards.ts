// Pure guards for session launch / creation rules.
// Extracted so they can be unit-tested independently of React/Supabase.

export const ALLOWED_VENUES = [
  "VIP",
  "NGUVANA HALL",
  "MSIGALA HALL",
  "LIBRARY",
  "COMPUTER ROOM",
  "OLD LIBRARY",
] as const;

export type AllowedVenue = (typeof ALLOWED_VENUES)[number];

export interface SessionLike {
  status?: string | null;
  session_date?: string | null; // YYYY-MM-DD
}

/**
 * A session can be launched (QR generated) only if it is not completed
 * and its scheduled date is today or later (no past sessions).
 * `now` is injectable for deterministic testing.
 */
export function isSessionLaunchable(session: SessionLike, now: Date = new Date()): boolean {
  if (!session) return false;
  if (session.status === "completed") return false;
  if (session.status === "terminated") return false;
  if (session.session_date) {
    const today = now.toISOString().slice(0, 10);
    if (session.session_date < today) return false;
  }
  return true;
}

export function isVenueAllowed(venue: string | null | undefined): venue is AllowedVenue {
  if (!venue) return false;
  return (ALLOWED_VENUES as readonly string[]).includes(venue);
}

export interface LecturerAssignment {
  course_id: string;
  lecturer_id: string;
}

/**
 * Mirrors the server-side RLS rule: a lecturer can create a session for a
 * course only if they created it OR are listed in course_lecturers.
 */
export function canLecturerCreateSession(params: {
  lecturerId: string;
  courseId: string;
  courseCreatedBy?: string | null;
  assignments: LecturerAssignment[];
}): boolean {
  const { lecturerId, courseId, courseCreatedBy, assignments } = params;
  if (!lecturerId || !courseId) return false;
  if (courseCreatedBy === lecturerId) return true;
  return assignments.some(
    (a) => a.course_id === courseId && a.lecturer_id === lecturerId,
  );
}