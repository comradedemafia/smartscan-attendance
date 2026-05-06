import { describe, it, expect } from "vitest";
import {
  filterSessionsForStudent,
  computeTotals,
  type StudentReportSession,
  type StudentEnrollment,
} from "./studentReport";

// "End-to-end" style coverage of the join/leave window logic that backs
// the Student Reports page. We simulate a multi-module student that
// joined late, left early, or re-enrolled at a known boundary, and assert
// that the produced totals only reflect sessions inside the window.

const make = (
  id: string,
  course_id: string,
  date: string,
): StudentReportSession => ({ id, course_id, session_date: date, status: "completed" });

describe("Student Reports — join/leave window per module (E2E aggregate)", () => {
  it("excludes sessions before enrolled_at and after left_at across multiple modules", () => {
    const sessions: StudentReportSession[] = [
      // Module A — student joined on 2026-05-10, never left
      make("a1", "A", "2026-05-09"), // before join → excluded
      make("a2", "A", "2026-05-10"), // join day → included (boundary)
      make("a3", "A", "2026-05-20"), // included
      // Module B — student joined on 2026-04-01, left on 2026-05-15
      make("b1", "B", "2026-04-15"), // included
      make("b2", "B", "2026-05-15"), // leave day → included (boundary)
      make("b3", "B", "2026-05-16"), // after leave → excluded
      // Module C — never enrolled, must be excluded entirely
      make("c1", "C", "2026-05-01"),
    ];
    const enrollments: StudentEnrollment[] = [
      { course_id: "A", enrolled_at: "2026-05-10T08:00:00Z" },
      { course_id: "B", enrolled_at: "2026-04-01T00:00:00Z", left_at: "2026-05-15T23:59:59Z" },
    ];

    const filtered = filterSessionsForStudent(sessions, enrollments);
    expect(filtered.map((s) => s.id).sort()).toEqual(["a2", "a3", "b1", "b2"]);

    const totals = computeTotals(filtered, ["a2", "b1"], [
      { session_id: "b2", status: "approved", reason: "Hospital" },
    ]);
    // 4 in-window sessions: 2 present, 1 excused, 1 absent (a3)
    expect(totals).toEqual({ total: 4, present: 2, absent: 1, excused: 1 });
  });

  it("leave-date boundary is inclusive: a session ON the leave day is counted", () => {
    const sessions = [
      make("x", "A", "2026-05-31"), // ON leave day
      make("y", "A", "2026-06-01"), // day after — excluded
    ];
    const enr: StudentEnrollment[] = [
      { course_id: "A", enrolled_at: "2026-04-01T00:00:00Z", left_at: "2026-05-31T12:00:00Z" },
    ];
    const filtered = filterSessionsForStudent(sessions, enr);
    expect(filtered.map((s) => s.id)).toEqual(["x"]);
    const totals = computeTotals(filtered, [], []);
    expect(totals).toEqual({ total: 1, present: 0, absent: 1, excused: 0 });
  });

  it("a student who left before any session of a module gets zero totals for it", () => {
    const sessions = [
      make("s1", "A", "2026-05-10"),
      make("s2", "A", "2026-05-17"),
    ];
    const enr: StudentEnrollment[] = [
      { course_id: "A", enrolled_at: "2026-04-01T00:00:00Z", left_at: "2026-05-01T00:00:00Z" },
    ];
    const filtered = filterSessionsForStudent(sessions, enr);
    expect(filtered).toEqual([]);
    expect(computeTotals(filtered, [], [])).toEqual({ total: 0, present: 0, absent: 0, excused: 0 });
  });

  it("date filters compose with the join/leave window (intersection wins)", () => {
    const sessions = [
      make("s1", "A", "2026-05-05"),
      make("s2", "A", "2026-05-12"),
      make("s3", "A", "2026-05-20"),
      make("s4", "A", "2026-05-28"),
    ];
    const enr: StudentEnrollment[] = [
      { course_id: "A", enrolled_at: "2026-05-10T00:00:00Z", left_at: "2026-05-25T00:00:00Z" },
    ];
    const filtered = filterSessionsForStudent(sessions, enr, {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    // s1 excluded (before join), s4 excluded (after leave)
    expect(filtered.map((s) => s.id)).toEqual(["s2", "s3"]);
  });
});